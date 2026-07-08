import 'dotenv/config';
import express from "express";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { Server } from "socket.io";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import mime from "mime";
import { GameManager, GameManagerError, NetworkGame } from "./GameManager";
import { submitBid, submitCard } from "../../shared/game";
import { buildPlayerView } from "../../shared/views";
import { TURN_DURATION_MS, chooseTrump } from "../../shared/round";
import { pickAutoBid, pickAutoCard, pickAutoTrumpChoice } from "../../shared/bot";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  LobbyUpdatePayload,
  GameErrorPayload,
} from "../../shared/events";
import { authRouter } from "./auth/routes.js";
import { statsRouter } from "./stats/routes.js";
import { applySocketAuth } from "./auth/socketAuth.js";
import { getUserById } from "./auth/sessions.js";
import { levelForXp } from "../../shared/progression.js";
import { db } from "./db/client.js";
import { saveGameResult } from "./persistence/gameResults.js";

// Données attachées à chaque socket (posées par le middleware socketAuth).
type SocketData = {
  userId: string | null;
};

const app = express();
// Derrière le proxy Render : faire confiance à EXACTEMENT un saut, pour que
// express-rate-limit lise la vraie IP client dans X-Forwarded-For (sinon tous
// les clients partagent l'IP du proxy) et que les cookies `secure` marchent
// derrière le proxy TLS. Surtout PAS `true` : un client pourrait alors forger
// X-Forwarded-For et contourner le rate limiting.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Socket.IO a besoin d'un serveur HTTP "brut" pour s'y attacher.
const httpServer = createServer(app);

// Serveur Socket.IO TYPÉ : les événements client→serveur et serveur→client
// sont contraints par le contrat partagé (shared/events.ts). Attaché à
// httpServer AVANT le fallback SPA, sinon ce dernier intercepte /socket.io/.
const allowedOrigin =
  process.env.CLIENT_URL || "http://localhost:5173";

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  {
    cors: {
      origin: allowedOrigin,
      credentials: true,
      methods: ["GET", "POST"],
    },
  }
);

// Middleware Socket.IO : identité depuis le cookie jk_session.
applySocketAuth(io);

// Routes REST sous /api
app.use('/api/auth', authRouter);
app.use('/api', statsRouter);

// Le gestionnaire de parties vit pour toute la durée du process.
const manager = new GameManager();

// ─── Helpers de diffusion ────────────────────────────────────────

// Résout le pseudo d'un socket : si connecté → username BDD ; sinon → fallback.
async function resolveUsername(userId: string | null, fallbackPseudo: string): Promise<string> {
  if (!userId) return fallbackPseudo;
  const user = await getUserById(userId).catch(() => null);
  return user?.username ?? fallbackPseudo;
}

// Résout le niveau d'un joueur depuis la BDD (une seule requête au join).
// Retourne null si pas d'userId, si la BDD est down, ou en cas d'erreur.
async function resolveUserLevel(userId: string | null): Promise<number | null> {
  if (!userId) return null;
  const user = await getUserById(userId).catch(() => null);
  if (!user) return null;
  return levelForXp(user.xp);
}

// Diffuse la liste des parties publiques aux visiteurs du lobby.
function broadcastPublicGames(): void {
  io.to('lobby-browser').emit('publicGamesUpdate', { games: manager.listPublicGames() });
}

// Payload de présence (vue publique de la room).
function lobbyPayload(game: NetworkGame): LobbyUpdatePayload {
  const levels: (number | null)[] = [null, null, null, null];
  for (const p of game.players) {
    if (p.seat >= 0 && p.seat < 4) levels[p.seat] = p.level;
  }
  return {
    gameId: game.gameId,
    status: game.status,
    players: manager.publicPlayers(game),
    playerLevels: levels,
    mode: game.config.mode,
    khishtiPenalty: game.config.khishtiPenalty,
    ranked: game.rankedRequested,
    pairs: game.config.pairs === true,
  };
}

