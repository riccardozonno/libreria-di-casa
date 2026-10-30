#!/usr/bin/env bash
# Estrae uno snapshot restic in /restore (volume di lavoro). NON tocca database né copertine:
# l'applicazione del ripristino la fa ops/restore.sh, dopo una conferma esplicita.
#   restore-snapshot.sh <usb|b2> [snapshot-id|latest]
set -Eeuo pipefail

: "${RESTIC_PASSWORD:?RESTIC_PASSWORD mancante}"
source_name="${1:?usare: restore-snapshot.sh <usb|b2> [snapshot]}"
snapshot="${2:-latest}"
target="${RESTORE_DIR:-/restore}"

case "$source_name" in
  usb) export RESTIC_REPOSITORY="${RESTIC_REPOSITORY_USB:-/backup/usb}" ;;
  b2) export RESTIC_REPOSITORY="${RESTIC_REPOSITORY_B2:?RESTIC_REPOSITORY_B2 mancante}" ;;
  *) echo "sorgente sconosciuta: $source_name (usb o b2)" >&2; exit 2 ;;
esac

echo "Snapshot disponibili su $source_name:"
restic snapshots --tag nightly --compact

rm -rf "${target:?}"/*
restic restore "$snapshot" --target "$target"
restic check --read-data-subset=1% > /dev/null

dump="$(find "$target" -name database.dump -print -quit)"
[[ -n "$dump" ]] || { echo "nello snapshot manca database.dump" >&2; exit 1; }
pg_restore --list "$dump" > /dev/null
echo "Snapshot $snapshot estratto in $target e verificato."
find "$target" -name VERSION -exec cat {} \;
