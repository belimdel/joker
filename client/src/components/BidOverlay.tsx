import { allowedBids } from "@shared/bidding";
import type { PlayerView } from "@shared/views";

export type BidOverlayProps = {
  view: PlayerView;
  onBid: (bid: number) => void;
};

// ─── Overlay d'enchère ──────────────────────────────────────────────
// Affiché UNIQUEMENT quand c'est à MOI d'enchérir : les choix possibles
// (allowedBids — UX seulement, le serveur revalide) en gros boutons,
// surélevés et bien visibles au centre de l'écran.
export function BidOverlay({ view, onBid }: BidOverlayProps) {
  const previousBids = view.bids.filter((b): b is number => b !== null);
  const isLastBidder = view.you === view.dealerIndex;
  const options = allowedBids(view.cardsPerPlayer, previousBids, isLastBidder);

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
          {options.map((n) => (
            <button
              type="button"
              key={n}
              className="jk-btn jk-btn--primary jk-bidoverlay__btn"
              onClick={() => onBid(n)}
            >
              {n}
            </button>
          ))}
        </div>
        {isLastBidder && (
          <p className="jk-bidoverlay__hook">
            Donneur : le total des mises ne peut pas faire {view.cardsPerPlayer}.
          </p>
        )}
      </div>
    </div>
  );
}
