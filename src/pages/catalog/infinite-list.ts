// Catalogo a scorrimento continuo, senza React: unione dei blocchi e testo del contatore.
// Testata in tests/unit/infinite-list.test.ts.

/** Aggiunge il nuovo blocco in fondo, senza doppioni (un libro aggiunto nel frattempo sposta gli altri). */
export function mergePages<Item extends { id: string }>(loaded: readonly Item[], incoming: readonly Item[]): Item[] {
  const seen = new Set(loaded.map((item) => item.id));
  return [...loaded, ...incoming.filter((item) => !seen.has(item.id))];
}

const books = (count: number) => (count === 1 ? "libro" : "libri");

/** «24 di 30 libri» mentre se ne caricano altri, «30 libri» quando ci sono tutti. */
export function countLabel(loaded: number, total: number | null): string {
  if (total === null || loaded >= total) return `${loaded} ${books(loaded)}`;
  return `${loaded} di ${total} ${books(total)}`;
}
