#!/bin/sh
# Eseguito da Postgres solo alla prima inizializzazione del volume.
# Crea il ruolo "app" (solo dati) separato dal proprietario dello schema (POSTGRES_USER).
# Vedi ADR-0005: l'app non può modificare né cancellare il registro attività.
set -eu

if [ -z "${APP_DB_PASSWORD:-}" ]; then
  echo "APP_DB_PASSWORD non impostata" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" -v owner="$POSTGRES_USER" -v dbname="$POSTGRES_DB" <<'SQL'
CREATE ROLE app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE :"dbname" TO app;
GRANT USAGE ON SCHEMA public TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app;
SQL
