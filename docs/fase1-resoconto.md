# Fase 1 — Resoconto della prova di fattibilità (30/10/2026)

Prototipo in `spike/` pubblicato su `https://homelibrary-spike.r-z030600.workers.dev`, dietro Cloudflare Access (team `solitary-brook-795e.cloudflareaccess.com`), piano gratuito. Provato da Riccardo su iPhone (iOS 18.7, Safari e app installata): **funziona tutto**.

## Esiti

| Verifica | Esito | Dettagli |
|---|---|---|
| Access con codice via email, senza account Cloudflare | ✅ | Serve il metodo **One-time PIN** (Zero Trust → Integrations → Identity providers). L'attivazione rapida dalla pagina del Worker crea l'app con il solo metodo "Cloudflare" (account del pannello): va cambiato |
| Verifica del JWT di Access nell'app | ✅ | Firma, emittente, audience e scadenza; senza configurazione o con token falso l'API rifiuta (fail closed) |
| PWA installata sulla Home dietro Access | ✅ | Chiede email e codice una volta (cookie separati), poi funziona |
| Scanner con la fotocamera (iPhone) | ✅ | Stesso scanner della v1, zxing-wasm servito dall'app |
| Ricerca FTS5 senza accenti su D1 remoto | ✅ | "perche citta" → 66 risultati su 5.000 libri, identici in locale e online |
| Scrittura atomica libro + registro | ✅ | `batch()` di D1; ISBN duplicato → 409 |
| Registro in sola aggiunta | ✅ | I trigger rifiutano UPDATE/DELETE anche online |
| Copertine su R2 | ✅ | Ridimensionate sul telefono, formato controllato dai primi byte; un file non immagine è rifiutato |
| Dimensione del Worker | ✅ | 53 KB compressi (limite 3 MB) |
| Backup del database | ⚠️ → ✅ | `wrangler d1 export` completo **non funziona** con tabelle FTS5. Funziona l'export **dei soli dati, tabella per tabella** (`--no-schema --table …`): ripristino = migrazioni + dati, l'indice di ricerca si ricostruisce dai trigger. Provato su un database vuoto: 5.000/5.000 libri, stessa ricerca, stessi 66 risultati. In più c'è Time Travel di D1 |

## CPU per richiesta (limite gratuito: 10 ms)

Misurata con `wrangler tail` durante la prova da iPhone (29 richieste).

| Endpoint | CPU a caldo | CPU al primo avvio dell'istanza |
|---|---|---|
| `GET /api/search` (FTS5, 5.000 libri) | 1–2 ms | 4 ms |
| `GET /api/me` (solo verifica JWT) | 0–1 ms | 5–8 ms |
| `POST /api/books` (batch libro + registro) | 3 ms | 5 ms |
| `PUT /api/covers/:key` | 2 ms | — |
| `GET /api/covers/:key` | 1 ms | — |

A caldo il margine è ampio. **Il punto da curare è il primo avvio di un'istanza: fino a 8 ms**, dovuti soprattutto all'importazione della chiave di Access e all'inizializzazione dei moduli. In fase 2: misura per endpoint nei test, chiave importata una sola volta con WebCrypto (al posto di `jose`), caricamento pigro dei moduli non necessari. Obiettivo: ≤ 5 ms anche al primo avvio.

## Decisione proposta: **GO**
Tutti i rischi principali del piano sono superati. Cambi da riportare nel piano:
1. Backup (fase 6): export dei soli dati tabella per tabella + migrazioni, non l'export completo.
2. Access: metodo One-time PIN e policy per email; la sincronizzazione automatica (fase 4) deve gestire anche il metodo di login e la durata della sessione.
3. Fase 2: obiettivo esplicito di CPU al primo avvio ≤ 5 ms.

Le risorse della prova (Worker `homelibrary-spike`, D1 `homelibrary-spike`, bucket `homelibrary-spike-covers`, applicazione Access) restano online, protette, fino all'inizio della fase 2; poi si eliminano con il tuo OK.
