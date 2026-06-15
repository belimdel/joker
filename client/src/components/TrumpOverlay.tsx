import type { Card, Suit } from "@shared/cards";
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
};

// ─── Overlay fixe (coin haut-droit) ────────────────────────────────
// L'atout reste visible en permanence, pendant les enchères ET le jeu,
// sans occuper le centre de la table (réservé au pli en cours).
export function TrumpOverlay({ trumpCard, trumpSuit }: TrumpOverlayProps) {
  return (
    <div className="jk-trumpoverlay">
      <span className="jk-eyebrow">Atout</span>
      <PlayingCard card={trumpCard ?? undefined} size="sm" />
      {trumpSuit && (
        <span
          className={`jk-trumpoverlay__suit ${SUIT_META[trumpSuit].red ? "is-red" : ""}`}
        >
          {SUIT_META[trumpSuit].glyph}
        </span>
      )}
    </div>
  );
}
