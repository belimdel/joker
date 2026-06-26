import type { Card, Suit } from "@shared/cards";
import type { RoundPhase } from "@shared/round";
import { PlayingCard } from "./PlayingCard";

const SUIT_META: Record<Suit, { glyph: string; red: boolean }> = {
  spades: { glyph: "♠", red: false },
  hearts: { glyph: "♥", red: true },
  diamonds: { glyph: "♦", red: true },
  clubs: { glyph: "♣", red: false },
};

export type TrumpOverlayProps = {
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  roundPhase: RoundPhase;
};

// ─── Overlay fixe (coin haut-droit) ────────────────────────────────
// L'atout reste visible en permanence, pendant les enchères ET le jeu,
// sans occuper le centre de la table (réservé au pli en cours).
//
// Sur les manches à 9 cartes, l'atout est une COULEUR choisie
// (trumpSuit) et non une carte retournée : trumpCard y est TOUJOURS
// null, choix fait ou non. Pour distinguer « couleur choisie », « passe
// (sans atout) » et « choix pas encore fait », trumpSuit seul ne suffit
// pas (null dans les deux derniers cas) : on s'appuie sur roundPhase.
export function TrumpOverlay({ trumpCard, trumpSuit, roundPhase }: TrumpOverlayProps) {
  const decided = roundPhase !== "choosing-trump";

  return (
    <div className="jk-trumpoverlay">
      <span className="jk-eyebrow">Atout</span>
      {trumpCard ? (
        <PlayingCard card={trumpCard} size="sm" />
      ) : trumpSuit ? (
        <span
          className={`jk-trumpoverlay__bigsuit ${SUIT_META[trumpSuit].red ? "is-red" : ""}`}
        >
          {SUIT_META[trumpSuit].glyph}
        </span>
      ) : decided ? (
        <span className="jk-trumpoverlay__none">Sans atout</span>
      ) : (
        <PlayingCard size="sm" />
      )}
    </div>
  );
}
