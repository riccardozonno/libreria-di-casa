# ADR-0005: Registro attività nella stessa transazione delle modifiche

**Date**: 2026-10-29
**Status**: proposed
**Deciders**: Riccardo Zonno, Claude

## Context
Ogni modifica (creazione, modifica, spostamento, eliminazione, cambi di ruolo) deve finire in un registro consultabile dall'admin.

## Decision
Tabella `AuditLog` scritta dall'helper `withAudit(tx, …)` **nella stessa transazione** della modifica: o entrambe o nessuna. Campi: autore (id + email copiata), azione, entità, `data` JSON con prima/dopo, IP, data. Mai password, token o segreti. Solo inserimenti, garantiti anche dal DB: l'app si collega con un ruolo Postgres (`app`) che su `AuditLog` ha solo `INSERT`/`SELECT`, mentre le migrazioni usano il ruolo proprietario dello schema (`migrator`). Eccezione documentata: gli eventi di autenticazione (`auth.login`, `auth.login_failed`, `auth.lockout`, `auth.password_reset`) avvengono dentro Better Auth e si registrano negli hook `after`, in una transazione separata. `book.delete` salva nel campo `data` un'istantanea completa (libro, copie, letture, spostamenti) così l'admin può ricostruirlo. Lo storico degli spostamenti ha una tabella dedicata (`CopyMovement`) perché è mostrato agli utenti.

## Alternatives Considered
### Trigger PostgreSQL
- **Pro**: impossibile dimenticarlo.
- **Contro**: il DB non conosce l'utente applicativo né l'IP senza variabili di sessione; logica difficile da testare.
- **Perché no**: complessità superiore al beneficio.
### Middleware Prisma / estensione `` automatica
- **Pro**: automatico.
- **Contro**: registra operazioni tecniche invece di azioni di dominio ("copy.move").
- **Perché no**: vogliamo eventi leggibili dall'admin.

## Consequences
### Positive
- Registro coerente con i dati; leggibile.
### Negative
- Ogni servizio deve chiamare `withAudit`; coperto dai test di integrazione.
### Risks
- Crescita della tabella: trascurabile a questa scala (indice su `createdAt`).
