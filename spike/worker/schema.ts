import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Specchio di migrations/0001_init.sql (la tabella FTS5 si interroga con SQL diretto).
export const book = sqliteTable("book", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  authors: text("authors").notNull(),
  isbn13: text("isbn13").unique(),
  createdAt: text("created_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  data: text("data"),
  at: text("at").notNull(),
});
