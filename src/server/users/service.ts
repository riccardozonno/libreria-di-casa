import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/client";
import type { CurrentUser } from "../actor";
import { writeAudit } from "../audit";
import { createInviteLink, type AccountLink } from "../auth/invite";
import { normalizeEmail } from "../auth/lockout";
import type { AccountLinkKind } from "../auth/mailer";
import { prisma, type Tx } from "../db";
import { DomainError, forbidden, notFound } from "../errors";
import { isUniqueViolation } from "../locations/service";
import { can } from "../policy";

// Gestione utenti (solo admin). Regola di sicurezza: deve restare sempre almeno un admin attivo.

const userInputSchema = z.object({
  name: z.string().trim().min(1, "Inserisci un nome").max(100, "Massimo 100 caratteri"),
  role: z.enum(["ADMIN", "EDITOR", "READER"]),
  locationIds: z.array(z.string().uuid()).max(50),
});
const newUserSchema = userInputSchema.extend({
  email: z.string().trim().toLowerCase().email("Email non valida").max(200),
});

export interface UserInput {
  name: string;
  role: Role;
  locationIds: string[];
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  twoFactorEnabled: boolean;
  hasPassword: boolean;
  locationIds: string[];
}

// Chiave fissa per pg_advisory_xact_lock: serializza le modifiche che possono togliere un admin.
const LAST_ADMIN_LOCK = 4_151_001;

function assertCanManage(actor: CurrentUser): void {
  if (!can(actor, { type: "user.manage" })) throw forbidden();
}

/** Blocca le modifiche concorrenti e verifica che, senza `userId`, resti almeno un admin attivo. */
async function assertAnotherActiveAdmin(tx: Tx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LAST_ADMIN_LOCK})`;
  const others = await tx.user.count({ where: { role: "ADMIN", active: true, id: { not: userId } } });
  if (others === 0) throw new DomainError("CONFLICT", "Deve restare almeno un amministratore attivo.");
}

function editorLinks(role: Role, locationIds: readonly string[]): string[] {
  return role === "EDITOR" ? [...new Set(locationIds)] : [];
}

export async function listUsers(actor: CurrentUser): Promise<UserSummary[]> {
  assertCanManage(actor);
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      twoFactorEnabled: true,
      editorOf: { select: { locationId: true } },
      accounts: { where: { providerId: "credential" }, select: { password: true } },
    },
  });
  return users.map(({ editorOf, accounts, ...user }) => ({
    ...user,
    hasPassword: accounts.some((account) => account.password !== null),
    locationIds: editorOf.map((link) => link.locationId),
  }));
}

export async function createUser(actor: CurrentUser, input: UserInput & { email: string }): Promise<{ userId: string; link: AccountLink }> {
  assertCanManage(actor);
  const data = newUserSchema.parse(input);
  const email = normalizeEmail(data.email);
  let userId: string;
  try {
    userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email,
          role: data.role,
          editorOf: { create: editorLinks(data.role, data.locationIds).map((locationId) => ({ locationId })) },
        },
        select: { id: true },
      });
      await writeAudit(tx, actor, {
        action: "user.create",
        entityType: "user",
        entityId: user.id,
        data: { email, role: data.role, locationIds: editorLinks(data.role, data.locationIds) },
      });
      return user.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("CONFLICT", "Esiste già un utente con questa email.");
    throw error;
  }
  return { userId, link: await createInviteLink(userId, "invite") };
}

export async function updateUser(actor: CurrentUser, userId: string, input: UserInput): Promise<void> {
  assertCanManage(actor);
  const data = userInputSchema.parse(input);
  const locationIds = editorLinks(data.role, data.locationIds);

  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { id: userId },
      select: { name: true, role: true, editorOf: { select: { locationId: true } } },
    });
    if (!before) throw notFound("Utente");
    if (before.role === "ADMIN" && data.role !== "ADMIN") await assertAnotherActiveAdmin(tx, userId);

    const beforeLocations = before.editorOf.map((link) => link.locationId).sort();
    const roleChanged = before.role !== data.role;
    const locationsChanged = beforeLocations.join() !== [...locationIds].sort().join();

    await tx.user.update({ where: { id: userId }, data: { name: data.name, role: data.role } });
    if (locationsChanged) {
      await tx.locationEditor.deleteMany({ where: { userId } });
      await tx.locationEditor.createMany({ data: locationIds.map((locationId) => ({ userId, locationId })) });
    }
    if (!roleChanged && !locationsChanged && before.name === data.name) return;

    await writeAudit(tx, actor, {
      action: roleChanged ? "user.role_change" : locationsChanged ? "user.locations_change" : "user.update",
      entityType: "user",
      entityId: userId,
      data: {
        before: { name: before.name, role: before.role, locationIds: beforeLocations },
        after: { name: data.name, role: data.role, locationIds },
      },
    });
  });
}

export async function setUserActive(actor: CurrentUser, userId: string, active: boolean): Promise<void> {
  assertCanManage(actor);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { active: true, role: true } });
    if (!user) throw notFound("Utente");
    if (user.active === active) return;
    if (!active && user.role === "ADMIN") await assertAnotherActiveAdmin(tx, userId);

    await tx.user.update({ where: { id: userId }, data: { active, failedLoginCount: 0, lockedUntil: null } });
    if (!active) {
      // Effetto immediato: niente sessioni aperte né link d'invito/reset ancora validi.
      await tx.session.deleteMany({ where: { userId } });
      await tx.verification.deleteMany({ where: { value: userId } });
    }
    await writeAudit(tx, actor, { action: active ? "user.reactivate" : "user.deactivate", entityType: "user", entityId: userId });
  });
}

export async function createAccountLink(actor: CurrentUser, userId: string, kind: AccountLinkKind): Promise<AccountLink> {
  assertCanManage(actor);
  const link = await createInviteLink(userId, kind);
  await prisma.$transaction((tx) =>
    writeAudit(tx, actor, { action: kind === "invite" ? "user.invite_link" : "user.reset_link", entityType: "user", entityId: userId }),
  );
  return link;
}

/** Per chi ha perso il telefono: toglie la 2FA, che l'utente potrà riattivare dal profilo. */
export async function resetTwoFactor(actor: CurrentUser, userId: string): Promise<void> {
  assertCanManage(actor);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw notFound("Utente");
    await tx.twoFactor.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } });
    await writeAudit(tx, actor, { action: "user.2fa_reset", entityType: "user", entityId: userId });
  });
}
