-- Scritta a mano: drizzle-kit ricreava `book_reading` per aggiungere il CHECK (copia di tutta la tabella
-- e PRAGMA foreign_keys, che D1 ignora). ADD COLUMN con il vincolo sulla colonna non tocca le righe esistenti.
ALTER TABLE `book_reading` ADD COLUMN `rating` integer CONSTRAINT `book_reading_rating_check` CHECK (`rating` IS NULL OR `rating` BETWEEN 1 AND 5);
