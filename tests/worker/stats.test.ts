import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lastMonths, romeMonthKey } from "../../shared/months";
import { createSigningKey, type SigningKey } from "../helpers/access-token";
import { callApi, publishAccessKey, seedUser, signedIn } from "./helpers";

// Statistiche di lettura: visibili a tutti, dati aggregati in una sola richiesta.

let key: SigningKey;
beforeAll(async () => {
  key = await createSigningKey();
  publishAccessKey(key);
});

type User = Awaited<ReturnType<typeof signedIn>>;
let anna: User;
let bruno: User;
let carla: User;
let dario: { id: string };

interface Stats {
  catalogSize: number;
  totalReadings: number;
  people: Array<{ userId: string; name: string; read: number; percent: number; ratings: number }>;
  currentReadings: Array<{ userId: string; name: string; bookId: string; title: string }>;
  months: Array<{ month: string; count: number }>;
  years: Array<{ year: string; count: number }>;
  topRated: Array<{ bookId: string; title: string; average: number; votes: number }>;
  topAuthors: Array<{ name: string; count: number }>;
  genres: Array<{ genre: string | null; count: number }>;
  pairs: Array<{ userIds: [string, string]; names: [string, string]; count: number }>;
}

const stats = async (who: User) => {
  const response = await who.call("/stats");
  expect(response.status).toBe(200);
  return (await response.json()) as Stats;
};

async function seedBook(id: string, title: string, authors: string[], genre: string | null = null) {
  await env.DB.prepare("INSERT INTO book (id, title, authors, genre, source) VALUES (?, ?, ?, ?, 'MANUAL')").bind(id, title, JSON.stringify(authors), genre).run();
}

async function seedReading(userId: string, bookId: string, createdAt: string, rating: number | null = null) {
  await env.DB.prepare("INSERT INTO book_reading (user_id, book_id, rating, created_at) VALUES (?, ?, ?, ?)").bind(userId, bookId, rating, createdAt).run();
}

const now = new Date().toISOString();
const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString();

beforeEach(async () => {
  anna = await signedIn(key, { email: "anna@example.com", role: "ADMIN" });
  bruno = await signedIn(key, { email: "bruno@example.com", role: "EDITOR" });
  carla = await signedIn(key, { email: "carla@example.com" });
  dario = await seedUser({ email: "dario@example.com", active: false });
});

