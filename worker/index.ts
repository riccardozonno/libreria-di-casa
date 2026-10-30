import { Hono } from "hono";
import { requireUser } from "./auth/identity";
import { createDb } from "./db/client";
import type { AppEnv } from "./env";
import { DomainError } from "./errors";
import { bookRoutes, copyRoutes } from "./catalog/routes";
import { coverRoutes } from "./covers/routes";
import { isbnRoutes } from "./isbn/routes";
import { locationRoutes } from "./locations/routes";
import { requester } from "./http";
import { apiHeaders, sameOriginWrites } from "./security";
import { userRoutes } from "./users/routes";
import { signOutEverywhere } from "./users/service";

// API JSON di HOME LIBRARY. Il Worker risponde solo a /api/*; il resto sono file statici.

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", apiHeaders, sameOriginWrites, requireUser);

app.get("/me", (c) => c.json(c.get("user")));
app.post("/me/sign-out", async (c) => {
  await signOutEverywhere(createDb(c.env.DB), requester(c), c.get("user").id);
  return c.body(null, 204);
});
app.route("/locations", locationRoutes);
app.route("/books", bookRoutes);
app.route("/copies", copyRoutes);
app.route("/isbn", isbnRoutes);
app.route("/covers", coverRoutes);
app.route("/users", userRoutes);

app.notFound((c) => c.json({ error: "Non trovato." }, 404));

app.onError((error, c) => {
  if (error instanceof DomainError) {
    return c.json({ error: error.message, ...(error.fields && { fields: error.fields }), ...error.data }, error.status);
  }
  console.error("Errore API", error);
  return c.json({ error: "Errore interno." }, 500);
});

export default app;
