import type { Metadata } from "next";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/actor";
import { listLocations } from "@/server/locations/service";
import { can } from "@/server/policy";
import { AddBookFlow } from "./add-book-flow";

export const metadata: Metadata = { title: "Aggiungi un libro" };

export default async function AddBookPage() {
  const user = await requireUser();
  const locations = (await listLocations()).filter((location) =>
    can(user, { type: "copy.create", location: { id: location.id, archived: location.archived } }),
  );

  return (
    <>
      <PageHeader title="Aggiungi" subtitle="Scansiona il codice a barre o inserisci i dati a mano." />
      {locations.length === 0 ? (
        <Notice>Non ci sono sedi in cui puoi aggiungere libri. Chiedi all&apos;amministratore di assegnartene una.</Notice>
      ) : (
        <AddBookFlow locations={locations.map(({ id, name }) => ({ id, name }))} />
      )}
    </>
  );
}
