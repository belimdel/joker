import { randomUUID } from "crypto";
import { createGame, GameState } from "../../shared/game";
import type {
  GameStatus,
  PlayerPublic,
  GameErrorCode,
  PublicGameSummary,
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
  isBot?: boolean;
  userId: string | null; // null = invité ou bot
  level: number | null;  // null = invité, bot, ou BDD indisponible
  // Timestamp du départ de l'INTERFACE d'une partie démarrée (leaveGame en
  // cours de partie). null = joueur présent. Un joueur "parti" garde son
  // siège (le bot de timeout joue ses tours) et ne reçoit plus de vue de jeu ;
  // il peut revenir via resumeBySession. Toujours null en lobby.
  leftAt: number | null;
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
  state: GameState | null;
  turnStartedAt: number;
  turnTimer: ReturnType<typeof setTimeout> | null;
  // V5 : lobby global et persistance
  visibility: 'public' | 'private';
  ranked: boolean;       // figé au démarrage effectif (4 humains = true)
  startedAt: number | null;
  createdAt: number;
  alreadyPersisted: boolean; // garde contre double-écriture BDD (LOT 5)
  finishedNotified: boolean; // garde : verrou « partie en cours » levé une fois
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
  createGame(
    pseudo: string,
    socketId: string,
    sessionId: string,
    userId: string | null = null,
    visibility: 'public' | 'private' = 'public',
    level: number | null = null,
  ): NetworkGame {
    const gameId = this.generateUniqueId();
    const game: NetworkGame = {
      gameId,
      players: [{ socketId, sessionId, pseudo, seat: 0, userId, level, leftAt: null }],
      status: "waiting",
      state: null,
      turnStartedAt: 0,
      turnTimer: null,
      visibility,
      ranked: false,
      startedAt: null,
      createdAt: Date.now(),
      alreadyPersisted: false,
      finishedNotified: false,
    };
    this.games.set(gameId, game);
    this.socketToGame.set(socketId, gameId);
    this.sessionToGame.set(sessionId, gameId);
    return game;
  }

  // ── Rejoindre une partie existante ──
  joinGame(
    gameId: string,
    pseudo: string,
    socketId: string,
    sessionId: string,
    userId: string | null = null,
    level: number | null = null,
  ): NetworkGame {
    const game = this.games.get(gameId);
    if (!game) {
      throw new GameManagerError("GAME_NOT_FOUND", `Partie introuvable : ${gameId}`);
    }

    // ── Unicité d'identité par partie (fix anti « 4 sièges pour la même
    // personne ») : l'identité = userId si authentifié, sinon le sessionId de
    // partie (invité). Si cette identité occupe DÉJÀ un siège de cette partie
    // (connectée ou en grace period), on RATTACHE le socket à ce siège — même
    // chemin que la reconnexion silencieuse — au lieu de créer un doublon.
    const existing = this.findSeatByIdentity(game, userId, sessionId);
    if (existing) {
      const oldTimer = this.disconnectTimers.get(existing.sessionId);
      if (oldTimer) {
        clearTimeout(oldTimer);
        this.disconnectTimers.delete(existing.sessionId);
      }
      this.socketToGame.delete(existing.socketId);
      if (existing.sessionId !== sessionId) this.sessionToGame.delete(existing.sessionId);
      existing.socketId = socketId;
      existing.sessionId = sessionId;
      existing.pseudo = pseudo;
      if (level !== null) existing.level = level;
      existing.leftAt = null; // de retour dans l'interface
      this.socketToGame.set(socketId, gameId);
      this.sessionToGame.set(sessionId, gameId);
      return game;
    }

    if (game.status !== "waiting") {
      throw new GameManagerError("GAME_IN_PROGRESS", `La partie ${gameId} a déjà démarré.`);
    }
    if (game.players.length >= MAX_PLAYERS) {
      throw new GameManagerError("GAME_FULL", `La partie ${gameId} est complète.`);
    }
    const seat = this.lowestFreeSeat(game);
    game.players.push({ socketId, sessionId, pseudo, seat, userId, level, leftAt: null });
    this.socketToGame.set(socketId, gameId);
    this.sessionToGame.set(sessionId, gameId);
    return game;
  }

  // Siège occupé par une identité donnée dans une partie (undefined sinon).
  // Identité = userId si authentifié, sinon sessionId de partie (invité). Les
  // sièges bots n'ont pas d'identité humaine et sont toujours ignorés.
  private findSeatByIdentity(
    game: NetworkGame,
    userId: string | null,
    sessionId: string,
  ): NetworkPlayer | undefined {
    const identity = userId ?? sessionId;
    return game.players.find((p) => !p.isBot && (p.userId ?? p.sessionId) === identity);
  }

  // ── Verrou « partie en cours » ──
  // La partie DÉMARRÉE et NON TERMINÉE où cette identité occupe un siège, ou
  // null. Sert à interdire de créer/rejoindre/lancer une AUTRE partie tant
  // qu'une partie est en cours (le verrou tombe quand elle se termine).
  activeGameFor(userId: string | null, sessionId: string): NetworkGame | null {
    const identity = userId ?? sessionId;
    for (const game of this.games.values()) {
      if (game.status !== "in-progress") continue;
      if (game.state?.phase === "finished") continue;
      const has = game.players.some(
        (p) => !p.isBot && (p.userId ?? p.sessionId) === identity,
      );
      if (has) return game;
    }
    return null;
  }

  // ── Quitter la partie (événement explicite leaveGame) ──
  // Le siège est résolu depuis le socket (autorité). Deux cas :
  //  • lobby (pré-démarrage) OU partie terminée → on LIBÈRE le siège
  //    complètement (comme removePlayer) ; partie vide → détruite.
  //  • partie démarrée en cours → on GARDE le siège (le bot de timeout jouera
  //    ses tours) et on marque le joueur "parti" (leftAt). Le sessionId reste
  //    indexé pour permettre le retour via resumeBySession.
  leaveGame(socketId: string): {
    game: NetworkGame | null;
    gameId: string | null;
    deleted: boolean;
    keepsSeat: boolean;
  } {
    const gameId = this.socketToGame.get(socketId);
    if (!gameId) return { game: null, gameId: null, deleted: false, keepsSeat: false };

    const game = this.games.get(gameId);
    if (!game) {
      this.socketToGame.delete(socketId);
      return { game: null, gameId, deleted: false, keepsSeat: false };
    }
    const player = game.players.find((p) => p.socketId === socketId);
    if (!player) return { game, gameId, deleted: false, keepsSeat: false };

    const started = game.status !== "waiting";
    const finished = game.state?.phase === "finished";

    if (started && !finished) {
      player.leftAt = Date.now();
      this.socketToGame.delete(socketId);
      return { game, gameId, deleted: false, keepsSeat: true };
    }

    // Lobby ou partie terminée : libération complète du siège.
    this.socketToGame.delete(socketId);
    this.sessionToGame.delete(player.sessionId);
    const t = this.disconnectTimers.get(player.sessionId);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(player.sessionId);
    }
    game.players = game.players.filter((p) => p.socketId !== socketId);
    if (game.players.length === 0) {
      this.games.delete(gameId);
      return { game: null, gameId, deleted: true, keepsSeat: false };
    }
    return { game, gameId, deleted: false, keepsSeat: false };
  }

  // ── Retour dans une partie démarrée qu'on avait quittée (bouton Rejoindre) ──
  // Comme reconnect(), mais efface leftAt : le joueur RÉINTÈGRE l'interface.
  resumeBySession(sessionId: string, newSocketId: string): ReconnectResult | null {
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
    player.leftAt = null;
    player.socketId = newSocketId;
    this.socketToGame.set(newSocketId, gameId);
    return { game, seat: player.seat, pseudo: player.pseudo };
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
  startGame(game: NetworkGame): void {
    if (game.players.length !== MAX_PLAYERS) {
      throw new GameManagerError(
        "NOT_READY",
        `Il faut ${MAX_PLAYERS} joueurs pour démarrer (actuellement ${game.players.length}).`
      );
    }
    game.state = createGame(MAX_PLAYERS);
    game.status = "in-progress";
    game.startedAt = Date.now();
    // ranked = tous les sièges sont humains (aucun isBot)
    game.ranked = game.players.every(p => !p.isBot && p.userId !== null);
  }

  // ── Liste des parties publiques joignables ──
  listPublicGames(): PublicGameSummary[] {
    const result: PublicGameSummary[] = [];
    for (const game of this.games.values()) {
      if (game.visibility !== 'public') continue;
      if (game.status !== 'waiting') continue;
      if (game.players.length >= MAX_PLAYERS) continue;
      const host = game.players.find(p => p.seat === 0);
      if (!host) continue;
      result.push({
        roomCode: game.gameId,
        hostUsername: host.pseudo,
        playerCount: game.players.length,
        createdAt: game.createdAt,
      });
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ── Compléter les sièges libres avec des bots (mode solo de test) ──
  // Les bots occupent les sièges restants jusqu'à MAX_PLAYERS, avec un
  // socketId/sessionId fictif (jamais indexé dans les maps du manager :
  // aucune connexion réelle, donc aucune déconnexion à gérer pour eux).
  // startGame() n'a ensuite besoin d'aucune modification : il voit
  // MAX_PLAYERS joueurs et démarre normalement.
  addBotPlayers(game: NetworkGame): void {
    let botNumber = 1;
    for (let seat = 0; seat < MAX_PLAYERS; seat++) {
      if (game.players.some((p) => p.seat === seat)) continue;
      game.players.push({
        socketId: `bot-${randomUUID()}`,
        sessionId: `bot-${randomUUID()}`,
        pseudo: `Bot ${botNumber}`,
        seat,
        isBot: true,
        userId: null,
        level: null,
        leftAt: null,
      });
      botNumber++;
    }
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
