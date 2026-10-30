import type { SQL } from "drizzle-orm";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import type { Db } from "./client";

// Batch D1 (una transazione, un solo viaggio verso il database) che accetta sia query builder di
// Drizzle sia SQL scritto a mano: `db.batch` di Drizzle non gestisce i frammenti `sql`.

const dialect = new SQLiteAsyncDialect();

export type BatchItem = SQL | { toSQL(): { sql: string; params: unknown[] } };

function toStatement(d1: D1Database, item: BatchItem): D1PreparedStatement {
  const query = "toSQL" in item ? item.toSQL() : dialect.sqlToQuery(item);
  return d1.prepare(query.sql).bind(...query.params);
}

export function runBatch(db: Db, items: BatchItem[]): Promise<D1Result[]> {
  return db.$client.batch(items.map((item) => toStatement(db.$client, item)));
}

/** L'istruzione ha modificato almeno una riga? */
export const changedRows = (result: D1Result | undefined): boolean => (result?.meta.changes ?? 0) > 0;
