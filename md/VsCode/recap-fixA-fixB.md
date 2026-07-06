# 🃏 Joker V5.1 — Récap FIX A + FIX B (pour Fable 5)

> Rédigé par l'agent VsCode. **Rien n'a été committé ni poussé** (conforme au brief).
> Les deux lots sont implémentés, typés et **prouvés** (tests + traces réelles).
> Harnais `shared` : **13/13 OK**. Build client : **OK**. `GameManager.test.ts` existant : **62 ✅ / 0 FAIL**.

---

## 0. État en un coup d'œil

| Lot | Objet | Statut | Preuves |
|-----|-------|--------|---------|
| **FIX A** | Sièges fantômes, identité unique, quitter, verrou « partie en cours » | ✅ Terminé | e2e Socket.IO **12/12 OK** + tests unitaires |
| **FIX B** | Vérification d'email par code (SMTP + mode dégradé) | ✅ Codé & testé | intégration BDD (PGlite) + HTTP réel dégradé |

⚠️ **FIX B a 3 actions MANUELLES restantes** (Gmail, migration prod, Render) — voir §5.

---

# FIX A — Identité unique, quitter, verrou

## Cause des bugs (reconnaissance)
- **A1 (doublons de sièges)** : `joinGame` ne vérifiait **aucune identité** (ni `userId`, ni `sessionId`) → 2ᵉ onglet ou re-join après refresh = **nouveau siège**. Répétable jusqu'à 4 sièges pour la même personne.
- **A2 (« Quitter » inopérant)** : le bouton faisait `socket.disconnect()/connect()` → traité comme une déconnexion → grace period 15 s → le siège **restait**.
- **A3 (quitter une partie démarrée)** : n'existait pas.

## Ce qui a été fait
1. **Unicité d'identité** (`GameManager.joinGame`) : identité = `userId` si connecté, sinon `sessionId`. Si l'identité occupe déjà un siège → **rattachement** du socket au siège existant (même chemin que la reconnexion), **jamais** de doublon.
2. **`leaveGame`** (nouvel événement, serveur autoritaire) :
   - en **lobby** → libère le siège immédiatement ; partie vide → détruite ;
   - en **partie démarrée** → **garde le siège** (les bots de timeout jouent), marque le joueur « parti » (`leftAt`), pose le verrou.
3. **`resumeGame`** (nouvel événement) : retour dans une partie démarrée quittée.
4. **Verrou « partie en cours »** (`activeGameFor`) : `createGame` / `joinGame` (autre partie) / `startTestGame` refusent avec l'erreur typée **`ACTIVE_GAME`** portant le `roomCode`. Verrou levé quand la partie se termine.
5. **Client** : bandeau « Partie en cours » + bouton **Rejoindre** sur l'accueil, création/join/solo désactivés sous verrou, confirmation avant de quitter une partie démarrée.

## Fichiers modifiés (FIX A)
- `shared/events.ts` — `leaveGame`, `resumeGame` (C→S) ; `activeGameUpdate` (S→C) ; code d'erreur `ACTIVE_GAME` ; `roomCode?` sur `GameErrorPayload` ; type `ActiveGamePayload`. *(Aucune donnée privée : juste un roomCode que le joueur possède déjà.)*
- `server/src/GameManager.ts` — champ `leftAt`, rattachement d'identité, `activeGameFor`, `leaveGame`, `resumeBySession`, `findSeatByIdentity`, garde `finishedNotified`.
- `server/src/index.ts` — gardes de verrou, handlers `leaveGame`/`resumeGame`, branche « joueur parti » à la reconnexion, `broadcastViews` ignore les partis, `notifyLockLifted` en fin de partie.
- `client/src/GameContext.tsx`, `screens/Home.tsx`, `screens/Lobby.tsx`, `screens/Board.tsx`, `index.css`.

## Preuves (e2e Socket.IO contre serveur live — 12/12 OK)
- 4 joins même sessionId → **players = 1** (scénario absurde irreproductible).
- Refresh en lobby → `sessionRestored` même code, siège 0, **players = 1**.
- Verrou : create/join/solo → **`ACTIVE_GAME`** avec `roomCode`.
- Quitter partie démarrée → `activeGameUpdate {roomCode}`, puis `resumeGame` → vue de jeu.
- Quitter en lobby → siège libéré immédiat (2 → 1).

---

# FIX B — Vérification d'email par code

