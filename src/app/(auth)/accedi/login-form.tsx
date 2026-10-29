"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { Button, Notice, TextField } from "@/components/ui";

type Step = "password" | "totp";

export function LoginForm({ initialStep }: { initialStep: Step }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsPending(true);
    setError("");
    const { data, error: signInError } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    setIsPending(false);
    if (signInError) return setError(authErrorMessage(signInError));
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return setStep("totp");
    router.replace("/");
    router.refresh();
  }

  async function handleTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsPending(true);
    setError("");
    const code = String(form.get("code") ?? "").replace(/\s/g, "");
    const trustDevice = form.get("trust") === "on";
    // 6 cifre: codice dell'app; altrimenti un codice di recupero.
    const { error: totpError } = /^\d{6}$/.test(code)
      ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
      : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    setIsPending(false);
    if (totpError) return setError(authErrorMessage(totpError));
    router.replace("/");
    router.refresh();
  }

  if (step === "totp") {
    return (
      <form onSubmit={handleTotp} className="flex flex-col gap-4" noValidate>
        <h1 className="text-[24px] font-bold tracking-tight">Verifica in due passaggi</h1>
        <p className="text-[15px] text-ink-soft">Inserisci il codice a 6 cifre dell&apos;app di autenticazione, oppure uno dei codici di recupero.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <TextField label="Codice" name="code" autoComplete="one-time-code" autoCapitalize="none" required autoFocus />
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" name="trust" className="h-5 w-5 accent-[var(--accent)]" />
          Ricorda questo dispositivo per 30 giorni
        </label>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Verifica…" : "Verifica"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handlePassword} className="flex flex-col gap-4" noValidate>
      <h1 className="text-[24px] font-bold tracking-tight">Accedi</h1>
      {error && <Notice tone="error">{error}</Notice>}
      <TextField label="Email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Accesso…" : "Accedi"}
      </Button>
      <p className="text-[13px] text-ink-faint">Password dimenticata? Chiedi all&apos;amministratore un link di reimpostazione.</p>
    </form>
  );
}
