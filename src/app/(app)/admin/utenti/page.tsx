import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader, Section } from "@/components/ui";
import { requireUser } from "@/server/actor";
import { listLocations } from "@/server/locations/service";
import { can } from "@/server/policy";
import { listUsers } from "@/server/users/service";
import { CreateUserForm, UserRow } from "./user-forms";

export const metadata: Metadata = { title: "Utenti" };

export default async function UsersPage() {
  const user = await requireUser();
  if (!can(user, { type: "user.manage" })) return <Notice tone="error">Questa sezione è riservata all&apos;amministratore.</Notice>;
  const [users, locations] = await Promise.all([listUsers(user), listLocations()]);
  const activeLocations = locations.filter((location) => !location.archived).map(({ id, name }) => ({ id, name }));
  const locationNames = Object.fromEntries(locations.map((location) => [location.id, location.name]));

  return (
    <>
      <Link href="/admin" className="-ml-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Amministrazione
      </Link>
      <PageHeader title="Utenti" subtitle={`${users.filter((entry) => entry.active).length} attivi su ${users.length}`} />

      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
        {users.map((entry) => (
          <UserRow key={entry.id} user={entry} isSelf={entry.id === user.id} locations={activeLocations} locationNames={locationNames} />
        ))}
      </ul>

      <Section title="Nuovo utente">
        <CreateUserForm locations={activeLocations} />
      </Section>
    </>
  );
}
