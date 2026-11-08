import { type ComponentType, lazy, type ReactNode, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { Layout } from "./layout";
import { LocationsProvider } from "./lib/locations";
import { SessionProvider, useSession } from "./lib/session";
import { AddBookPage } from "./pages/add-book";
import { BookPage } from "./pages/book";
import { CatalogPage } from "./pages/catalog";
import { InstallPage } from "./pages/install";
import { NotFoundPage } from "./pages/not-found";
import { ProfilePage } from "./pages/profile";
import { RouteErrorPage } from "./pages/route-error";

// Pagine dell'app (navigazione nel browser, nessun rendering sul server). Ogni dato arriva da /api.
// Quelle di tutti i giorni sono nel file principale; Statistiche e area admin si scaricano solo quando
// servono (il CSV porta con sé papaparse). Se dopo una pubblicazione il file non c'è più, main.tsx ricarica.
function lazyPage<Module>(load: () => Promise<Module>, pick: (module: Module) => ComponentType) {
  return lazy(async () => {
    const module = await load();
    // Senza modulo main.tsx sta già ricaricando la pagina (file vecchio dopo una pubblicazione): si resta su
    // «Caricamento…» invece di mostrare per un attimo la pagina d'errore.
    if (!module) return new Promise<never>(() => undefined);
    return { default: pick(module) };
  });
}

const AdminPage = lazyPage(() => import("./pages/admin"), (module) => module.AdminPage);
const LocationsPage = lazyPage(() => import("./pages/locations"), (module) => module.LocationsPage);
const AuditPage = lazyPage(() => import("./pages/audit"), (module) => module.AuditPage);
const CsvPage = lazyPage(() => import("./pages/csv"), (module) => module.CsvPage);
const StatsPage = lazyPage(() => import("./pages/stats"), (module) => module.StatsPage);
const UsersPage = lazyPage(() => import("./pages/users"), (module) => module.UsersPage);

function OnDemand({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p className="px-1 py-6 text-center text-ink-soft">Caricamento…</p>}>{children}</Suspense>;
}

/** Vecchio indirizzo delle sedi (ora in Admin): l'admin va ad Admin → Sedi, gli altri al Catalogo. */
function LegacyLocations() {
  const { me } = useSession();
  return <Navigate to={me.role === "ADMIN" ? "/admin/sedi" : "/"} replace />;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { me } = useSession();
  return me.role === "ADMIN" ? children : <NotFoundPage />;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/", element: <CatalogPage /> },
      { path: "/libri/:id", element: <BookPage /> },
      { path: "/statistiche", element: <OnDemand><StatsPage /></OnDemand> },
      { path: "/aggiungi", element: <AddBookPage /> },
      { path: "/sedi", element: <LegacyLocations /> },
      { path: "/admin/sedi", element: <AdminOnly><OnDemand><LocationsPage /></OnDemand></AdminOnly> },
      { path: "/admin", element: <AdminOnly><OnDemand><AdminPage /></OnDemand></AdminOnly> },
      { path: "/admin/utenti", element: <AdminOnly><OnDemand><UsersPage /></OnDemand></AdminOnly> },
      { path: "/admin/registro", element: <AdminOnly><OnDemand><AuditPage /></OnDemand></AdminOnly> },
      { path: "/admin/csv", element: <AdminOnly><OnDemand><CsvPage /></OnDemand></AdminOnly> },
      { path: "/profilo", element: <ProfilePage /> },
      { path: "/installa", element: <InstallPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <SessionProvider>
      <LocationsProvider>
        <RouterProvider router={router} />
      </LocationsProvider>
    </SessionProvider>
  );
}
