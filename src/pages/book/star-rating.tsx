import { useRef, useState } from "react";
import { Notice } from "../../components/ui";
import { errorMessage, send } from "../../lib/api";

// Voto del lettore: 5 pulsanti grandi (44 px). Toccare la stella già scelta toglie il voto.
// Durante l'invio aria-disabled e non disabled: un pulsante disattivato perde il focus.

const STARS = [1, 2, 3, 4, 5] as const;

export function StarIcon({ filled, className = "" }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function starLabel(rating: number): string {
  return rating === 1 ? "1 stella" : `${rating} stelle`;
}

export function StarRating({ bookId, userId, rating, onChanged }: { bookId: string; userId: string; rating: number | null; onChanged: () => void }) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  // Blocca il doppio tocco prima che React aggiorni lo stato.
  const sending = useRef(false);

  async function choose(star: number) {
    if (sending.current) return;
    sending.current = true;
    setIsBusy(true);
    setError("");
    try {
      await send(`/books/${bookId}/readings/${userId}/rating`, "PUT", { rating: star === rating ? null : star });
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      sending.current = false;
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div role="group" aria-label="Il tuo voto" className="flex items-center">
        {STARS.map((star) => (
          <button
            key={star}
            type="button"
            aria-label={starLabel(star)}
            aria-pressed={star === rating}
            aria-disabled={isBusy}
            onClick={() => void choose(star)}
            className="-mx-0.5 flex size-11 items-center justify-center rounded-full text-star aria-disabled:opacity-60 active:scale-95"
          >
            <StarIcon filled={rating !== null && star <= rating} className="size-7" />
          </button>
        ))}
      </div>
      <p className="px-1 text-[14px] text-ink-soft" aria-live="polite">
        {rating === null ? "Tocca le stelle per votarlo." : `Il tuo voto: ${starLabel(rating)} su 5. Tocca di nuovo la stessa per toglierlo.`}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
