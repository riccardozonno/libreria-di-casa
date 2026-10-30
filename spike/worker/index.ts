import { asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { type Identity, resolveIdentity } from "./access";
import { detectImageType, isValidCoverKey, MAX_COVER_BYTES } from "./covers";
import { auditLog, book } from "./schema";

// API minima della prova di fattibilità: ogni endpoint corrisponde a una misura del piano (fase 1).

type AppEnv = { Bindings: Env & { DEV_IDENTITY_EMAIL?: string }; Variables: { identity: Identity } };

const PAGE_SIZE = 50;
const MAX_SEARCH_TERMS = 8;

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  const result = await resolveIdentity(c.req.raw, c.env);
  if (!result.ok) return c.json({ error: result.reason }, result.status);
  c.set("identity", result.identity);
  await next();
  c.header("Cache-Control", "no-store");
});

app.get("/me", (c) => c.json(c.get("identity")));

// Catalogo paginato in ordine di titolo (Drizzle, nessun SQL scritto a mano).
app.get("/books", async (c) => {
  const page = Math.max(0, Number(c.req.query("page") ?? 0) || 0);
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(book).orderBy(asc(book.title)).limit(PAGE_SIZE).offset(page * PAGE_SIZE);
  return c.json({ page, rows });
});

/** "promessi sposi" → `"promessi"* "sposi"*`: parole in AND, ognuna come prefisso, virgolette tolte. */
function toFtsQuery(query: string): string | null {
  const terms = query
    .replace(/["*^():-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .slice(0, MAX_SEARCH_TERMS);
  return terms.length === 0 ? null : terms.map((term) => `"${term}"*`).join(" ");
}

app.get("/search", async (c) => {
  const match = toFtsQuery(c.req.query("q") ?? "");
  if (!match) return c.json({ rows: [] });
  const db = drizzle(c.env.DB);
  const rows = await db.all(sql`
    SELECT b.id, b.title, b.authors, b.isbn13
    FROM book_fts JOIN book b ON b.id = book_fts.rowid
    WHERE book_fts MATCH ${match}
    ORDER BY rank LIMIT ${PAGE_SIZE}`);
  return c.json({ rows });
});

// Scrittura atomica: libro + riga di registro nello stesso batch (o tutto o niente).
app.post("/books", async (c) => {
  const body = await c.req.json<{ title?: unknown; authors?: unknown; isbn13?: unknown }>();
  if (typeof body.title !== "string" || body.title.trim() === "" || typeof body.authors !== "string") {
    return c.json({ error: "Titolo e autori obbligatori" }, 400);
  }
  const isbn13 = typeof body.isbn13 === "string" && /^\d{13}$/.test(body.isbn13) ? body.isbn13 : null;
  const db = drizzle(c.env.DB);
  const actor = c.get("identity").email;
  try {
    const [inserted] = await db.batch([
      db.insert(book).values({ title: body.title.trim(), authors: body.authors.trim(), isbn13, createdAt: new Date().toISOString() }).returning({ id: book.id }),
      db.insert(auditLog).values({ action: "book.create", actor, data: JSON.stringify({ title: body.title, isbn13 }), at: new Date().toISOString() }),
    ]);
    return c.json({ id: inserted[0]?.id }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) return c.json({ error: "ISBN già presente" }, 409);
    throw error;
  }
});

// Verifica dei trigger: modificare il registro deve fallire.
app.post("/checks/audit-append-only", async (c) => {
  try {
    await c.env.DB.prepare("UPDATE audit_log SET actor = 'manomesso'").run();
    return c.json({ appendOnly: false });
  } catch {
    return c.json({ appendOnly: true });
  }
});

app.put("/covers/:key", async (c) => {
  const key = c.req.param("key");
  if (!isValidCoverKey(key)) return c.json({ error: "Nome non valido" }, 400);
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) return c.json({ error: "Immagine vuota o troppo grande" }, 413);
  const type = detectImageType(bytes);
  if (!type) return c.json({ error: "Formato non ammesso" }, 415);
  await c.env.COVERS.put(key, bytes, { httpMetadata: { contentType: type } });
  return c.json({ key, type, bytes: bytes.byteLength }, 201);
});

app.get("/covers/:key", async (c) => {
  const key = c.req.param("key");
  if (!isValidCoverKey(key)) return c.notFound();
  const object = await c.env.COVERS.get(key);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
});

app.onError((error, c) => {
  console.error("Errore API", error);
  return c.json({ error: "Errore interno" }, 500);
});

export default app;
