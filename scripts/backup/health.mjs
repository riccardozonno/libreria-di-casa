// Controllo settimanale di HOME LIBRARY (GitHub Actions, il lunedì). Esce con errore se qualcosa
// non va: GitHub manda un'email. Legge dalle statistiche di Cloudflare gli esiti delle richieste
// degli ultimi 7 giorni (rifiuti per limite di CPU, errori) e i dati del database D1.
//
//   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/backup/health.mjs
import { evaluateHealth } from "./lib.mjs";
import { log, wrangler } from "./shell.mjs";

const WORKER = "homelibrary";
const DATABASE = "homelibrary";
const DAYS = 7;

for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) if (!process.env[name]) throw new Error(`Variabile ${name} mancante.`);

const query = `query Salute($account: string!, $script: string!, $since: Time!, $until: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    workersInvocationsAdaptive(limit: 1000, filter: { scriptName: $script, datetime_geq: $since, datetime_leq: $until }) {
      sum { requests }
      quantiles { cpuTimeP99 }
      dimensions { status }
    }
  } }
}`;
const until = new Date();
const since = new Date(until.getTime() - DAYS * 24 * 3600 * 1000);
const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { account: process.env.CLOUDFLARE_ACCOUNT_ID, script: WORKER, since: since.toISOString(), until: until.toISOString() } }),
});
const body = await response.json();
if (!response.ok || body.errors?.length) throw new Error(`Statistiche Cloudflare non disponibili: ${JSON.stringify(body.errors ?? response.status)}`);

const rows = body.data.viewer.accounts[0]?.workersInvocationsAdaptive ?? [];
const statuses = {};
let cpuP99Us = 0;
for (const row of rows) {
  statuses[row.dimensions.status] = (statuses[row.dimensions.status] ?? 0) + row.sum.requests;
  cpuP99Us = Math.max(cpuP99Us, row.quantiles.cpuTimeP99);
}
const database = JSON.parse(wrangler(["d1", "info", DATABASE, "--json"]));

const report = { periodo: `ultimi ${DAYS} giorni`, esiti: statuses, cpuP99Ms: Math.round(cpuP99Us / 100) / 10, database: { byte: database.database_size, righeLette24h: database.rows_read_24h, righeScritte24h: database.rows_written_24h } };
log(`Rapporto: ${JSON.stringify(report)}`);
const problems = evaluateHealth({ statuses, cpuP99Ms: report.cpuP99Ms, database });
if (problems.length > 0) {
  console.error(`Problemi trovati:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
log("Tutto in ordine.");
