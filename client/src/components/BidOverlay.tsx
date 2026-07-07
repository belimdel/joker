import { isBidAllowed, forbiddenLastBid } from "@shared/bidding";
import type { PlayerView } from "@shared/views";

export type BidOverlayProps = {
  view: PlayerView;
  onBid: (bid: number) => void;
};

// ─── Overlay d'enchère ──────────────────────────────────────────────
// Affiché UNIQUEMENT quand c'est à MOI d'enchérir. On montre TOUS les
// chiffres possibles (0..cardsPerPlayer, autant que de cartes en main) et
// on GRISE ceux qui sont interdits — pour le donneur, le chiffre qui
// ferait tomber le total pile sur le nombre de cartes (règle du hook).
// UX seulement : le serveur revalide chaque enchère.
export function BidOverlay({ view, onBid }: BidOverlayProps) {
  const previousBids = view.bids.filter((b): b is number => b !== null);
  const isLastBidder = view.you === view.dealerIndex;
  const announced = previousBids.reduce((s, b) => s + b, 0);
  const forbidden = isLastBidder ? forbiddenLastBid(view.cardsPerPlayer, previousBids) : null;
  // 0..cardsPerPlayer inclus : un bouton par enchère possible.
  const numbers = Array.from({ length: view.cardsPerPlayer + 1 }, (_, n) => n);

  return (
    <div
      className="jk-modal jk-modal--bidding"
      role="dialog"
      aria-modal="true"
      aria-label="Choisir son enchère"
    >
      <div className="jk-panel jk-modal__panel jk-bidoverlay__panel jk-fade-up">
        <div className="jk-eyebrow">Votre enchère</div>
        <h2 className="jk-bidoverlay__title">Combien de plis ?</h2>
        <div className="jk-bidoverlay__grid">
          {numbers.map((n) => {
            const allowed = isBidAllowed(n, view.cardsPerPlayer, previousBids, isLastBidder);
            return (
              <button
                type="button"
                key={n}
                className="jk-btn jk-btn--primary jk-bidoverlay__btn"
                disabled={!allowed}
                title={!allowed ? "Total interdit (règle du donneur)" : undefined}
                onClick={() => onBid(n)}
              >
                {n}
              </button>
            );
          })}
        </div>
        <p className="jk-bidoverlay__hook">
          Plis annoncés : <strong>{announced}</strong> / {view.cardsPerPlayer}
          {isLastBidder && forbidden !== null && (
            <>
              {" "}· vous ne pouvez pas dire <strong>{forbidden}</strong>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
