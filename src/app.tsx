import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "./layout";
import { LocationsProvider } from "./lib/locations";
import { SessionProvider, useSession } from "./lib/session";
import { AddBookPage } from "./pages/add-book";
import { AdminPage } from "./pages/admin";
import { AuditPage } from "./pages/audit";
import { BookPage } from "./pages/book";
import { CatalogPage } from "./pages/catalog";
import { CsvPage } from "./pages/csv";
import { InstallPage } from "./pages/install";
import { LocationsPage } from "./pages/locations";
import { NotFoundPage } from "./pages/not-found";
import { ProfilePage } from "./pages/profile";
import { RouteErrorPage } from "./pages/route-error";
import { StatsPage } from "./pages/stats";
import { UsersPage } from "./pages/users";

// Pagine dell'app (navigazione nel browser, nessun rendering sul server). Ogni dato arriva da /api.

function AdminOnly({ children }: { children: React.ReactNode }) {
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
      { path: "/statistiche", element: <StatsPage /> },
      { path: "/aggiungi", element: <AddBookPage /> },
      { path: "/sedi", element: <LocationsPage /> },
      { path: "/admin", element: <AdminPage /> },
      { path: "/admin/utenti", element: <AdminOnly><UsersPage /></AdminOnly> },
      { path: "/admin/registro", element: <AdminOnly><AuditPage /></AdminOnly> },
      { path: "/admin/csv", element: <AdminOnly><CsvPage /></AdminOnly> },
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
