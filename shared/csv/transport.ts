import { z } from "zod";
import { bookDataSchema, copyDetailsSchema, genreSchema, isbnSchema } from "../schemas";

// Cosa viaggia tra telefono e server per il CSV. I limiti tengono ogni richiesta sotto i 10 ms di CPU
// e sotto i 100 parametri per istruzione di D1.

export const EXPORT_PAGE_SIZE = 500;
export const EXISTING_MAX_ISBNS = 100;
export const IMPORT_CHUNK_SIZE = 25;

const line = z.number().int().min(1);
const locationId = z.string().trim().min(1).max(64);

export const importOperationSchema = z.discriminatedUnion("kind", [
  z.object({ line, kind: z.literal("new-book"), book: bookDataSchema, genre: genreSchema.default(null), locationId, copy: copyDetailsSchema }),
  z.object({ line, kind: z.literal("add-copy"), isbn13: isbnSchema, locationId, copy: copyDetailsSchema }),
]);

export const importChunkSchema = z.object({
  operations: z.array(importOperationSchema).min(1).max(IMPORT_CHUNK_SIZE, `Al massimo ${IMPORT_CHUNK_SIZE} righe per blocco`),
});

export const existingIsbnsSchema = z.object({ isbns: z.array(isbnSchema).max(EXISTING_MAX_ISBNS) });

export type ImportChunk = z.infer<typeof importChunkSchema>;

export interface ImportChunkResult {
  newBooks: number;
  newCopies: number;
  /** Righe "aggiungi copia" il cui libro non esiste (es. eliminato nel frattempo). */
  missing: number[];
}
