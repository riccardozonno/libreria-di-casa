import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root mancante in index.html");

// Dopo una pubblicazione i file JS hanno un nuovo nome: un'app rimasta aperta che carica una pagina a
// richiesta cerca quello vecchio, che non c'è più. Si ricarica la pagina (con i nomi nuovi), ma al massimo
// una volta al minuto: se un file manca davvero, l'errore resta visibile invece di ricaricare all'infinito.
const RELOAD_KEY = "home-library:reload-after-deploy";
const RELOAD_PAUSE_MS = 60_000;
let isReloading = false;
window.addEventListener("vite:preloadError", (event) => {
  // Vite può segnalare lo stesso caricamento due volte: con la ricarica già avviata, niente errore a schermo.
  if (isReloading) {
    event.preventDefault();
    return;
  }
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_PAUSE_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return; // Senza sessionStorage (navigazione privata molto restrittiva) meglio non rischiare un ciclo.
  }
  isReloading = true;
  event.preventDefault();
  window.location.reload();
});

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
