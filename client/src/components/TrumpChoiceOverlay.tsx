import type { Card, Suit } from "@shared/cards";
import { PlayingCard } from "./PlayingCard";
import { useGame } from "../GameContext";

// Couleurs d'atout proposées (mêmes glyphes que JokerModal).
const SUIT_META: Record<Suit, { glyph: string; name: string; red: boolean }> = {
  spades: { glyph: "♠", name: "Pique", red: false },
  hearts: { glyph: "♥", name: "Cœur", red: true },
  diamonds: { glyph: "♦", name: "Carreau", red: true },
  clubs: { glyph: "♣", name: "Trèfle", red: false },
};
const SUITS_ORDER: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

// Clé stable d'une carte (cf. Board.tsx).
function cardKey(card: Card): string {
  return card.type === "joker" ? card.id : `${card.suit}-${card.rank}`;
}

export type TrumpChoiceOverlayProps = {
  hand: Card[]; // mes 3 premières cartes (view.trumpChoiceHand, non-null)
};

// ─── Overlay de choix de l'atout (manches à 9 cartes) ────────────
// Affiché UNIQUEMENT pendant ma phase "choosing-trump" (trumpChoiceHand
// non-null ⇔ c'est mon tour, cf. Board). Le client ne valide rien : il
// se contente d'émettre l'intention via le contexte, le serveur fait autorité.
export function TrumpChoiceOverlay({ hand }: TrumpChoiceOverlayProps) {
  const { chooseTrump } = useGame();

  return (
    <div
      className="jk-modal jk-modal--clear"
      role="dialog"
      aria-modal="true"
      aria-label="Choisir l'atout"
    >
      <div className="jk-panel jk-modal__panel jk-fade-up">
        <div className="jk-eyebrow">Vos 3 premières cartes</div>
        <h2 className="jk-bidoverlay__title">Choisissez l'atout</h2>

        <div className="jk-modal__row">
          {hand.map((card, i) => (
            <PlayingCard key={cardKey(card)} card={card} size="md" dealIndex={i} />
          ))}
        </div>

        <div className="jk-modal__group">
          <span className="jk-label">Couleur d'atout</span>
          <div className="jk-modal__row">
            {SUITS_ORDER.map((s) => (
              <button
                type="button"
                key={s}
                className={`jk-btn jk-modal__suit ${SUIT_META[s].red ? "is-red" : ""}`}
                onClick={() => chooseTrump(s)}
                aria-label={SUIT_META[s].name}
              >
                {SUIT_META[s].glyph}
              </button>
            ))}
          </div>
        </div>

        <div className="jk-modal__actions">
          <button type="button" className="jk-btn jk-btn--ghost" onClick={() => chooseTrump(null)}>
            Passer (sans atout)
          </button>
        </div>
      </div>
    </div>
  );
}
