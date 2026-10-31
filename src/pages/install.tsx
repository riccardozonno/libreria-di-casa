import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, Notice, PageHeader, Section } from "../components/ui";

// Installazione sulla schermata Home. Android/Chrome offre `beforeinstallprompt`; su iPhone valgono le istruzioni.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STEP = "flex gap-3 text-[15px]";
const NUMBER = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[14px] font-bold text-accent-ink";

function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setIsInstalled(standalone.matches);
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    standalone.addEventListener("change", update);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      standalone.removeEventListener("change", update);
    };
  }, []);

  if (isInstalled) return <Notice tone="success">Stai già usando l&apos;app installata.</Notice>;
  if (!promptEvent) return null;
  return (
    <Button
      className="w-full"
      onClick={async () => {
        await promptEvent.prompt();
        await promptEvent.userChoice;
        setPromptEvent(null);
      }}
    >
      Installa HOME LIBRARY
    </Button>
  );
}

export function InstallPage() {
  return (
    <>
      <Link to="/profilo" className="-ml-2 mt-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Profilo
      </Link>
      <PageHeader title="Installa l'app" subtitle="Metti HOME LIBRARY nella schermata Home: si apre a schermo intero, come un'app." />
      <InstallButton />

      <Section title="iPhone e iPad (Safari)">
        <ol className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <li className={STEP}>
            <span className={NUMBER}>1</span>
            <span>
              Apri questo sito con <strong>Safari</strong> (su iPhone l&apos;installazione funziona solo da Safari).
            </span>
          </li>
          <li className={STEP}>
            <span className={NUMBER}>2</span>
            <span>
              Tocca <strong>Condividi</strong> (il quadrato con la freccia verso l&apos;alto).
            </span>
          </li>
          <li className={STEP}>
            <span className={NUMBER}>3</span>
            <span>
              Scegli <strong>Aggiungi alla schermata Home</strong>, poi <strong>Aggiungi</strong>.
            </span>
          </li>
          <li className={STEP}>
            <span className={NUMBER}>4</span>
            <span>Apri HOME LIBRARY dall&apos;icona: la prima volta inserisci di nuovo email e codice (l&apos;app installata ha un accesso suo, valido poi per circa un mese).</span>
          </li>
        </ol>
      </Section>

      <Section title="Android (Chrome)">
        <ol className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <li className={STEP}>
            <span className={NUMBER}>1</span>
            <span>
              Se sopra c&apos;è il pulsante <strong>Installa</strong>, toccalo e conferma.
            </span>
          </li>
          <li className={STEP}>
            <span className={NUMBER}>2</span>
            <span>
              Altrimenti apri il menu <strong>⋮</strong> di Chrome e scegli <strong>Installa app</strong> (o <strong>Aggiungi a schermata Home</strong>).
            </span>
          </li>
        </ol>
      </Section>
    </>
  );
}
