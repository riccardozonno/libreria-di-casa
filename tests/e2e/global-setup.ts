import { execFileSync } from "node:child_process";

// D1 locale pronto per gli E2E: migrazioni applicate e amministratore di sviluppo presente
// (stessa email di DEV_IDENTITY_EMAIL in .dev.vars.example).
export const E2E_ADMIN = { email: "admin@example.test", name: "Admin di prova" };

function wrangler(args: string[]): string {
  return execFileSync("pnpm", ["exec", "wrangler", ...args], { encoding: "utf8" });
}

export default function globalSetup(): void {
  wrangler(["d1", "migrations", "apply", "DB", "--local"]);
  const output = wrangler(["d1", "execute", "DB", "--local", "--json", "--command", `SELECT count(*) AS n FROM user WHERE email = '${E2E_ADMIN.email}'`]);
  const [result] = JSON.parse(output) as Array<{ results: Array<{ n: number }> }>;
  if (result?.results[0]?.n === 0) {
    execFileSync("node", ["scripts/create-admin.mjs", "--email", E2E_ADMIN.email, "--name", E2E_ADMIN.name], { stdio: "inherit" });
  }
}
