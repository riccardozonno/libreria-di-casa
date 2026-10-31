// Ripristino guidato di HOME LIBRARY da un backup restic, in un database D1 e un bucket R2 VUOTI.
//
//   node scripts/backup/restore.mjs --local --persist-to .wrangler/restore-test --database homelibrary-restore --bucket homelibrary-restore-covers
//   node scripts/backup/restore.mjs --remote --database <nome D1 nuovo> --bucket <bucket nuovo> [--snapshot <id>] [--yes]
//
// Online servono anche R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY con permesso di scrittura sul bucket.
// Passi: 1) estrae lo snapshot; 2) controlla che la destinazione sia vuota; 3) conferma; 4) migrazioni del
// backup + dati; 5) copertine; 6) verifica (righe, indice di ricerca, copertine).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { compareCounts, countsQuery } from "./lib.mjs";
import { d1Query, log, restic, run, wrangler } from "./shell.mjs";

const { values } = parseArgs({
  options: {
    remote: { type: "boolean", default: false },
    local: { type: "boolean", default: false },
    "persist-to": { type: "string" },
    database: { type: "string" },
    bucket: { type: "string" },
    snapshot: { type: "string", default: "latest" },
    yes: { type: "boolean", default: false },
  },
});
if (values.remote === values.local) throw new Error("Indica --remote oppure --local.");
if (!values.database || !values.bucket) throw new Error("Indica --database e --bucket di destinazione.");
for (const name of ["RESTIC_REPOSITORY", "RESTIC_PASSWORD"]) if (!process.env[name]) throw new Error(`Variabile ${name} mancante.`);

const work = path.resolve(process.env.RESTORE_WORK_DIR ?? ".wrangler/restore-work");
const where = values.remote ? ["--remote"] : ["--local", ...(values["persist-to"] ? ["--persist-to", values["persist-to"]] : [])];

function findFile(directory, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}

function imageType(file) {
  const bytes = readFileSync(file).subarray(0, 12);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (bytes.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  return "application/octet-stream";
}

/** Configurazione wrangler temporanea che punta alla destinazione (non tocca wrangler.jsonc). */
function writeTargetConfig(migrationsDir) {
  let databaseId = `ripristino-${values.database}`;
  if (values.remote) {
    const databases = JSON.parse(wrangler(["d1", "list", "--json"]));
    const found = databases.find((database) => database.name === values.database);
    if (!found) throw new Error(`Il database "${values.database}" non esiste: crealo prima con "pnpm exec wrangler d1 create ${values.database}".`);
    databaseId = found.uuid;
  }
  const config = {
    name: "homelibrary-ripristino",
    compatibility_date: "2026-10-20",
    d1_databases: [{ binding: "DB", database_name: values.database, database_id: databaseId, migrations_dir: migrationsDir }],
    r2_buckets: [{ binding: "COVERS", bucket_name: values.bucket }],
  };
  const file = path.resolve(".wrangler/restore.wrangler.json");
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}

log(`1/6 Estraggo lo snapshot "${values.snapshot}" (nessuna modifica ai dati)`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
restic(["restore", values.snapshot, "--target", work]);
const manifestFile = findFile(work, "manifest.json");
if (!manifestFile) throw new Error("Lo snapshot non contiene manifest.json: non è un backup di HOME LIBRARY.");
const root = path.dirname(manifestFile);
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
log(`Backup del ${manifest.createdAt} (${manifest.source}): ${JSON.stringify(manifest.counts)} · ${manifest.covers} copertine`);

log("2/6 Controllo che la destinazione sia vuota");
const config = writeTargetConfig(path.join(root, "migrations"));
const target = { database: "DB", remote: values.remote, persistTo: values["persist-to"], config };
const existing = d1Query("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'book'", target)[0]?.n ?? 0;
if (existing > 0 && (d1Query("SELECT count(*) AS n FROM book", target)[0]?.n ?? 0) > 0) {
  throw new Error(`Il database "${values.database}" contiene già dei libri: il ripristino scrive solo in un database vuoto.`);
}

log("3/6 Conferma");
if (!values.yes) {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await prompt.question(`Ripristino in D1 "${values.database}" e R2 "${values.bucket}" (${values.remote ? "ONLINE" : "locale"}). Scrivi RIPRISTINA per continuare: `);
  prompt.close();
  if (answer.trim() !== "RIPRISTINA") throw new Error("Annullato.");
}

log("4/6 Schema (migrazioni del backup) e dati");
wrangler(["d1", "migrations", "apply", "DB", ...where, "--config", config]);
wrangler(["d1", "execute", "DB", ...where, "--config", config, "--file", path.join(root, "data.sql"), "--yes"]);

log("5/6 Copertine");
const coversDir = path.join(root, "covers");
const covers = existsSync(coversDir) ? readdirSync(coversDir) : [];
for (const key of covers) {
  wrangler(["r2", "object", "put", `${values.bucket}/${key}`, ...where, "--file", path.join(coversDir, key), "--content-type", imageType(path.join(coversDir, key))]);
}

log("6/6 Verifica");
const problems = compareCounts(manifest.counts, d1Query(countsQuery(), target)[0] ?? {});
const indexed = d1Query("SELECT (SELECT count(*) FROM book_fts) AS fts, (SELECT count(*) FROM book) AS books", target)[0];
if (indexed.fts !== indexed.books) problems.push(`indice di ricerca: ${indexed.fts} voci per ${indexed.books} libri`);
const coverKeys = d1Query("SELECT cover_key FROM book WHERE cover_key IS NOT NULL", target).map((row) => row.cover_key);
const missing = coverKeys.filter((key) => !covers.includes(key));
if (missing.length > 0) problems.push(`copertine mancanti: ${missing.slice(0, 5).join(", ")}`);
for (const key of coverKeys.filter((name) => covers.includes(name))) {
  // Riletta dal bucket di destinazione e confrontata byte per byte con quella del backup.
  const check = path.join(work, "verifica-copertina");
  run("pnpm", ["exec", "wrangler", "r2", "object", "get", `${values.bucket}/${key}`, ...where, "--file", check]);
  if (!readFileSync(check).equals(readFileSync(path.join(coversDir, key)))) problems.push(`copertina diversa dal backup: ${key}`);
}

rmSync(work, { recursive: true, force: true });
if (problems.length > 0) throw new Error(`Ripristino NON verificato:\n- ${problems.join("\n- ")}`);
log(`Ripristino verificato: righe identiche al backup, indice di ricerca completo, ${coverKeys.length} copertine presenti.`);
