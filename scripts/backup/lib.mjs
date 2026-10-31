// Regole del backup (fase 6): funzioni pure, testate in tests/unit/backup-lib.test.ts.

/** Tabelle salvate, in ordine di dipendenza (prima quelle a cui le altre fanno riferimento). */
export const BACKUP_TABLES = ["user", "location", "location_editor", "book", "copy", "copy_movement", "book_reading", "audit_log", "isbn_cache"];

/** Conservazione restic: 7 giornalieri, 4 settimanali, 6 mensili. */
export const RETENTION_ARGS = ["--keep-daily", "7", "--keep-weekly", "4", "--keep-monthly", "6", "--prune"];

/**
 * Argomenti di `wrangler` per l'export dei soli dati di UNA tabella. Una alla volta perché wrangler
 * scrive le tabelle in ordine alfabetico, e online D1 importa a pezzi: una riga che rimanda a una
 * tabella non ancora caricata verrebbe rifiutata. L'export completo invece rifiuta le tabelle FTS5.
 * In locale wrangler esporta solo dal database di sviluppo standard (.wrangler/state).
 * @param {{ remote: boolean, table: string, output: string, database?: string }} options
 * @returns {string[]}
 */
export function tableExportArgs({ remote, table, output, database = "DB" }) {
  return ["d1", "export", database, remote ? "--remote" : "--local", "--no-schema", "--table", table, "--output", output];
}

/** "01-user.sql", "02-location.sql"…: il numero è la posizione nell'ordine delle dipendenze. */
export function dataFileName(table) {
  return `${String(BACKUP_TABLES.indexOf(table) + 1).padStart(2, "0")}-${table}.sql`;
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

/** Esiti delle richieste che non indicano un problema dell'app. */
const HARMLESS_STATUSES = new Set(["success", "clientDisconnected"]);
const MAX_DATABASE_BYTES = 1e9;
const MAX_ROWS_READ_24H = 2_500_000; // metà del limite gratuito di D1 (5 milioni al giorno)
const MAX_ROWS_WRITTEN_24H = 50_000; // metà del limite gratuito di D1 (100 mila al giorno)

/**
 * Problemi da segnalare nel controllo settimanale (lista vuota = tutto in ordine).
 * @param {{ statuses: Record<string, number>, cpuP99Ms: number, database: { database_size: number, rows_read_24h: number, rows_written_24h: number } }} health
 * @returns {string[]}
 */
export function evaluateHealth({ statuses, database }) {
  const problems = Object.entries(statuses)
    .filter(([status, count]) => !HARMLESS_STATUSES.has(status) && count > 0)
    .map(([status, count]) => `${count} richieste con esito ${status}`);
  if (database.database_size > MAX_DATABASE_BYTES) problems.push(`database di ${Math.round(database.database_size / 1e6)} MB (soglia 1 GB, limite gratuito 5 GB)`);
  if (database.rows_read_24h > MAX_ROWS_READ_24H) problems.push(`${database.rows_read_24h} righe lette nelle ultime 24 ore (metà del limite gratuito: ${MAX_ROWS_READ_24H})`);
  if (database.rows_written_24h > MAX_ROWS_WRITTEN_24H) problems.push(`${database.rows_written_24h} righe scritte nelle ultime 24 ore (metà del limite gratuito: ${MAX_ROWS_WRITTEN_24H})`);
  return problems;
}
