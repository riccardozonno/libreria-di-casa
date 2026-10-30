import { and, eq, ne, sql } from "drizzle-orm";
import type { LocationColorKey } from "../../shared/location-colors";
import { can, type LocationRef } from "../../shared/policy";
import type { LocationInput } from "../../shared/schemas";
import { locationNameKey } from "../../shared/text";
import { auditInsert } from "../audit";
import { runBatch } from "../db/batch";
import type { Db } from "../db/client";
import { location } from "../db/schema";
import { conflict, forbidden, isUniqueViolation, notFound } from "../errors";
import type { Requester } from "../http";

export interface LocationSummary {
  id: string;
  name: string;
  color: LocationColorKey;
  archived: boolean;
  copyCount: number;
}

export function toLocationRef(row: { id: string; archivedAt: string | null }): LocationRef {
  return { id: row.id, archived: row.archivedAt !== null };
}

export async function listLocations(db: Db): Promise<LocationSummary[]> {
  const rows = await db.all<{ id: string; name: string; color: LocationColorKey; archived_at: string | null; copy_count: number }>(sql`
    SELECT l.id, l.name, l.color, l.archived_at, (SELECT count(*) FROM copy c WHERE c.location_id = l.id) AS copy_count
    FROM location l
    ORDER BY l.archived_at IS NOT NULL, l.name_key`);
  return rows.map((row) => ({ id: row.id, name: row.name, color: row.color, archived: row.archived_at !== null, copyCount: row.copy_count }));
}

export async function findLocationRef(db: Db, id: string): Promise<LocationRef | null> {
  const row = await db.select({ id: location.id, archivedAt: location.archivedAt }).from(location).where(eq(location.id, id)).get();
  return row ? toLocationRef(row) : null;
}

/** Il colore è unico tra tutte le sedi: il messaggio dice chi lo usa già. */
async function assertColorFree(db: Db, color: LocationColorKey, exceptId?: string): Promise<void> {
  const condition = exceptId ? and(eq(location.color, color), ne(location.id, exceptId)) : eq(location.color, color);
  const owner = await db.select({ name: location.name }).from(location).where(condition).get();
  if (owner) throw conflict(`Il colore è già usato dalla sede "${owner.name}".`);
}

const duplicate = () => conflict("Esiste già una sede con questo nome o con questo colore.");

export async function createLocation(db: Db, who: Requester, input: LocationInput): Promise<{ id: string }> {
  if (!can(who.actor, { type: "location.manage" })) throw forbidden();
  await assertColorFree(db, input.color);
  const id = crypto.randomUUID();
  try {
    await runBatch(db, [
      db.insert(location).values({ id, name: input.name, nameKey: locationNameKey(input.name), color: input.color }),
      auditInsert(db, who.audit, { action: "location.create", entityType: "location", entityId: id, data: input, ip: who.audit.ip }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicate();
    throw error;
  }
  return { id };
}

export async function updateLocation(db: Db, who: Requester, id: string, input: LocationInput): Promise<void> {
  if (!can(who.actor, { type: "location.manage" })) throw forbidden();
  const before = await db.select({ name: location.name, color: location.color }).from(location).where(eq(location.id, id)).get();
  if (!before) throw notFound("Sede");
  await assertColorFree(db, input.color, id);
  try {
    await runBatch(db, [
      db.update(location).set({ name: input.name, nameKey: locationNameKey(input.name), color: input.color }).where(eq(location.id, id)),
      auditInsert(db, who.audit, { action: "location.update", entityType: "location", entityId: id, data: { before, after: input }, ip: who.audit.ip }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicate();
    throw error;
  }
}

export async function setLocationArchived(db: Db, who: Requester, id: string, archived: boolean): Promise<void> {
  if (!can(who.actor, { type: "location.manage" })) throw forbidden();
  const current = await findLocationRef(db, id);
  if (!current) throw notFound("Sede");
  if (current.archived === archived) return;
  await runBatch(db, [
    db.update(location).set({ archivedAt: archived ? new Date().toISOString() : null }).where(eq(location.id, id)),
    auditInsert(db, who.audit, { action: archived ? "location.archive" : "location.restore", entityType: "location", entityId: id, ip: who.audit.ip }),
  ]);
}
