import type { Metadata } from "next";
import Link from "next/link";
import { BookCover } from "@/components/book-cover";
import { LocationTag, Notice, PageHeader } from "@/components/ui";
import { locationColorClass } from "@/lib/location-colors";
import { requireUser } from "@/server/actor";
import { searchBooks } from "@/server/catalog/queries";
import { listLocations } from "@/server/locations/service";

export const metadata: Metadata = { title: "Catalogo" };

type SearchParams = Promise<{ q?: string; sede?: string; pagina?: string; eliminato?: string }>;

function pageHref(params: { q?: string; sede?: string }, page: number): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.sede) query.set("sede", params.sede);
  if (page > 1) query.set("pagina", String(page));
  const text = query.toString();
  return text ? `/?${text}` : "/";
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const params = await searchParams;
  const query = (params.q ?? "").slice(0, 200);
  const locations = await listLocations();
  const locationId = locations.some((location) => location.id === params.sede) ? params.sede : undefined;
  const result = await searchBooks({ query, locationId, page: Number(params.pagina) || 1 });
  const isFiltered = Boolean(query || locationId);

  return (
    <>
      <PageHeader title="Catalogo" subtitle={`${result.total} ${result.total === 1 ? "libro" : "libri"}${isFiltered ? " trovati" : ""}`} />
      {params.eliminato === "1" && (
        <div className="mb-3">
          <Notice tone="success">Libro eliminato.</Notice>
        </div>
      )}

      <form role="search" action="/" method="get" className="sticky top-0 z-30 -mx-4 bg-paper/95 px-4 pb-3 pt-2 backdrop-blur-md">
        {locationId && <input type="hidden" name="sede" value={locationId} />}
        <label htmlFor="cerca" className="sr-only">
          Cerca per titolo, autore o ISBN
        </label>
        <input
          id="cerca"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Titolo, autore o ISBN"
          enterKeyHint="search"
          autoComplete="off"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-4 text-[16px] shadow-[var(--shadow-card)]"
        />
      </form>

      {locations.length > 1 && (
        <nav aria-label="Filtra per sede" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link
            href={pageHref({ q: query }, 1)}
            aria-current={!locationId ? "true" : undefined}
            className="shrink-0 rounded-full border border-line px-3.5 py-2 text-[14px] font-medium aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:text-accent-ink"
          >
            Tutte
          </Link>
          {locations.map((location) => (
            <Link
              key={location.id}
              href={pageHref({ q: query, sede: location.id }, 1)}
              aria-current={location.id === locationId ? "true" : undefined}
              className="shrink-0 rounded-full border border-line px-3.5 py-2 text-[14px] font-medium aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:text-accent-ink"
            >
              <span aria-hidden className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${locationColorClass(location.color)}`} />
              {location.name}
              {location.archived && " (archiviata)"}
            </Link>
          ))}
        </nav>
      )}

      {result.items.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] bg-surface px-5 py-10 text-center shadow-[var(--shadow-card)]">
          <p className="font-serif text-[20px]">{isFiltered ? "Nessun libro trovato" : "Il catalogo è vuoto"}</p>
          <p className="mt-2 text-[15px] text-ink-soft">
            {isFiltered ? "Prova con meno parole o togli il filtro della sede." : "Aggiungi il primo libro con la fotocamera o a mano."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
          {result.items.map((book) => (
            <li key={book.id}>
              <Link href={`/libri/${book.id}`} className="flex gap-3.5 px-4 py-3 active:bg-sunken">
                <BookCover bookId={book.id} title={book.title} coverPath={book.coverPath} />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]">{book.title}</p>
                  <p className="mt-0.5 truncate text-[14px] text-ink-soft">
                    {book.authors.join(", ") || "Autore sconosciuto"}
                    {book.publishedYear && <span className="text-ink-faint"> · {book.publishedYear}</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {book.locations.map((location) => (
                      <LocationTag key={location.id} color={location.color} name={location.name} count={location.copies} />
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result.pageCount > 1 && (
        <nav aria-label="Pagine" className="mt-4 flex items-center justify-between text-[15px]">
          {result.page > 1 ? (
            <Link href={pageHref({ q: query, sede: locationId }, result.page - 1)} className="min-h-11 px-2 py-2.5 font-semibold text-accent">
              ← Precedente
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-faint">
            Pagina {result.page} di {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link href={pageHref({ q: query, sede: locationId }, result.page + 1)} className="min-h-11 px-2 py-2.5 font-semibold text-accent">
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
