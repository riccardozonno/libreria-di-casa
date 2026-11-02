import { describe, expect, it } from "vitest";
import { RESTIC_TIMEOUT_MS, run } from "../../scripts/backup/shell.mjs";

// Comandi esterni del backup: un comando appeso (es. restic che riprova verso B2) deve fermarsi
// con un messaggio e le sue ultime righe, non far scadere in silenzio il job di GitHub (02/11/2026).

describe("comandi esterni del backup", () => {
  it("restituisce l'output", () => {
    expect(run("sh", ["-c", "echo ciao"])).toBe("ciao\n");
  });

  it("errore: il messaggio contiene le ultime righe di stderr", () => {
    expect(() => run("sh", ["-c", "echo 'chiave B2 non valida' >&2; exit 3"])).toThrow(/non riuscito[\s\S]*chiave B2 non valida/);
  });

  it("comando appeso: si ferma al tempo massimo e dice cosa stava scrivendo", () => {
    expect(() => run("sh", ["-c", "echo 'Load(data/ab12) returned error, retrying' >&2; exec sleep 5"], { timeout: 300 })).toThrow(
      /non ha finito entro 0,3 secondi[\s\S]*retrying/,
    );
  });

  it("restic ha un tempo massimo sotto il limite di 30 minuti del job", () => {
    expect(RESTIC_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RESTIC_TIMEOUT_MS).toBeLessThan(30 * 60 * 1000);
  });
});
