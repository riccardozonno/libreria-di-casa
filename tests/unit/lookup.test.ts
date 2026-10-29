import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLookupCache, lookupIsbn, parseYear } from "@/server/isbn/lookup";
import { downloadCover, isAllowedCoverUrl } from "@/server/covers/download";

vi.mock("@/server/env", () => ({ env: { GOOGLE_BOOKS_API_KEY: "chiave-di-prova" } }));

const ISBN = "9788804668237";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const googleHit = {
  totalItems: 1,
  items: [
    {
      volumeInfo: {
        title: "Il barone rampante",
        subtitle: "Romanzo",
        authors: ["Italo Calvino"],
        publishedDate: "1957-06-01",
        description: "<p>Cosimo sale sugli <b>alberi</b>.</p>",
        imageLinks: { thumbnail: "http://books.google.com/books/content?id=x&zoom=1&edge=curl" },
      },
    },
  ],
};

beforeEach(() => clearLookupCache());

describe("lookupIsbn", () => {
  it("usa Google Books con la chiave lato server e normalizza i dati", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(googleHit));

    const candidate = await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    expect(candidate).toEqual({
      isbn13: ISBN,
      title: "Il barone rampante. Romanzo",
      authors: ["Italo Calvino"],
      publishedYear: 1957,
      description: "Cosimo sale sugli alberi .",
      coverUrl: "http://books.google.com/books/content?id=x&zoom=1",
      source: "GOOGLE_BOOKS",
    });
    const calledUrl = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(calledUrl.searchParams.get("key")).toBe("chiave-di-prova");
    expect(calledUrl.searchParams.get("q")).toBe(`isbn:${ISBN}`);
  });

  it("ripiega su Open Library se Google non trova nulla", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ totalItems: 0 }))
      .mockResolvedValueOnce(
        jsonResponse({ [`ISBN:${ISBN}`]: { title: "Il barone rampante", authors: [{ name: "Italo Calvino" }], publish_date: "June 1957" } }),
      );

    const candidate = await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    expect(candidate?.source).toBe("OPEN_LIBRARY");
    expect(candidate?.publishedYear).toBe(1957);
    expect(candidate?.coverUrl).toContain("covers.openlibrary.org");
  });

  it("restituisce null se nessuno conosce l'ISBN o le risposte sono malformate, e mette in cache", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: "non è un array" }));

    expect(await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch)).toBeNull();
    expect(await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sopravvive a errori di rete", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("rete assente");
    });

    expect(await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch)).toBeNull();
  });
});

describe("parseYear", () => {
  it("estrae l'anno da formati diversi", () => {
    expect(parseYear("2005")).toBe(2005);
    expect(parseYear("March 1999")).toBe(1999);
    expect(parseYear("s.d.")).toBeNull();
    expect(parseYear(undefined)).toBeNull();
  });
});

describe("download delle copertine", () => {
  const image = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });

  it("accetta solo HTTPS verso gli host consentiti", () => {
    expect(isAllowedCoverUrl("https://books.google.com/books/content?id=1")).toBe(true);
    expect(isAllowedCoverUrl("https://ia800.us.archive.org/x.jpg")).toBe(true);
    expect(isAllowedCoverUrl("https://evil.example/x.jpg")).toBe(false);
    expect(isAllowedCoverUrl("https://books.google.com.evil.example/x.jpg")).toBe(false);
    expect(isAllowedCoverUrl("http://covers.openlibrary.org/x.jpg")).toBe(false);
    expect(isAllowedCoverUrl("https://user:pw@covers.openlibrary.org/x.jpg")).toBe(false);
    expect(isAllowedCoverUrl("https://covers.openlibrary.org:8443/x.jpg")).toBe(false);
  });

  it("porta http a https e segue i redirect consentiti", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://ia800.us.archive.org/c.jpg" } }))
      .mockResolvedValueOnce(image());

    const bytes = await downloadCover("http://covers.openlibrary.org/b/isbn/1-L.jpg", fetchMock as unknown as typeof fetch);

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/^https:/);
  });

  it("non segue redirect verso host non consentiti (SSRF)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }));

    expect(await downloadCover("https://covers.openlibrary.org/x.jpg", fetchMock as unknown as typeof fetch)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rifiuta risposte che non sono immagini o troppo grandi", async () => {
    const html = vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    const huge = vi.fn(
      async () => new Response(new Uint8Array(6 * 1024 * 1024), { status: 200, headers: { "content-type": "image/jpeg" } }),
    );

    expect(await downloadCover("https://covers.openlibrary.org/x.jpg", html as unknown as typeof fetch)).toBeNull();
    expect(await downloadCover("https://covers.openlibrary.org/x.jpg", huge as unknown as typeof fetch)).toBeNull();
  });
});
