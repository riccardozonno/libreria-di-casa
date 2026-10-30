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
