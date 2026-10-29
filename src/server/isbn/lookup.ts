import "server-only";
import { z } from "zod";
import { env } from "../env";

// Lookup ISBN lato server (ADR-0008): Google Books → Open Library. La chiave non arriva mai al client.
// Le risposte esterne sono dati non fidati: validate con zod e normalizzate.

export type CandidateSource = "GOOGLE_BOOKS" | "OPEN_LIBRARY";

export interface BookCandidate {
  isbn13: string;
  title: string;
  authors: string[];
  publishedYear: number | null;
  description: string | null;
  coverUrl: string | null;
  source: CandidateSource;
}

const TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 24 * 3_600_000;
const CACHE_MAX_ENTRIES = 500;
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 5_000;

const cache = new Map<string, { value: BookCandidate | null; expiresAt: number }>();

export function parseYear(raw: string | undefined): number | null {
  const match = raw?.match(/\b(1[4-9]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

const googleSchema = z.object({
  totalItems: z.number().optional(),
  items: z
    .array(
      z.object({
        volumeInfo: z.object({
          title: z.string().optional(),
          subtitle: z.string().optional(),
          authors: z.array(z.string()).optional(),
          publishedDate: z.string().optional(),
          description: z.string().optional(),
          imageLinks: z.object({ thumbnail: z.string().optional(), smallThumbnail: z.string().optional() }).optional(),
        }),
      }),
    )
    .optional(),
});

const openLibrarySchema = z.record(
  z.string(),
  z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    authors: z.array(z.object({ name: z.string() })).optional(),
    publish_date: z.string().optional(),
    cover: z.object({ large: z.string().optional(), medium: z.string().optional() }).optional(),
  }),
);

function fullTitle(title: string, subtitle?: string): string {
  return (subtitle ? `${title}. ${subtitle}` : title).slice(0, MAX_TITLE);
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function lookupGoogleBooks(isbn13: string, fetchImpl: typeof fetch = fetch): Promise<BookCandidate | null> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", `isbn:${isbn13}`);
  url.searchParams.set("maxResults", "1");
  if (env.GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", env.GOOGLE_BOOKS_API_KEY);

  const parsed = googleSchema.safeParse(await fetchJson(url.toString(), fetchImpl));
  const info = parsed.success ? parsed.data.items?.[0]?.volumeInfo : undefined;
  if (!info?.title) return null;
  const thumbnail = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
  return {
    isbn13,
    title: fullTitle(info.title, info.subtitle),
    authors: info.authors ?? [],
    publishedYear: parseYear(info.publishedDate),
    description: info.description ? stripHtml(info.description).slice(0, MAX_DESCRIPTION) : null,
    coverUrl: thumbnail ? thumbnail.replace("&edge=curl", "") : null,
    source: "GOOGLE_BOOKS",
  };
}

export async function lookupOpenLibrary(isbn13: string, fetchImpl: typeof fetch = fetch): Promise<BookCandidate | null> {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`;
  const parsed = openLibrarySchema.safeParse(await fetchJson(url, fetchImpl));
  const info = parsed.success ? parsed.data[`ISBN:${isbn13}`] : undefined;
  if (!info?.title) return null;
  return {
    isbn13,
    title: fullTitle(info.title, info.subtitle),
    authors: info.authors?.map((author) => author.name) ?? [],
    publishedYear: parseYear(info.publish_date),
    description: null,
    coverUrl: info.cover?.large ?? info.cover?.medium ?? `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`,
    source: "OPEN_LIBRARY",
  };
}

/** Cerca prima su Google Books, poi su Open Library. null se nessuno dei due conosce l'ISBN. */
export async function lookupIsbn(isbn13: string, fetchImpl: typeof fetch = fetch): Promise<BookCandidate | null> {
  const cached = cache.get(isbn13);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = (await lookupGoogleBooks(isbn13, fetchImpl)) ?? (await lookupOpenLibrary(isbn13, fetchImpl));
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value ?? "");
  cache.set(isbn13, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function clearLookupCache(): void {
  cache.clear();
}
