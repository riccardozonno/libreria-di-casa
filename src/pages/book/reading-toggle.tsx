import { useState } from "react";
import { Button, Notice } from "../../components/ui";
import { errorMessage, send } from "../../lib/api";

export function ReadingToggle({ bookId, userId, hasRead, onChanged }: { bookId: string; userId: string; hasRead: boolean; onChanged: () => void }) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setIsBusy(true);
    setError("");
    try {
      await send(`/books/${bookId}/readings/${userId}`, hasRead ? "DELETE" : "PUT");
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant={hasRead ? "secondary" : "primary"} aria-pressed={hasRead} onClick={() => void toggle()} disabled={isBusy}>
        {hasRead ? "✓ L'ho letto" : "Segna come letto"}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
