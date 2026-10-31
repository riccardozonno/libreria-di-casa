#!/bin/sh
# Ripristino da Backblaze B2, lanciato da te sul Mac: chiede password e chiavi SENZA mostrarle
# (non finiscono nella cronologia del terminale né in file). restic gira in Docker (OrbStack).
#
#   scripts/backup/restore-from-b2.sh <database D1 vuoto> <bucket R2 vuoto> [snapshot]
#
# Esempio (prova di ripristino): scripts/backup/restore-from-b2.sh homelibrary-restore-test homelibrary-restore-test-covers
set -eu
DATABASE="${1:?Indica il database D1 di destinazione (vuoto)}"
BUCKET="${2:?Indica il bucket R2 di destinazione (vuoto)}"
SNAPSHOT="${3:-latest}"
PATH="$HOME/.orbstack/bin:$PATH"

printf "Nome del bucket B2 (es. homelibrary-backup): "; read -r B2_BUCKET
printf "B2 keyID: "; stty -echo; read -r B2_ACCOUNT_ID; stty echo; echo
printf "B2 applicationKey: "; stty -echo; read -r B2_ACCOUNT_KEY; stty echo; echo
printf "Password del backup (restic): "; stty -echo; read -r RESTIC_PASSWORD; stty echo; echo

export B2_ACCOUNT_ID B2_ACCOUNT_KEY RESTIC_PASSWORD
export RESTIC_REPOSITORY="b2:$B2_BUCKET:homelibrary"
export RESTIC_BIN="$(cd "$(dirname "$0")" && pwd)/restic-docker.sh"
exec node "$(dirname "$0")/restore.mjs" --remote --database "$DATABASE" --bucket "$BUCKET" --snapshot "$SNAPSHOT"
