// Backup di HOME LIBRARY: dati D1 (tabella per tabella), copertine R2, migrazioni e manifesto,
// cifrati con restic. Online lo lancia GitHub Actions ogni notte (.github/workflows/backup.yml).
//
//   node scripts/backup/run.mjs --remote                         (database e copertine online)
//   node scripts/backup/run.mjs --local                          (prova sul Mac: database di sviluppo)
//
// Variabili: RESTIC_REPOSITORY, RESTIC_PASSWORD (+ B2_ACCOUNT_ID, B2_ACCOUNT_KEY per B2),
// RESTIC_BIN (facoltativa), R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY (copertine con rclone).
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { BACKUP_TABLES, countsQuery, dataFileName, isWeeklyCheckDay, RETENTION_ARGS, tableExportArgs } from "./lib.mjs";
import { d1Query, log, restic, run, wrangler } from "./shell.mjs";

const COVERS_BUCKET = "homelibrary-covers";

// Sempre dalla radice del progetto (migrations/, wrangler.jsonc), da qualunque cartella si lanci.
process.chdir(path.resolve(import.meta.dirname, "../.."));

const { values } = parseArgs({ options: { remote: { type: "boolean", default: false }, local: { type: "boolean", default: false } } });
if (values.remote === values.local) throw new Error("Indica --remote oppure --local.");
for (const name of ["RESTIC_REPOSITORY", "RESTIC_PASSWORD"]) if (!process.env[name]) throw new Error(`Variabile ${name} mancante.`);

const target = { database: "DB", remote: values.remote };
const work = process.env.BACKUP_WORK_DIR ?? mkdtempSync(path.join(tmpdir(), "homelibrary-backup-"));
rmSync(work, { recursive: true, force: true });
mkdirSync(path.join(work, "covers"), { recursive: true });
mkdirSync(path.join(work, "data"), { recursive: true });
// I dati estratti sono in chiaro: si cancellano anche se qualcosa va storto a metà.
process.on("exit", () => rmSync(work, { recursive: true, force: true }));

log("1/5 Export dei dati D1, una tabella alla volta nell'ordine delle dipendenze");
for (const table of BACKUP_TABLES) {
  wrangler(tableExportArgs({ remote: target.remote, table, output: path.join(work, "data", dataFileName(table)) }));
}

log("2/5 Conteggi per la verifica del ripristino");
const counts = d1Query(countsQuery(), target)[0];

log("3/5 Copertine");
const coverKeys = d1Query("SELECT cover_key FROM book WHERE cover_key IS NOT NULL", target).map((row) => row.cover_key);
if (target.remote) {
  // rclone con le credenziali S3 di R2 (sola lettura) passate come variabili d'ambiente.
  for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) if (!process.env[name]) throw new Error(`Variabile ${name} mancante.`);
  run("rclone", ["copy", `r2:${COVERS_BUCKET}`, path.join(work, "covers"), "--fast-list", "--transfers", "16"], {
    env: {
      ...process.env,
      RCLONE_CONFIG_R2_TYPE: "s3",
      RCLONE_CONFIG_R2_PROVIDER: "Cloudflare",
      RCLONE_CONFIG_R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      RCLONE_CONFIG_R2_ENDPOINT: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      RCLONE_CONFIG_R2_NO_CHECK_BUCKET: "true",
    },
  });
} else {
  for (const key of coverKeys) {
    wrangler(["r2", "object", "get", `${COVERS_BUCKET}/${key}`, "--local", "--file", path.join(work, "covers", key)]);
  }
}
const savedCovers = readdirSync(path.join(work, "covers"));
const missingCovers = coverKeys.filter((key) => !savedCovers.includes(key));
if (missingCovers.length > 0) throw new Error(`Copertine mancanti nel backup: ${missingCovers.slice(0, 5).join(", ")}`);

log("4/5 Migrazioni e manifesto");
cpSync("migrations", path.join(work, "migrations"), { recursive: true });
const manifest = {
  createdAt: new Date().toISOString(),
  source: target.remote ? "online" : "locale",
  commit: process.env.GITHUB_SHA ?? run("git", ["rev-parse", "HEAD"]).trim(),
  counts,
  covers: coverKeys.length,
};
writeFileSync(path.join(work, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

log("5/5 Archivio cifrato (restic)");
try {
  restic(["cat", "config"]);
} catch {
  log("Archivio nuovo: inizializzazione");
  restic(["init"]);
}
restic(["backup", ".", "--host", "homelibrary", "--tag", "homelibrary"], { cwd: work });
restic(["forget", "--host", "homelibrary", "--tag", "homelibrary", ...RETENTION_ARGS]);
if (isWeeklyCheckDay(new Date())) restic(["check", "--read-data-subset=5%"]);
else restic(["check"]);

rmSync(work, { recursive: true, force: true });
log(`Backup completato: ${JSON.stringify(counts)} · ${coverKeys.length} copertine`);
