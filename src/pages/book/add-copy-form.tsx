import { useActionState, useState } from "react";
import { LocationSelect } from "../../components/location-select";
import { Button, Notice, TextField } from "../../components/ui";
import { send } from "../../lib/api";
import { type ActionState, failure, initialActionState, text } from "../../lib/action-state";

export function AddCopyForm({ bookId, locations, onAdded }: { bookId: string; locations: { id: string; name: string }[]; onAdded: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, action, isPending] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    try {
      await send(`/books/${bookId}/copies`, "POST", { locationId: text(form, "locationId"), copy: { shelf: text(form, "shelf"), notes: "" } });
      setIsOpen(false);
      onAdded();
      return { ok: true, message: "Copia aggiunta." };
    } catch (error) {
      return failure(error);
    }
  }, initialActionState);

  if (!isOpen) {
    return (
      <div className="mt-3 space-y-3">
        {state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Aggiungi una copia
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="mt-3 flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface px-4 py-4 shadow-[var(--shadow-card)]">
      <LocationSelect locations={locations} legend="Sede della nuova copia" />
      <TextField label="Collocazione (facoltativa)" name="shelf" maxLength={120} placeholder="Es. Salotto, libreria bianca" />
      {!state.ok && state.error && <Notice tone="error">{state.error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          Aggiungi
        </Button>
        <Button variant="secondary" onClick={() => setIsOpen(false)}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
