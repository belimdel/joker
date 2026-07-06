# Joker V5 — Résultat des modifications

## LOT 1 — Infrastructure BDD

| Fichier | Action |
|---------|--------|
| `server/src/db/schema.ts` | CRÉÉ — schéma Drizzle : tables `users`, `sessions`, `games`, `game_players` |
| `server/src/db/client.ts` | CRÉÉ — singleton `db` (Pool pg + Drizzle) ; retourne `null` sans `DATABASE_URL` (mode dégradé) |
| `server/src/db/migrations/0000_brief_forgotten_one.sql` | CRÉÉ — migration SQL appliquée sur Neon |
| `server/drizzle.config.ts` | CRÉÉ — config Drizzle Kit |
| `server/.env.example` | CRÉÉ — template sans secrets |
| `.gitignore` | CRÉÉ — protège `.env`, `node_modules/`, `dist/` |
| `server/package.json` | MODIFIÉ — ajout deps : `drizzle-orm`, `pg`, `dotenv`, `@node-rs/argon2`, `zod`, `cookie-parser`, `express-rate-limit`, `cookie` ; devDeps : `drizzle-kit`, `@types/pg`, `@types/cookie-parser` ; scripts `db:generate` / `db:migrate` |
| `server/src/index.ts` | MODIFIÉ — ajout `import 'dotenv/config'` en tête |

---

## LOT 2 — Auth back

| Fichier | Action |
|---------|--------|
| `server/src/auth/passwords.ts` | CRÉÉ — `hashPassword` / `verifyPassword` via argon2id (`@node-rs/argon2`) |
| `server/src/auth/sessions.ts` | CRÉÉ — `createSession`, `resolveSession`, `destroySession`, `getUserById`, `pruneExpiredSessions` ; token 32 bytes base64url, stocké SHA-256 ; cookie `jk_session` 30 jours |
| `server/src/auth/routes.ts` | CRÉÉ — `POST /register` (201), `POST /login` (200), `POST /logout` (204), `GET /me` (200) ; rate limit 10 req/15 min ; mapper `toPublicUser` (jamais `password_hash`) |
| `server/src/auth/socketAuth.ts` | CRÉÉ — middleware `io.use()` qui parse `jk_session`, résout la session, pose `socket.data.userId` (`null` = invité) |
| `server/src/index.ts` | MODIFIÉ — `cookieParser()`, `express.json()`, montage `/api/auth`, `applySocketAuth(io)`, type `SocketData` |

---

## LOT 3 — Auth front

| Fichier | Action |
|---------|--------|
| `client/src/api.ts` | CRÉÉ — helper `apiFetch` avec `credentials: 'include'` ; type `PublicUser` ; appels `me`, `login`, `register`, `logout` |
| `client/src/AuthContext.tsx` | CRÉÉ — `AuthProvider` : boot via `GET /me`, états `user`, `authLoading`, `authView` (`login`\|`register`\|`null`), `showLogin`, `showRegister`, `logout` |
| `client/src/screens/Login.tsx` | CRÉÉ — formulaire connexion avec gestion d'erreurs et lien "Continuer en invité" |
| `client/src/screens/Register.tsx` | CRÉÉ — formulaire inscription (email, username 3-20 chars, password ≥8) |
| `client/src/App.tsx` | MODIFIÉ — enrobage `AuthProvider`, routing `authView` → `Login` / `Register` |
| `client/src/screens/Home.tsx` | MODIFIÉ — bandeau auth (connecté → pseudo + niveau + déconnexion ; invité → liens) |
| `client/src/screens/screens.css` | MODIFIÉ — styles `.jk-auth-bar`, `.jk-btn--sm`, `.jk-auth__title` |

---

## LOT 4 — Lobby global (parties publiques/privées)

| Fichier | Action |
|---------|--------|
| `shared/events.ts` | MODIFIÉ — `CreateGamePayload` + champ `visibility` ; type `PublicGameSummary` ; événement `listGames` (C→S) ; événement `publicGamesUpdate` (S→C) ; `playerLevels` dans `LobbyUpdatePayload` |
| `server/src/GameManager.ts` | MODIFIÉ — `NetworkPlayer` + champs `userId`, `level` ; `NetworkGame` + champs `visibility`, `ranked`, `startedAt`, `createdAt`, `alreadyPersisted` ; méthode `listPublicGames()` ; `createGame`/`joinGame`/`addBotPlayers` mis à jour |
| `server/src/index.ts` | MODIFIÉ — handlers `createGame`/`joinGame`/`startTestGame` async (resolveUsername + resolveUserLevel) ; handler `listGames` ; `broadcastPublicGames()` ; `lobbyPayload()` inclut `playerLevels` ; `broadcastViews()` passe les niveaux ; disconnect → broadcast |
| `client/src/GameContext.tsx` | MODIFIÉ — état `publicGames`, listener `publicGamesUpdate`, émission `listGames` à la connexion, `createGame` accepte `visibility` |
| `client/src/screens/Home.tsx` | MODIFIÉ — toggle visibilité (publique/privée), liste des parties publiques joignables en un clic, props navigation |
| `client/src/screens/screens.css` | MODIFIÉ — styles `.jk-toggle-group`, `.jk-public-game-row`, `.jk-home__links` |
| `client/vite.config.ts` | MODIFIÉ — proxy dev `/api` → `:3001` et `/socket.io` → `:3001` (ws) |

