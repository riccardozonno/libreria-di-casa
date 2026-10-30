import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { E2E_STATE, EDITOR_LOCATION, USERS } from "./fixtures.ts";

// D1 locale degli E2E ricreato da zero PRIMA di avviare il server (comando del webServer di Playwright):
// migrazioni vere, poi un utente per ruolo e la sede dell'editor.  Uso: node tests/e2e/reset-db.ts

function wrangler(args: string[]): void {
  execFileSync("pnpm", ["exec", "wrangler", ...args, "--local", "--persist-to", E2E_STATE], { stdio: "pipe" });
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function resetDatabase(): void {
  rmSync(E2E_STATE, { recursive: true, force: true });
  wrangler(["d1", "migrations", "apply", "DB"]);
  const users = Object.values(USERS).map((user) => `(${quote(crypto.randomUUID())}, ${quote(user.email)}, ${quote(user.name)}, ${quote(user.role)})`);
  const sql = [
    `INSERT INTO user (id, email, name, role) VALUES ${users.join(", ")};`,
    `INSERT INTO location (id, name, name_key, color) VALUES (${quote(EDITOR_LOCATION.id)}, ${quote(EDITOR_LOCATION.name)}, ${quote(EDITOR_LOCATION.name.toLowerCase())}, ${quote(EDITOR_LOCATION.color)});`,
    `INSERT INTO location_editor (user_id, location_id) SELECT id, ${quote(EDITOR_LOCATION.id)} FROM user WHERE email = ${quote(USERS.editor.email)};`,
  ].join("\n");
  wrangler(["d1", "execute", "DB", "--command", sql]);
}

resetDatabase();
