import { useActionState, useState } from "react";
import { Link } from "react-router";
import type { Role } from "../../shared/policy";
import { Button, Notice, PageHeader, TextField } from "../components/ui";
import { send } from "../lib/api";
import { type ActionState, failure, initialActionState, text } from "../lib/action-state";
import { useLocations } from "../lib/locations";
import { useSession } from "../lib/session";
import { useApi } from "../lib/use-api";

// Utenti (solo admin): chi può entrare, con quale ruolo e su quali sedi. L'accesso avviene con
// Cloudflare Access: l'app tiene allineato il gruppo con le email degli utenti attivi.

interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  locationIds: string[];
}

type AccessSync = "ok" | "failed" | "not-configured";
type Location = { id: string; name: string };

const ROLE_LABELS: Record<Role, string> = { ADMIN: "Amministratore", EDITOR: "Editor", READER: "Lettore" };

function syncNotice(sync: AccessSync | undefined, email: string): ActionState {
  if (sync === "ok") return { ok: true, message: `Fatto. La lista di Cloudflare Access è aggiornata (${email}).` };
  if (sync === "failed") return { ok: true, message: `Salvato, ma non sono riuscito ad aggiornare Cloudflare Access: aggiungi o togli ${email} a mano nel gruppo "Utenti HOME LIBRARY".` };
  if (sync === "not-configured") return { ok: true, message: `Salvato. La sincronizzazione con Cloudflare Access non è ancora configurata: aggiorna a mano la regola per ${email}.` };
  return { ok: true, message: "Salvato." };
}

function roleAndLocations(form: FormData) {
  return { name: text(form, "name"), role: text(form, "role"), locationIds: form.getAll("locationIds").map(String) };
}

