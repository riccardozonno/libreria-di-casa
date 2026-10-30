import type { Actor, Role } from "../shared/policy";

// Tipi condivisi dall'API. `Env` (binding e variabili) è generato da `wrangler types`.

// `wrangler types` lo rende obbligatorio se esiste `.dev.vars`: qui resta facoltativo (in produzione manca).
export type Bindings = Omit<Env, "DEV_IDENTITY_EMAIL" | "GOOGLE_BOOKS_API_KEY" | "CF_API_TOKEN"> & {
  /** Solo sviluppo locale (`.dev.vars`): identità usata quando Access non è configurato. */
  DEV_IDENTITY_EMAIL?: string;
  /** Segreto (`wrangler secret put`): senza chiave Google Books funziona con limiti più bassi. */
  GOOGLE_BOOKS_API_KEY?: string;
  /** Allineamento del gruppo Cloudflare Access con gli utenti attivi (users/access-sync.ts). */
  CF_ACCOUNT_ID?: string;
  ACCESS_GROUP_ID?: string;
  /** Segreto: token Cloudflare con il solo permesso "Access: Groups — Edit". */
  CF_API_TOKEN?: string;
};

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  editorLocationIds: string[];
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: { user: CurrentUser; actor: Actor };
}
