import { Hono } from "hono";
import { addCopySchema, bookDataSchema, copyDetailsSchema, moveCopySchema, newBookSchema, ratingSchema } from "../../shared/schemas";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { readBody, requester, validate } from "../http";
import { downloadCover, isAllowedCoverUrl, upgradeToHttps } from "../covers/download";
import { detectImageType, MAX_COVER_BYTES } from "../covers/images";
import { removeCover, storeCover } from "../covers/storage";
import { can } from "../../shared/policy";
import { DomainError, forbidden } from "../errors";
import { addCopy, assertCanCreateIn, createBookWithCopy, deleteCopy, moveCopy, setBookCover, updateBook, updateCopy } from "./mutations";
import { getBookDetail, listBooks } from "./queries";
import { setCurrentReading, setRating, setReading } from "./readings";

function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") throw new DomainError("VALIDATION", "Dati del libro mancanti.");
  try {
    return JSON.parse(value);
  } catch {
    throw new DomainError("VALIDATION", "Dati del libro non validi.");
  }
}

async function readCoverFile(file: File): Promise<{ bytes: Uint8Array; type: NonNullable<ReturnType<typeof detectImageType>> } | null> {
  if (file.size === 0 || file.size > MAX_COVER_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  return type ? { bytes, type } : null;
}

export const bookRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const page = Number(c.req.query("page") ?? 0);
    return c.json(
      await listBooks(createDb(c.env.DB), {
        query: c.req.query("q")?.slice(0, 200),
        locationId: c.req.query("location") || undefined,
        page: Number.isFinite(page) ? page : 0,
      }),
    );
  })
  .post("/", async (c) => {
    const db = createDb(c.env.DB);
    const who = requester(c);
    // JSON, oppure multipart con "data" (JSON) e "cover" (foto della copertina scattata dal telefono).
    const isMultipart = (c.req.header("Content-Type") ?? "").startsWith("multipart/form-data");
    const form = isMultipart ? await c.req.formData() : null;
    const input = form ? validate(newBookSchema, parseJsonField(form.get("data"))) : await readBody(c, newBookSchema);
    await assertCanCreateIn(db, who, input.locationId);

    let coverKey: string | null = null;
    const photo = form?.get("cover");
    if (photo instanceof File) {
      const image = await readCoverFile(photo);
      if (!image) return c.json({ error: "Il file non è un'immagine JPEG, PNG, WebP o GIF (massimo 2 MB)." }, 415);
      coverKey = await storeCover(c.env.COVERS, image);
    } else if (input.coverUrl && isAllowedCoverUrl(upgradeToHttps(input.coverUrl))) {
      // Copertina dalla ricerca ISBN: solo da host consentiti; se manca o non va, il libro si crea lo stesso.
      const image = await downloadCover(input.coverUrl);
      if (image) coverKey = await storeCover(c.env.COVERS, image);
    }
    try {
      return c.json(await createBookWithCopy(db, who, input, coverKey), 201);
    } catch (error) {
      await removeCover(c.env.COVERS, coverKey);
      throw error;
    }
  })
  .put("/:id/cover", async (c) => {
    // Permesso prima di leggere o salvare qualunque byte (la copertina è un dato bibliografico: solo admin).
    if (!can(requester(c).actor, { type: "book.update" })) throw forbidden();
    const declared = Number(c.req.header("Content-Length") ?? "0");
    if (declared > MAX_COVER_BYTES) throw new DomainError("VALIDATION", "La foto è troppo grande (massimo 2 MB).");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) throw new DomainError("VALIDATION", "La foto è vuota o troppo grande (massimo 2 MB).");
    const type = detectImageType(bytes);
    if (!type) return c.json({ error: "Il file non è un'immagine JPEG, PNG, WebP o GIF." }, 415);
    const db = createDb(c.env.DB);
    const who = requester(c);
    const key = await storeCover(c.env.COVERS, { bytes, type });
    try {
      const previous = await setBookCover(db, who, c.req.param("id"), key);
      c.executionCtx.waitUntil(removeCover(c.env.COVERS, previous));
    } catch (error) {
      await removeCover(c.env.COVERS, key);
      throw error;
    }
    return c.body(null, 204);
  })
  .get("/:id", async (c) => c.json(await getBookDetail(createDb(c.env.DB), c.req.param("id"))))
  .patch("/:id", async (c) => {
    await updateBook(createDb(c.env.DB), requester(c), c.req.param("id"), await readBody(c, bookDataSchema));
    return c.body(null, 204);
  })
  .post("/:id/copies", async (c) => c.json(await addCopy(createDb(c.env.DB), requester(c), c.req.param("id"), await readBody(c, addCopySchema)), 201))
  .put("/:id/readings/:userId", async (c) => {
    await setReading(createDb(c.env.DB), requester(c), c.req.param("id"), c.req.param("userId"), true);
    return c.body(null, 204);
  })
  .delete("/:id/readings/:userId", async (c) => {
    await setReading(createDb(c.env.DB), requester(c), c.req.param("id"), c.req.param("userId"), false);
    return c.body(null, 204);
  })
  .put("/:id/current-readers/:userId", async (c) => {
    await setCurrentReading(createDb(c.env.DB), requester(c), c.req.param("id"), c.req.param("userId"), true);
    return c.body(null, 204);
  })
  .delete("/:id/current-readers/:userId", async (c) => {
    await setCurrentReading(createDb(c.env.DB), requester(c), c.req.param("id"), c.req.param("userId"), false);
    return c.body(null, 204);
  })
  .put("/:id/readings/:userId/rating", async (c) => {
    const { rating } = await readBody(c, ratingSchema);
    await setRating(createDb(c.env.DB), requester(c), c.req.param("id"), c.req.param("userId"), rating);
    return c.body(null, 204);
  });

export const copyRoutes = new Hono<AppEnv>()
  .patch("/:id", async (c) => {
    await updateCopy(createDb(c.env.DB), requester(c), c.req.param("id"), await readBody(c, copyDetailsSchema));
    return c.body(null, 204);
  })
  .delete("/:id", async (c) => {
    const result = await deleteCopy(createDb(c.env.DB), requester(c), c.req.param("id"));
    // Copertina del libro eliminato: pulizia dopo la scrittura, un errore qui non annulla nulla.
    if (result.coverKey) c.executionCtx.waitUntil(removeCover(c.env.COVERS, result.coverKey));
    return c.json({ bookId: result.bookId, bookDeleted: result.bookDeleted });
  })
  .post("/:id/move", async (c) => {
    await moveCopy(createDb(c.env.DB), requester(c), c.req.param("id"), (await readBody(c, moveCopySchema)).toLocationId);
    return c.body(null, 204);
  });
