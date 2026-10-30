# Backup e ripristino

Decisione: [ADR-0010](adr/0010-backup-restic.md). Servizio `backup` in `compose.yaml`, script in `ops/backup/` e `ops/restore.sh`.

## Cosa viene salvato
Ogni notte alle **03:30** (supercronic, fuso Europe/Rome) uno snapshot restic cifrato con:

| Contenuto | Origine |
|---|---|
| `database.dump` | `pg_dump -Fc` come proprietario dello schema (verificato con `pg_restore --list`) |
| copertine | volume `covers` (sola lettura) |
| `.env`, `compose.yaml` | configurazione completa per ricostruire il sito |
| `VERSION` | tag/commit dell'app, data, versione di `pg_dump` |

Repository: **disco USB** (obbligatorio, riconosciuto dal file marcatore `.home-library-backup-disk`) e **Backblaze B2** (se `RESTIC_REPOSITORY_B2` è impostato). Conservazione **7 giornalieri / 4 settimanali / 6 mensili**; la domenica `restic check --read-data-subset=5%` su ogni repository. Esito in `/status/last-backup.json` (volume `backup-status`) e, se configurato, ping a `BACKUP_HEARTBEAT_URL`.

**Fuori dal backup, da conservare nel password manager:** `RESTIC_PASSWORD` e le credenziali B2. Senza la password i backup sono illeggibili.

## Comandi
```bash
# backup manuale (stesso script della notte)
docker compose run --rm backup backup.sh
# elenco degli snapshot
docker compose run --rm --entrypoint restic backup -r /backup/usb snapshots
# ripristino guidato (chiede di scrivere RIPRISTINA prima di sovrascrivere)
ops/restore.sh usb latest        # oppure: ops/restore.sh b2 <id-snapshot>
```

`ops/restore.sh`: 1) estrae e verifica lo snapshot (nessuna modifica); 2) conferma; 3) ferma l'app; 4) `pg_restore --clean --no-owner` e riapplica `ops/db/harden-app-role.sql`; 5) ripristina le copertine; 6) riavvia l'app e attende il controllo di salute.

**Su un Raspberry Pi nuovo:** installa Docker e la repo, recupera `.env` (dal password manager o dallo snapshot: `restic restore latest --include /config/.env`), monta il disco USB, `docker compose up -d db`, poi `ops/restore.sh usb latest`.

## Prova di ripristino — Mac, 30/10/2026
Repository locale di prova `./backups/usb-test` al posto del disco USB. Ripristino in un progetto Docker **separato e vuoto** (`homelibrary-restoretest`: database, copertine e app nuovi), senza toccare i dati di sviluppo.

| Verifica | Originale | Ripristinato | Esito |
|---|---|---|---|
| libri / copie / utenti / sedi / eventi di audit | 3 / 3 / 4 / 2 / 43 | 3 / 3 / 4 / 2 / 43 | ✅ |
| copertine (numero, impronta sha256 dell'insieme) | 3, `905c23f461ae6110` | 3, `905c23f461ae6110` | ✅ |
| hash password dell'admin di prova | `7119c00889e3…` | `7119c00889e3…` | ✅ |
| app: `/api/health` | 200 | 200 | ✅ |
| ruolo `app`: UPDATE su AuditLog / DELETE su User / INSERT su Book | no / no / sì | no / no / sì | ✅ (dopo la correzione sotto) |
| backup con disco USB non montato | — | rifiutato, nulla scritto, stato `ok:false` | ✅ |

**Problema trovato dalla prova e corretto:** al primo ripristino il ruolo `app` poteva di nuovo modificare il registro attività, perché su un database nuovo i privilegi predefiniti di `init-roles.sh` si sommano ai GRANT del dump. Ora `restore.sh` riapplica `harden-app-role.sql` e verifica il risultato.
