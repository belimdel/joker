import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { socket } from "./socket";
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
type GameContextValue = {
  connected: boolean;
  lobby: LobbyUpdatePayload | null;
  view: PlayerView | null;
  error: GameErrorPayload | null;
  isHost: boolean; // ai-je créé la partie (siège 0) ?
  myPseudo: string;

  createGame: (pseudo: string) => void;
  joinGame: (gameId: string, pseudo: string) => void;
  startGame: () => void;
  placeBid: (bid: number) => void;
  playCard: (card: Card, announce?: JokerAnnounce, declaredSuit?: Suit | null) => void;
  clearError: () => void;
  leave: () => void;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(socket.connected);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<GameErrorPayload | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [myPseudo, setMyPseudo] = useState("");

  // Abonnement UNIQUE aux événements serveur (nettoyé au démontage).
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
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

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("gameCreated", onCreated);
    socket.on("lobbyUpdate", onLobby);
    socket.on("gameStateUpdate", onState);
    socket.on("gameError", onError);
    socket.on("sessionRestored", onSessionRestored);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("gameCreated", onCreated);
      socket.off("lobbyUpdate", onLobby);
      socket.off("gameStateUpdate", onState);
      socket.off("gameError", onError);
      socket.off("sessionRestored", onSessionRestored);
    };
  }, []);

  const createGame = useCallback((pseudo: string) => {
    setError(null);
    setMyPseudo(pseudo);
    socket.emit("createGame", { pseudo });
  }, []);

  const joinGame = useCallback((gameId: string, pseudo: string) => {
    setError(null);
    setMyPseudo(pseudo);
    socket.emit("joinGame", { gameId, pseudo });
  }, []);

  const startGame = useCallback(() => {
    setError(null);
    socket.emit("startGame");
  }, []);

  const placeBid = useCallback((bid: number) => {
    setError(null);
    socket.emit("placeBid", { bid });
  }, []);

  const playCard = useCallback(
    (card: Card, announce?: JokerAnnounce, declaredSuit?: Suit | null) => {
      setError(null);
      socket.emit("playCard", { card, announce, declaredSuit });
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  // Quitter : on coupe puis on rouvre la connexion → le serveur nous
  // retire de la partie (disconnect), et on repart d'un écran propre.
  const leave = useCallback(() => {
    setLobby(null);
    setView(null);
    setError(null);
    setIsHost(false);
    socket.disconnect();
    socket.connect();
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      connected,
      lobby,
      view,
      error,
      isHost,
      myPseudo,
      createGame,
      joinGame,
      startGame,
      placeBid,
      playCard,
      clearError,
      leave,
    }),
    [connected, lobby, view, error, isHost, myPseudo, createGame, joinGame, startGame, placeBid, playCard, clearError, leave]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame doit être utilisé dans <GameProvider>.");
  return ctx;
}
