// Copertine: il formato si riconosce dai primi byte, mai dal Content-Type dichiarato.
// Niente SVG (può contenere script). Le immagini non vengono ricodificate: il Worker non ha CPU
// per farlo; le foto le ridimensiona il telefono, e le serviamo con nosniff e il tipo rilevato.

export const MAX_COVER_BYTES = 2 * 1024 * 1024;

export type CoverType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));

const SIGNATURES: ReadonlyArray<{ type: CoverType; matches: (b: Uint8Array) => boolean }> = [
  { type: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", matches: (b) => b[0] === 0x89 && ascii(b, 1, 4) === "PNG" },
  { type: "image/webp", matches: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  { type: "image/gif", matches: (b) => ascii(b, 0, 4) === "GIF8" },
];

export function detectImageType(bytes: Uint8Array): CoverType | null {
  return SIGNATURES.find((signature) => signature.matches(bytes))?.type ?? null;
}
