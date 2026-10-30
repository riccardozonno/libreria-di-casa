import { Outlet, ScrollRestoration } from "react-router";
import { BottomNav } from "./components/bottom-nav";
import { useLocations } from "./lib/locations";
import { useSession } from "./lib/session";

// Guscio delle pagine: contenuto centrato e barra di navigazione in basso (stile iOS).

export function Layout() {
  const { me, can } = useSession();
  const { locations } = useLocations();
  const canAdd = can({ type: "isbn.lookup", locations: locations.map((location) => ({ id: location.id, archived: location.archived })) });
  return (
    <>
      <main className="safe-bottom mx-auto max-w-2xl px-4 pt-[env(safe-area-inset-top)]">
        <Outlet />
      </main>
      <BottomNav canAdd={canAdd} isAdmin={me.role === "ADMIN"} />
      <ScrollRestoration />
    </>
  );
}
