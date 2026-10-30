-- Scritta a mano (drizzle-kit non gestisce FTS5 né trigger).

-- Ricerca: FTS5 con rimozione degli accenti. Tabella con contenuto proprio (non "external content"):
-- così l'export dei soli dati di `book` basta a ricostruirla, perché la riempiono i trigger.
-- `rowid` di book_fts = `book.seq` (INTEGER PRIMARY KEY: stabile anche dopo VACUUM).
CREATE VIRTUAL TABLE `book_fts` USING fts5(
  title, authors, isbn13,
  tokenize = "unicode61 remove_diacritics 2"
);
--> statement-breakpoint
CREATE TRIGGER `book_fts_after_insert` AFTER INSERT ON `book` BEGIN
  INSERT INTO book_fts (rowid, title, authors, isbn13)
  VALUES (new.seq, new.title, (SELECT group_concat(value, ' ') FROM json_each(new.authors)), new.isbn13);
END;
--> statement-breakpoint
CREATE TRIGGER `book_fts_after_update` AFTER UPDATE OF title, authors, isbn13 ON `book` BEGIN
  DELETE FROM book_fts WHERE rowid = old.seq;
  INSERT INTO book_fts (rowid, title, authors, isbn13)
  VALUES (new.seq, new.title, (SELECT group_concat(value, ' ') FROM json_each(new.authors)), new.isbn13);
END;
--> statement-breakpoint
CREATE TRIGGER `book_fts_after_delete` AFTER DELETE ON `book` BEGIN
  DELETE FROM book_fts WHERE rowid = old.seq;
END;
--> statement-breakpoint
-- Registro attività in sola aggiunta.
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log` BEGIN
  SELECT RAISE(ABORT, 'audit_log è in sola aggiunta');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log` BEGIN
  SELECT RAISE(ABORT, 'audit_log è in sola aggiunta');
END;
