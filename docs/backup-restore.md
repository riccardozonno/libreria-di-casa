# Backup e ripristino (v2, Cloudflare)

Decisione: [ADR-0014](adr/0014-riscrittura-cloudflare.md), fase 6 del [piano](PLAN.md). Script in `scripts/backup/`, automazione in `.github/workflows/backup.yml`.

## Cosa viene salvato
Ogni notte (GitHub Actions, 02:30 in inverno / 03:30 in estate, ora italiana) uno snapshot **restic cifrato** su **Backblaze B2** (bucket privato, chiave limitata a quel bucket) con:

| Contenuto | Origine |
|---|---|
| `data/01-user.sql` … `data/10-isbn_cache.sql` (fino al 02/11/2026 erano 9: i backup vecchi si ripristinano lo stesso, i file si leggono in ordine di nome) | dati D1, **una tabella alla volta nell'ordine delle dipendenze** (l'export completo rifiuta FTS5; wrangler scriverebbe le tabelle in ordine alfabetico e online D1 importa a pezzi) |
| `covers/` | copertine da R2 (rclone, token R2 in sola lettura) |
| `migrations/` | lo schema con cui sono stati salvati i dati |
| `manifest.json` | data, commit, righe per tabella, numero di copertine (per verificare il ripristino) |

Conservazione **7 giornalieri / 4 settimanali / 6 mensili**; ogni notte `restic check`, la domenica anche la lettura del 5% dei dati. L'indice di ricerca non si salva: lo ricostruiscono i trigger mentre si reinseriscono i libri.

## Controllo settimanale (l'avviso automatico)
Ogni lunedì il job `controllo` legge dalle statistiche di Cloudflare gli esiti delle richieste degli ultimi 7 giorni e i dati di D1. **Fallisce, e GitHub manda un'email**, se trova: richieste rifiutate per limite di CPU o finite in errore, un database oltre 1 GB, più di metà del limite gratuito giornaliero di righe lette (2,5 milioni) o scritte (50 mila).

## Segreti (GitHub → Settings → Secrets and variables → Actions)
| Segreto | Cosa |
|---|---|
| `RESTIC_PASSWORD` | password dei backup — **anche nel password manager: senza, i backup sono illeggibili** |
| `B2_BUCKET`, `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY` | bucket e chiave Backblaze (solo quel bucket, lettura e scrittura) |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | account e token "HOME LIBRARY – backup GitHub" (D1 Edit, Account Analytics Read) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | token R2 "HOME LIBRARY – backup copertine" (Object Read only, solo `homelibrary-covers`) |

## Comandi
```bash
# backup o controllo a mano (anche da GitHub → Actions → Backup → Run workflow)
gh workflow run backup.yml -f job=backup
gh workflow run backup.yml -f job=controllo

# ripristino da B2 (sul Mac, con OrbStack): chiede bucket, chiavi e password senza mostrarli
scripts/backup/restore-from-b2.sh <database D1 vuoto> <bucket R2 vuoto> [snapshot]

# seconda copia dei backup sul Mac (meglio un disco esterno), solo quando la lanci
scripts/backup/copy-to-mac.sh "/Volumes/Disco esterno/home-library-backup"
```

`restore.mjs`: 1) estrae lo snapshot; 2) **rifiuta un database che contiene già dei libri**; 3) chiede di scrivere `RIPRISTINA`; 4) applica le migrazioni del backup e carica le tabelle in ordine; 5) ricarica le copertine; 6) verifica righe, indice di ricerca e ogni copertina byte per byte. I dati estratti (in chiaro) si cancellano anche se qualcosa va storto.

**Disastro (database o copertine persi):** crea un database e un bucket nuovi (`pnpm exec wrangler d1 create …`, `pnpm exec wrangler r2 bucket create …`), lancia il ripristino su quelli, poi metti i nuovi nomi/id in `wrangler.jsonc` e ripubblica (`pnpm build && pnpm exec wrangler deploy`). D1 ha anche Time Travel per tornare a un momento degli ultimi giorni senza backup.

## Prova di ripristino reale — 31/10/2026
Snapshot su B2 del 31/10/2026 13:02 (backup notturno lanciato a mano), ripristinato da Riccardo sul Mac in un database e un bucket **nuovi e separati** (`homelibrary-restore-test`, `homelibrary-restore-test-covers`); produzione mai toccata. Confronto indipendente fatto dopo:

| Verifica | Produzione | Ripristino | Esito |
|---|---|---|---|
| utenti / sedi / libri / copie / registro | 3 / 3 / 5 / 7 / 32 | 3 / 3 / 5 / 7 / 32 | ✅ |
| impronta dei contenuti (libri, copie, utenti, registro) | `0df95e543a84b398` | `0df95e543a84b398` | ✅ |
| indice di ricerca (voci e risultato di una ricerca) | 5, stesso risultato | 5, stesso risultato | ✅ |
| copertine (sha256, 10.215 e 10.779 byte) | `cf9cadbc…`, `95e020c2…` | `cf9cadbc…`, `95e020c2…` | ✅ |
| destinazione non vuota | — | ripristino rifiutato | ✅ (prova locale) |

**Problema trovato dalla prova e corretto:** il primo tentativo online è fallito con `FOREIGN KEY constraint failed`: l'export metteva le tabelle in ordine alfabetico e D1 online importa a pezzi (le letture arrivavano prima degli utenti). In locale non si vedeva perché l'import è una sola transazione. Ora export e import vanno una tabella alla volta, in ordine; il database di prova era rimasto vuoto (D1 annulla l'import fallito). Il tentativo fallito aveva lasciato i dati estratti in chiaro in una cartella del progetto (esclusa da git): cancellati, e ora la cartella di lavoro si cancella sempre.
