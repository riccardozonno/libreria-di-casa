# ADR-0011: Ricerca con testo normalizzato e indice pg_trgm

**Date**: 2026-10-29
**Status**: accepted
**Deciders**: Riccardo Zonno, Claude

## Context
Ricerca per titolo, autore, ISBN su qualche migliaio di libri, da telefono, tollerante ad accenti e maiuscole.

## Decision
Colonna `searchText` calcolata dall'app (titolo + autori + ISBN, NFD senza diacritici, minuscolo), query `ILIKE '%termine%'` per ogni parola (AND), indice GIN `gin_trgm_ops` dichiarato nello schema Prisma (`@@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)`) così le migrazioni future non lo eliminano; estensione `pg_trgm` creata nella prima migrazione. A qualche migliaio di righe è un'ottimizzazione leggera, non indispensabile. Paginazione a offset, 24 per pagina.

## Alternatives Considered
### Full-text search di Postgres (tsvector)
- **Pro**: stemming, ranking.
- **Contro**: lo stemming italiano non aiuta su titoli e nomi; risultati parziali poco intuitivi.
- **Perché no**: complessità senza beneficio a questa scala.
### Motore esterno (Meilisearch)
- **Pro**: tolleranza agli errori.
- **Contro**: un servizio in più da gestire e salvare.
- **Perché no**: sproporzionato.

## Consequences
### Positive
- Semplice, veloce, nessuna estensione oltre a `pg_trgm`.
### Negative
- Niente tolleranza agli errori di battitura.
### Risks
- La normalizzazione deve essere identica in scrittura e lettura: una sola funzione condivisa e testata.
