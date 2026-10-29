import { z } from "zod";
import { normalizeIsbn } from "./isbn";

// Schemi di validazione condivisi (form, Server Actions, import CSV). Messaggi in italiano.

const CURRENT_YEAR = new Date().getFullYear();
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

export const copyDetailsSchema = z.object({
  shelf: optionalText(120),
  notes: optionalText(1000),
});

export const bookDataSchema = z.object({
  isbn13: optionalIsbnSchema,
  title: z.string().trim().min(1, "Il titolo è obbligatorio").max(300, "Massimo 300 caratteri"),
  authors: z
    .array(z.string().trim().min(1).max(200))
    .max(20, "Massimo 20 autori")
    .default([]),
  publishedYear: z.coerce
    .number()
    .int("Anno non valido")
    .min(1400, "Anno non valido")
    .max(CURRENT_YEAR + 1, "Anno non valido")
    .nullable()
    .optional()
    .transform((value) => value ?? null),
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
