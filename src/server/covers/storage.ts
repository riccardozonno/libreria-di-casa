import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "../env";
import { DomainError } from "../errors";

// Copertine salvate nel volume `covers` (ADR-0008): sempre ricodificate in WebP da sharp,
// così nel disco finisce solo un'immagine pulita generata da noi.

const MAX_EDGE_PX = 600;
const MAX_INPUT_PIXELS = 40_000_000;
const WEBP_QUALITY = 80;
const COVER_FILE_PATTERN = /^[0-9a-f-]{36}\.webp$/;

function coversDir(): string {
  return path.resolve(env.COVERS_DIR);
}

export function isCoverFileName(fileName: string): boolean {
  return COVER_FILE_PATTERN.test(fileName);
}

/** Percorso assoluto di una copertina, solo per nomi generati da noi (niente path traversal). */
function coverFilePath(fileName: string): string {
  if (!isCoverFileName(fileName)) throw new DomainError("VALIDATION", "Nome copertina non valido.");
  return path.join(coversDir(), fileName);
}

export async function saveCover(input: Uint8Array): Promise<string> {
  let output: Buffer;
  try {
    output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new DomainError("VALIDATION", "L'immagine della copertina non è leggibile.");
  }
  const fileName = `${randomUUID()}.webp`;
  await mkdir(coversDir(), { recursive: true });
  await writeFile(coverFilePath(fileName), output, { mode: 0o640 });
  return fileName;
}

export async function readCover(fileName: string): Promise<Buffer | null> {
  if (!isCoverFileName(fileName)) return null;
  try {
    return await readFile(coverFilePath(fileName));
  } catch {
    return null;
  }
}

export async function removeCover(fileName: string): Promise<void> {
  await rm(coverFilePath(fileName), { force: true });
}
