import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./env";

// Limiti di frequenza per persona (binding Rate Limiting di Cloudflare, per località). Davanti c'è già
// Access e gli utenti sono pochi: questi limiti fermano un errore o un abuso, non l'uso normale.
// Scritture 60/min, ricerche ISBN 30/min (quota di Google), import CSV 600 blocchi/min.

type LimiterName = "WRITE_LIMITER" | "LOOKUP_LIMITER" | "CSV_LIMITER";

function limiterFor(method: string, path: string): LimiterName | null {
  if (path.startsWith("/api/csv/") && method !== "GET") return "CSV_LIMITER";
  if (path.startsWith("/api/isbn/")) return "LOOKUP_LIMITER";
  if (method !== "GET" && method !== "HEAD") return "WRITE_LIMITER";
  return null;
}

export const rateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const name = limiterFor(c.req.method, c.req.path);
  const limiter = name ? c.env[name] : undefined;
  if (!limiter) return next();
  const { success } = await limiter.limit({ key: c.get("user").id });
  if (!success) return c.json({ error: "Troppe richieste: aspetta un minuto e riprova." }, 429);
  return next();
});
