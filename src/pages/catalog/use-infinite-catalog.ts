import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { type CatalogSnapshot, readCatalog, saveCatalog } from "../../lib/catalog-cache";
import { mergePages } from "./infinite-list";

// Blocchi del catalogo per una ricerca/filtro (`query`, senza `page`): il primo all'apertura, gli altri con
// `loadMore()`. Un blocco alla volta; i blocchi caricati restano in catalog-cache per il ritorno dalla scheda.

interface Page<Item> {
  items: Item[];
  hasMore: boolean;
  total?: number;
}

interface State<Item> extends CatalogSnapshot<Item> {
  query: string;
  isLoading: boolean;
  error: string;
}

const emptyState = <Item,>(query: string): State<Item> => ({ query, items: [], hasMore: false, total: null, nextPage: 0, isLoading: true, error: "" });

function fromCache<Item>(query: string): State<Item> | null {
  const cached = readCatalog<Item>(query);
  return cached ? { ...cached, query, isLoading: false, error: "" } : null;
}

export function useInfiniteCatalog<Item extends { id: string }>(query: string) {
  const [state, setState] = useState<State<Item>>(() => fromCache<Item>(query) ?? emptyState<Item>(query));
  const loading = useRef(false);
  // Cambiati ricerca o filtri: si riparte dalla memoria, se c'è, o dal primo blocco (in render, niente effetto).
  const current = state.query === query ? state : (fromCache<Item>(query) ?? emptyState<Item>(query));
  if (current !== state) setState(current);

  const load = useCallback(
    async (page: number, signal?: AbortSignal) => {
      if (loading.current) return;
      loading.current = true;
      setState((previous) => ({ ...previous, isLoading: true, error: "" }));
      try {
        const separator = query ? "&" : "";
        const result = await api<Page<Item>>(`/books?${query}${separator}page=${page}`, { signal });
        setState((previous) => {
          if (previous.query !== query) return previous;
          const next: CatalogSnapshot<Item> = {
            items: page === 0 ? result.items : mergePages(previous.items, result.items),
            hasMore: result.hasMore,
            total: result.total ?? previous.total,
            nextPage: page + 1,
          };
          saveCatalog(query, next);
          return { ...next, query, isLoading: false, error: "" };
        });
      } catch (error) {
        if (signal?.aborted) return;
        setState((previous) => (previous.query === query ? { ...previous, isLoading: false, error: errorMessage(error) } : previous));
      } finally {
        loading.current = false;
      }
    },
    [query],
  );

  // Primo blocco quando non c'è nulla in memoria per questa ricerca.
  const needsFirstPage = current.nextPage === 0 && current.items.length === 0 && !current.error;
  useEffect(() => {
    if (!needsFirstPage) return;
    const controller = new AbortController();
    void load(0, controller.signal);
    return () => {
      controller.abort();
      loading.current = false;
    };
  }, [needsFirstPage, load]);

  // Anche dopo un errore sul primo blocco (nextPage 0) si può riprovare.
  const loadMore = useCallback(() => {
    if (!current.isLoading && (current.hasMore || current.nextPage === 0)) void load(current.nextPage);
  }, [current.hasMore, current.isLoading, current.nextPage, load]);

  return { ...current, loadMore };
}
