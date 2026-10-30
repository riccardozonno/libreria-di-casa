import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Un solo progetto: interfaccia statica (React) + Worker dell'API, in locale come in produzione.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  build: { sourcemap: false },
});
