import { Hono } from "hono";
import type { AppEnv } from "../env";
import { COVER_KEY } from "./storage";

export const coverRoutes = new Hono<AppEnv>().get("/:key", async (c) => {
  const key = c.req.param("key");
  if (!COVER_KEY.test(key)) return c.json({ error: "Copertina non trovata." }, 404);
  const object = await c.env.COVERS.get(key);
  if (!object) return c.json({ error: "Copertina non trovata." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      // La chiave cambia a ogni nuova copertina: il contenuto di una chiave non cambia mai.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
