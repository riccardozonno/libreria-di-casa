"use client";

import { useEffect } from "react";

// Registra il service worker (solo asset statici e pagina offline: vedi public/sw.js).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Senza service worker l'app funziona lo stesso: manca solo la pagina offline.
    });
  }, []);
  return null;
}
