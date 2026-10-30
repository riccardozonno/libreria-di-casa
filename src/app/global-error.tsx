"use client";

// Ultima rete di sicurezza: errore nel layout radice. Deve contenere <html> e <body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body>
        <main>
          <h1>Qualcosa è andato storto</h1>
          <p>Ricarica la pagina. Se il problema continua, avvisa l&apos;amministratore.</p>
          <button type="button" onClick={reset}>
            Riprova
          </button>
        </main>
      </body>
    </html>
  );
}
