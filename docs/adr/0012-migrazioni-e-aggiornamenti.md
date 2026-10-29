# ADR-0012: Migrazioni con servizio dedicato e aggiornamenti con rollback

**Date**: 2026-10-29
**Status**: proposed
**Deciders**: Riccardo Zonno, Claude

## Context
Le migrazioni non devono mai resettare il database di produzione; gli aggiornamenti devono poter tornare indietro.

## Decision
- Sviluppo: `prisma migrate dev`. Produzione: **solo** `prisma migrate deploy`, eseguito dal servizio one-shot `migrate` (stessa immagine dell'app); `migrate reset` e `db push` non sono mai usati da script di produzione.
- Una sola istanza e qualche secondo di fermo sono accettabili: il rollback di schema avviene ripristinando il dump fatto all'inizio dell'aggiornamento. Le migrazioni distruttive (rimozione di colonne/tabelle) si evitano quando possibile ma non serve un processo expand/contract formale.
- `update.sh`: backup → `git pull` → build con tag del commit → `migrate` → riavvio app → attesa healthcheck. Se qualcosa fallisce: riavvio con l'immagine precedente; se la migrazione era già applicata e incompatibile, ripristino del dump fatto all'inizio (con conferma).

## Alternatives Considered
### Migrazioni all'avvio dell'app
- **Pro**: zero passaggi.
- **Contro**: più repliche/riavvii in loop possono rieseguire migrazioni a metà; errori nascosti nei log.
- **Perché no**: un passo esplicito è più controllabile.

## Consequences
### Positive
- Aggiornamenti ripetibili e reversibili.
### Negative
- Un rollback dopo una migrazione applicata richiede il ripristino del dump (perdendo le modifiche fatte nel frattempo: pochi minuti).
### Risks
- Migrazione lunga con app ferma: a questa scala, secondi.
