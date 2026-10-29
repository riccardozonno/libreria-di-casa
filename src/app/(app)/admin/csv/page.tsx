import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader, Section, buttonClasses } from "@/components/ui";
import { requireUser } from "@/server/actor";
import { listLocations } from "@/server/locations/service";
import { can } from "@/server/policy";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import / Export CSV" };

export default async function CsvPage() {
  const user = await requireUser();
  if (!can(user, { type: "csv.import" })) return <Notice tone="error">Questa sezione è riservata all&apos;amministratore.</Notice>;
  const locations = await listLocations();

  return (
    <>
      <Link href="/admin" className="-ml-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Amministrazione
      </Link>
      <PageHeader title="Import / Export" subtitle="Una riga per copia · separatore ; · si apre con Excel e Numbers" />

      <Section title="Esporta">
        <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <a href="/api/export" className={buttonClasses("primary")} download>
            Scarica tutto il catalogo
          </a>
          {locations.map((location) => (
            <a key={location.id} href={`/api/export?sede=${location.id}`} className={buttonClasses("secondary")} download>
              Solo {location.name}
            </a>
          ))}
        </div>
      </Section>

      <Section title="Importa">
        <div className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <p className="mb-3 text-[14px] text-ink-soft">
            Colonne: <code className="text-[13px]">isbn; titolo; autori; anno; descrizione; sede; collocazione; note</code>. Obbligatorie: titolo
            (per i libri nuovi) e sede, che deve esistere ed essere attiva. Più autori separati da <code>|</code>. Il modo più semplice per avere
            un modello è esportare il catalogo.
          </p>
          <ImportForm />
        </div>
      </Section>
    </>
  );
}
