"use client";

import { Button } from "@/components/ui";

// Errore imprevisto nell'area riservata (anche: pagina aperta prima di un aggiornamento dell'app).
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mt-10 rounded-[var(--radius-lg)] bg-surface px-5 py-8 text-center shadow-[var(--shadow-card)]">
      <p className="font-serif text-[20px]">Qualcosa è andato storto</p>
      <p className="mt-2 text-[15px] text-ink-soft">Ricarica la pagina. Se l&apos;app è stata appena aggiornata, basta questo.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Ricarica</Button>
        <Button variant="secondary" onClick={reset}>
          Riprova
        </Button>
      </div>
    </div>
  );
}
