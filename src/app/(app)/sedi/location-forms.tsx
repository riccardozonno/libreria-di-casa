"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ColorPicker } from "@/components/color-picker";
import { Button, Notice, TextField } from "@/components/ui";
import { initialActionState, type ActionResult } from "@/lib/action-state";
import type { LocationColorKey } from "@/lib/location-colors";
import { createLocationAction, setArchivedAction, updateLocationAction } from "./actions";

type UsedColors = Partial<Record<LocationColorKey, string>>;

export function CreateLocationForm({ usedBy, suggestedColor }: { usedBy: UsedColors; suggestedColor: LocationColorKey | null }) {
  const [state, action, isPending] = useActionState(createLocationAction, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);

  // Dopo una creazione riuscita il modulo si svuota (il colore suggerito si aggiorna dal server).
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  if (!suggestedColor) {
    return (
      <div className="mt-6">
        <Notice>Tutti i 10 colori sono già usati: per creare un&apos;altra sede cambia o libera prima un colore.</Notice>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="mt-6 flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
      <TextField label="Nuova sede" name="name" maxLength={60} required placeholder="Es. Casa al mare" />
      <ColorPicker key={suggestedColor} usedBy={usedBy} defaultValue={suggestedColor} idPrefix="nuova-sede" />
      {!state.ok && state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" disabled={isPending}>
        Crea sede
      </Button>
    </form>
  );
}

interface AdminControlsProps {
  location: { id: string; name: string; color: LocationColorKey; archived: boolean };
  usedBy: UsedColors;
}

export function LocationAdminControls({ location, usedBy }: AdminControlsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction, isUpdating] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const result = await updateLocationAction(previous, formData);
    if (result.ok) setIsEditing(false);
    return result;
  }, initialActionState);
  const [archiveState, archiveAction, isArchiving] = useActionState(setArchivedAction, initialActionState);
  const error = (!updateState.ok && updateState.error) || (!archiveState.ok && archiveState.error);

  return (
    <div className="mt-3 flex flex-col gap-3 pl-5">
      {isEditing ? (
        <form action={updateAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={location.id} />
          <TextField label="Nome" name="name" defaultValue={location.name} maxLength={60} required />
          <ColorPicker usedBy={usedBy} defaultValue={location.color} idPrefix={`sede-${location.id}`} />
          <div className="flex gap-2">
            <Button type="submit" disabled={isUpdating}>
              Salva
            </Button>
            <Button variant="secondary" onClick={() => setIsEditing(false)}>
              Annulla
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setIsEditing(true)}>
            Modifica
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
