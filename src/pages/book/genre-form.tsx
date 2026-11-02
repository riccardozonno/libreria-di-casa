import { useState } from "react";
import type { GenreKey } from "../../../shared/genres";
import { GenreOptions } from "../../components/genre-options";
import { Button, Notice, SelectField } from "../../components/ui";
import { errorMessage, send } from "../../lib/api";

// Cambio del genere dalla scheda (admin ed editor delle sedi con una copia).

export function GenreForm({ bookId, genre, onDone }: { bookId: string; genre: GenreKey | null; onDone: (didSave: boolean) => void }) {
  const [value, setValue] = useState(genre ?? "");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setIsBusy(true);
    setError("");
    try {
      await send(`/books/${bookId}/genre`, "PUT", { genre: value || null });
      onDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
      setIsBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-card)]">
      {/* Il focus va sul menu appena il modulo si apre (tastiera e VoiceOver non ripartono dall'inizio). */}
      <SelectField label="Genere" name="genre" value={value} onChange={(event) => setValue(event.target.value)} autoFocus>
        <option value="">Nessun genere</option>
        <GenreOptions />
      </SelectField>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void save()} disabled={isBusy || value === (genre ?? "")}>
          {isBusy ? "Salvataggio…" : "Salva il genere"}
        </Button>
        <Button variant="secondary" onClick={() => onDone(false)} disabled={isBusy}>
          Annulla
        </Button>
      </div>
    </div>
  );
}
