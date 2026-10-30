import { Hono } from "hono";
import { newUserSchema, userInputSchema } from "../../shared/schemas";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { readBody, requester } from "../http";
import { syncAccessGroup } from "./access-sync";
import { createUser, listUsers, setUserActive, signOutEverywhere, updateUser } from "./service";

// Dopo creazione, disattivazione e riattivazione si riallinea il gruppo Access; l'esito torna
// all'interfaccia ("ok", "failed", "not-configured") così l'admin sa se deve intervenire a mano.

export const userRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await listUsers(createDb(c.env.DB), requester(c))))
  .post("/", async (c) => {
    const db = createDb(c.env.DB);
    const { userId } = await createUser(db, requester(c), await readBody(c, newUserSchema));
    return c.json({ userId, accessSync: await syncAccessGroup(db, c.env) }, 201);
  })
  .patch("/:id", async (c) => {
    await updateUser(createDb(c.env.DB), requester(c), c.req.param("id"), await readBody(c, userInputSchema));
    return c.body(null, 204);
  })
  .post("/:id/deactivate", async (c) => {
    const db = createDb(c.env.DB);
    await setUserActive(db, requester(c), c.req.param("id"), false);
    return c.json({ accessSync: await syncAccessGroup(db, c.env) });
  })
  .post("/:id/reactivate", async (c) => {
    const db = createDb(c.env.DB);
    await setUserActive(db, requester(c), c.req.param("id"), true);
    return c.json({ accessSync: await syncAccessGroup(db, c.env) });
  })
  .post("/:id/sign-out", async (c) => {
    await signOutEverywhere(createDb(c.env.DB), requester(c), c.req.param("id"));
    return c.body(null, 204);
  });
