import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSigningKey, type SigningKey } from "../helpers/access-token";
import { publishAccessKey, seedLocation, signedIn } from "./helpers";

// Catalogo: libri, copie, spostamenti (docs/permissions.md, regola B), "Letto da".

let key: SigningKey;
beforeAll(async () => {
  key = await createSigningKey();
  publishAccessKey(key);
});

type User = Awaited<ReturnType<typeof signedIn>>;
let casa: { id: string };
let mare: { id: string };
let vecchia: { id: string };
let admin: User;
let editorCasa: User;
let editorMare: User;
let reader: User;

beforeEach(async () => {
  casa = await seedLocation("Casa", "ROSSO");
  mare = await seedLocation("Mare", "BLU");
  vecchia = await seedLocation("Vecchia", "MARRONE");
  await env.DB.prepare("UPDATE location SET archived_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").bind(vecchia.id).run();
  admin = await signedIn(key, { email: "admin@example.com", role: "ADMIN" });
  editorCasa = await signedIn(key, { email: "casa@example.com", role: "EDITOR", editorOf: [casa.id] });
  editorMare = await signedIn(key, { email: "mare@example.com", role: "EDITOR", editorOf: [mare.id] });
  reader = await signedIn(key, { email: "lettore@example.com" });
});

const newBook = (overrides: Record<string, unknown> = {}) => ({
  book: { isbn13: "978-88-04-66823-7", title: "Il barone rampante", authors: ["Italo Calvino"], publishedYear: 1957 },
  source: "MANUAL",
  locationId: casa.id,
  copy: { shelf: "Scaffale 2", notes: "" },
  ...overrides,
});

async function createBook(user: User, overrides: Record<string, unknown> = {}) {
  const response = await user.call("/books", { method: "POST", body: newBook(overrides) });
  return { response, body: (await response.json()) as { bookId: string; copyId: string; error?: string } };
}

const auditActions = async () =>
  (await env.DB.prepare("SELECT action FROM audit_log ORDER BY created_at, rowid").all<{ action: string }>()).results.map((row) => row.action);
const countCopies = async (bookId: string) =>
  (await env.DB.prepare("SELECT count(*) AS n FROM copy WHERE book_id = ?").bind(bookId).first<{ n: number }>())?.n;

describe("creare un libro con la prima copia", () => {
  it("l'editor della sede crea libro e copia; ISBN normalizzato, registro scritto", async () => {
    const { response, body } = await createBook(editorCasa);
    expect(response.status).toBe(201);
    const book = await env.DB.prepare("SELECT isbn13, title, authors, source, created_by_id FROM book WHERE id = ?").bind(body.bookId).first();
    expect(book).toEqual({ isbn13: "9788804668237", title: "Il barone rampante", authors: '["Italo Calvino"]', source: "MANUAL", created_by_id: editorCasa.id });
    expect(await countCopies(body.bookId)).toBe(1);
    expect(await auditActions()).toContain("book.create");
  });

  it.each([
    ["editor di un'altra sede", () => editorMare],
    ["lettore", () => reader],
  ])("%s: 403", async (_label, who) => {
    expect((await createBook(who())).response.status).toBe(403);
  });

  it("nessuno, neanche l'admin, in una sede archiviata", async () => {
    expect((await createBook(admin, { locationId: vecchia.id })).response.status).toBe(403);
  });

  it("ISBN già in catalogo: 409 con l'id del libro, per proporre di aggiungere una copia", async () => {
    const first = await createBook(editorCasa);
    const { response, body } = await createBook(admin);
    expect(response.status).toBe(409);
    expect(body).toMatchObject({ error: "Questo libro è già in catalogo: puoi aggiungerne una copia.", bookId: first.body.bookId });
  });

  it("dati non validi (titolo vuoto, ISBN sbagliato): 400", async () => {
    const { response, body } = await createBook(admin, { book: { title: "", isbn13: "123" } });
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ fields: { "book.title": "Il titolo è obbligatorio", "book.isbn13": "ISBN non valido" } });
  });
});

