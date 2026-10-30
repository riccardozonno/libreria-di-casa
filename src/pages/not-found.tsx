import { Link } from "react-router";
import { PageHeader } from "../components/ui";

export function NotFoundPage({ what = "Pagina" }: { what?: string }) {
  return (
    <>
      <PageHeader title={`${what} non trovata`} subtitle="Forse è stata eliminata o l'indirizzo è sbagliato." />
      <Link to="/" className="font-semibold text-accent">
        ← Torna al catalogo
      </Link>
    </>
  );
}
