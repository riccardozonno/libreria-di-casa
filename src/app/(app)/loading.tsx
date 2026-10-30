// Mostrato durante la navigazione mentre il server prepara la pagina (tutte le pagine sono dinamiche).
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="pt-6">
      <span className="sr-only">Caricamento…</span>
      <div aria-hidden className="h-8 w-40 animate-pulse rounded-[var(--radius-sm)] bg-sunken" />
      <div aria-hidden className="mt-6 h-24 animate-pulse rounded-[var(--radius-lg)] bg-sunken" />
      <div aria-hidden className="mt-3 h-24 animate-pulse rounded-[var(--radius-lg)] bg-sunken" />
    </div>
  );
}
