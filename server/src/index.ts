import express from "express";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import mime from "mime";
import { GameManager, GameManagerError, NetworkGame } from "./GameManager";
import { submitBid, submitCard } from "../../shared/game";
import { buildPlayerView } from "../../shared/views";
import { TURN_DURATION_MS } from "../../shared/round";
import { pickAutoBid, pickAutoCard } from "../../shared/bot";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  LobbyUpdatePayload,
  GameErrorPayload,
} from "../../shared/events";

const app = express();
app.use(cors());

// Socket.IO a besoin d'un serveur HTTP "brut" pour s'y attacher.
const httpServer = createServer(app);

// Serveur Socket.IO TYPÉ : les événements client→serveur et serveur→client
// sont contraints par le contrat partagé (shared/events.ts). Attaché à
// httpServer AVANT le fallback SPA, sinon ce dernier intercepte /socket.io/.
const allowedOrigin =
  process.env.CLIENT_URL || "http://localhost:5173";

const io = new Server<ClientToServerEvents, ServerToClientEvents>(
  httpServer,
  {
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"],
    },
  }
);

// Le gestionnaire de parties vit pour toute la durée du process.
const manager = new GameManager();

// ─── Helpers de diffusion ────────────────────────────────────────

// Payload de présence (vue publique de la room).
function lobbyPayload(game: NetworkGame): LobbyUpdatePayload {
  return {
    gameId: game.gameId,
    status: game.status,
    players: manager.publicPlayers(game),
  };
}

// SÉCURITÉ : diffusion CIBLÉE. Chaque joueur reçoit SA PlayerView (sa
// main en clair, les autres en simple compte) via un emit personnalisé
// par socket — surtout PAS un broadcast unique avec le même payload.
function broadcastViews(game: NetworkGame): void {
  if (!game.state) return;
  for (const player of game.players) {
    const view = buildPlayerView(game.state, player.seat, game.turnStartedAt);
    io.to(player.socketId).emit("gameStateUpdate", view);
  }
}

// ─── Timer de tour (15s) + auto-jeu ──────────────────────────────
// Le serveur fait autorité sur le temps : à chaque changement de
// currentPlayer, on (re)programme un timeout de TURN_DURATION_MS. S'il
// expire sans action humaine, on joue À LA PLACE du joueur via
// placeBid/playCard (shared/bot.ts choisit un coup LÉGAL, mêmes
// validations que pour un humain), puis on reprogramme le tour suivant.
function clearTurnTimer(game: NetworkGame): void {
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
    game.turnTimer = null;
  }
}

function scheduleTurnTimer(game: NetworkGame): void {
  clearTurnTimer(game);
  if (!game.state || game.state.phase === "finished") return;

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
      if (round.phase === "bidding") {
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

    scheduleTurnTimer(game);
    broadcastViews(game);
  }, TURN_DURATION_MS);
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

io.on("connection", (socket) => {
  console.log(`✅ Connecté : ${socket.id}`);

  // ── Reconnexion silencieuse (refresh de page) ──
  // Avant tout autre traitement : si ce sessionId correspond à un joueur
  // en grace period, on le raccroche à sa partie/son siège et on lui
  // réémet son état, sans rien diffuser aux autres joueurs.
  const sessionId = sessionIdOf(socket);
  const reconnected = manager.reconnect(sessionId, socket.id);
  if (reconnected) {
    const { game, seat, pseudo } = reconnected;
    socket.join(game.gameId);
    socket.emit("sessionRestored", { gameId: game.gameId, seat, pseudo });
    // Toujours réémettre le lobby (même en partie en cours) : sans ça,
    // le client garde lobby=null après un refresh et pseudoOf() retombe
    // sur "Joueur N" pour tout le monde.
    socket.emit("lobbyUpdate", lobbyPayload(game));
    if (game.state) {
      socket.emit("gameStateUpdate", buildPlayerView(game.state, seat, game.turnStartedAt));
    }
    console.log(`🔄 Reconnexion silencieuse : "${pseudo}" → ${game.gameId} (siège ${seat})`);
  }

  socket.emit("welcome", { message: "Connecté au serveur Joker !" });

  // ── Créer une partie ──
  socket.on("createGame", ({ pseudo }) => {
    const name = (pseudo ?? "").trim();
    if (name.length === 0) {
      socket.emit("gameError", { code: "INVALID_PAYLOAD", message: "Pseudo manquant." });
      return;
    }
    const game = manager.createGame(name, socket.id, sessionId);
    socket.join(game.gameId);
    socket.emit("gameCreated", { gameId: game.gameId, seat: 0 });
    io.to(game.gameId).emit("lobbyUpdate", lobbyPayload(game));
    console.log(`🎲 Partie créée ${game.gameId} par "${name}"`);
  });

  // ── Rejoindre une partie ──
  socket.on("joinGame", ({ gameId, pseudo }) => {
    const name = (pseudo ?? "").trim();
    const id = (gameId ?? "").trim().toUpperCase(); // codes insensibles à la casse
    if (name.length === 0 || id.length === 0) {
      socket.emit("gameError", {
        code: "INVALID_PAYLOAD",
        message: "Pseudo ou identifiant de partie manquant.",
      });
      return;
    }
    try {
      const game = manager.joinGame(id, name, socket.id, sessionId);
      socket.join(id);
      io.to(id).emit("lobbyUpdate", lobbyPayload(game));
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
      socket.emit("gameError", {
        code: "INVALID_PAYLOAD",
        message: "Seul le joueur du siège 0 peut démarrer la partie.",
      });
      return;
    }
    try {
      manager.startGame(game);
    } catch (e) {
      socket.emit("gameError", toGameError(e));
      return;
    }
    io.to(game.gameId).emit("lobbyUpdate", lobbyPayload(game)); // statut → in-progress
    scheduleTurnTimer(game);
    broadcastViews(game);
    console.log(`🚀 Partie ${game.gameId} démarrée.`);
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
      } else if (deleted && gameId) {
        console.log(`🗑️ Partie ${gameId} supprimée (vide).`);
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