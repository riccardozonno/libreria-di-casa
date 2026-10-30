import "server-only";

// Download delle copertine con difese SSRF (ADR-0008): solo HTTPS, solo host consentiti,
// redirect seguiti a mano e ricontrollati, timeout e limite di dimensione durante la lettura.

const ALLOWED_HOSTS = ["books.google.com", "books.googleusercontent.com", "covers.openlibrary.org", "archive.org"];
const MAX_REDIRECTS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 5_000;

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
  if (declared > MAX_BYTES || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
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

// Cache breve: il lookup scarica la copertina per l'anteprima, il salvataggio la riusa senza riscaricarla.
const RECENT_TTL_MS = 15 * 60_000;
const RECENT_MAX_BYTES = 30 * 1024 * 1024;
const recent = new Map<string, { bytes: Uint8Array; expiresAt: number }>();
let recentBytes = 0;

function forget(url: string): void {
  const entry = recent.get(url);
  if (!entry) return;
  recentBytes -= entry.bytes.byteLength;
  recent.delete(url);
}

function remember(url: string, bytes: Uint8Array): void {
  const now = Date.now();
  for (const [key, entry] of recent) if (entry.expiresAt <= now) forget(key);
  forget(url);
  // Le più vecchie escono per prime finché il totale resta sotto il limite.
  while (recentBytes + bytes.byteLength > RECENT_MAX_BYTES && recent.size > 0) forget(recent.keys().next().value ?? "");
  if (bytes.byteLength > RECENT_MAX_BYTES) return;
  recent.set(url, { bytes, expiresAt: now + RECENT_TTL_MS });
  recentBytes += bytes.byteLength;
}

/** Restituisce i byte dell'immagine oppure null (copertina assente o non consentita). Non lancia errori. */
export async function downloadCover(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array | null> {
  const cached = recent.get(rawUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.bytes;
  const bytes = await fetchCover(rawUrl, fetchImpl);
  if (bytes) remember(rawUrl, bytes);
  return bytes;
}

async function fetchCover(rawUrl: string, fetchImpl: typeof fetch): Promise<Uint8Array | null> {
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
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return null;
    return readLimited(response);
  }
  return null;
}
