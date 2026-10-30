import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../src/lib/api";

// Client dell'API nel browser: una lettura fallita per un problema temporaneo del Worker
// (es. limite di CPU al primo avvio di un'istanza) si ripete una volta; le scritture mai.

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn(async () => responses.shift() ?? json(500, { error: "finite" }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("restituisce il corpo JSON delle risposte riuscite", async () => {
    mockFetch(json(200, { name: "Anna" }));
    await expect(api("/me")).resolves.toEqual({ name: "Anna" });
  });

  it("ripete una volta una lettura fallita con errore temporaneo (5xx) e restituisce il secondo esito", async () => {
    const fetchMock = mockFetch(new Response("Error 1102: Worker exceeded resource limits", { status: 503 }), json(200, { ok: true }));
    await expect(api("/me")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("non ripete più di una volta", async () => {
    const fetchMock = mockFetch(new Response("", { status: 503 }), new Response("", { status: 502 }));
    await expect(api("/me")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("non ripete mai una scrittura (rischio di duplicarla)", async () => {
    const fetchMock = mockFetch(new Response("", { status: 503 }), json(201, { id: "x" }));
    await expect(api("/books", { method: "POST", body: "{}" })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("non ripete gli errori definitivi (4xx) e usa il messaggio dell'API", async () => {
    const fetchMock = mockFetch(json(403, { error: "Il tuo account è disattivato." }));
    await expect(api("/me")).rejects.toMatchObject({ status: 403, message: "Il tuo account è disattivato." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("messaggio in italiano se manca la rete", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api("/me")).rejects.toMatchObject({ status: 0, message: "Connessione assente: controlla la rete e riprova." });
  });
});
