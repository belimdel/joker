import { useState } from "react";
import { useGame } from "../GameContext";
import "./screens.css";

export function Lobby() {
  const { lobby, isHost, startGame, leaveGame } = useGame();
  const [copied, setCopied] = useState(false);

  if (!lobby) return null;
  const players = lobby.players;
  const full = players.length === 4;

  // 4 sièges, remplis ou libres.
  const seats = [0, 1, 2, 3].map(
    (seat) => players.find((p) => p.seat === seat) ?? null
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lobby.gameId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* le presse-papiers peut être indisponible : on ignore */
    }
  };

  return (
    <div className="jk-lobby">
      <header className="jk-lobby__head jk-fade-up">
        <div className="jk-eyebrow">Salle d'attente</div>
      </header>

      <div className="jk-panel jk-lobby__panel jk-fade-up">
        <div className="jk-code">
          <span className="jk-label">Code à partager</span>
          <div className="jk-code__value">
            <span className="jk-code__text">{lobby.gameId}</span>
            <button className="jk-btn jk-btn--ghost jk-code__copy" onClick={copy}>
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
        </div>

        <div className="jk-seats">
          {seats.map((p, i) => {
            const lvl = p ? (lobby.playerLevels?.[i] ?? null) : null;
            return (
              <div key={i} className={`jk-seat ${p ? "is-filled" : ""}`}>
                <span className="jk-seat__num">Siège {i + 1}</span>
                <span className="jk-seat__name">
                  {p ? p.pseudo : "Libre…"}
                  {lvl != null && <span className="jk-seat__level"> niv.{lvl}</span>}
                </span>
              </div>
            );
          })}
        </div>

        <div className="jk-lobby__count">{players.length} / 4 joueurs</div>

        {isHost ? (
          <button
            className="jk-btn jk-btn--primary jk-btn--block"
            disabled={!full}
            onClick={startGame}
          >
            {full ? "Démarrer la partie" : "En attente de 4 joueurs"}
          </button>
        ) : (
          <div className="jk-lobby__wait">
            En attente que l'hôte démarre la partie…
          </div>
        )}

        <button className="jk-btn jk-btn--ghost jk-btn--block" onClick={leaveGame}>
          Quitter
        </button>
      </div>
    </div>
  );
}
