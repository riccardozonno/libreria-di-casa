"use client";

import { useActionState, useState, type ReactNode } from "react";
import { LocationSelect } from "@/components/location-select";
import { Button, Notice, TextArea, TextField } from "@/components/ui";
import { initialActionState, type ActionResult } from "@/lib/action-state";
import { deleteCopyAction, moveCopyAction, updateCopyAction } from "./actions";

interface CopyRowProps {
  copy: { id: string; shelf: string | null; notes: string | null };
  location: ReactNode;
  canEdit: boolean;
  canDelete: boolean;
  isLastCopy: boolean;
  /** Sedi verso cui l'utente può spostare questa copia (vuoto: nessun permesso). */
  moveTargets: { id: string; name: string }[];
}

export function CopyRow({ copy, location, canEdit, canDelete, isLastCopy, moveTargets }: CopyRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction, isUpdating] = useActionState(updateCopyAction, initialActionState);
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteCopyAction, initialActionState);
  const [moveState, moveAction, isMoving] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const result = await moveCopyAction(previous, formData);
    if (result.ok) setIsEditing(false);
    return result;
  }, initialActionState);
  const canMove = moveTargets.length > 0;


  const confirmMessage = isLastCopy
    ? "È l'ultima copia: verrà eliminato anche il libro con le sue letture. Continuare?"
    : "Eliminare questa copia?";

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          {location}
          {copy.shelf && <p className="text-[15px]">{copy.shelf}</p>}
          {copy.notes && <p className="whitespace-pre-line text-[14px] text-ink-soft">{copy.notes}</p>}
          {!copy.shelf && !copy.notes && <p className="text-[14px] text-ink-faint">Nessuna collocazione o nota.</p>}
        </div>
        {(canEdit || canMove) && !isEditing && (
          <Button variant="ghost" className="shrink-0" onClick={() => setIsEditing(true)}>
            Modifica
          </Button>
        )}
      </div>

      {isEditing && canEdit && (
        <form
          action={async (formData) => {
            await updateAction(formData);
            setIsEditing(false);
          }}
          className="mt-3 flex flex-col gap-3"
        >
          <input type="hidden" name="copyId" value={copy.id} />
          <TextField label="Collocazione" name="shelf" defaultValue={copy.shelf ?? ""} maxLength={120} placeholder="Es. Studio, scaffale 2" />
          <TextArea label="Note" name="notes" defaultValue={copy.notes ?? ""} maxLength={1000} />
          <div className="flex gap-2">
            <Button type="submit" disabled={isUpdating}>
              Salva
            </Button>
            <Button variant="secondary" onClick={() => setIsEditing(false)}>
              Annulla
            </Button>
          </div>
        </form>
      )}

      {isEditing && canMove && (
        <form action={moveAction} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <input type="hidden" name="copyId" value={copy.id} />
          <LocationSelect locations={moveTargets} legend="Sposta in un'altra sede" defaultValue="" />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={isMoving}>
              {isMoving ? "Spostamento…" : "Sposta"}
            </Button>
            {!canEdit && (
              <Button variant="ghost" onClick={() => setIsEditing(false)}>
                Annulla
              </Button>
            )}
          </div>
        </form>
      )}
      {!moveState.ok && moveState.error && <div className="mt-3"><Notice tone="error">{moveState.error}</Notice></div>}
      {moveState.ok && moveState.message && !isEditing && <div className="mt-3"><Notice tone="success">{moveState.message}</Notice></div>}

      {!updateState.ok && updateState.error && <div className="mt-3"><Notice tone="error">{updateState.error}</Notice></div>}
      {!deleteState.ok && deleteState.error && <div className="mt-3"><Notice tone="error">{deleteState.error}</Notice></div>}

      {canDelete && isEditing && (
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!window.confirm(confirmMessage)) event.preventDefault();
          }}
          className="mt-3"
        >
          <input type="hidden" name="copyId" value={copy.id} />
          <Button type="submit" variant="danger" disabled={isDeleting}>
            {isLastCopy ? "Elimina libro" : "Elimina copia"}
          </Button>
        </form>
      )}
      {!canDelete && isEditing && isLastCopy && (
        <p className="mt-3 text-[13px] text-ink-faint">È l&apos;ultima copia: solo l&apos;amministratore può eliminare il libro.</p>
      )}
    </li>
  );
}
