import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/ui";
import { requireUser } from "@/server/actor";
import { InstallButton } from "./install-button";

export const metadata: Metadata = { title: "Installa l'app" };

const STEP = "flex gap-3 text-[15px]";
const NUMBER = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[14px] font-bold text-accent-ink";

export default async function InstallPage() {
  await requireUser({ allowPending2fa: true });
  return (
    <>
      <PageHeader title="Installa l'app" subtitle="Metti HOME LIBRARY nella schermata Home: si apre a schermo intero, come un'app." />

      <InstallButton />

      <Section title="iPhone e iPad (Safari)">
        <ol className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <li className={STEP}>
            <span className={NUMBER}>1</span>Apri questo sito con <strong>Safari</strong> (su iPhone l&apos;installazione funziona solo da Safari).
          </li>
          <li className={STEP}>
            <span className={NUMBER}>2</span>Tocca il pulsante <strong>Condividi</strong> (il quadrato con la freccia verso l&apos;alto), in basso o in alto.
          </li>
          <li className={STEP}>
            <span className={NUMBER}>3</span>Scorri e scegli <strong>Aggiungi alla schermata Home</strong>, poi <strong>Aggiungi</strong>.
          </li>
          <li className={STEP}>
            <span className={NUMBER}>4</span>Apri HOME LIBRARY dall&apos;icona: la prima volta dovrai accedere di nuovo.
          </li>
        </ol>
      </Section>

      <Section title="Android (Chrome)">
        <ol className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <li className={STEP}>
            <span className={NUMBER}>1</span>Se sopra c&apos;è il pulsante <strong>Installa</strong>, toccalo e conferma.
          </li>
          <li className={STEP}>
            <span className={NUMBER}>2</span>Altrimenti apri il menu <strong>⋮</strong> di Chrome e scegli <strong>Installa app</strong> (o <strong>Aggiungi a schermata Home</strong>).
          </li>
        </ol>
      </Section>
    </>
  );
}
