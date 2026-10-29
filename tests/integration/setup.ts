import { afterAll, beforeEach } from "vitest";
import pg from "pg";
import { TEST_MIGRATION_URL } from "./env";

// Svuota tutte le tabelle prima di ogni test con il ruolo proprietario
// (il ruolo "app" non può cancellare il registro attività, di proposito).
const admin = new pg.Pool({ connectionString: TEST_MIGRATION_URL, max: 1 });

beforeEach(async () => {
  const { rows } = await admin.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  const tables = rows.map((row) => `"${row.tablename}"`).join(", ");
  if (tables) await admin.query(`TRUNCATE ${tables} CASCADE`);
});

afterAll(async () => {
  await admin.end();
});
