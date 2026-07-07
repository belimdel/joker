import { useEffect, useState } from "react";
import { useGame } from "../GameContext";
import { useAuth } from "../AuthContext";
import { Avatar } from "../components/Avatar";
import { rankLabel } from "../components/RankBadge";
import { CreateRoomModal, type RoomDraft } from "../components/CreateRoomModal";
import type { PublicGamePlayer, PublicGameSummary } from "@shared/events";
import "./screens.css";

// Pseudo d'invité persistant (façon « Jok673693 » de l'app de référence).
function guestPseudo(): string {
  const KEY = "jk_guest_pseudo";
  let p = localStorage.getItem(KEY);
  if (!p) {
    p = `Jok${Math.floor(100000 + Math.random() * 900000)}`;
    localStorage.setItem(KEY, p);
  }
  return p;
}

function RoomCard({
  game,
  onJoin,
  disabled,
}: {
  game: PublicGameSummary;
  onJoin: () => void;
  disabled: boolean;
}) {
  // 4 emplacements : joueurs présents puis sièges vides.
  const seats: (PublicGamePlayer | null)[] = [...game.players];
  while (seats.length < 4) seats.push(null);
  const full = game.playerCount >= 4;

  return (
    <div className="jk-room-card jk-fade-up">
      <div className="jk-room-card__head">
        {game.ranked && <span className="jk-pill jk-pill--star">⭐</span>}
        <span className="jk-pill jk-pill--mode">
          {game.mode === "only9" ? "Only 9" : "Standard"}
        </span>
        <span className="jk-pill">-{game.khishtiPenalty}</span>
        {game.hostLevel != null && rankLabel(game.hostLevel) === "Master" && (
          <span className="jk-pill jk-pill--red">Master</span>
        )}
        <button
          className="jk-btn jk-btn--primary jk-btn--sm"
          disabled={disabled || full}
          onClick={onJoin}
        >
          Play
        </button>
      </div>
      <div className="jk-room-card__seats">
        {seats.map((p, i) => (
          <span key={i} style={{ display: "contents" }}>
            {i === 2 && game.pairs && <span className="jk-room-card__vs">VS</span>}
            <span className="jk-room-card__seat">
              <Avatar name={p ? p.pseudo : null} size={52} />
              {p && (
                <>
                  <span className="jk-room-card__seatname">{p.pseudo}</span>
                  <span className="jk-room-card__seatrank">{rankLabel(p.level)}</span>
                </>
              )}
            </span>
          </span>
        ))}
      </div>
      <div className="jk-room-card__code">Code {game.roomCode}</div>
    </div>
  );
}

type PlayProps = {
  onLogin: () => void;
};

export function Play({ onLogin: _onLogin }: PlayProps) {
  const {
    createGame,
    joinGame,
    startTestGame,
    error,
    notice,
    connected,
    publicGames,
    activeGameRoom,
    rejoin,
    refreshPublicGames,
  } = useGame();
  const { user } = useAuth();

  // (Re)rejoint la room lobby-browser à l'affichage de Play : on quitte cette
  // room en créant/rejoignant une partie et on n'y est pas réinscrit au retour,
  // sinon les nouvelles rooms n'apparaissent qu'après un rechargement.
  useEffect(() => {
    if (connected) refreshPublicGames();
  }, [connected, refreshPublicGames]);
  const [showCreate, setShowCreate] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [code, setCode] = useState("");

  const pseudo = user ? user.username : guestPseudo();
  const locked = activeGameRoom != null;
  const canAct = connected && !locked;

  const create = (draft: RoomDraft) => {
    setShowCreate(false);
    createGame(pseudo, draft);
  };

  return (
    <div className="jk-play">
      <h1 className="jk-play__title jk-fade-up">Play Joker</h1>

      <div className="jk-play__actions jk-fade-up">
        <button
          className="jk-btn jk-btn--ghost"
          onClick={() => setShowFind((v) => !v)}
        >
          🔍 Find Room
        </button>
        <button
          className="jk-btn jk-btn--primary"
          disabled={!canAct}
          onClick={() => setShowCreate(true)}
        >
          ＋ Create Room
        </button>
      </div>

      {showFind && (
        <div className="jk-find-row jk-fade-up">
          <input
            className="jk-input jk-input--code"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
          />
          <button
            className="jk-btn jk-btn--primary"
            disabled={!canAct || code.trim().length === 0}
            onClick={() => joinGame(code.trim(), pseudo)}
          >
            Join
          </button>
        </div>
      )}

      {locked && (
        <div className="jk-active-game">
          <div className="jk-active-game__text">
            <strong>Partie en cours</strong>
            <span>Une partie démarrée vous attend (table {activeGameRoom}).</span>
          </div>
          <button
            type="button"
            className="jk-btn jk-btn--blue jk-btn--sm"
            onClick={rejoin}
            disabled={!connected}
          >
            Rejoindre
          </button>
        </div>
      )}

      {notice && (
        <div className="jk-error" style={{ background: "rgba(59,130,224,.9)" }}>
          ℹ {notice}
        </div>
      )}
      {error && <div className="jk-error">⚠ {error.message}</div>}

      {/* ── Tournois (vitrine) ── */}
      <section>
        <div className="jk-play__section-title">Tournaments</div>
        <div className="jk-play__section-sub">🏆 Weekly Championship</div>
        <div className="jk-tourney-card">
          <div className="jk-tourney-card__name">EU 🇪🇺</div>
          <div className="jk-tourney-card__players">
            Players <span>0 / 8</span>
          </div>
          <div className="jk-tourney-card__bar" />
          <div className="jk-tourney-card__row">
            <button className="jk-btn jk-btn--ghost" disabled title="Bientôt disponible">
              Prizes &amp; More
            </button>
            <button className="jk-btn jk-btn--blue" disabled title="Bientôt disponible">
              Play 1x 🪙
            </button>
          </div>
          <div style={{ textAlign: "center" }}>
            <span className="jk-soon">Bientôt disponible</span>
          </div>
        </div>
      </section>

      {/* ── Rooms publiques ── */}
      <section>
        <div className="jk-play__section-title">Public Rooms</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", marginTop: "0.7rem" }}>
          {publicGames.length === 0 && (
            <div className="jk-panel--soft jk-panel" style={{ padding: "1.2rem", textAlign: "center" }}>
              Aucune room ouverte — crée la tienne !
            </div>
          )}
          {publicGames.map((g) => (
            <RoomCard
              key={g.roomCode}
              game={g}
              disabled={!canAct}
              onJoin={() => joinGame(g.roomCode, pseudo)}
            />
          ))}
        </div>
      </section>

      <button
        className="jk-btn jk-btn--ghost jk-btn--block"
        disabled={!canAct}
        onClick={() => startTestGame(pseudo)}
      >
        Partie solo (test)
      </button>

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreate={create}
          canSubmit={canAct}
        />
      )}
    </div>
  );
}
