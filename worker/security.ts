import { bodyLimit } from "hono/body-limit";
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

/** Dati JSON: bastano per un blocco di import CSV (25 righe con descrizioni lunghe). */
export const MAX_JSON_BYTES = 256 * 1024;
/** Foto della copertina (2 MB) più i dati del libro in un modulo multipart. */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const unsupported = createMiddleware<AppEnv>(async (c) => c.json({ error: "Formato della richiesta non supportato." }, 415));
const jsonLimit = bodyLimit({ maxSize: MAX_JSON_BYTES, onError: (c) => c.json({ error: "Richiesta troppo grande." }, 413) });
const uploadLimit = bodyLimit({ maxSize: MAX_UPLOAD_BYTES, onError: (c) => c.json({ error: "Richiesta troppo grande." }, 413) });

/**
 * Limite alla dimensione delle richieste, prima di leggerle: leggere e analizzare un corpo enorme
 * supererebbe da solo i 10 ms di CPU. Le foto hanno un limite più alto dei dati JSON.
 */
export const requestSizeLimit = createMiddleware<AppEnv>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const type = c.req.header("Content-Type") ?? "";
  const isUpload = type.startsWith("multipart/form-data") || type.startsWith("image/") || type === "application/octet-stream" || type === "";
  if (!isUpload && !type.startsWith("application/json")) return unsupported(c, next);
  return (isUpload ? uploadLimit : jsonLimit)(c, next);
});
