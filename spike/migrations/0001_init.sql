-- Prova di fattibilità: solo le tabelle che servono alle misure.

CREATE TABLE book (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  isbn13 TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Ricerca: FTS5 con rimozione degli accenti ("perche" trova "perché").
CREATE VIRTUAL TABLE book_fts USING fts5(
  title, authors, isbn13,
  content = 'book', content_rowid = 'id',
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER book_ai AFTER INSERT ON book BEGIN
  INSERT INTO book_fts (rowid, title, authors, isbn13) VALUES (new.id, new.title, new.authors, new.isbn13);
END;
CREATE TRIGGER book_ad AFTER DELETE ON book BEGIN
  INSERT INTO book_fts (book_fts, rowid, title, authors, isbn13) VALUES ('delete', old.id, old.title, old.authors, old.isbn13);
END;
CREATE TRIGGER book_au AFTER UPDATE ON book BEGIN
  INSERT INTO book_fts (book_fts, rowid, title, authors, isbn13) VALUES ('delete', old.id, old.title, old.authors, old.isbn13);
  INSERT INTO book_fts (rowid, title, authors, isbn13) VALUES (new.id, new.title, new.authors, new.isbn13);
END;

-- Registro attività in sola aggiunta: i trigger rifiutano modifiche e cancellazioni.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  data TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log è in sola aggiunta');
END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log è in sola aggiunta');
END;
