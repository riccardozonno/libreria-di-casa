import { Hono } from "hono";
import { requireUser } from "./auth/identity";
import type { AppEnv } from "./env";
import { DomainError } from "./errors";
import { locationRoutes } from "./locations/routes";
import { apiHeaders, sameOriginWrites } from "./security";

// API JSON di HOME LIBRARY. Il Worker risponde solo a /api/*; il resto sono file statici.

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", apiHeaders, sameOriginWrites, requireUser);

app.get("/me", (c) => c.json(c.get("user")));
app.route("/locations", locationRoutes);

app.notFound((c) => c.json({ error: "Non trovato." }, 404));

app.onError((error, c) => {
  if (error instanceof DomainError) return c.json({ error: error.message, ...(error.fields && { fields: error.fields }) }, error.status);
  console.error("Errore API", error);
  return c.json({ error: "Errore interno." }, 500);
});

export default app;
