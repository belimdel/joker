# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────
# Joker — image de production (Express + Socket.IO servant le client React).
# Monorepo sans package.json racine : chaque sous-projet (client/server) a
# ses propres deps. `shared/` n'a pas de deps ni de build : le serveur tourne
# en tsx et importe directement les .ts de shared/ à l'exécution.
# ─────────────────────────────────────────────────────────────────────────

# ── Étape builder : build du client + deps de prod du serveur ────────────
# Image node:20 « complète » (pas slim) : dispose des outils de build au cas
# où une dépendance native aurait besoin de compiler. @node-rs/argon2 fournit
# des binaires précompilés (glibc/linux-x64), donc en pratique rien à compiler.
FROM node:20 AS builder
WORKDIR /app

# 1) Deps du client (couche cache séparée : ne se réinvalide que si le
#    lockfile change).
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci

# 2) Build du client. Vite a besoin du code client ET de shared/ (alias
#    @shared → ../shared, cf. vite.config.ts) → on copie les deux avant build.
COPY client ./client
COPY shared ./shared
RUN cd client && npm run build   # produit client/dist

# 3) Deps de PROD du serveur (tsx + express + socket.io + pg + argon2… sont
#    tous en "dependencies" ; les devDependencies — types, drizzle-kit, tsc —
#    ne servent pas au runtime tsx).
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# ── Étape finale : image légère de runtime ───────────────────────────────
# node:20-slim (Debian glibc) : compatible avec les binaires précompilés
# d'@node-rs/argon2 (mêmes glibc/ABI que l'étape builder). On évite -alpine
# (musl) qui exposerait à des incompatibilités de binaires natifs.
FROM node:20-slim AS runtime
ENV NODE_ENV=production
# Le serveur résout le client via process.cwd()/../client/dist → le process
# DOIT démarrer depuis /app/server pour que ../client/dist = /app/client/dist.
WORKDIR /app/server

# Code + assets. Ordre : sources d'abord, puis node_modules de prod (issus du
# builder) pour ne pas être écrasés. shared/ en SOURCE (.ts) car tsx transpile
# à la volée ; client/dist BUILDÉ (assets statiques servis par Express).
COPY server ./
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/client/dist /app/client/dist

# Port applicatif interne (surchargeable via PORT au run). Non publié vers
# l'hôte : seul Caddy y accède via le réseau interne compose.
EXPOSE 3001

# `npm start` déclenche `prestart` (chmod +x du binaire tsx) puis lance
# `tsx src/index.ts` — la commande de démarrage réelle du serveur.
CMD ["npm", "start"]
