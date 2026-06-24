import type { Card, Suit } from "./cards";
import type { JokerAnnounce } from "./trick";
import type { PlayerView } from "./views";

// ─── Contrat réseau typé (partagé serveur ↔ client) ─────────────
// Tous les payloads des événements Socket.IO (lobby + jeu). Le serveur
// ET le client importent ces types : pas de `any` sur le réseau, et
// toute divergence de forme est détectée à la compilation des deux côtés.

// Statut d'une partie côté réseau.
export type GameStatus = "waiting" | "in-progress";

// Vue PUBLIQUE d'un joueur (ce que voit la room). On n'expose JAMAIS le
// socketId aux autres clients : seulement le siège et le pseudo.
export type PlayerPublic = {
  seat: number; // siège 0-3
  pseudo: string;
};

// Message de bienvenue envoyé à la connexion.
export type WelcomePayload = {
  message: string;
};

// Le client demande la création d'une partie.
export type CreateGamePayload = {
  pseudo: string;
};

// Réponse au seul créateur : l'identifiant à partager + son siège.
export type GameCreatedPayload = {
  gameId: string;
  seat: number;
};

// Le client demande à rejoindre une partie existante.
export type JoinGamePayload = {
  gameId: string;
  pseudo: string;
};

// Diffusé à TOUTE la room quand la présence change (arrivée/départ).
export type LobbyUpdatePayload = {
  gameId: string;
  status: GameStatus;
  players: PlayerPublic[]; // triés par siège
};

// ── Payloads de JEU (intentions du client) ──
// Le client envoie une intention ; le serveur valide via shared/ et fait
// autorité. Aucun GameState n'est jamais envoyé brut au client.

// Enchérir.
export type PlaceBidPayload = {
  bid: number;
};

// Jouer une carte (announce/declaredSuit ne servent que pour les jokers).
export type PlayCardPayload = {
  card: Card;
  announce?: JokerAnnounce;
  declaredSuit?: Suit | null;
};

// Choisir l'atout (manches à 9 cartes, phase "choosing-trump").
// suit = null → on passe (manche SANS ATOUT).
export type ChooseTrumpPayload = {
  suit: Suit | null;
};

// Codes d'erreur réseau (union fermée → exhaustivité vérifiable).
export type GameErrorCode =
  | "GAME_NOT_FOUND"
  | "GAME_FULL"
  | "INVALID_PAYLOAD"
  | "NOT_READY" // pas assez de joueurs pour démarrer
  | "NOT_STARTED" // action de jeu sur une partie non démarrée
  | "ILLEGAL_MOVE" // coup refusé par la logique (hors-tour, renonce, etc.)
  | "SESSION_EXPIRED"; // usage CLIENT uniquement, jamais émis par le serveur en
  // gameError : sert à réafficher le message "session expirée" via l'écran
  // d'accueil après réception de l'event réseau dédié sessionExpired.

// Erreur renvoyée au SEUL demandeur.
export type GameErrorPayload = {
  code: GameErrorCode;
  message: string;
};

// Reconnexion silencieuse : renvoyé au SEUL socket qui revient (refresh de
// page) pour qu'il sache dans quelle partie / quel siège il se trouve.
export type SessionRestoredPayload = {
  gameId: string;
  seat: number;
  pseudo: string;
};

// ─── Cartes d'événements pour typer Socket.IO de bout en bout ───
// Événements émis PAR le client, reçus PAR le serveur.
export interface ClientToServerEvents {
  createGame: (payload: CreateGamePayload) => void;
  joinGame: (payload: JoinGamePayload) => void;
  startGame: () => void; // démarré par le joueur du siège 0
  placeBid: (payload: PlaceBidPayload) => void;
  playCard: (payload: PlayCardPayload) => void;
  chooseTrump: (payload: ChooseTrumpPayload) => void;
}

// Événements émis PAR le serveur, reçus PAR le client.
export interface ServerToClientEvents {
  welcome: (payload: WelcomePayload) => void;
  gameCreated: (payload: GameCreatedPayload) => void;
  lobbyUpdate: (payload: LobbyUpdatePayload) => void;
  gameError: (payload: GameErrorPayload) => void;
  // Vue filtrée PERSONNALISÉE par joueur (emit ciblé par socket).
  gameStateUpdate: (view: PlayerView) => void;
  // Reconnexion silencieuse après un refresh (emit ciblé par socket).
  sessionRestored: (payload: SessionRestoredPayload) => void;
  // Session orpheline (sessionId fourni mais inconnu du serveur) : le
  // client doit purger sa session locale et revenir à l'accueil.
  sessionExpired: () => void;
}
