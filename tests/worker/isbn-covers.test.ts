import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSigningKey, type SigningKey } from "../helpers/access-token";
import { mockExternal, publishAccessKey, seedLocation, signedIn } from "./helpers";

// Ricerca ISBN (chi può aggiungere libri) con memoria in D1, e copertine su R2.

const ISBN = "9788804668237";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const googleHit = {
  totalItems: 1,
  items: [{ volumeInfo: { title: "Il barone rampante", authors: ["Italo Calvino"], publishedDate: "1957", imageLinks: { thumbnail: "http://books.google.com/books/content?id=x&zoom=1" } } }],
};

let key: SigningKey;
beforeAll(async () => {
  key = await createSigningKey();
  publishAccessKey(key);
});

type User = Awaited<ReturnType<typeof signedIn>>;
let casa: { id: string };
let admin: User;
let editor: User;
let reader: User;
let editorMare: User;
let externalCalls: string[];

beforeEach(async () => {
  casa = await seedLocation("Casa", "ROSSO");
  admin = await signedIn(key, { email: "admin@example.com", role: "ADMIN" });
  editor = await signedIn(key, { email: "editor@example.com", role: "EDITOR", editorOf: [casa.id] });
  reader = await signedIn(key, { email: "lettore@example.com" });
  const mare = await seedLocation("Mare", "BLU");
  editorMare = await signedIn(key, { email: "mare@example.com", role: "EDITOR", editorOf: [mare.id] });
  externalCalls = [];
  mockExternal((url) => {
    externalCalls.push(url);
    if (url.includes("googleapis.com")) return Response.json(googleHit);
    if (url.startsWith("https://books.google.com/")) return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    return Response.json({});
  });
});

describe("ricerca ISBN", () => {
  it("l'editor trova i dati; la seconda volta arrivano da D1 senza chiamare Google", async () => {
    const first = await editor.call(`/isbn/978-88-04-66823-7`);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ found: true, candidate: { isbn13: ISBN, title: "Il barone rampante", authors: ["Italo Calvino"], publishedYear: 1957, source: "GOOGLE_BOOKS" } });
    const callsAfterFirst = externalCalls.length;

    const second = await editor.call(`/isbn/${ISBN}`);
    expect(await second.json()).toMatchObject({ found: true, candidate: { title: "Il barone rampante" } });
    expect(externalCalls.length).toBe(callsAfterFirst);
  });

  it("genere suggerito da Google, anche dalla memoria; le risposte salvate prima del genere ne restano senza", async () => {
    mockExternal((url) =>
      url.includes("googleapis.com") ? Response.json({ items: [{ volumeInfo: { ...googleHit.items[0]?.volumeInfo, categories: ["Fiction / Mystery & Detective"] } }] }) : Response.json({}),
    );
    expect(await (await editor.call(`/isbn/${ISBN}`)).json()).toMatchObject({ candidate: { suggestedGenre: "GIALLI" } });
    expect(await (await editor.call(`/isbn/${ISBN}`)).json()).toMatchObject({ candidate: { suggestedGenre: "GIALLI" } });

    const oldIsbn = "9788806219352";
    const oldCandidate = { isbn13: oldIsbn, title: "Se questo è un uomo", authors: ["Primo Levi"], publishedYear: 1947, description: null, coverUrl: null, source: "GOOGLE_BOOKS" };
    await env.DB.prepare("INSERT INTO isbn_cache (isbn13, source, data) VALUES (?, 'GOOGLE_BOOKS', ?)").bind(oldIsbn, JSON.stringify(oldCandidate)).run();
    const cached = (await (await editor.call(`/isbn/${oldIsbn}`)).json()) as { candidate: Record<string, unknown> };
    expect(cached.candidate).toMatchObject({ title: "Se questo è un uomo", suggestedGenre: null });
  });

  it("un ISBN sconosciuto non viene ricordato (può essere un errore temporaneo)", async () => {
    mockExternal((url) => (url.includes("googleapis") ? Response.json({ totalItems: 0 }) : Response.json({})));
    expect(await (await editor.call(`/isbn/${ISBN}`)).json()).toEqual({ found: false, existingBookId: null });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM isbn_cache").first<{ n: number }>()).toEqual({ n: 0 });
  });

  it("se il libro è già in catalogo lo segnala, per proporre di aggiungere una copia", async () => {
    const created = (await (await editor.call("/books", { method: "POST", body: { book: { isbn13: ISBN, title: "X" }, source: "MANUAL", locationId: casa.id } })).json()) as { bookId: string };
    expect(await (await editor.call(`/isbn/${ISBN}`)).json()).toMatchObject({ existingBookId: created.bookId });
  });

  it("il lettore non può: 403; un ISBN non valido: 400", async () => {
    expect((await reader.call(`/isbn/${ISBN}`)).status).toBe(403);
    expect((await editor.call("/isbn/1234567890123")).status).toBe(400);
  });
});

