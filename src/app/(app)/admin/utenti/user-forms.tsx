"use client";

import { useActionState, useState } from "react";
import { Button, Notice, TextField } from "@/components/ui";
import { initialActionState, type ActionResult } from "@/lib/action-state";
import type { UserSummary } from "@/server/users/service";
import { accountLinkAction, createUserAction, resetTwoFactorAction, setUserActiveAction, updateUserAction, type LinkResult } from "./actions";

type Location = { id: string; name: string };

const ROLE_LABELS = { ADMIN: "Amministratore", EDITOR: "Editor", READER: "Lettore" } as const;
const dateTime = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function RoleAndLocations({ defaultRole, defaultLocations, locations, idPrefix }: { defaultRole: UserSummary["role"]; defaultLocations: string[]; locations: Location[]; idPrefix: string }) {
  const [role, setRole] = useState(defaultRole);
  return (
    <>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[13px] font-semibold text-ink-soft">Ruolo</legend>
        {(Object.keys(ROLE_LABELS) as UserSummary["role"][]).map((value) => (
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
              <input
                id={`${idPrefix}-${location.id}`}
                type="checkbox"
                name="locationIds"
                value={location.id}
                defaultChecked={defaultLocations.includes(location.id)}
                className="h-5 w-5 accent-[var(--accent)]"
              />
              {location.name}
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

function LinkBox({ link }: { link: LinkResult }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] bg-accent-soft p-3 text-[14px]">
      <p className="font-semibold">{link.kind === "invite" ? "Link d'invito" : "Link per reimpostare la password"}</p>
      <p>
        Mandalo tu alla persona (WhatsApp, SMS…). Vale una sola volta, fino al {dateTime.format(new Date(link.expiresAt))}.
      </p>
      <code className="break-all rounded bg-surface px-2 py-1.5 text-[13px]">{link.url}</code>
      <Button
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(link.url);
          setCopied(true);
        }}
      >
        {copied ? "Copiato ✓" : "Copia il link"}
      </Button>
    </div>
  );
}

export function CreateUserForm({ locations }: { locations: Location[] }) {
  const [state, action, isPending] = useActionState(createUserAction, initialActionState);
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
      <form action={action} className="flex flex-col gap-4">
        <TextField label="Nome" name="name" maxLength={100} required autoComplete="off" />
        <TextField label="Email" name="email" type="email" maxLength={200} required autoComplete="off" />
        <RoleAndLocations defaultRole="READER" defaultLocations={[]} locations={locations} idPrefix="nuovo" />
        {!state.ok && state.error && <Notice tone="error">{state.error}</Notice>}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creazione…" : "Crea utente e link d'invito"}
        </Button>
      </form>
      {state.ok && <LinkBox link={state.data} />}
    </div>
  );
}

function useResult<T>(action: (previous: ActionResult<T>, formData: FormData) => Promise<ActionResult<T>>) {
  return useActionState(action, initialActionState as ActionResult<T>);
}

export function UserRow({ user, isSelf, locations, locationNames }: { user: UserSummary; isSelf: boolean; locations: Location[]; locationNames: Record<string, string> }) {
  const [isOpen, setIsOpen] = useState(false);
  const [updateState, updateAction, isUpdating] = useResult(updateUserAction);
  const [activeState, activeAction, isToggling] = useResult(setUserActiveAction);
  const [linkState, linkAction, isLinking] = useResult(accountLinkAction);
  const [twoFactorState, twoFactorAction, isResetting2fa] = useResult(resetTwoFactorAction);
  const messages = [updateState, activeState, twoFactorState, linkState];
  const error = messages.find((state) => !state.ok && state.error);
  const success = messages.find((state) => state.ok && state.message);
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
            {user.active && !user.hasPassword && " · invito non ancora usato"}
            {user.twoFactorEnabled && " · 2FA attiva"}
          </p>
        </div>
        <Button variant="ghost" className="shrink-0" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen}>
          {isOpen ? "Chiudi" : "Gestisci"}
        </Button>
      </div>

      {isOpen && (
        <div className="mt-4 flex flex-col gap-5">
          <form action={updateAction} className="flex flex-col gap-4">
            <input type="hidden" name="userId" value={user.id} />
            <TextField label="Nome" name="name" defaultValue={user.name} maxLength={100} required id={`nome-${user.id}`} />
            <RoleAndLocations defaultRole={user.role} defaultLocations={user.locationIds} locations={locations} idPrefix={user.id} />
            <Button type="submit" disabled={isUpdating}>
              Salva
            </Button>
          </form>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {user.active && (
              <form action={linkAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="kind" value={user.hasPassword ? "reset" : "invite"} />
                <Button type="submit" variant="secondary" disabled={isLinking}>
                  {user.hasPassword ? "Link reset password" : "Nuovo link d'invito"}
                </Button>
              </form>
            )}
            {user.twoFactorEnabled && (
              <form action={twoFactorAction} onSubmit={(event) => !window.confirm("Togliere la verifica in due passaggi a questo utente?") && event.preventDefault()}>
                <input type="hidden" name="userId" value={user.id} />
                <Button type="submit" variant="secondary" disabled={isResetting2fa}>
                  Azzera 2FA
                </Button>
              </form>
            )}
            <form
              action={activeAction}
              onSubmit={(event) => user.active && !window.confirm(`Disattivare ${user.name}? Verrà disconnesso subito.`) && event.preventDefault()}
            >
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="active" value={user.active ? "false" : "true"} />
              <Button type="submit" variant={user.active ? "danger" : "secondary"} disabled={isToggling}>
                {user.active ? "Disattiva" : "Riattiva"}
              </Button>
            </form>
          </div>

          {linkState.ok && <LinkBox link={linkState.data} />}
        </div>
      )}
      {error && !error.ok && <div className="mt-3"><Notice tone="error">{error.error}</Notice></div>}
      {success && success.ok && success.message && <div className="mt-3"><Notice tone="success">{success.message}</Notice></div>}
    </li>
  );
}
