import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSigningKey, type SigningKey } from "../helpers/access-token";
import { publishAccessKey, signedIn } from "./helpers";

// Consultazione del registro attività: solo admin, dal più recente, filtri e pagine a cursore.

let key: SigningKey;
beforeAll(async () => {
  key = await createSigningKey();
  publishAccessKey(key);
});

type User = Awaited<ReturnType<typeof signedIn>>;
let admin: User;
let editor: User;
let marker: string;

interface AuditPage {
  items: Array<{ action: string; actorName: string | null; entityType: string; createdAt: string; data: Record<string, unknown> }>;
  nextBefore: number | null;
}

async function seedEvent(action: string, entityType: string, actorId: string | null, createdAt: string, data: Record<string, unknown> = {}) {
  await env.DB.prepare("INSERT INTO audit_log (id, actor_id, actor_email, action, entity_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorId, null, action, entityType, JSON.stringify({ marker, ...data }), createdAt)
    .run();
}

// Il registro non si svuota tra i test (sola aggiunta): ogni test filtra i propri eventi con un marcatore.
const mine = (page: AuditPage) => page.items.filter((item) => item.data.marker === marker);

beforeEach(async () => {
  marker = crypto.randomUUID();
  admin = await signedIn(key, { email: "admin@example.com", role: "ADMIN" });
  editor = await signedIn(key, { email: "editor@example.com", role: "EDITOR" });
});

describe("registro attività", () => {
  it("solo l'admin lo consulta", async () => {
    expect((await editor.call("/audit")).status).toBe(403);
  });

  it("dal più recente, con il nome di chi ha agito", async () => {
    await seedEvent("location.create", "location", admin.id, "2026-10-01T10:00:00.000Z", { name: "Casa" });
    await seedEvent("book.create", "book", editor.id, "2026-10-02T10:00:00.000Z", { title: "Il barone" });
    const page = (await (await admin.call("/audit")).json()) as AuditPage;
    expect(mine(page).map((item) => [item.action, item.actorName])).toEqual([
      ["book.create", "editor"],
      ["location.create", "admin"],
    ]);
  });

  it("filtra per categoria, persona e periodo", async () => {
    await seedEvent("book.create", "book", editor.id, "2026-09-15T10:00:00.000Z");
    await seedEvent("book.update", "book", admin.id, "2026-10-05T10:00:00.000Z");
    await seedEvent("copy.move", "copy", editor.id, "2026-10-06T10:00:00.000Z");

    const books = mine((await (await admin.call("/audit?category=book")).json()) as AuditPage);
    expect(books.map((item) => item.action)).toEqual(["book.update", "book.create"]);

    const byEditor = mine((await (await admin.call(`/audit?actor=${editor.id}`)).json()) as AuditPage);
    expect(byEditor.map((item) => item.action)).toEqual(["copy.move", "book.create"]);

    const october = mine((await (await admin.call("/audit?from=2026-10-01&to=2026-10-05")).json()) as AuditPage);
    expect(october.map((item) => item.action)).toEqual(["book.update"]);
  });

  it("pagine da 50 a cursore", async () => {
    const statements = Array.from({ length: 55 }, (_, index) =>
      env.DB.prepare("INSERT INTO audit_log (id, action, entity_type, data, created_at) VALUES (?, 'reading.mark', 'reading', ?, ?)").bind(
        crypto.randomUUID(),
        JSON.stringify({ marker, index }),
        `2026-10-10T10:${String(index).padStart(2, "0")}:00.000Z`,
      ),
    );
    await env.DB.batch(statements);
    const first = (await (await admin.call("/audit?category=reading")).json()) as AuditPage;
    expect(first.items).toHaveLength(50);
    expect(first.nextBefore).toEqual(expect.any(Number));
    const second = (await (await admin.call(`/audit?category=reading&before=${first.nextBefore}`)).json()) as AuditPage;
    expect(mine(second).map((item) => item.data.index)).toEqual([4, 3, 2, 1, 0]);
    expect(second.nextBefore).toBeNull();
  });

  it("filtri non validi: 400", async () => {
    expect((await admin.call("/audit?category=segreti")).status).toBe(400);
    expect((await admin.call("/audit?from=ieri")).status).toBe(400);
  });
});
