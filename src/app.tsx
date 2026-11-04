import { lazy, type ReactNode, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "./layout";
import { LocationsProvider } from "./lib/locations";
import { SessionProvider, useSession } from "./lib/session";
import { AddBookPage } from "./pages/add-book";
import { BookPage } from "./pages/book";
import { CatalogPage } from "./pages/catalog";
import { InstallPage } from "./pages/install";
import { LocationsPage } from "./pages/locations";
import { NotFoundPage } from "./pages/not-found";
import { ProfilePage } from "./pages/profile";
import { RouteErrorPage } from "./pages/route-error";

// Pagine dell'app (navigazione nel browser, nessun rendering sul server). Ogni dato arriva da /api.
// Quelle di tutti i giorni sono nel file principale; Statistiche e area admin si scaricano solo quando
// servono (il CSV porta con sé papaparse). Se dopo una pubblicazione il file non c'è più, main.tsx ricarica.
const AdminPage = lazy(() => import("./pages/admin").then((module) => ({ default: module.AdminPage })));
const AuditPage = lazy(() => import("./pages/audit").then((module) => ({ default: module.AuditPage })));
const CsvPage = lazy(() => import("./pages/csv").then((module) => ({ default: module.CsvPage })));
const StatsPage = lazy(() => import("./pages/stats").then((module) => ({ default: module.StatsPage })));
const UsersPage = lazy(() => import("./pages/users").then((module) => ({ default: module.UsersPage })));

function OnDemand({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p className="px-1 py-6 text-center text-ink-soft">Caricamento…</p>}>{children}</Suspense>;
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
      { path: "/sedi", element: <LocationsPage /> },
      { path: "/admin", element: <OnDemand><AdminPage /></OnDemand> },
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
