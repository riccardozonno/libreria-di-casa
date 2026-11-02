import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { locationColorClass } from "../../shared/location-colors";
import { genreFilterSchema } from "../../shared/schemas";
import { BookCover } from "../components/book-cover";
import { GenreOptions } from "../components/genre-options";
import { LocationTag, Notice, PageHeader, SelectInput } from "../components/ui";
import { useLocations } from "../lib/locations";
import { useApi } from "../lib/use-api";

// Catalogo: ricerca (titolo, autore, ISBN, senza accenti), filtro per sede, pagine da 24.

interface BookListItem {
  id: string;
  title: string;
  authors: string[];
  publishedYear: number | null;
  coverKey: string | null;
  locations: Array<{ id: string; name: string; color: Parameters<typeof locationColorClass>[0] }>;
}

const SEARCH_DELAY_MS = 300;
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
  const page = Math.max(0, Number(params.get("pagina") ?? 1) - 1) || 0;
  const [draft, setDraft] = useState(query);

  // La ricerca parte quando si smette di scrivere; l'URL resta la fonte (indietro/avanti funzionano).
  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (draft.trim()) next.set("q", draft);
        else next.delete("q");
        next.delete("pagina");
        return next;
      }, { replace: true });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, query, setParams]);

  const apiQuery = new URLSearchParams();
  if (query.trim()) apiQuery.set("q", query.trim());
  if (locationId) apiQuery.set("location", locationId);
  if (genre) apiQuery.set("genre", genre);
  if (page > 0) apiQuery.set("page", String(page));
  const { data, error, loading } = useApi<{ items: BookListItem[]; hasMore: boolean }>(`/books?${apiQuery.toString()}`);
  const isFiltered = Boolean(query.trim() || locationId || genre);

  const linkWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const text = next.toString();
    return text ? `/?${text}` : "/";
  };

  return (
    <>
      <PageHeader title="Catalogo" subtitle={isFiltered ? "Risultati della ricerca" : "Tutti i libri di casa"} />
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
          <Link to={linkWith({ sede: null, pagina: null })} aria-current={!locationId ? "true" : undefined} className={chipClasses}>
            Tutte
          </Link>
          {locations.map((location) => (
            <Link key={location.id} to={linkWith({ sede: location.id, pagina: null })} aria-current={location.id === locationId ? "true" : undefined} className={chipClasses}>
              <span aria-hidden className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${locationColorClass(location.color)}`} />
              {location.name}
              {location.archived && " (archiviata)"}
            </Link>
          ))}
        </nav>
      )}

      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="filtro-genere" className="text-[14px] font-semibold text-ink-soft">
          Genere
        </label>
        <SelectInput
          id="filtro-genere"
          value={genre}
          onChange={(event) =>
            setParams((current) => {
              const next = new URLSearchParams(current);
              if (event.target.value) next.set("genere", event.target.value);
              else next.delete("genere");
              next.delete("pagina");
              return next;
            })
          }
          className="min-w-0 flex-1"
        >
          <option value="">Tutti i generi</option>
          <GenreOptions />
          <option value="NONE">Senza genere</option>
        </SelectInput>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {!data && loading && <p className="px-1 py-6 text-center text-ink-soft">Caricamento…</p>}
      {data && data.items.length === 0 && (
        <div className="rounded-[var(--radius-lg)] bg-surface px-5 py-10 text-center shadow-[var(--shadow-card)]">
          <p className="font-serif text-[20px]">{isFiltered ? "Nessun libro trovato" : "Il catalogo è vuoto"}</p>
          <p className="mt-2 text-[15px] text-ink-soft">
            {isFiltered ? "Prova con meno parole o togli i filtri di sede e genere." : "Aggiungi il primo libro con la fotocamera o a mano."}
          </p>
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul aria-busy={loading} className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)] aria-busy:opacity-70">
          {data.items.map((book) => (
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

      {data && (page > 0 || data.hasMore) && (
        <nav aria-label="Pagine" className="mt-4 flex items-center justify-between text-[15px]">
          {page > 0 ? (
            <Link to={linkWith({ pagina: page > 1 ? String(page) : null })} className="min-h-11 px-2 py-2.5 font-semibold text-accent">
              ← Precedente
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-faint">Pagina {page + 1}</span>
          {data.hasMore ? (
            <Link to={linkWith({ pagina: String(page + 2) })} className="min-h-11 px-2 py-2.5 font-semibold text-accent">
              Successiva →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
