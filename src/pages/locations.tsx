import { useActionState, useState } from "react";
import { Link } from "react-router";
import { type LocationColorKey, locationColorClass, locationColorLabel, nextFreeColor } from "../../shared/location-colors";
import { ColorPicker } from "../components/color-picker";
import { Button, Notice, PageHeader, TextField } from "../components/ui";
import { send } from "../lib/api";
import { type ActionState, failure, initialActionState, text } from "../lib/action-state";
import { type LocationSummary, useLocations } from "../lib/locations";
import { useSession } from "../lib/session";

// Sedi: tutti le vedono; solo l'admin crea, rinomina, cambia colore (unico) e archivia.

type UsedColors = Partial<Record<LocationColorKey, string>>;

function CreateLocationForm({ usedBy, suggestedColor, onCreated }: { usedBy: UsedColors; suggestedColor: LocationColorKey | null; onCreated: () => void }) {
  // La chiave cambia a ogni creazione: il modulo riparte vuoto con il nuovo colore suggerito.
  const [round, setRound] = useState(0);
  const [state, action, isPending] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    try {
      await send("/locations", "POST", { name: text(form, "name"), color: text(form, "color") });
      setRound((current) => current + 1);
      onCreated();
      return { ok: true, message: "Sede creata." };
    } catch (error) {
      return failure(error);
    }
  }, initialActionState);

  if (!suggestedColor) {
    return (
      <div className="mt-6">
        <Notice>Tutti i 10 colori sono già usati: per creare un&apos;altra sede cambia o libera prima un colore.</Notice>
      </div>
    );
  }
  return (
    // Si ricrea dopo ogni creazione (nome vuoto, nuovo colore suggerito). La pagina lo mostra solo
    // a sedi caricate: così non si ricrea mentre si scrive e non propone un colore già usato.
    <form key={round} action={action} className="mt-6 flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
      <TextField label="Nuova sede" name="name" maxLength={60} required placeholder="Es. Casa al mare" error={state.fields?.name} />
      <ColorPicker usedBy={usedBy} defaultValue={suggestedColor} idPrefix={`nuova-sede-${round}`} />
      {state.fields?.color && <Notice tone="error">{state.fields.color}</Notice>}
      {!state.ok && state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" disabled={isPending}>
        Crea sede
      </Button>
    </form>
  );
}

function LocationAdminControls({ location, usedBy, onChanged }: { location: LocationSummary; usedBy: UsedColors; onChanged: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction, isUpdating] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    try {
      await send(`/locations/${location.id}`, "PATCH", { name: text(form, "name"), color: text(form, "color") });
      setIsEditing(false);
      onChanged();
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }, initialActionState);
  const [archiveState, archiveAction, isArchiving] = useActionState(async (): Promise<ActionState> => {
    try {
      await send(`/locations/${location.id}/${location.archived ? "restore" : "archive"}`, "POST");
      onChanged();
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }, initialActionState);
  const error = (!updateState.ok && updateState.error) || (!archiveState.ok && archiveState.error);

  return (
    <div className="mt-3 flex flex-col gap-3 pl-5">
      {isEditing ? (
        <form action={updateAction} className="flex flex-col gap-4">
          <TextField label="Nome" name="name" defaultValue={location.name} maxLength={60} required error={updateState.fields?.name} />
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
          <Button variant="secondary" onClick={() => setIsEditing(true)} aria-label={`Modifica ${location.name}`}>
            Modifica
          </Button>
          <form action={archiveAction}>
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

export function LocationsPage() {
  const { can } = useSession();
  const { locations, loaded, reload } = useLocations();
  const canManage = can({ type: "location.manage" });
  const usedBy: UsedColors = Object.fromEntries(locations.map((location) => [location.color, location.name]));
  const suggestedColor = nextFreeColor(locations.map((location) => location.color));

  return (
    <>
      <Link to="/admin" className="-ml-2 mt-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Admin
      </Link>
      <PageHeader title="Sedi" subtitle={loaded ? `${locations.length} ${locations.length === 1 ? "sede" : "sedi"}` : undefined} />
      {!loaded ? (
        <p className="px-1 py-6 text-center text-ink-soft">Caricamento…</p>
      ) : locations.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-surface px-5 py-8 text-center text-[15px] text-ink-soft shadow-[var(--shadow-card)]">
          {canManage ? "Crea la prima sede, per esempio la casa in cui vivi." : "Non ci sono ancora sedi."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
          {locations.map((location) => (
            <li key={location.id} className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span role="img" aria-label={`Colore ${locationColorLabel(location.color)}`} className={`h-10 w-2.5 shrink-0 rounded-full ${locationColorClass(location.color)} ${location.archived ? "opacity-40" : ""}`} />
                <Link to={`/?sede=${location.id}`} className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold [overflow-wrap:anywhere]">
                    {location.name}
                    {location.archived && <span className="ml-2 text-[13px] font-medium text-ink-faint">archiviata</span>}
                  </p>
                  <p className="text-[14px] text-ink-faint">
                    {location.copyCount} {location.copyCount === 1 ? "copia" : "copie"}
                  </p>
                </Link>
              </div>
              {canManage && <LocationAdminControls location={location} usedBy={usedBy} onChanged={reload} />}
            </li>
          ))}
        </ul>
      )}
      {canManage && loaded && <CreateLocationForm usedBy={usedBy} suggestedColor={suggestedColor} onCreated={reload} />}
    </>
  );
}
