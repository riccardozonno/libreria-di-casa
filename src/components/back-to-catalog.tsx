import { Link, useLocation, useNavigate } from "react-router";

// «← Catalogo»: se si è arrivati dalla lista del catalogo, fa come «indietro» (stessa ricerca, stessi libri
// caricati, stessa posizione). L'app sulla schermata Home non ha il tasto indietro del browser, quindi è il
// modo normale per tornare. Arrivando da altrove (link diretto, ricarica) porta al catalogo dall'inizio.

/** Stato da passare ai link della lista del catalogo (`<Link state={FROM_CATALOG}>`). */
export const FROM_CATALOG = { fromCatalog: true } as const;

export function BackToCatalog() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromCatalog = (location.state as { fromCatalog?: boolean } | null)?.fromCatalog === true;
  return (
    <Link
      to="/"
      onClick={(event) => {
        if (!fromCatalog) return;
        event.preventDefault();
        void navigate(-1);
      }}
      className="-ml-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent"
    >
      ← Catalogo
    </Link>
  );
}
