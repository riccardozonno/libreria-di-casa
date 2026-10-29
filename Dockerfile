# HOME LIBRARY — immagini multi-arch (arm64 per il Raspberry Pi, amd64).
# Target:
#   runner (predefinito) → app Next.js standalone, utente non root
#   tools               → migrazioni Prisma e script di amministrazione (pnpm admin:create)

ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dipendenze (con postinstall: prisma generate + copia del WASM dello scanner) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
COPY scripts/copy-wasm.mjs ./scripts/copy-wasm.mjs
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# --- Build Next.js ---
FROM deps AS build
COPY . .
RUN pnpm build

# --- Strumenti: migrazioni e CLI (stesso codice, tutte le dipendenze) ---
FROM deps AS tools
COPY . .
# Niente pnpm a runtime: la rete interna non ha accesso a internet (corepack non può scaricarlo).
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# --- Esecuzione ---
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /data/covers .next/cache && chown -R node:node /data .next/cache
USER node
EXPOSE 3000
CMD ["node", "server.js"]
