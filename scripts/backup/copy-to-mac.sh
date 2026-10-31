#!/bin/sh
# Seconda copia dei backup, fuori dal cloud: copia gli snapshot da Backblaze B2 in un archivio
# restic su questo Mac (meglio su un disco esterno). Chiede chiavi e password senza mostrarle.
# Si aggiorna solo quando lo lanci (es. una volta al mese); la cifratura e la password sono le stesse.
#
#   scripts/backup/copy-to-mac.sh "/Volumes/Disco esterno/home-library-backup"
set -eu
DEST="${1:?Indica la cartella di destinazione sul Mac (es. un disco esterno)}"
PATH="$HOME/.orbstack/bin:$PATH"
cd "$(dirname "$0")/../.."

if [ -z "${FROM_REPOSITORY:-}" ]; then
  printf "Nome del bucket B2 (es. homelibrary-backup): "; read -r B2_BUCKET
  printf "B2 keyID: "; stty -echo; read -r B2_ACCOUNT_ID; stty echo; echo
  printf "B2 applicationKey: "; stty -echo; read -r B2_ACCOUNT_KEY; stty echo; echo
  FROM_REPOSITORY="b2:$B2_BUCKET:homelibrary"
  export B2_ACCOUNT_ID B2_ACCOUNT_KEY
fi
if [ -z "${RESTIC_PASSWORD:-}" ]; then
  printf "Password del backup (restic): "; stty -echo; read -r RESTIC_PASSWORD; stty echo; echo
fi
DEST="$(mkdir -p "$DEST" && cd "$DEST" && pwd)"
export RESTIC_PASSWORD RESTIC_FROM_PASSWORD="$RESTIC_PASSWORD" RESTIC_REPOSITORY="$DEST"

# restic in Docker: monta l'archivio di destinazione (e quello di origine, se è una cartella locale).
restic() {
  FROM_MOUNT=""
  case "$FROM_REPOSITORY" in /*) FROM_MOUNT="-v $FROM_REPOSITORY:$FROM_REPOSITORY" ;; esac
  # shellcheck disable=SC2086
  docker run --rm -i -v "$DEST:$DEST" $FROM_MOUNT \
    -e RESTIC_PASSWORD -e RESTIC_FROM_PASSWORD -e RESTIC_REPOSITORY -e B2_ACCOUNT_ID -e B2_ACCOUNT_KEY \
    restic/restic:0.18.1 "$@"
}

if ! restic cat config >/dev/null 2>&1; then
  echo "Archivio nuovo in $DEST"
  restic init --from-repo "$FROM_REPOSITORY" --copy-chunker-params
fi
restic copy --from-repo "$FROM_REPOSITORY"
restic snapshots --compact
echo "Copia aggiornata in $DEST"
