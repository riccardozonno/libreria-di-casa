import { useState } from "react";
import { Button, Notice } from "../../components/ui";
import { errorMessage, send } from "../../lib/api";

// «Sto leggendo»: si mostra solo se non hai già letto il libro; «Segna come letto» lo toglie da solo.

export function CurrentReadingToggle({ bookId, userId, isReading, onChanged }: { bookId: string; userId: string; isReading: boolean; onChanged: () => void }) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      await send(`/books/${bookId}/current-readers/${userId}`, isReading ? "DELETE" : "PUT");
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" aria-pressed={isReading} onClick={() => void toggle()} aria-disabled={isBusy} className="aria-disabled:opacity-60">
        {isReading ? "📖 Lo sto leggendo" : "Sto leggendo"}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
