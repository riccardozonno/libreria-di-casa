"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice, TextArea, TextField } from "@/components/ui";
import { initialActionState } from "@/lib/action-state";
import { deleteCopyAction, updateCopyAction } from "./actions";

interface CopyRowProps {
  copy: { id: string; shelf: string | null; notes: string | null };
  location: ReactNode;
  canEdit: boolean;
  canDelete: boolean;
  isLastCopy: boolean;
}

export function CopyRow({ copy, location, canEdit, canDelete, isLastCopy }: CopyRowProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction, isUpdating] = useActionState(updateCopyAction, initialActionState);
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteCopyAction, initialActionState);

  // Dopo l'eliminazione dell'ultima copia il libro non esiste più: si torna al catalogo.
  useEffect(() => {
    if (deleteState.ok && deleteState.data.bookDeleted) router.replace("/");
  }, [deleteState, router]);

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
        {canEdit && !isEditing && (
          <Button variant="ghost" className="shrink-0" onClick={() => setIsEditing(true)}>
            Modifica
          </Button>
        )}
      </div>

      {isEditing && (
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
