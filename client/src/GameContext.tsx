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
  myPseudo: string;

  createGame: (pseudo: string) => void;
  joinGame: (gameId: string, pseudo: string) => void;
  startGame: () => void;
  placeBid: (bid: number) => void;
  playCard: (card: Card, announce?: JokerAnnounce, declaredSuit?: Suit | null) => void;
  chooseTrump: (suit: Suit | null) => void;
  clearError: () => void;
  clearNotice: () => void;
  leave: () => void;
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
  const [myPseudo, setMyPseudo] = useState("");

  // Abonnement UNIQUE aux événements serveur (nettoyé au démontage).
  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setConnectionStatus("connected");
    };
    const onDisconnect = () => {
      setConnected(false);
      setConnectionStatus("disconnected");
    };
    // Les events de reconnexion (tentatives, succès, échec) sont émis par le
    // Manager (socket.io), pas par le Socket lui-même.
    const onReconnectAttempt = () => setConnectionStatus("reconnecting");
    const onReconnectFailed = () => setConnectionStatus("disconnected");
    const onCreated = () => setIsHost(true); // seul le créateur reçoit gameCreated
    const onLobby = (p: LobbyUpdatePayload) => setLobby(p);
    const onState = (v: PlayerView) => setView(v);
    const onError = (e: GameErrorPayload) => setError(e);
    // Reconnexion silencieuse après refresh : on retrouve notre siège et
    // notre pseudo, le lobby/l'état de jeu suivent via leurs events propres.
    const onSessionRestored = ({ seat, pseudo }: SessionRestoredPayload) => {
      setIsHost(seat === 0);
      setMyPseudo(pseudo);
    };
    // Session orpheline (ex. redémarrage serveur) : la partie n'existe plus
    // côté serveur. On purge la session locale et on revient à l'accueil
    // avec un message sobre (réaffiché via le bandeau d'erreur de Home).
    const onSessionExpired = () => {
      clearSessionId();
      setLobby(null);
      setView(null);
      setIsHost(false);
      setNotice("Cette partie a expiré, recrée-en une.");
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
    };
  }, []);

  const createGame = useCallback((pseudo: string) => {
    setError(null);
    setNotice(null);
    setMyPseudo(pseudo);
    socket.emit("createGame", { pseudo });
  }, []);

  const joinGame = useCallback((gameId: string, pseudo: string) => {
    setError(null);
    setNotice(null);
    setMyPseudo(pseudo);
    socket.emit("joinGame", { gameId, pseudo });
  }, []);

  const startGame = useCallback(() => {
    setError(null);
    setNotice(null);
    socket.emit("startGame");
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

  // Quitter : on coupe puis on rouvre la connexion → le serveur nous
  // retire de la partie (disconnect), et on repart d'un écran propre.
  const leave = useCallback(() => {
    setLobby(null);
    setView(null);
    setError(null);
    setNotice(null);
    setIsHost(false);
    socket.disconnect();
    socket.connect();
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
      myPseudo,
      createGame,
      joinGame,
      startGame,
      placeBid,
      playCard,
      chooseTrump,
      clearError,
      clearNotice,
      leave,
    }),
    [connected, connectionStatus, lobby, view, error, notice, isHost, myPseudo, createGame, joinGame, startGame, placeBid, playCard, chooseTrump, clearError, clearNotice, leave]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame doit être utilisé dans <GameProvider>.");
  return ctx;
}