// SÉCURITÉ : diffusion CIBLÉE. Chaque joueur reçoit SA PlayerView (sa
// main en clair, les autres en simple compte) via un emit personnalisé
// par socket — surtout PAS un broadcast unique avec le même payload.
// Les sièges bots (mode solo de test) n'ont pas de socket réel : on les
// ignore, leur émettre ne joindrait aucune room.
function broadcastViews(game: NetworkGame): void {
  if (!game.state) return;
  const levels: (number | null)[] = [null, null, null, null];
  for (const p of game.players) {
    if (p.seat >= 0 && p.seat < 4) levels[p.seat] = p.level;
  }
  for (const player of game.players) {
    // Les bots n'ont pas de socket ; les joueurs "partis" (leaveGame en cours
    // de partie) sont à l'accueil et ne doivent pas recevoir de vue de jeu.
    if (player.isBot || player.leftAt !== null) continue;
    const view = buildPlayerView(game.state, player.seat, game.turnStartedAt, levels);
    io.to(player.socketId).emit("gameStateUpdate", view);
  }
}

// Notifie les joueurs "partis" (leaveGame en cours de partie) que le verrou
// « partie en cours » tombe : la partie vient de se terminer. Emit ciblé.
function notifyLockLifted(game: NetworkGame): void {
  for (const p of game.players) {
    if (p.isBot || p.leftAt === null) continue;
    io.to(p.socketId).emit("activeGameUpdate", { roomCode: null });
  }
}

// Délai d'auto-jeu pour un siège bot (mode solo de test) : on veut une
// partie rapide à observer, pas un timeout pensé pour couvrir un humain
// déconnecté.
const BOT_TURN_DELAY_MS = 800;

// En partie SOLO DE TEST (la table contient des bots), le siège humain
// joue aussi vite : la partie défile pour voir comment elle se termine.
// Un peu plus long que les bots pour laisser l'animation du pli se jouer
// et permettre un clic manuel si on le souhaite. Ne s'applique JAMAIS à
// une vraie partie multijoueur (aucun siège isBot) : là le délai humain
// reste TURN_DURATION_MS (15s).
const SOLO_HUMAN_TURN_DELAY_MS = 1500;

// ─── Timer de tour (15s, ou 800ms pour un siège bot) + auto-jeu ──
// Le serveur fait autorité sur le temps : à chaque changement de
// currentPlayer, on (re)programme un timeout. S'il expire sans action
// humaine, on joue À LA PLACE du joueur via placeBid/playCard
// (shared/bot.ts choisit un coup LÉGAL, mêmes validations que pour un
// humain), puis on reprogramme le tour suivant.
function clearTurnTimer(game: NetworkGame): void {
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
    game.turnTimer = null;
  }
}

function scheduleTurnTimer(game: NetworkGame): void {
  clearTurnTimer(game);
  if (!game.state || game.state.phase === "finished") return;

  const seat = game.state.round.currentPlayer;
  const isBotTurn = game.players.find((p) => p.seat === seat)?.isBot ?? false;
  // La table contient-elle des bots ? ⇒ partie solo de test (cf. addBotPlayers) :
  // même en attendant l'humain, on accélère pour dérouler la partie.
  const isSoloTest = game.players.some((p) => p.isBot);
  const delay = isBotTurn
    ? BOT_TURN_DELAY_MS
    : isSoloTest
      ? SOLO_HUMAN_TURN_DELAY_MS
      : TURN_DURATION_MS;

  game.turnStartedAt = Date.now();
  game.turnTimer = setTimeout(() => {
    game.turnTimer = null;
    // La partie a pu être supprimée entre-temps (tous les joueurs
    // partis) : on arrête là, pas de reprogrammation infinie.
    if (!manager.getGame(game.gameId)) return;
    if (!game.state || game.state.phase === "finished") return;

    const round = game.state.round;
    const seat = round.currentPlayer;
    try {
      if (round.phase === "choosing-trump") {
        // Le décideur n'a pas choisi à temps : on PASSE pour lui (sans
        // atout), via le même chemin chooseTrump qu'un choix humain.
        game.state = { ...game.state, round: chooseTrump(round, seat, pickAutoTrumpChoice()) };
      } else if (round.phase === "bidding") {
        game.state = submitBid(game.state, seat, pickAutoBid(round));
      } else if (round.phase === "playing") {
        const { card, announce, declaredSuit } = pickAutoCard(round);
        game.state = submitCard(game.state, seat, card, announce, declaredSuit);
      }
    } catch (e) {
      console.error(
        `⏱️ Auto-jeu échoué (partie ${game.gameId}, siège ${seat}) :`,
        (e as Error).message
      );
    }

    persistIfFinished(game);
    scheduleTurnTimer(game);
    broadcastViews(game);
  }, delay);
}

