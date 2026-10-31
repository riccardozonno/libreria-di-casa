import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { BACKUP_TABLES, compareCounts, countsQuery, dataFileName, evaluateHealth, isWeeklyCheckDay, RETENTION_ARGS, tableExportArgs } from "../../scripts/backup/lib.mjs";
import * as schema from "../../worker/db/schema";

// Regole del backup (ADR-0014, fase 6): cosa si salva, in che ordine, quanto si conserva, come si verifica.

const tables = (Object.values(schema) as unknown[]).filter((value): value is SQLiteTable => typeof value === "object" && value !== null && Symbol.for("drizzle:IsDrizzleTable") in value);

describe("tabelle salvate", () => {
  it("ci sono tutte le tabelle dello schema (una tabella nuova senza backup fa fallire il test)", () => {
    const names = tables.map((table) => getTableConfig(table).name).sort();
    expect([...BACKUP_TABLES].sort()).toEqual(names);
  });

  it("ogni tabella viene dopo quelle a cui fa riferimento (ripristino senza errori di chiavi esterne)", () => {
    for (const table of tables) {
      const config = getTableConfig(table);
      for (const foreignKey of config.foreignKeys) {
        const target = getTableConfig(foreignKey.reference().foreignTable).name;
        if (target === config.name) continue;
        expect(BACKUP_TABLES.indexOf(target), `${config.name} → ${target}`).toBeLessThan(BACKUP_TABLES.indexOf(config.name));
      }
    }
  });
});

describe("comandi", () => {
  it("export dei soli dati, una tabella alla volta: wrangler le scriverebbe in ordine alfabetico", () => {
    expect(tableExportArgs({ remote: true, table: "copy", output: "/tmp/04-copy.sql" })).toEqual([
      "d1", "export", "DB", "--remote", "--no-schema", "--table", "copy", "--output", "/tmp/04-copy.sql",
    ]);
    // In locale wrangler esporta solo dal database di sviluppo standard (.wrangler/state).
    expect(tableExportArgs({ remote: false, table: "user", output: "x.sql" })).toContain("--local");
  });

  it("i file dei dati sono numerati nell'ordine delle dipendenze, così il ripristino li carica in quell'ordine", () => {
    expect(dataFileName("user")).toBe("01-user.sql");
    expect(dataFileName("isbn_cache")).toBe("09-isbn_cache.sql");
    expect(BACKUP_TABLES.map(dataFileName)).toEqual([...BACKUP_TABLES.map(dataFileName)].sort());
  });

  it("conservazione 7 giornalieri, 4 settimanali, 6 mensili", () => {
    expect(RETENTION_ARGS).toEqual(["--keep-daily", "7", "--keep-weekly", "4", "--keep-monthly", "6", "--prune"]);
  });

  it("il controllo approfondito si fa la domenica", () => {
    expect(isWeeklyCheckDay(new Date("2026-11-01T02:00:00Z"))).toBe(true);
    expect(isWeeklyCheckDay(new Date("2026-11-02T02:00:00Z"))).toBe(false);
  });
});

describe("verifica del ripristino", () => {
  it("conta tutte le tabelle in una sola riga (D1 limita le UNION in una query)", () => {
    const sql = countsQuery();
    expect(sql).not.toContain("UNION");
    for (const table of BACKUP_TABLES) expect(sql).toContain(`(SELECT count(*) FROM "${table}") AS "${table}"`);
  });

  it("segnala le tabelle con un numero di righe diverso da quello salvato", () => {
    expect(compareCounts({ book: 10, copy: 12 }, { book: 10, copy: 12 })).toEqual([]);
    expect(compareCounts({ book: 10, copy: 12 }, { book: 9, copy: 12 })).toEqual(["book: attese 10, trovate 9"]);
    expect(compareCounts({ book: 10 }, {})).toEqual(["book: attese 10, trovate 0"]);
  });
});

describe("controllo settimanale", () => {
  const healthy = {
    statuses: { success: 1200, clientDisconnected: 3 },
    cpuP99Ms: 6,
    database: { database_size: 200_000, rows_read_24h: 4_000, rows_written_24h: 400 },
  };

  it("tutto in ordine: nessun problema", () => {
    expect(evaluateHealth(healthy)).toEqual([]);
  });

  it("segnala richieste rifiutate per il limite di CPU o finite in errore", () => {
    expect(evaluateHealth({ ...healthy, statuses: { success: 10, exceededResources: 2, scriptThrewException: 1 } })).toEqual([
      "2 richieste con esito exceededResources",
      "1 richieste con esito scriptThrewException",
    ]);
  });

  it("segnala un database oltre 1 GB e un consumo giornaliero oltre metà dei limiti gratuiti di D1", () => {
    const problems = evaluateHealth({ ...healthy, database: { database_size: 1.2e9, rows_read_24h: 3_000_000, rows_written_24h: 60_000 } });
    expect(problems).toEqual([
      "database di 1200 MB (soglia 1 GB, limite gratuito 5 GB)",
      "3000000 righe lette nelle ultime 24 ore (metà del limite gratuito: 2500000)",
      "60000 righe scritte nelle ultime 24 ore (metà del limite gratuito: 50000)",
    ]);
  });
});
