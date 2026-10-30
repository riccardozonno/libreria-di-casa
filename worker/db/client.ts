import { drizzle } from "drizzle-orm/d1";

// Un client per binding e per istanza: ricrearlo a ogni richiesta costava CPU (limite di 10 ms).
// Senza schema relazionale: usiamo solo il query builder, che non ne ha bisogno.

export type Db = ReturnType<typeof drizzle>;

const clients = new WeakMap<D1Database, Db>();

export function createDb(d1: D1Database): Db {
  let db = clients.get(d1);
  if (!db) {
    db = drizzle(d1);
    clients.set(d1, db);
  }
  return db;
}
