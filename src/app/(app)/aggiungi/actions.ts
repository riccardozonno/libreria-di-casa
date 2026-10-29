"use server";

import { redirect } from "next/navigation";
import sharp from "sharp";
import { z } from "zod";
import { bookDataSchema, copyDetailsSchema, isbnSchema, parseAuthors, uuidSchema } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-state";
import { withUser } from "@/server/action-result";
import { createBookWithCopy } from "@/server/catalog/mutations";
import { findBookByIsbn } from "@/server/catalog/queries";
import { downloadCover } from "@/server/covers/download";
import { removeCover, saveCover } from "@/server/covers/storage";
import { DomainError, forbidden } from "@/server/errors";
import { lookupIsbn, type BookCandidate } from "@/server/isbn/lookup";
import { listLocationRefs } from "@/server/locations/service";
import { can } from "@/server/policy";

// Flusso "Aggiungi" (ADR-0007/0008): lookup lato server, anteprima copertina come data URL piccola
// (la CSP non ammette immagini esterne), salvataggio con copertina scaricata o caricata e ricodificata.

const PREVIEW_EDGE_PX = 240;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type LookupOutcome =
  | { status: "exists"; book: { id: string; title: string; authors: string[]; locations: string[] } }
  | { status: "found"; candidate: BookCandidate; coverPreview: string | null }
  | { status: "not-found"; isbn13: string };

async function previewDataUrl(coverUrl: string | null): Promise<string | null> {
  if (!coverUrl) return null;
  const bytes = await downloadCover(coverUrl);
  if (!bytes) return null;
  try {
    const preview = await sharp(bytes, { limitInputPixels: 40_000_000 }).resize(PREVIEW_EDGE_PX, PREVIEW_EDGE_PX, { fit: "inside" }).webp({ quality: 70 }).toBuffer();
    return `data:image/webp;base64,${preview.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function lookupIsbnAction(rawIsbn: string): Promise<ActionResult<LookupOutcome>> {
  return withUser<LookupOutcome>("lookupIsbn", async (user) => {
    if (!can(user, { type: "isbn.lookup", locations: await listLocationRefs() })) throw forbidden();
    const isbn13 = isbnSchema.parse(rawIsbn);

    const existing = await findBookByIsbn(isbn13);
    if (existing) {
      console.info(`[isbn] ricerca ${isbn13}: già in catalogo`);
      const locations = [...new Set(existing.copies.map((copy) => copy.location.name))];
      return { ok: true, data: { status: "exists", book: { id: existing.id, title: existing.title, authors: existing.authors, locations } } };
    }

    const candidate = await lookupIsbn(isbn13);
    // Traccia operativa: solo ISBN ed esito, nessun dato personale.
    console.info(`[isbn] ricerca ${isbn13}: ${candidate ? `trovato su ${candidate.source}` : "non trovato"}`);
    if (!candidate) return { ok: true, data: { status: "not-found", isbn13 } };
    return { ok: true, data: { status: "found", candidate, coverPreview: await previewDataUrl(candidate.coverUrl) } };
  });
}

const sourceSchema = z.enum(["GOOGLE_BOOKS", "OPEN_LIBRARY", "MANUAL"]);

async function resolveCover(formData: FormData): Promise<string | null> {
  const file = formData.get("coverFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("VALIDATION", "La foto della copertina è troppo grande (massimo 4 MB).");
    return saveCover(new Uint8Array(await file.arrayBuffer()));
  }
  // L'URL arriva dal client: downloadCover applica comunque l'allowlist degli host.
  const coverUrl = String(formData.get("coverUrl") ?? "");
  if (!coverUrl) return null;
  const bytes = await downloadCover(coverUrl);
  return bytes ? saveCover(bytes) : null;
}

export async function createBookAction(_previous: ActionResult<{ bookId: string }>, formData: FormData): Promise<ActionResult<{ bookId: string }>> {
  const result = await withUser<{ bookId: string }>("createBook", async (user) => {
    const book = bookDataSchema.parse({
      isbn13: String(formData.get("isbn13") ?? ""),
      title: String(formData.get("title") ?? ""),
      authors: parseAuthors(String(formData.get("authors") ?? "")),
      publishedYear: String(formData.get("publishedYear") ?? "") || null,
      description: String(formData.get("description") ?? ""),
    });
    const copy = copyDetailsSchema.parse({ shelf: String(formData.get("shelf") ?? ""), notes: String(formData.get("notes") ?? "") });
    const locationId = uuidSchema.parse(String(formData.get("locationId") ?? ""));
    const source = sourceSchema.catch("MANUAL").parse(String(formData.get("source") ?? ""));

    const coverPath = await resolveCover(formData);
    try {
      const created = await createBookWithCopy(user, { book, source, coverPath, locationId, copy });
      return { ok: true, data: created };
    } catch (error) {
      // Niente file orfani se il libro non viene creato (permessi, ISBN già presente, …).
      if (coverPath) await removeCover(coverPath);
      throw error;
    }
  });
  if (result.ok) redirect(`/libri/${result.data.bookId}`);
  return result;
}
