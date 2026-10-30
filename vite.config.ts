import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Un solo progetto: interfaccia statica (React) + Worker dell'API, in locale come in produzione.
// E2E_STATE: gli E2E usano un D1 locale separato, ricreato a ogni esecuzione.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare({ persistState: process.env.E2E_STATE ? { path: process.env.E2E_STATE } : true })],
  build: { sourcemap: false },
});
