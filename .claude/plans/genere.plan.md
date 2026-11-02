# Plan: Genere del libro

**Source PRD**: .claude/prds/letture-voti-generi.prd.md
**Selected Milestone**: 3 — Genere
**Complexity**: Medium

## Summary
Ogni libro può avere **un** genere, scelto da un elenco fisso in italiano. Quando si aggiunge un libro
con l'ISBN, l'app suggerisce il genere traducendo la categoria di Google Books; chi aggiunge lo
conferma o lo cambia. Nella scheda il genere si vede e si cambia (admin ed editor delle sedi con una
copia). Il catalogo si filtra per genere e il CSV ha la colonna `genere`. I libri già presenti restano
senza genere finché qualcuno non lo imposta.

## Elenco dei generi (da approvare)
| Chiave | Etichetta | Categorie di Google Books che lo suggeriscono |
|---|---|---|
| NARRATIVA | Narrativa | Fiction, Literary Collections, Fiction / General |
| GIALLI | Gialli e thriller | Fiction / Mystery…, Fiction / Thrillers…, Fiction / Crime, True Crime |
| FANTASY | Fantasy e fantascienza | Fiction / Fantasy…, Fiction / Science Fiction… |
| ROMANZO | Romanzo | Fiction / Romance… |
| CLASSICI | Classici | Fiction / Classics |
| POESIA | Poesia e teatro | Poetry, Drama |
| RAGAZZI | Ragazzi | Juvenile Fiction, Juvenile Nonfiction, Young Adult Fiction, Young Adult Nonfiction |
| FUMETTI | Fumetti e graphic novel | Comics & Graphic Novels |
| BIOGRAFIA | Biografia | Biography & Autobiography |
| STORIA | Storia | History |
| FILOSOFIA | Filosofia | Philosophy |
| PSICOLOGIA | Psicologia ed educazione | Psychology, Education, Family & Relationships |
| RELIGIONE | Religione e spiritualità | Religion, Body, Mind & Spirit |
| SOCIETA | Politica e società | Political Science, Social Science, Law |
| ECONOMIA | Economia e lavoro | Business & Economics |
| LINGUE | Lingue e critica letteraria | Language Arts & Disciplines, Literary Criticism, Foreign Language Study |
| SCIENZA | Scienza e natura | Science, Nature, Mathematics, Medical, Technology & Engineering, Computers |
| ARTE | Arte, musica e spettacolo | Art, Music, Performing Arts, Photography, Architecture, Design |
| VIAGGI | Viaggi | Travel |
| CUCINA | Cucina | Cooking |
| TEMPO_LIBERO | Casa, salute e tempo libero | Health & Fitness, Self-Help, Gardening, Crafts & Hobbies, House & Home, Sports & Recreation, Games & Activities, Pets |
| ALTRO | Altro | (mai suggerito: solo scelta manuale) |

Regola del suggerimento: si guarda la prima categoria di Google Books; prima la sottocategoria
(«Fiction / Mystery & Detective» → Gialli), poi la parte prima di « / » («Fiction» → Narrativa).
Nessuna corrispondenza → nessun suggerimento. Open Library non si usa (etichette troppo disordinate,
prova del 31/10/2026).

## Decisioni di progetto
- **Colonna `book.genre` senza CHECK nel database**: la validazione è nello schema zod condiviso.
  Un CHECK su `book` costringerebbe a ricostruire la tabella (con la ricerca FTS e i suoi trigger) a
  ogni cambio dell'elenco. Migrazione scritta a mano: `ALTER TABLE book ADD COLUMN genre text`.
- **Il genere non è nei «dati del libro» modificati dall'admin** (`bookDataSchema`): ha la sua rotta
  `PUT /books/:id/genre`, così la modifica dei dati non lo azzera e gli editor possono cambiarlo senza
  poter toccare il resto. Alla creazione arriva come campo `genre` accanto a `book`.
- **Permesso** nuova azione `book.genre` con le sedi delle copie: admin sempre; editor se è editor di
  almeno una sede (non archiviata) in cui c'è una copia (come «modificare una copia»).
- **Suggerimento** calcolato nel Worker dalla risposta di Google Books (nuovo campo `suggestedGenre` del
  candidato). Le risposte già in cache non l'hanno: nessun suggerimento, si sceglie a mano.
