import { useId, useState } from "react";
import { type FamilyRow, familySummary } from "./reading-status-logic";
import { StarIcon, StarRow } from "./star-rating";

// Chi ha letto o sta leggendo il libro: una riga di riepilogo, sempre chiusa all'apertura della scheda
// (decisione del 04/11/2026); toccandola si aprono i due gruppi con i voti di ognuno.

interface Props {
  readings: ReadonlyArray<{ userId: string; name: string; rating: number | null }>;
  currentReaders: ReadonlyArray<{ userId: string; name: string }>;
  ratingAverage: number | null;
  ratingCount: number;
  meId: string;
}

const cardClasses = "rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]";

export function FamilyReadings({ readings, currentReaders, ratingAverage, ratingCount, meId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const summary = familySummary({ readings, currentReaders, ratingAverage, ratingCount, meId });

  if (summary.isEmpty) return <p className={`${cardClasses} px-4 py-3.5 text-[15px] text-ink-soft`}>{summary.counts}</p>;

  return (
    <div className={`${cardClasses} overflow-hidden`}>
      <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setIsOpen((open) => !open)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken">
        <span aria-hidden="true" className="flex shrink-0">
          {summary.avatars.map((avatar) => (
            <span key={avatar.userId} className="-ml-2 flex size-9 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent ring-2 ring-surface first:ml-0">
              {avatar.initials}
            </span>
          ))}
          {summary.moreCount > 0 && (
            <span className="-ml-2 flex size-9 items-center justify-center rounded-full bg-sunken text-[12px] font-semibold text-ink-soft ring-2 ring-surface">+{summary.moreCount}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 text-[15px]">
          <span className="sr-only">In famiglia: </span>
          {summary.average && (
            <>
              <StarIcon filled className="mr-1 inline size-4 -translate-y-px text-star" />
              <span className="font-semibold">{summary.average}</span> ·{" "}
            </>
          )}
          {summary.counts}
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-5 shrink-0 text-ink-faint transition-transform duration-[var(--duration-fast)] ${isOpen ? "rotate-180" : ""}`}>
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div id={panelId} hidden={!isOpen} className="space-y-4 border-t border-line px-4 pb-4 pt-3">
        {summary.readers.length > 0 && <Group title={`L'hanno letto · ${summary.readers.length}`} rows={summary.readers} showRating />}
        {summary.currentReaders.length > 0 && <Group title={`Lo stanno leggendo · ${summary.currentReaders.length}`} rows={summary.currentReaders} />}
      </div>
    </div>
  );
}

function Group({ title, rows, showRating = false }: { title: string; rows: readonly FamilyRow[]; showRating?: boolean }) {
  return (
    <section>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      <ul className="mt-1 divide-y divide-line">
        {rows.map((row) => (
          <li key={row.userId} className="flex min-h-10 items-center justify-between gap-3 py-2 text-[15px]">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {row.name}
              {row.isMe && <span className="text-ink-faint"> (tu)</span>}
            </span>
            {showRating && (row.rating === null ? <span className="shrink-0 text-[13px] text-ink-faint">senza voto</span> : <StarRow rating={row.rating} />)}
          </li>
        ))}
      </ul>
    </section>
  );
}
