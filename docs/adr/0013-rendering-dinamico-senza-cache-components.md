# ADR-0013: Rendering dinamico senza Cache Components

**Date**: 2026-10-29
**Status**: accepted
**Deciders**: Riccardo Zonno, Claude

## Context
Next.js 16.4 genera i progetti con `cacheComponents` e `partialPrefetching` attivi. Con Cache Components ogni lettura della sessione deve stare dietro un `<Suspense>` e i dati legati all'utente vanno messi in cache con `use cache: private`. Tutte le nostre pagine dipendono dalla sessione e dal ruolo, che devono valere subito (ADR-0004); la CSP con nonce richiede comunque il rendering dinamico.

## Decision
`cacheComponents: false`: ogni pagina è renderizzata a ogni richiesta, rileggendo l'utente dal DB. Nessuna cache di dati per utente.

## Alternatives Considered
### Cache Components con `use cache: private`
- **Pro**: navigazioni più rapide grazie al prefetch.
- **Contro**: cache dei dati utente nel browser, quindi un cambio di ruolo o una disattivazione non sono immediati; più complessità (Suspense ovunque).
- **Perché no**: a questa scala (≤ 10 utenti, pagine da pochi ms) il guadagno è trascurabile e la correttezza dei permessi conta di più.

## Consequences
### Positive
- Permessi sempre aggiornati, CSP con nonce senza eccezioni.
### Negative
- Next.js annuncia che Cache Components sarà obbligatorio nella prossima major: l'aggiornamento a Next 17 richiederà una migrazione (guida ufficiale `migrating-to-cache-components`).
### Risks
- Nessuno a breve termine: versione di Next fissata nel lockfile.
