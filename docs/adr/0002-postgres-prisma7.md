# ADR-0002: PostgreSQL 18 e Prisma 7.x stabile

**Date**: 2026-10-29
**Status**: accepted
**Deciders**: Riccardo Zonno, Claude

## Context
Il brief fissa PostgreSQL + Prisma. Al 29/10/2026 il tag `latest` di npm per `prisma` punta a 8.0.0-rc.28 (release candidate); l'ultima stabile è 7.10.1, ed è quella supportata come peer da Better Auth 1.7.

## Decision
Prisma **7.x** (versione fissata nel lockfile), PostgreSQL **18** (immagine `postgres:18-alpine`, multi-arch). Le parti non esprimibili nello schema Prisma (indice trigram, unicità case-insensitive del nome sede) vanno in migrazioni SQL scritte a mano.

## Alternatives Considered
### Prisma 8 RC
- **Pro**: novità più recenti.
- **Contro**: non è stabile e non è nella matrice dei peer di Better Auth.
- **Perché no**: in produzione su un Pi senza supervisione vogliamo solo versioni stabili.
### SQLite
- **Pro**: zero servizi in più.
- **Contro**: il brief chiede Postgres; backup a caldo e concorrenza meno robusti.
- **Perché no**: decisione già presa nel brief.

## Consequences
### Positive
- Stack stabile e documentato; aggiornamento a Prisma 8 pianificabile più avanti con un nuovo ADR.
### Negative
- Alcune funzioni di Prisma 8 non disponibili.
### Risks
- Aggiornamenti di major Postgres richiedono dump/restore: documentati nel README.
