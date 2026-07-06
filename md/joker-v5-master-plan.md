# 🃏 Projet Joker — V5 MASTER PLAN : Comptes, Lobby, Stats, Niveaux, Classement

> **Document maître pour les agents Claude (VS Code).**
> Ce fichier est la source de vérité de la V5. L'utilisateur colle à chaque agent le **brief du lot concerné** (section 8) précédé des sections 1 à 7 (contexte commun). Un agent ne travaille QUE sur son lot, dans les fichiers autorisés de son lot, et rend un récap au format demandé. **Aucun agent ne commit lui-même** : il rend son récap, l'orchestrateur valide, l'utilisateur commit.

---

## 1. VISION V5

Le jeu (Joker géorgien, 4 joueurs, temps réel Socket.IO) est **en ligne et fonctionnel** : https://joker-kikq.onrender.com. La V5 le transforme de "jeu jouable" en **produit** :

1. **Comptes utilisateurs** (email + mot de passe, sessions serveur, cookie httpOnly)
2. **Lobby global** : liste temps réel des parties **publiques** joignables ; parties **privées** rejoignables uniquement par **code**
3. **Persistance des résultats** de partie en base de données
4. **Profil & statistiques** par joueur
5. **XP et niveaux** (cosmétique, affiché à côté du pseudo)
6. **Classement saisonnier** (saison = mois calendaire)
7. Le **mode invité reste possible** (jouer sans compte, sans stats ni classement)

**Hors scope V5** (ne pas implémenter, même si "facile") : mode spectateur, reset de mot de passe par email, OAuth (Google/Apple), packaging stores (Capacitor), avatars, amis, chat.

---

## 2. ÉTAT ACTUEL (résumé pour agents)

### Stack
- **Serveur** : Node + TS + Express 5 + Socket.IO, lancé via `tsx` (pas de build serveur). Port via `process.env.PORT`. Sert le `dist/` client (même origine).
- **Front** : React 19 + TS + Vite (SPA).
- **Logique partagée** : `shared/` en TS pur (fonctions pures, immutables, zéro effet de bord).

### Structure
```
Joker/
├── shared/          → cards.ts, trick.ts, deal.ts, bidding.ts, scoring.ts,
│                      round.ts, game.ts, bot.ts, views.ts, events.ts
├── server/src/      → index.ts (Express + Socket.IO + timer autoritatif),
│                      GameManager.ts (parties en mémoire, reconnexion sessionId + grace period)
└── client/src/      → socket.ts, GameContext.tsx, App.tsx,
                       screens/ (Home, Lobby, Board), components/ (PlayingCard, JokerModal,
                       PlayerSeat, TrumpOverlay, BidOverlay, ScoreModal, BidStatus,
                       TurnTimer, TrumpChoiceOverlay)
```

### Commandes
```powershell
cd server && npm.cmd run dev    # port 3001
cd client && npm.cmd run dev    # port 5173
npx tsx shared/run-all-tests.ts # harnais logique — DOIT rester 100% vert
```
(`npm.cmd` obligatoire sur ce poste Windows.)

### Ce qui existe déjà (ne pas refaire)
- Logique de jeu complète et testée : enchères, xisht (−200), prime de set, jokers haut/bas, choix d'atout sur les manches à 9 cartes (Set1/Set3), sans-atout.
- Serveur autoritatif, timer 15s, auto-play bot au timeout, mode solo (1 humain + 3 bots).
- Reconnexion silencieuse : `sessionId` en `localStorage`, grace period 15s serveur. ⚠️ **Ne pas confondre** ce `sessionId` de *partie* avec les sessions d'*authentification* V5 — les deux coexistent, ne pas fusionner ni renommer.
- `PlayerView` filtrée anti-triche (`buildPlayerView`), champ index local = **`you`**.

