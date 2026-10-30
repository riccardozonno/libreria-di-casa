// Crea il primo amministratore nel database D1.
//   pnpm admin:create --email tu@example.com --name "Nome"            (database locale)
//   pnpm admin:create --email tu@example.com --name "Nome" --remote   (database online)
// L'email deve essere la stessa che userai su Cloudflare Access.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { buildCreateAdminSql } from "./create-admin-sql.mjs";

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" }, remote: { type: "boolean", default: false } },
});

if (!values.email || !values.name) {
  console.error('Uso: pnpm admin:create --email tu@example.com --name "Nome" [--remote]');
  process.exit(1);
}

let sql;
try {
  sql = buildCreateAdminSql({ email: values.email, name: values.name }, { userId: randomUUID(), auditId: randomUUID() });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const target = values.remote ? "--remote" : "--local";
// Argomenti come elenco (nessuna shell): il SQL non viene mai interpretato dalla shell.
execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "DB", target, "--command", sql], { stdio: "inherit" });
console.warn(`Amministratore creato (${target === "--remote" ? "database online" : "database locale"}).`);
