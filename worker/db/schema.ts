import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { LOCATION_COLOR_KEYS } from "../../shared/location-colors";

// Schema D1 (docs/data-model.md). Id UUID come testo, date ISO 8601 in UTC come testo.
// La tabella di ricerca FTS5 e i trigger del registro sono in una migrazione SQL scritta a mano.

const ROLES = ["ADMIN", "EDITOR", "READER"] as const;
const BOOK_SOURCES = ["GOOGLE_BOOKS", "OPEN_LIBRARY", "MANUAL", "CSV"] as const;

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const now = () => new Date().toISOString();
// Default anche in SQL (stesso formato di toISOString): vale per script, import e ripristini.
const NOW_SQL = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const timestamp = (name: string) => text(name).notNull().default(NOW_SQL);
const createdAt = () => timestamp("created_at");
const updatedAt = () => timestamp("updated_at").$onUpdateFn(now);
const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((value) => `'${value}'`).join(", ")})`);

export const user = sqliteTable(
  "user",
  {
    id: id(),
    email: text("email").notNull(), // sempre minuscola: è l'identità che arriva da Access
    name: text("name").notNull(),
    role: text("role", { enum: ROLES }).notNull().default("READER"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    // "Esci da tutti i dispositivi": i token di Access emessi prima di questo istante non valgono.
    sessionsNotBefore: text("sessions_not_before"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("user_email_unique").on(table.email),
    check("user_role_check", inList("role", ROLES)),
    check("user_email_lowercase", sql`${table.email} = lower(${table.email})`),
  ],
);

export const location = sqliteTable(
  "location",
  {
    id: id(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    color: text("color", { enum: LOCATION_COLOR_KEYS }).notNull(),
    archivedAt: text("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("location_name_key_unique").on(table.nameKey),
    uniqueIndex("location_color_unique").on(table.color),
    check("location_color_check", inList("color", LOCATION_COLOR_KEYS)),
  ],
);

export const locationEditor = sqliteTable(
  "location_editor",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    locationId: text("location_id").notNull().references(() => location.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.locationId] }), index("location_editor_location_idx").on(table.locationId)],
);

export const book = sqliteTable(
  "book",
  {
    // Chiave numerica stabile (alias del rowid, non cambia con VACUUM): è il rowid di `book_fts`.
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    id: text("id").notNull().$defaultFn(() => crypto.randomUUID()),
    isbn13: text("isbn13"),
    title: text("title").notNull(),
    authors: text("authors", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    publishedYear: integer("published_year"),
    description: text("description"),
    coverKey: text("cover_key"), // oggetto in R2
    source: text("source", { enum: BOOK_SOURCES }).notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("book_id_unique").on(table.id),
    uniqueIndex("book_isbn13_unique").on(table.isbn13),
    // Ordine del catalogo (titolo senza maiuscole/minuscole): con LIMIT il database legge solo la pagina.
    index("book_title_nocase_idx").on(sql`${table.title} COLLATE NOCASE`, table.seq),
    check("book_source_check", inList("source", BOOK_SOURCES)),
    check("book_isbn13_check", sql`${table.isbn13} IS NULL OR (length(${table.isbn13}) = 13 AND ${table.isbn13} NOT GLOB '*[^0-9]*')`),
    check("book_authors_json", sql`json_valid(${table.authors}) AND json_type(${table.authors}) = 'array'`),
  ],
);

export const copy = sqliteTable(
  "copy",
  {
    id: id(),
    bookId: text("book_id").notNull().references(() => book.id, { onDelete: "cascade" }),
    locationId: text("location_id").notNull().references(() => location.id, { onDelete: "restrict" }),
    shelf: text("shelf"),
    notes: text("notes"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // libro + sede: copie di un libro e filtro "libri con una copia in questa sede" con una sola ricerca.
  (table) => [index("copy_book_location_idx").on(table.bookId, table.locationId), index("copy_location_idx").on(table.locationId)],
);

export const copyMovement = sqliteTable(
  "copy_movement",
  {
    id: id(),
    bookId: text("book_id").notNull().references(() => book.id, { onDelete: "cascade" }),
    copyId: text("copy_id").references(() => copy.id, { onDelete: "set null" }),
    fromLocationId: text("from_location_id").notNull().references(() => location.id, { onDelete: "restrict" }),
    toLocationId: text("to_location_id").notNull().references(() => location.id, { onDelete: "restrict" }),
    movedById: text("moved_by_id").references(() => user.id, { onDelete: "set null" }),
    movedAt: timestamp("moved_at"),
  },
  (table) => [index("copy_movement_book_idx").on(table.bookId, table.movedAt)],
);

export const bookReading = sqliteTable(
  "book_reading",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    bookId: text("book_id").notNull().references(() => book.id, { onDelete: "cascade" }),
    markedById: text("marked_by_id").references(() => user.id, { onDelete: "set null" }),
    // Voto del lettore, 1–5 stelle; null = non votato. Se si toglie «Letto», sparisce con la riga.
    rating: integer("rating"),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.bookId] }),
    index("book_reading_book_idx").on(table.bookId),
    check("book_reading_rating_check", sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`),
  ],
);

// «Sto leggendo»: chi ha iniziato un libro e quando (la data non si mostra, decisione del 31/10/2026).
// Mai su un libro già letto dallo stesso utente; segnare «Letto» toglie la riga.
export const bookCurrentReading = sqliteTable(
  "book_current_reading",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    bookId: text("book_id").notNull().references(() => book.id, { onDelete: "cascade" }),
    markedById: text("marked_by_id").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bookId] }), index("book_current_reading_book_idx").on(table.bookId)],
);

// Registro attività: in sola aggiunta (trigger nella migrazione). Mai segreti in `data`.
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_log_created_idx").on(table.createdAt),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    index("audit_log_actor_idx").on(table.actorId, table.createdAt),
  ],
);

// Risposte di Google Books / Open Library già trovate (solo risultati positivi).
export const isbnCache = sqliteTable("isbn_cache", {
  isbn13: text("isbn13").primaryKey(),
  source: text("source", { enum: BOOK_SOURCES }).notNull(),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  fetchedAt: timestamp("fetched_at"),
});
