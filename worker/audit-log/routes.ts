import { Hono } from "hono";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { requester } from "../http";
import { listAuditEntries, parseAuditQuery } from "./service";

export const auditRoutes = new Hono<AppEnv>().get("/", async (c) => c.json(await listAuditEntries(createDb(c.env.DB), requester(c), parseAuditQuery(c.req.query()))));
