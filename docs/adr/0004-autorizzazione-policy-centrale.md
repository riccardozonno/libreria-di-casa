# ADR-0004: Autorizzazione con un modulo di policy centrale e ruoli letti dal DB a ogni richiesta

**Date**: 2026-10-29
**Status**: proposed
**Deciders**: Riccardo Zonno, Claude

## Context
Tre ruoli, editor legati a sedi, spostamenti che richiedono due sedi. Il brief chiede controlli lato server su ogni operazione. Le Server Actions sono endpoint POST pubblici.

## Decision
- `src/server/policy.ts`: funzioni **pure** `can(actor, action, resource)` che implementano la [matrice](../permissions.md); nessun accesso al DB.
- `getActor()` ricarica a ogni richiesta utente, ruolo, stato e sedi dal DB (una query), così cambi di ruolo e disattivazioni valgono subito.
- Ogni Server Action segue lo schema: zod → `getActor` → `policy` → servizio in transazione. Un test di lint/strutturale verifica che ogni file di action importi la policy.
- Le risorse usate dalla policy (sede attuale della copia, stato archiviata) si leggono **dentro la transazione** di scrittura per evitare race condition.

## Alternatives Considered
### Ruoli nella sessione/JWT
- **Pro**: zero query.
- **Contro**: cambi di ruolo e revoche non immediati.
- **Perché no**: con ≤ 10 utenti una query in più non conta.
### Plugin `admin`/`access` di Better Auth
- **Pro**: già pronto.
- **Contro**: non modella permessi per sede né la regola degli spostamenti su due sedi.
- **Perché no**: servirebbe comunque una policy nostra; meglio una sola fonte di verità.
### Row Level Security di Postgres
- **Pro**: difesa nel DB.
- **Contro**: complessa con Prisma e con un solo utente DB.
- **Perché no**: sproporzionata alla scala.

## Consequences
### Positive
- Matrice testabile in modo esaustivo con test tabellari.
### Negative
- Una query in più per richiesta.
### Risks
- Dimenticare la policy in una nuova action: mitigato dal test strutturale e dai test di integrazione per ruolo.
