import { Hono } from "hono";
import { addCopySchema, bookDataSchema, copyDetailsSchema, moveCopySchema, newBookSchema } from "../../shared/schemas";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { readBody, requester } from "../http";
import { addCopy, createBookWithCopy, deleteCopy, moveCopy, updateBook, updateCopy } from "./mutations";
import { getBookDetail, listBooks } from "./queries";
import { setReading } from "./readings";

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
  .post("/", async (c) => c.json(await createBookWithCopy(createDb(c.env.DB), requester(c), await readBody(c, newBookSchema)), 201))
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
  });

export const copyRoutes = new Hono<AppEnv>()
  .patch("/:id", async (c) => {
    await updateCopy(createDb(c.env.DB), requester(c), c.req.param("id"), await readBody(c, copyDetailsSchema));
    return c.body(null, 204);
  })
  .delete("/:id", async (c) => {
    const result = await deleteCopy(createDb(c.env.DB), requester(c), c.req.param("id"));
    // Copertina del libro eliminato: pulizia dopo la scrittura, un errore qui non annulla nulla.
    if (result.coverKey) {
      c.executionCtx.waitUntil(c.env.COVERS.delete(result.coverKey).catch((error: unknown) => console.error("Copertina non rimossa", result.coverKey, error)));
    }
    return c.json({ bookId: result.bookId, bookDeleted: result.bookDeleted });
  })
  .post("/:id/move", async (c) => {
    await moveCopy(createDb(c.env.DB), requester(c), c.req.param("id"), (await readBody(c, moveCopySchema)).toLocationId);
    return c.body(null, 204);
  });
