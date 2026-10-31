import { Hono } from "hono";
import { downloadCover, isAllowedCoverUrl, upgradeToHttps } from "../covers/download";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { DomainError } from "../errors";
import { requester } from "../http";
import { assertCanLookup, findIsbn } from "./service";

export const isbnRoutes = new Hono<AppEnv>()
  // Anteprima della copertina trovata: la CSP dell'app non ammette immagini esterne, quindi passa da qui,
  // con le stesse difese del salvataggio (solo host consentiti, formato verificato dai byte).
  .get("/cover", async (c) => {
    await assertCanLookup(createDb(c.env.DB), requester(c));
    const url = c.req.query("url") ?? "";
    if (!isAllowedCoverUrl(upgradeToHttps(url))) throw new DomainError("VALIDATION", "Indirizzo della copertina non consentito.");
    const image = await downloadCover(url);
    if (!image) return c.json({ error: "Copertina non disponibile." }, 404);
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  })
  .get("/:isbn", async (c) =>
    c.json(
      await findIsbn(createDb(c.env.DB), requester(c), c.req.param("isbn"), {
        fetch: (input, init) => fetch(input, init),
        apiKey: c.env.GOOGLE_BOOKS_API_KEY,
      }),
    ),
  );
