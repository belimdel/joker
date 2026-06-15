import { createGame, GameState } from "../../shared/game";
import type {
  GameStatus,
  PlayerPublic,
  GameErrorCode,
} from "../../shared/events";

export const MAX_PLAYERS = 4;
export const ID_LENGTH = 4;

// Délai de grâce avant suppression définitive d'un joueur déconnecté
// (refresh de page, micro-coupure réseau...). Le tier gratuit Render peut
// être lent à réveiller une connexion : on reste large.
export const RECONNECT_GRACE_MS = 15000;

// ─── Modèle réseau d'une partie (côté serveur) ──────────────────
// Note : NetworkPlayer porte le socketId (interne, jamais diffusé). La
// vue publique (PlayerPublic) ne contient que siège + pseudo.
export type NetworkPlayer = {
  socketId: string;
  sessionId: string;
  pseudo: string;
  seat: number; // 0-3
};

// Résultat d'une suppression différée (grace period écoulée) ou immédiate.
export type RemovePlayerResult = {
  game: NetworkGame | null;
  gameId: string | null;
  deleted: boolean;
};

// Résultat d'une reconnexion réussie via sessionId.
export type ReconnectResult = {
  game: NetworkGame;
  seat: number;
  pseudo: string;
};

export type NetworkGame = {
  gameId: string;
  players: NetworkPlayer[];
  status: GameStatus;
  // Emplacement du futur état de jeu (shared/game.ts). Reste null tant
  // que la partie n'a pas démarré (branché à l'objectif suivant).
  state: GameState | null;

  // ── Timer de tour (15s, cf. shared/round.ts TURN_DURATION_MS) ──
  // turnStartedAt : timestamp (Date.now()) du début du tour courant,
  // envoyé dans PlayerView pour que le client affiche la barre.
  // turnTimer : le setTimeout en cours (auto-jeu si non rejoué à temps),
  // reprogrammé à chaque changement de currentPlayer (index.ts).
  turnStartedAt: number;
  turnTimer: ReturnType<typeof setTimeout> | null;
};

// Erreur métier du manager, avec un code exploitable côté réseau.
export class GameManagerError extends Error {
  code: GameErrorCode;
  constructor(code: GameErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "GameManagerError";
  }
}

// Caractères non ambigus pour des codes lisibles/partageables :
// pas de 0/O, ni 1/I/L.
const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// ─── Le gestionnaire : toutes les parties actives en mémoire ────
// Logique pure et testable (aucune dépendance à Socket.IO) : on lui
// passe des socketId sous forme de simples chaînes.
export class GameManager {
  private games = new Map<string, NetworkGame>();
  // Index inverse socketId → gameId (un socket est dans au plus 1 partie).
  private socketToGame = new Map<string, string>();
  // Index inverse sessionId → gameId (survit à la déconnexion du socket).
  private sessionToGame = new Map<string, string>();
  // Timers de suppression différée, par sessionId.
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ── Créer une partie : le créateur prend le siège 0 ──
  createGame(pseudo: string, socketId: string, sessionId: string): NetworkGame {
    const gameId = this.generateUniqueId();
    const game: NetworkGame = {
      gameId,
      players: [{ socketId, sessionId, pseudo, seat: 0 }],
      status: "waiting",
      state: null,
      turnStartedAt: 0,
      turnTimer: null,
    };
    this.games.set(gameId, game);
    this.socketToGame.set(socketId, gameId);
    this.sessionToGame.set(sessionId, gameId);
    return game;
  }

  // ── Rejoindre une partie existante ──
  // Lève GameManagerError si la partie est introuvable ou complète.
  joinGame(gameId: string, pseudo: string, socketId: string, sessionId: string): NetworkGame {
    const game = this.games.get(gameId);
    if (!game) {
      throw new GameManagerError(
        "GAME_NOT_FOUND",
        `Partie introuvable : ${gameId}`
      );
    }
    if (game.players.length >= MAX_PLAYERS) {
      throw new GameManagerError("GAME_FULL", `La partie ${gameId} est complète.`);
    }
    const seat = this.lowestFreeSeat(game);
    game.players.push({ socketId, sessionId, pseudo, seat });
    this.socketToGame.set(socketId, gameId);
    this.sessionToGame.set(sessionId, gameId);
    return game;
  }

  // ── Retirer un joueur (déconnexion) ──
  // Si la partie devient vide, elle est supprimée du manager. Retourne
  // de quoi diffuser la mise à jour (ou savoir que la partie a disparu).
  removePlayer(socketId: string): {
    game: NetworkGame | null;
    gameId: string | null;
    deleted: boolean;
  } {
    const gameId = this.socketToGame.get(socketId);
    if (!gameId) return { game: null, gameId: null, deleted: false };

    this.socketToGame.delete(socketId);
    const game = this.games.get(gameId);
    if (!game) return { game: null, gameId, deleted: false };

    game.players = game.players.filter((p) => p.socketId !== socketId);

    if (game.players.length === 0) {
      this.games.delete(gameId);
      return { game: null, gameId, deleted: true };
    }
    return { game, gameId, deleted: false };
  }

