import { Link, useSearchParams } from "react-router";
import { Notice, PageHeader } from "../components/ui";
import { useApi } from "../lib/use-api";

// Registro attività (solo admin): chi ha fatto cosa e quando. Filtri nell'indirizzo (indietro funziona).

interface AuditEntry {
  seq: number;
  id: string;
  createdAt: string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  ip: string | null;
  data: Record<string, unknown>;
}

const CATEGORY_LABELS = { book: "Libri", copy: "Copie", location: "Sedi", user: "Utenti", reading: "Letture", import: "Import", export: "Export" } as const;

const ACTION_LABELS: Record<string, string> = {
  "book.create": "ha aggiunto un libro",
  "book.update": "ha modificato un libro",
  "book.delete": "ha eliminato un libro",
  "copy.create": "ha aggiunto una copia",
  "copy.update": "ha modificato una copia",
  "copy.move": "ha spostato una copia",
  "copy.delete": "ha eliminato una copia",
  "location.create": "ha creato una sede",
  "location.update": "ha modificato una sede",
  "location.archive": "ha archiviato una sede",
  "location.restore": "ha riattivato una sede",
  "user.create": "ha aggiunto un utente",
  "user.update": "ha modificato un utente",
  "user.role_change": "ha cambiato il ruolo di un utente",
  "user.locations_change": "ha cambiato le sedi di un editor",
  "user.deactivate": "ha disattivato un utente",
  "user.reactivate": "ha riattivato un utente",
  "user.sign_out_everywhere": "ha chiuso le sessioni su tutti i dispositivi",
  "reading.mark": "ha segnato un libro come letto",
  "reading.unmark": "ha tolto un \"letto\"",
  "csv.import": "ha importato un CSV",
  "csv.export": "ha esportato un CSV",
};

const dateTime = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const chipClasses =
  "inline-flex min-h-11 shrink-0 items-center rounded-full border border-line px-3.5 text-[14px] font-medium aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:text-accent-ink";

/** Dettaglio breve leggibile dai dati dell'evento (nomi, titoli, spostamenti, conteggi). */
function summary(data: Record<string, unknown>): string {
  const parts = [data.title, data.name, data.email, data.location, data.from && data.to ? `${String(data.from)} → ${String(data.to)}` : null].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (typeof data.newBooks === "number") parts.push(`${data.newBooks} libri nuovi`);
  if (typeof data.newCopies === "number") parts.push(`${data.newCopies} copie`);
  if (typeof data.rows === "number") parts.push(`${data.rows} righe`);
  return parts.join(" · ");
}

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const { data: users } = useApi<Array<{ id: string; name: string }>>("/users");
  const query = new URLSearchParams();
  for (const name of ["category", "actor", "from", "to", "before"]) {
    const value = params.get(name);
    if (value) query.set(name, value);
  }
  const { data, error, loading } = useApi<{ items: AuditEntry[]; nextBefore: number | null }>(`/audit?${query.toString()}`);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("before");
    setParams(next);
  };
  const category = params.get("category");

  return (
    <>
      <Link to="/admin" className="-ml-2 mt-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Admin
      </Link>
      <PageHeader title="Registro attività" subtitle="Chi ha fatto cosa, e quando" />

      <nav aria-label="Filtra per categoria" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" onClick={() => update({ category: null })} aria-current={!category ? "true" : undefined} className={chipClasses}>
          Tutto
        </button>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <button key={value} type="button" onClick={() => update({ category: value })} aria-current={category === value ? "true" : undefined} className={chipClasses}>
            {label}
          </button>
        ))}
      </nav>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-soft">
          Persona
          <select value={params.get("actor") ?? ""} onChange={(event) => update({ actor: event.target.value })} className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-[16px] font-normal text-ink">
            <option value="">Tutti</option>
            {users?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-soft">
          Dal
          <input type="date" value={params.get("from") ?? ""} onChange={(event) => update({ from: event.target.value })} className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-[16px] font-normal text-ink" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-soft">
          Al
          <input type="date" value={params.get("to") ?? ""} onChange={(event) => update({ to: event.target.value })} className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-[16px] font-normal text-ink" />
        </label>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {!data && loading && <p className="px-1 py-6 text-center text-ink-soft">Caricamento…</p>}
      {data && data.items.length === 0 && (
        <p className="rounded-[var(--radius-lg)] bg-surface px-5 py-8 text-center text-[15px] text-ink-soft shadow-[var(--shadow-card)]">Nessun evento con questi filtri.</p>
      )}
      {data && data.items.length > 0 && (
        <ol aria-busy={loading} className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)] aria-busy:opacity-70">
          {data.items.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <p className="text-[15px]">
                <span className="font-semibold">{entry.actorName ?? entry.actorEmail ?? "Sistema"}</span> {ACTION_LABELS[entry.action] ?? entry.action}
              </p>
              {summary(entry.data) && <p className="text-[14px] text-ink-soft [overflow-wrap:anywhere]">{summary(entry.data)}</p>}
              <p className="text-[12px] text-ink-faint">
                <time dateTime={entry.createdAt}>{dateTime.format(new Date(entry.createdAt))}</time>
                {entry.ip && ` · IP ${entry.ip}`}
              </p>
            </li>
          ))}
        </ol>
      )}

      {data && (params.get("before") || data.nextBefore) && (
        <nav aria-label="Pagine" className="mt-4 flex items-center justify-between text-[15px]">
          {params.get("before") ? (
            <button type="button" onClick={() => update({})} className="min-h-11 px-2 py-2.5 font-semibold text-accent">
              ← Più recenti
            </button>
          ) : (
            <span />
          )}
          {data.nextBefore ? (
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("before", String(data.nextBefore));
                setParams(next);
              }}
              className="min-h-11 px-2 py-2.5 font-semibold text-accent"
            >
              Meno recenti →
            </button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