describe("statistiche", () => {
  it("catalogo vuoto: tutte le sezioni vuote, i 12 mesi a zero, le persone attive con 0", async () => {
    const result = await stats(carla);
    expect(result).toMatchObject({ catalogSize: 0, totalReadings: 0, currentReadings: [], years: [], topRated: [], topAuthors: [], genres: [], pairs: [] });
    expect(result.months).toEqual(lastMonths(new Date(), 12).map((month) => ({ month, count: 0 })));
    expect(result.people.map((person) => person.name)).toEqual(["anna", "bruno", "carla"]);
    expect(result.people.every((person) => person.read === 0 && person.percent === 0)).toBe(true);
  });

  describe("con letture", () => {
    beforeEach(async () => {
      await seedBook("b1", "Il nome della rosa", ["Umberto Eco"], "GIALLI");
      await seedBook("b2", "Il pendolo di Foucault", ["Umberto Eco"], "NARRATIVA");
      await seedBook("b3", "Le cosmicomiche", ["Italo Calvino", "Umberto Eco"]);
      await seedBook("b4", "Mai letto", ["Nessuno"], "STORIA");
      await seedReading(anna.id, "b1", now, 5);
      await seedReading(bruno.id, "b1", now, 4);
      await seedReading(carla.id, "b1", twoYearsAgo, null);
      await seedReading(anna.id, "b2", now, 3);
      await seedReading(bruno.id, "b2", now, 2);
      await seedReading(anna.id, "b3", now, 5);
      await seedReading(dario.id, "b3", now, 5);
      await env.DB.prepare("INSERT INTO book_current_reading (user_id, book_id) VALUES (?, 'b4'), (?, 'b4')").bind(carla.id, dario.id).run();
    });

    it("chi legge di più: letti, % del catalogo, voti dati; i disattivati non compaiono", async () => {
      const result = await stats(carla);
      expect(result.catalogSize).toBe(4);
      expect(result.totalReadings).toBe(7);
      expect(result.people).toEqual([
        { userId: anna.id, name: "anna", read: 3, percent: 75, ratings: 3 },
        { userId: bruno.id, name: "bruno", read: 2, percent: 50, ratings: 2 },
        { userId: carla.id, name: "carla", read: 1, percent: 25, ratings: 0 },
      ]);
    });

    it("chi sta leggendo cosa (solo persone attive)", async () => {
      expect((await stats(bruno)).currentReadings).toEqual([{ userId: carla.id, name: "carla", bookId: "b4", title: "Mai letto" }]);
    });

    it("letture per mese (ultimi 12, ora italiana) e per anno; contano anche i disattivati", async () => {
      const result = await stats(anna);
      const thisMonth = romeMonthKey(now);
      expect(result.months).toHaveLength(12);
      expect(result.months.at(-1)).toEqual({ month: thisMonth, count: 6 });
      expect(result.months.reduce((sum, month) => sum + month.count, 0)).toBe(6);
      expect(result.years).toEqual([
        { year: romeMonthKey(twoYearsAgo).slice(0, 4), count: 1 },
        { year: thisMonth.slice(0, 4), count: 6 },
      ]);
    });

    it("i più apprezzati: almeno 2 voti, media con una cifra decimale, voti dei disattivati compresi", async () => {
      expect((await stats(anna)).topRated).toEqual([
        { bookId: "b3", title: "Le cosmicomiche", average: 5, votes: 2 },
        { bookId: "b1", title: "Il nome della rosa", average: 4.5, votes: 2 },
        { bookId: "b2", title: "Il pendolo di Foucault", average: 2.5, votes: 2 },
      ]);
    });

    it("autori più letti: ogni autore di un libro conta", async () => {
      expect((await stats(anna)).topAuthors).toEqual([
        { name: "Umberto Eco", count: 7 },
        { name: "Italo Calvino", count: 2 },
      ]);
    });

    it("generi più letti, «senza genere» in fondo", async () => {
      expect((await stats(anna)).genres).toEqual([
        { genre: "GIALLI", count: 3 },
        { genre: "NARRATIVA", count: 2 },
        { genre: null, count: 2 },
      ]);
    });

    it("letture in comune: coppie di persone attive con i libri letti da entrambe", async () => {
      expect((await stats(anna)).pairs).toEqual([
        { userIds: [anna.id, bruno.id], names: ["anna", "bruno"], count: 2 },
        { userIds: [anna.id, carla.id], names: ["anna", "carla"], count: 1 },
        { userIds: [bruno.id, carla.id], names: ["bruno", "carla"], count: 1 },
      ]);
    });
  });

  it("una data di lettura non valida (import, ripristino) non blocca la pagina: conta nel totale, non nei mesi", async () => {
    await seedBook("b1", "Il nome della rosa", ["Umberto Eco"]);
    await seedBook("b2", "Il pendolo di Foucault", ["Umberto Eco"]);
    await seedReading(anna.id, "b1", "non è una data");
    await seedReading(anna.id, "b2", now);
    const result = await stats(anna);
    expect(result.totalReadings).toBe(2);
    expect(result.months.reduce((sum, month) => sum + month.count, 0)).toBe(1);
    expect(result.years).toEqual([{ year: romeMonthKey(now).slice(0, 4), count: 1 }]);
  });

  it("molte letture nella stessa ora contano tutte", async () => {
    for (const id of ["b1", "b2", "b3"]) await seedBook(id, `Libro ${id}`, []);
    const sameHour = new Date().toISOString().slice(0, 13);
    await seedReading(anna.id, "b1", `${sameHour}:00:00.000Z`);
    await seedReading(anna.id, "b2", `${sameHour}:30:00.000Z`);
    await seedReading(bruno.id, "b3", `${sameHour}:59:59.999Z`);
    expect((await stats(anna)).months.at(-1)?.count).toBe(3);
  });

  it("un autore ripetuto nello stesso libro conta una volta per lettura", async () => {
    await seedBook("b1", "Doppio", ["Umberto Eco", " umberto eco "]);
    await seedReading(anna.id, "b1", now);
    expect((await stats(anna)).topAuthors).toEqual([{ name: "Umberto Eco", count: 1 }]);
  });

  it("senza accesso non si vedono", async () => {
    expect((await callApi("/stats")).status).not.toBe(200);
  });
});
