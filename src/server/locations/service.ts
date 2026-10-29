import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { locationNameSchema } from "@/lib/schemas";
import { locationNameKey } from "@/lib/text";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { DomainError, forbidden, notFound } from "../errors";
import { can, type LocationRef } from "../policy";
import type { CurrentUser } from "../actor";

export interface LocationSummary {
  id: string;
  name: string;
  archived: boolean;
  copyCount: number;
}

export function toLocationRef(location: { id: string; archivedAt: Date | null }): LocationRef {
  return { id: location.id, archived: location.archivedAt !== null };
}

export async function listLocations(): Promise<LocationSummary[]> {
  const locations = await prisma.location.findMany({
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    select: { id: true, name: true, archivedAt: true, _count: { select: { copies: true } } },
  });
  return locations.map((location) => ({
    id: location.id,
    name: location.name,
    archived: location.archivedAt !== null,
    copyCount: location._count.copies,
  }));
}

export async function listLocationRefs(): Promise<LocationRef[]> {
  const locations = await prisma.location.findMany({ select: { id: true, archivedAt: true } });
  return locations.map(toLocationRef);
}

function duplicateNameError(): DomainError {
  return new DomainError("CONFLICT", "Esiste già una sede con questo nome.");
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createLocation(actor: CurrentUser, rawName: string): Promise<{ id: string }> {
  if (!can(actor, { type: "location.manage" })) throw forbidden();
  const name = locationNameSchema.parse(rawName);
  try {
    return await prisma.$transaction(async (tx) => {
      const location = await tx.location.create({ data: { name, nameKey: locationNameKey(name) }, select: { id: true } });
      await writeAudit(tx, actor, { action: "location.create", entityType: "location", entityId: location.id, data: { name } });
      return location;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateNameError();
    throw error;
  }
}

export async function renameLocation(actor: CurrentUser, locationId: string, rawName: string): Promise<void> {
  if (!can(actor, { type: "location.manage" })) throw forbidden();
  const name = locationNameSchema.parse(rawName);
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.location.findUnique({ where: { id: locationId }, select: { name: true } });
      if (!before) throw notFound("Sede");
      await tx.location.update({ where: { id: locationId }, data: { name, nameKey: locationNameKey(name) } });
      await writeAudit(tx, actor, {
        action: "location.rename",
        entityType: "location",
        entityId: locationId,
        data: { before: before.name, after: name },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateNameError();
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
