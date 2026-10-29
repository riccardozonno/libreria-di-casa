# ADR-0006: Modello Libro/Copia, ISBN-13 normalizzato e dati bibliografici bloccati

**Date**: 2026-10-29
**Status**: accepted
**Deciders**: Riccardo Zonno, Claude

## Context
Un libro (dati bibliografici) può avere più copie in sedi diverse. I dati arrivano da Google Books/Open Library; l'utente ha deciso che dopo la creazione non devono cambiare, salvo correzioni dell'admin. "Letto da" vale per il libro.

## Decision
- `Book` unico per `isbn13` (ISBN-10 convertito, checksum verificato); `isbn13` null ammesso, senza vincolo di unicità tra i libri senza ISBN.
- `Copy` con sede, collocazione e note. Un libro ha sempre ≥ 1 copia: si crea insieme alla prima e si elimina con l'ultima.
- Dati bibliografici compilabili da chi crea il libro; poi modificabili solo dall'admin.
- Solo l'admin elimina un libro: un editor può eliminare una copia solo se il libro ne ha almeno un'altra (decisione dell'utente, 29/10/2026). Il controllo avviene dopo il `FOR UPDATE` sul libro.
- `BookReading` (utente, libro, chi l'ha segnato).
- `CopyMovement` legato al libro, così lo storico resta anche se la copia viene eliminata.
- Autori come `String[]` ordinato, non tabella separata.
- **Concorrenza**: aggiunta, eliminazione e spostamento di copie bloccano prima la riga del libro (`SELECT … FROM "Book" WHERE id = $1 FOR UPDATE`), poi contano le copie; così due eliminazioni simultanee non lasciano un libro senza copie. Due creazioni simultanee dello stesso ISBN: l'errore di unicità (P2002) diventa "esiste già: vuoi aggiungere una copia?".

## Alternatives Considered
### Tabella Autori con relazione molti-a-molti
- **Pro**: normalizzazione, pagine per autore.
- **Contro**: le API restituiscono nomi non uniformi; fusioni e duplicati da gestire.
- **Perché no**: YAGNI; la ricerca per autore funziona sul testo.
### Libri modificabili dagli editor
- **Pro**: correzioni più rapide.
- **Contro**: dati condivisi tra sedi modificabili da chiunque.
- **Perché no**: decisione dell'utente (fase 0).

## Consequences
### Positive
- Schema semplice; duplicati impossibili per ISBN.
### Negative
- Una tabella Autori richiederebbe una migrazione futura.
### Risks
- Libri senza ISBN possono duplicarsi: in fase di inserimento manuale mostriamo i titoli simili prima di salvare.
