-- Restrizioni del ruolo applicativo "app" (ADR-0005). Riapplicate dopo ogni ripristino:
-- su un database nuovo i privilegi predefiniti di init-roles.sh si sommano a quelli del dump.
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM app;
REVOKE DELETE, TRUNCATE ON "User" FROM app;
REVOKE ALL ON "_prisma_migrations" FROM app;
