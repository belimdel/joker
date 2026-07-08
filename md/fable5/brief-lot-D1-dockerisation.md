# LOT D1 — Dockerisation pour auto-hébergement (mini PC Windows + Docker Desktop)

> Brief pour agent Claude VS Code. Projet Joker (monorepo `Joker/` : `shared/`, `server/`, `client/`).
> Objectif : produire une image Docker du jeu (Express + Socket.IO servant le client React buildé) + un reverse proxy Caddy pour le HTTPS automatique, déployable sur un mini PC Windows sous Docker Desktop, accessible depuis internet via un domaine DuckDNS.
> Contexte infra déjà en place chez l'utilisateur : mini PC Windows, Docker Desktop opérationnel (sert déjà un serveur RustDesk), box Bouygues avec port forwarding, compte DuckDNS.

## Rôle et interdictions
- Reconnaissance AVANT écriture : lire l'état réel du code avant de créer/modifier quoi que ce soit.
- Périmètre strict (voir §Fichiers). Tout écart = signalé en ROUGE dans le récap.
- Aucun self-commit, aucun push. Récap avec PREUVES réelles (sortie de `docker build`, `docker compose up`, test HTTP réel).
- TS strict, zéro `any`. Commentaires FR, identifiants EN. `npm.cmd` sur ce poste Windows.
- NE PAS toucher : `shared/` (aucun fichier), la logique de jeu, le schéma BDD, les fichiers de migration.
- Aucun secret en dur dans les fichiers Docker ou committés. Les secrets passent par un `.env` gitignoré lu par docker-compose.

## PHASE 0 — Reconnaissance (obligatoire, à restituer en tête de récap)

Répondre à ces questions par des PREUVES (extraits de code réels, pas des suppositions) :

