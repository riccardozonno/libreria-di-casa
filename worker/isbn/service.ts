import { sql } from "drizzle-orm";
import { normalizeIsbn } from "../../shared/isbn";
import { can } from "../../shared/policy";
import type { Db } from "../db/client";
import { DomainError, forbidden } from "../errors";
import type { Requester } from "../http";
import { type BookCandidate, type LookupDeps, lookupIsbn } from "./lookup";

// Ricerca ISBN per chi può aggiungere libri. I risultati trovati restano in D1 (validi per tutte le
// istanze); i "non trovato" no, perché possono dipendere da un errore temporaneo di Google.

export interface IsbnLookupResult {
  found: boolean;
  candidate?: BookCandidate;
  existingBookId: string | null;
}

export async function findIsbn(db: Db, who: Requester, rawIsbn: string, deps: LookupDeps): Promise<IsbnLookupResult> {
  const locations = await db.all<{ id: string; archived_at: string | null }>(sql`SELECT id, archived_at FROM location`);
  const refs = locations.map((row) => ({ id: row.id, archived: row.archived_at !== null }));
  if (!can(who.actor, { type: "isbn.lookup", locations: refs })) throw forbidden();
  const isbn13 = normalizeIsbn(rawIsbn);
  if (!isbn13) throw new DomainError("VALIDATION", "ISBN non valido.");

  const existing = await db.get<{ id: string } | undefined>(sql`SELECT id FROM book WHERE isbn13 = ${isbn13}`);
  const existingBookId = existing?.id ?? null;

  const cached = await db.get<{ data: string } | undefined>(sql`SELECT data FROM isbn_cache WHERE isbn13 = ${isbn13}`);
  if (cached) return { found: true, candidate: JSON.parse(cached.data) as BookCandidate, existingBookId };

  const candidate = await lookupIsbn(isbn13, deps);
  if (!candidate) return { found: false, existingBookId };
  await db.run(sql`INSERT OR REPLACE INTO isbn_cache (isbn13, source, data) VALUES (${isbn13}, ${candidate.source}, ${JSON.stringify(candidate)})`);
  return { found: true, candidate, existingBookId };
}
