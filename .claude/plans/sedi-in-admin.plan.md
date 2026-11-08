# Plan: Sedi nell'area admin, Statistiche nella barra in basso

**Source**: richiesta dell'admin dell'08/11/2026, approvata con i punti 1–3 («sì, vanno bene tutti e tre, procedi»)
**Complexity**: Small — solo interfaccia, nessuna modifica ad API, permessi sul server, database o backup

## Summary
La pagina Sedi diventa una sezione dell'area Admin (`/admin/sedi`, solo admin). Nella barra in basso
«Statistiche» prende il posto di «Sedi» per tutti. Gli editor vedono nel Profilo le sedi che gestiscono; i vecchi
link `/sedi` portano l'admin ad Admin → Sedi e gli altri al Catalogo. Tolti i doppioni: il pulsante «Statistiche»
nel Catalogo e «← Catalogo» nelle Statistiche.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Pagine admin a richiesta | `src/app.tsx` (`lazyPage`, `AdminOnly`, `OnDemand`) | stessa forma per `/admin/sedi` |
| Sezioni admin | `src/pages/admin.tsx:8-12` | voce in `SECTIONS` |
| Link «← Admin» | `src/pages/audit.tsx:86` | stesso link in cima alla pagina Sedi |
| Barra in basso | `src/components/bottom-nav.tsx` | icona SVG 24 px con `ICON_PROPS` |
| E2E | `tests/e2e/app.spec.ts` | percorsi per ruolo con `asUser` |

## Tasks
1. **E2E (RED)**: editor e lettore vedono «Statistiche» e non «Sedi» nella barra; `/sedi` li porta al Catalogo; il Profilo dell'editor mostra «Sedi che gestisci: Casa E2E»; l'admin arriva alle Sedi da Admin e `/sedi` lo porta ad `/admin/sedi`; niente pulsante «Statistiche» nel Catalogo. Aggiornati i test esistenti che usavano `/sedi`.
2. **Interfaccia (GREEN)**: rotta `/admin/sedi` (admin, a richiesta) e `/sedi` di reindirizzamento; voce «Sedi» in Admin; barra con «Statistiche» e icona a barre; riga nel Profilo; pagina Sedi con «← Admin» (via «puoi modificarla»); via il pulsante nel Catalogo e il link nelle Statistiche (`BackToCatalog` resta per la scheda del libro).
3. **Documenti**: README, `docs/permissions.md`, nota nel PRD (la decisione del 31/10 sul pulsante nel Catalogo è superata).
4. **Chiusura**: lint, tipi, test, E2E; revisione `ecc:code-reviewer`; push, Deploy, backup di controllo, prova dal telefono.

## Validation
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm e2e
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Editor senza modo di sapere quali sedi gestisce | — | riga nel Profilo |
| Vecchi link/segnalibri a `/sedi` | Bassa | reindirizzamento per ruolo |
| Statistiche aperte più spesso: più righe lette su D1 | Bassa | costo per apertura invariato; limiti lontani |
