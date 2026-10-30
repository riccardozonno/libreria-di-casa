import type { CoverImage } from "./download";

// Copertine su R2: chiave UUID casuale (mai derivata da input), tipo rilevato dai byte.

export const COVER_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function storeCover(bucket: R2Bucket, image: CoverImage): Promise<string> {
  const key = crypto.randomUUID();
  await bucket.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
  return key;
}

/** Pulizia best effort: un errore qui non deve far fallire l'operazione già conclusa. */
export async function removeCover(bucket: R2Bucket, key: string | null): Promise<void> {
  if (!key) return;
  await bucket.delete(key).catch((error: unknown) => console.error("Copertina non rimossa", key, error));
}
