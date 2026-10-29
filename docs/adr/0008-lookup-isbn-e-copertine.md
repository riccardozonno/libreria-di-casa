# ADR-0008: Lookup ISBN lato server e copertine salvate in locale

**Date**: 2026-10-29
**Status**: accepted
**Deciders**: Riccardo Zonno, Claude

## Context
La chiave Google Books non deve arrivare al client. Le copertine devono sopravvivere a cambi delle API e finire nel backup.

## Decision
- Route server `isbn/lookup` (solo admin/editor, con rate limit): Google Books (`GOOGLE_BOOKS_API_KEY` da `.env`) → se vuoto, Open Library → altrimenti modulo manuale precompilato con l'ISBN. Risposte validate con zod, normalizzate in un tipo `BookCandidate`, cache in memoria 24 h.
- Copertine: scaricate **solo** da host consentiti (`books.google.com`, `books.googleusercontent.com`, `covers.openlibrary.org`, `archive.org` e i suoi sottodomini, dove Open Library rimanda), solo HTTPS (gli URL `http://` di Google vengono convertiti), `redirect: "manual"` con massimo 3 salti e allowlist ricontrollata a ogni salto, timeout 5 s, lettura interrotta oltre 5 MB, Open Library con `?default=false` (niente immagine segnaposto), poi ricodificate con **sharp** in WebP (max 600 px, `limitInputPixels` impostato). Il limite di destinazione è applicato dal codice: Docker non può filtrare il traffico in uscita per host. Anche le foto caricate dal telefono passano dalla stessa ricodifica; il browser le ridimensiona prima dell'invio (max 1600 px) e il server accetta al massimo 4 MB (`serverActions.bodySizeLimit`). File nel volume `covers` con nome casuale; servite da una route che richiede sessione, con `Cache-Control: private, max-age` lungo.

## Alternatives Considered
### Usare direttamente gli URL esterni delle copertine
- **Pro**: niente spazio su disco.
- **Contro**: link che si rompono, richieste a terzi dal telefono degli utenti, CSP più larga.
- **Perché no**: il backup non sarebbe completo.
### Lookup dal client verso Open Library
- **Pro**: meno carico sul Pi.
- **Contro**: la chiave Google resterebbe esposta per Google; logica duplicata.
- **Perché no**: requisito del brief.

## Consequences
### Positive
- Nessuna dipendenza esterna dopo l'inserimento; copertine nel backup.
### Negative
- ~200 MB di disco per 3000 libri; sharp aggiunge un modulo nativo (ha binari arm64).
### Risks
- SSRF tramite URL di copertina: mitigato da allowlist di host, niente redirect verso host non consentiti, limiti di dimensione.
