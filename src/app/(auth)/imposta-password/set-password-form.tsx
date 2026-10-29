"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { Button, Notice, TextField, buttonClasses } from "@/components/ui";

const MIN_LENGTH = 12;

export function SetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [isDone, setIsDone] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < MIN_LENGTH) return setError(`La password deve avere almeno ${MIN_LENGTH} caratteri.`);
    if (password !== String(form.get("confirm") ?? "")) return setError("Le due password non coincidono.");

    setIsPending(true);
    setError("");
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    setIsPending(false);
    if (resetError) return setError(authErrorMessage(resetError));
    setIsDone(true);
  }

  if (isDone) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">Password impostata. Ora puoi accedere.</Notice>
        <Link href="/accedi" className={buttonClasses("primary")}>
          Vai all&apos;accesso
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-[24px] font-bold tracking-tight">Imposta la password</h1>
      <p className="text-[15px] text-ink-soft">Scegli una password di almeno {MIN_LENGTH} caratteri. Una frase di più parole è facile da ricordare e sicura.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <TextField label="Nuova password" name="password" type="password" autoComplete="new-password" minLength={MIN_LENGTH} required autoFocus />
      <TextField label="Ripeti la password" name="confirm" type="password" autoComplete="new-password" minLength={MIN_LENGTH} required />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvataggio…" : "Imposta password"}
      </Button>
    </form>
  );
}
