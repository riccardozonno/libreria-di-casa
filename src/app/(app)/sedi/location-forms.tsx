"use client";

import { useActionState, useState } from "react";
import { Button, Notice, TextField } from "@/components/ui";
import { initialActionState } from "@/lib/action-state";
import { createLocationAction, renameLocationAction, setArchivedAction } from "./actions";

export function CreateLocationForm() {
  const [state, action, isPending] = useActionState(createLocationAction, initialActionState);
  return (
    <form action={action} className="mt-6 flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
      <TextField label="Nuova sede" name="name" maxLength={60} required placeholder="Es. Casa al mare" />
      {!state.ok && state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" disabled={isPending}>
        Crea sede
      </Button>
    </form>
  );
}

export function LocationAdminControls({ location }: { location: { id: string; name: string; archived: boolean } }) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameState, renameAction, isRenamingPending] = useActionState(renameLocationAction, initialActionState);
  const [archiveState, archiveAction, isArchiving] = useActionState(setArchivedAction, initialActionState);
  const error = (!renameState.ok && renameState.error) || (!archiveState.ok && archiveState.error);

  return (
    <div className="mt-3 flex flex-col gap-3 pl-5">
      {isRenaming ? (
        <form
          action={async (formData) => {
            await renameAction(formData);
            setIsRenaming(false);
          }}
          className="flex items-end gap-2"
        >
          <input type="hidden" name="id" value={location.id} />
          <TextField label="Nuovo nome" name="name" defaultValue={location.name} maxLength={60} required className="flex-1" />
          <Button type="submit" disabled={isRenamingPending}>
            Salva
          </Button>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setIsRenaming(true)}>
            Rinomina
          </Button>
          <form action={archiveAction}>
            <input type="hidden" name="id" value={location.id} />
            <input type="hidden" name="archived" value={location.archived ? "false" : "true"} />
            <Button type="submit" variant="secondary" disabled={isArchiving}>
              {location.archived ? "Riattiva" : "Archivia"}
            </Button>
          </form>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