// Persiste le résultat si la partie vient de se terminer (idempotent via alreadyPersisted).
function persistIfFinished(game: NetworkGame): void {
  if (!game.state || game.state.phase !== 'finished') return;
  // Le verrou « partie en cours » tombe dès la fin : prévenir une seule fois
  // les joueurs partis, indépendamment de la persistance BDD (mode dégradé).
  if (!game.finishedNotified) {
    game.finishedNotified = true;
    notifyLockLifted(game);
  }
  if (game.alreadyPersisted) return;
  if (!db) return; // mode dégradé sans BDD
  game.alreadyPersisted = true;
  saveGameResult(db, game, game.state).catch((e: unknown) => {
    console.error(`💾 Erreur persistance partie ${game.gameId} :`, (e as Error).message);
    // Ne pas reset alreadyPersisted : évite les tentatives répétées si la BDD est down.
  });
}

// Transforme une exception en gameError ciblé (jamais de crash serveur).
function toGameError(e: unknown): GameErrorPayload {
  if (e instanceof GameManagerError) {
    return { code: e.code, message: e.message };
  }
  // Les erreurs de la logique de jeu (round.ts/game.ts) → coup illégal.
  return { code: "ILLEGAL_MOVE", message: (e as Error).message };
}

// Identifiant de session envoyé par le client (persisté en localStorage,
// cf. client/src/socket.ts). Sert à reconnecter un socket qui revient après
// un refresh de page. Si absent/invalide, on en fabrique un nouveau : le
// client ne pourra simplement pas être reconnu en cas de refresh.
function sessionIdOf(socket: { handshake: { auth: Record<string, unknown> } }): string {
  const raw = socket.handshake.auth?.sessionId;
  return typeof raw === "string" && raw.length > 0 ? raw : randomUUID();
}

// Le sessionId fourni par le client (handshake.auth) était-il réellement
// présent ? Sert à distinguer une première visite (pas de sessionId : rien
// à signaler) d'une session orpheline (sessionId fourni mais inconnu).
function hasClientSessionId(socket: { handshake: { auth: Record<string, unknown> } }): boolean {
  const raw = socket.handshake.auth?.sessionId;
  return typeof raw === "string" && raw.length > 0;
}

