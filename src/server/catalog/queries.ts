import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { LocationColorKey } from "@/lib/location-colors";
import { searchTerms } from "@/lib/text";
import { prisma } from "../db";

// Letture del catalogo (consentite a ogni utente attivo: il controllo è nella pagina/azione).

export const PAGE_SIZE = 24;

export interface BookListItem {
  id: string;
  title: string;
  authors: string[];
  publishedYear: number | null;
  isbn13: string | null;
  coverPath: string | null;
  locations: { id: string; name: string; color: LocationColorKey; copies: number }[];
}

export interface BookPage {
  items: BookListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export interface SearchParams {
  query?: string;
  locationId?: string | null;
  page?: number;
}

function buildWhere({ query = "", locationId }: SearchParams): Prisma.BookWhereInput {
  // I caratteri jolly di LIKE vengono tolti: la ricerca è sempre "contiene".
  const terms = searchTerms(query).map((term) => term.replace(/[%_\\]/g, "")).filter(Boolean);
  return {
    AND: [
      ...terms.map((term) => ({ searchText: { contains: term } })),
      ...(locationId ? [{ copies: { some: { locationId } } }] : []),
    ],
  };
}

export async function searchBooks(params: SearchParams): Promise<BookPage> {
  const where = buildWhere(params);
  const total = await prisma.book.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(params.page ?? 1)), pageCount);

  const books = await prisma.book.findMany({
    where,
    orderBy: [{ title: "asc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      authors: true,
      publishedYear: true,
      isbn13: true,
      coverPath: true,
      copies: { select: { location: { select: { id: true, name: true, color: true } } } },
    },
  });

  const items = books.map((book) => {
    const byLocation = new Map<string, { id: string; name: string; color: LocationColorKey; copies: number }>();
    for (const copy of book.copies) {
      const current = byLocation.get(copy.location.id);
      byLocation.set(copy.location.id, { ...copy.location, copies: (current?.copies ?? 0) + 1 });
    }
    return {
      id: book.id,
      title: book.title,
      authors: book.authors,
      publishedYear: book.publishedYear,
      isbn13: book.isbn13,
      coverPath: book.coverPath,
      locations: [...byLocation.values()].sort((a, b) => a.name.localeCompare(b.name, "it")),
    };
  });

  return { items, total, page, pageCount };
}

export async function getBookDetail(bookId: string) {
  return prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      isbn13: true,
      title: true,
      authors: true,
      publishedYear: true,
      description: true,
      coverPath: true,
      source: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      copies: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          shelf: true,
          notes: true,
          createdAt: true,
          createdById: true,
          location: { select: { id: true, name: true, color: true, archivedAt: true } },
        },
      },
      readings: {
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, user: { select: { id: true, name: true } } },
      },
      movements: {
        orderBy: { movedAt: "desc" },
        select: {
          id: true,
          movedAt: true,
          movedBy: { select: { name: true } },
          fromLocation: { select: { name: true } },
          toLocation: { select: { name: true } },
        },
      },
    },
  });
}

export type BookDetail = NonNullable<Awaited<ReturnType<typeof getBookDetail>>>;

export async function findBookByIsbn(isbn13: string) {
  return prisma.book.findUnique({
    where: { isbn13 },
    select: { id: true, title: true, authors: true, copies: { select: { location: { select: { name: true } } } } },
  });
}
