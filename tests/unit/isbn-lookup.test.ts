import { describe, expect, it, vi } from "vitest";
import { downloadCover, isAllowedCoverUrl } from "../../worker/covers/download";
import { lookupIsbn as lookupWith, parseYear } from "../../worker/isbn/lookup";

// Ricerca ISBN (Google Books → Open Library) e download delle copertine, portati dalla v1.
// La memoria dei risultati trovati ora è in D1 (tests/worker/isbn.test.ts).

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

const lookupIsbn = (isbn13: string, fetchImpl: typeof fetch) => lookupWith(isbn13, { fetch: fetchImpl, apiKey: "chiave-di-prova" });

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
      suggestedGenre: null,
    });
    const calledUrl = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(calledUrl.searchParams.get("key")).toBe("chiave-di-prova");
    expect(calledUrl.searchParams.get("q")).toBe(`isbn:${ISBN}`);
  });

  it("suggerisce il genere dalla prima categoria di Google Books", async () => {
    const withCategory = { items: [{ volumeInfo: { ...googleHit.items[0]?.volumeInfo, categories: ["Juvenile Fiction"] } }] };
    const fetchMock = vi.fn(async () => jsonResponse(withCategory));

    const candidate = await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    expect(candidate?.suggestedGenre).toBe("RAGAZZI");
  });

  it("categorie malformate non rompono la ricerca: nessun suggerimento", async () => {
    const odd = { items: [{ volumeInfo: { ...googleHit.items[0]?.volumeInfo, categories: "Fiction" } }] };
    const fetchMock = vi.fn(async () => jsonResponse(odd));

    const candidate = await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    expect(candidate).toMatchObject({ title: "Il barone rampante. Romanzo", suggestedGenre: null });
  });

  it("ripiega su Open Library se Google non trova nulla", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://openlibrary.org/api/books")
        ? jsonResponse({ [`ISBN:${ISBN}`]: { title: "Il barone rampante", authors: [{ name: "Italo Calvino" }], publish_date: "June 1957" } })
        : jsonResponse({ totalItems: 0 }),
    );

    const candidate = await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    expect(candidate?.source).toBe("OPEN_LIBRARY");
    expect(candidate?.publishedYear).toBe(1957);
    expect(candidate?.suggestedGenre).toBeNull();
    expect(candidate?.coverUrl).toContain("covers.openlibrary.org");
  });

  it("restituisce null se nessuno conosce l'ISBN o le risposte sono malformate", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: "non è un array" }));

    expect(await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch)).toBeNull();
  });

  it("riprova Google una volta se risponde 503 o 429", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Ogni URL risponde 503 la prima volta e poi trova il libro.
    const seen = new Set<string>();
    const fetchMock = vi.fn(async (url: string) => {
      if (seen.has(url)) return jsonResponse(googleHit);
      seen.add(url);
      return jsonResponse({ error: { status: "UNAVAILABLE" } }, 503);
    });

    const candidate = await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    expect(candidate?.source).toBe("GOOGLE_BOOKS");
    expect(fetchMock).toHaveBeenCalledTimes(6);
    warn.mockRestore();
  });

  it("se Google non trova l'ISBN-13 prova con l'ISBN-10", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams.get("q");
      return jsonResponse(q === "isbn:8804668237" ? googleHit : { totalItems: 0 });
    });

    const candidate = await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    expect(candidate?.source).toBe("GOOGLE_BOOKS");
    expect(candidate?.isbn13).toBe(ISBN);
  });

  it("ripete la ricerca su Google quando risponde 0 risultati in modo incostante", async () => {
    let googleCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes("googleapis")) return jsonResponse({});
      googleCalls += 1;
      return jsonResponse(googleCalls === 4 ? googleHit : { totalItems: 0 });
    });

    const candidate = await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    expect(candidate?.source).toBe("GOOGLE_BOOKS");
    // 3 varianti in parallelo per giro: la quarta chiamata è nel secondo giro, che è l'ultimo eseguito.
    expect(googleCalls).toBe(6);
  });

  it("limita i tentativi su Google quando il libro non c'è davvero", async () => {
    const fetchMock = vi.fn(async (url: string) => jsonResponse(url.includes("googleapis") ? { totalItems: 0 } : {}));

    await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    const googleCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("googleapis")).length;
    expect(googleCalls).toBe(12);
  });

  it("come ultima risorsa usa la ricerca di Open Library", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://openlibrary.org/search.json")) {
        return jsonResponse({
          docs: [{ title: "Il barone rampante", author_name: ["Italo Calvino"], first_publish_year: 1957, cover_i: 123 }],
        });
      }
      return jsonResponse(url.includes("googleapis") ? { totalItems: 0 } : {});
    });

    const candidate = await lookupIsbn(ISBN, fetchMock as unknown as typeof fetch);

    expect(candidate).toMatchObject({ title: "Il barone rampante", authors: ["Italo Calvino"], publishedYear: 1957, source: "OPEN_LIBRARY" });
    expect(candidate?.coverUrl).toBe("https://covers.openlibrary.org/b/id/123-L.jpg?default=false");
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
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const image = () => new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } });

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

    expect(bytes).toEqual({ bytes: JPEG, type: "image/jpeg" });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/^https:/);
  });

  it("non segue redirect verso host non consentiti (SSRF)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }));

    expect(await downloadCover("https://covers.openlibrary.org/x.jpg", fetchMock as unknown as typeof fetch)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rifiuta risposte che non sono immagini (anche se dichiarano image/jpeg) o troppo grandi", async () => {
    const html = vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "image/jpeg" } }));
    const huge = vi.fn(
      async () => new Response(new Uint8Array(6 * 1024 * 1024), { status: 200, headers: { "content-type": "image/jpeg" } }),
    );

    expect(await downloadCover("https://covers.openlibrary.org/x.jpg", html as unknown as typeof fetch)).toBeNull();
    expect(await downloadCover("https://covers.openlibrary.org/x.jpg", huge as unknown as typeof fetch)).toBeNull();
  });
});