### Ce qui n'existe PAS (c'est la V5)
- **Aucune base de données** — tout est en mémoire (`Map` dans `GameManager`), perdu au redémarrage.
- Aucune auth, aucun compte, aucune API REST (Express ne sert que le statique + Socket.IO).
- Pas de liste de parties publiques, pas de distinction publique/privée.
- Rien côté stats/XP/niveaux/classement.

---

## 3. PRINCIPES NON NÉGOCIABLES (V5 inclus)

Repris des versions précédentes :
1. **Le serveur fait autorité.** Le client envoie des intentions, le serveur valide tout. `isLegalPlay`/`allowedBids` côté client = UX uniquement.
2. **Anti-triche par construction** : `PlayerView` ne contient JAMAIS les mains adverses. Tout ajout à la vue doit être public (exception encadrée : `trumpChoiceHand`).
3. **`shared/` = fonctions pures, immutables.** Effets de bord (timers, BDD, sockets) côté serveur uniquement. ⚠️ **`shared/` ne doit JAMAIS importer Drizzle, `pg`, ni quoi que ce soit de serveur** — il est bundlé côté client.
4. TypeScript strict, zéro `any`. `import type` partout où applicable (verbatimModuleSyntax).
5. Commentaires en français, identifiants en anglais.
6. Toute modif de `events.ts` / `views.ts` / `PlayerView` = **un seul agent à la fois** (contrat réseau).

Nouveaux, spécifiques V5 :
7. **Aucun secret dans le code ni dans Git.** `DATABASE_URL` et autres secrets vivent dans `.env` (local) et dans le dashboard Render (prod). `.env` DOIT être dans `.gitignore`. Fournir un `.env.example` sans valeurs réelles.
8. **Jamais de mot de passe en clair** : ni stocké, ni loggé, ni renvoyé dans une réponse. Hash **argon2id** uniquement.
9. **Jamais de `password_hash` ni de token de session dans un objet renvoyé au client.** Créer des mappers explicites (`toPublicUser`) plutôt que de renvoyer des lignes BDD brutes.
10. **L'identité vient du serveur, jamais du client.** Pour toute écriture stats/XP/classement : `userId` résolu depuis la session (cookie), jamais depuis un payload client.
11. **La BDD ne doit jamais faire planter une partie en cours.** Toute écriture BDD dans le flux de jeu est enveloppée (`try/catch` + log) : si Neon est down, la partie se termine quand même, on perd juste l'enregistrement.
12. **Validation d'entrée systématique** sur les routes REST avec `zod` (email, username, password). Ne jamais faire confiance au body.

---

## 4. DÉCISIONS ARCHITECTURALES (figées, ne pas rediscuter)

| Sujet | Décision | Justification courte |
|---|---|---|
| BDD | **Postgres sur Neon** (gratuit, externe à Render) | Render free = disque éphémère ; Neon = simple connection string, pas de SDK propriétaire |
| Accès BDD | **Drizzle ORM** + driver `pg` (Pool) | TS-first, migrations SQL lisibles, léger |
| Auth | **Email + mot de passe**, hash **argon2id** | Choix utilisateur ; standard actuel |
| Sessions | **Sessions opaques en BDD** (token aléatoire 32 bytes, hash SHA-256 stocké), **cookie httpOnly** `jk_session`, `SameSite=Lax`, `Secure` en prod, durée 30 jours | Révocable, simple, un seul serveur → JWT inutile |
| Auth Socket.IO | Middleware `io.use()` qui lit le cookie du handshake (même origine → cookie envoyé automatiquement), résout la session, attache `socket.data.userId: string \| null` | Identité serveur infalsifiable |
| API | REST sous `/api/*` sur le MÊME Express (même origine, pas de CORS à gérer) | Simplicité |
| Invités | Autorisés à jouer. `socket.data.userId === null` → aucune écriture stats/XP/classement pour ce siège | Zéro friction conservée |
| Ranked | Une partie est `ranked` **ssi les 4 sièges sont occupés par des humains au démarrage effectif de la partie** (flag figé à cet instant). Mode solo/bots → `ranked = false` | Anti-farming du classement |
| Classement | **Saisonnier, saison = mois calendaire (UTC)**. Points par position finale : 1er **+30**, 2e **+15**, 3e **+5**, 4e **0**. Égalité de score final = même position (ex æquo), points de la position partagée arrondis au supérieur | Simple, lisible, évolutif vers ELO en V6+ |
| XP | Voir formule §6. Fonctions pures dans `shared/progression.ts`, testées | Cosmétique V5 |
| Reset password | **Hors scope V5** (nécessite un service email). Le front l'assume : pas de lien "mot de passe oublié" | V6 avec Resend |
| Cold start Render | Hors code : ping keep-alive externe (cron-job.org). Ne rien coder pour ça | — |

