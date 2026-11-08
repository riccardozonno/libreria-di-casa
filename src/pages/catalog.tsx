import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { locationColorClass } from "../../shared/location-colors";
import { genreFilterSchema, type ReadingFilter, readingFilterSchema } from "../../shared/schemas";
import { BookCover } from "../components/book-cover";
import { GenreOptions } from "../components/genre-options";
import { Button, buttonClasses, LocationTag, Notice, PageHeader, SelectInput } from "../components/ui";
import { useLocations } from "../lib/locations";
import { countLabel } from "./catalog/infinite-list";
import { useInfiniteCatalog } from "./catalog/use-infinite-catalog";

// Catalogo: ricerca (titolo, autore, ISBN, senza accenti), filtri per sede, genere e lettura. Scorrimento
// continuo a blocchi da 24 (8/11/2026), con «Mostra altri» come riserva e il contatore «24 di 312 libri».

interface BookListItem {
  id: string;
  title: string;
  authors: string[];
  publishedYear: number | null;
  coverKey: string | null;
  locations: Array<{ id: string; name: string; color: Parameters<typeof locationColorClass>[0] }>;
}

const SEARCH_DELAY_MS = 300;
// Il blocco successivo parte un po' prima del fondo, così di solito è già arrivato quando ci si arriva.
const LOAD_AHEAD = "600px";
const READING_FILTER_LABELS: Record<NonNullable<ReadingFilter>, string> = {
  UNREAD_BY_ME: "Non letti da me",
  UNREAD: "Non letti da nessuno",
  READING: "In lettura",
};
const filterLabelClasses = "w-16 shrink-0 text-[14px] font-semibold text-ink-soft";
const chipClasses =
  "inline-flex min-h-11 shrink-0 items-center rounded-full border border-line px-3.5 text-[14px] font-medium aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:text-accent-ink";

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation() as { state: { deleted?: boolean } | null };
  const { locations } = useLocations();
  const query = params.get("q") ?? "";
  const locationId = params.get("sede") ?? "";
  // "NONE" = libri ancora senza genere (per completarli).
  const rawGenre = params.get("genere") ?? "";
  // Un valore sconosciuto (indirizzo scritto a mano o vecchio) si ignora invece di dare errore.
  const genre = genreFilterSchema.safeParse(rawGenre).success ? rawGenre : "";
  const rawReading = params.get("lettura") ?? "";
  const reading = readingFilterSchema.safeParse(rawReading).success ? rawReading : "";
  const [draft, setDraft] = useState(query);

  // La ricerca parte quando si smette di scrivere; l'URL resta la fonte (indietro/avanti funzionano).
  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (draft.trim()) next.set("q", draft);
        else next.delete("q");
        return next;
      }, { replace: true });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, query, setParams]);

  const apiQuery = new URLSearchParams();
  if (query.trim()) apiQuery.set("q", query.trim());
  if (locationId) apiQuery.set("location", locationId);
  if (genre) apiQuery.set("genre", genre);
  if (reading) apiQuery.set("reading", reading);
  const catalog = useInfiniteCatalog<BookListItem>(apiQuery.toString());
  const { items, hasMore, total, isLoading, error, loadMore } = catalog;
  // Dopo «Mostra altri» (tastiera, lettore di schermo) si annuncia quanti libri ci sono ora; durante lo
  // scorrimento automatico no, sarebbe un annuncio a ogni blocco.
  const [isManualLoad, setIsManualLoad] = useState(false);
  // Dopo «Mostra altri» il focus va al primo libro nuovo (il tasto sparisce quando non ce ne sono altri).
  const list = useRef<HTMLUListElement>(null);
  const focusFrom = useRef<number | null>(null);
  const showMore = () => {
    setIsManualLoad(true);
    focusFrom.current = items.length;
    loadMore();
  };
  useEffect(() => {
    const index = focusFrom.current;
    if (index === null || isLoading || items.length <= index) return;
    list.current?.querySelectorAll("a")[index]?.focus();
    focusFrom.current = null;
  }, [isLoading, items.length]);
  const isFiltered = Boolean(query.trim() || locationId || genre || reading);

  const linkWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const text = next.toString();
    return text ? `/?${text}` : "/";
  };

  const setFilter = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Catalogo"
        subtitle={isFiltered ? "Risultati della ricerca" : "Tutti i libri di casa"}
        action={
          <Link to="/statistiche" className={buttonClasses("secondary", "shrink-0")}>
            Statistiche
          </Link>
        }
      />
      {state?.deleted && (
        <div className="mb-3">
          <Notice tone="success">Libro eliminato.</Notice>
        </div>
      )}

      <form role="search" onSubmit={(event) => event.preventDefault()} className="sticky top-0 z-30 -mx-4 bg-paper/95 px-4 pb-3 pt-2 backdrop-blur-md">
        <label htmlFor="cerca" className="sr-only">
          Cerca per titolo, autore o ISBN
        </label>
        <input
          id="cerca"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Titolo, autore o ISBN"
          enterKeyHint="search"
          autoComplete="off"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-4 text-[16px] shadow-[var(--shadow-card)]"
        />
      </form>

      {locations.length > 1 && (
        <nav aria-label="Filtra per sede" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link to={linkWith({ sede: null })} aria-current={!locationId ? "true" : undefined} className={chipClasses}>
            Tutte
          </Link>
          {locations.map((location) => (
            <Link key={location.id} to={linkWith({ sede: location.id })} aria-current={location.id === locationId ? "true" : undefined} className={chipClasses}>
              <span aria-hidden className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${locationColorClass(location.color)}`} />
              {location.name}
              {location.archived && " (archiviata)"}
            </Link>
          ))}
        </nav>
      )}

      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="filtro-genere" className={filterLabelClasses}>
          Genere
        </label>
        <SelectInput id="filtro-genere" value={genre} onChange={(event) => setFilter("genere", event.target.value)} className="min-w-0 flex-1">
          <option value="">Tutti i generi</option>
          <GenreOptions />
          <option value="NONE">Senza genere</option>
        </SelectInput>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="filtro-lettura" className={filterLabelClasses}>
          Lettura
        </label>
        <SelectInput id="filtro-lettura" value={reading} onChange={(event) => setFilter("lettura", event.target.value)} className="min-w-0 flex-1">
          <option value="">Tutti i libri</option>
          {Object.entries(READING_FILTER_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectInput>
      </div>

      {items.length === 0 && isLoading && <p className="px-1 py-6 text-center text-ink-soft">Caricamento…</p>}
      {items.length === 0 && !isLoading && !error && (
        <div className="rounded-[var(--radius-lg)] bg-surface px-5 py-10 text-center shadow-[var(--shadow-card)]">
          <p className="font-serif text-[20px]">{isFiltered ? "Nessun libro trovato" : "Il catalogo è vuoto"}</p>
          <p className="mt-2 text-[15px] text-ink-soft">
            {isFiltered ? "Prova con meno parole o togli qualche filtro." : "Aggiungi il primo libro con la fotocamera o a mano."}
          </p>
        </div>
      )}
      {items.length > 0 && (
        <ul ref={list} className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
          {items.map((book) => (
            <li key={book.id}>
              <Link to={`/libri/${book.id}`} className="flex gap-3.5 px-4 py-3 active:bg-sunken">
                <BookCover bookId={book.id} title={book.title} coverKey={book.coverKey} />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]">{book.title}</p>
                  <p className="mt-0.5 truncate text-[14px] text-ink-soft">
                    {book.authors.join(", ") || "Autore sconosciuto"}
                    {book.publishedYear && <span className="text-ink-faint"> · {book.publishedYear}</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {book.locations.map((location) => (
                      <LocationTag key={location.id} color={location.color} name={location.name} />
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3">
        {hasMore && !error && <LoadAhead onVisible={loadMore} itemCount={items.length} />}
        {error && <Notice tone="error">{items.length === 0 ? error : `Non è stato possibile caricare altri libri. ${error}`}</Notice>}
        {/* Riserva: lettori di schermo, tastiera o rete che non risponde. Resta montato durante il caricamento
            (aria-disabled), così il focus non si perde e l'altezza non cambia. */}
        {(hasMore || (error && items.length === 0)) && (
          <Button variant="secondary" className="w-full aria-disabled:opacity-60" aria-disabled={isLoading} onClick={() => !isLoading && showMore()}>
            {isLoading ? "Carico altri libri…" : "Mostra altri"}
          </Button>
        )}
        {items.length > 0 && <p className="text-center text-[13px] text-ink-faint">{countLabel(items.length, total)}</p>}
        <p role="status" className="sr-only">
          {isManualLoad && !isLoading && items.length > 0 ? countLabel(items.length, total) : ""}
        </p>
      </div>
    </>
  );
}

/** Segnaposto in fondo all'elenco: quando entra (quasi) nello schermo chiede il blocco successivo. */
function LoadAhead({ onVisible, itemCount }: { onVisible: () => void; itemCount: number }) {
  const marker = useRef<HTMLDivElement>(null);
  // Sempre l'ultima funzione, senza ricreare l'osservatore a ogni cambio di stato.
  const latest = useRef(onVisible);
  useEffect(() => {
    latest.current = onVisible;
  });
  useEffect(() => {
    const element = marker.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    // Ricreato a ogni blocco arrivato (itemCount): se il segnaposto è ancora visibile si chiede subito il prossimo.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) latest.current();
    }, { rootMargin: `0px 0px ${LOAD_AHEAD} 0px` });
    observer.observe(element);
    return () => observer.disconnect();
  }, [itemCount]);
  return <div ref={marker} aria-hidden="true" />;
}
