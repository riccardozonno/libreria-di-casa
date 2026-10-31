import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSigningKey, type SigningKey } from "../helpers/access-token";
import { publishAccessKey, seedLocation, signedIn } from "./helpers";

// CSV (solo admin): il telefono legge/scrive il file; il server dà i dati a pagine, dice quali ISBN
// esistono già e applica l'import a blocchi piccoli (limite di CPU), ricontrollando ogni riga.

let key: SigningKey;
beforeAll(async () => {
  key = await createSigningKey();
  publishAccessKey(key);
});

type User = Awaited<ReturnType<typeof signedIn>>;
let admin: User;
let editor: User;
let casa: { id: string };
let mare: { id: string };

beforeEach(async () => {
  casa = await seedLocation("Casa", "ROSSO");
  mare = await seedLocation("Mare", "BLU");
  admin = await signedIn(key, { email: "admin@example.com", role: "ADMIN" });
  editor = await signedIn(key, { email: "editor@example.com", role: "EDITOR", editorOf: [casa.id] });
});

const createBook = (title: string, isbn13: string | null, locationId: string) =>
  admin.call("/books", { method: "POST", body: { book: { title, isbn13: isbn13 ?? "", authors: ["Autore"] }, source: "MANUAL", locationId, copy: { shelf: "Studio" } } });

interface ExportPage {
  rows: Array<{ isbn13: string | null; title: string; authors: string[]; location: string; shelf: string | null }>;
  nextAfter: number | null;
}

describe("export", () => {
  it("solo l'admin; una riga per copia; filtro per sede; registrato una volta per export", async () => {
    await createBook("Il barone rampante", "9788804668237", casa.id);
    await createBook("Perché la città", null, mare.id);
    expect((await editor.call("/csv/export")).status).toBe(403);

    const all = (await (await admin.call("/csv/export")).json()) as ExportPage;
    expect(all.rows.map((row) => [row.title, row.location])).toEqual([
      ["Il barone rampante", "Casa"],
      ["Perché la città", "Mare"],
    ]);
    expect(all.rows[0]).toMatchObject({ isbn13: "9788804668237", authors: ["Autore"], shelf: "Studio" });
    expect(all.nextAfter).toBeNull();

    const onlyMare = (await (await admin.call(`/csv/export?location=${mare.id}`)).json()) as ExportPage;
    expect(onlyMare.rows.map((row) => row.title)).toEqual(["Perché la città"]);

    const exports = await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'csv.export'").first<{ n: number }>();
    expect(exports?.n).toBe(2);
  });
});

