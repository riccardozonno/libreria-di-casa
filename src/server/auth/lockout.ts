import "server-only";
import { prisma } from "../db";

// Blocco per account (ADR-0003): 5 errori consecutivi → 15 minuti di blocco.
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export interface LoginState {
  id: string;
  active: boolean;
  lockedUntil: Date | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findLoginState(email: string): Promise<LoginState | null> {
  return prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, active: true, lockedUntil: true },
  });
}

export function isLocked(state: LoginState, now: Date = new Date()): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

/** Incremento atomico: due tentativi simultanei non perdono conteggi. Restituisce true se l'account è ora bloccato. */
export async function registerFailedLogin(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>`
    UPDATE "User"
    SET "failedLoginCount" = CASE WHEN "failedLoginCount" + 1 >= ${MAX_FAILED_LOGINS} THEN 0 ELSE "failedLoginCount" + 1 END,
        "lockedUntil" = CASE
          WHEN "failedLoginCount" + 1 >= ${MAX_FAILED_LOGINS} THEN now() + make_interval(mins => ${LOCKOUT_MINUTES})
          ELSE "lockedUntil" END
    WHERE id = ${userId}::uuid
    RETURNING ("lockedUntil" IS NOT NULL AND "lockedUntil" > now()) AS locked`;
  return rows[0]?.locked ?? false;
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}
