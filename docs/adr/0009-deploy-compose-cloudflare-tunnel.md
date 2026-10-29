# ADR-0009: Docker Compose sul Pi, accesso solo da Cloudflare Tunnel, IP reale da CF-Connecting-IP

**Date**: 2026-10-29
**Status**: accepted
**Deciders**: Riccardo Zonno, Claude

## Context
Hosting gratuito a casa su Raspberry Pi 5, niente porte aperte sul router, nessuna porta dell'app sull'host, Postgres raggiungibile solo dalla rete interna.

## Decision
- Compose con servizi `app`, `db`, `cloudflared`, `backup` e `migrate` (one-shot). Reti: `backend` (`internal: true`: db, app, migrate, backup), `edge` (cloudflared, app; con uscita internet), `egress` (backup → B2). **Nessun `ports:`** in produzione.
- Tunnel gestito dal pannello Cloudflare; il token `TUNNEL_TOKEN` sta in `.env`. Hostname pubblico `libri.riccardozonno.it` → `http://app:3000`.
- IP del client letto da `CF-Connecting-IP` (impostato da Cloudflare sull'edge, sovrascrivendo eventuali valori del client). È affidabile perché `app` non è raggiungibile da nessun'altra via: unico ingresso cloudflared. Configurato con `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`. In produzione una richiesta senza l'header viene rifiutata (non può arrivare da cloudflared); solo in sviluppo si usa un valore fisso. cloudflared inoltra l'`Host` originale; in più `serverActions.allowedOrigins` e `trustedOrigins` contengono solo il dominio pubblico.
- Immagini multi-arch (amd64/arm64), utente non root, filesystem in sola lettura dove possibile, healthcheck, `restart: unless-stopped`, log `json-file` con rotazione (10 MB × 3).

## Alternatives Considered
### Port forwarding + Caddy/Let's Encrypt
- **Pro**: nessuna dipendenza da Cloudflare.
- **Contro**: porta aperta, IP di casa esposto, IP dinamico.
- **Perché no**: vietato dal brief.
### Tailscale/WireGuard
- **Pro**: nulla di pubblico.
- **Contro**: ogni familiare deve installare un client VPN.
- **Perché no**: scomodo per gli utenti finali.

## Consequences
### Positive
- Superficie d'attacco minima; HTTPS e protezione DDoS di Cloudflare.
### Negative
- Dipendenza da Cloudflare (piano gratuito); se cade, l'app non è raggiungibile da fuori.
### Risks
- Un servizio futuro collegato a `edge` potrebbe falsificare l'header: regola documentata, sulla rete `edge` stanno solo cloudflared e app.
