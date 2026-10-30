import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { locationEditor, user } from "../db/schema";
import type { CurrentUser } from "../env";

export interface StoredUser extends CurrentUser {
  active: boolean;
  sessionsNotBefore: string | null;
}

/** Utente e sedi di cui è editor, riletti dal DB a ogni richiesta (ruoli sempre aggiornati). */
export async function loadUserByEmail(db: Db, email: string): Promise<StoredUser | null> {
  const row = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      sessionsNotBefore: user.sessionsNotBefore,
    })
    .from(user)
    .where(eq(user.email, email))
    .get();
  if (!row) return null;
  const editorOf = await db.select({ locationId: locationEditor.locationId }).from(locationEditor).where(eq(locationEditor.userId, row.id)).all();
  return { ...row, editorLocationIds: editorOf.map((entry) => entry.locationId) };
}
