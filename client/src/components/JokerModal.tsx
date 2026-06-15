import { useState } from "react";
import type { Card, Suit } from "@shared/cards";
import type { JokerAnnounce } from "@shared/trick";
import { PlayingCard } from "./PlayingCard";

// Couleurs proposées quand le Joker MÈNE le pli (il impose alors une
// couleur que les autres devront suivre). Glyphe + teinte pour le rendu.
const SUIT_META: Record<Suit, { glyph: string; red: boolean }> = {
  spades: { glyph: "♠", red: false },
  hearts: { glyph: "♥", red: true },
  diamonds: { glyph: "♦", red: true },
  clubs: { glyph: "♣", red: false },
};
const SUITS_ORDER: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export type JokerModalProps = {
  card: Card; // le joker que l'on s'apprête à jouer
  mustDeclareSuit: boolean; // true si le joker mène (currentTrick vide)
  onConfirm: (announce: JokerAnnounce, declaredSuit: Suit | null) => void;
  onCancel: () => void;
};

// ─── Modale de jeu d'un Joker ────────────────────────────────────
// Un Joker n'a de sens qu'une fois ANNONCÉ haut/bas ; et s'il mène le
// pli, il doit DÉCLARER une couleur. On collecte ces choix ici avant
// d'émettre le coup. Le front ne valide rien lui-même : il se contente
// de réunir les paramètres attendus par le serveur (qui fait autorité).
export function JokerModal({ card, mustDeclareSuit, onConfirm, onCancel }: JokerModalProps) {
  const [announce, setAnnounce] = useState<JokerAnnounce | null>(null);
  const [suit, setSuit] = useState<Suit | null>(null);

  // Prêt à confirmer : annonce choisie, et couleur choisie si le joker mène.
  const ready = announce !== null && (!mustDeclareSuit || suit !== null);

  return (
    <div className="jk-modal jk-modal--clear" role="dialog" aria-modal="true" aria-label="Jouer un Joker">
      <div className="jk-panel jk-modal__panel jk-fade-up">
        <div className="jk-eyebrow">Jouer le Joker</div>

        <div className="jk-modal__card">
          <PlayingCard card={card} size="lg" />
        </div>

        <div className="jk-modal__group">
          <span className="jk-label">Annonce</span>
          <div className="jk-modal__row">
            <button
              type="button"
              className={`jk-btn ${announce === "high" ? "jk-btn--primary" : ""}`}
              onClick={() => setAnnounce("high")}
            >
              ↑ Haut
            </button>
            <button
              type="button"
              className={`jk-btn ${announce === "low" ? "jk-btn--primary" : ""}`}
              onClick={() => setAnnounce("low")}
            >
              ↓ Bas
            </button>
          </div>
        </div>

        {mustDeclareSuit && (
          <div className="jk-modal__group">
            <span className="jk-label">Couleur imposée (le Joker mène)</span>
            <div className="jk-modal__row">
              {SUITS_ORDER.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`jk-btn jk-modal__suit ${SUIT_META[s].red ? "is-red" : ""} ${
                    suit === s ? "jk-btn--primary" : ""
                  }`}
                  onClick={() => setSuit(s)}
                  aria-label={s}
                >
                  {SUIT_META[s].glyph}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="jk-modal__actions">
          <button type="button" className="jk-btn jk-btn--ghost" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className="jk-btn jk-btn--primary"
            disabled={!ready}
            onClick={() => onConfirm(announce!, mustDeclareSuit ? suit : null)}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
