import { useRouteError } from "react-router";
import { Button, Notice, PageHeader } from "../components/ui";

// Errore imprevisto durante il disegno di una pagina: messaggio in italiano al posto di quello
// (in inglese) di React Router. I dettagli vanno nella console per chi sviluppa.

export function RouteErrorPage() {
  const error = useRouteError();
  console.error("Errore della pagina", error);
  return (
    <main className="mx-auto max-w-2xl px-4 pt-[env(safe-area-inset-top)]">
      <PageHeader title="Qualcosa è andato storto" />
      <Notice tone="error">Questa pagina non si è caricata correttamente. Ricarica; se succede di nuovo, avvisa l&apos;amministratore.</Notice>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => window.location.reload()}>Ricarica</Button>
        <Button variant="secondary" onClick={() => window.location.assign("/")}>
          Vai al catalogo
        </Button>
      </div>
    </main>
  );
}
