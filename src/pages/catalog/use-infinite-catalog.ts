import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { type CatalogSnapshot, catalogGeneration, readCatalog, saveCatalog } from "../../lib/catalog-cache";
import { mergePages } from "./infinite-list";

// Blocchi del catalogo per una ricerca/filtro (`query`, senza `page`): il primo all'apertura, gli altri con
// `loadMore()`. Un blocco alla volta; cambiando ricerca o uscendo dalla pagina la richiesta in corso si
// annulla. I blocchi arrivati restano in catalog-cache per il ritorno dalla scheda.

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
  // Cambiati ricerca o filtri: si riparte dalla memoria, se c'è, o dal primo blocco (in render, niente effetto).
  const current = state.query === query ? state : (fromCache<Item>(query) ?? emptyState<Item>(query));
  if (current !== state) setState(current);

  // Ultimo stato mostrato: base per unire il blocco successivo (fuori dagli aggiornamenti di stato).
  const shown = useRef(current);
  useEffect(() => {
    shown.current = current;
  });

  // Richiesta in corso (una sola); annullata quando cambia la ricerca o si lascia la pagina.
  const inFlight = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      inFlight.current?.abort();
      inFlight.current = null;
    },
    [query],
  );

  const load = useCallback(
    async (page: number) => {
      if (inFlight.current) return;
      const controller = new AbortController();
      inFlight.current = controller;
      // Se nel frattempo una modifica svuota la memoria, questo blocco (letto prima) non va salvato.
      const generation = catalogGeneration();
      setState((previous) => (previous.query === query ? { ...previous, isLoading: true, error: "" } : previous));
      try {
        const separator = query ? "&" : "";
        const result = await api<Page<Item>>(`/books?${query}${separator}page=${page}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const base = shown.current.query === query ? shown.current : emptyState<Item>(query);
        const next: CatalogSnapshot<Item> = {
          items: page === 0 ? result.items : mergePages(base.items, result.items),
          hasMore: result.hasMore,
          total: result.total ?? base.total,
          nextPage: page + 1,
        };
        if (catalogGeneration() === generation) saveCatalog(query, next);
        setState({ ...next, query, isLoading: false, error: "" });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((previous) => (previous.query === query ? { ...previous, isLoading: false, error: errorMessage(error) } : previous));
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [query],
  );

  // Primo blocco quando non c'è nulla in memoria per questa ricerca.
  const needsFirstPage = current.nextPage === 0 && current.items.length === 0 && !current.error;
  useEffect(() => {
    if (needsFirstPage) void load(0);
  }, [needsFirstPage, load]);

  // Anche dopo un errore sul primo blocco (nextPage 0) si può riprovare.
  const loadMore = useCallback(() => {
    if (!current.isLoading && (current.hasMore || current.nextPage === 0)) void load(current.nextPage);
  }, [current.hasMore, current.isLoading, current.nextPage, load]);

  return { ...current, loadMore };
}
