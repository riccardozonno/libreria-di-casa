import { type CoverType, detectImageType, MAX_COVER_BYTES } from "./images";

// Download delle copertine trovate dalla ricerca ISBN, con difese SSRF (dalla v1, ADR-0008):
// solo HTTPS, solo host consentiti, redirect seguiti a mano e ricontrollati, timeout e limite
// di dimensione durante la lettura, formato verificato dai primi byte.

const ALLOWED_HOSTS = ["books.google.com", "books.googleusercontent.com", "covers.openlibrary.org", "archive.org"];
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5_000;

export interface CoverImage {
  bytes: Uint8Array;
  type: CoverType;
}

export function isAllowedCoverUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Google restituisce spesso http://: lo portiamo a https prima di qualunque controllo. */
export function upgradeToHttps(raw: string): string {
  return raw.startsWith("http://") ? `https://${raw.slice("http://".length)}` : raw;
}

async function readLimited(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_COVER_BYTES || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_COVER_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

/** Immagine e formato, oppure null (copertina assente, non consentita o non valida). Non lancia errori. */
export async function downloadCover(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<CoverImage | null> {
  let current = upgradeToHttps(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedCoverUrl(current)) return null;
    let response: Response;
    try {
      response = await fetchImpl(current, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = upgradeToHttps(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) return null;
    const bytes = await readLimited(response);
    const type = bytes ? detectImageType(bytes) : null;
    return bytes && type ? { bytes, type } : null;
  }
  return null;
}