describe("anteprima della copertina trovata", () => {
  const preview = (url: string) => `/isbn/cover?url=${encodeURIComponent(url)}`;

  it("chi può aggiungere libri la vede passando dall'app (immagine verificata, nosniff)", async () => {
    const response = await editor.call(preview("http://books.google.com/books/content?id=x&zoom=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
  });

  it("host non consentiti: 400 senza scaricare nulla; il lettore: 403", async () => {
    expect((await editor.call(preview("https://sito-malevolo.example/x.jpg"))).status).toBe(400);
    expect(externalCalls.some((url) => url.includes("sito-malevolo"))).toBe(false);
    expect((await reader.call(preview("http://books.google.com/books/content?id=x"))).status).toBe(403);
  });

  it("se l'immagine non c'è o non è valida: 404", async () => {
    mockExternal(() => new Response("<html>", { headers: { "content-type": "image/jpeg" } }));
    expect((await editor.call(preview("https://covers.openlibrary.org/b/id/1-L.jpg"))).status).toBe(404);
  });
});

describe("copertine", () => {
  const coverKeyOf = async (bookId: string) => (await env.DB.prepare("SELECT cover_key FROM book WHERE id = ?").bind(bookId).first<{ cover_key: string | null }>())?.cover_key;

  it("la copertina trovata dalla ricerca si scarica su R2 e si legge da /api/covers", async () => {
    const response = await editor.call("/books", {
      method: "POST",
      body: { book: { isbn13: ISBN, title: "Il barone rampante" }, source: "GOOGLE_BOOKS", locationId: casa.id, coverUrl: "http://books.google.com/books/content?id=x&zoom=1" },
    });
    const { bookId } = (await response.json()) as { bookId: string };
    const coverKey = await coverKeyOf(bookId);
    expect(coverKey).toMatch(/^[0-9a-f-]{36}$/);

    const cover = await reader.call(`/covers/${coverKey}`);
    expect(cover.status).toBe(200);
    expect(cover.headers.get("Content-Type")).toBe("image/jpeg");
    expect(cover.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await cover.arrayBuffer())).toEqual(JPEG);
  });

  it("indirizzi di copertina non consentiti: il libro si crea senza copertina e senza scaricare nulla", async () => {
    const response = await editor.call("/books", {
      method: "POST",
      body: { book: { title: "X" }, source: "MANUAL", locationId: casa.id, coverUrl: "https://sito-malevolo.example/x.jpg" },
    });
    const { bookId } = (await response.json()) as { bookId: string };
    expect(await coverKeyOf(bookId)).toBeNull();
    expect(externalCalls.some((url) => url.includes("sito-malevolo"))).toBe(false);
  });

  it("cambiano la copertina l'admin e gli editor di una sede con una copia; gli altri no; un file che non è un'immagine no", async () => {
    const { bookId } = (await (await editor.call("/books", { method: "POST", body: { book: { title: "X" }, source: "MANUAL", locationId: casa.id } })).json()) as { bookId: string };
    expect((await editorMare.call(`/books/${bookId}/cover`, { method: "PUT", body: JPEG })).status).toBe(403);
    expect((await reader.call(`/books/${bookId}/cover`, { method: "PUT", body: JPEG })).status).toBe(403);
    expect((await editor.call(`/books/${bookId}/cover`, { method: "PUT", body: JPEG })).status).toBe(204);
    expect((await admin.call(`/books/${bookId}/cover`, { method: "PUT", body: new TextEncoder().encode("<svg onload=alert(1)>") })).status).toBe(415);
    expect((await admin.call(`/books/${bookId}/cover`, { method: "PUT", body: JPEG })).status).toBe(204);
    const coverKey = await coverKeyOf(bookId);
    expect(await env.COVERS.get(coverKey!)).not.toBeNull();
  });

  it("chi crea il libro può allegare una foto della copertina nella stessa richiesta (multipart)", async () => {
    const form = new FormData();
    form.set("data", JSON.stringify({ book: { title: "Fotografato" }, source: "MANUAL", locationId: casa.id }));
    form.set("cover", new File([JPEG], "copertina.jpg", { type: "image/jpeg" }));
    const response = await editor.call("/books", { method: "POST", body: form });
    expect(response.status).toBe(201);
    const { bookId } = (await response.json()) as { bookId: string };
    const coverKey = await coverKeyOf(bookId);
    expect(await env.COVERS.get(coverKey!)).not.toBeNull();
  });

  it("foto allegata che non è un'immagine: 415 e nessun libro creato", async () => {
    const form = new FormData();
    form.set("data", JSON.stringify({ book: { title: "Falso" }, source: "MANUAL", locationId: casa.id }));
    form.set("cover", new File(["<html>"], "x.jpg", { type: "image/jpeg" }));
    expect((await editor.call("/books", { method: "POST", body: form })).status).toBe(415);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM book WHERE title = 'Falso'").first<{ n: number }>()).toEqual({ n: 0 });
  });

  it("chi non può cambiare la copertina viene fermato prima che la foto venga scritta su R2", async () => {
    const { bookId } = (await (await editor.call("/books", { method: "POST", body: { book: { title: "X" }, source: "MANUAL", locationId: casa.id } })).json()) as { bookId: string };
    const writes: string[] = [];
    const realPut = env.COVERS.put.bind(env.COVERS);
    env.COVERS.put = (async (...args: Parameters<R2Bucket["put"]>) => {
      writes.push(String(args[0]));
      return realPut(...args);
    }) as R2Bucket["put"];
    try {
      expect((await editorMare.call(`/books/${bookId}/cover`, { method: "PUT", body: JPEG })).status).toBe(403);
    } finally {
      env.COVERS.put = realPut;
    }
    expect(writes).toEqual([]);
  });

  it("copertina inesistente o nome non valido: 404", async () => {
    expect((await reader.call("/covers/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await reader.call("/covers/..%2Fsegreto")).status).toBe(404);
  });
});
