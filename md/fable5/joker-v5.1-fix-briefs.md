# 🃏 Joker V5.1 — Briefs de correction (FIX A puis FIX B)

> Deux lots de correction, **STRICTEMENT SÉQUENTIELS** (les deux touchent `server/src/index.ts` et des écrans client — jamais en parallèle). Un agent par lot. **L'agent ne commit JAMAIS et ne push JAMAIS** : il rend un récap, l'utilisateur commit après validation de l'orchestrateur.
> Ordre : **FIX A d'abord** (bugs cassant le cœur du jeu), FIX B ensuite.

---

## CONTEXTE COMMUN (à lire par les deux agents)

Projet : jeu de cartes multijoueur temps réel (Joker géorgien), monorepo `shared/` (logique pure TS) + `server/` (Node + Express 5 + Socket.IO, lancé en `tsx`) + `client/` (React 19 + Vite). BDD Postgres (Neon) via Drizzle (`server/src/db/schema.ts`, singleton `db` dans `server/src/db/client.ts`, nullable si `DATABASE_URL` absent = mode dégradé).

Auth existante : email + mot de passe (argon2id via `@node-rs/argon2`), sessions opaques en BDD (token 32 bytes, SHA-256 stocké), cookie httpOnly `jk_session`, middleware `io.use()` qui pose `socket.data.userId: string | null` (`null` = invité). Routes sous `/api/auth` (`server/src/auth/`).

Jeu : reconnexion silencieuse **en partie** via un `sessionId` de partie stocké en `localStorage` + grace period 15s côté serveur (`GameManager.ts`). ⚠️ Ce `sessionId` de partie est DISTINCT des sessions d'auth — ne pas fusionner, ne pas renommer.

### Principes non négociables
1. Le serveur fait autorité. Le client envoie des intentions, le serveur valide tout.
2. `PlayerView` ne contient JAMAIS de données privées d'un autre joueur.
3. `shared/` = fonctions pures, aucun import serveur (bundlé côté client).
4. TS strict, zéro `any`, `import type` où applicable. Commentaires en français, identifiants en anglais.
5. Toute modif de `shared/events.ts` / `shared/views.ts` = contrat réseau : l'agent vérifie qu'aucune donnée privée ne fuit.
6. Aucun secret en dur ni committé. `.env` est gitignoré, compléter `server/.env.example`.
7. Jamais de mot de passe NI de code de vérification en clair (ni stocké, ni loggé).
8. La BDD ne doit jamais faire planter une partie : toute écriture dans le flux de jeu = `try/catch` + log.
9. **Investiguer avant de coder** : chaque lot commence par une phase de reconnaissance dont les réponses figurent dans le récap. Si la réalité du code contredit ce brief, le signaler AVANT d'implémenter autre chose, ne pas deviner.

### Commandes
```powershell
cd server && npm.cmd run dev      # port 3001
cd client && npm.cmd run dev      # port 5173 (proxy /api et /socket.io → 3001)
npx tsx shared/run-all-tests.ts   # harnais — DOIT rester 100% vert
```

### Format de récap exigé (fin de lot)
1. Réponses aux questions de reconnaissance (avec chemins/extraits).
2. Fichiers créés/modifiés (exhaustif) — tout fichier hors périmètre = signalé en ROUGE avec justification.
3. Point par point vs la Definition of done, avec PREUVES (sorties réelles : requêtes HTTP, SELECT SQL, logs serveur — pas de "devrait fonctionner").
4. Sortie réelle du harnais + `npm.cmd run build` client.
5. Décisions/écarts vs le brief, points de vigilance.

---

# FIX A — Sièges fantômes, identité unique, quitter la partie, verrou "partie en cours"

## Symptômes observés (reproduits par l'utilisateur)
- **A1** : rejoindre une partie NON commencée, rafraîchir la page → retour au menu, MAIS la partie affiche toujours 1/4 avec le joueur dedans, ET il peut la rejoindre à nouveau. Répétable jusqu'à occuper les 4 sièges avec la même personne et lancer une partie contre soi-même.
- **A2** : le bouton "Quitter" avant le démarrage de la partie ne fait rien.
- **A3** (comportement voulu, inexistant) : quitter une partie DÉMARRÉE doit être possible, mais le joueur reste alors verrouillé : il ne peut ni créer ni rejoindre une autre partie — seulement consulter profil/stats/classement et REJOINDRE sa partie en cours. Le verrou tombe quand la partie se termine.

