import "dotenv/config";
import { defineConfig } from "prisma/config";

// Le migrazioni usano MIGRATION_DATABASE_URL (ruolo proprietario dello schema) se presente,
// altrimenti DATABASE_URL. Vedi ADR-0005 (ruoli DB) e ADR-0012 (migrazioni).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["MIGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
