// Logica della lettura nella scheda del libro, senza React: il selettore «Da leggere · Sto leggendo · Letto»
// e il riepilogo della famiglia. Testata in tests/unit/reading-status-logic.test.ts.

export type ReadingStatus = "TO_READ" | "READING" | "READ";

export interface ApiCall {
  method: "PUT" | "DELETE";
  path: string;
}

const MAX_AVATARS = 4;
const average = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

export function statusOf(hasRead: boolean, isReading: boolean): ReadingStatus {
  if (hasRead) return "READ";
  return isReading ? "READING" : "TO_READ";
}

/**
 * Chiamate per passare da uno stato all'altro, con le API che esistono già. Togliere «letto» cancella anche
 * il voto: chiede conferma. Da «Letto» a «Sto leggendo» si toglie prima «letto» (il server non permette
 * «Sto leggendo» su un libro letto).
 */
export function transition(bookId: string, userId: string, from: ReadingStatus, to: ReadingStatus): { calls: ApiCall[]; needsConfirm: boolean } {
  const reading = `/books/${bookId}/readings/${userId}`;
  const current = `/books/${bookId}/current-readers/${userId}`;
  if (from === to) return { calls: [], needsConfirm: false };
  if (to === "READ") return { calls: [{ method: "PUT", path: reading }], needsConfirm: false };
  if (from === "READ") {
    const calls: ApiCall[] = [{ method: "DELETE", path: reading }];
    if (to === "READING") calls.push({ method: "PUT", path: current });
    return { calls, needsConfirm: true };
  }
  return { calls: [{ method: to === "READING" ? "PUT" : "DELETE", path: current }], needsConfirm: false };
}

/** Iniziali: prima e ultima parola del nome («Admin di prova» → «AP»). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words.at(-1)!.charAt(0) : "";
  return (first + last).toUpperCase();
}

interface Person {
  userId: string;
  name: string;
}

export interface FamilyRow extends Person {
  isMe: boolean;
  rating: number | null;
}

export interface FamilySummary {
  isEmpty: boolean;
  /** Media con una cifra decimale («4,5»), null senza voti. */
  average: string | null;
  /** «2 letti · 1 in lettura», oppure il messaggio quando non c'è nessuno. */
  counts: string;
  avatars: string[];
  moreCount: number;
  readers: FamilyRow[];
  currentReaders: FamilyRow[];
}

const countLabel = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Prima chi ha votato (voto più alto prima), poi chi non ha votato; a parità per nome. */
function byRatingThenName(a: FamilyRow, b: FamilyRow): number {
  if (a.rating !== b.rating) {
    if (a.rating === null) return 1;
    if (b.rating === null) return -1;
    return b.rating - a.rating;
  }
  return a.name.localeCompare(b.name, "it");
}

export function familySummary(input: {
  readings: ReadonlyArray<Person & { rating: number | null }>;
  currentReaders: readonly Person[];
  ratingAverage: number | null;
  ratingCount: number;
  meId: string;
}): FamilySummary {
  const readers = input.readings.map((reading) => ({ ...reading, isMe: reading.userId === input.meId })).sort(byRatingThenName);
  const currentReaders = input.currentReaders.map((reader) => ({ ...reader, isMe: reader.userId === input.meId, rating: null }));
  const people = [...readers, ...currentReaders];
  const parts = [
    readers.length > 0 ? countLabel(readers.length, "letto", "letti") : null,
    currentReaders.length > 0 ? `${currentReaders.length} in lettura` : null,
  ].filter((part): part is string => part !== null);
  return {
    isEmpty: people.length === 0,
    average: input.ratingCount > 0 && input.ratingAverage !== null ? average.format(input.ratingAverage) : null,
    counts: parts.length > 0 ? parts.join(" · ") : "Nessuno l'ha ancora letto o iniziato",
    avatars: people.slice(0, MAX_AVATARS).map((person) => initialsOf(person.name)),
    moreCount: Math.max(0, people.length - MAX_AVATARS),
    readers,
    currentReaders,
  };
}
