import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/ui";
import { requireUser } from "@/server/actor";
import { prisma } from "@/server/db";
import { SessionButtons } from "./session-buttons";

export const metadata: Metadata = { title: "Profilo" };

const ROLE_LABELS = { ADMIN: "Amministratore", EDITOR: "Editor", READER: "Lettore" } as const;

export default async function ProfilePage() {
  const user = await requireUser();
  const editorOf =
    user.role === "EDITOR" && user.editorLocationIds.size > 0
      ? await prisma.location.findMany({ where: { id: { in: [...user.editorLocationIds] } }, select: { name: true }, orderBy: { name: "asc" } })
      : [];

  return (
    <>
      <PageHeader title="Profilo" />
      <div className="rounded-[var(--radius-lg)] bg-surface px-4 py-4 shadow-[var(--shadow-card)]">
        <p className="text-[19px] font-semibold">{user.name}</p>
        <p className="text-[15px] text-ink-soft">{user.email}</p>
        <p className="mt-2 inline-block rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold">{ROLE_LABELS[user.role]}</p>
        {editorOf.length > 0 && <p className="mt-2 text-[14px] text-ink-faint">Puoi modificare: {editorOf.map((location) => location.name).join(", ")}</p>}
      </div>

      <Section title="Sessioni">
        <SessionButtons />
      </Section>
    </>
  );
}
