#!/usr/bin/env bash
# Ripristino guidato di HOME LIBRARY da un backup restic (ADR-0010).
#   ops/restore.sh [usb|b2] [snapshot-id|latest]
# Prerequisiti: .env presente (stessa RESTIC_PASSWORD), servizio db avviabile.
# Su un Pi nuovo: copia prima il .env del backup (o ricrealo) e avvia `docker compose up -d db`.
# COMPOSE permette di puntare a un altro progetto (es. la prova di ripristino isolata).
set -Eeuo pipefail

COMPOSE="${COMPOSE:-docker compose}"
SOURCE="${1:-usb}"
SNAPSHOT="${2:-latest}"
PROJECT="$($COMPOSE config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"

step() { printf '\n==> %s\n' "$*"; }

step "1/6 Estraggo e verifico lo snapshot $SNAPSHOT ($SOURCE) — nessuna modifica ai dati"
$COMPOSE up -d --wait db
$COMPOSE run --rm --no-deps backup restore-snapshot.sh "$SOURCE" "$SNAPSHOT"

step "2/6 Conferma"
echo "Il database e le copertine del progetto \"$PROJECT\" verranno SOSTITUITI con quelli dello snapshot."
if [[ "${RESTORE_ASSUME_YES:-}" != "1" ]]; then
  read -r -p 'Scrivi RIPRISTINA per continuare: ' answer
  [[ "$answer" == "RIPRISTINA" ]] || { echo "Annullato."; exit 1; }
fi

step "3/6 Fermo l'applicazione"
$COMPOSE stop app || true

step "4/6 Ripristino il database"
$COMPOSE run --rm --no-deps -v "$(pwd)/ops/db/harden-app-role.sql:/config/harden-app-role.sql:ro" --entrypoint bash backup -c '
  set -euo pipefail
  dump="$(find /restore -name database.dump -print -quit)"
  pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$PGDATABASE" "$dump"
  psql -v ON_ERROR_STOP=1 -q -f /config/harden-app-role.sql
  psql -tAc "SELECT CASE WHEN has_table_privilege('"'"'app'"'"', '"'"'\"AuditLog\"'"'"', '"'"'UPDATE'"'"') THEN '"'"'ERRORE: registro modificabile'"'"' ELSE '"'"'permessi del ruolo app verificati'"'"' END"
  psql -v ON_ERROR_STOP=1 -tAc "SELECT count(*) || '"'"' libri'"'"' FROM \"Book\""
'

step "5/6 Ripristino le copertine"
$COMPOSE run --rm --no-deps --user root --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER -v "${PROJECT}_covers:/covers-rw" --entrypoint sh backup -c '
  set -eu
  rm -rf /covers-rw/* && cp -a /restore/data/covers/. /covers-rw/ && chown -R 1000:1000 /covers-rw
  echo "$(ls /covers-rw | wc -l) copertine"
'

step "6/6 Riavvio e controllo di salute"
$COMPOSE up -d --wait app
echo "Ripristino completato. Configurazione salvata nello snapshot (se serve su un Pi nuovo): volume ${PROJECT}_restore-area, cartella config/."
