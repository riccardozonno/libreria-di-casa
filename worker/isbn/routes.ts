import { Hono } from "hono";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { requester } from "../http";
import { findIsbn } from "./service";

export const isbnRoutes = new Hono<AppEnv>().get("/:isbn", async (c) =>
  c.json(
    await findIsbn(createDb(c.env.DB), requester(c), c.req.param("isbn"), {
      fetch: (input, init) => fetch(input, init),
      apiKey: c.env.GOOGLE_BOOKS_API_KEY,
    }),
  ),
);
