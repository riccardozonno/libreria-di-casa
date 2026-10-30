import { type SQL, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { auditLog } from "./db/schema";

// Registro attività: ogni modifica aggiunge questa insert allo stesso `db.batch([...])` della modifica,
// così o vengono salvate entrambe o nessuna. Mai password, token o segreti in `data`.

export interface AuditActor {
  id: string;
  email: string;
}

export interface AuditEntry {
  action: string;
  entityType: "book" | "copy" | "location" | "user" | "reading" | "import" | "export";
  entityId?: string | null;
  data?: Record<string, unknown>;
  ip?: string | null;
}

export function auditInsert(db: Db, actor: AuditActor | null, entry: AuditEntry) {
  return db.insert(auditLog).values({
    actorId: actor?.id ?? null,
    actorEmail: actor?.email ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    data: entry.data ?? {},
    ip: entry.ip ?? null,
  });
}

/**
 * Riga di registro scritta solo se `condition` è vera. Va messa nel batch PRIMA della modifica che usa
 * la stessa condizione: nella stessa transazione entrambe vedono lo stesso stato, quindi registro e
 * modifica avvengono insieme o per niente (D1 non ha lock di riga; `changes()` non è affidabile qui).
 */
export function auditWhen(condition: SQL, actor: AuditActor | null, entry: AuditEntry) {
  return sql`
    INSERT INTO audit_log (id, actor_id, actor_email, action, entity_type, entity_id, data, ip)
    SELECT ${crypto.randomUUID()}, ${actor?.id ?? null}, ${actor?.email ?? null}, ${entry.action}, ${entry.entityType},
           ${entry.entityId ?? null}, ${JSON.stringify(entry.data ?? {})}, ${entry.ip ?? null}
    WHERE ${condition}`;
}
