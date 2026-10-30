import { describe, expect, it } from "vitest";
import { can, type Actor, type LocationRef } from "../../shared/policy";

// Matrice dei permessi: docs/permissions.md. Ogni riga × ogni ruolo × ogni caso di sede.

const casa: LocationRef = { id: "casa", archived: false };
const mare: LocationRef = { id: "mare", archived: false };
const montagna: LocationRef = { id: "montagna", archived: false };
const vecchia: LocationRef = { id: "vecchia", archived: true };
const allLocations = [casa, mare, montagna, vecchia];

function actor(role: Actor["role"], editorOf: string[] = [], active = true): Actor {
  return { id: `u-${role}`, role, active, editorLocationIds: new Set(editorOf) };
}

const admin = actor("ADMIN");
const editorCasa = actor("EDITOR", ["casa"]);
const editorCasaMare = actor("EDITOR", ["casa", "mare"]);
const editorVecchia = actor("EDITOR", ["vecchia"]);
const editorSenzaSedi = actor("EDITOR");
const reader = actor("READER");
// Un lettore con assegnazioni rimaste da quando era editor non ha diritti da editor.
const readerConSedi = actor("READER", ["casa"]);
const inactiveAdmin = actor("ADMIN", [], false);

describe("consultazione", () => {
  it.each([admin, editorCasa, editorSenzaSedi, reader])("$role attivo può consultare il catalogo", (a) => {
    expect(can(a, { type: "catalog.view" })).toBe(true);
  });

  it("un utente disattivato non può fare nulla", () => {
    expect(can(inactiveAdmin, { type: "catalog.view" })).toBe(false);
    expect(can(inactiveAdmin, { type: "location.manage" })).toBe(false);
    expect(can(inactiveAdmin, { type: "copy.create", location: casa })).toBe(false);
  });
});

describe("letto da", () => {
  it.each([admin, editorCasa, reader])("$role può segnare sé stesso", (a) => {
    expect(can(a, { type: "reading.mark", targetUserId: a.id })).toBe(true);
  });

  it("solo l'admin può segnare altri utenti", () => {
    expect(can(admin, { type: "reading.mark", targetUserId: "altro" })).toBe(true);
    expect(can(editorCasa, { type: "reading.mark", targetUserId: "altro" })).toBe(false);
    expect(can(reader, { type: "reading.mark", targetUserId: "altro" })).toBe(false);
  });
});

describe("lookup ISBN", () => {
  it("admin sì", () => {
    expect(can(admin, { type: "isbn.lookup", locations: allLocations })).toBe(true);
  });

  it("editor con almeno una sede attiva sì", () => {
    expect(can(editorCasa, { type: "isbn.lookup", locations: allLocations })).toBe(true);
  });

  it("editor solo di sedi archiviate o senza sedi no", () => {
    expect(can(editorVecchia, { type: "isbn.lookup", locations: allLocations })).toBe(false);
    expect(can(editorSenzaSedi, { type: "isbn.lookup", locations: allLocations })).toBe(false);
  });

  it("lettore no, anche con vecchie assegnazioni", () => {
    expect(can(reader, { type: "isbn.lookup", locations: allLocations })).toBe(false);
    expect(can(readerConSedi, { type: "isbn.lookup", locations: allLocations })).toBe(false);
  });
});

describe("creare libro o copia in una sede", () => {
  it("admin in qualsiasi sede attiva", () => {
    expect(can(admin, { type: "copy.create", location: mare })).toBe(true);
  });

  it("editor solo nelle proprie sedi", () => {
    expect(can(editorCasa, { type: "copy.create", location: casa })).toBe(true);
    expect(can(editorCasa, { type: "copy.create", location: mare })).toBe(false);
  });

  it("nessuno in una sede archiviata, neanche l'admin", () => {
    expect(can(admin, { type: "copy.create", location: vecchia })).toBe(false);
    expect(can(editorVecchia, { type: "copy.create", location: vecchia })).toBe(false);
  });

  it("lettore mai", () => {
    expect(can(reader, { type: "copy.create", location: casa })).toBe(false);
    expect(can(readerConSedi, { type: "copy.create", location: casa })).toBe(false);
  });
});

