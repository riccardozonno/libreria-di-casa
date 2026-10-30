// Matrice dei permessi (docs/permissions.md, ADR-0004).
// Funzioni pure: nessun accesso al DB. Chi chiama passa sedi e stato già letti
// dentro la transazione della scrittura.

export type Role = "ADMIN" | "EDITOR" | "READER";

export interface Actor {
  readonly id: string;
  readonly role: Role;
  readonly active: boolean;
  readonly editorLocationIds: ReadonlySet<string>;
}

export interface LocationRef {
  readonly id: string;
  readonly archived: boolean;
}

export type Action =
  | { type: "catalog.view" }
  | { type: "profile.manage" }
  | { type: "reading.mark"; targetUserId: string }
  | { type: "isbn.lookup"; locations: readonly LocationRef[] }
  | { type: "copy.create"; location: LocationRef }
  | { type: "copy.update"; location: LocationRef }
  | { type: "copy.delete"; location: LocationRef; isLastCopy: boolean }
  | { type: "copy.move"; from: LocationRef; to: LocationRef }
  | { type: "book.update" }
  | { type: "book.delete" }
  | { type: "location.manage" }
  | { type: "csv.export" }
  | { type: "csv.import" }
  | { type: "user.manage" }
  | { type: "audit.view" };

function isAdmin(actor: Actor): boolean {
  return actor.role === "ADMIN";
}

/** Editor della sede e sede non archiviata. */
function edits(actor: Actor, location: LocationRef): boolean {
  return actor.role === "EDITOR" && !location.archived && actor.editorLocationIds.has(location.id);
}

export function can(actor: Actor, action: Action): boolean {
  if (!actor.active) return false;

  switch (action.type) {
    case "catalog.view":
    case "profile.manage":
      return true;
    case "reading.mark":
      return action.targetUserId === actor.id || isAdmin(actor);
    case "isbn.lookup":
      return isAdmin(actor) || action.locations.some((location) => edits(actor, location));
    case "copy.create":
      return !action.location.archived && (isAdmin(actor) || edits(actor, action.location));
    case "copy.update":
      return isAdmin(actor) || edits(actor, action.location);
    case "copy.delete":
      return isAdmin(actor) || (!action.isLastCopy && edits(actor, action.location));
    case "copy.move":
      // Regola dell'utente (29/10/2026, opzione B): l'admin, oppure un editor della sede di partenza,
      // verso qualsiasi sede attiva; poi la copia "segue la sede". Da una sede archiviata sposta solo l'admin.
      if (action.from.id === action.to.id || action.to.archived) return false;
      return isAdmin(actor) || edits(actor, action.from);
    case "book.update":
    case "book.delete":
    case "location.manage":
    case "csv.export":
    case "csv.import":
    case "user.manage":
    case "audit.view":
      return isAdmin(actor);
  }
}
