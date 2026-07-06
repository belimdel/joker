# LOT R1 — Reconnaissance pré-commit V5.1 (LECTURE SEULE)

> Brief pour agent Claude VS Code. Projet Joker (monorepo `Joker/` : `shared/`, `server/`, `client/`).
> Contexte : les fixes V5.1 (FIX A : identité unique par partie / FIX B : vérification email par code) sont codés et validés fonctionnellement, mais **rien n'est committé**. Avant de committer, on doit établir l'état RÉEL du working tree et répartir les fichiers entre deux commits ciblés.

## Rôle et interdictions absolues

Tu es un agent de **reconnaissance en lecture seule**. Tu ne modifies RIEN.

- ❌ INTERDIT : `git add`, `git commit`, `git push`, `git stash`, toute écriture/modification/suppression de fichier, toute installation de dépendance.
- ❌ INTERDIT : afficher ou copier le CONTENU de `server/.env` dans ton récap (il contient des secrets). Tu peux seulement constater son existence et son statut Git.
- ✅ AUTORISÉ : commandes de lecture (`git status`, `git log`, `git diff`, `git ls-files`, `git check-ignore`, lecture de fichiers hors `.env`), exécution des tests et du build.
- Poste Windows : utiliser `npm.cmd`.

## Mission

### 1. État Git brut
- `git status --porcelain` (sortie complète, brute)
- `git log --oneline -10`
- `git diff --stat` (fichiers trackés modifiés)

### 2. Classification des fichiers
Classer CHAQUE fichier modifié ou non tracké dans une de ces catégories :
- **FIX A** (identité unique par partie) : attendus autour de `server/src/GameManager.ts`, `server/src/index.ts`, `server/src/GameManager.fixA.test.ts`, côté client les écrans/context touchés par `leaveGame`/`resumeGame`/verrou `ACTIVE_GAME` (bandeau Rejoindre), éventuellement `shared/events.ts` si le code `ACTIVE_GAME` y a été ajouté.
- **FIX B** (vérification email) : attendus autour de `server/src/auth/`, `server/src/mail/`, `server/src/db/` (schéma + migration `email_verification_codes` / `email_verified`), `server/src/auth/emailVerification.test.ts`, côté client `screens/VerifyEmail.tsx` + navigation, `package.json`/`package-lock.json` serveur si devDep ajoutée (PGlite, nodemailer).
- **COMMUN / AMBIGU** : fichier touché par les deux fixes (ex. `index.ts`, `App.tsx`) → le signaler explicitement avec ce que chaque fix y a changé (via `git diff` du fichier).
- **🔴 INATTENDU** : tout fichier qui ne colle à aucun des deux fixes → signaler en rouge avec hypothèse d'origine. Ne rien décider à sa place, l'orchestrateur tranchera.

### 3. Contrôle secrets
- `git check-ignore -v server/.env` → prouver qu'il est ignoré.
- `git ls-files | findstr /i ".env"` → prouver qu'AUCUN `.env` réel n'est tracké (`.env.example` seul toléré).
- Vérifier que `server/.env.example` contient bien les clés `DATABASE_URL`, `SMTP_USER`, `SMTP_PASS` **sans valeurs réelles**. S'il manque une clé, le signaler (correction dans un lot suivant, pas par toi).
- Vérifier qu'aucun fichier à committer ne contient de secret en dur (recherche rapide de motifs : `postgresql://`, mots de passe, tokens).

### 4. Migrations Drizzle
- Lister les fichiers du dossier de migrations (`server/` — retrouver le chemin exact).
- Pour chaque migration : trackée/committée ou non trackée ? La migration `email_verified` / `email_verification_codes` doit partir avec le commit FIX B.

### 5. Preuves de santé
- `npx tsx shared/run-all-tests.ts` → sortie réelle complète (doit être 100 % vert).
- Tests serveur : `GameManager.fixA.test.ts` et `auth/emailVerification.test.ts` (retrouver la commande exacte dans `server/package.json` et l'exécuter) → sorties réelles.
- `npm.cmd run build` dans `client/` → sortie réelle.

## Livrable : récap md

1. **Sorties brutes** des commandes du §1 et §3 (statut Git, contrôles secrets).
2. **Tableau de classification** : fichier → catégorie (FIX A / FIX B / COMMUN / 🔴).
3. **Proposition de commandes** prêtes à l'emploi pour l'utilisateur :
   - Commit 1 : `git add <fichiers FIX A explicites>` puis `git commit -m "fix(v5.1): identite unique par partie, quitter, verrou partie en cours"`
   - Commit 2 : `git add <fichiers FIX B explicites>` puis `git commit -m "feat(v5.1): verification email par code (SMTP + mode degrade)"`
   - Jamais de `git add -A`, jamais de wildcard sur un dossier contenant de l'ambigu.
   - Pour les fichiers COMMUNS : proposer une répartition argumentée (ou signaler si un fichier doit partir dans les deux commits → impossible, donc proposer dans lequel il va et pourquoi).
4. **Résultats de tests/build** : sorties réelles, pas de "devrait passer".
5. **Points de vigilance** pour l'orchestrateur.

Rappel : tu ne commits pas, tu ne push pas. Ton récap sert à l'orchestrateur pour valider, puis l'utilisateur exécute les commandes lui-même.
