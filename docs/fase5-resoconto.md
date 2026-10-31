# Fase 5 — Revisione: resoconto (31/10/2026)

## Corretto
| Area | Problema | Correzione | Prova |
|---|---|---|---|
| Database / CPU | Il catalogo ordinato per titolo leggeva **tutti** i libri (e calcolava sedi e copie per ognuno) prima di tenerne 24 | Indice `title COLLATE NOCASE, seq`; indice copie `book_id, location_id` per il filtro per sede (migrazione 0002) | Test sui piani di esecuzione |
| Sicurezza / CPU | Nessun limite alla dimensione delle richieste: un JSON enorme da solo superava i 10 ms | JSON ≤ 256 KB, foto ≤ 3 MB, altri formati 415, prima di leggere il corpo | 3 test |
| Sicurezza | La copertina dell'admin veniva salvata su R2 prima del controllo dei permessi (poi cancellata) | Permesso verificato prima di leggere qualunque byte | 1 test |
| React | Errore di disegno di una pagina: schermata di React Router in inglese | Schermata in italiano con "Ricarica" | — |
| Accessibilità | Mancava un controllo automatico | Scansione axe (WCAG 2.2 AA) di tutte le pagine principali, scheda libro e modulo di aggiunta, chiaro e scuro, iPhone e Android: nessuna violazione seria | 40 E2E |

## Verificato, senza problemi
- Dipendenze in produzione: nessuna vulnerabilità nota (`pnpm audit --prod`).
- Permessi: ogni scrittura passa dalla policy condivisa; scritture da altre origini rifiutate; identità di sviluppo ignorata in produzione (test).
- Nessuno stile inline (CSP `style-src 'self'`), nessun `console.log`, file sotto le 260 righe.
- CPU con l'app completa: vedi [fase 2](fase2-resoconto.md#ricontrollo-in-fase-5-31102026-app-completa-30-richieste-da-iphone).

## Rischi medi e bassi: risolti su richiesta (31/10/2026)
| Rischio | Soluzione | Prova |
|---|---|---|
| Primo avvio di un'istanza 11–17 ms | Worker **minificato** (459 → 223 KB, 13.672 → 124 righe): meno codice da leggere all'avvio. Resta il controllo settimanale della fase 6 (decisione del 31/10/2026) | 253 test + 65 E2E; nuova misura dall'iPhone |
| Vulnerabilità "moderate" negli strumenti di sviluppo (esbuild dentro drizzle-kit, minimatch dentro ESLint) | `overrides` di pnpm alle versioni corrette | `pnpm audit`: nessuna vulnerabilità; lint e drizzle-kit funzionano |
| Nessun limite di frequenza | Limiti per persona con il Rate Limiting di Cloudflare: scritture 60/min, ricerche ISBN 30/min, import CSV 600 blocchi/min; oltre: 429 in italiano; l'import CSV aspetta e riprova lo stesso blocco | 1 test |
| Export CSV registrato anche se interrotto | La riga di registro si scrive all'ultima pagina (export completato) | 1 test |
| Registro attività senza pulizia | **Misurato**: 29 righe, 131 byte medi di dati (massimo 602, istantanea di un libro eliminato), database intero 197 KB. Stima larga: ~10 MB l'anno contro 5 GB gratuiti. Nessuna pulizia, che romperebbe la garanzia "in sola aggiunta"; il controllo settimanale della fase 6 avvisa se il database supera 1 GB | Misura sul database online |

## Rimasto
Nessun rischio medio o basso aperto. Da fare in fase 6: controllo settimanale (richieste rifiutate per CPU, dimensione del database).
