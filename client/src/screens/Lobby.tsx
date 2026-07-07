import { useState } from "react";
import { useGame } from "../GameContext";
import { Avatar } from "../components/Avatar";
import { rankLabel } from "../components/RankBadge";
import { JokerLogo } from "../components/JokerLogo";
import "./screens.css";

export function Lobby() {
  const { lobby, isHost, mySeat, chooseSeat, startGame, leaveGame } = useGame();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  if (!lobby) return null;
  const players = lobby.players;
  const full = players.length === 4;
  const pairs = lobby.pairs;

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

  const start = () => {
    setStarting(true);
    startGame();
  };

  // Overlay « la partie démarre » : après le clic de l'hôte, ou quand le
  // serveur a marqué la room in-progress (la vue de jeu arrive juste après).
  const showStarting = starting || lobby.status === "in-progress";

  return (
    <div className="jk-lobby">
      <header className="jk-lobby__head jk-fade-up">
        <div className="jk-eyebrow">Salle d'attente</div>
      </header>

      <div className="jk-panel jk-lobby__panel jk-fade-up">
        <div className="jk-lobby__badges">
          {lobby.ranked && <span className="jk-pill jk-pill--star">⭐ Ranked</span>}
          <span className="jk-pill jk-pill--mode">
            {lobby.mode === "only9" ? "Only 9" : "Standard"}
          </span>
          <span className="jk-pill">-{lobby.khishtiPenalty}</span>
        </div>

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
            // Un siège LIBRE (et pas le mien) est cliquable → je m'y déplace.
            const canPick = !p && i !== mySeat;
            const seatClass = [
              "jk-seat",
              p && "is-filled",
              i === mySeat && "is-me",
              canPick && "is-pickable",
              pairs && (i % 2 === 0 ? "jk-seat--team-a" : "jk-seat--team-b"),
            ]
              .filter(Boolean)
              .join(" ");
            const inner = (
              <>
                <Avatar name={p ? p.pseudo : null} size={52} />
                <span className="jk-seat__name">{p ? p.pseudo : "Libre…"}</span>
                {p && (
                  <span className="jk-seat__level">
                    {rankLabel(lvl)}
                    {lvl != null && ` · niv.${lvl}`}
                  </span>
                )}
              </>
            );
            return (
              <span key={i} style={{ display: "contents" }}>
                {i === 2 && pairs && <span className="jk-seats__vs">VS</span>}
                {canPick ? (
                  <button
                    type="button"
                    className={seatClass}
                    onClick={() => chooseSeat(i)}
                    aria-label={`Prendre le siège ${i + 1}`}
                  >
                    {inner}
                  </button>
                ) : (
                  <span className={seatClass}>{inner}</span>
                )}
              </span>
            );
          })}
        </div>

        <div className="jk-lobby__count">
          {players.length} / 4 joueurs
          {pairs && " · 2 contre 2"}
        </div>

        {isHost ? (
          <button
            className="jk-btn jk-btn--blue jk-btn--block"
            disabled={!full}
            onClick={start}
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

      {showStarting && (
        <div className="jk-dimmer">
          <div className="jk-dimmer__card">
            <span style={{ color: "#fff" }}>
              <JokerLogo size={56} />
            </span>
            <span className="jk-dimmer__title">
              {lobby.ranked ? "Ranked game is starting" : "Game is starting"}
            </span>
            <span className="jk-dimmer__sub">Waiting for other players</span>
            <span className="jk-dimmer__note">Please don't close the app</span>
          </div>
        </div>
      )}
    </div>
  );
}
