import { describe, expect, it } from "vitest";
import { detectImageType, MAX_COVER_BYTES } from "../../worker/covers/images";

// Il formato si riconosce dai primi byte, mai dal Content-Type dichiarato da chi invia.

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

describe("detectImageType", () => {
  it.each([
    ["JPEG", bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"],
    ["PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png"],
    ["WebP", bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")), "image/webp"],
    ["GIF", bytes(...ascii("GIF89a")), "image/gif"],
  ])("riconosce %s", (_label, input, expected) => {
    expect(detectImageType(input)).toBe(expected);
  });

  it.each([
    ["HTML", bytes(...ascii("<html>"))],
    ["SVG (può contenere script)", bytes(...ascii("<svg onload"))],
    ["vuoto", bytes()],
    ["RIFF che non è WebP", bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"))],
  ])("rifiuta %s", (_label, input) => {
    expect(detectImageType(input)).toBeNull();
  });

  it("il limite di dimensione è di 2 MB", () => {
    expect(MAX_COVER_BYTES).toBe(2 * 1024 * 1024);
  });
});
