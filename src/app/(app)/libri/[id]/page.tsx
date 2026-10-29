import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCover } from "@/components/book-cover";
import { LocationTag, Section } from "@/components/ui";
import { formatIsbn13 } from "@/lib/isbn";
import { uuidSchema } from "@/lib/schemas";
import { requireUser } from "@/server/actor";
import { getBookDetail } from "@/server/catalog/queries";
import { listLocations, toLocationRef } from "@/server/locations/service";
import { can } from "@/server/policy";
import { AddCopyForm } from "./add-copy-form";
import { CopyRow } from "./copy-row";
import { ReadingToggle } from "./reading-toggle";

type Params = Promise<{ id: string }>;

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });
const SOURCE_LABELS = { GOOGLE_BOOKS: "Google Books", OPEN_LIBRARY: "Open Library", MANUAL: "inserimento manuale", CSV: "import CSV" } as const;

async function loadBook(params: Params) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const book = await getBookDetail(id);
  if (!book) notFound();
  return book;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await requireUser();
  const book = await loadBook(params);
  return { title: book.title };
}

export default async function BookPage({ params }: { params: Params }) {
  const user = await requireUser();
  const book = await loadBook(params);
  const locations = await listLocations();
  const copyCount = book.copies.length;
  const hasRead = book.readings.some((reading) => reading.user.id === user.id);
  const addableLocations = locations.filter((location) => can(user, { type: "copy.create", location: { id: location.id, archived: location.archived } }));

  return (
    <article className="pb-4">
      <Link href="/" className="-ml-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Catalogo
      </Link>

      <header className="mt-2 flex gap-4">
        <BookCover bookId={book.id} title={book.title} coverPath={book.coverPath} size="lg" />
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="font-serif text-[24px] font-semibold leading-tight [overflow-wrap:anywhere]">{book.title}</h1>
          <p className="mt-1.5 text-[16px] text-ink-soft">{book.authors.join(", ") || "Autore sconosciuto"}</p>
          <dl className="mt-3 space-y-1 text-[14px] text-ink-faint">
            {book.publishedYear && (
              <div className="flex gap-1.5">
                <dt>Anno</dt>
                <dd className="text-ink-soft">{book.publishedYear}</dd>
              </div>
            )}
            {book.isbn13 && (
              <div className="flex gap-1.5">
                <dt>ISBN</dt>
                <dd className="font-mono text-ink-soft">{formatIsbn13(book.isbn13)}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <div className="mt-5">
        <ReadingToggle bookId={book.id} userId={user.id} hasRead={hasRead} />
      </div>

      {book.description && (
        <Section title="Descrizione">
          <p className="whitespace-pre-line rounded-[var(--radius-lg)] bg-surface px-4 py-3.5 text-[15px] leading-relaxed shadow-[var(--shadow-card)]">
            {book.description}
          </p>
        </Section>
      )}

      <Section title={copyCount === 1 ? "1 copia" : `${copyCount} copie`}>
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
          {book.copies.map((copy) => {
            const location = toLocationRef(copy.location);
            return (
              <CopyRow
                key={copy.id}
                copy={{ id: copy.id, shelf: copy.shelf, notes: copy.notes }}
                location={<LocationTag id={copy.location.id} name={`${copy.location.name}${location.archived ? " (archiviata)" : ""}`} />}
                canEdit={can(user, { type: "copy.update", location })}
                canDelete={can(user, { type: "copy.delete", location, isLastCopy: copyCount <= 1 })}
                isLastCopy={copyCount <= 1}
              />
            );
          })}
        </ul>
        {addableLocations.length > 0 && <AddCopyForm bookId={book.id} locations={addableLocations.map(({ id, name }) => ({ id, name }))} />}
      </Section>

      <Section title="Letto da">
        {book.readings.length === 0 ? (
          <p className="px-1 text-[15px] text-ink-faint">Nessuno l&apos;ha ancora segnato come letto.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 px-1">
            {book.readings.map((reading) => (
              <li key={reading.user.id} className="rounded-full bg-success-soft px-3 py-1.5 text-[14px] font-medium text-success">
                {reading.user.name}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Spostamenti">
        {book.movements.length === 0 ? (
          <p className="px-1 text-[15px] text-ink-faint">Nessuno spostamento registrato.</p>
        ) : (
          <ol className="space-y-2 px-1 text-[14px]">
            {book.movements.map((movement) => (
              <li key={movement.id}>
                <span className="font-medium">{movement.fromLocation.name}</span> → <span className="font-medium">{movement.toLocation.name}</span>
                <span className="text-ink-faint">
                  {" "}
                  · {movement.movedBy?.name ?? "utente rimosso"}, {dateFormat.format(movement.movedAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <p className="mt-8 px-1 text-[12px] text-ink-faint">
        Aggiunto il {dateFormat.format(book.createdAt)}
        {book.createdBy && ` da ${book.createdBy.name}`} · dati da {SOURCE_LABELS[book.source]}
      </p>
    </article>
  );
}
