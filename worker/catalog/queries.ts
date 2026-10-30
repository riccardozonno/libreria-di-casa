import { type SQL, sql } from "drizzle-orm";
import type { LocationColorKey } from "../../shared/location-colors";
import { toFtsQuery } from "../../shared/text";
import { runBatch } from "../db/batch";
import type { Db } from "../db/client";
import { notFound } from "../errors";

// Letture del catalogo: SQL scritto a mano, una query per pagina (CPU e righe lette contano).

export const PAGE_SIZE = 24;

export interface LocationTag {
  id: string;
  name: string;
  color: LocationColorKey;
}

export interface BookListItem {
  id: string;
  title: string;
  authors: string[];
  isbn13: string | null;
  publishedYear: number | null;
  coverKey: string | null;
  copyCount: number;
  locations: LocationTag[];
}

export interface BookPage {
  items: BookListItem[];
  hasMore: boolean;
}

interface ListRow {
  id: string;
  title: string;
  authors: string;
  isbn13: string | null;
  published_year: number | null;
  cover_key: string | null;
  copy_count: number;
  locations: string;
}

export async function listBooks(db: Db, options: { query?: string; locationId?: string; page?: number }): Promise<BookPage> {
  const page = Math.max(0, Math.floor(options.page ?? 0));
  const match = options.query ? toFtsQuery(options.query) : null;
  const conditions: SQL[] = [];
  if (options.locationId) conditions.push(sql`EXISTS (SELECT 1 FROM copy c WHERE c.book_id = b.id AND c.location_id = ${options.locationId})`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
  const search = match ? sql`JOIN book_fts ON book_fts.rowid = b.seq AND book_fts MATCH ${match}` : sql``;
  const order = match ? sql`ORDER BY book_fts.rank, b.title COLLATE NOCASE` : sql`ORDER BY b.title COLLATE NOCASE, b.seq`;

  const rows = await db.all<ListRow>(sql`
    SELECT b.id, b.title, b.authors, b.isbn13, b.published_year, b.cover_key,
      (SELECT count(*) FROM copy c WHERE c.book_id = b.id) AS copy_count,
      (SELECT json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color))
         FROM (SELECT DISTINCT l.id, l.name, l.color, l.name_key FROM copy c JOIN location l ON l.id = c.location_id
               WHERE c.book_id = b.id ORDER BY l.name_key) t) AS locations
    FROM book b ${search} ${where} ${order}
    LIMIT ${PAGE_SIZE + 1} OFFSET ${page * PAGE_SIZE}`);

  return {
    hasMore: rows.length > PAGE_SIZE,
    items: rows.slice(0, PAGE_SIZE).map((row) => ({
      id: row.id,
      title: row.title,
      authors: JSON.parse(row.authors) as string[],
      isbn13: row.isbn13,
      publishedYear: row.published_year,
      coverKey: row.cover_key,
      copyCount: row.copy_count,
      locations: JSON.parse(row.locations) as LocationTag[],
    })),
  };
}

export interface BookDetail {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  publishedYear: number | null;
  description: string | null;
  coverKey: string | null;
  source: string;
  createdBy: string | null;
  createdAt: string;
  copies: Array<{ id: string; shelf: string | null; notes: string | null; location: LocationTag & { archived: boolean } }>;
  readings: Array<{ userId: string; name: string }>;
  movements: Array<{ id: string; from: string; to: string; movedBy: string | null; movedAt: string }>;
}

export async function getBookDetail(db: Db, id: string): Promise<BookDetail> {
  const row = await db.get<{ id: string; isbn13: string | null; title: string; authors: string; published_year: number | null; description: string | null; cover_key: string | null; source: string; created_by: string | null; created_at: string } | undefined>(sql`
    SELECT b.id, b.isbn13, b.title, b.authors, b.published_year, b.description, b.cover_key, b.source, b.created_at,
           (SELECT u.name FROM user u WHERE u.id = b.created_by_id) AS created_by
    FROM book b WHERE b.id = ${id}`);
  if (!row) throw notFound("Libro");

  type CopyRow = { id: string; shelf: string | null; notes: string | null; location_id: string; name: string; color: LocationColorKey; archived_at: string | null };
  type ReadingRow = { user_id: string; name: string };
  type MovementRow = { id: string; from_name: string; to_name: string; moved_by: string | null; moved_at: string };
  // Tre letture in un solo viaggio verso D1.
  const [copyResult, readingResult, movementResult] = await runBatch(db, [
    sql`SELECT c.id, c.shelf, c.notes, l.id AS location_id, l.name, l.color, l.archived_at
        FROM copy c JOIN location l ON l.id = c.location_id WHERE c.book_id = ${id} ORDER BY c.rowid`,
    sql`SELECT r.user_id, u.name FROM book_reading r JOIN user u ON u.id = r.user_id WHERE r.book_id = ${id} ORDER BY u.name`,
    sql`SELECT m.id, f.name AS from_name, t.name AS to_name, u.name AS moved_by, m.moved_at
        FROM copy_movement m JOIN location f ON f.id = m.from_location_id JOIN location t ON t.id = m.to_location_id
        LEFT JOIN user u ON u.id = m.moved_by_id WHERE m.book_id = ${id} ORDER BY m.moved_at DESC`,
  ]);
  const copies = (copyResult?.results ?? []) as CopyRow[];
  const readings = (readingResult?.results ?? []) as ReadingRow[];
  const movements = (movementResult?.results ?? []) as MovementRow[];

  return {
    id: row.id,
    isbn13: row.isbn13,
    title: row.title,
    authors: JSON.parse(row.authors) as string[],
    publishedYear: row.published_year,
    description: row.description,
    coverKey: row.cover_key,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
    copies: copies.map((copy) => ({
      id: copy.id,
      shelf: copy.shelf,
      notes: copy.notes,
      location: { id: copy.location_id, name: copy.name, color: copy.color, archived: copy.archived_at !== null },
    })),
    readings: readings.map((reading) => ({ userId: reading.user_id, name: reading.name })),
    movements: movements.map((movement) => ({ id: movement.id, from: movement.from_name, to: movement.to_name, movedBy: movement.moved_by, movedAt: movement.moved_at })),
  };
}
