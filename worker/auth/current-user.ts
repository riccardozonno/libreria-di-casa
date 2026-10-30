import { sql } from "drizzle-orm";
import type { Role } from "../../shared/policy";
import type { Db } from "../db/client";
import type { CurrentUser } from "../env";

export interface StoredUser extends CurrentUser {
  active: boolean;
  sessionsNotBefore: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: number;
  sessions_not_before: string | null;
  editor_location_ids: string;
}

/**
 * Utente e sedi di cui è editor, riletti dal DB a ogni richiesta (ruoli sempre aggiornati).
 * Una sola query: è sul percorso di ogni richiesta, quindi conta per il limite di CPU.
 */
export async function loadUserByEmail(db: Db, email: string): Promise<StoredUser | null> {
  const row = await db.get<UserRow | undefined>(sql`
    SELECT u.id, u.email, u.name, u.role, u.active, u.sessions_not_before,
           (SELECT json_group_array(le.location_id) FROM location_editor le WHERE le.user_id = u.id) AS editor_location_ids
    FROM user u
    WHERE u.email = ${email}`);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active === 1,
    sessionsNotBefore: row.sessions_not_before,
    editorLocationIds: JSON.parse(row.editor_location_ids) as string[],
  };
}
