"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice, TextField } from "@/components/ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";

const MIN_LENGTH = 12;

export function ChangePasswordForm() {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword") ?? "");
    if (newPassword.length < MIN_LENGTH) return setMessage({ tone: "error", text: `La nuova password deve avere almeno ${MIN_LENGTH} caratteri.` });
    if (newPassword !== String(data.get("confirm") ?? "")) return setMessage({ tone: "error", text: "Le due password non coincidono." });

    setIsPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(data.get("currentPassword") ?? ""),
      newPassword,
      revokeOtherSessions: true,
    });
    setIsPending(false);
    if (error) return setMessage({ tone: "error", text: error.status === 400 ? "La password attuale non è corretta." : authErrorMessage(error) });
    form.reset();
    setMessage({ tone: "success", text: "Password cambiata. Gli altri dispositivi sono stati disconnessi." });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]" noValidate>
      <TextField label="Password attuale" name="currentPassword" type="password" autoComplete="current-password" required />
      <TextField label="Nuova password" name="newPassword" type="password" autoComplete="new-password" minLength={MIN_LENGTH} required hint={`Almeno ${MIN_LENGTH} caratteri.`} />
      <TextField label="Ripeti la nuova password" name="confirm" type="password" autoComplete="new-password" required />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvataggio…" : "Cambia password"}
      </Button>
    </form>
  );
}

type Setup = { qr: string; secret: string; backupCodes: string[] };

/** Attivazione in due passi (password → QR + codice) e disattivazione con password. */
export function TwoFactorPanel({ isEnabled, isRequired }: { isEnabled: boolean; isRequired: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function startSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError("");
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const { data, error: enableError } = await authClient.twoFactor.enable({ password });
    if (enableError || !data || data.method !== "totp") {
      setIsPending(false);
      return setError(enableError?.status === 400 ? "Password non corretta." : authErrorMessage(enableError ?? { status: 500 }));
    }
    const { toDataURL } = await import("qrcode");
    const qr = await toDataURL(data.totpURI, { margin: 1, width: 220 });
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setSetup({ qr, secret, backupCodes: data.backupCodes });
    setIsPending(false);
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError("");
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code });
    setIsPending(false);
    if (verifyError) return setError("Codice non valido: controlla l'ora del telefono e riprova.");
    setSetup(null);
    router.refresh();
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError("");
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const { error: disableError } = await authClient.twoFactor.disable({ password });
    setIsPending(false);
    if (disableError) return setError(disableError.status === 403 ? "Per gli amministratori la verifica in due passaggi è obbligatoria." : "Password non corretta.");
    router.refresh();
  }

  const box = "flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]";

  if (setup) {
    return (
      <div className={box}>
        <p className="text-[15px]">
          1. Inquadra il codice con un&apos;app di autenticazione (Password di iPhone, Google Authenticator, 1Password…).
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- QR generato nel browser come data URL */}
        <img src={setup.qr} alt="Codice QR per l'app di autenticazione" width={220} height={220} className="self-center rounded-[8px] bg-white p-2" />
        <p className="text-[13px] text-ink-faint [overflow-wrap:anywhere]">
          Oppure inserisci a mano la chiave: <code>{setup.secret}</code>
        </p>
        <div className="rounded-[var(--radius-sm)] bg-accent-soft p-3 text-[14px]">
          <p className="font-semibold">2. Conserva i codici di recupero</p>
          <p className="mb-2">Ognuno funziona una volta sola, se perdi il telefono. Salvali nel password manager.</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-[13px]">
            {setup.backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
        <form onSubmit={confirmSetup} className="flex flex-col gap-3" noValidate>
          <TextField label="3. Codice a 6 cifre mostrato dall'app" name="code" inputMode="numeric" autoComplete="one-time-code" required />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={isPending}>
            Attiva
          </Button>
        </form>
      </div>
    );
  }

  if (isEnabled) {
    return (
      <form onSubmit={disable} className={box} noValidate>
        <Notice tone="success">Verifica in due passaggi attiva.</Notice>
        {!isRequired && (
          <>
            <TextField label="Password per disattivarla" name="password" type="password" autoComplete="current-password" required />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" variant="secondary" disabled={isPending}>
              Disattiva
            </Button>
          </>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={startSetup} className={box} noValidate>
      <p className="text-[15px] text-ink-soft">Oltre alla password, all&apos;accesso servirà un codice generato dal telefono.</p>
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Preparazione…" : "Attiva la verifica in due passaggi"}
      </Button>
    </form>
  );
}
