import { useEffect, useRef, useState } from "react";
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
  onChanged: () => void;
}

export function ReadingStatusControl({ bookId, userId, status, rating, onChanged }: Props) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<ReadingStatus | null>(null);
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
    try {
      for (const call of transition(bookId, userId, status, to).calls) await send(call.path, call.method);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      // Anche dopo un errore (es. «Letto → Sto leggendo» a metà): si ricarica lo stato reale.
      onChanged();
      sending.current = false;
      setIsBusy(false);
    }
  }

  function choose(to: ReadingStatus) {
    if (sending.current || to === status) return;
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
            aria-disabled={isBusy}
            onClick={() => choose(option.status)}
            className="min-h-11 rounded-[calc(var(--radius-md)-4px)] px-1.5 text-[14px] font-semibold leading-tight text-ink-soft aria-disabled:opacity-60 aria-pressed:bg-accent aria-pressed:text-accent-ink"
          >
            {option.label}
          </button>
        ))}
      </div>

      {pending && (
        <div role="group" aria-label="Conferma" className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
          <p className="text-[15px] font-medium text-ink">Togliere «letto»? Il tuo voto si perde.</p>
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

      {status === "READ" && !pending && <StarRating bookId={bookId} userId={userId} rating={rating} onChanged={onChanged} />}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