describe("catalogo", () => {
  it("ricerca senza accenti, filtro per sede, sedi delle copie nel risultato", async () => {
    const barone = (await createBook(editorCasa)).body.bookId;
    await createBook(admin, { book: { title: "Perché la città", authors: ["Niccolò Ammaniti"] }, locationId: mare.id });
    await editorMare.call(`/books/${barone}/copies`, { method: "POST", body: { locationId: mare.id, copy: {} } });

    const search = (await (await reader.call("/books?q=perche%20citta")).json()) as { items: Array<{ title: string }> };
    expect(search.items.map((item) => item.title)).toEqual(["Perché la città"]);

    const inCasa = (await (await reader.call(`/books?location=${casa.id}`)).json()) as { items: Array<{ id: string; locations: Array<{ name: string }>; copyCount: number }> };
    expect(inCasa.items).toHaveLength(1);
    expect(inCasa.items[0]).toMatchObject({ id: barone, copyCount: 2 });
    expect(inCasa.items[0]?.locations.map((location) => location.name)).toEqual(["Casa", "Mare"]);
  });

  it("pagine da 24 in ordine di titolo, con indicazione delle successive", async () => {
    const statements = Array.from({ length: 30 }, (_, index) => [
      env.DB.prepare("INSERT INTO book (id, title, source) VALUES (?, ?, 'MANUAL')").bind(`b${index}`, `Libro ${String(index).padStart(2, "0")}`),
      env.DB.prepare("INSERT INTO copy (id, book_id, location_id) VALUES (?, ?, ?)").bind(`c${index}`, `b${index}`, casa.id),
    ]).flat();
    await env.DB.batch(statements);
    const first = (await (await reader.call("/books")).json()) as { items: Array<{ title: string }>; hasMore: boolean };
    const second = (await (await reader.call("/books?page=1")).json()) as { items: Array<{ title: string }>; hasMore: boolean };
    expect(first.items).toHaveLength(24);
    expect(first.items[0]?.title).toBe("Libro 00");
    expect(first.hasMore).toBe(true);
    expect(second.items.map((item) => item.title)).toEqual(["Libro 24", "Libro 25", "Libro 26", "Libro 27", "Libro 28", "Libro 29"]);
    expect(second.hasMore).toBe(false);
  });

  it("scheda: libro, copie con sede, letture e storico; 404 se non esiste", async () => {
    const bookId = (await createBook(editorCasa)).body.bookId;
    const copyId = (await (await admin.call(`/books/${bookId}/copies`, { method: "POST", body: { locationId: mare.id, copy: {} } })).json() as { copyId: string }).copyId;
    await editorMare.call(`/copies/${copyId}/move`, { method: "POST", body: { toLocationId: casa.id } });
    await reader.call(`/books/${bookId}/readings/${reader.id}`, { method: "PUT" });

    const response = await reader.call(`/books/${bookId}`);
    expect(response.status).toBe(200);
    const detail = (await response.json()) as Record<string, unknown>;
    expect(detail).toMatchObject({ id: bookId, title: "Il barone rampante", authors: ["Italo Calvino"], createdBy: "casa" });
    expect(detail.copies).toEqual([
      expect.objectContaining({ location: expect.objectContaining({ name: "Casa", archived: false }), shelf: "Scaffale 2" }),
      expect.objectContaining({ id: copyId, location: expect.objectContaining({ name: "Casa" }) }),
    ]);
    expect(detail.readings).toEqual([{ userId: reader.id, name: "lettore", rating: null }]);
    expect(detail).toMatchObject({ ratingAverage: null, ratingCount: 0, currentReaders: [], genre: null });
    expect(detail.movements).toEqual([expect.objectContaining({ from: "Mare", to: "Casa", movedBy: "mare" })]);
    expect((await reader.call("/books/inesistente")).status).toBe(404);
  });
});

