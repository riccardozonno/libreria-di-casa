# ADR-0001: Monolite Next.js 16 con livello di dominio lato server

**Date**: 2026-10-29
**Status**: proposed
**Deciders**: Riccardo Zonno, Claude

## Context
App piccola (≤ 10 utenti) gestita da una persona, deve girare su un Raspberry Pi. Lo stack Next.js + TypeScript è già deciso nel brief; resta da decidere come organizzare backend e frontend.

## Decision
Un'unica app Next.js 16 (App Router, `output: "standalone"`) con Server Components per le letture e Server Actions per le scritture. Tutta la logica sta in `src/server/` (servizi di dominio, policy, audit), mai nei componenti. Route Handler solo dove servono URL stabili: auth, copertine, export CSV, health.

## Alternatives Considered
### Backend API separato (es. Fastify) + frontend SPA
- **Pro**: confini netti, API riusabile.
- **Contro**: due servizi da costruire, versionare e mettere in sicurezza; CSRF/CORS più complessi.
- **Perché no**: nessun secondo client previsto; raddoppia il lavoro operativo sul Pi.
### API REST interna chiamata dalle pagine
- **Pro**: contratto esplicito.
- **Contro**: duplica validazione e serializzazione senza benefici a questa scala.
- **Perché no**: le Server Actions hanno già controllo Origin e tipizzazione end-to-end.

## Consequences
### Positive
- Un solo container applicativo, deploy semplice.
- Tipi condivisi end-to-end; i servizi in `src/server` sono testabili senza HTTP.
### Negative
- Le Server Actions sono endpoint pubblici: ognuna deve fare validazione + autorizzazione (vedi ADR-0004).
### Risks
- Aggiungere un'app nativa in futuro richiederebbe esporre un'API: i servizi di dominio sono già separati, quindi basterebbe un sottile strato REST.
