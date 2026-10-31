#!/bin/sh
# restic dentro Docker (OrbStack) per le prove sul Mac, senza installarlo: stessi argomenti di restic.
# L'archivio (RESTIC_REPOSITORY, percorso assoluto) e la cartella corrente sono montati nel container.
set -eu
mkdir -p "$RESTIC_REPOSITORY"
exec docker run --rm -i \
  -e RESTIC_PASSWORD -e RESTIC_REPOSITORY \
  -v "$RESTIC_REPOSITORY:$RESTIC_REPOSITORY" -v "$PWD:$PWD" -w "$PWD" \
  restic/restic:0.18.1 "$@"