describe("copie", () => {
  let bookId: string;
  let copyId: string;
  beforeEach(async () => {
    ({ bookId, copyId } = (await createBook(editorCasa)).body);
  });

  it("aggiungere una copia: solo nelle proprie sedi", async () => {
    expect((await editorMare.call(`/books/${bookId}/copies`, { method: "POST", body: { locationId: mare.id, copy: {} } })).status).toBe(201);
    expect((await editorMare.call(`/books/${bookId}/copies`, { method: "POST", body: { locationId: casa.id, copy: {} } })).status).toBe(403);
    expect((await admin.call("/books/inesistente/copies", { method: "POST", body: { locationId: casa.id, copy: {} } })).status).toBe(404);
  });

  it("modificare collocazione e note: editor della sede sì, altri no", async () => {
    expect((await editorCasa.call(`/copies/${copyId}`, { method: "PATCH", body: { shelf: "Scaffale 9", notes: "Dedica" } })).status).toBe(204);
    expect(await env.DB.prepare("SELECT shelf, notes FROM copy WHERE id = ?").bind(copyId).first()).toEqual({ shelf: "Scaffale 9", notes: "Dedica" });
    expect((await editorMare.call(`/copies/${copyId}`, { method: "PATCH", body: { shelf: "X" } })).status).toBe(403);
  });

  it("eliminare una copia che non è l'ultima: l'editor della sede può", async () => {
    await admin.call(`/books/${bookId}/copies`, { method: "POST", body: { locationId: mare.id, copy: {} } });
    const response = await editorCasa.call(`/copies/${copyId}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bookId, bookDeleted: false });
    expect(await countCopies(bookId)).toBe(1);
  });

  it("l'ultima copia (cioè il libro) la elimina solo l'admin, con istantanea nel registro", async () => {
    expect((await editorCasa.call(`/copies/${copyId}`, { method: "DELETE" })).status).toBe(403);
    expect(await countCopies(bookId)).toBe(1);

    const response = await admin.call(`/copies/${copyId}`, { method: "DELETE" });
    expect(await response.json()).toEqual({ bookId, bookDeleted: true });
    expect(await env.DB.prepare("SELECT id FROM book WHERE id = ?").bind(bookId).first()).toBeNull();
    const snapshot = await env.DB.prepare("SELECT data FROM audit_log WHERE action = 'book.delete'").first<{ data: string }>();
    expect(JSON.parse(snapshot!.data)).toMatchObject({ title: "Il barone rampante", copies: [expect.objectContaining({ id: copyId })] });
  });

  it("spostare (regola B): l'editor della sede di partenza verso qualsiasi sede attiva, con storico", async () => {
    expect((await editorCasa.call(`/copies/${copyId}/move`, { method: "POST", body: { toLocationId: mare.id } })).status).toBe(204);
    const moved = await env.DB.prepare("SELECT location_id FROM copy WHERE id = ?").bind(copyId).first<{ location_id: string }>();
    expect(moved?.location_id).toBe(mare.id);
    expect(await env.DB.prepare("SELECT from_location_id, to_location_id, moved_by_id FROM copy_movement").first()).toEqual({ from_location_id: casa.id, to_location_id: mare.id, moved_by_id: editorCasa.id });
    expect(await auditActions()).toContain("copy.move");
    // Ora la copia "segue la sede": la gestisce l'editor di Mare, non più quello di Casa.
    expect((await editorCasa.call(`/copies/${copyId}/move`, { method: "POST", body: { toLocationId: casa.id } })).status).toBe(403);
  });

  it("non si sposta verso una sede archiviata o nella stessa sede", async () => {
    expect((await admin.call(`/copies/${copyId}/move`, { method: "POST", body: { toLocationId: vecchia.id } })).status).toBe(403);
    expect((await admin.call(`/copies/${copyId}/move`, { method: "POST", body: { toLocationId: casa.id } })).status).toBe(403);
  });
});

describe("dati del libro", () => {
  const changes = { isbn13: "", title: "Il barone rampante (Oscar)", authors: ["Italo Calvino"], publishedYear: 1993, description: "Riedizione" };

  it("li modificano l'admin e gli editor delle sedi in cui il libro ha una copia", async () => {
    const { bookId } = (await createBook(editorCasa)).body;
    expect((await editorMare.call(`/books/${bookId}`, { method: "PATCH", body: changes })).status).toBe(403);
    expect((await reader.call(`/books/${bookId}`, { method: "PATCH", body: changes })).status).toBe(403);
    expect((await editorCasa.call(`/books/${bookId}`, { method: "PATCH", body: changes })).status).toBe(204);
    expect(await env.DB.prepare("SELECT title, isbn13 FROM book WHERE id = ?").bind(bookId).first()).toEqual({ title: "Il barone rampante (Oscar)", isbn13: null });
    expect((await admin.call(`/books/${bookId}`, { method: "PATCH", body: { ...changes, title: "Il barone rampante" } })).status).toBe(204);
    expect((await admin.call("/books/inesistente", { method: "PATCH", body: changes })).status).toBe(404);
  });

  it("copia solo in una sede archiviata: l'editor non può più", async () => {
    const { bookId } = (await createBook(editorCasa)).body;
    await env.DB.prepare("UPDATE copy SET location_id = ? WHERE book_id = ?").bind(vecchia.id, bookId).run();
    expect((await editorCasa.call(`/books/${bookId}`, { method: "PATCH", body: changes })).status).toBe(403);
  });
});

describe("letto da", () => {
  let bookId: string;
  beforeEach(async () => {
    ({ bookId } = (await createBook(editorCasa)).body);
  });

  it("ognuno segna e toglie sé stesso; operazioni idempotenti registrate una volta", async () => {
    expect((await reader.call(`/books/${bookId}/readings/${reader.id}`, { method: "PUT" })).status).toBe(204);
    expect((await reader.call(`/books/${bookId}/readings/${reader.id}`, { method: "PUT" })).status).toBe(204);
    expect((await reader.call(`/books/${bookId}/readings/${reader.id}`, { method: "DELETE" })).status).toBe(204);
    const actions = await env.DB.prepare("SELECT action FROM audit_log WHERE entity_id = ? ORDER BY created_at, rowid").bind(bookId).all<{ action: string }>();
    expect(actions.results.map((row) => row.action).filter((action) => action.startsWith("reading."))).toEqual(["reading.mark", "reading.unmark"]);
  });

  it("segnare un altro utente: solo l'admin", async () => {
    expect((await reader.call(`/books/${bookId}/readings/${editorCasa.id}`, { method: "PUT" })).status).toBe(403);
    expect((await admin.call(`/books/${bookId}/readings/${editorCasa.id}`, { method: "PUT" })).status).toBe(204);
    expect((await admin.call(`/books/${bookId}/readings/utente-inesistente`, { method: "PUT" })).status).toBe(404);
  });
});

describe("voto", () => {
  let bookId: string;
  const rate = (who: User, rating: number | null, userId = who.id) =>
    who.call(`/books/${bookId}/readings/${userId}/rating`, { method: "PUT", body: { rating } });
  const markRead = (who: User) => who.call(`/books/${bookId}/readings/${who.id}`, { method: "PUT" });
  const detail = async (who: User = reader) => (await (await who.call(`/books/${bookId}`)).json()) as Record<string, unknown>;

  beforeEach(async () => {
    ({ bookId } = (await createBook(editorCasa)).body);
  });

  it("dopo «Letto» il lettore vota, cambia e toglie il voto; il registro solo quando cambia", async () => {
    await markRead(reader);
    expect((await rate(reader, 4)).status).toBe(204);
    expect((await rate(reader, 4)).status).toBe(204);
    expect((await rate(reader, 2)).status).toBe(204);
    expect((await rate(reader, null)).status).toBe(204);
    expect((await rate(reader, null)).status).toBe(204);

    expect(await env.DB.prepare("SELECT rating FROM book_reading WHERE user_id = ? AND book_id = ?").bind(reader.id, bookId).first()).toEqual({ rating: null });
    const audit = await env.DB.prepare("SELECT data FROM audit_log WHERE action = 'reading.rate' AND entity_id = ? ORDER BY created_at, rowid").bind(bookId).all<{ data: string }>();
    expect(audit.results.map((row) => JSON.parse(row.data))).toEqual([
      { userId: reader.id, rating: 4 },
      { userId: reader.id, rating: 2 },
      { userId: reader.id, rating: null },
    ]);
  });

  it("senza «Letto» il voto è rifiutato (409); libro inesistente 404", async () => {
    const response = await rate(reader, 5);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Segna prima il libro come letto." });
    bookId = "inesistente";
    expect((await rate(reader, 5)).status).toBe(404);
  });

  it("nessuno vota per un altro, nemmeno l'admin che ha segnato «Letto» per lui", async () => {
    expect((await admin.call(`/books/${bookId}/readings/${reader.id}`, { method: "PUT" })).status).toBe(204);
    expect((await rate(admin, 5, reader.id)).status).toBe(403);
    expect((await rate(editorCasa, 5, reader.id)).status).toBe(403);
    expect((await rate(reader, 5)).status).toBe(204);
  });

  it.each([0, 6, 3.5, "4"])("voto %s rifiutato (400)", async (rating) => {
    await markRead(reader);
    const response = await reader.call(`/books/${bookId}/readings/${reader.id}/rating`, { method: "PUT", body: { rating } });
    expect(response.status).toBe(400);
  });

  it("togliere «Letto» toglie anche il voto", async () => {
    await markRead(reader);
    await rate(reader, 5);
    await reader.call(`/books/${bookId}/readings/${reader.id}`, { method: "DELETE" });
    await markRead(reader);
    expect(await env.DB.prepare("SELECT rating FROM book_reading WHERE user_id = ? AND book_id = ?").bind(reader.id, bookId).first()).toEqual({ rating: null });
  });

  it("scheda: voto di ogni lettore, media con una cifra decimale e numero di voti", async () => {
    for (const who of [reader, editorCasa, admin]) await markRead(who);
    await rate(reader, 5);
    await rate(editorCasa, 4);
    await rate(admin, 4);
    await admin.call(`/books/${bookId}/readings/${editorMare.id}`, { method: "PUT" }); // letto, senza voto

    const book = await detail();
    expect(book.readings).toEqual([
      { userId: admin.id, name: "admin", rating: 4 },
      { userId: editorCasa.id, name: "casa", rating: 4 },
      { userId: reader.id, name: "lettore", rating: 5 },
      { userId: editorMare.id, name: "mare", rating: null },
    ]);
    expect(book).toMatchObject({ ratingAverage: 4.3, ratingCount: 3 });
  });
});

describe("sto leggendo", () => {
  let bookId: string;
  const path = (userId: string) => `/books/${bookId}/current-readers/${userId}`;
  const start = (who: User, userId = who.id) => who.call(path(userId), { method: "PUT" });
  const stop = (who: User, userId = who.id) => who.call(path(userId), { method: "DELETE" });
  const currentRows = () =>
    env.DB.prepare("SELECT user_id, marked_by_id, started_at FROM book_current_reading WHERE book_id = ?").bind(bookId).all<{ user_id: string; marked_by_id: string; started_at: string }>();
  const actions = async () =>
    (await env.DB.prepare("SELECT action, data FROM audit_log WHERE entity_id = ? ORDER BY created_at, rowid").bind(bookId).all<{ action: string; data: string }>()).results
      .filter((row) => row.action.startsWith("reading."))
      .map((row) => ({ action: row.action, data: JSON.parse(row.data) as Record<string, unknown> }));

  beforeEach(async () => {
    ({ bookId } = (await createBook(editorCasa)).body);
  });

  it("ognuno inizia e smette per sé; operazioni idempotenti registrate una volta; data di inizio salvata", async () => {
    expect((await start(reader)).status).toBe(204);
    expect((await start(reader)).status).toBe(204);
    const [row] = (await currentRows()).results;
    expect(row).toMatchObject({ user_id: reader.id, marked_by_id: reader.id });
    expect(Date.parse(row?.started_at ?? "")).not.toBeNaN();

    expect((await stop(reader)).status).toBe(204);
    expect((await stop(reader)).status).toBe(204);
    expect((await currentRows()).results).toEqual([]);
    expect(await actions()).toEqual([
      { action: "reading.start", data: { userId: reader.id } },
      { action: "reading.stop", data: { userId: reader.id } },
    ]);
  });

  it("per un altro utente: solo l'admin; 404 se libro o utente non esistono", async () => {
    expect((await start(reader, editorCasa.id)).status).toBe(403);
    expect((await stop(editorCasa, reader.id)).status).toBe(403);
    expect((await start(admin, editorCasa.id)).status).toBe(204);
    expect((await stop(admin, editorCasa.id)).status).toBe(204);
    expect((await start(admin, "utente-inesistente")).status).toBe(404);
    bookId = "inesistente";
    expect((await start(reader)).status).toBe(404);
  });

  it("non si può su un libro già letto (409)", async () => {
    await reader.call(`/books/${bookId}/readings/${reader.id}`, { method: "PUT" });
    const response = await start(reader);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Questo libro risulta già letto." });
    expect((await currentRows()).results).toEqual([]);
  });

  it("segnare «Letto» toglie «Sto leggendo»; il registro lo dice nella riga di «Letto»", async () => {
    await start(reader);
    expect((await reader.call(`/books/${bookId}/readings/${reader.id}`, { method: "PUT" })).status).toBe(204);
    expect((await currentRows()).results).toEqual([]);
    expect(await actions()).toEqual([
      { action: "reading.start", data: { userId: reader.id } },
      { action: "reading.mark", data: { userId: reader.id, wasReading: true } },
    ]);
  });

  it("scheda: chi sta leggendo, in ordine di nome, senza la data", async () => {
    await start(reader);
    await start(admin);
    const book = (await (await reader.call(`/books/${bookId}`)).json()) as Record<string, unknown>;
    expect(book.currentReaders).toEqual([
      { userId: admin.id, name: "admin" },
      { userId: reader.id, name: "lettore" },
    ]);
  });
});

describe("genere", () => {
  // Il genere si cambia con gli altri dati del libro (un solo modulo «Modifica dati»).
  const setGenre = async (who: User, bookId: string, genre: unknown) => {
    const current = (await (await admin.call(`/books/${bookId}`)).json()) as { isbn13: string | null; title: string; authors: string[]; publishedYear: number | null; description: string | null };
    const body = { isbn13: current.isbn13 ?? "", title: current.title, authors: current.authors, publishedYear: current.publishedYear, description: current.description ?? "", genre };
    return who.call(`/books/${bookId}`, { method: "PATCH", body });
  };
  const genreOf = async (bookId: string) => (await env.DB.prepare("SELECT genre FROM book WHERE id = ?").bind(bookId).first<{ genre: string | null }>())?.genre;
  const list = async (who: User, params: string) => (await (await who.call(`/books?${params}`)).json()) as { items: Array<{ title: string; genre: string | null }> };

  it("si sceglie quando si aggiunge il libro; è nella scheda e nella lista", async () => {
    const { bookId } = (await createBook(editorCasa, { genre: "NARRATIVA" })).body;
    expect(await genreOf(bookId)).toBe("NARRATIVA");
    expect(await (await reader.call(`/books/${bookId}`)).json()).toMatchObject({ genre: "NARRATIVA" });
    expect((await list(reader, "")).items).toEqual([expect.objectContaining({ title: "Il barone rampante", genre: "NARRATIVA" })]);
    const audit = await env.DB.prepare("SELECT data FROM audit_log WHERE action = 'book.create' AND entity_id = ?").bind(bookId).first<{ data: string }>();
    expect(JSON.parse(audit?.data ?? "{}")).toMatchObject({ genre: "NARRATIVA" });
  });

  it("genere sconosciuto rifiutato alla creazione e alla modifica (400)", async () => {
    expect((await createBook(editorCasa, { genre: "Romanzi rosa" })).response.status).toBe(400);
    const { bookId } = (await createBook(editorCasa)).body;
    expect((await setGenre(admin, bookId, "ROSA")).status).toBe(400);
  });

  it("lo cambiano l'admin e gli editor di una sede con una copia; registro solo se cambia; null lo toglie", async () => {
    const { bookId } = (await createBook(editorCasa)).body;
    expect((await setGenre(editorMare, bookId, "STORIA")).status).toBe(403);
    expect((await setGenre(reader, bookId, "STORIA")).status).toBe(403);
    expect((await setGenre(editorCasa, bookId, "STORIA")).status).toBe(204);
    expect((await setGenre(editorCasa, bookId, "STORIA")).status).toBe(204);
    expect((await setGenre(admin, bookId, null)).status).toBe(204);
    expect(await genreOf(bookId)).toBeNull();

    const audit = await env.DB.prepare("SELECT data FROM audit_log WHERE action = 'book.update' AND entity_id = ? ORDER BY created_at, rowid").bind(bookId).all<{ data: string }>();
    expect(audit.results.map((row) => JSON.parse(row.data))).toEqual([
      { before: { genre: null }, after: { genre: "STORIA" } },
      { before: { genre: "STORIA" }, after: { genre: null } },
    ]);
    expect((await setGenre(admin, "inesistente", "STORIA")).status).toBe(404);
  });

  it("modificare i dati del libro non azzera il genere", async () => {
    const { bookId } = (await createBook(editorCasa, { genre: "CLASSICI" })).body;
    const changes = { isbn13: "", title: "Il barone rampante (Oscar)", authors: ["Italo Calvino"], publishedYear: 1957, description: "" };
    expect((await admin.call(`/books/${bookId}`, { method: "PATCH", body: changes })).status).toBe(204);
    expect(await genreOf(bookId)).toBe("CLASSICI");
  });

  it("filtro per genere e «senza genere», insieme a sede e ricerca", async () => {
    await createBook(editorCasa, { book: { title: "Il nome della rosa", authors: ["Umberto Eco"] }, genre: "GIALLI" });
    await createBook(editorMare, { book: { title: "La donna della domenica", authors: ["Fruttero & Lucentini"] }, locationId: mare.id, genre: "GIALLI" });
    await createBook(editorCasa, { book: { title: "Storia d'Italia", authors: ["Indro Montanelli"] }, genre: "STORIA" });
    await createBook(editorCasa, { book: { title: "Senza etichetta", authors: [] } });

    const titles = async (params: string) => (await list(reader, params)).items.map((item) => item.title);
    expect(await titles("genre=GIALLI")).toEqual(["Il nome della rosa", "La donna della domenica"]);
    expect(await titles(`genre=GIALLI&location=${mare.id}`)).toEqual(["La donna della domenica"]);
    expect(await titles("genre=GIALLI&q=rosa")).toEqual(["Il nome della rosa"]);
    expect(await titles("genre=NONE")).toEqual(["Senza etichetta"]);
    expect((await reader.call("/books?genre=ROSA")).status).toBe(400);
  });
});

describe("filtri di lettura", () => {
  const titles = async (who: User, params: string) =>
    ((await (await who.call(`/books?${params}`)).json()) as { items: Array<{ title: string }> }).items.map((item) => item.title);
  const markRead = (who: User, bookId: string) => who.call(`/books/${bookId}/readings/${who.id}`, { method: "PUT" });
  const startReading = (who: User, bookId: string) => who.call(`/books/${bookId}/current-readers/${who.id}`, { method: "PUT" });

  let lettoDalLettore: string;
  let lettoDallAdmin: string;
  let inLettura: string;
  beforeEach(async () => {
    lettoDalLettore = (await createBook(editorCasa, { book: { title: "A – letto dal lettore", authors: [] }, genre: "GIALLI" })).body.bookId;
    lettoDallAdmin = (await createBook(editorMare, { book: { title: "B – letto dall'admin", authors: [] }, locationId: mare.id, genre: "GIALLI" })).body.bookId;
    inLettura = (await createBook(editorCasa, { book: { title: "C – in lettura", authors: [] }, genre: "STORIA" })).body.bookId;
    await createBook(editorCasa, { book: { title: "D – mai letto", authors: [] } });
    expect((await markRead(reader, lettoDalLettore)).status).toBe(204);
    expect((await markRead(admin, lettoDallAdmin)).status).toBe(204);
    expect((await startReading(reader, inLettura)).status).toBe(204);
  });

  it("«Non letti da me» dipende da chi è collegato e comprende i libri che sta leggendo", async () => {
    expect(await titles(reader, "reading=UNREAD_BY_ME")).toEqual(["B – letto dall'admin", "C – in lettura", "D – mai letto"]);
    expect(await titles(admin, "reading=UNREAD_BY_ME")).toEqual(["A – letto dal lettore", "C – in lettura", "D – mai letto"]);
  });

  it("«Non letti da nessuno» esclude i libri letti da chiunque", async () => {
    expect(await titles(editorCasa, "reading=UNREAD")).toEqual(["C – in lettura", "D – mai letto"]);
  });

  it("«In lettura» mostra i libri che qualcuno sta leggendo; segnato «Letto» sparisce", async () => {
    expect(await titles(admin, "reading=READING")).toEqual(["C – in lettura"]);
    expect((await markRead(reader, inLettura)).status).toBe(204);
    expect(await titles(admin, "reading=READING")).toEqual([]);
  });

  it("si combina con genere, sede e ricerca", async () => {
    expect(await titles(reader, "reading=UNREAD_BY_ME&genre=GIALLI")).toEqual(["B – letto dall'admin"]);
    expect(await titles(admin, `reading=UNREAD&location=${casa.id}`)).toEqual(["C – in lettura", "D – mai letto"]);
    expect(await titles(admin, "reading=UNREAD&q=mai")).toEqual(["D – mai letto"]);
  });

  it("valore sconosciuto: 400", async () => {
    expect((await reader.call("/books?reading=letti")).status).toBe(400);
  });
});
