import "server-only";
import { headers } from "next/headers";
import { auth } from "./auth/auth";
import { prisma } from "./db";
import { env } from "./env";
import type { Actor } from "./policy";

// Chi sta facendo la richiesta (ADR-0004): sessione Better Auth → utente ricaricato dal DB
// a ogni richiesta, così ruolo, sedi e disattivazione valgono subito.

export interface CurrentUser extends Actor {
  readonly name: string;
  readonly email: string;
  readonly twoFactorEnabled: boolean;
  /** true se l'utente deve attivare la 2FA prima di usare l'app (admin in produzione). */
  readonly mustEnable2fa: boolean;
}

export async function loadActor(userId: string): Promise<CurrentUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      twoFactorEnabled: true,
      editorOf: { select: { locationId: true } },
    },
  });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    twoFactorEnabled: user.twoFactorEnabled,
    mustEnable2fa: env.REQUIRE_ADMIN_2FA && user.role === "ADMIN" && !user.twoFactorEnabled,
    editorLocationIds: new Set(user.editorOf.map((link) => link.locationId)),
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return loadActor(session.user.id);
}

export async function getClientIp(): Promise<string | null> {
  return (await headers()).get("cf-connecting-ip");
}
