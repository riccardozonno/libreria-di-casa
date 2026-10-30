import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

const coversDir = mkdtempSync(path.join(tmpdir(), "copertine-"));
vi.mock("@/server/env", () => ({ env: { COVERS_DIR: coversDir } }));

const { readCover, removeCover, saveCover, isCoverFileName } = await import("@/server/covers/storage");

async function pngBytes(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#d9b23f" } }).png().toBuffer());
}

describe("archivio copertine", () => {
  it("ricodifica in WebP ridimensionato, rilegge e cancella", async () => {
    const fileName = await saveCover(await pngBytes(1200, 1800));

    expect(isCoverFileName(fileName)).toBe(true);
    const stored = await readCover(fileName);
    const meta = await sharp(stored!).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(600);

    await removeCover(fileName);
    expect(await readCover(fileName)).toBeNull();
  });

  it("accetta solo formati fotografici: niente SVG", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><rect width="40" height="60" fill="red"/></svg>';

    await expect(saveCover(new TextEncoder().encode(svg))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rifiuta dati che non sono immagini", async () => {
    await expect(saveCover(new TextEncoder().encode("<svg onload=alert(1)>"))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("non legge né cancella file fuori dal formato previsto (path traversal)", async () => {
    expect(await readCover("../../etc/passwd")).toBeNull();
    await expect(removeCover("../.env")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(readdirSync(coversDir)).toEqual([]);
  });
});
