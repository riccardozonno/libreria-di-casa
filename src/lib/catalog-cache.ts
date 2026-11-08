// Blocchi del catalogo già caricati, per ricerca e filtri: tornando dalla scheda di un libro l'elenco è subito
// lì (e ScrollRestoration ritrova la posizione). Vive in memoria finché si naviga nell'app; ogni modifica
// riuscita (api.ts) la svuota, così non si mostrano dati vecchi. Non si ricarica da sola: modifiche fatte da
// un altro telefono si vedono alla prossima apertura dell'app o dopo una propria modifica.

export interface CatalogSnapshot<Item> {
  items: Item[];
  hasMore: boolean;
  total: number | null;
  /** Prossimo blocco da chiedere (`page` dell'API). */
  nextPage: number;
}

const snapshots = new Map<string, CatalogSnapshot<unknown>>();
// Cresce a ogni svuotamento: un blocco chiesto prima di una modifica e arrivato dopo non va salvato.
let generation = 0;

export function catalogGeneration(): number {
  return generation;
}

export function readCatalog<Item>(key: string): CatalogSnapshot<Item> | undefined {
  return snapshots.get(key) as CatalogSnapshot<Item> | undefined;
}

export function saveCatalog<Item>(key: string, snapshot: CatalogSnapshot<Item>): void {
  snapshots.set(key, snapshot);
}

/** Svuota la memoria; con `only` solo le liste per cui vale (es. quelle filtrate per lettura). */
export function clearCatalog(only?: (key: string) => boolean): void {
  generation += 1;
  if (!only) {
    snapshots.clear();
    return;
  }
  for (const key of [...snapshots.keys()]) if (only(key)) snapshots.delete(key);
}
