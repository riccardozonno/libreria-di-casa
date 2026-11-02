import { Hono } from "hono";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { getReadingStats } from "./service";

// Statistiche di lettura: le vede chiunque sia collegato (scelta del PRD), come il catalogo.
export const statsRoutes = new Hono<AppEnv>().get("/", async (c) => c.json(await getReadingStats(createDb(c.env.DB))));
