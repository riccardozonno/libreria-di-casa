-- Revisione database fase 4: privilegi del ruolo "app" verificati e non più condizionali.
-- Il ruolo è creato da ops/db/init-roles.sh: se manca, la migrazione fallisce invece di saltare i REVOKE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    RAISE EXCEPTION 'Ruolo "app" mancante: eseguire ops/db/init-roles.sh prima delle migrazioni';
  END IF;
END
$$;

REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM app;
-- Gli utenti si disattivano soltanto: niente DELETE (eviterebbe anche il SET NULL sul registro).
REVOKE DELETE, TRUNCATE ON "User" FROM app;
REVOKE ALL ON "_prisma_migrations" FROM app;
-- Nessuna richiesta può restare appesa per sempre (pool piccolo sul Raspberry Pi).
ALTER ROLE app SET statement_timeout = '30s';
ALTER ROLE app SET lock_timeout = '10s';
