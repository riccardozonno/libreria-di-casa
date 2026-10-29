"use client";

import { useActionState, useState } from "react";
import { Button, Notice, TextField } from "@/components/ui";
import { initialActionState } from "@/lib/action-state";
import { LocationSelect } from "@/components/location-select";
import { addCopyAction } from "./actions";

export function AddCopyForm({ bookId, locations }: { bookId: string; locations: { id: string; name: string }[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, action, isPending] = useActionState(addCopyAction, initialActionState);

  if (!isOpen) {
    return (
      <div className="mt-3">
        {state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
        <Button variant="secondary" className="mt-2 w-full" onClick={() => setIsOpen(true)}>
          + Aggiungi una copia
        </Button>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        setIsOpen(false);
      }}
      className="mt-3 flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]"
    >
      <input type="hidden" name="bookId" value={bookId} />
      <LocationSelect locations={locations} />
      <TextField label="Collocazione (facoltativa)" name="shelf" maxLength={120} placeholder="Es. Camera, comodino" />
      <TextField label="Note (facoltative)" name="notes" maxLength={1000} />
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
