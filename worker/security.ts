import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./env";

// Difese dell'API indipendenti da Access: intestazioni e controllo dell'origine sulle scritture (CSRF).

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const apiHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
});

/** Le richieste che modificano dati devono arrivare dalla nostra stessa origine. */
export const sameOriginWrites = createMiddleware<AppEnv>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const origin = c.req.header("Origin");
  const sameOrigin = origin ? origin === new URL(c.req.url).origin : c.req.header("Sec-Fetch-Site") === "same-origin";
  if (!sameOrigin) return c.json({ error: "Richiesta da un'origine non ammessa." }, 403);
  return next();
});
