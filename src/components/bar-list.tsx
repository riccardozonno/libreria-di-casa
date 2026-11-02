import type { ReactNode } from "react";

// Barre orizzontali per una sola serie: il numero è sempre scritto, la barra è solo un aiuto visivo.
// Larghezza come attributo SVG: la CSP non ammette stili inline.

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Testo del valore; senza, si mostra il numero. */
  valueLabel?: string;
}

export function BarList({ label, items }: { label: string; items: readonly BarItem[] }) {
  const max = Math.max(0, ...items.map((item) => item.value));
  return (
    <ul aria-label={label} className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-[15px]">
            <span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">{item.valueLabel ?? item.value}</span>
          </div>
          <svg aria-hidden className="mt-1 block h-2 w-full" focusable="false">
            <rect width="100%" height="100%" rx="4" className="fill-sunken" />
            {item.value > 0 && <rect width={`${(item.value / max) * 100}%`} height="100%" rx="4" className="fill-accent" />}
          </svg>
        </li>
      ))}
    </ul>
  );
}
