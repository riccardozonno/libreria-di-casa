# ADR-0014: Riscrittura per il piano gratuito di Cloudflare

**Data**: 2026-10-30
**Stato**: proposed
**Decisori**: Riccardo Zonno, Claude

## Contesto
La v1 (ADR-0001…0013) richiede un server proprio (Pi o Mac) e un dominio. L'utente vuole l'app online gratis, privata per le persone che sceglie, senza server da mantenere e senza comprare un dominio. Sul piano gratuito di Cloudflare i Workers hanno 10 ms di CPU per richiesta e 3 MB di codice: Next.js e argon2 non ci stanno. Cloudflare Access protegge anche gli indirizzi `workers.dev` ed è gratis fino a 50 utenti.

## Decisione
Riscriviamo l'app su un branch separato (`cloudflare`) con: interfaccia React + Vite statica, API Hono su Workers, D1 + Drizzle, R2 per le copertine, Cloudflare Access come unico sistema di accesso (email + codice, nessuna password), backup notturno da GitHub Actions su Backblaze B2. La v1 resta nel tag `v1-nextjs`.

## Alternative considerate
### Vercel + Neon (+ portiere Cloudflare)
- **Pro**: 0 €, modifiche medie a un'app già testata.
- **Contro**: tre fornitori, database che si sospende, login con password più il portiere.
- **Perché no**: l'utente preferisce un solo fornitore e nessuna password.

### Oracle Cloud Always Free + dominio + Cloudflare Tunnel
- **Pro**: nessuna modifica al codice.
- **Contro**: dominio a pagamento, server da mantenere, risorse gratuite ridotte nel 2026 e spesso esaurite.
- **Perché no**: costo e manutenzione.

### Next.js su Workers (OpenNext) con Workers Paid
- **Pro**: riuso maggiore.
- **Contro**: 5 $/mese, librerie native (argon2, sharp) da sostituire, supporto a Next 16.4 non verificato.
- **Perché no**: non è gratis.

## Conseguenze
### Positive
- 0 €, nessun dominio, nessun server, nessuna password da gestire.
- Gli estranei non vedono nemmeno la pagina di accesso.

### Negative
- Riscrittura di database, server, pagine, backup e test di integrazione.
- Il registro in sola aggiunta si basa su trigger, non su ruoli del database.
- La sicurezza dell'accesso dipende dalla casella email di ogni utente.

### Rischi
- Limite di 10 ms di CPU: verificato con misure nella fase 1 (go/no-go) e in ogni test; ripiego Workers Paid.
- Cambi alle condizioni di Cloudflare: backup portabile fuori da Cloudflare (B2).

Sostituisce, se approvato a fine fase 1: ADR-0001, 0002, 0003, 0009, 0010, 0011, 0012, 0013 (e in parte 0005 e 0008).
