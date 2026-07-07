import type { Card, Suit } from "./cards";
import type { GameMode, KhishtiPenalty } from "./game";
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
  visibility?: 'public' | 'private'; // défaut 'public' si absent
  // ── Options de room (v6, toutes facultatives → défauts serveur) ──
  mode?: GameMode; // défaut 'standard'
  khishtiPenalty?: KhishtiPenalty; // mise « Dring », défaut 200
  // L'hôte demande une partie classée. Le serveur ne la valide au démarrage
  // que si les 4 joueurs sont humains ET authentifiés (sinon practice).
  ranked?: boolean;
  // Mode 2 contre 2 (partenaires sièges 0+2 vs 1+3). Défaut false = « chacun
  // pour soi ».
  pairs?: boolean;
};

// Joueur affiché sur une carte de room publique (avatar + rang).
export type PublicGamePlayer = {
  pseudo: string;
  level: number | null; // null = invité
};

// Résumé public d'une partie visible dans le lobby (anti-triche : AUCUNE donnée de jeu).
export type PublicGameSummary = {
  roomCode: string;
  hostUsername: string;
  hostLevel: number | null;
  playerCount: number;
  players: PublicGamePlayer[]; // triés par siège
  mode: GameMode;
  khishtiPenalty: KhishtiPenalty;
  ranked: boolean; // ranked DEMANDÉ par l'hôte
  pairs: boolean; // mode 2 contre 2 (affiche le VS sur la carte de room)
  createdAt: number; // Date.now() à la création
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

// Le client (en salle d'attente) demande à changer de siège. Le serveur
// n'accepte le déplacement que si la partie est en attente et le siège LIBRE.
export type ChooseSeatPayload = {
  seat: number; // siège visé 0-3
};

// Diffusé à TOUTE la room quand la présence change (arrivée/départ).
export type LobbyUpdatePayload = {
  gameId: string;
  status: GameStatus;
  players: PlayerPublic[]; // triés par siège
  // Niveau de chaque siège (index = siège 0-3) ; null = invité ou bot.
  playerLevels: (number | null)[];
  // Options de la room (badges du lobby : mode, mise, ranked).
  mode: GameMode;
  khishtiPenalty: KhishtiPenalty;
  ranked: boolean; // ranked demandé par l'hôte
  pairs: boolean; // mode 2 contre 2 (VS au milieu + équipes cliquables)
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
  | "GAME_IN_PROGRESS" // join frais refusé : la partie a déjà démarré
  | "ACTIVE_GAME"; // verrou : cette identité a déjà une partie DÉMARRÉE en cours

// Erreur renvoyée au SEUL demandeur.
export type GameErrorPayload = {
  code: GameErrorCode;
  message: string;
  // Uniquement pour ACTIVE_GAME : le code de la partie en cours à rejoindre.
  roomCode?: string;
};

// Verrou « partie en cours » : diffusé au SEUL joueur concerné. roomCode non
// null = une partie démarrée l'attend (Home verrouillé + Rejoindre) ; null =
// verrou levé (partie terminée/quittée) → Home redevient normal.
export type ActiveGamePayload = {
  roomCode: string | null;
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
  // Changer de siège en salle d'attente (choix de sa place / de son équipe).
  chooseSeat: (payload: ChooseSeatPayload) => void;
  // Quitter la partie. Le SERVEUR résout le siège depuis le socket (jamais
  // depuis un payload) : en lobby → libère le siège ; en partie démarrée →
  // garde le siège (le bot de timeout joue), le joueur pourra revenir.
  leaveGame: () => void;
  // Revenir dans une partie démarrée qu'on avait quittée (bouton Rejoindre).
  resumeGame: () => void;
  startGame: () => void; // démarré par le joueur du siège 0
  // Crée une partie solo de test : siège 0 = l'appelant, sièges 1-3 = des
  // bots, démarrage immédiat (cf. GameManager.addBotPlayers).
  startTestGame: (payload: CreateGamePayload) => void;
  // Demande la liste des parties publiques et rejoint la room lobby-browser.
  listGames: () => void;
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
  // Liste des parties publiques joignables (diffusée à la room lobby-browser).
  publicGamesUpdate: (payload: { games: PublicGameSummary[] }) => void;
  // Verrou « partie en cours » (emit ciblé) : informe le joueur qu'une partie
  // démarrée l'attend (roomCode) ou que le verrou est levé (null).
  activeGameUpdate: (payload: ActiveGamePayload) => void;
}
