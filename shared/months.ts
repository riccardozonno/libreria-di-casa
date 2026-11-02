// Mesi in ora italiana ("AAAA-MM"): le date nel database sono in UTC, le statistiche si leggono in Italia.

const romeMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" });

/** Mese italiano di un istante, es. "2026-12-31T23:30:00Z" → "2027-01". */
export function romeMonthKey(date: string | Date): string {
  const parts = romeMonth.formatToParts(typeof date === "string" ? new Date(date) : date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}`;
}

/** Gli ultimi `count` mesi italiani fino a quello di `now` compreso, dal più vecchio. */
export function lastMonths(now: Date, count: number): string[] {
  const [year, month] = romeMonthKey(now).split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const offset = year * 12 + (month - 1) - (count - 1 - index);
    return `${Math.floor(offset / 12)}-${String((offset % 12) + 1).padStart(2, "0")}`;
  });
}
