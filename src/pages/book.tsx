import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { type GenreKey, genreLabel } from "../../shared/genres";
import { formatIsbn13 } from "../../shared/isbn";
import { BookCover } from "../components/book-cover";
import { Button, Notice, Section } from "../components/ui";
import { useLocations } from "../lib/locations";
import { useSession } from "../lib/session";
import { useApi } from "../lib/use-api";
import { AddCopyForm } from "./book/add-copy-form";
import { CopyRow, type CopyView } from "./book/copy-row";
import { EditBookForm } from "./book/edit-book-form";
import { FamilyReadings } from "./book/family-readings";
import { ReadingStatusControl } from "./book/reading-status";
import { statusOf } from "./book/reading-status-logic";
import { NotFoundPage } from "./not-found";

interface BookDetail {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  publishedYear: number | null;
  description: string | null;
  coverKey: string | null;
  genre: GenreKey | null;
  source: "GOOGLE_BOOKS" | "OPEN_LIBRARY" | "MANUAL" | "CSV";
  createdBy: string | null;
  createdAt: string;
  copies: CopyView[];
  readings: Array<{ userId: string; name: string; rating: number | null }>;
  ratingAverage: number | null;
  ratingCount: number;
  currentReaders: Array<{ userId: string; name: string }>;
  movements: Array<{ id: string; from: string; to: string; movedBy: string | null; movedAt: string }>;
}

const SOURCE_LABELS: Record<BookDetail["source"], string> = { GOOGLE_BOOKS: "Google Books", OPEN_LIBRARY: "Open Library", MANUAL: "inserimento manuale", CSV: "importazione CSV" };
const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });

export function BookPage() {
  const { id = "" } = useParams();
  const { me, can } = useSession();
  const { locations } = useLocations();
  const { data: book, error, reload } = useApi<BookDetail>(`/books/${encodeURIComponent(id)}`);
  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  // Chiuso il modulo, il focus torna su «Modifica dati» (che React ha appena ricreato).
  const editButton = useRef<HTMLButtonElement>(null);
  const shouldRefocusEdit = useRef(false);
  useEffect(() => {
    if (!shouldRefocusEdit.current) return;
    editButton.current?.focus();
    shouldRefocusEdit.current = false;
  });

  if (error && !book) return error.includes("non trovato") ? <NotFoundPage what="Libro" /> : <Notice tone="error">{error}</Notice>;
  if (!book) return <p className="px-1 py-6 text-center text-ink-soft">Caricamento…</p>;

  const copyCount = book.copies.length;
  const myReading = book.readings.find((reading) => reading.userId === me.id);
  const hasRead = myReading !== undefined;
  const isReading = book.currentReaders.some((reader) => reader.userId === me.id);
  const refs = locations.map((location) => ({ id: location.id, archived: location.archived, name: location.name }));
  const addable = refs.filter((location) => can({ type: "copy.create", location }));
  const copyLocations = book.copies.map((copy) => ({ id: copy.location.id, archived: copy.location.archived }));
  const canEditBook = can({ type: "book.update", copyLocations });

  return (
    <article className="pb-4 pt-2">
      <Link to="/" className="-ml-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Catalogo
      </Link>

      <header className="mt-2 flex gap-4">
        <BookCover bookId={book.id} title={book.title} coverKey={book.coverKey} size="lg" />
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
            <div className="flex gap-1.5">
              <dt>Genere</dt>
              <dd className="text-ink-soft">{book.genre ? genreLabel(book.genre) : "non indicato"}</dd>
            </div>
            {book.isbn13 && (
              <div className="flex gap-1.5">
                <dt>ISBN</dt>
                <dd className="font-mono text-ink-soft">{formatIsbn13(book.isbn13)}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <Section title="La tua lettura">
        <ReadingStatusControl bookId={book.id} userId={me.id} status={statusOf(hasRead, isReading)} rating={myReading?.rating ?? null} onChanged={reload} />
      </Section>

      <Section title="In famiglia">
        <FamilyReadings readings={book.readings} currentReaders={book.currentReaders} ratingAverage={book.ratingAverage} ratingCount={book.ratingCount} meId={me.id} />
      </Section>

      {canEditBook && !isEditing && (
        <div className="mt-4">
          <Button ref={editButton} variant="ghost" className="-ml-2" onClick={() => { setIsEditing(true); setSaved(false); }}>
            Modifica dati
          </Button>
        </div>
      )}
      {saved && (
        <div className="mt-3">
          <Notice tone="success">Dati del libro aggiornati.</Notice>
        </div>
      )}
      {isEditing && (
        <EditBookForm
          book={book}
          onDone={(didSave) => {
            shouldRefocusEdit.current = true;
            setIsEditing(false);
            setSaved(didSave);
            if (didSave) reload();
          }}
        />
      )}

      {book.description && (
        <Section title="Descrizione">
          <p className="whitespace-pre-line rounded-[var(--radius-lg)] bg-surface px-4 py-3.5 text-[15px] leading-relaxed shadow-[var(--shadow-card)]">{book.description}</p>
        </Section>
      )}

      <Section title={copyCount === 1 ? "1 copia" : `${copyCount} copie`}>
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
          {book.copies.map((copy) => {
            const from = { id: copy.location.id, archived: copy.location.archived };
            return (
              <CopyRow
                key={copy.id}
                copy={copy}
                canEdit={can({ type: "copy.update", location: from })}
                canDelete={can({ type: "copy.delete", location: from, isLastCopy: copyCount <= 1 })}
                isLastCopy={copyCount <= 1}
                moveTargets={refs.filter((to) => can({ type: "copy.move", from, to }))}
                onChanged={reload}
              />
            );
          })}
        </ul>
        {addable.length > 0 && <AddCopyForm bookId={book.id} locations={addable} onAdded={reload} />}
      </Section>

      <Section title="Spostamenti">
        {book.movements.length === 0 ? (
          <p className="px-1 text-[15px] text-ink-faint">Nessuno spostamento registrato.</p>
        ) : (
          <ol className="space-y-2 px-1 text-[14px]">
            {book.movements.map((movement) => (
              <li key={movement.id}>
                <span className="font-medium">{movement.from}</span> → <span className="font-medium">{movement.to}</span>
                <span className="text-ink-faint">
                  {" "}
                  · {movement.movedBy ?? "utente rimosso"}, {dateFormat.format(new Date(movement.movedAt))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <p className="mt-8 px-1 text-[12px] text-ink-faint">
        Aggiunto il {dateFormat.format(new Date(book.createdAt))}
        {book.createdBy && ` da ${book.createdBy}`} · dati da {SOURCE_LABELS[book.source]}
      </p>
    </article>
  );
}

