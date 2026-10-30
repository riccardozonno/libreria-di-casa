import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/actor";
import { AUDIT_CATEGORIES, listAuditEntries, type AuditCategory, type AuditEntry } from "@/server/audit-log";
import { can } from "@/server/policy";

export const metadata: Metadata = { title: "Registro attività" };

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  book: "Libri",
  copy: "Copie",
  location: "Sedi",
  user: "Utenti",
  reading: "Letture",
  import: "Import",
  export: "Export",
  auth: "Accessi",
};

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
  "user.create": "ha creato un utente",
  "user.update": "ha modificato un utente",
  "user.role_change": "ha cambiato il ruolo di un utente",
  "user.locations_change": "ha cambiato le sedi di un editor",
  "user.deactivate": "ha disattivato un utente",
  "user.reactivate": "ha riattivato un utente",
  "user.invite_link": "ha generato un link d'invito",
  "user.reset_link": "ha generato un link di reset",
  "user.2fa_reset": "ha azzerato la 2FA di un utente",
  "reading.mark": "ha segnato un libro come letto",
  "reading.unmark": "ha tolto un \"letto\"",
  "csv.import": "ha importato un CSV",
  "csv.export": "ha esportato un CSV",
  "auth.login": "ha effettuato l'accesso",
  "auth.login_failed": "accesso fallito",
  "auth.lockout": "account bloccato per troppi tentativi",
  "auth.password_reset": "ha reimpostato la password",
  "auth.password_change": "ha cambiato la password",
  "auth.logout_all": "è uscito da tutti i dispositivi",
  "auth.2fa_setup": "ha avviato l'attivazione della 2FA",
  "auth.2fa_disable": "ha disattivato la 2FA",
};

const dateTime = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Dettaglio breve leggibile dai dati JSON dell'evento (nomi, titoli, conteggi). */
function summary(entry: AuditEntry): string {
  const data = entry.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const record = data as Record<string, unknown>;
  const parts = [record.title, record.name, record.email, record.location, record.from && record.to ? `${record.from} → ${record.to}` : null]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (typeof record.newCopies === "number") parts.push(`${record.newCopies} copie`);
  if (typeof record.rows === "number") parts.push(`${record.rows} righe`);
  return parts.join(" · ");
}

type SearchParams = Promise<{ categoria?: string; pagina?: string }>;

function href(category: AuditCategory | undefined, page: number): string {
  const params = new URLSearchParams();
  if (category) params.set("categoria", category);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/admin/registro?${query}` : "/admin/registro";
}

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (!can(user, { type: "audit.view" })) return <Notice tone="error">Questa sezione è riservata all&apos;amministratore.</Notice>;
  const params = await searchParams;
  const category = AUDIT_CATEGORIES.find((value) => value === params.categoria);
  const result = await listAuditEntries(user, { page: Number(params.pagina) || 1, category });

  return (
    <>
      <Link href="/admin" className="-ml-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Amministrazione
      </Link>
      <PageHeader title="Registro attività" subtitle={`${result.total} eventi`} />

      <nav aria-label="Filtra per categoria" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href(undefined, 1)} aria-current={!category ? "true" : undefined} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line px-3.5 text-[14px] font-medium aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:text-accent-ink">
          Tutto
        </Link>
        {AUDIT_CATEGORIES.map((value) => (
          <Link key={value} href={href(value, 1)} aria-current={category === value ? "true" : undefined} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line px-3.5 text-[14px] font-medium aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:text-accent-ink">
            {CATEGORY_LABELS[value]}
          </Link>
        ))}
      </nav>

      {result.items.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-surface px-5 py-8 text-center text-[15px] text-ink-soft shadow-[var(--shadow-card)]">Nessun evento.</p>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
          {result.items.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <p className="text-[15px]">
                <span className="font-semibold">{entry.actorName ?? entry.actorEmail ?? "Sistema"}</span> {ACTION_LABELS[entry.action] ?? entry.action}
              </p>
              {summary(entry) && <p className="text-[14px] text-ink-soft [overflow-wrap:anywhere]">{summary(entry)}</p>}
              <p className="text-[12px] text-ink-faint">
                <time dateTime={entry.createdAt.toISOString()}>{dateTime.format(entry.createdAt)}</time>
                {entry.ip && ` · IP ${entry.ip}`}
              </p>
            </li>
          ))}
        </ol>
      )}

      {result.pageCount > 1 && (
        <nav aria-label="Pagine" className="mt-4 flex items-center justify-between text-[15px]">
          {result.page > 1 ? <Link href={href(category, result.page - 1)} className="min-h-11 px-2 py-2.5 font-semibold text-accent">← Più recenti</Link> : <span />}
          <span className="text-ink-faint">Pagina {result.page} di {result.pageCount}</span>
          {result.page < result.pageCount ? <Link href={href(category, result.page + 1)} className="min-h-11 px-2 py-2.5 font-semibold text-accent">Meno recenti →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