1. **Service statique du client** : `server/src/index.ts` sert-il DÉJÀ un dossier statique (`express.static`) en production ? Chercher `express.static`, `sendFile`, toute gestion de `client/dist` ou `NODE_ENV === "production"`. Coller l'extrait trouvé, ou confirmer l'absence.
2. **Catch-all SPA** : existe-t-il une route qui renvoie `index.html` pour les chemins non-API (nécessaire au routing React côté client sur rechargement d'URL) ? Si non, à ajouter (voir §2).
3. **Port d'écoute** : sur quel port Express écoute-t-il, et lit-il `process.env.PORT` ? Coller la ligne `listen(...)`.
4. **Lancement serveur** : le serveur tourne en `tsx` (pas de build serveur d'après le handoff). Confirmer la commande de démarrage réelle dans `server/package.json` (`scripts.start` / `scripts.dev`).
5. **Build client** : confirmer la commande de build (`client/package.json` → `scripts.build`) et le dossier de sortie (`vite.config` → `build.outDir`, défaut `dist`).
6. **Config CORS / cookies** : relever comment le cookie de session est posé (`secure`, `sameSite`, domaine). En prod HTTPS derrière Caddy, `secure: true` doit être actif et `trust proxy` déjà en place (posé au lot H1) — confirmer les deux.
7. **Variables d'environnement attendues** par le serveur au boot (`DATABASE_URL`, `SMTP_USER`, `SMTP_PASS`, `PORT`, `NODE_ENV`, autres ?). Lister exhaustivement en lisant le code, pas de mémoire.

⛔ STOP après la Phase 0 si l'un de ces points est ambigu ou révèle un blocage (ex. serveur incapable de servir le statique sans refonte lourde) → remonter à l'orchestrateur avant d'écrire.

## PHASE 1 — Servir le client depuis Express en production

SEULEMENT si la reconnaissance montre que ce n'est pas déjà fait proprement.

- En production (`NODE_ENV === "production"`), Express doit :
  - servir les fichiers statiques du client buildé (chemin à résoudre selon la structure du conteneur, voir §Dockerfile) via `express.static`,
  - après les routes `/api` et le montage Socket.IO, ajouter un catch-all qui renvoie `index.html` pour toute requête GET non-API non-fichier (routing SPA).
- NE PAS activer ce comportement en dev (Vite s'en charge). Garde `NODE_ENV`.
- Le catch-all ne doit JAMAIS intercepter `/api/*` ni `/socket.io/*` (les monter AVANT).

## PHASE 2 — Dockerfile multi-étages

Créer `Dockerfile` à la racine du monorepo. Structure attendue (multi-stage pour une image finale légère) :

- **Étape `builder`** (image `node:20` ou LTS courante) :
  - copier `package.json` + lockfiles nécessaires (racine, `client/`, `server/`, `shared/` selon la structure réelle du monorepo — À VÉRIFIER en reconnaissance),
  - installer les deps,
  - builder le client (`vite build`) → produit `client/dist`,
  - (le serveur tourne en `tsx`, pas de compilation serveur — confirmer).
- **Étape finale** (image `node:20-slim` ou `-alpine` si compatible avec les deps natives comme argon2 — À VÉRIFIER, argon2 peut nécessiter des libs de build ; si souci alpine, rester sur `-slim`) :
  - copier depuis `builder` : le `client/dist`, le code `server/` et `shared/`, les `node_modules` de prod,
  - exposer le port applicatif,
  - `CMD` qui lance le serveur en prod (la commande réelle relevée en reconnaissance).
- Créer un `.dockerignore` à la racine : exclure `node_modules`, `.git`, `client/dist` local, `**/*.test.ts`, `.env`, `md/`, etc.

Contraintes :
- L'image ne doit contenir AUCUN secret. Les variables d'env sont injectées au run par docker-compose.
- Justifier le choix de l'image de base finale (slim vs alpine) selon la compatibilité argon2/pg vérifiée.

## PHASE 3 — docker-compose + Caddy (reverse proxy HTTPS)

Créer `docker-compose.yml` à la racine avec DEUX services :

1. **`joker`** (l'app) :
   - `build: .` (le Dockerfile ci-dessus),
   - `env_file: .env` (secrets : `DATABASE_URL`, `SMTP_USER`, `SMTP_PASS`, `NODE_ENV=production`, `PORT`),
   - `restart: unless-stopped`,
   - PAS de port exposé vers l'hôte directement (seul Caddy y accède, via le réseau interne compose). Exposer le port uniquement en interne.
2. **`caddy`** (reverse proxy TLS) :
   - image `caddy:latest`,
   - ports `80:80` et `443:443` (requis pour Let's Encrypt HTTP challenge + HTTPS),
   - volumes : `./Caddyfile:/etc/caddy/Caddyfile`, plus les volumes de persistance des certificats (`caddy_data:/data`, `caddy_config:/config`) — SINON Caddy re-demande un certificat à chaque redémarrage et se fait rate-limiter par Let's Encrypt,
   - `restart: unless-stopped`,
   - `depends_on: joker`.

Créer `Caddyfile` :
```
{$JOKER_DOMAIN} {
    reverse_proxy joker:{$PORT}
}
```
- Le domaine vient d'une variable (`JOKER_DOMAIN`, ex. `joker-xxx.duckdns.org`) pour ne rien hardcoder.
- Caddy reverse-proxifie vers le service `joker` sur son port interne. Caddy gère nativement le WebSocket upgrade (Socket.IO) — ne PAS ajouter de config spéciale, mais le VÉRIFIER au test.

⚠️ Rappel `network_mode: host` INTERDIT sous Docker Desktop Windows (piège connu de l'infra RustDesk de l'utilisateur). Utiliser le réseau bridge par défaut de compose + mapping de ports explicite sur Caddy uniquement.

## PHASE 4 — Fichiers de config & doc

- `.env.example` à la racine (ou à côté du compose) : lister toutes les clés SANS valeurs (`DATABASE_URL=`, `SMTP_USER=`, `SMTP_PASS=`, `JOKER_DOMAIN=`, `PORT=`, `NODE_ENV=production`). Committable.
- Le vrai `.env` : gitignoré (vérifier que la racine l'ignore ; le `.gitignore` couvre déjà `.env` mais confirmer pour la racine du monorepo).
- `DEPLOY.md` : doc d'installation pas-à-pas pour le mini PC, incluant :
  - prérequis (Docker Desktop déjà installé),
  - création du 2e domaine DuckDNS + les 2 règles NAT box (80 TCP, 443 TCP → IP locale du mini PC),
  - remplissage du `.env`,
  - `docker compose up -d --build`,
  - comment vérifier les logs (`docker compose logs -f joker`, `docker compose logs -f caddy`),
  - comment mettre à jour le jeu (git pull → `docker compose up -d --build`),
  - note : le PC reste allumé H24 (déjà le cas pour RustDesk), donc résilience déjà acquise.

## Contraintes de vérification (PREUVES exigées au récap)
1. `docker build` réel → sortie complète, image produite sans erreur. Donner la taille de l'image finale.
2. `docker compose up -d` en LOCAL sur le poste de dev (avec un `.env` de test pointant sur la branche Neon **dev**, JAMAIS la prod) → les 2 conteneurs `Up`.
3. Test HTTP réel en local : accès à l'app via le conteneur (au moins la page d'accueil qui charge + un appel `/api` qui répond). Pour le TLS/domaine, le test complet se fera sur le mini PC (Let's Encrypt exige le domaine public) — le préciser, ne pas prétendre l'avoir testé si non fait.
4. Confirmer que le client buildé est bien servi par Express (pas de 404 sur `/`, pas de 404 sur un rechargement de route SPA type `/lobby`).
5. `npx tsx shared/run-all-tests.ts` → toujours 13/13 (non-régression : on n'a pas cassé le partagé).

## Fichiers autorisés (création)
- `/Dockerfile`
- `/.dockerignore`
- `/docker-compose.yml`
- `/Caddyfile`
- `/.env.example` (racine)
- `/DEPLOY.md`
- `server/src/index.ts` — MODIFICATION autorisée UNIQUEMENT si la Phase 1 est nécessaire (service statique + catch-all SPA en prod). Diff minimal, borné à ce besoin.

## Récap attendu
1. Phase 0 : réponses aux 7 points avec extraits de code réels.
2. Ce qui a été créé/modifié, fichier par fichier.
3. Preuves : sorties `docker build`, `docker compose up`, tests HTTP, tests shared.
4. Décisions justifiées (image de base, service statique existant réutilisé ou ajouté, etc.).
5. Points de vigilance et ce qui reste à faire côté utilisateur (NAT box, domaine DuckDNS, remplissage `.env`, test final sur mini PC).

Commit proposé (par l'utilisateur après validation orchestrateur) :
`feat(deploy): dockerisation + reverse proxy caddy pour auto-hebergement`