function RoleAndLocations({ defaultRole, defaultLocations, locations, idPrefix }: { defaultRole: Role; defaultLocations: string[]; locations: Location[]; idPrefix: string }) {
  const [role, setRole] = useState(defaultRole);
  return (
    <>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[13px] font-semibold text-ink-soft">Ruolo</legend>
        {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
          <label key={value} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="h-5 w-5 accent-[var(--accent)]" />
            {ROLE_LABELS[value]}
          </label>
        ))}
      </fieldset>
      {role === "EDITOR" && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[13px] font-semibold text-ink-soft">Sedi che può modificare</legend>
          {locations.length === 0 && <p className="text-[14px] text-ink-faint">Nessuna sede attiva.</p>}
          {locations.map((location) => (
            <label key={location.id} htmlFor={`${idPrefix}-${location.id}`} className="flex min-h-11 items-center gap-3 text-[15px]">
              <input id={`${idPrefix}-${location.id}`} type="checkbox" name="locationIds" value={location.id} defaultChecked={defaultLocations.includes(location.id)} className="h-5 w-5 accent-[var(--accent)]" />
              {location.name}
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

function CreateUserForm({ locations, onCreated }: { locations: Location[]; onCreated: () => void }) {
  const [round, setRound] = useState(0);
  const [state, action, isPending] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    const email = text(form, "email");
    try {
      const result = await send<{ accessSync: AccessSync }>("/users", "POST", { ...roleAndLocations(form), email });
      setRound((current) => current + 1);
      onCreated();
      return syncNotice(result.accessSync, email.trim().toLowerCase());
    } catch (error) {
      return failure(error);
    }
  }, initialActionState);
  return (
    <form key={round} action={action} className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
      <TextField label="Nome" name="name" maxLength={100} required autoComplete="off" error={state.fields?.name} />
      <TextField label="Email (la stessa con cui riceverà il codice)" name="email" type="email" maxLength={200} required autoComplete="off" error={state.fields?.email} />
      <RoleAndLocations defaultRole="READER" defaultLocations={[]} locations={locations} idPrefix={`nuovo-${round}`} />
      {!state.ok && state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creazione…" : "Aggiungi utente"}
      </Button>
    </form>
  );
}

function UserRow({ user, isSelf, locations, locationNames, onChanged }: { user: UserSummary; isSelf: boolean; locations: Location[]; locationNames: Record<string, string>; onChanged: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const run = (work: () => Promise<ActionState>) => async (): Promise<ActionState> => {
    try {
      const result = await work();
      onChanged();
      return result;
    } catch (error) {
      return failure(error);
    }
  };
  const [updateState, updateAction, isUpdating] = useActionState(async (_previous: ActionState, form: FormData) => {
    const result = await run(async () => {
      await send(`/users/${user.id}`, "PATCH", roleAndLocations(form));
      return { ok: true, message: "Utente aggiornato." };
    })();
    if (result.ok) setIsOpen(false);
    return result;
  }, initialActionState);
  const [activeState, activeAction, isToggling] = useActionState(
    run(async () => {
      const result = await send<{ accessSync: AccessSync }>(`/users/${user.id}/${user.active ? "deactivate" : "reactivate"}`, "POST");
      return syncNotice(result.accessSync, user.email);
    }),
    initialActionState,
  );
  const [signOutState, signOutAction, isSigningOut] = useActionState(
    run(async () => {
      await send(`/users/${user.id}/sign-out`, "POST");
      return { ok: true, message: `${user.name} dovrà inserire di nuovo email e codice su ogni dispositivo.` };
    }),
    initialActionState,
  );
  const states = [updateState, activeState, signOutState];
  const error = states.find((state) => !state.ok && state.error);
  const success = states.find((state) => state.ok && state.message);
  const editorOf = user.locationIds.map((id) => locationNames[id]).filter(Boolean).join(", ");

  return (
    <li className={`px-4 py-3.5 ${user.active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold [overflow-wrap:anywhere]">
            {user.name} {isSelf && <span className="text-[13px] font-medium text-ink-faint">(tu)</span>}
          </p>
          <p className="truncate text-[14px] text-ink-soft">{user.email}</p>
          <p className="mt-1 text-[13px] text-ink-faint">
            {ROLE_LABELS[user.role]}
            {user.role === "EDITOR" && ` · ${editorOf || "nessuna sede"}`}
            {!user.active && " · disattivato"}
          </p>
        </div>
        {!isOpen && (
          <Button variant="ghost" className="shrink-0" onClick={() => setIsOpen(true)} aria-label={`Gestisci ${user.name}`}>
            Gestisci
          </Button>
        )}
      </div>
      {isOpen && (
        <div className="mt-3 flex flex-col gap-4">
          <form action={updateAction} className="flex flex-col gap-4">
            <TextField label="Nome" name="name" defaultValue={user.name} maxLength={100} required error={updateState.fields?.name} />
            <RoleAndLocations defaultRole={user.role} defaultLocations={user.locationIds} locations={locations} idPrefix={`utente-${user.id}`} />
            <div className="flex gap-2">
              <Button type="submit" disabled={isUpdating}>
                Salva
              </Button>
              <Button variant="secondary" onClick={() => setIsOpen(false)}>
                Chiudi
              </Button>
            </div>
          </form>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <form action={signOutAction}>
              <Button type="submit" variant="secondary" disabled={isSigningOut}>
                Esci da tutti i dispositivi
              </Button>
            </form>
            {!isSelf && (
              <form action={activeAction}>
                <Button type="submit" variant={user.active ? "danger" : "secondary"} disabled={isToggling}>
                  {user.active ? "Disattiva" : "Riattiva"}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
      {error?.error && (
        <div className="mt-3">
          <Notice tone="error">{error.error}</Notice>
        </div>
      )}
      {success?.message && (
        <div className="mt-3">
          <Notice tone="success">{success.message}</Notice>
        </div>
      )}
    </li>
  );
}

export function UsersPage() {
  const { me } = useSession();
  const { locations } = useLocations();
  const { data: users, error, reload } = useApi<UserSummary[]>("/users");
  const active = locations.filter((location) => !location.archived).map(({ id, name }) => ({ id, name }));
  const locationNames = Object.fromEntries(locations.map((location) => [location.id, location.name]));

  return (
    <>
      <Link to="/admin" className="-ml-2 mt-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Admin
      </Link>
      <PageHeader title="Utenti" subtitle="Chi può entrare in HOME LIBRARY" />
      {error && <Notice tone="error">{error}</Notice>}
      {users && (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
          {users.map((user) => (
            <UserRow key={user.id} user={user} isSelf={user.id === me.id} locations={active} locationNames={locationNames} onChanged={reload} />
          ))}
        </ul>
      )}
      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Nuovo utente</h2>
      <CreateUserForm locations={active} onCreated={reload} />
    </>
  );
}
