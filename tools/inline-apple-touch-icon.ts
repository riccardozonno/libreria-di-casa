import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

// iOS scarica l'icona della schermata Home senza i cookie di Cloudflare Access: dietro il portiere
// riceverebbe la pagina di login e userebbe un'icona generica. La incorporiamo nella pagina.

const ICON_PATH = "/icons/apple-touch-icon.png";
const LINK = `<link rel="apple-touch-icon" href="${ICON_PATH}" />`;

/** Sostituisce il link con l'immagine in base64; se il link non c'è, errore (mai un'icona generica in silenzio). */
export function inlineAppleTouchIconHtml(html: string, png: Uint8Array): string {
  if (!html.includes(LINK)) throw new Error(`index.html non contiene ${LINK}: l'icona per iOS non verrebbe incorporata.`);
  return html.replace(LINK, `<link rel="apple-touch-icon" href="data:image/png;base64,${Buffer.from(png).toString("base64")}" />`);
}

export function inlineAppleTouchIcon(): Plugin {
  return {
    name: "inline-apple-touch-icon",
    transformIndexHtml(html) {
      return inlineAppleTouchIconHtml(html, readFileSync(new URL(`../public${ICON_PATH}`, import.meta.url)));
    },
  };
}
