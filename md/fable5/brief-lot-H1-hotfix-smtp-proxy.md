# LOT H1 — Hotfix prod : SMTP IPv4, trust proxy, envoi email non bloquant

> Brief pour agent Claude VS Code. Projet Joker. Poste Windows : `npm.cmd`.
> Contexte : V5.1 déployée sur Render. Trois problèmes constatés en prod, logs à l'appui :
> 1. `connect ENETUNREACH 2607:f8b0:...:465` — Nodemailer tente Gmail en IPv6, non routé sur Render → envoi de mail échoue (timeout ou ENETUNREACH).
> 2. `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` — express-rate-limit derrière le proxy Render sans `trust proxy` → rate limiting cassé (tous les clients partagent l'IP du proxy).
> 3. La route d'inscription attend la fin de l'envoi SMTP avant de répondre → en cas de timeout SMTP, le client reste figé sans réponse HTTP.

## Règles (rappel non négociable)
- Reconnaissance avant écriture : lire l'état réel des fichiers avant de modifier.
- Périmètre strict : fichiers autorisés uniquement. Tout écart = à signaler en ROUGE.
- Aucun self-commit, aucun push. Récap avec PREUVES réelles.
- TS strict, zéro `any`. Commentaires FR, identifiants EN.
- Ne PAS toucher : `shared/` (aucun fichier), `client/` (aucun fichier), `GameManager.ts`, `views.ts`, `events.ts`, schéma BDD.

## Fichiers autorisés
- `server/src/mail/MailService.ts`
- `server/src/index.ts` (uniquement l'ajout `trust proxy`)
- `server/src/auth/routes.ts` (uniquement le flux d'envoi du code : register + resend)

## Modifications demandées

### 1. MailService — forcer IPv4 + timeouts courts
Dans la config du transport Nodemailer, ajouter :
- `family: 4` (force la résolution DNS en IPv4 — le réseau Render ne route pas l'IPv6)
- Timeouts explicites et courts : `connectionTimeout: 5000`, `greetingTimeout: 5000`, `socketTimeout: 10000` (valeurs en ms ; les défauts Nodemailer sont de 2 minutes, inacceptable dans un flux HTTP)
Conserver le mode dégradé existant (code loggé si SMTP non configuré) et le port/`secure` actuels s'ils sont déjà sur 465/`secure: true` (vérifier et confirmer dans le récap).

### 2. index.ts — trust proxy
Ajouter `app.set('trust proxy', 1);` immédiatement après la création de l'app Express, AVANT le montage de tout middleware (rate limit compris).
- Exactement `1` (un seul saut : le proxy Render). PAS `true` (permettrait de forger X-Forwarded-For et de contourner le rate limiting).
- Commentaire FR expliquant le pourquoi (proxy Render, rate limit par vraie IP client, cookie `secure` derrière proxy).

### 3. routes.ts — l'envoi d'email ne bloque plus la réponse HTTP
Pour register ET resend :
- L'écriture BDD (utilisateur / code de vérification) reste synchrone et conditionne la réponse.
- L'envoi du mail est déclenché SANS `await` bloquant la réponse (fire-and-forget avec `.catch()` de log, OU `await` mais alors la réponse doit partir avant — préférer le premier). Les timeouts du §1 bornent de toute façon la durée.
- En cas d'échec d'envoi : log serveur explicite (déjà en place : « Envoi du code échoué ») — la réponse HTTP reste un succès, car l'utilisateur dispose du bouton « renvoyer le code ». NE PAS révéler l'échec SMTP dans la réponse (anti-énumération : la réponse doit rester identique).
- Vérifier qu'aucune promesse rejetée non catchée ne peut faire crasher le process (`unhandledRejection`).

## Contraintes de vérification (preuves exigées au récap)
1. `npx tsx shared/run-all-tests.ts` → sortie réelle (doit rester 13/13).
2. `npx tsx server/src/auth/emailVerification.test.ts` → sortie réelle (PGlite, doit rester vert).
3. `npx tsx server/src/GameManager.fixA.test.ts` → sortie réelle.
4. Test manuel local : serveur lancé SANS variables SMTP → register → la réponse HTTP revient immédiatement (mesurer/constater), code loggé en console (mode dégradé intact). Fournir la trace.
5. Montrer le diff exact des trois fichiers.

## Récap attendu (format standard)
1. Fichiers modifiés (exhaustif).
2. Point par point vs les 3 modifications demandées.
3. Sorties réelles des tests + trace du test manuel §4.
4. Décisions/écarts justifiés.
5. Vigilances (ex. comportement si SMTP configuré mais Gmail rejette EAUTH).

Commit (par l'utilisateur après validation orchestrateur) :
`fix(prod): smtp ipv4 + trust proxy + envoi email non bloquant`
