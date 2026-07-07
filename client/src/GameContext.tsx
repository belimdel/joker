import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { socket, clearSessionId } from "./socket";
import type { Card, Suit } from "@shared/cards";
import type { JokerAnnounce } from "@shared/trick";
import type {
  LobbyUpdatePayload,
  GameErrorPayload,
  SessionRestoredPayload,
  GameCreatedPayload,
  PublicGameSummary,
  ActiveGamePayload,
  CreateGamePayload,
} from "@shared/events";
import type { PlayerView } from "@shared/views";

// ─── État réseau exposé à toute l'app ───────────────────────────
// Le front ne tient AUCUNE logique de jeu : il garde la dernière
// PlayerView reçue, l'état du lobby, et les erreurs. Le serveur fait foi.
export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

type GameContextValue = {
  connected: boolean;
  connectionStatus: ConnectionStatus;
  lobby: LobbyUpdatePayload | null;
  view: PlayerView | null;
  error: GameErrorPayload | null;
  notice: string | null; // message neutre (non-erreur), ex. session expirée
  isHost: boolean; // ai-je créé la partie (siège 0) ?
  mySeat: number | null; // mon siège en salle d'attente (null hors partie)
  myPseudo: string;
  publicGames: PublicGameSummary[];
  // Verrou « partie en cours » : code de la partie démarrée qui m'attend, ou
  // null. Non-null ⇒ Home verrouillé (bandeau + Rejoindre), création/join/solo
  // interdits jusqu'à la fin de la partie.
  activeGameRoom: string | null;

  // Options de room (visibilité, mode, mise, ranked) — cf. CreateGamePayload.
  createGame: (pseudo: string, options?: Omit<CreateGamePayload, 'pseudo'>) => void;
  joinGame: (gameId: string, pseudo: string) => void;
  chooseSeat: (seat: number) => void;
  // (Re)rejoint la room lobby-browser et redemande la liste des parties
  // publiques. À appeler à l'affichage de l'écran Play : le client quitte
  // lobby-browser en créant/rejoignant une partie et n'y est pas réinscrit
  // au retour, d'où l'absence de mises à jour temps réel sans ce rappel.
  refreshPublicGames: () => void;
  startGame: () => void;
  startTestGame: (pseudo: string) => void;
  placeBid: (bid: number) => void;
  playCard: (card: Card, announce?: JokerAnnounce, declaredSuit?: Suit | null) => void;
  chooseTrump: (suit: Suit | null) => void;
  clearError: () => void;
  clearNotice: () => void;
  // Quitter : en lobby libère le siège ; en partie démarrée garde le siège
  // (verrou + Rejoindre). Le serveur fait autorité sur le cas exact.
  leaveGame: () => void;
  // Revenir dans la partie démarrée qu'on avait quittée.
  rejoin: () => void;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(socket.connected);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    socket.connected ? "connected" : "disconnected"
  );
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<GameErrorPayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [myPseudo, setMyPseudo] = useState("");
  const [publicGames, setPublicGames] = useState<PublicGameSummary[]>([]);
  const [activeGameRoom, setActiveGameRoom] = useState<string | null>(null);

  // Abonnement UNIQUE aux événements serveur (nettoyé au démontage).
  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setConnectionStatus("connected");
      // Rejoindre la room lobby-browser pour recevoir les mises à jour.
      socket.emit("listGames");
    };
    const onDisconnect = () => {
      setConnected(false);
      setConnectionStatus("disconnected");
    };
    // Les events de reconnexion (tentatives, succès, échec) sont émis par le
    // Manager (socket.io), pas par le Socket lui-même.
    const onReconnectAttempt = () => setConnectionStatus("reconnecting");
    const onReconnectFailed = () => setConnectionStatus("disconnected");
    const onCreated = (p: GameCreatedPayload) => {
      setIsHost(true); // seul le créateur reçoit gameCreated
      setMySeat(p.seat);
    };
    const onLobby = (p: LobbyUpdatePayload) => setLobby(p);
    const onState = (v: PlayerView) => setView(v);
    const onError = (e: GameErrorPayload) => {
      setError(e);
      // Verrou « partie en cours » : mémoriser le code pour le bandeau Home.
      if (e.code === "ACTIVE_GAME" && e.roomCode) setActiveGameRoom(e.roomCode);
    };
    // Pose ou lève le verrou « partie en cours » (emit ciblé serveur).
    const onActiveGame = ({ roomCode }: ActiveGamePayload) => setActiveGameRoom(roomCode);
    // Reconnexion silencieuse après refresh : on retrouve notre siège et
    // notre pseudo, le lobby/l'état de jeu suivent via leurs events propres.
    const onSessionRestored = ({ seat, pseudo }: SessionRestoredPayload) => {
      setIsHost(seat === 0);
      setMySeat(seat);
      setMyPseudo(pseudo);
      // On (ré)intègre une partie : aucun verrou Home à afficher.
      setActiveGameRoom(null);
    };
    // Session orpheline (ex. redémarrage serveur) : la partie n'existe plus
    // côté serveur. On purge la session locale et on revient à l'accueil
    // avec un message sobre (réaffiché via le bandeau d'erreur de Home).
    const onSessionExpired = () => {
      clearSessionId();
      setLobby(null);
      setView(null);
      setIsHost(false);
      setMySeat(null);
      setActiveGameRoom(null);
      setNotice("Cette partie a expiré, recrée-en une.");
    };
    const onPublicGames = ({ games }: { games: PublicGameSummary[] }) => {
      setPublicGames(games);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect_failed", onReconnectFailed);
    socket.on("gameCreated", onCreated);
    socket.on("lobbyUpdate", onLobby);
    socket.on("gameStateUpdate", onState);
    socket.on("gameError", onError);
    socket.on("sessionRestored", onSessionRestored);
    socket.on("sessionExpired", onSessionExpired);
    socket.on("publicGamesUpdate", onPublicGames);
    socket.on("activeGameUpdate", onActiveGame);

    // Le socket peut s'être connecté AVANT que useEffect enregistre onConnect
    // (race condition au premier rendu). On resynchronise l'état ici.
    if (socket.connected) {
      setConnected(true);
      setConnectionStatus("connected");
      socket.emit("listGames");
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect_failed", onReconnectFailed);
      socket.off("gameCreated", onCreated);
      socket.off("lobbyUpdate", onLobby);
      socket.off("gameStateUpdate", onState);
      socket.off("gameError", onError);
      socket.off("sessionRestored", onSessionRestored);
      socket.off("sessionExpired", onSessionExpired);
      socket.off("publicGamesUpdate", onPublicGames);
      socket.off("activeGameUpdate", onActiveGame);
    };
  }, []);

  const createGame = useCallback((pseudo: string, options: Omit<CreateGamePayload, 'pseudo'> = {}) => {
    setError(null);
    setNotice(null);
    setMyPseudo(pseudo);
    socket.emit("createGame", { pseudo, ...options });
  }, []);

  const joinGame = useCallback((gameId: string, pseudo: string) => {
    setError(null);
    setNotice(null);
    setMyPseudo(pseudo);
    socket.emit("joinGame", { gameId, pseudo });
  }, []);

  const chooseSeat = useCallback((seat: number) => {
    setError(null);
    setNotice(null);
    socket.emit("chooseSeat", { seat });
  }, []);

  const refreshPublicGames = useCallback(() => {
    if (socket.connected) socket.emit("listGames");
  }, []);

  const startGame = useCallback(() => {
    setError(null);
    setNotice(null);
    socket.emit("startGame");
  }, []);

  const startTestGame = useCallback((pseudo: string) => {
    setError(null);
    setNotice(null);
    setMyPseudo(pseudo);
    socket.emit("startTestGame", { pseudo });
  }, []);

  const placeBid = useCallback((bid: number) => {
    setError(null);
    setNotice(null);
    socket.emit("placeBid", { bid });
  }, []);

  const playCard = useCallback(
    (card: Card, announce?: JokerAnnounce, declaredSuit?: Suit | null) => {
      setError(null);
      setNotice(null);
      socket.emit("playCard", { card, announce, declaredSuit });
    },
    []
  );

  const chooseTrump = useCallback((suit: Suit | null) => {
    setError(null);
    setNotice(null);
    socket.emit("chooseTrump", { suit });
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  // Quitter la partie via l'événement explicite leaveGame. Le serveur fait
  // autorité : en lobby (ou partie terminée) il libère le siège ; en partie
  // démarrée il garde le siège (le bot joue) et pose le verrou « partie en
  // cours ». Côté client on nettoie l'écran, et on ne garde le sessionId de
  // partie (clé du retour) QUE si la partie était démarrée et non terminée.
  const leaveGame = useCallback(() => {
    const startedAndLive = view != null && view.gamePhase !== "finished";
    socket.emit("leaveGame");
    setLobby(null);
    setView(null);
    setError(null);
    setNotice(null);
    setIsHost(false);
    setMySeat(null);
    if (startedAndLive && lobby) {
      setActiveGameRoom(lobby.gameId); // Home verrouillé + Rejoindre
    } else {
      clearSessionId(); // partie oubliée : on repart d'une session propre
      setActiveGameRoom(null);
    }
  }, [view, lobby]);

  // Revenir dans la partie démarrée quittée : le serveur renvoie la vue.
  const rejoin = useCallback(() => {
    setError(null);
    setNotice(null);
    socket.emit("resumeGame");
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      connected,
      connectionStatus,
      lobby,
      view,
      error,
      notice,
      isHost,
      mySeat,
      myPseudo,
      publicGames,
      activeGameRoom,
      createGame,
      joinGame,
      chooseSeat,
      refreshPublicGames,
      startGame,
      startTestGame,
      placeBid,
      playCard,
      chooseTrump,
      clearError,
      clearNotice,
      leaveGame,
      rejoin,
    }),
    [connected, connectionStatus, lobby, view, error, notice, isHost, mySeat, myPseudo, publicGames, activeGameRoom, createGame, joinGame, chooseSeat, refreshPublicGames, startGame, startTestGame, placeBid, playCard, chooseTrump, clearError, clearNotice, leaveGame, rejoin]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame doit être utilisé dans <GameProvider>.");
  return ctx;
}
