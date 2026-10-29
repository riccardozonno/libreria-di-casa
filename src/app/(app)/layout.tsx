import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/actor";
import { listLocationRefs } from "@/server/locations/service";
import { can } from "@/server/policy";
import { BottomNav } from "./bottom-nav";

// Area riservata: serve una sessione valida di un utente attivo (verificato dal DB a ogni richiesta).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/accedi");

  const canAdd = can(user, { type: "isbn.lookup", locations: await listLocationRefs() });

  return (
    <>
      <a href="#contenuto" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Vai al contenuto
      </a>
      <main id="contenuto" className="safe-bottom mx-auto w-full max-w-2xl px-4 pt-[env(safe-area-inset-top)]">
        {children}
      </main>
      <BottomNav canAdd={canAdd} />
    </>
  );
}
