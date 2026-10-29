# ADR-0010: Backup restic notturno su USB e Backblaze B2

**Date**: 2026-10-29
**Status**: proposed
**Deciders**: Riccardo Zonno, Claude

## Context
Backup cifrati notturni, conservazione 7/4/6, devono contenere tutto il necessario per ricostruire il sito senza perdere dati (decisione dell'utente in fase 0).

## Decision
- Servizio `backup` (immagine alpine: restic, `postgresql18-client`, supercronic) alle **03:30**.
- Contenuto di ogni snapshot, in quest'ordine: `pg_dump -Fc` coerente, poi volume `covers` (una copertina più nuova del dump è innocua, il contrario no), `.env` e configurazione compose, file `VERSION` con commit git e tag immagine.
- Due repository restic indipendenti (stessa password): disco USB montato sull'host e bucket B2. `restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune`, `restic check --read-data-subset 5%` settimanale su **entrambi** i repository.
- B2: chiave applicativa limitata al solo bucket; il bucket conserva le versioni eliminate per 30 giorni (lifecycle), così un Pi compromesso non può cancellare i backup in modo definitivo.
- Controllo esterno: a fine backup riuscito un ping a un servizio di heartbeat gratuito (es. healthchecks.io), che avvisa se il ping non arriva. Da confermare con l'utente in fase 5.
- Esito scritto in un file di stato (letto dall'healthcheck e mostrato all'admin) e nei log.
- Fuori dal backup, nel password manager dell'utente: password restic e credenziali B2.
- Script `restore.sh`: ripristino guidato su installazione vuota, provato davvero in fase 5 (Mac) e fase 6 (Pi).

## Alternatives Considered
### Solo pg_dump in cron con copia su B2 (rclone)
- **Pro**: più semplice.
- **Contro**: niente deduplicazione né cifratura integrata né retention.
- **Perché no**: restic è richiesto dal brief e copre tutto.
### Snapshot del volume Postgres a caldo
- **Pro**: veloce.
- **Contro**: non coerente senza fermare il DB.
- **Perché no**: pg_dump è coerente e portabile tra versioni.

## Consequences
### Positive
- Ripristino completo da un solo snapshot, anche su un Pi nuovo.
### Negative
- Il `.env` è nel backup: la sicurezza dipende dalla password restic (va conservata con cura).
### Risks
- Disco USB non montato: un bind mount vuoto sembrerebbe una cartella normale sull'SSD. Lo script verifica dentro il container la presenza di un file marcatore scritto sul disco USB alla preparazione, ed esce con errore se manca.
