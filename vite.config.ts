import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { inlineAppleTouchIcon } from "./tools/inline-apple-touch-icon";

// Un solo progetto: interfaccia statica (React) + Worker dell'API, in locale come in produzione.
// E2E_STATE: gli E2E usano un D1 locale separato, ricreato a ogni esecuzione.
export default defineConfig({
  plugins: [react(), tailwindcss(), inlineAppleTouchIcon(), cloudflare({ persistState: process.env.E2E_STATE ? { path: process.env.E2E_STATE } : true })],
  build: { sourcemap: false },
  // Worker minificato: meno codice da leggere al primo avvio di un'istanza (limite di 10 ms di CPU).
  environments: {
    homelibrary: { build: { minify: true } },
    // React e il router in un file proprio: cambia solo quando cambiano le librerie, quindi dopo una
    // pubblicazione resta nella cache del service worker e il telefono riscarica solo il codice dell'app.
    client: {
      build: {
        rolldownOptions: {
          output: { codeSplitting: { groups: [{ name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ }] } },
        },
      },
    },
  },
});
