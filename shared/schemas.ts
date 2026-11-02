import { z } from "zod";
import { GENRE_KEYS } from "./genres";
import { normalizeIsbn } from "./isbn";
import { LOCATION_COLOR_KEYS } from "./location-colors";

// Schemi di validazione condivisi (form, Server Actions, import CSV). Messaggi in italiano.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Massimo ${max} caratteri`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

export const uuidSchema = z.string().uuid("Identificativo non valido");

export const isbnSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const isbn = normalizeIsbn(value);
    if (!isbn) {
      ctx.addIssue({ code: "custom", message: "ISBN non valido" });
      return z.NEVER;
    }
    return isbn;
  });

export const optionalIsbnSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const isbn = normalizeIsbn(value);
    if (!isbn) {
      ctx.addIssue({ code: "custom", message: "ISBN non valido" });
      return z.NEVER;
    }
    return isbn;
  });

export const locationNameSchema = z
  .string()
  .trim()
  .min(1, "Inserisci un nome")
  .max(60, "Massimo 60 caratteri");

export const locationInputSchema = z.object({
  name: locationNameSchema,
  color: z.enum(LOCATION_COLOR_KEYS, { error: "Scegli un colore" }),
});

export type LocationInput = z.infer<typeof locationInputSchema>;

export const copyDetailsSchema = z.object({
  shelf: optionalText(120),
  notes: optionalText(1000),
});

const MIN_YEAR = 1400;

/**
 * Anno facoltativo: vuoto → null. Niente anni futuri (decisione del 30/10/2026: un libro che hai in casa
 * non è del futuro). Il massimo si calcola a ogni validazione: su Workers
 * la data durante il caricamento dei moduli è il 1970, quindi una costante calcolata lì sarebbe sbagliata.
 */
const publishedYearSchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce
    .number()
    .int("Anno non valido")
    .min(MIN_YEAR, "Anno non valido")
    .refine((year) => year <= new Date().getFullYear(), "L'anno non può essere nel futuro")
    .nullable(),
);

export const bookDataSchema = z.object({
  isbn13: optionalIsbnSchema,
  title: z.string().trim().min(1, "Il titolo è obbligatorio").max(300, "Massimo 300 caratteri"),
  authors: z
    .array(z.string().trim().min(1).max(200))
    .max(20, "Massimo 20 autori")
    .default([]),
  publishedYear: publishedYearSchema,
  description: optionalText(5000),
});

export type BookData = z.infer<typeof bookDataSchema>;
export type CopyDetails = z.infer<typeof copyDetailsSchema>;

/** Divide il campo autori del form ("A; B" oppure una riga per autore). */
export function parseAuthors(raw: string): string[] {
  return raw
    .split(/[;\n]/)
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
}

export const BOOK_SOURCES = ["GOOGLE_BOOKS", "OPEN_LIBRARY", "MANUAL", "CSV"] as const;
export type BookSource = (typeof BOOK_SOURCES)[number];

const idSchema = z.string().trim().min(1, "Identificativo mancante").max(64);

/** Un genere dell'elenco (shared/genres.ts) o null. Nessun CHECK nel database: si controlla qui. */
export const genreSchema = z.enum(GENRE_KEYS, { error: "Genere non valido" }).nullable();

export const bookGenreSchema = z.object({ genre: genreSchema });

/** Filtro del catalogo: un genere, oppure "NONE" per i libri ancora senza genere. */
export const genreFilterSchema = z.union([z.enum(GENRE_KEYS), z.literal("NONE")], { error: "Genere non valido" }).optional();
export type GenreFilter = z.infer<typeof genreFilterSchema>;

/** Nuovo libro con la sua prima copia (aggiunta da scanner, ricerca ISBN o a mano). */
export const newBookSchema = z.object({
  book: bookDataSchema,
  source: z.enum(BOOK_SOURCES, { error: "Origine dei dati non valida" }),
  locationId: idSchema,
  copy: copyDetailsSchema.default({ shelf: null, notes: null }),
  genre: genreSchema.default(null),
  /** Copertina trovata dalla ricerca ISBN: il server la scarica solo da host consentiti. */
  coverUrl: z.string().trim().max(2000).optional(),
});

export const addCopySchema = z.object({
  locationId: idSchema,
  copy: copyDetailsSchema.default({ shelf: null, notes: null }),
});

export const moveCopySchema = z.object({ toLocationId: idSchema });

export type NewBookInput = z.infer<typeof newBookSchema>;
export type AddCopyInput = z.infer<typeof addCopySchema>;

/** Voto di chi ha letto: da 1 a 5 stelle, `null` lo toglie. */
export const ratingSchema = z.object({
  rating: z.number({ error: "Voto non valido" }).int("Voto non valido").min(1, "Voto non valido").max(5, "Voto non valido").nullable(),
});

export type RatingInput = z.infer<typeof ratingSchema>;

export const ROLES = ["ADMIN", "EDITOR", "READER"] as const;

export const userInputSchema = z.object({
  name: z.string().trim().min(1, "Inserisci un nome").max(100, "Massimo 100 caratteri"),
  role: z.enum(ROLES, { error: "Scegli un ruolo" }),
  locationIds: z.array(idSchema).max(50).default([]),
});

export const newUserSchema = userInputSchema.extend({
  email: z.string().trim().toLowerCase().pipe(z.email("Email non valida").max(200, "Massimo 200 caratteri")),
});

export type UserInput = z.infer<typeof userInputSchema>;
export type NewUserInput = z.infer<typeof newUserSchema>;
