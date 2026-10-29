import { execFileSync } from "node:child_process";
import { TEST_MIGRATION_URL } from "./env";

// Applica le migrazioni al database di test (compose.dev.yaml, servizio db-test su 127.0.0.1:5433).
export default function setup(): void {
  execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: TEST_MIGRATION_URL, DATABASE_URL: TEST_MIGRATION_URL },
    stdio: "pipe",
  });
}