## Phase 1 — Reconnaissance (obligatoire, à remonter dans le récap)
1. Que fait exactement le serveur au `disconnect` d'un socket quand la partie est en phase lobby (pas démarrée) ? La grace period 15s s'applique-t-elle, ou seulement en partie ?
2. Existe-t-il déjà un événement `leaveGame` (ou équivalent) dans `events.ts` ? Que fait le bouton "Quitter" côté client aujourd'hui (handler ? emit ? rien ?) ?
3. Comment fonctionne la reconnexion silencieuse : quand le client réutilise-t-il son `sessionId` de partie ? Pourquoi ne se re-siège-t-il pas après un refresh en lobby (le client ne tente pas ? le serveur refuse ?) ?
4. `joinGame` vérifie-t-il quoi que ce soit sur l'identité du joueur (userId, sessionId), ou seulement le code et les places libres ?
5. Où la partie est-elle détruite aujourd'hui (fin de partie, abandon, jamais ?) — cycle de vie exact dans `GameManager`.

## Phase 2 — Comportement cible (specs)

### A-1. Unicité d'identité par partie (LE fix anti-absurde)
- Définir l'**identité** d'un joueur côté serveur : `userId` si le socket est authentifié, sinon le `sessionId` de partie (invité).
- Guard dans `joinGame` (serveur, autoritatif) : si cette identité occupe DÉJÀ un siège de cette partie (connecté ou en grace period) → **rattacher** le socket à ce siège (même chemin que la reconnexion silencieuse existante), JAMAIS créer un deuxième siège. Réémettre `lobbyUpdate` (fix reconnexion existant ⚠️ À PRÉSERVER).
- Conséquence attendue : impossible d'occuper 2 sièges d'une même partie avec le même compte ou le même navigateur.

### A-2. Refresh en lobby (pré-démarrage)
- La reconnexion silencieuse via `sessionId` doit couvrir AUSSI la phase lobby : après refresh, le client retente le resume (comme en partie) et retrouve son siège, écran Lobby réaffiché.
- Si le joueur ne revient pas dans la grace period (15s) alors que la partie n'a pas démarré : **libérer le siège**, broadcast `lobbyUpdate` + `publicGamesUpdate`.
- Partie en lobby qui devient vide (0 humain) → **détruire la partie** + broadcast `publicGamesUpdate`.

