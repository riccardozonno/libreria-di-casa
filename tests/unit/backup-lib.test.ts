import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { BACKUP_TABLES, compareCounts, countsQuery, exportArgs, isWeeklyCheckDay, RETENTION_ARGS } from "../../scripts/backup/lib.mjs";
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
  it("export dei soli dati, tabella per tabella (l'export completo non funziona con FTS5)", () => {
    expect(exportArgs({ remote: true, output: "/tmp/dati.sql" })).toEqual([
      "d1", "export", "DB", "--remote", "--no-schema",
      ...BACKUP_TABLES.flatMap((table: string) => ["--table", table]),
      "--output", "/tmp/dati.sql",
    ]);
    // In locale wrangler esporta solo dal database di sviluppo standard (.wrangler/state).
    expect(exportArgs({ remote: false, output: "x.sql" })).toContain("--local");
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
