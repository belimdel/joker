# 🃏 Joker — HANDOFF (juillet 2026)

> Document de reprise autonome. Permet à une nouvelle instance orchestrateur (ou à un humain) de reprendre le projet sans autre contexte. Rédigé après validation des lots V5 + V5.1 (FIX A / FIX B).

---

## 1. LE PROJET EN UNE MINUTE

Jeu de cartes multijoueur en ligne temps réel : **Joker géorgien** (4 joueurs, plis avec atout, enchères, 2 jokers spéciaux, famille Oh Hell / Whist roumain). Projet personnel de l'utilisateur (alternant dev web 2e année, profil PHP/Symfony, junior surtout côté back), avec ambition de **produit commercialisable** (web d'abord, App Store / Google Play ensuite).

- **Déployé et jouable** : https://joker-kikq.onrender.com (Render free tier)
- **Vocabulaire métier** : « grande manche » = phases 1→8 cartes (Sets 0 et 2) ; « petite manche » = blocs de donnes à 9 cartes (Sets 1 et 3). ⚠️ Contre-intuitif, ne pas inverser.
- **Xisht** : contrat ≥1 avec 0 pli pris = −200. Prime de set pour le meilleur du set.

## 2. STACK & ARCHITECTURE

```
Joker/  (monorepo, Git sur main, pas de branches)
├── shared/     TS pur, fonctions pures immutables, ZÉRO import serveur (bundlé client)
│               cards, deal, bidding, trick, round, game, scoring, bot,
│               views (PlayerView anti-triche), events (contrat réseau), progression (XP/niveaux)
│               + harnais : npx tsx shared/run-all-tests.ts  (13 fichiers, doit rester 100% vert)
├── server/     Node + TS + Express 5 + Socket.IO, lancé en tsx (pas de build serveur)
│   └── src/    index.ts (HTTP + sockets + timer autoritatif 15s)
│               GameManager.ts (parties EN MÉMOIRE, Maps ; reconnexion sessionId + grace 15s)
│               db/ (Drizzle + pg → Neon Postgres ; db nullable = mode dégradé sans DATABASE_URL)
│               auth/ (routes REST, sessions opaques, socketAuth), mail/, persistence/, stats/
│               + tests serveur : GameManager.fixA.test.ts, auth/emailVerification.test.ts (PGlite)
└── client/     React 19 + TS + Vite (SPA), proxy dev /api et /socket.io → :3001
```

**Principes cardinaux (non négociables)**
1. Le serveur fait autorité — le client envoie des intentions, tout est validé serveur.
2. `PlayerView` = frontière anti-triche : jamais les mains adverses. Toute modif de `views.ts`/`events.ts` = « contrat réseau » = **un seul agent à la fois** + vérification de fuite sur le payload brut.
3. `shared/` pur. Effets de bord (BDD, timers, sockets) côté serveur uniquement.
4. TS strict, zéro `any`. Commentaires FR, identifiants EN. `npm.cmd` sur ce poste Windows.
5. La BDD ne fait JAMAIS planter une partie (try/catch systématique dans le flux de jeu).
6. Identité côté serveur uniquement (`socket.data.userId` via cookie de session) — jamais depuis un payload client.
7. Aucun secret committé (`.env` gitignoré, `.env.example` à jour, secrets prod dans le dashboard Render).

