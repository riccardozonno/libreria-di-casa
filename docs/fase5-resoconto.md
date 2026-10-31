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

## Rimasto (basso, consapevole)
- **Primo avvio di un'istanza 11–17 ms** (accettato da Cloudflare): controllo settimanale in fase 6, decisione del 31/10/2026.
- **Dipendenze di sviluppo**: due vulnerabilità "moderate" solo negli strumenti sul Mac (esbuild dentro drizzle-kit, minimatch dentro ESLint), mai pubblicate.
- **Nessun limite di frequenza** sulle richieste: davanti c'è Access e gli utenti sono pochi e conosciuti; la ricerca ISBN usa la quota Google.
- **Registro attività** senza pulizia automatica: pochi KB al giorno, D1 ha 5 GB.
- **Export CSV**: la riga di registro si scrive alla prima pagina, anche se poi il download non va a buon fine.
