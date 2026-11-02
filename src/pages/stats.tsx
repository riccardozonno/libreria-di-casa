import type { ReactNode } from "react";
import { Link } from "react-router";
import { type GenreKey, genreLabel } from "../../shared/genres";
import { BarList } from "../components/bar-list";
import { Notice, PageHeader, Section } from "../components/ui";
import { useApi } from "../lib/use-api";

// Statistiche di lettura per tutta la famiglia (GET /api/stats). Ogni sezione dice cosa manca quando è vuota.

interface ReadingStats {
  catalogSize: number;
  totalReadings: number;
  people: Array<{ userId: string; name: string; read: number; percent: number; ratings: number }>;
  currentReadings: Array<{ userId: string; name: string; bookId: string; title: string }>;
  months: Array<{ month: string; count: number }>;
  years: Array<{ year: string; count: number }>;
  topRated: Array<{ bookId: string; title: string; average: number; votes: number }>;
  topAuthors: Array<{ name: string; count: number }>;
  genres: Array<{ genre: GenreKey | null; count: number }>;
  pairs: Array<{ names: [string, string]; count: number }>;
}

const monthFormat = new Intl.DateTimeFormat("it-IT", { month: "short", year: "numeric", timeZone: "UTC" });
const decimal = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/** "2026-11" → "nov 2026". */
function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return monthFormat.format(new Date(Date.UTC(year, monthNumber - 1, 15)));
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const cardClasses = "rounded-[var(--radius-lg)] bg-surface px-4 py-4 shadow-[var(--shadow-card)]";

function Card({ children }: { children: ReactNode }) {
  return <div className={cardClasses}>{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-ink-soft">{children}</p>;
}

export function StatsPage() {
  const { data, error, loading } = useApi<ReadingStats>("/stats");

  return (
    <div className="pb-4 pt-2">
      <Link to="/" className="-ml-2 inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent">
        ← Catalogo
      </Link>
      <PageHeader
        title="Statistiche"
        subtitle={data ? `${plural(data.totalReadings, "lettura", "letture")} · ${plural(data.catalogSize, "libro", "libri")} in catalogo` : "Le letture di tutta la famiglia"}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {!data && loading && <p className="px-1 py-6 text-center text-ink-soft">Caricamento…</p>}
      {data && <StatsSections stats={data} />}
    </div>
  );
}

function StatsSections({ stats }: { stats: ReadingStats }) {
  const hasReadings = stats.totalReadings > 0;
  return (
    <>
      <Section title="Chi legge di più">
        <Card>
          {hasReadings ? (
            <BarList
              label="Chi legge di più"
              items={stats.people.map((person) => ({
                key: person.userId,
                label: (
                  <>
                    {person.name}
                    {person.ratings > 0 && <span className="text-[13px] text-ink-faint"> · {plural(person.ratings, "voto dato", "voti dati")}</span>}
                  </>
                ),
                value: person.read,
                valueLabel: `${plural(person.read, "libro", "libri")} · ${person.percent}%`,
              }))}
            />
          ) : (
            <Empty>Nessuno ha ancora segnato un libro come letto.</Empty>
          )}
        </Card>
      </Section>

      <Section title="Sta leggendo">
        <Card>
          {stats.currentReadings.length > 0 ? (
            <ul className="space-y-2 text-[15px]">
              {stats.currentReadings.map((reading) => (
                <li key={`${reading.userId}-${reading.bookId}`}>
                  <span aria-hidden>📖 </span>
                  {reading.name}:{" "}
                  <Link to={`/libri/${reading.bookId}`} className="font-semibold text-accent underline-offset-2 hover:underline">
                    {reading.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nessuno sta leggendo un libro in questo momento.</Empty>
          )}
        </Card>
      </Section>

      <Section title="Letture per mese">
        <Card>
          <BarList label="Letture per mese" items={stats.months.map((item) => ({ key: item.month, label: monthLabel(item.month), value: item.count }))} />
          <p className="mt-3 text-[13px] text-ink-faint">Le letture segnate prima di novembre 2026 hanno la data del giorno in cui sono state registrate nell'app.</p>
        </Card>
      </Section>

      <Section title="Letture per anno">
        <Card>
          {stats.years.length > 0 ? (
            <BarList label="Letture per anno" items={stats.years.map((item) => ({ key: item.year, label: item.year, value: item.count }))} />
          ) : (
            <Empty>Ancora nessuna lettura.</Empty>
          )}
        </Card>
      </Section>

      <Section title="I più apprezzati">
        <Card>
          {stats.topRated.length > 0 ? (
            <ol className="space-y-2 text-[15px]">
              {stats.topRated.map((book) => (
                <li key={book.bookId} className="flex items-baseline justify-between gap-3">
                  <Link to={`/libri/${book.bookId}`} className="min-w-0 font-semibold text-accent underline-offset-2 [overflow-wrap:anywhere] hover:underline">
                    {book.title}
                  </Link>
                  <span className="shrink-0 tabular-nums text-ink-soft">
                    <span aria-hidden className="text-star">★ </span>
                    {decimal.format(book.average)}
                    <span className="sr-only"> stelle su 5</span> · {plural(book.votes, "voto", "voti")}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Servono almeno 2 voti sullo stesso libro.</Empty>
          )}
        </Card>
      </Section>

      <Section title="Autori più letti">
        <Card>
          {stats.topAuthors.length > 0 ? (
            <BarList label="Autori più letti" items={stats.topAuthors.map((author) => ({ key: author.name, label: author.name, value: author.count, valueLabel: plural(author.count, "lettura", "letture") }))} />
          ) : (
            <Empty>Ancora nessuna lettura.</Empty>
          )}
        </Card>
      </Section>

      <Section title="Generi più letti">
        <Card>
          {stats.genres.length > 0 ? (
            <BarList
              label="Generi più letti"
              items={stats.genres.map((item) => ({ key: item.genre ?? "NONE", label: item.genre ? genreLabel(item.genre) : "Senza genere", value: item.count, valueLabel: plural(item.count, "lettura", "letture") }))}
            />
          ) : (
            <Empty>Ancora nessuna lettura.</Empty>
          )}
        </Card>
      </Section>

      <Section title="Letture in comune">
        <Card>
          {stats.pairs.length > 0 ? (
            <BarList
              label="Letture in comune"
              items={stats.pairs.map((pair) => ({ key: pair.names.join("|"), label: `${pair.names[0]} e ${pair.names[1]}`, value: pair.count, valueLabel: plural(pair.count, "libro", "libri") }))}
            />
          ) : (
            <Empty>Ancora nessun libro letto da due persone.</Empty>
          )}
        </Card>
      </Section>
    </>
  );
}
