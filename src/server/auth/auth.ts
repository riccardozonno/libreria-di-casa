import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { env } from "../env";
import { clearFailedLogins, findLoginState, isLocked, registerFailedLogin } from "./lockout";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";

// Configurazione di Better Auth (ADR-0003). Le scelte di sicurezza sono commentate dove non ovvie.

const SECONDS_PER_DAY = 86_400;
export const ACCOUNT_LINK_TTL_SECONDS = 72 * 3_600;
const SIGN_IN_PATH = "/sign-in/email";

// Stessa risposta di Better Auth per password errata: non rivela se l'account esiste o è disattivato.
function invalidCredentials(): APIError {
  return new APIError("UNAUTHORIZED", { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
}

/** Eventi di accesso nel registro (ADR-0005): avvengono dentro Better Auth, quindi in una transazione a sé. */
async function recordAuthEvent(user: { id: string; email: string }, action: string, request: Request | undefined): Promise<void> {
  const ip = request?.headers.get("cf-connecting-ip") ?? null;
  await prisma.$transaction((tx) => writeAudit(tx, user, { action, entityType: "user", entityId: user.id, ip }));
}

// Endpoint autenticati il cui successo va registrato (utente dalla sessione).
const SESSION_EVENTS: Record<string, string> = {
  "/change-password": "auth.password_change",
  "/revoke-sessions": "auth.logout_all",
  "/two-factor/enable": "auth.2fa_setup",
  "/two-factor/disable": "auth.2fa_disable",
  "/two-factor/verify-totp": "auth.login",
};

function readEmail(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("email" in body)) return null;
  return typeof body.email === "string" ? body.email : null;
}

export const auth = betterAuth({
  appName: "HOME LIBRARY",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    password: { hash: hashPassword, verify: verifyPassword },
    resetPasswordTokenExpiresIn: ACCOUNT_LINK_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }, request) => {
      await clearFailedLogins(user.id);
      await recordAuthEvent(user, "auth.password_reset", request);
    },
  },

  // La richiesta pubblica di reset e le modifiche self-service sono disattivate:
  // i link li genera solo l'admin (invite.ts), nome/ruolo li cambia solo l'admin.
  disabledPaths: ["/sign-up/email", "/update-user", "/change-email", "/delete-user", "/request-password-reset"],

  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "READER" },
      active: { type: "boolean", input: false, defaultValue: true },
    },
  },

  session: {
    expiresIn: 30 * SECONDS_PER_DAY,
    updateAge: SECONDS_PER_DAY,
    // Spento: revoche e "esci da tutti i dispositivi" devono valere subito.
    cookieCache: { enabled: false },
  },

  verification: { storeIdentifier: "hashed" },

  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
    customRules: {
      [SIGN_IN_PATH]: { window: 60, max: 10 },
      "/reset-password": { window: 60, max: 10 },
      "/two-factor/*": { window: 60, max: 10 },
    },
  },

  advanced: {
    database: { generateId: "uuid" },
    // Esplicito: Better Auth altrimenti salta il controllo Origin quando NODE_ENV=test.
    disableOriginCheck: false,
    // L'unico ingresso è cloudflared (ADR-0009): l'IP del client è in CF-Connecting-IP.
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
  },

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { active: true } });
          return user?.active ? undefined : false;
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const email = readEmail(ctx.body);
      if (!email) return;
      const state = await findLoginState(email);
      if (!state) return;
      if (isLocked(state)) {
        throw new APIError("TOO_MANY_REQUESTS", { code: "ACCOUNT_LOCKED", message: "Troppi tentativi. Riprova più tardi." });
      }
      if (!state.active) throw invalidCredentials();
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      const succeeded = !(returned instanceof APIError);
      const sessionEvent = SESSION_EVENTS[ctx.path];
      if (sessionEvent) {
        const sessionUser = ctx.context.session?.user ?? ctx.context.newSession?.user;
        if (succeeded && sessionUser) await recordAuthEvent(sessionUser, sessionEvent, ctx.request);
        return;
      }
      if (ctx.path !== SIGN_IN_PATH) return;
      const email = readEmail(ctx.body);
      if (!email) return;
      const state = await findLoginState(email);
      if (!state) return;
      const user = { id: state.id, email: email.trim().toLowerCase() };
      if (returned instanceof APIError && returned.statusCode === 401) {
        const locked = await registerFailedLogin(state.id);
        await recordAuthEvent(user, "auth.login_failed", ctx.request);
        if (locked) await recordAuthEvent(user, "auth.lockout", ctx.request);
      } else if (succeeded) {
        await clearFailedLogins(state.id);
        // Con la 2FA attiva il login si completa su /two-factor/verify-totp.
        const needsSecondFactor = typeof returned === "object" && returned !== null && "twoFactorRedirect" in returned;
        if (!needsSecondFactor) await recordAuthEvent(user, "auth.login", ctx.request);
      }
    }),
  },

  plugins: [twoFactor({ issuer: "HOME LIBRARY" }), nextCookies()],
});

export type Auth = typeof auth;
