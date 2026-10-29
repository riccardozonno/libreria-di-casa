import type { Metadata } from "next";
import { Notice } from "@/components/ui";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Imposta la password", referrer: "no-referrer" };

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    return <Notice tone="error">Il link non è valido. Chiedi un nuovo link all&apos;amministratore.</Notice>;
  }
  return <SetPasswordForm token={token} />;
}
