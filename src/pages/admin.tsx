import { Link } from "react-router";
import { PageHeader } from "../components/ui";
import { useSession } from "../lib/session";
import { NotFoundPage } from "./not-found";

// Area amministratore. Fase 4: registro attività e import/export CSV.

const SECTIONS = [{ to: "/admin/utenti", title: "Utenti", description: "Chi può entrare, ruoli e sedi" }];

export function AdminPage() {
  const { me } = useSession();
  if (me.role !== "ADMIN") return <NotFoundPage />;
  return (
    <>
      <PageHeader title="Admin" />
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
        {SECTIONS.map((section) => (
          <li key={section.to}>
            <Link to={section.to} className="flex min-h-14 flex-col justify-center px-4 py-3 active:bg-sunken">
              <span className="text-[17px] font-semibold">{section.title}</span>
              <span className="text-[14px] text-ink-faint">{section.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
