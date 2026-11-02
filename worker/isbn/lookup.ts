import { z } from "zod";
import { type GenreKey, suggestGenre } from "../../shared/genres";

// Ricerca ISBN lato server (ADR-0008, dalla v1): Google Books → Open Library. La chiave non arriva
// mai al client. Le risposte esterne sono dati non fidati: validate con zod e normalizzate.
// Le chiamate (≤ 28) restano sotto il limite di 50 sottorichieste del piano gratuito; la memoria
// dei risultati trovati è in D1 (isbn/service.ts), non in questo modulo.

export interface LookupDeps {
  fetch: typeof fetch;
  /** Chiave di Google Books (segreto del Worker); senza chiave Google funziona con limiti più bassi. */
  apiKey?: string;
}

export type CandidateSource = "GOOGLE_BOOKS" | "OPEN_LIBRARY";

export interface BookCandidate {
  isbn13: string;
  title: string;
  authors: string[];
  publishedYear: number | null;
  description: string | null;
  coverUrl: string | null;
  source: CandidateSource;
  /** Dalla prima categoria di Google Books (shared/genres.ts); Open Library non lo dà. */
  suggestedGenre: GenreKey | null;
}

const TIMEOUT_MS = 6_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;
const GOOGLE_ROUNDS = 4;
// Oltre questo tempo non si fanno altri giri su Google: si passa a Open Library.
const GOOGLE_BUDGET_MS = 10_000;
const GOOGLE_RETRY_DELAY_MS = 150;
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 5_000;

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
          // Una categoria malformata non deve far perdere il resto del libro.
          categories: z.array(z.string()).optional().catch(undefined),
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

/** Nome del servizio per i log: mai l'URL completo, che per Google contiene la chiave. */
function serviceName(url: string): string {
  return new URL(url).hostname;
}

/** GET JSON con un nuovo tentativo su errori temporanei (5xx, 429, rete). null se non disponibile. */
async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
      if (response.ok) return await response.json();
      const isTransient = response.status >= 500 || response.status === 429;
      console.warn(`[isbn] ${serviceName(url)} ha risposto ${response.status} (tentativo ${attempt})`);
      if (!isTransient) return null;
    } catch (error) {
      console.warn(`[isbn] ${serviceName(url)} non raggiungibile (tentativo ${attempt})`, error instanceof Error ? error.message : error);
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  return null;
}

/** ISBN-10 equivalente (solo per i 978…): Google indicizza alcuni libri italiani solo così. */
export function toIsbn10(isbn13: string): string | null {
  if (!isbn13.startsWith("978")) return null;
  const body = isbn13.slice(3, 12);
  const sum = [...body].reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? "X" : String(check));
}

async function googleVolume(query: string, deps: LookupDeps, extra: Record<string, string> = {}) {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", `isbn:${query}`);
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("printType", "books");
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  if (deps.apiKey) url.searchParams.set("key", deps.apiKey);
  const parsed = googleSchema.safeParse(await fetchJson(url.toString(), deps.fetch));
  return parsed.success ? parsed.data.items?.[0]?.volumeInfo : undefined;
}

/**
 * Google Books risponde in modo incostante alla ricerca per ISBN: la stessa query restituisce
 * 0 o 1 risultati a seconda della chiamata (misurato: 10–40% di successi su libri italiani).
 * Si ripete alternando ISBN-13 e ISBN-10, fermandosi al primo risultato.
 */
async function findGoogleVolume(isbn13: string, deps: LookupDeps) {
  const isbn10 = toIsbn10(isbn13);
  // Varianti equivalenti lanciate in parallelo a ogni giro: stesso tempo d'attesa, più probabilità di risposta.
  const variants: { query: string; extra?: Record<string, string> }[] = [
    { query: isbn13 },
    { query: isbn10 ?? isbn13 },
    { query: isbn13, extra: { country: "US" } },
  ];
  const deadline = Date.now() + GOOGLE_BUDGET_MS;
  for (let round = 0; round < GOOGLE_ROUNDS && Date.now() < deadline; round += 1) {
    const results = await Promise.all(variants.map((variant) => googleVolume(variant.query, deps, variant.extra)));
    const info = results.find((result) => result?.title);
    if (info) return info;
    if (round < GOOGLE_ROUNDS - 1) await new Promise((resolve) => setTimeout(resolve, GOOGLE_RETRY_DELAY_MS));
  }
  return undefined;
}

export async function lookupGoogleBooks(isbn13: string, deps: LookupDeps): Promise<BookCandidate | null> {
  const info = await findGoogleVolume(isbn13, deps);
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
    suggestedGenre: suggestGenre(info.categories),
  };
}

export async function lookupOpenLibrary(isbn13: string, fetchImpl: typeof fetch): Promise<BookCandidate | null> {
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
    suggestedGenre: null,
  };
}

const openLibrarySearchSchema = z.object({
  docs: z
    .array(
      z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        author_name: z.array(z.string()).optional(),
        first_publish_year: z.number().optional(),
        cover_i: z.number().optional(),
      }),
    )
    .optional(),
});

/** Ricerca di Open Library: copre edizioni che l'API "books" non restituisce. */
export async function searchOpenLibrary(isbn13: string, fetchImpl: typeof fetch): Promise<BookCandidate | null> {
  const url = `https://openlibrary.org/search.json?isbn=${isbn13}&limit=1&fields=title,subtitle,author_name,first_publish_year,cover_i`;
  const parsed = openLibrarySearchSchema.safeParse(await fetchJson(url, fetchImpl));
  const doc = parsed.success ? parsed.data.docs?.[0] : undefined;
  if (!doc?.title) return null;
  return {
    isbn13,
    title: fullTitle(doc.title, doc.subtitle),
    authors: doc.author_name ?? [],
    publishedYear: doc.first_publish_year ?? null,
    description: null,
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`
      : `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`,
    source: "OPEN_LIBRARY",
    suggestedGenre: null,
  };
}

/** Google Books (ISBN-13, poi ISBN-10) → Open Library (API books, poi ricerca). null se nessuno lo conosce. */
export async function lookupIsbn(isbn13: string, deps: LookupDeps): Promise<BookCandidate | null> {
  return (
    (await lookupGoogleBooks(isbn13, deps)) ?? (await lookupOpenLibrary(isbn13, deps.fetch)) ?? (await searchOpenLibrary(isbn13, deps.fetch))
  );
}