describe("export su più pagine", () => {
  it("la riga di registro si scrive solo quando l'export arriva all'ultima pagina", async () => {
    await env.DB.batch(
      Array.from({ length: 501 }, (_, index) => [
        env.DB.prepare("INSERT INTO book (id, title, source) VALUES (?, ?, 'MANUAL')").bind(`b${index}`, `Libro ${index}`),
        env.DB.prepare("INSERT INTO copy (id, book_id, location_id) VALUES (?, ?, ?)").bind(`c${index}`, `b${index}`, casa.id),
      ]).flat(),
    );
    const exportsLogged = async () => (await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'csv.export'").first<{ n: number }>())?.n;
    const before = await exportsLogged();

    const first = (await (await admin.call("/csv/export")).json()) as ExportPage;
    expect(first.rows).toHaveLength(500);
    expect(await exportsLogged()).toBe(before);

    const last = (await (await admin.call(`/csv/export?after=${first.nextAfter}`)).json()) as ExportPage;
    expect(last.nextAfter).toBeNull();
    expect(await exportsLogged()).toBe((before ?? 0) + 1);
  });
});

describe("ISBN già in catalogo", () => {
  it("restituisce l'id del libro per gli ISBN che esistono", async () => {
    const { bookId } = (await (await createBook("Il barone rampante", "9788804668237", casa.id)).json()) as { bookId: string };
    const response = await admin.call("/csv/existing", { method: "POST", body: { isbns: ["9788804668237", "9788807900389"] } });
    expect(await response.json()).toEqual({ existing: { "9788804668237": bookId } });
    expect((await editor.call("/csv/existing", { method: "POST", body: { isbns: [] } })).status).toBe(403);
  });
});

describe("import a blocchi", () => {
  const copy = { shelf: "Scaffale 1", notes: null };

  it("crea libri nuovi, aggiunge copie a libri esistenti o creati nello stesso blocco, e registra il blocco", async () => {
    await createBook("Già presente", "9788804668237", casa.id);
    const response = await admin.call("/csv/import", {
      method: "POST",
      body: {
        operations: [
          { line: 2, kind: "new-book", book: { isbn13: "9788807900389", title: "Il Gattopardo", authors: ["Tomasi di Lampedusa"], publishedYear: 1958, description: null }, locationId: casa.id, copy },
          { line: 3, kind: "add-copy", isbn13: "9788807900389", locationId: mare.id, copy },
          { line: 4, kind: "add-copy", isbn13: "9788804668237", locationId: mare.id, copy },
          { line: 5, kind: "new-book", book: { isbn13: null, title: "Quaderno senza ISBN", authors: [], publishedYear: null, description: null }, locationId: casa.id, copy },
        ],
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ newBooks: 2, newCopies: 4, missing: [] });

    const gattopardo = await env.DB.prepare("SELECT source, (SELECT count(*) FROM copy WHERE book_id = book.id) AS copies FROM book WHERE isbn13 = '9788807900389'").first();
    expect(gattopardo).toEqual({ source: "CSV", copies: 2 });
    const audit = await env.DB.prepare("SELECT data FROM audit_log WHERE action = 'csv.import'").first<{ data: string }>();
    expect(JSON.parse(audit!.data)).toMatchObject({ newBooks: 2, newCopies: 4, lines: [2, 3, 4, 5] });
  });

  it("un libro con lo stesso ISBN aggiunto nel frattempo diventa una copia in più, non un errore", async () => {
    await createBook("Aggiunto a mano", "9788807900389", casa.id);
    const response = await admin.call("/csv/import", {
      method: "POST",
      body: { operations: [{ line: 2, kind: "new-book", book: { isbn13: "9788807900389", title: "Il Gattopardo", authors: [], publishedYear: null, description: null }, locationId: mare.id, copy }] },
    });
    expect(await response.json()).toEqual({ newBooks: 0, newCopies: 1, missing: [] });
  });

  it("copia per un ISBN che non esiste: riportata come mancante", async () => {
    const response = await admin.call("/csv/import", { method: "POST", body: { operations: [{ line: 7, kind: "add-copy", isbn13: "9788804668237", locationId: casa.id, copy }] } });
    expect(await response.json()).toEqual({ newBooks: 0, newCopies: 0, missing: [7] });
  });

  it("rifiuta sedi archiviate o inesistenti, blocchi troppo grandi, e chi non è admin", async () => {
    await env.DB.prepare("UPDATE location SET archived_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").bind(mare.id).run();
    const op = (locationId: string, line = 2) => ({ line, kind: "new-book", book: { isbn13: null, title: "X", authors: [], publishedYear: null, description: null }, locationId, copy });
    expect((await admin.call("/csv/import", { method: "POST", body: { operations: [op(mare.id)] } })).status).toBe(400);
    expect((await admin.call("/csv/import", { method: "POST", body: { operations: [op("inesistente")] } })).status).toBe(400);
    expect((await admin.call("/csv/import", { method: "POST", body: { operations: Array.from({ length: 26 }, (_, index) => op(casa.id, index + 2)) } })).status).toBe(400);
    expect((await editor.call("/csv/import", { method: "POST", body: { operations: [op(casa.id)] } })).status).toBe(403);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM book WHERE title = 'X'").first<{ n: number }>()).toEqual({ n: 0 });
  });
});
