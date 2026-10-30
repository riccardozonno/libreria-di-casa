import Link from "next/link";
import { buttonClasses } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mt-10 rounded-[var(--radius-lg)] bg-surface px-5 py-8 text-center shadow-[var(--shadow-card)]">
      <h1 className="font-serif text-[22px]">Pagina non trovata</h1>
      <p className="mt-2 text-[15px] text-ink-soft">Il libro o la pagina che cerchi non esiste più, oppure il link è sbagliato.</p>
      <Link href="/" className={buttonClasses("primary", "mt-5")}>
        Torna al catalogo
      </Link>
    </div>
  );
}