---

## 5. SCHÉMA BDD (Drizzle / Postgres)

Tables et colonnes (les types exacts Drizzle sont à la charge de l'agent, ceci est le contrat) :

```
users
  id            uuid PK default gen_random_uuid()
  email         text UNIQUE NOT NULL          -- stocké lowercase
  username      text UNIQUE NOT NULL          -- 3-20 chars, [a-zA-Z0-9_], unicité case-insensitive (index sur lower(username))
  password_hash text NOT NULL                 -- argon2id
  xp            integer NOT NULL default 0
  created_at    timestamptz NOT NULL default now()

sessions
  id            uuid PK default gen_random_uuid()
  user_id       uuid NOT NULL FK → users.id ON DELETE CASCADE
  token_hash    text UNIQUE NOT NULL          -- SHA-256 hex du token brut (le token brut n'est JAMAIS stocké)
  created_at    timestamptz NOT NULL default now()
  expires_at    timestamptz NOT NULL
  (index sur token_hash, index sur user_id)

games
  id            uuid PK default gen_random_uuid()
  room_code     text NOT NULL                 -- code de la partie côté GameManager
  visibility    text NOT NULL                 -- 'public' | 'private'
  ranked        boolean NOT NULL
  started_at    timestamptz NOT NULL
  finished_at   timestamptz NOT NULL

game_players
  game_id           uuid FK → games.id ON DELETE CASCADE
  seat              integer NOT NULL          -- 0..3
  user_id           uuid NULL FK → users.id   -- NULL = invité ou bot
  username_snapshot text NOT NULL             -- pseudo au moment de la partie
  final_score       integer NOT NULL          -- score brut (pas /100)
  final_position    integer NOT NULL          -- 1..4 (ex æquo possible)
  contracts_made    integer NOT NULL          -- donnes où tricksWon === bid
  contracts_total   integer NOT NULL          -- donnes jouées
  xishts            integer NOT NULL          -- donnes où bid≥1 && tricksWon===0
  ranking_points    integer NOT NULL default 0 -- 0 si partie non ranked ou user_id NULL
  xp_awarded        integer NOT NULL default 0
  PK (game_id, seat)
  (index sur user_id)
```

- **Le niveau n'est PAS stocké** : il est dérivé de `xp` par la fonction pure `levelForXp` (voir §6). Une seule source de vérité.
- **Le classement n'est pas une table** : c'est une requête d'agrégation sur `game_players` joint `games`, filtrée sur `finished_at` dans le mois courant et `ranked = true`, groupée par `user_id`, ordonnée par `SUM(ranking_points) DESC`. Volume faible → pas de matérialisation en V5.

---

## 6. RÈGLES MÉTIER V5 (contrats à implémenter tels quels)

### XP (par partie terminée, seulement si `ranked = true` et joueur authentifié)
```
xpForGame(position, contractsMade, xishts) =
  50                          // participation, partie terminée
+ (position === 1 ? 100 : 0)  // victoire (chaque ex æquo 1er touche le bonus)
+ contractsMade * 10          // régularité
```
Pas de XP négatif. Parties non ranked (bots présents au départ) et invités : 0 XP.

### Niveaux (fonction pure, `shared/progression.ts`)
```
xpRequiredForLevel(n) = 100 * n * (n - 1) / 2   // cumul pour ATTEINDRE le niveau n ; niveau 1 = 0 XP
levelForXp(xp)        = plus grand n tel que xpRequiredForLevel(n) <= xp
xpProgress(xp)        = { level, currentLevelXp, nextLevelXp }  // pour la barre de progression
```
Exemples attendus (à mettre en test) : 0 XP → niv 1 ; 100 XP → niv 2 ; 300 XP → niv 3 ; 600 XP → niv 4.

### Points de classement (par partie `ranked` terminée)
```
position 1 → 30 ; 2 → 15 ; 3 → 5 ; 4 → 0
```
Positions calculées sur le score final (décroissant). En cas d'égalité de score : même position, points de cette position pour chacun, la position suivante saute (1,1,3,4).

### Statistiques de profil (calculées par requête, pas stockées en compteurs)
- Parties jouées (ranked), victoires, % victoires
- Contrats réussis / tentés, % réussite
- Xishts subis (total)
- Meilleur score final, position moyenne
- Niveau + XP + progression vers le niveau suivant

### Parties publiques / privées
- À la création, le créateur choisit `visibility: 'public' | 'private'`.
- **Publique** : apparaît dans la liste du lobby global tant qu'elle est joignable (pas commencée, < 4 joueurs). Rejoignable en un clic.
- **Privée** : n'apparaît JAMAIS dans la liste. Rejoignable uniquement par son code (comportement actuel conservé).
- Le guard existant `GAME_IN_PROGRESS` sur `joinGame` reste en place.

---

## 7. CONTRATS API & RÉSEAU

### REST (`/api/*`, JSON, validé par zod)
```
POST /api/auth/register  { email, username, password }
  → 201 { user: PublicUser }  + Set-Cookie jk_session
  → 400 validation ; 409 email ou username déjà pris (message distinct)
POST /api/auth/login     { email, password }
  → 200 { user: PublicUser }  + Set-Cookie jk_session
  → 401 identifiants invalides (message UNIQUE, ne pas révéler si l'email existe)
POST /api/auth/logout    → 204, supprime la session en BDD + clear cookie
GET  /api/auth/me        → 200 { user: PublicUser } | 401
GET  /api/users/:username/stats → 200 { profil + stats } | 404
GET  /api/leaderboard    → 200 { season: "2026-07", entries: [{ rank, username, level, points, gamesPlayed }] } (top 50)
```
`PublicUser = { id, username, xp, level }` — **jamais** email vers d'autres joueurs, jamais `password_hash` nulle part. (`/api/auth/me` peut inclure `email` pour le propriétaire.)

Règles de validation : email format standard (lowercased) ; username `^[a-zA-Z0-9_]{3,20}$` ; password ≥ 8 caractères. Rate limiting (`express-rate-limit`) sur `/api/auth/login` et `/api/auth/register` (ex. 10 req / 15 min / IP).

### Socket.IO — ajouts à `events.ts` (⚠️ un seul agent, LOT 4)
```
ClientToServerEvents :
  createGame  → payload enrichi : { ..., visibility: 'public' | 'private' }
  listGames   → () (demande la liste des parties publiques joignables)

ServerToClientEvents :
  publicGamesUpdate → { games: PublicGameSummary[] }
      PublicGameSummary = { roomCode, hostUsername, playerCount, createdAt }
```
Diffusion : le serveur émet `publicGamesUpdate` aux sockets présents sur l'écran d'accueil (room Socket.IO dédiée, ex. `"lobby-browser"`, jointe/quittée par le client) à chaque changement (création, join, départ, démarrage). Pas de polling.

### Identité en partie
- Si le socket est authentifié, le pseudo utilisé en partie EST `username` du compte (le client n'envoie plus de pseudo libre pour un joueur connecté).
- Invité : pseudo libre comme aujourd'hui, `userId = null`.
- Le `GameManager` mémorise `userId: string | null` par siège **au démarrage de la partie** (pour l'écriture BDD de fin et le flag `ranked`).

---

## 8. DÉCOUPAGE EN LOTS

> Règles d'orchestration inchangées : un lot = un agent = un commit (fait par l'utilisateur après validation). Jamais deux agents sur le même fichier. Recap obligatoire. Toute modif `shared/` → tests ajoutés + harnais 100% vert. **Ordre strict : LOT 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.** (4 et 6 pourraient techniquement se paralléliser mais on reste en série : ils touchent tous deux `index.ts`.)

---

### LOT 0 — Reconnaissance (LECTURE SEULE, aucun fichier modifié)
**Objectif** : établir l'état réel du code avant tout travail. L'agent NE MODIFIE RIEN.
À remonter dans le récap :
1. Comment `createGame`/`joinGame` fonctionnent aujourd'hui : existe-t-il déjà un `roomCode` ? Format ? Où est-il généré ?
2. Structure exacte de `GameManager` : clé des Maps, cycle de vie d'une partie, où et comment on détecte la fin de partie (`phase === 'finished'`) côté serveur.
3. Où le client stocke le pseudo actuel et comment il transite (payload `createGame`/`joinGame` ?).
4. Comment `index.ts` est organisé (taille, découpage possible en modules sans tout casser).
5. Confirmation que le serveur tourne en `tsx` sans build, et comment les env vars sont lues aujourd'hui.
6. Liste des données disponibles en fin de partie pour remplir `game_players` (scores finaux, historique `dealHistory` → contrats/xishts par siège : tout est-il présent ?).
**Definition of done** : récap factuel répondant aux 6 points, avec chemins de fichiers et extraits courts. Zéro modification (`git status` doit être vierge).

---

### LOT 1 — Infrastructure BDD (serveur uniquement)
**Préalable utilisateur (pas l'agent)** : créer un projet sur https://neon.tech (gratuit), récupérer la connection string, la mettre dans `server/.env` (`DATABASE_URL=...`) et dans le dashboard Render (Environment).
**Objectif** : brancher Drizzle + Postgres, créer le schéma complet (§5), migrations.
**Fichiers autorisés** : `server/` uniquement — nouveaux fichiers `server/src/db/schema.ts`, `server/src/db/client.ts`, config `drizzle.config.ts`, `server/.env.example`, `.gitignore` (ajout `.env`), `server/package.json` (deps : `drizzle-orm`, `pg`, `drizzle-kit` en dev, `dotenv` si nécessaire).
**Contraintes** :
- Schéma = §5 à l'identique (noms de tables/colonnes compris).
- `client.ts` exporte un singleton `db` (Pool `pg` + drizzle). SSL activé (Neon l'exige) : `ssl: { rejectUnauthorized: false }` ou paramètre `sslmode=require` de la connection string.
- Migrations générées via `drizzle-kit generate` et appliquées via `drizzle-kit migrate` (scripts npm `db:generate` / `db:migrate` ajoutés). Les fichiers de migration SONT committés.
- Le serveur doit démarrer **même sans `DATABASE_URL`** (warning console, mode dégradé sans persistance) — on ne casse pas le dev local de quelqu'un qui n'a pas configuré Neon.
- Ne toucher NI à `GameManager.ts` NI à `index.ts` (sauf l'éventuel `import 'dotenv/config'` en tête d'`index.ts`, à signaler explicitement dans le récap).
**Definition of done** : `npm.cmd run db:migrate` crée les tables sur Neon ; serveur démarre avec et sans `DATABASE_URL` ; harnais shared 100% vert (rien de `shared/` touché) ; récap listant chaque fichier créé/modifié.

---

### LOT 2 — Auth back (REST + sessions + middleware socket)
**Objectif** : inscription, connexion, déconnexion, `me`, et identité sur les sockets.
**Fichiers autorisés** : `server/src/` — nouveaux `auth/routes.ts`, `auth/sessions.ts`, `auth/passwords.ts`, `auth/socketAuth.ts` (ou équivalent proposé au récap) ; modification de `index.ts` (montage `/api`, `express.json()`, cookie-parser, `io.use`). Deps : `argon2`, `zod`, `cookie-parser`, `express-rate-limit`.
**Contraintes** :
- Contrats REST du §7 à l'identique (codes HTTP, messages, cookie).
- `passwords.ts` : `hashPassword` / `verifyPassword` via argon2id. Si l'installation d'`argon2` (module natif) échoue sur Render, fallback documenté : `@node-rs/argon2` — le signaler au récap, ne pas basculer sur bcrypt en silence.
- `sessions.ts` : `createSession(userId)` → retourne le token brut (posé en cookie), stocke le SHA-256 ; `resolveSession(token)` → `userId | null` (vérifie l'expiration) ; `destroySession(token)`.
- Cookie : `httpOnly: true`, `sameSite: 'lax'`, `secure: process.env.NODE_ENV === 'production'`, `maxAge` 30 jours, `path: '/'`.
- `socketAuth.ts` : middleware `io.use()` qui parse le cookie du handshake et pose `socket.data.userId: string | null`. **Ne JAMAIS rejeter la connexion si pas de session** (invité = légitime).
- Login : message d'erreur identique que l'email existe ou non. Register : erreurs 409 distinctes email/username.
- Aucune modification de `shared/`, `GameManager.ts` (hors besoin avéré à justifier), ni du client.
**Definition of done** : parcours complet testable au REST client (register → cookie → me → logout → me = 401) ; doublon email/username → 409 ; rate limit actif ; socket d'un utilisateur connecté porte `userId`, invité porte `null` ; harnais vert ; récap avec exemples de requêtes/réponses réelles.

---

### LOT 3 — Auth front (écrans + contexte)
**Objectif** : inscription/connexion côté client, état d'auth global, invité préservé.
**Fichiers autorisés** : `client/src/` — nouveaux `AuthContext.tsx`, `screens/Login.tsx`, `screens/Register.tsx`, `api.ts` (helper fetch `/api`, `credentials: 'include'` par cohérence même en same-origin) ; modification de `App.tsx`, `screens/Home.tsx` (+ CSS associés).
**Contraintes** :
- Au boot : `GET /api/auth/me` → si 200, l'utilisateur est connecté (pseudo = username du compte, champ pseudo masqué/pré-rempli non éditable) ; si 401, mode invité (champ pseudo libre comme aujourd'hui).
- `Home.tsx` : entrées "Se connecter / Créer un compte" si invité ; "username (niv X) / Se déconnecter" si connecté. **Aucun blocage du flux invité.**
- Pas de lien "mot de passe oublié" (hors scope V5).
- Gestion des erreurs API affichée proprement (409/401/400), pas d'`alert()`.
- Ne PAS toucher `GameContext.tsx`, `events.ts`, ni les écrans de jeu (`Lobby`, `Board`).
**Definition of done** : register/login/logout fonctionnels en local contre le serveur du LOT 2 ; refresh de page conserve la connexion (cookie) ; invité joue exactement comme avant ; build client OK ; récap + captures ou description factuelle du rendu réel (pas "attendu").

---

### LOT 4 — Lobby global : parties publiques/privées (⚠️ contrat réseau — agent SEUL)
**Objectif** : visibilité `public/private` à la création, liste temps réel des parties publiques, join en un clic, privées par code uniquement.
**Fichiers autorisés** : `shared/events.ts` (+ types associés si besoin dans `shared/`), `server/src/index.ts`, `server/src/GameManager.ts`, `client/src/GameContext.tsx`, `client/src/screens/Home.tsx`, `client/src/socket.ts` si nécessaire (+ CSS).
**Contraintes** :
- Contrats du §7 à l'identique (`visibility`, `listGames`, `publicGamesUpdate`, `PublicGameSummary`, room `"lobby-browser"`).
- `GameManager` : stocke `visibility` + expose une méthode pure de listing des parties publiques joignables (pas commencée, sièges libres).
- Diffusion événementielle (création/join/départ/démarrage), pas de polling. Le client rejoint la room `lobby-browser` sur l'écran d'accueil et la quitte en entrant dans une partie.
- Pseudo d'un joueur connecté = `username` serveur (depuis `socket.data.userId`) — le pseudo du payload client est IGNORÉ pour un socket authentifié. `GameManager` mémorise `userId | null` par siège.
- Le flag `ranked` est figé au démarrage effectif : `ranked = les 4 sièges sont humains` (le mode solo/bots → false). Stocké sur la partie en mémoire (l'écriture BDD arrive au LOT 5).
- Anti-triche : `PublicGameSummary` ne contient RIEN du jeu (pas de mains, pas d'état de manche).
- Guards existants (`GAME_IN_PROGRESS`, reconnexion, `lobbyUpdate` au reconnect) intacts.
**Definition of done** : deux navigateurs — l'un crée une publique, l'autre la voit apparaître sans rafraîchir et la rejoint en un clic ; une privée n'apparaît jamais mais reste joignable par code ; la partie disparaît de la liste au démarrage/remplissage ; harnais vert ; build OK ; récap incluant le diff exact d'`events.ts`.

---

### LOT 5 — Persistance des résultats (serveur)
**Objectif** : à la fin d'une partie (`phase === 'finished'`), écrire `games` + 4 lignes `game_players` en BDD, calculer positions/points/XP, créditer l'XP des joueurs authentifiés.
**Fichiers autorisés** : `shared/progression.ts` (NOUVEAU, pur) + son fichier de test + enregistrement dans le harnais ; `server/src/persistence/gameResults.ts` (NOUVEAU) ; `server/src/index.ts` (branchement du hook de fin) ; `server/src/GameManager.ts` si besoin d'exposer des données (à justifier).
**Contraintes** :
- `shared/progression.ts` : `xpForGame`, `xpRequiredForLevel`, `levelForXp`, `xpProgress`, `rankingPointsForPosition`, `computeFinalPositions(scores: number[])` (gestion ex æquo §6) — **fonctions pures, testées** (cas §6 + ex æquo 1,1,3,4).
- `gameResults.ts` : `saveGameResult(...)` — une transaction ; `contracts_made`/`xishts`/`contracts_total` calculés depuis `dealHistory` (données confirmées au LOT 0) ; `UPDATE users SET xp = xp + ...` pour chaque siège authentifié si `ranked`.
- **Idempotence** : ne jamais enregistrer deux fois la même partie (garde en mémoire "déjà persistée" sur l'instance de partie).
- **Résilience (principe 11)** : tout est dans `try/catch` + log. BDD down ⇒ la partie se termine normalement côté joueurs.
- Si `DATABASE_URL` absent : no-op silencieux (warning au boot déjà en place, LOT 1).
- Aucun changement de `events.ts`/`views.ts`/client.
**Definition of done** : partie ranked terminée → 1 ligne `games` + 4 lignes `game_players` correctes (positions, points, xp_awarded), XP crédité ; partie solo (bots) → enregistrée avec `ranked=false`, `ranking_points=0`, `xp_awarded=0` ; harnais vert avec les nouveaux tests `progression` ; récap avec le contenu réel des lignes insérées (SELECT).

---

### LOT 6 — Profil, stats & classement (API + écrans)
**Objectif** : endpoints `GET /api/users/:username/stats` et `GET /api/leaderboard` + écrans front.
**Fichiers autorisés** : `server/src/stats/routes.ts` (NOUVEAU) + montage dans `index.ts` ; `client/src/screens/Profile.tsx`, `client/src/screens/Leaderboard.tsx` (NOUVEAUX, + CSS), `App.tsx`, `Home.tsx` (navigation), `api.ts`.
**Contraintes** :
- Stats et classement = requêtes d'agrégation SQL (Drizzle) conformes §5/§6 — pas de compteurs dénormalisés.
- Leaderboard : saison courante (mois UTC), `ranked=true` uniquement, top 50, champ `rank` calculé.
- Profil : stats §6 + niveau/XP/progression via `xpProgress` de `shared/progression.ts` (import type-safe, `shared/` est déjà consommé par le client).
- Profils publics : accessibles à tous (connecté ou non), par username. 404 propre si inconnu.
- Ne pas toucher `events.ts`/`views.ts`/`GameManager.ts`.
**Definition of done** : profil affiche des chiffres cohérents avec les parties du LOT 5 ; leaderboard trié correct ; un invité peut consulter les deux ; build OK ; récap avec les requêtes SQL générées (log Drizzle) pour vérification.

---

### LOT 7 — Intégration niveau en jeu + polish V5
**Objectif** : afficher `niv X` à côté des pseudos (lobby de partie + sièges du board) pour les joueurs authentifiés, et finitions.
**Fichiers autorisés** : `shared/views.ts` + `shared/events.ts` (ajout d'un champ PUBLIC `playerLevels: (number | null)[]` ou équivalent — ⚠️ contrat réseau, agent seul), `server/src/index.ts`/`GameManager.ts` (peupler le niveau au join depuis la BDD, `null` pour invité/bot), `client/src/components/PlayerSeat.tsx`, `screens/Lobby.tsx` (+ CSS).
**Contraintes** :
- Le niveau est public par nature (aucun risque anti-triche) mais l'ajout à `PlayerView` suit la procédure contrat réseau : un seul agent, vérification qu'AUCUNE donnée privée ne part avec.
- Lecture BDD au join uniquement (pas de requête par manche) ; invité → `null` → rien affiché.
- Résilience : BDD down → `null` partout, le jeu tourne.
**Definition of done** : niveaux visibles en lobby et sur le board pour les connectés, absents pour les invités ; anti-triche vérifié sur payload réseau brut (aucune fuite) ; harnais vert ; build OK.

---

## 9. FORMAT DE RÉCAP EXIGÉ (tous lots)

Chaque agent termine par :
1. **Fichiers créés/modifiés** (liste exhaustive, chemins exacts) — tout fichier hors périmètre autorisé = à signaler en ROUGE.
2. **Ce qui a été fait**, point par point vs la Definition of done.
3. **Résultat des tests** : sortie réelle de `npx tsx shared/run-all-tests.ts` (+ `npm.cmd run build` client si front touché).
4. **Décisions prises / écarts** vs le brief, avec justification.
5. **Points de vigilance** laissés au lot suivant.
L'agent **ne commit pas** et **ne push pas**. Le commit est fait par l'utilisateur après validation de l'orchestrateur, format : `feat(v5): <lot> — <description ciblée>`, précédé de `git add` **ciblé** sur les fichiers du lot + `git status` de contrôle.

---

## 10. APRÈS LA V5 (backlog, ne pas implémenter)

- Reset de mot de passe par email (Resend), vérification d'email
- Mode spectateur (SpectatorView filtrée dédiée)
- OAuth Google + Sign in with Apple (obligatoire ensemble le jour de l'App Store)
- Packaging Capacitor (iOS/Android) + manifest PWA complet
- ELO multijoueur en remplacement/complément des points de saison
- Historique des parties consultable depuis le profil (les données seront déjà en BDD)
- Dette technique existante : `@types/node` dans `shared`, fixtures `round.joker.test.ts`, project-references serveur
