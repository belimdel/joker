import { useState } from "react";
import type { GameMode, KhishtiPenalty } from "@shared/game";
import { useAuth } from "../AuthContext";

// Bottom-sheet de création de room (façon app mobile) : type de partie
// (Practice / Ranked), room privée, mode (Standard / Only 9 — Quick et
// Lucky arrivent plus tard), mise Dring (pénalité khishti), et des
// options vitrines grisées (Insurance, Pairs, Old School, Strip).
export type RoomDraft = {
  visibility: "public" | "private";
  mode: GameMode;
  khishtiPenalty: KhishtiPenalty;
  ranked: boolean;
  pairs: boolean; // mode 2 contre 2 (partenaires en face)
};

type CreateRoomModalProps = {
  onClose: () => void;
  onCreate: (draft: RoomDraft) => void;
  canSubmit: boolean;
};

export function CreateRoomModal({ onClose, onCreate, canSubmit }: CreateRoomModalProps) {
  const { user } = useAuth();
  const [ranked, setRanked] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [mode, setMode] = useState<GameMode>("standard");
  const [stake, setStake] = useState<KhishtiPenalty>(200);
  const [pairs, setPairs] = useState(false);

  return (
    <div className="jk-sheet-backdrop" onClick={onClose}>
      <div className="jk-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="jk-sheet__head">
          <span className="jk-sheet__title">Create Public Room</span>
          <button className="jk-sheet__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="jk-sheet__body">
          {/* ── Type de partie ── */}
          <div>
            <div className="jk-sheet__sectionhead">
              <span className="jk-sheet__sectiontitle">Play</span>
              <span className="jk-optrow__end">
                🔒
                <button
                  className={`jk-switch ${isPrivate ? "is-on" : ""}`}
                  onClick={() => setIsPrivate(!isPrivate)}
                  aria-label="Room privée"
                />
              </span>
            </div>
            <button className="jk-optrow" onClick={() => setRanked(false)}>
              <span className="jk-optrow__check">{!ranked ? "✓" : ""}</span>
              <span className="jk-optrow__label">Practice</span>
            </button>
            <button
              className="jk-optrow"
              onClick={() => setRanked(true)}
              disabled={!user}
            >
              <span className="jk-optrow__check">{ranked ? "✓" : ""}</span>
              <span className="jk-optrow__label">Ranked Game</span>
              <span className="jk-optrow__end">
                {!user && <span className="jk-optrow__hint">Compte requis</span>}⭐
              </span>
            </button>
            <button className="jk-optrow" disabled>
              <span className="jk-optrow__check" />
              <span className="jk-optrow__label">
                Strip Mode <span className="jk-soon">Bientôt</span>
              </span>
              <span className="jk-optrow__end">🕴</span>
            </button>
          </div>

          {/* ── Mode de jeu ── */}
          <div className="jk-seg">
            <button
              className={`jk-seg__opt ${mode === "standard" ? "is-active" : ""}`}
              onClick={() => setMode("standard")}
            >
              <span className="jk-seg__title">Standard</span>
              <span className="jk-seg__sub">Duration: ~25 min.</span>
            </button>
            <button
              className={`jk-seg__opt ${mode === "only9" ? "is-active" : ""}`}
              onClick={() => setMode("only9")}
            >
              <span className="jk-seg__title">Only 9</span>
              <span className="jk-seg__sub">Duration: ~20 min.</span>
            </button>
            <button className="jk-seg__opt" disabled title="Bientôt disponible">
              <span className="jk-seg__title">Quick</span>
              <span className="jk-seg__sub">Bientôt</span>
            </button>
            <button className="jk-seg__opt" disabled title="Bientôt disponible">
              <span className="jk-seg__title">Lucky</span>
              <span className="jk-seg__sub">Bientôt</span>
            </button>
          </div>

          {/* ── Mise Dring (pénalité khishti) ── */}
          <div>
            <div className="jk-sheet__sectionhead">
              <span className="jk-sheet__sectiontitle">Dring</span>
              <button className="jk-vip-cta" disabled title="Bientôt disponible">
                Become VIP member
              </button>
            </div>
            <div className="jk-seg" style={{ marginTop: "0.6rem" }}>
              {([200, 500, 1000] as KhishtiPenalty[]).map((v) => (
                <button
                  key={v}
                  className={`jk-seg__opt ${stake === v ? "is-active" : ""}`}
                  onClick={() => setStake(v)}
                >
                  <span className="jk-seg__title">-{v}</span>
                </button>
              ))}
              <button className="jk-seg__opt" disabled title="Bientôt disponible">
                <span className="jk-seg__title">Spec…</span>
              </button>
            </div>
          </div>

          {/* ── Options vitrines ── */}
          <div>
            <div className="jk-optrow jk-optrow--static">
              <span className="jk-optrow__label">
                🛡 Insurance Amount <span className="jk-new">New!</span>{" "}
                <span className="jk-soon">Bientôt</span>
              </span>
              <span className="jk-optrow__end">0 🪙</span>
            </div>
            <div className="jk-optrow jk-optrow--static">
              <span className="jk-optrow__label">Pairs</span>
              <span className="jk-optrow__end">
                2 VS 2{" "}
                <button
                  className={`jk-switch ${pairs ? "is-on" : ""}`}
                  onClick={() => setPairs(!pairs)}
                  aria-label="Mode 2 contre 2"
                  aria-pressed={pairs}
                />
              </span>
            </div>
            <div className="jk-optrow jk-optrow--static">
              <span className="jk-optrow__label">
                Old School Deck <span className="jk-soon">Bientôt</span>
              </span>
              <span className="jk-optrow__end">
                🂠 <button className="jk-switch" disabled aria-label="Old School Deck" />
              </span>
            </div>
            <div className="jk-optrow jk-optrow--static">
              <span className="jk-optrow__label">Anti-Cheat</span>
              <span className="jk-optrow__end">
                🛡{" "}
                <button
                  className="jk-switch is-on"
                  aria-label="Anti-Cheat (toujours actif)"
                  title="Toujours actif : le serveur fait autorité"
                />
              </span>
            </div>
          </div>
        </div>

        <footer className="jk-sheet__foot">
          <button
            className="jk-btn jk-btn--blue jk-btn--block"
            disabled={!canSubmit}
            onClick={() =>
              onCreate({
                visibility: isPrivate ? "private" : "public",
                mode,
                khishtiPenalty: stake,
                ranked,
                pairs,
              })
            }
          >
            Create Room
          </button>
        </footer>
      </div>
    </div>
  );
}