describe("modificare collocazione e note di una copia", () => {
  it("admin ovunque, anche in sedi archiviate", () => {
    expect(can(admin, { type: "copy.update", location: casa })).toBe(true);
    expect(can(admin, { type: "copy.update", location: vecchia })).toBe(true);
  });

  it("editor nelle proprie sedi attive", () => {
    expect(can(editorCasa, { type: "copy.update", location: casa })).toBe(true);
    expect(can(editorCasa, { type: "copy.update", location: mare })).toBe(false);
    expect(can(editorVecchia, { type: "copy.update", location: vecchia })).toBe(false);
  });

  it("lettore mai", () => {
    expect(can(reader, { type: "copy.update", location: casa })).toBe(false);
  });
});

describe("eliminare una copia", () => {
  it("editor della sede se il libro ha altre copie", () => {
    expect(can(editorCasa, { type: "copy.delete", location: casa, isLastCopy: false })).toBe(true);
    expect(can(editorCasa, { type: "copy.delete", location: mare, isLastCopy: false })).toBe(false);
  });

  it("l'ultima copia (= il libro) solo l'admin", () => {
    expect(can(editorCasa, { type: "copy.delete", location: casa, isLastCopy: true })).toBe(false);
    expect(can(admin, { type: "copy.delete", location: casa, isLastCopy: true })).toBe(true);
  });

  it("in sedi archiviate solo l'admin", () => {
    expect(can(editorVecchia, { type: "copy.delete", location: vecchia, isLastCopy: false })).toBe(false);
    expect(can(admin, { type: "copy.delete", location: vecchia, isLastCopy: false })).toBe(true);
  });

  it("lettore mai", () => {
    expect(can(reader, { type: "copy.delete", location: casa, isLastCopy: false })).toBe(false);
  });
});

// Regola decisa dall'utente il 29/10/2026 (opzione B): sposta l'admin, oppure un editor della sede
// in cui la copia si trova, verso qualsiasi sede attiva. Poi la copia "segue la sede".
describe("spostare una copia", () => {
  it("l'admin sempre, tra sedi attive", () => {
    expect(can(admin, { type: "copy.move", from: casa, to: mare })).toBe(true);
  });

  it("l'editor della sede di partenza, anche verso una sede in cui non è editor", () => {
    expect(can(editorCasa, { type: "copy.move", from: casa, to: mare })).toBe(true);
    expect(can(editorCasaMare, { type: "copy.move", from: mare, to: montagna })).toBe(true);
  });

  it("un editor che non gestisce la sede di partenza no", () => {
    expect(can(editorCasa, { type: "copy.move", from: mare, to: casa })).toBe(false);
  });

  it("lettori (anche con vecchie assegnazioni) e utenti disattivati no", () => {
    expect(can(readerConSedi, { type: "copy.move", from: casa, to: mare })).toBe(false);
    expect(can(actor("EDITOR", ["casa"], false), { type: "copy.move", from: casa, to: mare })).toBe(false);
  });

  it("verso una sede archiviata nessuno", () => {
    expect(can(admin, { type: "copy.move", from: casa, to: vecchia })).toBe(false);
    expect(can(editorCasa, { type: "copy.move", from: casa, to: vecchia })).toBe(false);
  });

  it("fuori da una sede archiviata solo l'admin", () => {
    expect(can(admin, { type: "copy.move", from: vecchia, to: casa })).toBe(true);
    expect(can(editorVecchia, { type: "copy.move", from: vecchia, to: casa })).toBe(false);
  });

  it("nella stessa sede non è uno spostamento", () => {
    expect(can(admin, { type: "copy.move", from: casa, to: casa })).toBe(false);
  });

  it("lettore mai", () => {
    expect(can(reader, { type: "copy.move", from: casa, to: mare })).toBe(false);
  });
});

describe("operazioni riservate all'admin", () => {
  const adminOnly = [
    { type: "book.update" },
    { type: "book.delete" },
    { type: "location.manage" },
    { type: "csv.export" },
    { type: "csv.import" },
    { type: "user.manage" },
    { type: "audit.view" },
  ] as const;

  it.each(adminOnly)("$type: admin sì", (action) => {
    expect(can(admin, action)).toBe(true);
  });

  it.each(adminOnly)("$type: editor e lettore no", (action) => {
    expect(can(editorCasaMare, action)).toBe(false);
    expect(can(reader, action)).toBe(false);
  });
});

describe("profilo personale", () => {
  it.each([admin, editorCasa, reader])("$role gestisce il proprio profilo", (a) => {
    expect(can(a, { type: "profile.manage" })).toBe(true);
  });
});