**Méthode d'orchestration** (validée sur 5+ sessions)
- Utilisateur = intermédiaire, ne code jamais → orchestrateur (Claude) = architecte, produit les briefs → agents Claude VS Code = exécutants.
- 1 lot = 1 agent = 1 commit (fait par l'utilisateur après validation orchestrateur). Agents : jamais de self-commit, périmètre de fichiers strict, récap avec PREUVES réelles (traces HTTP, SELECT, sorties de tests) — « devrait fonctionner » est irrecevable.
- Reconnaissance avant écriture : chaque lot commence par vérifier l'état réel du code (historique : 4 bugs sur 5 documentés étaient des fantômes).
- Git : `git status` avant tout commit, `git add` ciblé, jamais `add -A` en aveugle (incident historique : fichiers jamais trackés crus committés).

## 3. ÉTAT FONCTIONNEL ACTUEL (ce qui marche)

**Cœur de jeu (V1→V4, stable)** : logique complète (enchères avec contrainte du donneur, xisht, primes, jokers haut/bas, choix d'atout sur les 9 cartes, sans-atout), serveur autoritatif, timer 15 s + auto-play bot au timeout, mode solo (1 humain + 3 bots), reconnexion silencieuse en partie (sessionId de partie en localStorage + grace 15 s), UI mobile en croix, tableau de scores par sets.

**V5 (comptes & méta-jeu)** :
- Auth email + mot de passe : argon2id, sessions opaques BDD (token 32 bytes → SHA-256 stocké), cookie httpOnly `jk_session` 30 j, rate limiting, anti-énumération au login. Middleware socket → `socket.data.userId | null` (invité légitime).
- BDD Neon (Postgres) + Drizzle : tables `users`, `sessions`, `games`, `game_players`, `email_verification_codes` ; migrations committées (`0000`, `0001`).
- Lobby global : parties `public`/`private`, liste temps réel (`publicGamesUpdate`), join en un clic, privées par code uniquement.
- Persistance fin de partie : positions (ex æquo gérés), points de classement (30/15/5/0), XP crédité — uniquement si `ranked` (= 4 humains au démarrage, anti-farming ; solo/bots = non ranked). Idempotent, résilient.
- Profil (8 stats + barre XP), classement saisonnier (mois UTC, top 50), niveaux affichés en lobby et sur le board (`playerLevels`, champ public). Mode invité intégralement préservé (joue sans compte, sans stats).
- `shared/progression.ts` : XP/niveaux/positions en fonctions pures testées (29 assertions).

**V5.1 (intégrité & email)** :
- FIX A : unicité d'identité par partie (userId sinon sessionId → rattachement au siège, doublons impossibles — prouvé e2e 12/12), refresh en lobby → retour au siège, siège libéré après grace si non-retour, partie vide détruite, `leaveGame`/`resumeGame`, verrou « partie en cours » (erreur `ACTIVE_GAME` + roomCode, bandeau Rejoindre côté client, créer/rejoindre/solo bloqués tant que la partie n'est pas finie).
- FIX B : vérification email par code 6 chiffres — SHA-256 stocké (jamais en clair), expiration 15 min, 5 tentatives max, resend cooldown 60 s toujours en 204 (anti-énumération), login non vérifié → 403 `EMAIL_NOT_VERIFIED`, écran `VerifyEmail`, session créée à la vérification. MailService : Nodemailer SMTP Gmail + **mode dégradé** (code loggé console si SMTP non configuré). Migration passe les comptes préexistants à `email_verified = true`.

## 4. ⚠️ ACTIONS IMMÉDIATES (dans CET ordre)

L'état V5.1 est validé par l'orchestrateur mais **RIEN N'EST COMMITTÉ**.

1. **Commits** (2, ciblés) :
   - `fix(v5.1): identite unique par partie, quitter, verrou partie en cours` (fichiers FIX A + `GameManager.fixA.test.ts`)
   - `feat(v5.1): verification email par code (SMTP + mode degrade)` (fichiers FIX B + test PGlite + devDep)
   - `git status` avant/après chaque add ; vérifier que `server/.env` n'apparaît JAMAIS.
2. **Isoler le dev de la prod** : créer une **branche Neon** `dev` (dashboard Neon → Branches), pointer `server/.env` local dessus. La prod n'est plus jamais touchée depuis un poste de dev (incident évité de justesse : le `.env` local pointait sur la prod).
3. **Migration prod AVANT push** : `npm.cmd run db:migrate` avec la `DATABASE_URL` de prod (sinon les routes auth tombent en 500 au déploiement : colonne `email_verified` absente).
4. **Render** : ajouter `SMTP_USER` / `SMTP_PASS` (mot de passe d'application Gmail, compte avec validation 2 étapes).
5. **Push** → déploiement.
6. **Checklist de validation manuelle en prod** (jamais déroulée intégralement) :
   - Auth : register → mail reçu → code → connecté ; refresh conserve ; logout/login ; 409 email/username distincts ; 401 générique ; rate limit ; code faux ×5 → invalidé ; login non vérifié → écran code.
   - Invité : partie complète sans compte (non-régression n°1).
   - Lobby 2 navigateurs : publique visible sans refresh + join 1 clic ; privée invisible mais joignable par code ; disparition au démarrage.
   - Intégrité : 2 onglets même compte → 1 seul siège ; refresh lobby → retour au siège ; quitter lobby → libéré ; quitter partie démarrée → Home verrouillé + Rejoindre → verrou levé à la fin.
   - Persistance : partie solo finie → SELECT `games`/`game_players` sur Neon : `ranked=false`, `ranking_points=0`, `xp_awarded=0`. Partie 4 humains → points/XP corrects, profil et leaderboard cohérents.
   - Reconnexion en pleine partie démarrée : inchangée (⚠️ historique : réémission `lobbyUpdate` au reconnect à préserver).

## 5. DÉCISIONS FIGÉES (ne pas rouvrir sans raison forte)

| Sujet | Décision |
|---|---|
| BDD | Neon Postgres + Drizzle, driver `pg`. Mode dégradé sans `DATABASE_URL`. |
| Auth | Email+mdp, argon2id, sessions opaques BDD + cookie httpOnly. PAS de JWT (un seul serveur, révocabilité). |
| Vérification email | Code 6 chiffres hashé, flux décrit §3. SMTP Gmail tant que pas de domaine ; interface `MailService` pour bascule Resend plus tard. |
| Ranked | Figé au démarrage : 4 sièges humains. Sinon 0 XP / 0 point. |
| Classement | Saison = mois calendaire UTC ; 30/15/5/0 par position ; ex æquo partagent la position (1,1,3,4). ELO = plus tard. |
| Niveaux | Cosmétique. `levelForXp` dérivé (jamais stocké). |
| Verrou partie | Une identité = une partie démarrée max. Invités : par sessionId, contournable (assumé). |
| Mobile | Web d'abord. Stores via Capacitor en phase finale. |

## 6. ROADMAP → PRODUIT COMMERCIALISABLE

### Phase 1 — Consolidation (avant toute nouvelle feature)
- Dérouler la checklist §4.6 ; ouvrir des lots de fix ciblés (1 commit/fix) si écarts.
- **Cycle de vie des parties en mémoire** : les parties terminées restent dans les Maps jusqu'au vidage (fuite identifiée, pré-existante). Lot dédié : éviction des parties finies/abandonnées + TTL.
- **CI GitHub Actions** : harnais shared + tests serveur (GameManager, emailVerification) + build client sur chaque push. On a enfin des tests serveur — les brancher.
- Keep-alive Render (cron-job.org / UptimeRobot, ping ~10 min) contre le cold start ~30 s.
- Logs structurés côté serveur + Sentry (tier gratuit) pour voir les erreurs de prod.

### Phase 2 — Exigences d'un produit public (web)
- **Domaine custom** (~10 €/an) → emails via **Resend** sur le domaine (déliverabilité sérieuse, Gmail SMTP = solution de transition), URL propre.
- **Reset de mot de passe** (email, même infra que la vérification).
- **Suppression de compte** (obligation RGPD, et exigence Apple pour plus tard) : effacement `users` + anonymisation des `game_players` (garder les lignes, `user_id=NULL`, pseudo → « Joueur supprimé »).
- **Pages légales** : CGU, politique de confidentialité, mentions (hébergeur, données stockées : email + hash + stats). ⚠️ À faire relire — pas le rôle d'un agent.
- **Modération minimale** : filtre de pseudos à l'inscription, bouton « signaler », possibilité de bannir (flag en BDD + refus au login).
- **Pénalité déserteur** : quitter une partie ranked sans revenir = malus (sinon rage-quit gratuit — le bot joue et pollue les stats des autres). Design à faire.
- **Onboarding** : écran de règles / tutoriel (le Joker géorgien est inconnu du grand public).
- **Passe design** (backlog existant) : `board.css`/`Board.tsx` en lot SÉRIEL unique — glissement de carte vers le centre, fade du pli, pulse de tour, `turnDurationMs` 15000 hardcodé faussant la barre pour les bots, style inline `notice` → classe CSS, vérif visuelle des séparateurs « Set N ». + sons, feedback, i18n FR/EN (voire KA).

### Phase 3 — Croissance
- Render payant (~7 $/mois) quand il y a de vrais joueurs (le keep-alive est un palliatif).
- Historique des parties sur le profil (les données sont déjà en BDD).
- Archivage des saisons + récompenses cosmétiques ; ELO multijoueur en complément des points.
- Amis / invitations directes ; mode spectateur (chantier anti-triche dédié : `SpectatorView` filtrée) ; chat (implique modération sérieuse — décision à peser).

### Phase 4 — Stores
- Capacitor autour du client existant (icônes, splash, deep links) ; manifest PWA complet.
- Comptes développeur : Apple 99 $/an, Google 25 $ une fois.
- Si OAuth Google ajouté → **Sign in with Apple obligatoire** (règle App Store). Suppression de compte in-app obligatoire (déjà faite en phase 2). Push notifications (tour à jouer) = vraie valeur ajoutée mobile.
- Monétisation éventuelle : cosmétique uniquement (dos de cartes, tables) — jamais de pay-to-win, le classement est l'actif de confiance du produit.

## 7. DETTE TECHNIQUE & VIGILANCES
- Parties finies non évincées de la mémoire (cf. Phase 1 — prioritaire).
- `@types/node` manquant proprement dans `shared/` ; fixtures fragiles `round.joker.test.ts` ; project references TS serveur — vieux backlog, non bloquant.
- Le `sessionId` de partie (localStorage) et les sessions d'auth (cookie) coexistent : ne pas fusionner, ne pas renommer.
- Deux systèmes d'événements d'erreur réseau : garder `GameErrorCode` propre (historique : un lot entier a servi à nettoyer un code ajouté à tort).
- Emails : depuis Gmail SMTP, risque spam modéré → surveiller, motive le passage domaine+Resend en Phase 2.
- Récaps d'agents : exiger des preuves réelles reste la règle — le récap V5.1 est le nouveau standard de référence.

## 8. SECRETS & ENVIRONNEMENTS
- `server/.env` (gitignoré) : `DATABASE_URL` (→ branche Neon **dev** après l'action §4.2), `SMTP_USER`, `SMTP_PASS`. Template : `server/.env.example`.
- Render (prod) : `DATABASE_URL` (Neon prod), `SMTP_USER`, `SMTP_PASS`, `NODE_ENV=production`.
- Neon : projet unique, branche prod + branche dev à créer. Migrations via `npm.cmd run db:migrate` (drizzle-kit), fichiers de migration committés.
