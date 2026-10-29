import "server-only";
import { buildSearchText } from "@/lib/text";
import type { CurrentUser } from "../actor";
import { writeAudit } from "../audit";
import { prisma, type Tx } from "../db";
import { forbidden } from "../errors";
import { can } from "../policy";
import { parseCsv, toCsv } from "./format";
import { planImport, type DuplicateMode, type ImportContext, type ImportPlan } from "./plan";

// Import/export CSV (solo admin). L'import scrive solo se il file non ha errori, tutto in una transazione.

const IMPORT_TIMEOUT_MS = 120_000;

export async function exportCsv(actor: CurrentUser, locationId: string | null): Promise<string> {
  if (!can(actor, { type: "csv.export" })) throw forbidden();
  const copies = await prisma.copy.findMany({
    where: locationId ? { locationId } : {},
    orderBy: [{ book: { title: "asc" } }, { createdAt: "asc" }],
    select: {
      shelf: true,
      notes: true,
      location: { select: { name: true } },
      book: { select: { isbn13: true, title: true, authors: true, publishedYear: true, description: true } },
    },
  });
  const csv = toCsv(
    copies.map((copy) => ({
      ...copy.book,
      location: copy.location.name,
      shelf: copy.shelf,
      notes: copy.notes,
    })),
  );
  await prisma.$transaction((tx) =>
    writeAudit(tx, actor, { action: "csv.export", entityType: "export", data: { locationId, rows: copies.length } }),
  );
  return csv;
}

async function loadContext(tx: Tx): Promise<ImportContext> {
  const [locations, books] = await Promise.all([
    tx.location.findMany({ select: { id: true, name: true, nameKey: true, archivedAt: true } }),
    tx.book.findMany({ where: { isbn13: { not: null } }, select: { id: true, isbn13: true } }),
  ]);
  return {
    locations: new Map(locations.map((location) => [location.nameKey, { id: location.id, name: location.name, archived: location.archivedAt !== null }])),
    existingBooks: new Map(books.flatMap((book) => (book.isbn13 ? [[book.isbn13, book.id] as const] : []))),
  };
}

function planFromText(text: string, context: ImportContext, mode: DuplicateMode): ImportPlan {
  const parsed = parseCsv(text);
  if (parsed.errors.length > 0) {
    return { operations: [], skipped: [], errors: parsed.errors, summary: { rows: 0, newBooks: 0, newCopies: 0, skipped: 0, errors: parsed.errors.length } };
  }
  return planImport(parsed.rows, context, mode);
}

/** Prova senza scrittura: stesso controllo dell'import vero. */
export async function previewImport(actor: CurrentUser, text: string, mode: DuplicateMode): Promise<ImportPlan> {
  if (!can(actor, { type: "csv.import" })) throw forbidden();
  return planFromText(text, await loadContext(prisma), mode);
}

export async function applyImport(actor: CurrentUser, text: string, mode: DuplicateMode): Promise<ImportPlan> {
  if (!can(actor, { type: "csv.import" })) throw forbidden();
  return prisma.$transaction(
    async (tx) => {
      // Piano ricalcolato dentro la transazione: tiene conto di modifiche fatte dopo l'anteprima.
      const plan = planFromText(text, await loadContext(tx), mode);
      if (plan.errors.length > 0) return plan;

      const createdBooks = new Map<string, string>();
      for (const operation of plan.operations) {
        if (operation.kind === "new-book") {
          const book = await tx.book.create({
            data: {
              ...operation.book,
              source: "CSV",
              searchText: buildSearchText(operation.book),
              createdById: actor.id,
              copies: { create: { locationId: operation.locationId, ...operation.copy, createdById: actor.id } },
            },
            select: { id: true },
          });
          if (operation.book.isbn13) createdBooks.set(operation.book.isbn13, book.id);
          continue;
        }
        const bookId = operation.existingBookId ?? createdBooks.get(operation.isbn13);
        if (!bookId) throw new Error(`Libro ${operation.isbn13} non risolto alla riga ${operation.line}`);
        await tx.copy.create({ data: { bookId, locationId: operation.locationId, ...operation.copy, createdById: actor.id } });
      }

      await writeAudit(tx, actor, { action: "csv.import", entityType: "import", data: { mode, ...plan.summary } });
      return plan;
    },
    { timeout: IMPORT_TIMEOUT_MS },
  );
}
