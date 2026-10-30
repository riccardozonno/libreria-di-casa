import { type SQL, sql } from "drizzle-orm";
import { can, type Role } from "../../shared/policy";
import type { NewUserInput, UserInput } from "../../shared/schemas";
import { auditInsert, auditWhen } from "../audit";
import { changedRows, runBatch } from "../db/batch";
import type { Db } from "../db/client";
import { locationEditor, user } from "../db/schema";
import { conflict, DomainError, forbidden, isUniqueViolation, notFound } from "../errors";
import type { Requester } from "../http";

// Gestione utenti (solo admin). Deve restare sempre almeno un amministratore attivo: senza lock in D1,
// la condizione sta dentro le istruzioni del batch (registro, sedi e utente cambiano insieme o niente).

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  locationIds: string[];
}

const lastAdmin = () => conflict("Deve restare almeno un amministratore attivo.");

function assertCanManage(who: Requester): void {
  if (!can(who.actor, { type: "user.manage" })) throw forbidden();
}

/** Le sedi contano solo per gli editor; senza doppioni. */
const editorLinks = (role: Role, locationIds: readonly string[]) => (role === "EDITOR" ? [...new Set(locationIds)] : []);

/** Vera se l'utente può smettere di essere un admin attivo: non lo è, oppure ne resta un altro. */
const keepsAnActiveAdmin = (userId: string): SQL => sql`(
  (SELECT role FROM user WHERE id = ${userId}) != 'ADMIN' OR (SELECT active FROM user WHERE id = ${userId}) = 0
  OR (SELECT count(*) FROM user WHERE role = 'ADMIN' AND active = 1 AND id != ${userId}) > 0)`;

async function assertLocationsExist(db: Db, locationIds: readonly string[]): Promise<void> {
  if (locationIds.length === 0) return;
  const rows = await db.all<{ id: string }>(sql`SELECT id FROM location WHERE id IN (${sql.join(locationIds.map((id) => sql`${id}`), sql`, `)})`);
  if (rows.length !== locationIds.length) throw new DomainError("VALIDATION", "Dati non validi.", { locationIds: "Sede non valida" });
}

async function requireUserRow(db: Db, userId: string) {
  const row = await db.get<{ name: string; role: Role; active: number; location_ids: string } | undefined>(sql`
    SELECT name, role, active, (SELECT json_group_array(location_id) FROM location_editor WHERE user_id = u.id) AS location_ids
    FROM user u WHERE id = ${userId}`);
  if (!row) throw notFound("Utente");
  return { name: row.name, role: row.role, active: row.active === 1, locationIds: (JSON.parse(row.location_ids) as string[]).sort() };
}

export async function listUsers(db: Db, who: Requester): Promise<UserSummary[]> {
  assertCanManage(who);
  const rows = await db.all<{ id: string; name: string; email: string; role: Role; active: number; location_ids: string }>(sql`
    SELECT u.id, u.name, u.email, u.role, u.active,
           (SELECT json_group_array(location_id) FROM location_editor WHERE user_id = u.id) AS location_ids
    FROM user u ORDER BY u.active DESC, u.name COLLATE NOCASE`);
  return rows.map((row) => ({ id: row.id, name: row.name, email: row.email, role: row.role, active: row.active === 1, locationIds: JSON.parse(row.location_ids) as string[] }));
}

export async function createUser(db: Db, who: Requester, input: NewUserInput): Promise<{ userId: string }> {
  assertCanManage(who);
  const locationIds = editorLinks(input.role, input.locationIds);
  await assertLocationsExist(db, locationIds);
  const userId = crypto.randomUUID();
  try {
    await runBatch(db, [
      db.insert(user).values({ id: userId, email: input.email, name: input.name, role: input.role }),
      ...locationIds.map((locationId) => db.insert(locationEditor).values({ userId, locationId })),
      auditInsert(db, who.audit, { action: "user.create", entityType: "user", entityId: userId, data: { email: input.email, role: input.role, locationIds }, ip: who.audit.ip }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("Esiste già un utente con questa email.");
    throw error;
  }
  return { userId };
}

export async function updateUser(db: Db, who: Requester, userId: string, input: UserInput): Promise<void> {
  assertCanManage(who);
  const before = await requireUserRow(db, userId);
  const locationIds = editorLinks(input.role, input.locationIds);
  await assertLocationsExist(db, locationIds);
  const roleChanged = before.role !== input.role;
  const locationsChanged = before.locationIds.join() !== [...locationIds].sort().join();
  if (!roleChanged && !locationsChanged && before.name === input.name) return;

  // Togliere il ruolo di admin richiede che ne resti un altro attivo; altrimenti nessuna condizione.
  const allowed = input.role === "ADMIN" ? sql`1` : keepsAnActiveAdmin(userId);
  const results = await runBatch(db, [
    auditWhen(allowed, who.audit, {
      action: roleChanged ? "user.role_change" : locationsChanged ? "user.locations_change" : "user.update",
      entityType: "user",
      entityId: userId,
      data: { before, after: { name: input.name, role: input.role, locationIds } },
      ip: who.audit.ip,
    }),
    sql`DELETE FROM location_editor WHERE user_id = ${userId} AND ${allowed}`,
    ...locationIds.map((locationId) => sql`INSERT INTO location_editor (user_id, location_id) SELECT ${userId}, ${locationId} WHERE ${allowed}`),
    sql`UPDATE user SET name = ${input.name}, role = ${input.role}, updated_at = ${new Date().toISOString()} WHERE id = ${userId} AND ${allowed}`,
  ]);
  if (!changedRows(results.at(-1))) throw lastAdmin();
}

export async function setUserActive(db: Db, who: Requester, userId: string, active: boolean): Promise<void> {
  assertCanManage(who);
  const before = await requireUserRow(db, userId);
  if (before.active === active) return;
  const allowed = active ? sql`1` : keepsAnActiveAdmin(userId);
  const [, updated] = await runBatch(db, [
    auditWhen(allowed, who.audit, { action: active ? "user.reactivate" : "user.deactivate", entityType: "user", entityId: userId, ip: who.audit.ip }),
    sql`UPDATE user SET active = ${active ? 1 : 0}, updated_at = ${new Date().toISOString()} WHERE id = ${userId} AND ${allowed}`,
  ]);
  if (!changedRows(updated)) throw lastAdmin();
}

/** "Esci da tutti i dispositivi": i token di Access emessi prima di adesso non valgono più. */
export async function signOutEverywhere(db: Db, who: Requester, userId: string): Promise<void> {
  const isSelf = userId === who.audit.id;
  if (!can(who.actor, { type: isSelf ? "profile.manage" : "user.manage" })) throw forbidden();
  const now = new Date().toISOString();
  const [updated] = await runBatch(db, [
    sql`UPDATE user SET sessions_not_before = ${now}, updated_at = ${now} WHERE id = ${userId}`,
    auditInsert(db, who.audit, { action: "user.sign_out_everywhere", entityType: "user", entityId: userId, ip: who.audit.ip }),
  ]);
  if (!changedRows(updated)) throw notFound("Utente");
}