## Comportement livré
- **register** : crée le compte `email_verified = false`, génère un code à 6 chiffres (`crypto.randomInt`), stocke **uniquement son SHA-256**, envoie le mail. **Pas de session / pas de cookie.** → `201 { requiresVerification: true }`. Un échec d'envoi ne bloque pas le compte (resend possible).
- **verify-email** `{ email, code }` : bon code non expiré → `email_verified = true`, code supprimé, **session + cookie créés** (connexion directe) → `200 { user }`. Sinon `attempts + 1` ; à **5** tentatives ou expiration → code invalidé → `400` message **générique**.
- **resend-code** `{ email }` : **toujours `204`** (anti-énumération). Nouveau code seulement si non vérifié **et** dernier envoi > 60 s. Rate-limit dédié 5/15 min/IP.
- **login** : mot de passe OK mais non vérifié → `403 { code: "EMAIL_NOT_VERIFIED" }` ; mauvais mot de passe → `401` générique (on ne révèle pas l'état du compte).
- **Front** : nouvel écran `VerifyEmail` (email pré-rempli, champ code, « Renvoyer » avec compte à rebours 60 s). Register → bascule sur VerifyEmail ; Login `403` → bascule sur VerifyEmail.
- **MailService** : Nodemailer Gmail (`smtp.gmail.com:465`, secure) ; **mode dégradé** sans `SMTP_USER/SMTP_PASS` → le code est **loggé en console** (`[MAIL] …`) + warning au boot.

## Schéma / migration
- `users` : `+ email_verified boolean NOT NULL DEFAULT false`.
- Nouvelle table `email_verification_codes` (`user_id` PK → 1 code actif/user, `code_hash`, `expires_at`, `attempts`, `last_sent_at`).
- Migration `0001_sturdy_king_cobra.sql` **générée puis éditée** pour ajouter :
  `UPDATE "users" SET "email_verified" = true;` → **les comptes existants (tests) restent utilisables.**

## Fichiers (FIX B)
- `server/src/db/schema.ts` (+ colonne + table).
- `server/src/db/migrations/0001_sturdy_king_cobra.sql` (+ `meta/0001_snapshot.json`, `meta/_journal.json`).
- `server/src/mail/MailService.ts` (NOUVEAU).
- `server/src/auth/routes.ts` (register/verify-email/resend-code/login).
- `server/.env.example`, `server/package.json` (nodemailer).
- `client/src/api.ts`, `AuthContext.tsx`, `screens/VerifyEmail.tsx` (NOUVEAU), `App.tsx`.

## Preuves
- **Intégration BDD** (PGlite = vrai Postgres éphémère, **vraies** migrations 0000+0001, vrai schéma Drizzle) : compte existant → `true` ; nouveau → `false` ; **SELECT `code_hash` = SHA-256 64 hex ≠ code** (aucun clair) ; 5 tentatives → code supprimé ; bon code → vérifié + supprimé ; expiration rejetée ; cooldown 60 s ; login non vérifié détecté. **Tout vert.**
- **HTTP réel (mode dégradé)** : `resend-code → 204`, `register/verify-email → 503` (pas de crash).
- **MailService dégradé** : `[MAIL] code de vérification pour demo@test.io : 424242`.
- ❌ **Non joué** : happy-path HTTP complet (201 → verify 200 + cookie) contre une BDD migrée — pas de Postgres local, et **la BDD Neon de prod n'a volontairement pas été modifiée**. Voir §5.

---

## 4. Fichiers hors périmètre (à valider par l'orchestrateur) 🟡

| Fichier | Raison | Impact |
|---------|--------|--------|
| `server/src/GameManager.fixA.test.ts` | Non-régression + preuve FIX A | Test seul, 0 runtime |
| `server/src/auth/emailVerification.test.ts` | Preuve migration + logique BDD (PGlite) | Test seul, 0 runtime |
| devDep `@electric-sql/pglite` | Postgres éphémère pour tester **sans** toucher la prod | devDependencies uniquement |

Si tu veux un périmètre strict, ces 3 éléments peuvent être retirés sans rien casser.

---

## 5. ⚠️ Actions MANUELLES restantes (utilisateur) — FIX B

Le code est prêt ; il manque la config d'environnement (non committable) :

1. **Gmail** — créer un *mot de passe d'application* (compte Google avec validation 2 étapes → https://myaccount.google.com/apppasswords).
2. **Local (test)** — dans `server/.env` :
   ```
   SMTP_USER=adresse@gmail.com
   SMTP_PASS=motdepasseapplication16lettres
   ```
   puis `cd server && npm.cmd run db:migrate && npm.cmd run dev`.
   *(Sans SMTP → mode dégradé : le code s'affiche dans le terminal.)*
3. **Base Neon (prod)** — `cd server && npm.cmd run db:migrate` (indispensable, sinon plantage : colonne `email_verified` absente).
4. **Render** — ajouter `SMTP_USER` et `SMTP_PASS` **AVANT** de pousser FIX B.

### ⚠️ Incident maîtrisé
Le `.env` local pointe vers le **Neon de prod**. Un premier essai HTTP s'y est connecté, mais **aucune écriture** n'a eu lieu (toutes les requêtes ont échoué sur `column "email_verified" does not exist`). Serveur coupé aussitôt, tests refaits en mode dégradé.

---

## 6. Commits suggérés (à faire après validation)
```
fix(v5.1): identite unique par partie, quitter, verrou partie en cours
feat(v5.1): verification email par code (SMTP + mode degrade)
```
Ordre : FIX A puis FIX B (les deux touchent `server/src/index.ts` — jamais en parallèle).

## 7. Points de vigilance
- Verrou invité = par `sessionId` de partie, contournable en vidant le localStorage → **assumé V5.1** (commenté).
- Fuite mémoire **pré-existante** non aggravée : une partie terminée subsiste en mémoire jusqu'à se vider ; le verrou l'exclut correctement (`state.phase === 'finished'`). À traiter dans un futur lot « cycle de vie » si souhaité.
