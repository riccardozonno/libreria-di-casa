import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "./actor";
import { prisma } from "./db";
import { forbidden } from "./errors";
import { can } from "./policy";

// Consultazione del registro attività (solo admin), dal più recente.

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_CATEGORIES = ["book", "copy", "location", "user", "reading", "import", "export", "auth"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export interface AuditEntry {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  ip: string | null;
  data: Prisma.JsonValue;
}

function categoryFilter(category: AuditCategory | undefined): Prisma.AuditLogWhereInput {
  if (!category) return {};
  // Gli eventi di accesso hanno entityType "user" ma azione "auth.*".
  if (category === "auth") return { action: { startsWith: "auth." } };
  if (category === "user") return { entityType: "user", NOT: { action: { startsWith: "auth." } } };
  return { entityType: category };
}

export async function listAuditEntries(
  actor: CurrentUser,
  params: { page: number; category?: AuditCategory },
): Promise<{ items: AuditEntry[]; total: number; page: number; pageCount: number }> {
  if (!can(actor, { type: "audit.view" })) throw forbidden();
  const where = categoryFilter(params.category);
  const total = await prisma.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(params.page)), pageCount);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
    select: { id: true, createdAt: true, action: true, entityType: true, entityId: true, actorEmail: true, ip: true, data: true, actor: { select: { name: true } } },
  });
  return {
    items: rows.map(({ actor: author, ...row }) => ({ ...row, actorName: author?.name ?? null })),
    total,
    page,
    pageCount,
  };
}
