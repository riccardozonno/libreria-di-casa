import { readFileSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * iOS scarica l'icona della schermata Home senza i cookie di Cloudflare Access: dietro il portiere
 * riceverebbe la pagina di login e userebbe un'icona generica. La incorporiamo nella pagina.
 */
function inlineAppleTouchIcon(): Plugin {
  const href = "/icons/apple-touch-icon.png";
  return {
    name: "inline-apple-touch-icon",
    transformIndexHtml(html) {
      const png = readFileSync(new URL(`./public${href}`, import.meta.url)).toString("base64");
      return html.replace(`<link rel="apple-touch-icon" href="${href}" />`, `<link rel="apple-touch-icon" href="data:image/png;base64,${png}" />`);
    },
  };
}

// Un solo progetto: interfaccia statica (React) + Worker dell'API, in locale come in produzione.
// E2E_STATE: gli E2E usano un D1 locale separato, ricreato a ogni esecuzione.
export default defineConfig({
  plugins: [react(), tailwindcss(), inlineAppleTouchIcon(), cloudflare({ persistState: process.env.E2E_STATE ? { path: process.env.E2E_STATE } : true })],
  build: { sourcemap: false },
  // Worker minificato: meno codice da leggere al primo avvio di un'istanza (limite di 10 ms di CPU).
  environments: { homelibrary: { build: { minify: true } } },
});
