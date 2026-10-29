// Genera le icone PNG della PWA dall'icona sorgente (docs/design/icon.svg).
// Uso: node scripts/generate-icons.mjs — i PNG risultanti sono versionati in public/icons.
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "docs/design/icon.svg";
const OUT = "public/icons";
const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "favicon-32.png", size: 32 },
];

mkdirSync(OUT, { recursive: true });
for (const { name, size } of SIZES) {
  await sharp(SOURCE, { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`${OUT}/${name}`);
}
// Maskable (Android): stesso sfondo, contenuto ridotto all'80% così resta nella "safe zone".
const svg = readFileSync(SOURCE, "utf8");
const GLOW_RECT = '<rect width="1024" height="1024" fill="url(#glow)"/>';
const maskableSvg = svg
  .replace(GLOW_RECT, `${GLOW_RECT}\n  <g transform="translate(102.4 102.4) scale(0.8)">`)
  .replace("</svg>", "  </g>\n</svg>");
await sharp(Buffer.from(maskableSvg), { density: 300 }).resize(512, 512).png({ compressionLevel: 9 }).toFile(`${OUT}/icon-maskable-512.png`);