- **Filtro**: menu a tendina «Genere» (22 voci sono troppe per i bottoncini delle sedi) con anche
  «Senza genere», per trovare i libri da completare. Parametro `genere` nell'URL, combinabile con sede
  e ricerca.
- **CSV**: colonna facoltativa `genere` con l'etichetta italiana (export e import; anche la chiave è
  accettata). I file vecchi senza colonna si importano come prima; un genere sconosciuto è un errore
  di riga.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Elenco fisso | `shared/location-colors.ts` | chiavi + etichette in `shared/`, usate da Worker e interfaccia |
| Mappatura dati esterni | `worker/isbn/lookup.ts:139` (`lookupGoogleBooks`) | zod sul JSON di Google, funzione pura testata in `tests/unit/isbn-lookup.test.ts` |
| Permessi | `shared/policy.ts` `copy.update` + `edits()` | azione con elenco di sedi |
| Scrittura + registro | `worker/catalog/mutations.ts:175` (`updateBook`) | `book.update` con `before`/`after` nel registro |
| Migrazione a mano | `migrations/0003_reading_rating.sql` | ADD COLUMN, snapshot generato da drizzle-kit e controllato con «No schema changes» |
| Filtri del catalogo | `worker/catalog/queries.ts:45-50`, `src/pages/catalog.tsx:29-99` | condizioni SQL in `conditions`; parametri URL in italiano (`sede`, `pagina`) |
| CSV | `shared/csv/format.ts:5` (`CSV_HEADER`), `shared/csv/plan.ts`, `tests/unit/csv.test.ts`, `tests/worker/csv.test.ts` | colonne per nome, colonna mancante = vuota |
| Form di aggiunta | `src/pages/add/book-form.tsx` | campi precompilati dal candidato |
| Test | `tests/unit/policy.test.ts`, `tests/worker/catalog.test.ts`, `tests/e2e/app.spec.ts` | come le tappe 1 e 2 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `shared/genres.ts` | CREATE | elenco, etichette, `suggestGenre(categories)`, `parseGenre(etichetta o chiave)` |
| `shared/schemas.ts` | UPDATE | `genreSchema`; `genre` facoltativo in `newBookSchema`; `bookGenreSchema` per la rotta |
| `shared/policy.ts` | UPDATE | azione `book.genre` |
| `worker/db/schema.ts`, `migrations/0005_book_genre.sql` | UPDATE / CREATE | colonna `genre` (a mano) |
| `worker/isbn/lookup.ts` | UPDATE | legge `categories`; `suggestedGenre` nel candidato |
| `worker/catalog/mutations.ts` | UPDATE | `createBook` salva il genere; `setBookGenre` con registro `book.update` |
| `worker/catalog/routes.ts` | UPDATE | `PUT /books/:id/genre`; parametro `genre` nella lista |
| `worker/catalog/queries.ts` | UPDATE | `genre` nella lista e nel dettaglio; filtro per genere e «senza genere» |
| `shared/csv/format.ts`, `shared/csv/plan.ts`, `worker/csv/service.ts` | UPDATE | colonna `genere` in export e import |
| `src/pages/add/book-form.tsx` | UPDATE | menu «Genere» precompilato con il suggerimento («suggerito da Google Books») |
| `src/pages/book/genre-field.tsx` | CREATE | genere nella scheda; menu per chi può cambiarlo |
| `src/pages/book.tsx`, `src/pages/catalog.tsx` | UPDATE | genere in scheda; filtro nel catalogo |
| test unit/integrazione/E2E | UPDATE / CREATE | vedi Tasks |
| `docs/permissions.md`, `docs/data-model.md`, `README.md` | UPDATE | regola, colonna, guida |

## Tasks
### Task 1: Elenco e suggerimento (RED → GREEN)
- **Action**: `tests/unit/genres.test.ts`: ogni riga della tabella sopra (con le categorie reali viste nella prova: `Fiction`, `Juvenile Fiction`), sottocategoria prima della categoria, maiuscole/spazi, nessuna corrispondenza → null, `parseGenre` di etichetta e chiave. Poi `shared/genres.ts`.
- **Validate**: `pnpm vitest run tests/unit/genres.test.ts`

