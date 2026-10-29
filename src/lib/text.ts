// Normalizzazione del testo per ricerca e unicità (ADR-0011).
// Deve essere identica in scrittura (searchText, nameKey) e in lettura (termini cercati).

const MAX_SEARCH_TERMS = 8;

export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchableBook {
  title: string;
  authors: readonly string[];
  isbn13: string | null;
}

export function buildSearchText(book: SearchableBook): string {
  return normalizeForSearch([book.title, ...book.authors, book.isbn13 ?? ""].join(" "));
}

/** Parole da cercare (in AND). I trattini vengono tolti così un ISBN scritto con i trattini funziona. */
export function searchTerms(query: string): string[] {
  return normalizeForSearch(query.replace(/-/g, ""))
    .split(" ")
    .filter((term) => term.length > 0)
    .slice(0, MAX_SEARCH_TERMS);
}

export function locationNameKey(name: string): string {
  return normalizeForSearch(name);
}