io.on("connection", (socket) => {
  console.log(`✅ Connecté : ${socket.id}`);

  // ── Reconnexion silencieuse (refresh de page) ──
  // Avant tout autre traitement : si ce sessionId correspond à un joueur
  // en grace period, on le raccroche à sa partie/son siège et on lui
  // réémet son état, sans rien diffuser aux autres joueurs.
  const sessionId = sessionIdOf(socket);
  const reconnected = manager.reconnect(sessionId, socket.id, socket.data.userId ?? null);
  if (reconnected) {
    const { game, seat, pseudo } = reconnected;
    const player = game.players.find((p) => p.seat === seat);
    const finished = game.state?.phase === "finished";
    if (game.status === "in-progress" && !finished && player?.leftAt != null) {
      // Joueur "parti" d'une partie démarrée (leaveGame) qui recharge la page :
      // on ne le renvoie PAS sur le plateau. On lui rappelle simplement le
      // verrou (Home reste verrouillé avec le bouton Rejoindre).
      socket.emit("activeGameUpdate", { roomCode: game.gameId });
      console.log(`🔒 Reconnexion "parti" : "${pseudo}" → verrou ${game.gameId}`);
    } else {
      socket.join(game.gameId);
      socket.emit("sessionRestored", { gameId: game.gameId, seat, pseudo });
      // Toujours réémettre le lobby (même en partie en cours) : sans ça,
      // le client garde lobby=null après un refresh et pseudoOf() retombe
      // sur "Joueur N" pour tout le monde.
      socket.emit("lobbyUpdate", lobbyPayload(game));
      if (game.state) {
        const lvls: (number | null)[] = [null, null, null, null];
        for (const p of game.players) { if (p.seat >= 0 && p.seat < 4) lvls[p.seat] = p.level; }
        socket.emit("gameStateUpdate", buildPlayerView(game.state, seat, game.turnStartedAt, lvls));
      }
      console.log(`🔄 Reconnexion silencieuse : "${pseudo}" → ${game.gameId} (siège ${seat})`);
    }
  } else if (hasClientSessionId(socket)) {
    // Le client a fourni un sessionId, mais il ne correspond à aucune
    // partie connue (ex. redémarrage serveur, changement d'identité) : on
    // prévient le client qu'il doit revenir à l'accueil. Un nouveau
    // joueur sans sessionId ne déclenche jamais ce cas.
    socket.emit("sessionExpired");
    console.log(`⚠️ Session orpheline ignorée : ${sessionId}`);
  }

  // Rappel du verrou « partie en cours » par identité de COMPTE : un compte
  // qui se (re)connecte avec une session toute neuve (re-login, autre
  // appareil) retrouve le bandeau Rejoindre de sa partie démarrée. Les
  // invités, eux, ne sont reconnaissables que par sessionId (déjà couvert
  // par reconnect ci-dessus).
  if (!reconnected) {
    const active = manager.activeGameFor(socket.data.userId ?? null, sessionId);
    if (active) socket.emit("activeGameUpdate", { roomCode: active.gameId });
  }

  socket.emit("welcome", { message: "Connecté au serveur Joker !" });

  // ── Rejoindre la room lobby-browser (liste des parties publiques) ──
  socket.on("listGames", () => {
    socket.join('lobby-browser');
    socket.emit('publicGamesUpdate', { games: manager.listPublicGames() });
  });

  // ── Créer une partie ──
  socket.on("createGame", async ({ pseudo, visibility, mode, khishtiPenalty, ranked, pairs }) => {
    const userId = socket.data.userId ?? null;
    // Verrou : une seule partie démarrée en cours par identité.
    const active = manager.activeGameFor(userId, sessionId);
    if (active) {
      socket.emit("gameError", { code: "ACTIVE_GAME", message: `Vous avez déjà une partie en cours (${active.gameId}).`, roomCode: active.gameId });
      return;
    }
    const [name, level] = await Promise.all([
      resolveUsername(userId, (pseudo ?? "").trim()),
      resolveUserLevel(userId),
    ]);
    if (name.length === 0) {
      socket.emit("gameError", { code: "INVALID_PAYLOAD", message: "Pseudo manquant." });
      return;
    }
    const vis = visibility === 'private' ? 'private' : 'public';
    // Les options sont validées/normalisées par sanitizeRoomOptions (manager).
    const game = manager.createGame(
      name, socket.id, sessionId, userId,
      { visibility: vis, mode, khishtiPenalty, ranked, pairs },
      level,
    );
    socket.leave('lobby-browser');
    socket.join(game.gameId);
    socket.emit("gameCreated", { gameId: game.gameId, seat: 0 });
    io.to(game.gameId).emit("lobbyUpdate", lobbyPayload(game));
    if (vis === 'public') broadcastPublicGames();
    console.log(`🎲 Partie ${vis} créée ${game.gameId} par "${name}"`);
  });

  // ── Rejoindre une partie ──
  socket.on("joinGame", async ({ gameId, pseudo }) => {
    const userId = socket.data.userId ?? null;
    const [name, level] = await Promise.all([
      resolveUsername(userId, (pseudo ?? "").trim()),
      resolveUserLevel(userId),
    ]);
    const id = (gameId ?? "").trim().toUpperCase();
    if (name.length === 0 || id.length === 0) {
      socket.emit("gameError", { code: "INVALID_PAYLOAD", message: "Pseudo ou identifiant de partie manquant." });
      return;
    }
    // Verrou : interdit de rejoindre une AUTRE partie tant qu'une partie
    // démarrée est en cours (rejoindre la sienne reste permis → rattachement).
    const active = manager.activeGameFor(userId, sessionId);
    if (active && active.gameId !== id) {
      socket.emit("gameError", { code: "ACTIVE_GAME", message: `Vous avez déjà une partie en cours (${active.gameId}).`, roomCode: active.gameId });
      return;
    }
    try {
      const game = manager.joinGame(id, name, socket.id, sessionId, userId, level);
      socket.leave('lobby-browser');
      socket.join(id);
      // Le siège est résolu par le serveur (rattachement d'identité inclus) :
      // on informe le joueur de SON siège (sessionRestored fixe isHost/pseudo
      // côté client) puis on diffuse la présence à la room.
      const seat = manager.seatOf(game, socket.id) ?? 0;
      socket.emit("sessionRestored", { gameId: game.gameId, seat, pseudo: name });
      io.to(id).emit("lobbyUpdate", lobbyPayload(game));
      // Rattachement à une partie déjà démarrée (la sienne) : renvoyer la vue.
      if (game.state && game.state.phase !== "finished") {
        const lvls: (number | null)[] = [null, null, null, null];
        for (const p of game.players) { if (p.seat >= 0 && p.seat < 4) lvls[p.seat] = p.level; }
        socket.emit("gameStateUpdate", buildPlayerView(game.state, seat, game.turnStartedAt, lvls));
      }
      if (game.visibility === 'public') broadcastPublicGames();
      console.log(`➕ "${name}" a rejoint ${id} (${game.players.length}/4)`);
    } catch (e) {
      socket.emit("gameError", toGameError(e));
      console.log(`⚠️ joinGame refusé pour "${name}"`);
    }
  });

  // ── Démarrer la partie (siège 0 uniquement, 4 joueurs requis) ──
  socket.on("startGame", () => {
    const game = manager.getGameBySocket(socket.id);
    if (!game) {
      socket.emit("gameError", { code: "GAME_NOT_FOUND", message: "Vous n'êtes dans aucune partie." });
      return;
    }
    if (manager.seatOf(game, socket.id) !== 0) {
      socket.emit("gameError", { code: "INVALID_PAYLOAD", message: "Seul le joueur du siège 0 peut démarrer la partie." });
      return;
    }
    try {
      manager.startGame(game);
    } catch (e) {
      socket.emit("gameError", toGameError(e));
      return;
    }
    io.to(game.gameId).emit("lobbyUpdate", lobbyPayload(game));
    if (game.visibility === 'public') broadcastPublicGames();
    scheduleTurnTimer(game);
    broadcastViews(game);
    console.log(`🚀 Partie ${game.gameId} démarrée (ranked=${game.ranked}).`);
  });

  // ── Changer de siège en salle d'attente (choix de sa place / équipe) ──
  socket.on("chooseSeat", ({ seat }) => {
    const game = manager.getGameBySocket(socket.id);
    if (!game) {
      socket.emit("gameError", { code: "GAME_NOT_FOUND", message: "Vous n'êtes dans aucune partie." });
      return;
    }
    try {
      const newSeat = manager.moveToSeat(game, socket.id, seat);
      // Accusé ciblé : le client met à jour son siège (mySeat/isHost).
      const me = game.players.find((p) => p.socketId === socket.id);
      socket.emit("sessionRestored", { gameId: game.gameId, seat: newSeat, pseudo: me?.pseudo ?? "" });
      io.to(game.gameId).emit("lobbyUpdate", lobbyPayload(game));
      if (game.visibility === 'public') broadcastPublicGames();
    } catch (e) {
      socket.emit("gameError", toGameError(e));
    }
  });

  // ── Partie solo de test (1 humain + 3 bots, démarrage immédiat) ──
  // pairs=true → solo 2 contre 2 : moi + le bot du siège 2 (en face)
  // contre les bots des sièges 1 et 3. Même moteur, config validée par
  // sanitizeRoomOptions comme pour une room normale.
  socket.on("startTestGame", async ({ pseudo, pairs }) => {
    const userId = socket.data.userId ?? null;
    // Verrou : pas de partie solo tant qu'une partie démarrée est en cours.
    const active = manager.activeGameFor(userId, sessionId);
    if (active) {
      socket.emit("gameError", { code: "ACTIVE_GAME", message: `Vous avez déjà une partie en cours (${active.gameId}).`, roomCode: active.gameId });
      return;
    }
    const [name, level] = await Promise.all([
      resolveUsername(userId, (pseudo ?? "").trim()),
      resolveUserLevel(userId),
    ]);
    if (name.length === 0) {
      socket.emit("gameError", { code: "INVALID_PAYLOAD", message: "Pseudo manquant." });
      return;
    }
    const game = manager.createGame(name, socket.id, sessionId, userId, { visibility: 'private', pairs }, level);
    manager.addBotPlayers(game);
    socket.leave('lobby-browser');
    socket.join(game.gameId);
    try {
      manager.startGame(game);
    } catch (e) {
      socket.emit("gameError", toGameError(e));
      return;
    }
    socket.emit("gameCreated", { gameId: game.gameId, seat: 0 });
    io.to(game.gameId).emit("lobbyUpdate", lobbyPayload(game));
    scheduleTurnTimer(game);
    broadcastViews(game);
    console.log(`🤖 Partie solo de test ${game.gameId} démarrée par "${name}".`);
  });

  // ── Quitter la partie (siège résolu par le serveur depuis le socket) ──
  socket.on("leaveGame", () => {
    const { game, gameId, deleted, keepsSeat } = manager.leaveGame(socket.id);
    if (!gameId) return; // le socket n'était dans aucune partie
    socket.leave(gameId);

    if (keepsSeat && game) {
      // Partie démarrée : le siège reste (le bot joue), le joueur est parti à
      // l'accueil → on lui pose le verrou « partie en cours ».
      socket.emit("activeGameUpdate", { roomCode: game.gameId });
      console.log(`🚪 "${socket.id}" a quitté ${gameId} (siège conservé, verrou).`);
      return;
    }

    // Lobby ou partie terminée : le verrou (s'il existait) tombe.
    socket.emit("activeGameUpdate", { roomCode: null });
    if (deleted) {
      const stale = manager.getGame(gameId);
      if (stale) clearTurnTimer(stale);
      console.log(`🗑️ Partie ${gameId} supprimée (quittée, vide).`);
      broadcastPublicGames();
    } else if (game) {
      io.to(gameId).emit("lobbyUpdate", lobbyPayload(game));
      if (game.visibility === 'public' && game.status === 'waiting') broadcastPublicGames();
    }
  });

  // ── Revenir dans une partie démarrée qu'on avait quittée (Rejoindre) ──
  socket.on("resumeGame", () => {
    const resumed = manager.resumeBySession(sessionId, socket.id, socket.data.userId ?? null);
    if (!resumed) {
      // Plus de partie à rejoindre (terminée/détruite) : lever le verrou.
      socket.emit("activeGameUpdate", { roomCode: null });
      socket.emit("gameError", { code: "GAME_NOT_FOUND", message: "Cette partie n'existe plus." });
      return;
    }
    const { game, seat, pseudo } = resumed;
    socket.join(game.gameId);
    socket.emit("activeGameUpdate", { roomCode: null });
    socket.emit("sessionRestored", { gameId: game.gameId, seat, pseudo });
    socket.emit("lobbyUpdate", lobbyPayload(game));
    if (game.state) {
      const lvls: (number | null)[] = [null, null, null, null];
      for (const p of game.players) { if (p.seat >= 0 && p.seat < 4) lvls[p.seat] = p.level; }
      socket.emit("gameStateUpdate", buildPlayerView(game.state, seat, game.turnStartedAt, lvls));
    }
    console.log(`↩️ Retour de "${pseudo}" dans ${game.gameId} (siège ${seat}).`);
  });

  // ── Enchérir ──
  socket.on("placeBid", ({ bid }) => {
    const game = manager.getGameBySocket(socket.id);
    if (!game || !game.state) {
      socket.emit("gameError", { code: "NOT_STARTED", message: "La partie n'a pas démarré." });
      return;
    }
    const seat = manager.seatOf(game, socket.id);
    if (seat === undefined) {
      socket.emit("gameError", { code: "GAME_NOT_FOUND", message: "Joueur introuvable dans la partie." });
      return;
    }
    try {
      // Validation par la logique testée. En cas d'erreur : état inchangé.
      game.state = submitBid(game.state, seat, bid);
    } catch (e) {
      socket.emit("gameError", toGameError(e)); // ciblé sur le seul fautif
      return;
    }
    scheduleTurnTimer(game); // le tour change → on relance le décompte
    broadcastViews(game); // tous les écrans se resynchronisent
  });

  // ── Jouer une carte ──
  socket.on("playCard", ({ card, announce, declaredSuit }) => {
    const game = manager.getGameBySocket(socket.id);
    if (!game || !game.state) {
      socket.emit("gameError", { code: "NOT_STARTED", message: "La partie n'a pas démarré." });
      return;
    }
    const seat = manager.seatOf(game, socket.id);
    if (seat === undefined) {
      socket.emit("gameError", { code: "GAME_NOT_FOUND", message: "Joueur introuvable dans la partie." });
      return;
    }
    try {
      // submitCard valide, gère la fin de pli/manche, et enchaîne la
      // donne suivante (advanceToNextRound) automatiquement si besoin.
      game.state = submitCard(game.state, seat, card, announce, declaredSuit);
    } catch (e) {
      socket.emit("gameError", toGameError(e));
      return;
    }
    persistIfFinished(game);
    scheduleTurnTimer(game); // le tour change → on relance le décompte
    broadcastViews(game);
  });

  // ── Choisir l'atout (manches à 9 cartes, phase "choosing-trump") ──
  socket.on("chooseTrump", ({ suit }) => {
    const game = manager.getGameBySocket(socket.id);
    if (!game || !game.state) {
      socket.emit("gameError", { code: "NOT_STARTED", message: "La partie n'a pas démarré." });
      return;
    }
    const seat = manager.seatOf(game, socket.id);
    if (seat === undefined) {
      socket.emit("gameError", { code: "GAME_NOT_FOUND", message: "Joueur introuvable dans la partie." });
      return;
    }
    try {
      // chooseTrump (shared/round.ts) valide la phase et le tour : seul le
      // décideur (round.currentPlayer en phase "choosing-trump") peut agir.
      game.state = { ...game.state, round: chooseTrump(game.state.round, seat, suit) };
    } catch (e) {
      socket.emit("gameError", toGameError(e));
      return;
    }
    scheduleTurnTimer(game); // le tour change → on relance le décompte
    broadcastViews(game);
  });

  // ── Déconnexion : grace period avant retrait définitif ──
  // Le joueur garde son siège pendant RECONNECT_GRACE_MS au cas où il
  // reviendrait (refresh de page). Diffusion seulement si le délai expire
  // sans reconnexion.
  socket.on("disconnect", () => {
    console.log(`❌ Déconnecté : ${socket.id}`);
    manager.handleDisconnect(socket.id, ({ game, gameId, deleted }) => {
      if (game && gameId) {
        io.to(gameId).emit("lobbyUpdate", lobbyPayload(game));
        if (game.visibility === 'public' && game.status === 'waiting') broadcastPublicGames();
      } else if (deleted && gameId) {
        console.log(`🗑️ Partie ${gameId} supprimée (vide).`);
        broadcastPublicGames();
      }
    });
  });
});

// ─── Statique / fallback SPA ────────────────────────────────────
// Déclaré APRÈS Socket.IO : sinon ce fallback (`/.*`) intercepterait
// les requêtes `/socket.io/` et répondrait avec index.html → 404 WS.
const clientDistPath = path.join(process.cwd(), "../client/dist");

// Express 5 sert parfois les .css en text/plain : on force le bon
// Content-Type via `mime` pour que le navigateur applique les styles.
app.use(
  express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      const type = mime.getType(filePath);
      if (type) res.setHeader("Content-Type", type);
    },
  })
);

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Serveur Joker démarré sur le port ${PORT}`);
});