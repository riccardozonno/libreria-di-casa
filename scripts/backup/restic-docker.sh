#!/bin/sh
# restic dentro Docker (OrbStack) per le prove sul Mac, senza installarlo: stessi argomenti di restic.
# L'archivio (RESTIC_REPOSITORY, percorso assoluto) e la cartella corrente sono montati nel container.
set -eu
# Archivio locale: va creato e montato; archivio remoto (b2:…): niente da montare.
case "$RESTIC_REPOSITORY" in
  /*) mkdir -p "$RESTIC_REPOSITORY"; MOUNT="-v $RESTIC_REPOSITORY:$RESTIC_REPOSITORY" ;;
  *) MOUNT="" ;;
esac
# shellcheck disable=SC2086
exec docker run --rm -i $MOUNT \
  -e RESTIC_PASSWORD -e RESTIC_REPOSITORY -e B2_ACCOUNT_ID -e B2_ACCOUNT_KEY \
  -v "$PWD:$PWD" -w "$PWD" \
  restic/restic:0.18.1 "$@"
