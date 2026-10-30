import { useActionState, useState } from "react";
import { useNavigate } from "react-router";
import type { LocationColorKey } from "../../../shared/location-colors";
import { LocationSelect } from "../../components/location-select";
import { Button, LocationTag, Notice, TextArea, TextField } from "../../components/ui";
import { send } from "../../lib/api";
import { type ActionState, failure, initialActionState, text } from "../../lib/action-state";

// Una copia nella scheda libro: collocazione e note, spostamento (regola B) ed eliminazione.

export interface CopyView {
  id: string;
  shelf: string | null;
  notes: string | null;
  location: { id: string; name: string; color: LocationColorKey; archived: boolean };
}

interface CopyRowProps {
  copy: CopyView;
  canEdit: boolean;
  canDelete: boolean;
  isLastCopy: boolean;
  /** Sedi verso cui l'utente può spostare questa copia (vuoto: nessun permesso). */
  moveTargets: { id: string; name: string }[];
  onChanged: () => void;
}

export function CopyRow({ copy, canEdit, canDelete, isLastCopy, moveTargets, onChanged }: CopyRowProps) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const canMove = moveTargets.length > 0;

  const [updateState, updateAction, isUpdating] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    try {
      await send(`/copies/${copy.id}`, "PATCH", { shelf: text(form, "shelf"), notes: text(form, "notes") });
      setIsEditing(false);
      onChanged();
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }, initialActionState);

  const [moveState, moveAction, isMoving] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    const toLocationId = text(form, "locationId");
    if (!toLocationId) return { ok: false, error: "Scegli la sede di destinazione." };
    try {
      await send(`/copies/${copy.id}/move`, "POST", { toLocationId });
      setIsEditing(false);
      onChanged();
      return { ok: true, message: "Copia spostata." };
    } catch (error) {
      return failure(error);
    }
  }, initialActionState);

  const [deleteState, deleteAction, isDeleting] = useActionState(async (): Promise<ActionState> => {
    const confirmMessage = isLastCopy ? "È l'ultima copia: verrà eliminato anche il libro con le sue letture. Continuare?" : "Eliminare questa copia?";
    if (!window.confirm(confirmMessage)) return initialActionState;
    try {
      const result = await send<{ bookDeleted: boolean }>(`/copies/${copy.id}`, "DELETE");
      if (result.bookDeleted) navigate("/", { replace: true, state: { deleted: true } });
      else onChanged();
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }, initialActionState);

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <LocationTag color={copy.location.color} name={`${copy.location.name}${copy.location.archived ? " (archiviata)" : ""}`} />
          {copy.shelf && <p className="text-[15px]">{copy.shelf}</p>}
          {copy.notes && <p className="whitespace-pre-line text-[14px] text-ink-soft">{copy.notes}</p>}
          {!copy.shelf && !copy.notes && <p className="text-[14px] text-ink-faint">Nessuna collocazione o nota.</p>}
        </div>
        {(canEdit || canMove || canDelete) && !isEditing && (
          <Button variant="ghost" className="shrink-0" onClick={() => setIsEditing(true)}>
            Modifica
          </Button>
        )}
      </div>

      {isEditing && canEdit && (
        <form action={updateAction} className="mt-3 flex flex-col gap-3">
          <TextField label="Collocazione" name="shelf" defaultValue={copy.shelf ?? ""} maxLength={120} placeholder="Es. Studio, scaffale 2" error={updateState.fields?.shelf} />
          <TextArea label="Note" name="notes" defaultValue={copy.notes ?? ""} maxLength={1000} error={updateState.fields?.notes} />
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

      {isEditing && canDelete && (
        <form action={deleteAction} className="mt-3">
          <Button type="submit" variant="danger" disabled={isDeleting}>
            {isLastCopy ? "Elimina libro" : "Elimina copia"}
          </Button>
        </form>
      )}
      {isEditing && !canDelete && isLastCopy && <p className="mt-3 text-[13px] text-ink-faint">È l&apos;ultima copia: solo l&apos;amministratore può eliminare il libro.</p>}

      {[updateState, moveState, deleteState].map((state, index) =>
        !state.ok && state.error ? (
          <div key={index} className="mt-3">
            <Notice tone="error">{state.error}</Notice>
          </div>
        ) : null,
      )}
      {moveState.ok && moveState.message && !isEditing && (
        <div className="mt-3">
          <Notice tone="success">{moveState.message}</Notice>
        </div>
      )}
    </li>
  );
}
