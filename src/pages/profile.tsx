import { useState } from "react";
import { Link } from "react-router";
import { Button, buttonClasses, Notice, PageHeader, Section } from "../components/ui";
import { errorMessage, send } from "../lib/api";
import { leaveAccess, useSession } from "../lib/session";

// Profilo: chi sei, e uscita (da questo dispositivo o da tutti). Niente password: accesso con Cloudflare Access.

const ROLE_LABELS = { ADMIN: "Amministratore", EDITOR: "Editor", READER: "Lettore" } as const;

export function ProfilePage() {
  const { me } = useSession();
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function signOutEverywhere() {
    if (!window.confirm("Uscire da tutti i dispositivi? Dovrai inserire di nuovo email e codice su ognuno.")) return;
    setIsBusy(true);
    try {
      await send("/me/sign-out", "POST");
      leaveAccess();
    } catch (caught) {
      setError(errorMessage(caught));
      setIsBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Profilo" />
      <div className="rounded-[var(--radius-lg)] bg-surface px-4 py-4 shadow-[var(--shadow-card)]">
        <p className="text-[19px] font-semibold">{me.name}</p>
        <p className="mt-1 text-[15px] text-ink-soft">{me.email}</p>
        <p className="mt-1 text-[15px] text-ink-soft">{ROLE_LABELS[me.role]}</p>
      </div>

      <Section title="App">
        <Link to="/installa" className={buttonClasses("secondary", "w-full")}>
          Installa l&apos;app sulla schermata Home
        </Link>
      </Section>

      <Section title="Accesso">
        <div className="space-y-3 rounded-[var(--radius-lg)] bg-surface px-4 py-4 shadow-[var(--shadow-card)]">
          <p className="text-[14px] text-ink-soft">Entri con la tua email e un codice ricevuto per posta: non ci sono password da ricordare.</p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={leaveAccess}>
              Esci da questo dispositivo
            </Button>
            <Button variant="danger" onClick={() => void signOutEverywhere()} disabled={isBusy}>
              Esci da tutti i dispositivi
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
