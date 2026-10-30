# Servizio di backup (ADR-0010): restic + pg_dump (client Postgres 18) + supercronic.
FROM alpine:3.24

# uid/gid 1000: lo stesso dell'utente "node" che scrive le copertine e dell'utente del Pi che possiede il disco USB.
RUN apk add --no-cache restic postgresql18-client supercronic tzdata curl ca-certificates bash \
  && addgroup -g 1000 backup && adduser -D -u 1000 -G backup -h /home/backup backup \
  && mkdir -p /status /cache /restore && chown backup:backup /status /cache /restore

COPY --chmod=0755 backup.sh restore-snapshot.sh /usr/local/bin/
COPY crontab /etc/home-library-crontab

# La cache di restic accelera i backup successivi (volume dedicato).
ENV RESTIC_CACHE_DIR=/cache
USER backup
CMD ["supercronic", "-passthrough-logs", "/etc/home-library-crontab"]
