-- Colore della sede scelto dall'admin, unico tra tutte le sedi (anche archiviate).
CREATE TYPE "LocationColor" AS ENUM ('ROSSO', 'ARANCIO', 'GIALLO', 'VERDE', 'TURCHESE', 'AZZURRO', 'BLU', 'VIOLA', 'ROSA', 'MARRONE');

ALTER TABLE "Location" ADD COLUMN "color" "LocationColor";

-- Sedi già esistenti: colori diversi in ordine di creazione (modificabili poi dall'admin).
UPDATE "Location" AS l
SET "color" = (ARRAY['ROSSO', 'ARANCIO', 'GIALLO', 'VERDE', 'TURCHESE', 'AZZURRO', 'BLU', 'VIOLA', 'ROSA', 'MARRONE']::"LocationColor"[])[ordered.position]
FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS position FROM "Location") AS ordered
WHERE l.id = ordered.id;

ALTER TABLE "Location" ALTER COLUMN "color" SET NOT NULL;

CREATE UNIQUE INDEX "Location_color_key" ON "Location"("color");
