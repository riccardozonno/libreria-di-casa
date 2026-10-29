import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./db";

// Registro attività (ADR-0005): una riga per ogni modifica, nella stessa transazione.
// Mai password, token o segreti in `data`.

export interface AuditActor {
  id: string;
  email: string;
}

export interface AuditEntry {
  action: string;
  entityType: "book" | "copy" | "location" | "user" | "reading" | "import" | "export";
  entityId?: string | null;
  data?: Prisma.InputJsonValue;
  ip?: string | null;
}

export async function writeAudit(tx: Tx, actor: AuditActor | null, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      data: entry.data ?? {},
      ip: entry.ip ?? null,
    },
  });
}
