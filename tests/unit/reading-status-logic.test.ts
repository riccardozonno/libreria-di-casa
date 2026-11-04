import { describe, expect, it } from "vitest";
import { familySummary, initialsOf, statusOf, transition } from "../../src/pages/book/reading-status-logic";

// Scheda del libro: il selettore «Da leggere · Sto leggendo · Letto» e il riepilogo della famiglia.

describe("stato di lettura", () => {
  it.each([
    [false, false, "TO_READ"],
    [false, true, "READING"],
    [true, false, "READ"],
  ] as const)("letto=%s, sto leggendo=%s → %s", (hasRead, isReading, status) => {
    expect(statusOf(hasRead, isReading)).toBe(status);
  });
});

describe("passaggi del selettore", () => {
  const reading = { method: "PUT", path: "/books/b1/readings/u1" };
  const unread = { method: "DELETE", path: "/books/b1/readings/u1" };
  const startReading = { method: "PUT", path: "/books/b1/current-readers/u1" };
  const stopReading = { method: "DELETE", path: "/books/b1/current-readers/u1" };

  it.each([
    ["TO_READ", "READING", [startReading], false],
    ["TO_READ", "READ", [reading], false],
    ["READING", "READ", [reading], false],
    ["READING", "TO_READ", [stopReading], false],
    ["READ", "TO_READ", [unread], true],
    ["READ", "READING", [unread, startReading], true],
  ] as const)("%s → %s", (from, to, calls, needsConfirm) => {
    expect(transition("b1", "u1", from, to)).toEqual({ calls, needsConfirm });
  });

  it.each(["TO_READ", "READING", "READ"] as const)("%s → stesso stato: nessuna chiamata", (status) => {
    expect(transition("b1", "u1", status, status)).toEqual({ calls: [], needsConfirm: false });
  });
});

describe("iniziali", () => {
  it.each([
    ["Riccardo", "R"],
    ["Admin di prova", "AP"],
    ["  giulia  rossi ", "GR"],
    ["", "?"],
  ])("%s → %s", (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe("riepilogo della famiglia", () => {
  const me = "u-anna";
  const base = { readings: [], currentReaders: [], ratingAverage: null, ratingCount: 0, meId: me };

  it("nessuno: vuoto, con il messaggio", () => {
    expect(familySummary(base)).toMatchObject({ isEmpty: true, average: null, counts: "Nessuno l'ha ancora letto o iniziato", readers: [], currentReaders: [] });
  });

  it("media con una cifra decimale, conteggi al plurale", () => {
    const summary = familySummary({
      ...base,
      readings: [
        { userId: "u-bruno", name: "Bruno", rating: 5 },
        { userId: me, name: "Anna", rating: 4 },
      ],
      currentReaders: [{ userId: "u-carla", name: "Carla" }],
      ratingAverage: 4.5,
      ratingCount: 2,
    });
    expect(summary).toMatchObject({ isEmpty: false, average: "4,5", counts: "2 letti · 1 in lettura" });
  });

  it("singolari, nessun voto, nessuno in lettura", () => {
    const summary = familySummary({ ...base, readings: [{ userId: "u-bruno", name: "Bruno", rating: null }] });
    expect(summary).toMatchObject({ average: null, counts: "1 letto" });
    expect(familySummary({ ...base, currentReaders: [{ userId: "u-carla", name: "Carla" }, { userId: "u-dario", name: "Dario" }] }).counts).toBe("2 in lettura");
  });

  it("lettori: prima chi ha votato (voto più alto prima), poi gli altri, a parità per nome; «tu» segnato", () => {
    const summary = familySummary({
      ...base,
      readings: [
        { userId: "u-zeno", name: "Zeno", rating: null },
        { userId: me, name: "Anna", rating: 3 },
        { userId: "u-bruno", name: "Bruno", rating: 5 },
        { userId: "u-carla", name: "Carla", rating: 3 },
        { userId: "u-dario", name: "Dario", rating: null },
      ],
    });
    expect(summary.readers.map((reader) => [reader.name, reader.rating, reader.isMe])).toEqual([
      ["Bruno", 5, false],
      ["Anna", 3, true],
      ["Carla", 3, false],
      ["Dario", null, false],
      ["Zeno", null, false],
    ]);
  });

  it("iniziali di tutti (lettori, poi chi sta leggendo), al massimo 4 più il numero degli altri", () => {
    const summary = familySummary({
      ...base,
      readings: ["Bruno", "Carla", "Dario"].map((name) => ({ userId: `u-${name}`, name, rating: null })),
      currentReaders: ["Elisa", "Franco"].map((name) => ({ userId: `u-${name}`, name })),
    });
    expect(summary.avatars).toEqual(["B", "C", "D", "E"]);
    expect(summary.moreCount).toBe(1);
    expect(summary.currentReaders.map((reader) => reader.name)).toEqual(["Elisa", "Franco"]);
  });
});
