import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { TEST_APP_URL, TEST_MIGRATION_URL } from "./env";

// Permessi reali del ruolo applicativo dopo le migrazioni (ADR-0005, revisione database fase 4).

const owner = new pg.Pool({ connectionString: TEST_MIGRATION_URL, max: 1 });
const app = new pg.Pool({ connectionString: TEST_APP_URL, max: 1 });

afterAll(async () => {
  await owner.end();
  await app.end();
});

async function privilege(table: string, kind: string): Promise<boolean> {
  const { rows } = await owner.query<{ allowed: boolean }>("SELECT has_table_privilege('app', $1, $2) AS allowed", [`"${table}"`, kind]);
  return rows[0]!.allowed;
}

describe("ruolo applicativo", () => {
  it("non può modificare né cancellare il registro attività", async () => {
    expect(await privilege("AuditLog", "INSERT")).toBe(true);
    expect(await privilege("AuditLog", "UPDATE")).toBe(false);
    expect(await privilege("AuditLog", "DELETE")).toBe(false);
  });

  it("non può cancellare utenti (si disattivano soltanto)", async () => {
    expect(await privilege("User", "UPDATE")).toBe(true);
    expect(await privilege("User", "DELETE")).toBe(false);
  });

  it("non può toccare la tabella delle migrazioni", async () => {
    expect(await privilege("_prisma_migrations", "SELECT")).toBe(false);
    expect(await privilege("_prisma_migrations", "DELETE")).toBe(false);
  });

  it("ha limiti di tempo sulle query e sui lock", async () => {
    const client = await app.connect();
    try {
      const statement = await client.query<{ statement_timeout: string }>("SHOW statement_timeout");
      const lock = await client.query<{ lock_timeout: string }>("SHOW lock_timeout");
      expect(statement.rows[0]?.statement_timeout).toBe("30s");
      expect(lock.rows[0]?.lock_timeout).toBe("10s");
    } finally {
      client.release();
    }
  });
});
