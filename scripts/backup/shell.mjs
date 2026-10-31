// Esecuzione dei comandi esterni (wrangler, restic, rclone) senza shell: argomenti come elenco.
import { execFileSync } from "node:child_process";

/** Esegue un comando e restituisce l'output; in caso di errore il messaggio include stderr. */
export function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024, ...options });
  } catch (error) {
    const detail = error.stderr?.toString().trim().split("\n").slice(-5).join("\n") ?? "";
    throw new Error(`${command} ${args.slice(0, 3).join(" ")} … non riuscito\n${detail}`, { cause: error });
  }
}

export const wrangler = (args, options) => run("pnpm", ["exec", "wrangler", ...args], options);

/** restic, oppure un sostituto (es. scripts/backup/restic-docker.sh) indicato in RESTIC_BIN. */
export const restic = (args, options) => run(process.env.RESTIC_BIN ?? "restic", args, options);

/** Risultato JSON di `wrangler d1 execute --json` (prima istruzione). */
export function d1Query(sql, target) {
  const output = wrangler(["d1", "execute", target.database, target.remote ? "--remote" : "--local", ...(target.persistTo ? ["--persist-to", target.persistTo] : []), ...(target.config ? ["--config", target.config] : []), "--json", "--command", sql]);
  const parsed = JSON.parse(output.slice(output.indexOf("[")));
  return parsed[0]?.results ?? [];
}

export function log(message) {
  console.warn(`[${new Date().toISOString()}] ${message}`);
}
