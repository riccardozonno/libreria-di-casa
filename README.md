# HOME LIBRARY

I libri di famiglia, in ogni sede. Web app installabile sul telefono (PWA) per catalogare libri e copie
in più case, con ruoli (amministratore, editor per sede, lettore).

> Stato: **fase 6 (produzione sul Raspberry Pi)**. Documentazione completa (deploy sul Raspberry Pi, backup, guida d'uso) nelle fasi successive.
> Progetto e decisioni: [docs/PLAN.md](docs/PLAN.md) · [architettura](docs/architecture.md) · [permessi](docs/permissions.md) · [ADR](docs/adr/README.md).

## Avvio in locale (Mac, OrbStack)

Requisiti: OrbStack (Docker), Node 24+, pnpm.

```bash
pnpm install
cp .env.example .env        # poi compila i valori (vedi i commenti nel file)
docker compose -f compose.yaml -f compose.dev.yaml up -d db db-test
pnpm prisma migrate deploy
pnpm admin:create --name "Il tuo nome" --email tu@example.com   # stampa il link per impostare la password
pnpm dev                    # http://localhost:3000
```

Per lo sviluppo dal Mac, in `.env` `DATABASE_URL` e `MIGRATION_DATABASE_URL` puntano a `localhost:5432`
(il database pubblica la porta solo su 127.0.0.1, e solo con `compose.dev.yaml`).

### Come in produzione (container)

```bash
docker compose -f compose.yaml -f compose.dev.yaml build
docker compose -f compose.yaml -f compose.dev.yaml --profile migrate run --rm migrate
docker compose -f compose.yaml -f compose.dev.yaml up -d app       # http://localhost:3000
```

## Verifiche

| Comando | Cosa fa |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ESLint e TypeScript strict |
| `pnpm test` | Test unitari |
| `pnpm test:integration` | Test su Postgres reale (`db-test`, in memoria, porta 5433) |
| `pnpm test:coverage` | Unitari + integrazione con soglia 80% |
| `pnpm e2e` | Playwright su build di produzione, iPhone (WebKit) e Android (Chromium) |