  // ── Déconnexion avec grace period ──
  // N'enlève PAS immédiatement le joueur : son siège est conservé pendant
  // RECONNECT_GRACE_MS au cas où le même sessionId se reconnecte (refresh
  // de page). Le socket mort est désindexé tout de suite (un nouveau socket
  // ne doit pas pouvoir "hériter" de cette entrée). Si le délai expire sans
  // reconnexion, `onExpire` est appelé avec le résultat de la suppression
  // définitive (pour diffuser lobbyUpdate ou logguer la suppression).
  handleDisconnect(socketId: string, onExpire: (result: RemovePlayerResult) => void): void {
    const gameId = this.socketToGame.get(socketId);
    if (!gameId) return;
    this.socketToGame.delete(socketId);

    const game = this.games.get(gameId);
    const player = game?.players.find((p) => p.socketId === socketId);
    if (!game || !player) return;

    const { sessionId } = player;
    const existing = this.disconnectTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(sessionId);
      onExpire(this.finalizeRemoval(sessionId));
    }, RECONNECT_GRACE_MS);
    this.disconnectTimers.set(sessionId, timer);
  }

  // ── Reconnexion silencieuse via sessionId ──
  // Retrouve le joueur (toujours présent grâce à la grace period), annule
  // sa suppression différée, et raccroche son siège au nouveau socket.
  // Retourne `null` si la session ne correspond à aucune partie active
  // (partie déjà supprimée, grace period déjà écoulée, session inconnue...).
  reconnect(sessionId: string, newSocketId: string): ReconnectResult | null {
    const gameId = this.sessionToGame.get(sessionId);
    if (!gameId) return null;

    const game = this.games.get(gameId);
    const player = game?.players.find((p) => p.sessionId === sessionId);
    if (!game || !player) {
      this.sessionToGame.delete(sessionId);
      return null;
    }

    const timer = this.disconnectTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(sessionId);
    }

    player.socketId = newSocketId;
    this.socketToGame.set(newSocketId, gameId);

    return { game, seat: player.seat, pseudo: player.pseudo };
  }

  getGame(gameId: string): NetworkGame | undefined {
    return this.games.get(gameId);
  }

  // Retrouve la partie d'un socket (autorité : on ne se fie pas à un
  // gameId envoyé par le client, on résout depuis le socketId connecté).
  getGameBySocket(socketId: string): NetworkGame | undefined {
    const gameId = this.socketToGame.get(socketId);
    if (!gameId) return undefined;
    return this.games.get(gameId);
  }

  // Siège d'un socket dans une partie (undefined s'il n'y est pas).
  seatOf(game: NetworkGame, socketId: string): number | undefined {
    return game.players.find((p) => p.socketId === socketId)?.seat;
  }

  // ── Démarrer la partie ──
  // Exige MAX_PLAYERS joueurs. Crée le GameState (shared/game.ts), le
  // range dans le slot `state`, et passe le statut à "in-progress".
  startGame(game: NetworkGame): void {
    if (game.players.length !== MAX_PLAYERS) {
      throw new GameManagerError(
        "NOT_READY",
        `Il faut ${MAX_PLAYERS} joueurs pour démarrer (actuellement ${game.players.length}).`
      );
    }
    game.state = createGame(MAX_PLAYERS);
    game.status = "in-progress";
  }

  // Vue publique d'une partie (pour le payload réseau), triée par siège.
  publicPlayers(game: NetworkGame): PlayerPublic[] {
    return game.players
      .map((p) => ({ seat: p.seat, pseudo: p.pseudo }))
      .sort((a, b) => a.seat - b.seat);
  }

  // Nombre de parties actives (utile pour les tests / le debug).
  get size(): number {
    return this.games.size;
  }

  // ── Helpers privés ──

  // Suppression définitive d'un joueur après expiration de la grace period
  // (cf. handleDisconnect). Même sémantique que removePlayer, mais indexée
  // par sessionId puisque le socketId d'origine est déjà mort.
  private finalizeRemoval(sessionId: string): RemovePlayerResult {
    const gameId = this.sessionToGame.get(sessionId);
    this.sessionToGame.delete(sessionId);
    if (!gameId) return { game: null, gameId: null, deleted: false };

    const game = this.games.get(gameId);
    if (!game) return { game: null, gameId, deleted: false };

    game.players = game.players.filter((p) => p.sessionId !== sessionId);

    if (game.players.length === 0) {
      this.games.delete(gameId);
      return { game: null, gameId, deleted: true };
    }
    return { game, gameId, deleted: false };
  }

  // Plus petit siège libre (permet de réoccuper un siège laissé vacant).
  private lowestFreeSeat(game: NetworkGame): number {
    const taken = new Set(game.players.map((p) => p.seat));
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!taken.has(s)) return s;
    }
    throw new GameManagerError("GAME_FULL", "Aucun siège libre.");
  }

  private generateUniqueId(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let id = "";
      for (let i = 0; i < ID_LENGTH; i++) {
        id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
      }
      if (!this.games.has(id)) return id;
    }
    throw new Error("Impossible de générer un identifiant de partie unique.");
  }
}
