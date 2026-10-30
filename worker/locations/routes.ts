import { Hono } from "hono";
import { locationInputSchema } from "../../shared/schemas";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { readBody, requester } from "../http";
import { createLocation, listLocations, setLocationArchived, updateLocation } from "./service";

export const locationRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await listLocations(createDb(c.env.DB))))
  .post("/", async (c) => c.json(await createLocation(createDb(c.env.DB), requester(c), await readBody(c, locationInputSchema)), 201))
  .patch("/:id", async (c) => {
    await updateLocation(createDb(c.env.DB), requester(c), c.req.param("id"), await readBody(c, locationInputSchema));
    return c.body(null, 204);
  })
  .post("/:id/archive", async (c) => {
    await setLocationArchived(createDb(c.env.DB), requester(c), c.req.param("id"), true);
    return c.body(null, 204);
  })
  .post("/:id/restore", async (c) => {
    await setLocationArchived(createDb(c.env.DB), requester(c), c.req.param("id"), false);
    return c.body(null, 204);
  });
