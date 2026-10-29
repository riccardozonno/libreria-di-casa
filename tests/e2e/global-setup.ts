import { execFileSync } from "node:child_process";
import { hash } from "@node-rs/argon2";
import pg from "pg";
import { TEST_MIGRATION_URL } from "../integration/env";
import { E2E_PASSWORD, E2E_USERS, SEED } from "./seed-data";

// Database di test pulito + dati noti per gli scenari E2E. Usa SQL diretto: niente moduli server-only.
export default async function globalSetup(): Promise<void> {
  execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: TEST_MIGRATION_URL },
    stdio: "pipe",
  });

  const client = new pg.Client({ connectionString: TEST_MIGRATION_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    await client.query(`TRUNCATE ${rows.map((row) => `"${row.tablename}"`).join(", ")} CASCADE`);

    const passwordHash = await hash(E2E_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    for (const location of [SEED.casa, SEED.mare]) {
      await client.query(`INSERT INTO "Location" (id, name, "nameKey", "updatedAt") VALUES ($1, $2, $3, now())`, [
        location.id,
        location.name,
        location.name.toLowerCase(),
      ]);
    }
    for (const user of Object.values(E2E_USERS)) {
      await client.query(`INSERT INTO "User" (id, name, email, role, "updatedAt") VALUES ($1, $2, $3, $4, now())`, [
        user.id,
        user.name,
        user.email,
        user.role,
      ]);
      await client.query(
        `INSERT INTO "Account" (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES (gen_random_uuid(), $1::text, 'credential', $1::uuid, $2, now())`,
        [user.id, passwordHash],
      );
    }
    await client.query(`INSERT INTO "LocationEditor" ("userId", "locationId") VALUES ($1, $2)`, [E2E_USERS.editor.id, SEED.casa.id]);

    // Un libro presente solo nella sede "Mare", dove l'editor non ha permessi.
    await client.query(
      `INSERT INTO "Book" (id, isbn13, title, authors, source, "searchText", "updatedAt")
       VALUES ($1, $2, $3, $4, 'MANUAL', $5, now())`,
      [SEED.book.id, SEED.book.isbn13, SEED.book.title, SEED.book.authors, `${SEED.book.title} ${SEED.book.authors.join(" ")} ${SEED.book.isbn13}`.toLowerCase()],
    );
    await client.query(`INSERT INTO "Copy" (id, "bookId", "locationId", shelf, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'Veranda', now())`, [
      SEED.book.id,
      SEED.mare.id,
    ]);
  } finally {
    await client.end();
  }
}
