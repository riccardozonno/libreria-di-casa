import { loadActor, type CurrentUser } from "@/server/actor";
import { prisma } from "@/server/db";
import { LOCATION_COLORS } from "@/lib/location-colors";
import { locationNameKey } from "@/lib/text";
import type { BookData } from "@/lib/schemas";

// Dati di prova per i test di integrazione.

let colorCounter = 0;

/** Ogni sede di prova riceve il colore successivo della palette (unico, come in produzione). */
export async function makeLocation(name: string, archived = false): Promise<{ id: string; name: string }> {
  const color = LOCATION_COLORS[colorCounter++ % LOCATION_COLORS.length]!.key;
  return prisma.location.create({
    data: { name, nameKey: locationNameKey(name), color, archivedAt: archived ? new Date() : null },
    select: { id: true, name: true },
  });
}

export async function makeUser(
  role: "ADMIN" | "EDITOR" | "READER",
  options: { editorOf?: string[]; active?: boolean; email?: string } = {},
): Promise<CurrentUser> {
  const user = await prisma.user.create({
    data: {
      name: `${role.toLowerCase()} di prova`,
      email: options.email ?? `${role.toLowerCase()}-${crypto.randomUUID()}@example.com`,
      role,
      active: options.active ?? true,
      editorOf: { create: (options.editorOf ?? []).map((locationId) => ({ locationId })) },
    },
  });
  const actor = await loadActor(user.id);
  if (!actor) {
    // Utente disattivato: restituiamo comunque un attore per verificare che la policy lo blocchi.
    return { ...user, editorLocationIds: new Set(options.editorOf ?? []), twoFactorEnabled: false, mustEnable2fa: false };
  }
  return actor;
}

export function bookData(overrides: Partial<BookData> = {}): BookData {
  return {
    isbn13: null,
    title: "Il barone rampante",
    authors: ["Italo Calvino"],
    publishedYear: 1957,
    description: null,
    ...overrides,
  };
}

export const noCopyDetails = { shelf: null, notes: null } as const;
