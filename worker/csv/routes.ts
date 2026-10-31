import { Hono } from "hono";
import { existingIsbnsSchema, importChunkSchema } from "../../shared/csv/transport";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { readBody, requester } from "../http";
import { exportPage, findExistingIsbns, importChunk } from "./service";

export const csvRoutes = new Hono<AppEnv>()
  .get("/export", async (c) => {
    const after = Number(c.req.query("after") ?? 0);
    return c.json(await exportPage(createDb(c.env.DB), requester(c), { locationId: c.req.query("location") || undefined, after: Number.isInteger(after) && after > 0 ? after : undefined }));
  })
  .post("/existing", async (c) => c.json({ existing: await findExistingIsbns(createDb(c.env.DB), requester(c), (await readBody(c, existingIsbnsSchema)).isbns) }))
  .post("/import", async (c) => c.json(await importChunk(createDb(c.env.DB), requester(c), await readBody(c, importChunkSchema))));
