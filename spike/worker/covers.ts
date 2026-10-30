// Copertine su R2: il telefono le ridimensiona, qui controlliamo solo dimensione e formato reale
// (dai primi byte, non dal Content-Type dichiarato dal client).

export const MAX_COVER_BYTES = 1_000_000;

const SIGNATURES: ReadonlyArray<{ type: string; matches: (bytes: Uint8Array) => boolean }> = [
  { type: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    type: "image/webp",
    matches: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
];

export function detectImageType(bytes: Uint8Array): string | null {
  return SIGNATURES.find((signature) => signature.matches(bytes))?.type ?? null;
}

export function isValidCoverKey(key: string): boolean {
  return /^[a-z0-9-]{1,64}$/.test(key);
}
