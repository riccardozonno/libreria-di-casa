# Plan: Correzioni dalla review Vite

**Source**: review `/ecc:vite-patterns` del 04/11/2026; ordine scelto dall'admin: 1+2, poi 4, 5, 6, 7, infine 3
**Complexity**: Medium

## Summary
Dopo un Deploy l'app aperta non deve rompersi cercando file JS che non esistono più (1); il codice va diviso
così che la prima apertura scarichi meno e React resti in cache tra un Deploy e l'altro (2). Poi piccole
correzioni a build, icona, `.gitignore` e versioni (4–7) e infine tre `tsconfig` separati, uno per ambiente (3).
Nessuna modifica ad API, database o backup.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Rotte | `src/app.tsx:27-46` | `createBrowserRouter` con `element`; `AdminOnly` per le pagine admin |
| Caricamento | `src/pages/catalog.tsx` | testo «Caricamento…» centrato, `text-ink-soft` |
| Import dinamico | `src/components/barcode-scanner.tsx:19` | `await import("barcode-detector/ponyfill")` |
| Plugin Vite | `vite.config.ts:11-20` | plugin inline con `transformIndexHtml` |
| E2E | `tests/e2e/app.spec.ts` | percorso dall'interfaccia, CSP controllata |

## Tasks
### Task 1 — File vecchi dopo un Deploy (punto 1)
- `src/main.tsx`: su `vite:preloadError` ricarica la pagina **una sola volta** (segno in `sessionStorage`, con try/catch), così un errore vero non crea un ciclo di ricariche.
- **Validate**: E2E che simula l'evento e controlla una sola ricarica.

### Task 2 — Codice diviso (punto 2)
- `src/app.tsx`: le rotte Admin, Utenti, Registro, CSV e Statistiche caricate a richiesta; Catalogo, scheda libro, Aggiungi, Sedi e Profilo restano nel file principale (sono le pagine di tutti i giorni).
- `vite.config.ts`: un gruppo `react` (react, react-dom, react-router, scheduler) in un file separato, con hash stabile finché le librerie non cambiano.
- **Validate**: `pnpm build` senza l'avviso «chunk > 500 kB»; file principale molto più piccolo; E2E verdi (pagine a richiesta funzionanti, CSP pulita).

### Task 3 — Plugin dell'icona (punto 4)
- `inlineAppleTouchIcon`: se la riga non c'è, `this.error(...)` e la build si ferma.
- **Validate**: test unitario del plugin (riga presente → sostituita; assente → errore).

### Task 4 — Icona più leggera (punto 5)
- Ricomprimere `public/icons/apple-touch-icon.png` (180×180) **senza perdita** con uno script Python nella cartella temporanea (palette se i colori sono ≤ 256, altrimenti zlib al massimo): nessuna nuova dipendenza. Se il guadagno è scarso, lo dico e lascio com'è.
- **Validate**: dimensione prima/dopo; confronto pixel per pixel identico; E2E dell'icona incorporata.

### Task 5 — `.gitignore` (punto 6)
- Togliere le voci della v1 (`.next/`, `out/`, `next-env.d.ts`, `/src/generated/`, `/build`, `.pnp.*`, `.pnpm-debug.log*`); il tag `v1-nextjs` resta com'è.
- **Validate**: `git status` pulito dopo build, test ed E2E.

### Task 6 — Versione di TypeScript (punto 7)
- `package.json`: `"typescript": "^5.9.3"` (la versione installata); lockfile invariato.
- **Validate**: `pnpm install --frozen-lockfile`.

### Task 7 — Un `tsconfig` per ambiente (punto 3)
- `tsconfig.base.json` con le opzioni comuni; `src/tsconfig.json` (DOM, senza tipi Workers), `worker/tsconfig.json` (tipi Workers, senza DOM), `tests/tsconfig.json` (Node, Vitest/Workers, DOM per Playwright); `tsconfig.json` alla radice per `*.config.ts` e `scripts/`. `shared/` controllato sia con `src` sia con `worker`.
- `pnpm typecheck` controlla tutti i progetti; gli editor usano il `tsconfig` più vicino.
- **Validate**: `pnpm typecheck`; prova: `window` in `worker/` deve dare errore (poi tolto).

## Validation
```bash
pnpm typecheck && pnpm lint
pnpm test:coverage
pnpm build   # nessun avviso di dimensione
pnpm e2e
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Ricariche in ciclo se un file manca davvero | Bassa | una sola ricarica per sessione, poi l'errore normale |
| Pagina a richiesta che non si carica senza rete | Media | il service worker mette in cache i file `/assets/` già visti; senza rete resta la pagina offline come oggi |
| Nuovi `tsconfig` rivelano errori nascosti | Media | è lo scopo: li correggo uno per uno |
| Icona: perdita di qualità | Bassa | solo compressione senza perdita, confronto pixel per pixel |

## Acceptance
- [ ] Dopo un Deploy l'app aperta si riprende da sola
- [ ] Build senza avviso di dimensione, React in un file separato
- [ ] Punti 4–7 fatti
- [ ] `tsconfig` separati, `pnpm typecheck` verde
- [ ] Test unitari ed E2E verdi
