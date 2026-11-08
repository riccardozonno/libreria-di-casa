// Blocchi del catalogo già caricati, per ricerca e filtri: tornando dalla scheda di un libro l'elenco è subito
// lì (e ScrollRestoration ritrova la posizione). Vive in memoria finché si naviga nell'app; ogni modifica
// riuscita (send in api.ts) la svuota, così non si mostrano dati vecchi.

export interface CatalogSnapshot<Item> {
  items: Item[];
  hasMore: boolean;
  total: number | null;
  /** Prossimo blocco da chiedere (`page` dell'API). */
  nextPage: number;
}

const snapshots = new Map<string, CatalogSnapshot<unknown>>();

export function readCatalog<Item>(key: string): CatalogSnapshot<Item> | undefined {
  return snapshots.get(key) as CatalogSnapshot<Item> | undefined;
}

export function saveCatalog<Item>(key: string, snapshot: CatalogSnapshot<Item>): void {
  snapshots.set(key, snapshot);
}

export function clearCatalog(): void {
  snapshots.clear();
}
