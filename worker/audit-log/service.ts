import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { can } from "../../shared/policy";
import type { Db } from "../db/client";
import { DomainError, forbidden } from "../errors";
import type { Requester } from "../http";

// Consultazione del registro attività (solo admin), dal più recente. Pagine "a cursore" sul rowid
// (ordine di inserimento = ordine cronologico): niente conteggio totale, che su D1 leggerebbe tutto.

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_CATEGORIES = ["book", "copy", "location", "user", "reading", "import", "export"] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (AAAA-MM-GG)");

export const auditQuerySchema = z.object({
  category: z.enum(AUDIT_CATEGORIES, { error: "Categoria non valida" }).optional(),
  actor: z.string().max(64).optional(),
  from: day.optional(),
  to: day.optional(),
  before: z.coerce.number().int().positive().optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

export interface AuditEntryView {
  seq: number;
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  ip: string | null;
  data: Record<string, unknown>;
}

interface AuditRow {
  seq: number;
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  ip: string | null;
  data: string;
}

export async function listAuditEntries(db: Db, who: Requester, query: AuditQuery): Promise<{ items: AuditEntryView[]; nextBefore: number | null }> {
  if (!can(who.actor, { type: "audit.view" })) throw forbidden();
  const conditions: SQL[] = [];
  if (query.category) conditions.push(sql`a.entity_type = ${query.category}`);
  if (query.actor) conditions.push(sql`a.actor_id = ${query.actor}`);
  // Le date sono giorni interi (ora italiana non necessaria: confini in UTC, sufficienti per un registro di casa).
  if (query.from) conditions.push(sql`a.created_at >= ${`${query.from}T00:00:00.000Z`}`);
  if (query.to) conditions.push(sql`a.created_at <= ${`${query.to}T23:59:59.999Z`}`);
  if (query.before) conditions.push(sql`a.rowid < ${query.before}`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const rows = await db.all<AuditRow>(sql`
    SELECT a.rowid AS seq, a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.actor_email, a.ip, a.data,
           u.name AS actor_name
    FROM audit_log a LEFT JOIN user u ON u.id = a.actor_id
    ${where}
    ORDER BY a.rowid DESC
    LIMIT ${AUDIT_PAGE_SIZE + 1}`);

  const page = rows.slice(0, AUDIT_PAGE_SIZE);
  return {
    items: page.map((row) => ({
      seq: row.seq,
      id: row.id,
      createdAt: row.created_at,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      ip: row.ip,
      data: JSON.parse(row.data) as Record<string, unknown>,
    })),
    nextBefore: rows.length > AUDIT_PAGE_SIZE ? (page.at(-1)?.seq ?? null) : null,
  };
}

export function parseAuditQuery(raw: Record<string, string>): AuditQuery {
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ""));
  const parsed = auditQuerySchema.safeParse(cleaned);
  if (parsed.success) return parsed.data;
  const fields = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]));
  throw new DomainError("VALIDATION", "Filtri non validi.", fields);
}
