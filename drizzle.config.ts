import { defineConfig } from "drizzle-kit";

// Solo generazione delle migrazioni SQL: le applica `wrangler d1 migrations apply`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./migrations",
});
