import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

// Ogni file di test parte da un D1 con le migrazioni vere applicate; prima di ogni test si svuotano
// le tabelle (in ordine di dipendenza). Il registro attività no: è in sola aggiunta per costruzione.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

const TABLES_TO_RESET = ["book_reading", "copy_movement", "copy", "book", "location_editor", "location", "user", "isbn_cache"];

beforeEach(async () => {
  await env.DB.batch(TABLES_TO_RESET.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
});
