import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root mancante in index.html");

// Service worker (solo asset statici e pagina offline: public/sw.js), non in sviluppo.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // Senza service worker l'app funziona lo stesso: manca solo la pagina offline.
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
