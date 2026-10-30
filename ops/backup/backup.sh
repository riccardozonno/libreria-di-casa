#!/usr/bin/env bash
# Backup notturno di HOME LIBRARY (ADR-0010). Eseguito da supercronic alle 03:30, o a mano:
#   docker compose run --rm backup backup.sh
#
# Contenuto di ogni snapshot, in quest'ordine:
#   1. dump coerente del database (pg_dump -Fc, come proprietario dello schema)
#   2. copertine (volume covers, in sola lettura)
#   3. configurazione: .env e compose.yaml, più VERSION (commit e data)
# Repository: disco USB (obbligatorio) e Backblaze B2 (se configurato). Stesso contenuto, stessa password.
set -Eeuo pipefail

: "${RESTIC_PASSWORD:?RESTIC_PASSWORD mancante}"
: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${PGDATABASE:?}"
USB_REPO="${RESTIC_REPOSITORY_USB:-/backup/usb}"
USB_MARKER="${USB_REPO}/.home-library-backup-disk"
B2_REPO="${RESTIC_REPOSITORY_B2:-}"
STATUS_DIR="${BACKUP_STATUS_DIR:-/status}"
STAGING="$(mktemp -d)"
started_at="$(date -Iseconds)"

log() { printf '%s [backup] %s\n' "$(date -Iseconds)" "$*"; }

write_status() {
  local ok="$1" message="$2"
  mkdir -p "$STATUS_DIR"
  printf '{"startedAt":"%s","finishedAt":"%s","ok":%s,"message":"%s"}\n' \
    "$started_at" "$(date -Iseconds)" "$ok" "${message//\"/\'}" > "$STATUS_DIR/last-backup.json.tmp"
  mv "$STATUS_DIR/last-backup.json.tmp" "$STATUS_DIR/last-backup.json"
}

on_error() {
  local line="$1"
  log "ERRORE alla riga $line"
  write_status false "backup fallito alla riga $line"
  rm -rf "$STAGING"
  exit 1
}
trap 'on_error $LINENO' ERR

# Un disco USB non montato è solo una cartella vuota sull'SSD: il file marcatore lo distingue.
if [[ ! -f "$USB_MARKER" ]]; then
  log "disco di backup non montato: manca $USB_MARKER"
  write_status false "disco di backup non montato"
  exit 1
fi

log "dump del database $PGDATABASE"
pg_dump --format=custom --compress=6 --no-password --file="$STAGING/database.dump"
pg_restore --list "$STAGING/database.dump" > /dev/null # il dump deve essere leggibile

{
  echo "commit=${APP_VERSION:-sconosciuto}"
  echo "backup=$started_at"
  echo "postgres=$(pg_dump --version)"
} > "$STAGING/VERSION"

paths=("$STAGING/database.dump" "$STAGING/VERSION" /data/covers)
[[ -f /config/.env ]] && paths+=(/config/.env)
[[ -f /config/compose.yaml ]] && paths+=(/config/compose.yaml)

backup_to() {
  local repo="$1"
  export RESTIC_REPOSITORY="$repo"
  if ! restic cat config > /dev/null 2>&1; then
    log "inizializzo il repository $repo"
    restic init
  fi
  log "backup verso $repo"
  restic backup --tag nightly --host home-library "${paths[@]}"
  log "conservazione 7 giornalieri / 4 settimanali / 6 mensili su $repo"
  restic forget --tag nightly --host home-library --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
  # Domenica: controllo d'integrità leggendo un campione dei dati.
  if [[ "$(date +%u)" == "7" || "${BACKUP_FORCE_CHECK:-}" == "1" ]]; then
    log "controllo d'integrità di $repo"
    restic check --read-data-subset=5%
  fi
}

backup_to "$USB_REPO"
if [[ -n "$B2_REPO" ]]; then
  : "${B2_ACCOUNT_ID:?}" "${B2_ACCOUNT_KEY:?}"
  backup_to "$B2_REPO"
else
  log "B2 non configurato: solo disco USB"
fi

rm -rf "$STAGING"
write_status true "backup completato"
log "backup completato"

# Controllo esterno facoltativo: un servizio di heartbeat avvisa se questo ping non arriva.
if [[ -n "${BACKUP_HEARTBEAT_URL:-}" ]]; then
  curl -fsS -m 10 --retry 3 "$BACKUP_HEARTBEAT_URL" > /dev/null || log "heartbeat non raggiungibile"
fi
