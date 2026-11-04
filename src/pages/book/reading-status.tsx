import { useEffect, useId, useRef, useState } from "react";
import { Button, Notice } from "../../components/ui";
import { errorMessage, send } from "../../lib/api";
import { type ReadingStatus, transition } from "./reading-status-logic";
import { StarRating } from "./star-rating";

// Il tuo stato di lettura in un solo controllo: «Da leggere · Sto leggendo · Letto». Su «Letto» compare il
// tuo voto. Togliere «letto» cancella il voto: prima una conferma in linea. Durante l'invio aria-disabled
// (non disabled: un pulsante disattivato perde il focus).

const OPTIONS: ReadonlyArray<{ status: ReadingStatus; label: string }> = [
  { status: "TO_READ", label: "Da leggere" },
  { status: "READING", label: "Sto leggendo" },
  { status: "READ", label: "Letto" },
];

interface Props {
  bookId: string;
  userId: string;
  status: ReadingStatus;
  rating: number | null;
  /** Vero finché il dettaglio ricaricato non è arrivato: i controlli restano bloccati (niente tocchi su uno stato vecchio). */
  isRefreshing: boolean;
  onChanged: () => void;
}

export function ReadingStatusControl({ bookId, userId, status, rating, isRefreshing, onChanged }: Props) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [requested, setPending] = useState<ReadingStatus | null>(null);
  // La conferma vale solo finché il libro risulta «Letto» (lo stato può cambiare da un altro dispositivo).
  const pending = status === "READ" ? requested : null;
  const questionId = useId();
  const isLocked = isBusy || isRefreshing;
  const sending = useRef(false);
  const buttons = useRef(new Map<ReadingStatus, HTMLButtonElement>());
  const cancelButton = useRef<HTMLButtonElement>(null);
  // Chiusa la conferma, il focus torna sul pulsante toccato.
  const focusAfterConfirm = useRef<ReadingStatus | null>(null);

  useEffect(() => {
    if (pending) {
      cancelButton.current?.focus();
      return;
    }
    if (!focusAfterConfirm.current) return;
    buttons.current.get(focusAfterConfirm.current)?.focus();
    focusAfterConfirm.current = null;
  }, [pending]);

  async function run(to: ReadingStatus) {
    if (sending.current) return;
    sending.current = true;
    setIsBusy(true);
    setError("");
    const calls = transition(bookId, userId, status, to).calls;
    let done = 0;
    try {
      for (const call of calls) {
        await send(call.path, call.method);
        done += 1;
      }
    } catch (caught) {
      // «Letto → Sto leggendo» a metà: «letto» è già stato tolto, va detto chiaramente.
      setError(done > 0 ? "Tolto «letto», ma non è stato possibile segnarlo come «Sto leggendo». Riprova." : errorMessage(caught));
    } finally {
      // Anche dopo un errore (es. «Letto → Sto leggendo» a metà): si ricarica lo stato reale.
      onChanged();
      sending.current = false;
      setIsBusy(false);
    }
  }

  function choose(to: ReadingStatus) {
    if (sending.current || isRefreshing || to === status) return;
    if (transition(bookId, userId, status, to).needsConfirm) {
      setPending(to);
      return;
    }
    void run(to);
  }

  function closeConfirm(confirmed: boolean) {
    const to = pending;
    focusAfterConfirm.current = to;
    setPending(null);
    if (confirmed && to) void run(to);
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Il tuo stato" className="grid grid-cols-3 gap-1 rounded-[var(--radius-md)] border border-line bg-surface p-1 shadow-[var(--shadow-card)]">
        {OPTIONS.map((option) => (
          <button
            key={option.status}
            ref={(element) => {
              if (element) buttons.current.set(option.status, element);
              else buttons.current.delete(option.status);
            }}
            type="button"
            aria-pressed={option.status === status}
            aria-disabled={isLocked}
            onClick={() => choose(option.status)}
            className="min-h-11 rounded-[calc(var(--radius-md)-4px)] px-1.5 text-[14px] font-semibold leading-tight text-ink-soft aria-disabled:opacity-60 aria-pressed:bg-accent aria-pressed:text-accent-ink"
          >
            {option.label}
          </button>
        ))}
      </div>

      {pending && (
        <div role="group" aria-labelledby={questionId} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
          <p id={questionId} className="text-[15px] font-medium text-ink">
            Togliere «letto»? Il tuo voto si perde.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => closeConfirm(true)}>
              Togli «letto»
            </Button>
            <Button ref={cancelButton} variant="secondary" onClick={() => closeConfirm(false)}>
              Annulla
            </Button>
          </div>
        </div>
      )}

      {status === "READ" && !pending && <StarRating bookId={bookId} userId={userId} rating={rating} isRefreshing={isRefreshing} onChanged={onChanged} />}
      {/* Sempre presente: i lettori di schermo annunciano il nuovo stato quando arriva. */}
      <p role="status" className="sr-only">
        {`Il tuo stato: ${OPTIONS.find((option) => option.status === status)?.label ?? ""}`}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
