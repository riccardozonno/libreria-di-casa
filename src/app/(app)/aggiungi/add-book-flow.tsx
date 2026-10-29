"use client";

import { useCallback, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button, Notice, TextField, buttonClasses } from "@/components/ui";
import { normalizeIsbn } from "@/lib/isbn";
import { AddCopyForm } from "../libri/[id]/add-copy-form";
import { lookupIsbnAction, type LookupOutcome } from "./actions";
import { BookForm, type BookFormInitial } from "./book-form";

type Location = { id: string; name: string };
type ExistingBook = Extract<LookupOutcome, { status: "exists" }>["book"];

type Step =
  | { kind: "start" }
  | { kind: "form"; initial: BookFormInitial; notice?: string }
  | { kind: "exists"; book: ExistingBook };

const EMPTY_BOOK: BookFormInitial = {
  isbn13: "",
  title: "",
  authors: [],
  publishedYear: null,
  description: null,
  coverUrl: null,
  coverPreview: null,
  source: "MANUAL",
};

export function AddBookFlow({ locations }: { locations: Location[] }) {
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const [isLooking, startLookup] = useTransition();

  const lookup = useCallback((isbn13: string) => {
    setIsScanning(false);
    setError("");
    startLookup(async () => {
      let result: Awaited<ReturnType<typeof lookupIsbnAction>>;
      try {
        result = await lookupIsbnAction(isbn13);
      } catch {
        // Rete assente o pagina aperta prima di un aggiornamento dell'app (azione server non più valida).
        return setError(`Ricerca non riuscita per l'ISBN ${isbn13}. Controlla la connessione e ricarica la pagina.`);
      }
      if (!result.ok) return setError(result.error);
      const outcome = result.data;
      if (outcome.status === "exists") return setStep({ kind: "exists", book: outcome.book });
      if (outcome.status === "not-found") {
        return setStep({
          kind: "form",
          initial: { ...EMPTY_BOOK, isbn13: outcome.isbn13 },
          notice: `Non ho trovato l'ISBN ${outcome.isbn13} su Google Books né su Open Library: inserisci i dati a mano.`,
        });
      }
      const { candidate, coverPreview } = outcome;
      setStep({ kind: "form", initial: { ...candidate, coverPreview, source: candidate.source } });
    });
  }, []);

  function handleManualIsbn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get("isbn") ?? "");
    const isbn = normalizeIsbn(raw);
    if (!isbn) return setError("ISBN non valido: controlla le cifre (10 o 13).");
    lookup(isbn);
  }

  const restart = () => {
    setStep({ kind: "start" });
    setError("");
  };

  if (step.kind === "form") {
    return (
      <div className="flex flex-col gap-4">
        {step.notice && <Notice>{step.notice}</Notice>}
        <BookForm initial={step.initial} locations={locations} onCancel={restart} onExisting={lookup} />
      </div>
    );
  }

  if (step.kind === "exists") {
    return (
      <div className="flex flex-col gap-4">
        <Notice>Questo libro è già in catalogo.</Notice>
        <div className="rounded-[var(--radius-lg)] bg-surface px-4 py-3.5 shadow-[var(--shadow-card)]">
          <p className="font-serif text-[19px] font-semibold">{step.book.title}</p>
          <p className="text-[14px] text-ink-soft">{step.book.authors.join(", ")}</p>
          <p className="mt-1 text-[14px] text-ink-faint">Copie in: {step.book.locations.join(", ")}</p>
          <AddCopyForm bookId={step.book.id} locations={locations} />
        </div>
        <div className="flex gap-2">
          <Link href={`/libri/${step.book.id}`} className={buttonClasses("secondary", "flex-1")}>
            Apri la scheda
          </Link>
          <Button variant="secondary" className="flex-1" onClick={restart}>
            Un altro libro
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Notice tone="error">{error}</Notice>}
      {isScanning ? (
        <>
          <BarcodeScanner onDetected={lookup} />
          <Button variant="secondary" onClick={() => setIsScanning(false)}>
            Chiudi la fotocamera
          </Button>
        </>
      ) : (
        <Button className="min-h-14 text-[17px]" onClick={() => setIsScanning(true)} disabled={isLooking}>
          {isLooking ? "Cerco il libro…" : "Scansiona il codice a barre"}
        </Button>
      )}

      <form onSubmit={handleManualIsbn} className="flex items-end gap-2" noValidate>
        <TextField label="Oppure scrivi l'ISBN" name="isbn" inputMode="numeric" autoComplete="off" placeholder="978…" className="flex-1" />
        <Button type="submit" variant="secondary" disabled={isLooking}>
          Cerca
        </Button>
      </form>

      <Button variant="ghost" onClick={() => setStep({ kind: "form", initial: EMPTY_BOOK })}>
        Libro senza ISBN: inserisci a mano
      </Button>
    </div>
  );
}
