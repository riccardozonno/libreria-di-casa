import "server-only";
import { z } from "zod";

// Variabili d'ambiente validate all'avvio: se manca qualcosa l'app non parte (fail fast).

const booleanFlag = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET deve avere almeno 32 caratteri"),
  BETTER_AUTH_URL: z.string().url(),
  REQUIRE_ADMIN_2FA: booleanFlag,
  TRUST_CLOUDFLARE_ONLY: booleanFlag,
  GOOGLE_BOOKS_API_KEY: z.string().default(""),
  COVERS_DIR: z.string().min(1).default("/data/covers"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

// In produzione (URL pubblico https) l'app deve accettare solo traffico arrivato da cloudflared:
// altrimenti rate limit e blocco degli accessi non vedrebbero l'IP reale (ADR-0009).
const productionSchema = envSchema.refine((value) => !value.BETTER_AUTH_URL.startsWith("https://") || value.TRUST_CLOUDFLARE_ONLY, {
  path: ["TRUST_CLOUDFLARE_ONLY"],
  message: "deve essere true quando BETTER_AUTH_URL è https",
});

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const parsed = productionSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Configurazione non valida: ${problems}`);
  }
  return parsed.data;
}

// `next build` valuta i moduli senza segreti (che non devono finire nell'immagine):
// solo in quella fase si usano segnaposto. A runtime la validazione resta rigida.
const BUILD_PLACEHOLDERS = {
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  BETTER_AUTH_SECRET: "build-placeholder-secret-not-used-at-runtime",
  BETTER_AUTH_URL: "http://localhost:3000",
};

function loadEnv(): Env {
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  // Le variabili vuote non devono coprire i segnaposto di build.
  const defined = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ""));
  return parseEnv(isBuild ? { ...BUILD_PLACEHOLDERS, ...defined } : process.env);
}

export const env: Env = loadEnv();
