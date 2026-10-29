import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { LocationColorKey } from "@/lib/location-colors";
import { locationInputSchema } from "@/lib/schemas";
import { locationNameKey } from "@/lib/text";
import { writeAudit } from "../audit";
import { prisma, type Tx } from "../db";
import { DomainError, forbidden, notFound } from "../errors";
import { can, type LocationRef } from "../policy";
import type { CurrentUser } from "../actor";

export interface LocationSummary {
  id: string;
  name: string;
  color: LocationColorKey;
  archived: boolean;
  copyCount: number;
}

export function toLocationRef(location: { id: string; archivedAt: Date | null }): LocationRef {
  return { id: location.id, archived: location.archivedAt !== null };
}

export async function listLocations(): Promise<LocationSummary[]> {
  const locations = await prisma.location.findMany({
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    select: { id: true, name: true, color: true, archivedAt: true, _count: { select: { copies: true } } },
  });
  return locations.map((location) => ({
    id: location.id,
    name: location.name,
    color: location.color,
    archived: location.archivedAt !== null,
    copyCount: location._count.copies,
  }));
}

export async function listLocationRefs(): Promise<LocationRef[]> {
  const locations = await prisma.location.findMany({ select: { id: true, archivedAt: true } });
  return locations.map(toLocationRef);
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Il colore è unico tra tutte le sedi: messaggio con il nome della sede che lo usa già. */
async function assertColorFree(tx: Tx, color: LocationColorKey, exceptId?: string): Promise<void> {
  const owner = await tx.location.findUnique({ where: { color }, select: { id: true, name: true } });
  if (owner && owner.id !== exceptId) {
    throw new DomainError("CONFLICT", `Il colore è già usato dalla sede "${owner.name}".`);
  }
}

function conflictError(): DomainError {
  return new DomainError("CONFLICT", "Esiste già una sede con questo nome o con questo colore.");
}

export async function createLocation(actor: CurrentUser, input: { name: string; color: string }): Promise<{ id: string }> {
  if (!can(actor, { type: "location.manage" })) throw forbidden();
  const { name, color } = locationInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertColorFree(tx, color);
      const location = await tx.location.create({ data: { name, nameKey: locationNameKey(name), color }, select: { id: true } });
      await writeAudit(tx, actor, { action: "location.create", entityType: "location", entityId: location.id, data: { name, color } });
      return location;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflictError();
    throw error;
  }
}

export async function updateLocation(actor: CurrentUser, locationId: string, input: { name: string; color: string }): Promise<void> {
  if (!can(actor, { type: "location.manage" })) throw forbidden();
  const { name, color } = locationInputSchema.parse(input);
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.location.findUnique({ where: { id: locationId }, select: { name: true, color: true } });
      if (!before) throw notFound("Sede");
      await assertColorFree(tx, color, locationId);
      await tx.location.update({ where: { id: locationId }, data: { name, nameKey: locationNameKey(name), color } });
      await writeAudit(tx, actor, {
        action: "location.update",
        entityType: "location",
        entityId: locationId,
        data: { before, after: { name, color } },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflictError();
    throw error;
  }
}

export async function setLocationArchived(actor: CurrentUser, locationId: string, archived: boolean): Promise<void> {
  if (!can(actor, { type: "location.manage" })) throw forbidden();
  await prisma.$transaction(async (tx) => {
    const location = await tx.location.findUnique({ where: { id: locationId }, select: { archivedAt: true } });
    if (!location) throw notFound("Sede");
    if ((location.archivedAt !== null) === archived) return;
    await tx.location.update({ where: { id: locationId }, data: { archivedAt: archived ? new Date() : null } });
    await writeAudit(tx, actor, {
      action: archived ? "location.archive" : "location.restore",
      entityType: "location",
      entityId: locationId,
    });
  });
}