### A-3. `leaveGame` (événement explicite)
- Ajouter/brancher `leaveGame: () => void` dans `ClientToServerEvents` (si absent — cf. recon). Siège résolu par le SERVEUR depuis le socket (jamais depuis un payload).
- **Avant démarrage** : retire le joueur, libère le siège, broadcast `lobbyUpdate` + `publicGamesUpdate`, partie vide → destruction. Client : retour à `Home`, `sessionId` de partie nettoyé.
- **Partie démarrée** : le joueur quitte l'interface (retour Home), MAIS son siège reste — le bot de timeout existant joue ses tours (aucune nouvelle logique de bot). Le verrou A-4 s'active. Le `sessionId` de partie est CONSERVÉ côté client (c'est la clé du retour).
- Le bouton "Quitter" existe dans les deux contextes (Lobby et Board) et passe par ce même événement. En partie démarrée, demander confirmation côté client (les tours seront joués automatiquement en attendant le retour).

### A-4. Verrou "partie en cours"
- Serveur : `GameManager` sait répondre à « cette identité a-t-elle une partie DÉMARRÉE et non terminée ? » (parcours des parties en mémoire ou index identité→partie, au choix de l'agent — justifier).
- Guards : `createGame`, `joinGame` (d'une AUTRE partie) et `startTestGame` refusent si un verrou existe → erreur typée (ex. code `ACTIVE_GAME`, ajouté proprement au contrat d'erreurs existant) portant le `roomCode` de la partie active.
- Client (`Home`) : si verrou (info reçue à la connexion socket et/ou dans l'erreur), afficher un bandeau « Partie en cours » + bouton **Rejoindre**, désactiver créer/rejoindre/solo. Profil, stats et classement restent accessibles.
- Levée du verrou : partie terminée (`finished`) ou détruite. Après ça, tout redevient normal.
- Invités : verrou par `sessionId` de partie → contournable en vidant le localStorage. ASSUMÉ en V5.1, le noter en commentaire, ne pas sur-ingénierer.

## Fichiers autorisés (FIX A)
`shared/events.ts` (contrat réseau — vigilance), `server/src/GameManager.ts`, `server/src/index.ts`, `client/src/GameContext.tsx`, `client/src/screens/Home.tsx`, `client/src/screens/Lobby.tsx`, `client/src/screens/Board.tsx` (bouton quitter uniquement), CSS associés. RIEN d'autre (pas de `views.ts`, pas d'auth, pas de BDD).

## Definition of done (FIX A) — preuves exigées
- Deux onglets même compte : le 2e join → rattaché au MÊME siège, jamais 2 sièges. Idem invité (même navigateur).
- Refresh en lobby → retour automatique au siège. Fermeture de l'onglet → siège libéré après ~15s, liste publique à jour, partie vide détruite.
- Quitter en lobby → siège libéré immédiatement, retour Home. Quitter en partie → Home verrouillé (bandeau + Rejoindre), bots jouent les tours, retour possible, verrou levé à la fin de la partie.
- Impossible de créer/rejoindre/solo avec un verrou actif (erreur typée testée).
- Le scénario absurde (4 sièges même personne) est IRREPRODUCTIBLE — le prouver en le tentant.
- Reconnexion en partie démarrée inchangée. Harnais 100% vert, build client OK.

---

# FIX B — Vérification d'email par code

## Préalable UTILISATEUR (pas l'agent)
Compte Google avec validation 2 étapes → générer un **mot de passe d'application** → renseigner dans `server/.env` ET dans Render :
```
SMTP_USER=adresse@gmail.com
SMTP_PASS=motdepasseapplication
```

## Phase 1 — Reconnaissance
1. État exact de `server/src/auth/routes.ts` (signatures, codes HTTP, zod) et du flow front register/login (`AuthContext`, `Login.tsx`, `Register.tsx`).
2. Comment ajouter une migration Drizzle dans ce repo (`db:generate` / `db:migrate`) — vérifier le workflow réel.
3. Combien de comptes existent déjà en BDD (SELECT count) — ils seront marqués vérifiés par la migration.

## Phase 2 — Specs

### Schéma (migration Drizzle)
```
users : + email_verified boolean NOT NULL DEFAULT false
        (la migration passe les comptes EXISTANTS à true — comptes de test de l'utilisateur)

email_verification_codes
  user_id      uuid PK, FK → users.id ON DELETE CASCADE   -- un seul code actif par user
  code_hash    text NOT NULL          -- SHA-256 hex du code à 6 chiffres, JAMAIS le code en clair
  expires_at   timestamptz NOT NULL   -- création + 15 minutes
  attempts     integer NOT NULL DEFAULT 0
  last_sent_at timestamptz NOT NULL
```

### Service mail — `server/src/mail/MailService.ts`
- Interface `MailService { sendVerificationCode(to: string, code: string): Promise<void> }`.
- Implémentation Nodemailer SMTP Gmail (`smtp.gmail.com:465`, secure, auth via `SMTP_USER`/`SMTP_PASS`). Dep : `nodemailer` (+ `@types/nodemailer`).
- **Mode dégradé** : si `SMTP_USER`/`SMTP_PASS` absents → implémentation console qui logge `[MAIL] code de vérification pour <email> : <code>` (dev local sans SMTP possible). Warning au boot.
- Le mail : sujet clair, le code en gros, mention de l'expiration 15 min. Texte simple, pas de HTML complexe.

### Flow et endpoints (modifs dans `server/src/auth/`)
- `POST /api/auth/register` : crée le compte `email_verified=false`, génère un code 6 chiffres via `crypto.randomInt(0, 1_000_000)` (paddé à 6), stocke le SHA-256 + expiration, envoie le mail. **Ne crée PAS de session, ne pose PAS de cookie.** → `201 { requiresVerification: true }`. L'envoi de mail qui échoue ne doit pas laisser un compte inutilisable : compte créé quand même, l'utilisateur passera par resend.
- `POST /api/auth/verify-email` `{ email, code }` :
  - code correct et non expiré → `email_verified=true`, suppression de la ligne code, **création de session + cookie** → `200 { user }` (l'utilisateur est connecté directement, pas de re-login).
  - sinon → `attempts + 1` ; à 5 tentatives le code est invalidé (suppression) ; réponse `400` message générique « Code invalide ou expiré » (ne pas distinguer les cas).
- `POST /api/auth/resend-code` `{ email }` : répond **TOUJOURS `204`**, que l'email existe, soit déjà vérifié ou non (anti-énumération). Si user non vérifié ET `last_sent_at` > 60 s → nouveau code (remplace l'ancien), nouvel envoi. Rate limit dédié en plus (ex. 5 req / 15 min / IP).
- `POST /api/auth/login` : mot de passe OK mais `email_verified=false` → `403 { code: "EMAIL_NOT_VERIFIED" }`, pas de session. Mot de passe FAUX sur compte non vérifié → le 401 générique habituel (ne pas révéler l'état du compte à qui n'a pas le mot de passe).
- `GET /api/auth/me` et `toPublicUser` : inchangés (une session n'existe que pour un compte vérifié, par construction).

### Front (`client/src/`)
- Nouvel écran `screens/VerifyEmail.tsx` : email pré-rempli (non éditable), champ code 6 chiffres, bouton Valider, bouton « Renvoyer le code » avec compte à rebours 60 s, gestion des erreurs (400 générique, expiration).
- `Register` → succès → bascule sur `VerifyEmail`. `Login` → `403 EMAIL_NOT_VERIFIED` → bascule sur `VerifyEmail` (avec l'email saisi) + message explicatif.
- `verify-email` réussi → l'utilisateur est connecté (le cookie est posé) → retour `Home` état connecté.
- `api.ts` : appels `verifyEmail`, `resendCode` typés.

## Fichiers autorisés (FIX B)
`server/src/db/schema.ts` + migration générée, `server/src/auth/routes.ts`, `server/src/auth/sessions.ts` (si besoin — justifier), `server/src/mail/*` (NOUVEAU), `server/src/index.ts` (branchements minimes), `server/package.json` (nodemailer), `server/.env.example` ; `client/src/api.ts`, `client/src/AuthContext.tsx`, `client/src/screens/VerifyEmail.tsx` (NOUVEAU), `Login.tsx`, `Register.tsx`, `App.tsx`, CSS écrans. RIEN côté jeu (`GameManager`, `events.ts`, `views.ts`, écrans de jeu).

## Definition of done (FIX B) — preuves exigées
- Register → mail reçu (ou code loggé en mode dégradé) → verify → connecté (cookie) → refresh conserve la session. Trace HTTP réelle dans le récap.
- Code faux ×5 → code invalidé → resend obligatoire. Code expiré → 400 générique.
- Resend : 204 systématique (y compris email inexistant — testé), cooldown 60 s effectif.
- Login non vérifié → 403 `EMAIL_NOT_VERIFIED` → écran de vérification. Login mauvais mot de passe → 401 générique inchangé.
- SELECT sur `email_verification_codes` montrant `code_hash` (pas de code en clair) ; grep des logs : aucun code en clair loggé hors mode dégradé.
- Comptes préexistants toujours fonctionnels (migration → `email_verified=true`).
- Harnais 100% vert, build client OK.

---

## Ordre d'exécution
1. **Commit de l'état actuel** (si pas déjà fait) — jamais de fix sur un working tree sale.
2. FIX A → récap → validation orchestrateur → commit `fix(v5.1): identité unique par partie, quitter, verrou partie en cours`.
3. FIX B → récap → validation → commit `feat(v5.1): vérification email par code (SMTP + mode dégradé)`.
4. Push → rebuild Render (ajouter `SMTP_USER`/`SMTP_PASS` dans Render AVANT le push du FIX B).