---

## LOT 5 — Persistance des résultats

| Fichier | Action |
|---------|--------|
| `shared/progression.ts` | CRÉÉ — fonctions pures : `xpForGame`, `xpRequiredForLevel`, `levelForXp`, `xpProgress`, `rankingPointsForPosition`, `computeFinalPositions` (gestion ex æquo 1,1,3,4) |
| `shared/progression.test.ts` | CRÉÉ — 29 assertions (niveaux, XP, positions, points) |
| `server/src/persistence/gameResults.ts` | CRÉÉ — `saveGameResult(db, game, state)` : INSERT `games` + 4 lignes `game_players`, UPDATE `xp` des joueurs authentifiés ; guard `alreadyPersisted` ; résilience `try/catch` |
| `server/src/index.ts` | MODIFIÉ — import `saveGameResult` ; helper `persistIfFinished()` appelé après chaque `submitCard` (humain) et auto-jeu (timer) |

---

## LOT 6 — Stats & classement

| Fichier | Action |
|---------|--------|
| `server/src/stats/routes.ts` | CRÉÉ — `GET /api/users/:username/stats` (stats ranked : parties, victoires, contrats, xishts, position moyenne) ; `GET /api/leaderboard` (top 50 du mois courant UTC, ranked uniquement, rang ex æquo) |
| `server/src/index.ts` | MODIFIÉ — montage `statsRouter` sous `/api` |
| `client/src/api.ts` | MODIFIÉ — types `UserStats`, `LeaderboardEntry`, `LeaderboardResponse` ; appels `userStats(username)`, `leaderboard()` ; gestion erreur réseau (`try/catch` autour de `fetch`) |
| `client/src/screens/Profile.tsx` | CRÉÉ — profil joueur : barre XP, grille 8 stats, bouton vers classement |
| `client/src/screens/Leaderboard.tsx` | CRÉÉ — top 50 mensuel, cliquable → profil ; médailles or/argent/bronze top 3 |
| `client/src/App.tsx` | MODIFIÉ — navigation `home`/`profile`/`leaderboard` (état local `nav` + `profileUsername`) |
| `client/src/screens/screens.css` | MODIFIÉ — styles profil (`.jk-profile`, `.jk-xp-bar`, `.jk-stats-grid`) et classement (`.jk-leaderboard`, `.jk-lb-row`, rangs colorés) |

---

## LOT 7 — Niveaux en jeu

| Fichier | Action |
|---------|--------|
| `shared/views.ts` | MODIFIÉ — `PlayerView` + champ `playerLevels: (number | null)[]` ; `buildPlayerView` accepte `playerLevels` en 4e paramètre (défaut `[]`) |
| `server/src/GameManager.ts` | MODIFIÉ — `NetworkPlayer` + champ `level: number | null` |
| `server/src/index.ts` | MODIFIÉ — helper `resolveUserLevel(userId)` (lit XP en BDD, calcule niveau, null si erreur) ; `lobbyPayload()` inclut `playerLevels` ; `broadcastViews()` construit et passe le tableau de niveaux |
| `client/src/components/PlayerSeat.tsx` | MODIFIÉ — prop `level?: number | null` ; affiche `niv.X` à côté du pseudo si non null |
| `client/src/screens/Lobby.tsx` | MODIFIÉ — affiche `niv.X` sur chaque siège occupé |
| `client/src/screens/Board.tsx` | MODIFIÉ — `seatProps()` passe `level` depuis `view.playerLevels` |
| `client/src/screens/board.css` | MODIFIÉ — style `.jk-pseat__level` |
| `client/src/screens/screens.css` | MODIFIÉ — style `.jk-seat__level` |

---

## Corrections post-intégration

| Fichier | Fix |
|---------|-----|
| `server/src/auth/routes.ts` | Ajout `try/catch` sur `register` et `login` → retourne JSON 500 au lieu d'une page HTML Express |
| `client/src/api.ts` | `try/catch` autour de `fetch` → retourne `"Impossible de joindre le serveur."` au lieu d'un crash silencieux |
| `client/src/GameContext.tsx` | Fix race condition : si le socket est déjà connecté avant que `useEffect` enregistre `onConnect`, on resynchronise `connected = true` immédiatement |

---

## Résultat des tests

```
13 fichier(s) — 13 OK, 0 en échec.
✅ bidding · bot · buildPlayerView · cards · deal · game
✅ integration · progression (29 assertions) · round.joker
✅ round · scoring · trick.joker · trick
```

Build client : `vite build` — OK (271 kB JS gzippé 82 kB).