### Task 2: Permessi e validazione (RED → GREEN)
- **Action**: `book.genre` per ruolo e sedi (editor della sede di una copia sì, di un'altra no, sede archiviata no, lettore no, admin sì); `genreSchema` accetta solo le chiavi e null.
- **Validate**: `pnpm vitest run tests/unit/policy.test.ts tests/unit/schemas.test.ts`

### Task 3: Colonna e migrazione
- **Action**: colonna in `schema.ts`; `pnpm db:generate`; sostituire l'SQL con `ADD COLUMN`; `pnpm db:generate` di nuovo deve dire «No schema changes».
- **Validate**: `pnpm db:migrate:local`

### Task 4: Ricerca ISBN (RED → GREEN)
- **Action**: test in `tests/unit/isbn-lookup.test.ts` con una risposta di Google che ha `categories` → `suggestedGenre`; senza categorie → null; Open Library → null.
- **Validate**: `pnpm vitest run tests/unit/isbn-lookup.test.ts`

### Task 5: API (RED → GREEN)
- **Action**: test d'integrazione: creazione con genere; `PUT /books/:id/genre` per ruolo e sede, 400 per genere sconosciuto, null lo toglie, registro solo se cambia; PATCH dei dati da admin non tocca il genere; lista e dettaglio con `genre`; filtro `genre=GIALLI` e `genre=NONE` combinato con sede e ricerca.
- **Validate**: `pnpm vitest run tests/worker/catalog.test.ts`

### Task 6: CSV (RED → GREEN)
- **Action**: export con colonna `genere` (etichetta); import con etichetta o chiave; colonna assente ok; valore sconosciuto → errore di riga in prova a secco.
- **Validate**: `pnpm vitest run tests/unit/csv.test.ts tests/worker/csv.test.ts`

### Task 7: Interfaccia
- **Action**: menu nel form di aggiunta (precompilato, con la nota «suggerito da Google Books»); genere nella scheda con menu e «Salva» per chi può; filtro «Genere» nel catalogo (tendina con «Tutti», i 22 generi, «Senza genere»).
- **Validate**: `pnpm typecheck && pnpm lint`; prova visiva a 390 px chiaro/scuro.

### Task 8: E2E e accessibilità
- **Action**: aggiunta a mano con genere → filtro del catalogo lo trova; editor cambia il genere di un libro della sua sede; lettore non vede il menu; axe su scheda e catalogo filtrato.
- **Validate**: `pnpm e2e`

### Task 9: Documenti, revisione ECC, rilascio
- **Action**: documenti; agente ECC code-reviewer; Deploy; backup manuale; prova online (anche con un ISBN vero per il suggerimento). ⏸

## Validation
```bash
pnpm lint && pnpm typecheck
pnpm test:coverage
pnpm e2e
pnpm build && pnpm exec wrangler deploy --dry-run
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| drizzle-kit ricostruisce `book` (con FTS e trigger) | Bassa (nessun CHECK) | SQL controllato e scritto a mano come ADD COLUMN |
| Google Books dà la categoria solo per metà dei libri italiani | Certa | è solo un suggerimento; il menu è sempre lì |
| Suggerimenti sbagliati (es. «Fiction» per un giallo) | Media | si vede prima di salvare; si cambia anche dopo dalla scheda |
| Filtro per genere lento | Bassa | colonna su `book` letta nella stessa query della pagina; misura CPU dopo il rilascio, indice solo se serve |
| Cache ISBN senza suggerimento per i libri già cercati | Certa | si sceglie a mano; nessuna migrazione della cache |

## Acceptance
- [ ] Elenco dei 22 generi approvato dall'admin (modifiche del 02/11/2026: Romanzo, Biografia, Saggistica divisa in 6)
- [ ] Suggerimento da Google Books, sempre confermabile; mai assegnato da solo
- [ ] Genere cambiabile da admin ed editor delle sedi con una copia; la modifica dei dati non lo azzera
- [ ] Filtro per genere e «Senza genere» combinabile con sede e ricerca
- [ ] CSV con colonna `genere`; file vecchi ancora importabili
- [ ] Test, E2E e axe verdi; revisione ECC senza problemi aperti di livello medio o superiore
