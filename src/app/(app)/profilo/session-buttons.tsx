"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Notice } from "@/components/ui";

export function SessionButtons() {
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function run(operation: () => Promise<{ error: unknown }>) {
    setIsPending(true);
    setError("");
    const { error: failure } = await operation();
    if (failure) {
      setIsPending(false);
      return setError("Operazione non riuscita. Riprova.");
    }
    // Ricaricamento completo voluto: svuota la cache del router con i dati della sessione chiusa.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/accedi");
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <Notice tone="error">{error}</Notice>}
      <Button variant="secondary" disabled={isPending} onClick={() => run(() => authClient.signOut())}>
        Esci
      </Button>
      <Button
        variant="danger"
        disabled={isPending}
        onClick={async () => {
          await run(async () => {
            const revoked = await authClient.revokeSessions();
            return revoked.error ? revoked : authClient.signOut();
          });
        }}
      >
        Esci da tutti i dispositivi
      </Button>
    </div>
  );
}
