import "server-only";
import type { BookSource } from "@/generated/prisma/client";
import type { BookData, CopyDetails } from "@/lib/schemas";
import { buildSearchText } from "@/lib/text";
import type { CurrentUser } from "../actor";
import { writeAudit } from "../audit";
import { removeCover } from "../covers/storage";
import { prisma, type Tx } from "../db";
import { DomainError, forbidden, notFound } from "../errors";
import { isUniqueViolation, toLocationRef } from "../locations/service";
import { can } from "../policy";

// Scritture sul catalogo (ADR-0006). Ogni funzione: policy → transazione → audit.
// Aggiunte, eliminazioni e spostamenti bloccano prima la riga del libro (FOR UPDATE).

async function lockBook(tx: Tx, bookId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Book" WHERE id = ${bookId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound("Libro");
}

async function loadLocation(tx: Tx, locationId: string) {
  const location = await tx.location.findUnique({ where: { id: locationId }, select: { id: true, name: true, archivedAt: true } });
  if (!location) throw notFound("Sede");
  return location;
}

export interface NewBookInput {
  book: BookData;
  source: BookSource;
  coverPath: string | null;
  locationId: string;
  copy: CopyDetails;
}

export async function createBookWithCopy(actor: CurrentUser, input: NewBookInput): Promise<{ bookId: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const location = await loadLocation(tx, input.locationId);
      if (!can(actor, { type: "copy.create", location: toLocationRef(location) })) throw forbidden();

      const book = await tx.book.create({
        data: {
          ...input.book,
          source: input.source,
          coverPath: input.coverPath,
          searchText: buildSearchText(input.book),
          createdById: actor.id,
          copies: { create: { locationId: location.id, ...input.copy, createdById: actor.id } },
        },
        select: { id: true, copies: { select: { id: true } } },
      });
      await writeAudit(tx, actor, {
        action: "book.create",
        entityType: "book",
        entityId: book.id,
        data: { ...input.book, source: input.source, location: location.name, copyId: book.copies[0]?.id ?? null },
      });
      return { bookId: book.id };
    });
  } catch (error) {
    if (!isUniqueViolation(error) || !input.book.isbn13) throw error;
    const existing = await prisma.book.findUnique({ where: { isbn13: input.book.isbn13 }, select: { id: true } });
    throw new DomainError("CONFLICT", "Questo libro è già in catalogo: puoi aggiungerne una copia.", {
      bookId: existing?.id ?? "",
    });
  }
}

export async function addCopy(
  actor: CurrentUser,
  bookId: string,
  input: { locationId: string; copy: CopyDetails },
): Promise<{ copyId: string }> {
  return prisma.$transaction(async (tx) => {
    await lockBook(tx, bookId);
    const location = await loadLocation(tx, input.locationId);
    if (!can(actor, { type: "copy.create", location: toLocationRef(location) })) throw forbidden();

    const copy = await tx.copy.create({
      data: { bookId, locationId: location.id, ...input.copy, createdById: actor.id },
      select: { id: true },
    });
    await writeAudit(tx, actor, {
      action: "copy.create",
      entityType: "copy",
      entityId: copy.id,
      data: { bookId, location: location.name, ...input.copy },
    });
    return { copyId: copy.id };
  });
}

export async function updateCopy(actor: CurrentUser, copyId: string, details: CopyDetails): Promise<{ bookId: string }> {
  return prisma.$transaction(async (tx) => {
    const copy = await tx.copy.findUnique({
      where: { id: copyId },
      select: { bookId: true, shelf: true, notes: true, location: { select: { id: true, archivedAt: true } } },
    });
    if (!copy) throw notFound("Copia");
    if (!can(actor, { type: "copy.update", location: toLocationRef(copy.location) })) throw forbidden();

    await tx.copy.update({ where: { id: copyId }, data: details });
    await writeAudit(tx, actor, {
      action: "copy.update",
      entityType: "copy",
      entityId: copyId,
      data: { before: { shelf: copy.shelf, notes: copy.notes }, after: details },
    });
    return { bookId: copy.bookId };
  });
}

export interface DeleteCopyResult {
  bookId: string;
  bookDeleted: boolean;
}

export async function deleteCopy(actor: CurrentUser, copyId: string): Promise<DeleteCopyResult> {
  const bookIdRow = await prisma.copy.findUnique({ where: { id: copyId }, select: { bookId: true } });
  if (!bookIdRow) throw notFound("Copia");

  const result = await prisma.$transaction(async (tx) => {
    await lockBook(tx, bookIdRow.bookId);
    const copy = await tx.copy.findUnique({
      where: { id: copyId },
      select: { bookId: true, location: { select: { id: true, name: true, archivedAt: true } } },
    });
    if (!copy) throw notFound("Copia");
    const copies = await tx.copy.count({ where: { bookId: copy.bookId } });
    const isLastCopy = copies <= 1;
    if (!can(actor, { type: "copy.delete", location: toLocationRef(copy.location), isLastCopy })) throw forbidden();

    if (!isLastCopy) {
      await tx.copy.delete({ where: { id: copyId } });
      await writeAudit(tx, actor, { action: "copy.delete", entityType: "copy", entityId: copyId, data: { bookId: copy.bookId, location: copy.location.name } });
      return { bookId: copy.bookId, bookDeleted: false, coverPath: null };
    }

    // Ultima copia: si elimina il libro, con un'istantanea completa nel registro (solo admin).
    const snapshot = await tx.book.findUniqueOrThrow({
      where: { id: copy.bookId },
      include: { copies: true, readings: true, movements: true },
    });
    await tx.book.delete({ where: { id: copy.bookId } });
    await writeAudit(tx, actor, {
      action: "book.delete",
      entityType: "book",
      entityId: copy.bookId,
      data: JSON.parse(JSON.stringify(snapshot)),
    });
    return { bookId: copy.bookId, bookDeleted: true, coverPath: snapshot.coverPath };
  });

  if (result.coverPath) await removeCover(result.coverPath);
  return { bookId: result.bookId, bookDeleted: result.bookDeleted };
}

export async function moveCopy(actor: CurrentUser, copyId: string, toLocationId: string): Promise<{ bookId: string }> {
  const bookIdRow = await prisma.copy.findUnique({ where: { id: copyId }, select: { bookId: true } });
  if (!bookIdRow) throw notFound("Copia");

  return prisma.$transaction(async (tx) => {
    await lockBook(tx, bookIdRow.bookId);
    const copy = await tx.copy.findUnique({
      where: { id: copyId },
      select: { bookId: true, createdById: true, location: { select: { id: true, name: true, archivedAt: true } } },
    });
    if (!copy) throw notFound("Copia");
    const target = await loadLocation(tx, toLocationId);
    const allowed = can(actor, {
      type: "copy.move",
      from: toLocationRef(copy.location),
      to: toLocationRef(target),
      isCopyCreator: copy.createdById === actor.id,
    });
    if (!allowed) throw forbidden();

    await tx.copy.update({ where: { id: copyId }, data: { locationId: target.id } });
    await tx.copyMovement.create({
      data: { bookId: copy.bookId, copyId, fromLocationId: copy.location.id, toLocationId: target.id, movedById: actor.id },
    });
    await writeAudit(tx, actor, {
      action: "copy.move",
      entityType: "copy",
      entityId: copyId,
      data: { bookId: copy.bookId, from: copy.location.name, to: target.name },
    });
    return { bookId: copy.bookId };
  });
}
