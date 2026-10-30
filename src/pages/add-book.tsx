import { type FormEvent, useCallback, useState } from "react";
import { Link } from "react-router";
import { normalizeIsbn } from "../../shared/isbn";
import { BarcodeScanner } from "../components/barcode-scanner";
import { Button, buttonClasses, Notice, PageHeader, TextField } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useLocations } from "../lib/locations";
import { useSession } from "../lib/session";
import { AddCopyForm } from "./book/add-copy-form";
import { BookForm, type BookFormInitial } from "./add/book-form";

// Aggiunta di un libro: scanner o ISBN → ricerca (Google Books → Open Library) → modulo, oppure a mano.

interface LookupResult {
  found: boolean;
  candidate?: Omit<BookFormInitial, "isbn13" | "source"> & { isbn13: string; source: "GOOGLE_BOOKS" | "OPEN_LIBRARY" };
  existingBookId: string | null;
}

type Step = { kind: "start" } | { kind: "form"; initial: BookFormInitial; notice?: string; retryIsbn?: string } | { kind: "exists"; bookId: string };

const EMPTY_BOOK: BookFormInitial = { isbn13: "", title: "", authors: [], publishedYear: null, description: null, coverUrl: null, source: "MANUAL" };

export function AddBookPage() {
  const { can } = useSession();
  const { locations } = useLocations();
  const addable = locations.filter((location) => can({ type: "copy.create", location: { id: location.id, archived: location.archived } }));
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [isScanning, setIsScanning] = useState(false);
  const [isLooking, setIsLooking] = useState(false);
  const [error, setError] = useState("");

  const lookup = useCallback(async (isbn13: string) => {
    setIsScanning(false);
    setError("");
    setIsLooking(true);
    try {
      const result = await api<LookupResult>(`/isbn/${isbn13}`);
      if (result.existingBookId) return setStep({ kind: "exists", bookId: result.existingBookId });
      if (!result.found || !result.candidate) {
        return setStep({
          kind: "form",
          initial: { ...EMPTY_BOOK, isbn13 },
          notice: `Non ho trovato l'ISBN ${isbn13} su Google Books né su Open Library. Google a volte non risponde al primo colpo: puoi cercare di nuovo oppure inserire i dati a mano.`,
          retryIsbn: isbn13,
        });
      }
      setStep({ kind: "form", initial: { ...result.candidate } });
    } catch (caught) {
      setError(`Ricerca non riuscita per l'ISBN ${isbn13}: ${errorMessage(caught)}`);
    } finally {
      setIsLooking(false);
    }
  }, []);

  function handleManualIsbn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isbn = normalizeIsbn(String(new FormData(event.currentTarget).get("isbn") ?? ""));
    if (!isbn) return setError("ISBN non valido: controlla le cifre (10 o 13).");
    void lookup(isbn);
  }

  const restart = () => {
    setStep({ kind: "start" });
    setError("");
  };

  if (addable.length === 0) {
    return (
      <>
        <PageHeader title="Aggiungi" />
        <Notice>Non sei editor di nessuna sede attiva: chiedi all&apos;amministratore di assegnartene una.</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Aggiungi" subtitle="Scansiona il codice a barre sul retro del libro" />
      {step.kind === "form" && (
        <div className="flex flex-col gap-4">
          {step.notice && <Notice>{step.notice}</Notice>}
          {step.retryIsbn && (
            <Button variant="secondary" onClick={() => void lookup(step.retryIsbn ?? "")} disabled={isLooking}>
              {isLooking ? "Cerco il libro…" : "Cerca di nuovo"}
            </Button>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <BookForm key={step.initial.isbn13 + step.initial.source} initial={step.initial} locations={addable} onCancel={restart} onExisting={(isbn) => void lookup(isbn)} />
        </div>
      )}

      {step.kind === "exists" && (
        <div className="flex flex-col gap-4">
          <Notice>Questo libro è già in catalogo: puoi aggiungerne una copia.</Notice>
          <AddCopyForm bookId={step.bookId} locations={addable} onAdded={() => undefined} />
          <div className="flex gap-2">
            <Link to={`/libri/${step.bookId}`} className={buttonClasses("secondary", "flex-1")}>
              Apri la scheda
            </Link>
            <Button variant="secondary" className="flex-1" onClick={restart}>
              Un altro libro
            </Button>
          </div>
        </div>
      )}

      {step.kind === "start" && (
        <div className="flex flex-col gap-5">
          {error && <Notice tone="error">{error}</Notice>}
          {isScanning ? (
            <>
              <BarcodeScanner onDetected={(isbn) => void lookup(isbn)} />
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
      )}
    </>
  );
}
