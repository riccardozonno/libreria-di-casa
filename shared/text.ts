// Normalizzazione del testo per ricerca e unicità.
// La ricerca usa FTS5 con `remove_diacritics`: la query va normalizzata allo stesso modo.

const MAX_SEARCH_TERMS = 8;
/** Caratteri con significato nella sintassi FTS5: diventano separatori, mai operatori. */
const FTS_SYNTAX = /["*^():+]/g;

export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Parole da cercare (in AND). I trattini vengono tolti così un ISBN scritto con i trattini funziona. */
export function searchTerms(query: string): string[] {
  return normalizeForSearch(query.replace(/-/g, ""))
    .split(" ")
    .filter((term) => term.length > 0)
    .slice(0, MAX_SEARCH_TERMS);
}

/** "Promessi spo" → `"promessi"* "spo"*`: ogni parola tra virgolette e come prefisso; null se vuota. */
export function toFtsQuery(query: string): string | null {
  const terms = searchTerms(query.replace(FTS_SYNTAX, " "));
  return terms.length === 0 ? null : terms.map((term) => `"${term}"*`).join(" ");
}

export function locationNameKey(name: string): string {
  return normalizeForSearch(name);
}
