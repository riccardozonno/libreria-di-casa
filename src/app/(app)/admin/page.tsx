import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/actor";
import { can } from "@/server/policy";

export const metadata: Metadata = { title: "Amministrazione" };

const SECTIONS = [
  { href: "/admin/utenti", title: "Utenti", description: "Crea account, ruoli e sedi, link d'invito o di reset, disattivazione." },
  { href: "/admin/registro", title: "Registro attività", description: "Chi ha fatto cosa e quando: libri, copie, sedi, utenti, accessi." },
  { href: "/admin/csv", title: "Import / Export CSV", description: "Scarica il catalogo o importa libri da un foglio di calcolo." },
] as const;

export default async function AdminPage() {
  const user = await requireUser();
  if (!can(user, { type: "user.manage" })) return <Notice tone="error">Questa sezione è riservata all&apos;amministratore.</Notice>;

  return (
    <>
      <PageHeader title="Amministrazione" />
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link href={section.href} className="flex items-center justify-between gap-3 px-4 py-4 active:bg-sunken">
              <span>
                <span className="block text-[17px] font-semibold">{section.title}</span>
                <span className="block text-[14px] text-ink-faint">{section.description}</span>
              </span>
              <span aria-hidden className="text-[20px] text-ink-faint">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
