import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader, Section, buttonClasses } from "@/components/ui";
import { env } from "@/server/env";
import { requireUser } from "@/server/actor";
import { prisma } from "@/server/db";
import { ChangePasswordForm, TwoFactorPanel } from "./security-forms";
import { SessionButtons } from "./session-buttons";

export const metadata: Metadata = { title: "Profilo" };

const ROLE_LABELS = { ADMIN: "Amministratore", EDITOR: "Editor", READER: "Lettore" } as const;

export default async function ProfilePage() {
  const user = await requireUser({ allowPending2fa: true });
  const isTwoFactorRequired = env.REQUIRE_ADMIN_2FA && user.role === "ADMIN";
  const editorOf =
    user.role === "EDITOR" && user.editorLocationIds.size > 0
      ? await prisma.location.findMany({ where: { id: { in: [...user.editorLocationIds] } }, select: { name: true }, orderBy: { name: "asc" } })
      : [];

  return (
    <>
      <PageHeader title="Profilo" />
      {user.mustEnable2fa && (
        <div className="mb-4">
          <Notice tone="error">Come amministratore devi attivare la verifica in due passaggi prima di usare l&apos;app.</Notice>
        </div>
      )}
      <div className="rounded-[var(--radius-lg)] bg-surface px-4 py-4 shadow-[var(--shadow-card)]">
        <p className="text-[19px] font-semibold">{user.name}</p>
        <p className="text-[15px] text-ink-soft">{user.email}</p>
        <p className="mt-2 inline-block rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold">{ROLE_LABELS[user.role]}</p>
        {editorOf.length > 0 && <p className="mt-2 text-[14px] text-ink-faint">Puoi modificare: {editorOf.map((location) => location.name).join(", ")}</p>}
      </div>

      <Section title="Verifica in due passaggi">
        <TwoFactorPanel isEnabled={user.twoFactorEnabled} isRequired={isTwoFactorRequired} />
      </Section>

      <Section title="Password">
        <ChangePasswordForm />
      </Section>

      <Section title="App sul telefono">
        <Link href="/installa" className={buttonClasses("secondary", "w-full")}>
          Aggiungi HOME LIBRARY alla schermata Home
        </Link>
      </Section>

      <Section title="Sessioni">
        <SessionButtons />
      </Section>
    </>
  );
}
