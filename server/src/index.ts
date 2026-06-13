import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { GameManager, GameManagerError, NetworkGame } from "./GameManager";
import { submitBid, submitCard } from "../../shared/game";
import { buildPlayerView } from "../../shared/views";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  LobbyUpdatePayload,
  GameErrorPayload,
} from "../../shared/events";

const app = express();
app.use(cors());



import path from "path";


const clientDistPath = path.join(
  process.cwd(),
  "../client/dist"
);

app.use(express.static(clientDistPath));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

// Socket.IO a besoin d'un serveur HTTP "brut" pour s'y attacher.
const httpServer = createServer(app);

// Serveur Socket.IO TYPÉ : les événements client→serveur et serveur→client
// sont contraints par le contrat partagé (shared/events.ts).
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
    const view = buildPlayerView(game.state, player.seat);
    io.to(player.socketId).emit("gameStateUpdate", view);
  }
}

// Transforme une exception en gameError ciblé (jamais de crash serveur).
function toGameError(e: unknown): GameErrorPayload {
  if (e instanceof GameManagerError) {
    return { code: e.code, message: e.message };
  }
  // Les erreurs de la logique de jeu (round.ts/game.ts) → coup illégal.
  return { code: "ILLEGAL_MOVE", message: (e as Error).message };
}

io.on("connection", (socket) => {
  console.log(`✅ Connecté : ${socket.id}`);
  socket.emit("welcome", { message: "Connecté au serveur Joker !" });

  // ── Créer une partie ──
  socket.on("createGame", ({ pseudo }) => {
    const name = (pseudo ?? "").trim();
    if (name.length === 0) {
      socket.emit("gameError", { code: "INVALID_PAYLOAD", message: "Pseudo manquant." });
      return;
    }
    const game = manager.createGame(name, socket.id);
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
      const game = manager.joinGame(id, name, socket.id);
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
    broadcastViews(game);
  });

  // ── Déconnexion : retirer le joueur, diffuser, nettoyer ──
  socket.on("disconnect", () => {
    console.log(`❌ Déconnecté : ${socket.id}`);
    const { game, gameId, deleted } = manager.removePlayer(socket.id);
    if (game && gameId) {
      io.to(gameId).emit("lobbyUpdate", lobbyPayload(game));
    } else if (deleted && gameId) {
      console.log(`🗑️ Partie ${gameId} supprimée (vide).`);
    }
  });
});

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Serveur Joker démarré sur le port ${PORT}`);
});