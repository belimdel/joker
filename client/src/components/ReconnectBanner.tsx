import { useGame } from "../GameContext";
import "./ReconnectBanner.css";

// Bandeau discret affiché uniquement quand la socket n'est pas connectée.
// Aucune logique de jeu ici : juste un retour visuel sur l'état réseau.
export function ReconnectBanner() {
  const { connectionStatus } = useGame();
  if (connectionStatus === "connected") return null;

  return (
    <div className="jk-reconnect-banner" role="status">
      Reconnexion en cours…
    </div>
  );
}
