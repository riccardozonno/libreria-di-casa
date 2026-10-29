# ADR-0007: Scansione dei codici a barre con il polyfill barcode-detector (zxing-wasm) self-hosted

**Date**: 2026-10-29
**Status**: proposed
**Deciders**: Riccardo Zonno, Claude

## Context
La scansione deve funzionare nel browser, anche su iPhone Safari, che non implementa l'API nativa `BarcodeDetector`. La fotocamera richiede HTTPS.

## Decision
Pacchetto `barcode-detector` (v3): usa l'API nativa dove esiste (Chrome Android) e altrimenti zxing-cpp compilato in WebAssembly. Il file `.wasm` è servito dalla nostra app (non da CDN), quindi la CSP resta `'self'` più `'wasm-unsafe-eval'`. Formati: EAN-13 (ISBN 978/979) ed EAN-8/UPC per robustezza. Video con `getUserMedia` (fotocamera posteriore), decodifica a ~8 fps, vibrazione/feedback al riconoscimento, campo manuale sempre disponibile.

## Alternatives Considered
### html5-qrcode
- **Pro**: UI pronta.
- **Contro**: progetto poco mantenuto, UI difficile da adattare.
- **Perché no**: manutenzione incerta.
### @zxing/browser
- **Pro**: puro JS.
- **Contro**: più lento su telefono, versione 0.x poco attiva.
- **Perché no**: zxing-wasm è più veloce e attivo.
### Scatto foto e decodifica lato server
- **Pro**: niente WASM nel client.
- **Contro**: esperienza lenta, upload di immagini.
- **Perché no**: peggiore da telefono.

## Consequences
### Positive
- Una sola API per tutti i browser; nativa dove possibile.
### Negative
- ~1 MB di WASM caricato solo nella pagina "Aggiungi" (poi in cache del service worker).
### Risks
- Comportamento della fotocamera nelle PWA installate su iOS: verifica reale su iPhone in fase 2 e di nuovo in fase 7.
