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
    expect(detail.readings).toEqual([{ userId: reader.id, name: "lettore" }]);
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
  it("dopo la creazione li modifica solo l'admin", async () => {
    const { bookId } = (await createBook(editorCasa)).body;
    const changes = { isbn13: "", title: "Il barone rampante (Oscar)", authors: ["Italo Calvino"], publishedYear: 1993, description: "Riedizione" };
    expect((await editorCasa.call(`/books/${bookId}`, { method: "PATCH", body: changes })).status).toBe(403);
    expect((await admin.call(`/books/${bookId}`, { method: "PATCH", body: changes })).status).toBe(204);
    expect(await env.DB.prepare("SELECT title, isbn13 FROM book WHERE id = ?").bind(bookId).first()).toEqual({ title: "Il barone rampante (Oscar)", isbn13: null });
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
