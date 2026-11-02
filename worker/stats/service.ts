import { sql } from "drizzle-orm";
import type { GenreKey } from "../../shared/genres";
import { lastMonths, romeMonthKey } from "../../shared/months";
import { runBatch } from "../db/batch";
import type { Db } from "../db/client";

// Statistiche di lettura per tutta la famiglia: tutte le query in un solo viaggio verso D1.
// La data di lettura è `book_reading.created_at` (quando si segna «Letto»). Le persone disattivate
// contano nei totali, nei voti, negli autori e nei generi, ma non nelle classifiche per persona.

const MONTHS_SHOWN = 12;
const TOP_SIZE = 5;
const MIN_VOTES = 2;

export interface ReadingStats {
  catalogSize: number;
  totalReadings: number;
  people: Array<{ userId: string; name: string; read: number; percent: number; ratings: number }>;
  currentReadings: Array<{ userId: string; name: string; bookId: string; title: string }>;
  months: Array<{ month: string; count: number }>;
  years: Array<{ year: string; count: number }>;
  topRated: Array<{ bookId: string; title: string; average: number; votes: number }>;
  topAuthors: Array<{ name: string; count: number }>;
  genres: Array<{ genre: GenreKey | null; count: number }>;
  pairs: Array<{ userIds: [string, string]; names: [string, string]; count: number }>;
}

type PersonRow = { id: string; name: string; read: number; ratings: number };
type CurrentRow = { user_id: string; name: string; book_id: string; title: string };
type RatedRow = { id: string; title: string; average: number; votes: number };
type AuthorRow = { name: string; count: number };
type GenreRow = { genre: GenreKey | null; count: number };
type PairRow = { id_a: string; name_a: string; id_b: string; name_b: string; count: number };
type HourRow = { hour: string | null; count: number };

const rows = <Row>(result: D1Result | undefined): Row[] => (result?.results ?? []) as Row[];

/**
 * Letture per mese (ultimi 12, anche a zero) e per anno, in ora italiana. Arrivano già contate per ora
 * UTC: lo scarto dell'Italia è sempre di ore intere, quindi il mese resta esatto e il lavoro non cresce
 * con il numero di letture. Le date non valide (strftime → NULL) restano fuori dall'andamento.
 */
function readingTrend(hours: readonly HourRow[], now: Date): Pick<ReadingStats, "months" | "years"> {
  const byMonth = new Map<string, number>();
  for (const { hour, count } of hours) {
    if (hour === null) continue;
    const month = romeMonthKey(`${hour}:00:00.000Z`);
    byMonth.set(month, (byMonth.get(month) ?? 0) + count);
  }
  const byYear = new Map<string, number>();
  for (const [month, count] of byMonth) byYear.set(month.slice(0, 4), (byYear.get(month.slice(0, 4)) ?? 0) + count);
  return {
    months: lastMonths(now, MONTHS_SHOWN).map((month) => ({ month, count: byMonth.get(month) ?? 0 })),
    years: [...byYear].sort(([a], [b]) => a.localeCompare(b)).map(([year, count]) => ({ year, count })),
  };
}

export async function getReadingStats(db: Db, now: Date = new Date()): Promise<ReadingStats> {
  const [totals, people, current, hours, rated, authors, genres, pairs] = await runBatch(db, [
    sql`SELECT (SELECT count(*) FROM book) AS books, (SELECT count(*) FROM book_reading) AS readings`,
    sql`SELECT u.id, u.name, count(r.book_id) AS read, count(r.rating) AS ratings
        FROM user u LEFT JOIN book_reading r ON r.user_id = u.id
        WHERE u.active = 1 GROUP BY u.id ORDER BY read DESC, u.name COLLATE NOCASE`,
    sql`SELECT u.id AS user_id, u.name, b.id AS book_id, b.title
        FROM book_current_reading c JOIN user u ON u.id = c.user_id AND u.active = 1 JOIN book b ON b.id = c.book_id
        ORDER BY u.name COLLATE NOCASE, b.title COLLATE NOCASE`,
    sql`SELECT strftime('%Y-%m-%dT%H', created_at) AS hour, count(*) AS count FROM book_reading GROUP BY hour`,
    sql`SELECT b.id, b.title, avg(r.rating) AS average, count(r.rating) AS votes
        FROM book_reading r JOIN book b ON b.id = r.book_id WHERE r.rating IS NOT NULL
        GROUP BY b.id HAVING votes >= ${MIN_VOTES} ORDER BY average DESC, votes DESC, b.title COLLATE NOCASE LIMIT ${TOP_SIZE}`,
    // Ogni autore di un libro conta, una volta per lettura; stesso nome con maiuscole o spazi diversi = stesso autore.
    sql`SELECT min(trim(a.value)) AS name, count(DISTINCT r.user_id || '|' || r.book_id) AS count
        FROM book_reading r JOIN book b ON b.id = r.book_id, json_each(b.authors) a
        WHERE trim(a.value) <> '' GROUP BY lower(trim(a.value)) ORDER BY count DESC, name COLLATE NOCASE LIMIT ${TOP_SIZE}`,
    sql`SELECT b.genre, count(*) AS count FROM book_reading r JOIN book b ON b.id = r.book_id
        GROUP BY b.genre ORDER BY b.genre IS NULL, count DESC, b.genre`,
    sql`SELECT ua.id AS id_a, ua.name AS name_a, ub.id AS id_b, ub.name AS name_b, count(*) AS count
        FROM book_reading ra JOIN book_reading rb ON rb.book_id = ra.book_id AND ra.user_id < rb.user_id
        JOIN user ua ON ua.id = ra.user_id AND ua.active = 1 JOIN user ub ON ub.id = rb.user_id AND ub.active = 1
        GROUP BY ra.user_id, rb.user_id ORDER BY count DESC, min(ua.name, ub.name) COLLATE NOCASE, max(ua.name, ub.name) COLLATE NOCASE LIMIT ${TOP_SIZE}`,
  ]);

  const { books: catalogSize = 0, readings: totalReadings = 0 } = rows<{ books: number; readings: number }>(totals)[0] ?? {};
  return {
    catalogSize,
    totalReadings,
    people: rows<PersonRow>(people).map((row) => ({
      userId: row.id,
      name: row.name,
      read: row.read,
      percent: catalogSize > 0 ? Math.round((row.read * 100) / catalogSize) : 0,
      ratings: row.ratings,
    })),
    currentReadings: rows<CurrentRow>(current).map((row) => ({ userId: row.user_id, name: row.name, bookId: row.book_id, title: row.title })),
    ...readingTrend(rows<HourRow>(hours), now),
    // Media con una cifra decimale, come nella scheda del libro.
    topRated: rows<RatedRow>(rated).map((row) => ({ bookId: row.id, title: row.title, average: Math.round(row.average * 10) / 10, votes: row.votes })),
    topAuthors: rows<AuthorRow>(authors),
    genres: rows<GenreRow>(genres),
    pairs: rows<PairRow>(pairs).map((row) => {
      // In ordine alfabetico, come nell'ORDER BY.
      const [first, second] = row.name_a <= row.name_b ? [{ id: row.id_a, name: row.name_a }, { id: row.id_b, name: row.name_b }] : [{ id: row.id_b, name: row.name_b }, { id: row.id_a, name: row.name_a }];
      return { userIds: [first.id, second.id], names: [first.name, second.name], count: row.count };
    }),
  };
}
