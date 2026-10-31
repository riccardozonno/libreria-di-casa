# HOME LIBRARY

I libri di famiglia, in ogni sede. Web app installabile sul telefono (PWA) per catalogare libri e copie
in più case, con ruoli (amministratore, editor per sede, lettore).

> **Versione 2 in costruzione** sul branch `cloudflare`: tutta sul piano gratuito di Cloudflare
> (Workers, D1, R2, Access), senza server e senza dominio. Stato: **fase 6 (backup e ripristino) completata**.
> La versione 1 (Next.js + Postgres + Docker) resta su `main` e nel tag `v1-nextjs`.
> Piano e decisioni: [docs/PLAN.md](docs/PLAN.md) · [ADR-0014](docs/adr/0014-riscrittura-cloudflare.md) · [permessi](docs/permissions.md) · [backup e ripristino](docs/backup-restore.md).

## Com'è fatta

| Parte | Tecnologia | Dove |
|---|---|---|
| Interfaccia (file statici, PWA) | React 19 + Vite + Tailwind 4 | `src/` |
| API JSON (`/api/*`) | Hono su Cloudflare Workers | `worker/` |
| Regole condivise (permessi, ISBN, validazioni) | TypeScript puro | `shared/` |
| Database | D1 (SQLite) + Drizzle, ricerca FTS5 | `worker/db/`, `migrations/` |
| Copertine | R2 | — |
| Accesso | Cloudflare Access (email + codice, nessuna password) | `worker/auth/` |

Ogni richiesta all'API verifica la firma del token di Access e rilegge utente, ruolo e sedi da D1.

## Avvio in locale (Mac)

Requisiti: Node 24+ e pnpm. Niente Docker: D1 e R2 girano in locale con Miniflare.

```bash
pnpm install
cp .dev.vars.example .dev.vars        # in locale Access è spento: entri come admin@example.test
pnpm db:migrate:local
pnpm admin:create --email admin@example.test --name "Admin di prova"
pnpm dev                              # http://localhost:5173
```

## Controlli

```bash
pnpm lint && pnpm typecheck
pnpm test                 # unitari (Node) + integrazione (runtime Workers con D1 e migrazioni vere)
pnpm test:coverage        # soglia 80%
pnpm e2e                  # Playwright sulla build vera: iPhone (WebKit) e Android (Chromium)
```

## Pubblicazione (solo l'amministratore del progetto)

```bash
pnpm exec wrangler d1 migrations apply DB --remote
pnpm build && pnpm exec wrangler deploy
pnpm admin:create --email tu@example.com --name "Nome" --remote   # primo amministratore
```

L'app è su `https://homelibrary.r-z030600.workers.dev`, dietro Cloudflare Access (metodo One-time PIN,
regola per email). La guida completa arriva con le fasi 7 e 8.
