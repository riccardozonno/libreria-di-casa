// Copia il WASM di zxing (scanner) in public/vendor: servito dalla nostra origine, così la CSP
// non deve ammettere CDN esterne (ADR-0007). Eseguito da `pnpm install`.
import { copyFileSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";

const detectorDir = realpathSync(path.join(process.cwd(), "node_modules", "barcode-detector"));
const source = path.join(detectorDir, "..", "zxing-wasm", "dist", "reader", "zxing_reader.wasm");
const targetDir = path.join(process.cwd(), "public", "vendor");

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, path.join(targetDir, "zxing_reader.wasm"));
