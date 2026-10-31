// Regole del backup (fase 6): funzioni pure, testate in tests/unit/backup-lib.test.ts.

/** Tabelle salvate, in ordine di dipendenza (prima quelle a cui le altre fanno riferimento). */
export const BACKUP_TABLES = ["user", "location", "location_editor", "book", "copy", "copy_movement", "book_reading", "audit_log", "isbn_cache"];

/** Conservazione restic: 7 giornalieri, 4 settimanali, 6 mensili. */
export const RETENTION_ARGS = ["--keep-daily", "7", "--keep-weekly", "4", "--keep-monthly", "6", "--prune"];

/**
 * Argomenti di `wrangler` per l'export dei soli dati, tabella per tabella: l'export completo di D1
 * rifiuta i database con tabelle virtuali (FTS5); l'indice di ricerca si ricostruisce dai trigger.
 * In locale wrangler esporta solo dal database di sviluppo standard (.wrangler/state).
 * @param {{ remote: boolean, output: string, database?: string }} options
 * @returns {string[]}
 */
export function exportArgs({ remote, output, database = "DB" }) {
  return [
    "d1", "export", database,
    remote ? "--remote" : "--local",
    "--no-schema",
    ...BACKUP_TABLES.flatMap((table) => ["--table", table]),
    "--output", output,
  ];
}

/** Domenica: controllo di integrità più approfondito dell'archivio. */
export function isWeeklyCheckDay(date) {
  return date.getUTCDay() === 0;
}

/**
 * Differenze fra le righe salvate e quelle trovate dopo il ripristino.
 * @param {Record<string, number>} expected
 * @param {Record<string, number>} actual
 * @returns {string[]}
 */
export function compareCounts(expected, actual) {
  return Object.entries(expected)
    .filter(([table, count]) => (actual[table] ?? 0) !== count)
    .map(([table, count]) => `${table}: attese ${count}, trovate ${actual[table] ?? 0}`);
}

/** Una sola riga con il numero di righe di ogni tabella salvata (D1 limita le UNION in una query). */
export function countsQuery() {
  return `SELECT ${BACKUP_TABLES.map((table) => `(SELECT count(*) FROM "${table}") AS "${table}"`).join(", ")}`;
}
