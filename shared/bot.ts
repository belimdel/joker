import type { Card, Suit } from "./cards";
import type { JokerAnnounce } from "./trick";
import { allowedBids } from "./bidding";
import { isLegalPlay } from "./round";
import type { RoundState } from "./round";

// ─── Auto-jeu (timeout serveur) ──────────────────────────────────
// Quand le timer de 15s d'un joueur expire, le serveur joue À SA
// PLACE un coup LÉGAL via ces helpers — mêmes règles que pour un
// humain (placeBid/playCard revalident de toute façon). Fonctions
// pures : aucun accès réseau ni horloge ici.

// ─── Enchère automatique ─────────────────────────────────────────
// On choisit la PLUS PETITE enchère autorisée (la moins engageante).
// allowedBids() n'est jamais vide : cardsPerPlayer ≥ 1, et la
// contrainte du donneur n'exclut au plus qu'UNE seule valeur.
export function pickAutoBid(state: RoundState): number {
  const playerIndex = state.currentPlayer;
  const isLastBidder = playerIndex === state.dealerIndex;
  const previousBids = state.bids.filter((b): b is number => b !== null);
  const options = allowedBids(state.cardsPerPlayer, previousBids, isLastBidder);
  return options[0];
}

// ─── Coup automatique ────────────────────────────────────────────
// On préfère une carte NORMALE légale (aucune décision supplémentaire
// à prendre). À défaut, on joue un Joker légal, annoncé "low" (le
// moins contraignant pour les autres) ; s'il MÈNE le pli, on déclare
// l'atout (ou, à défaut d'atout, la première couleur de la main).
export function pickAutoCard(state: RoundState): {
  card: Card;
  announce?: JokerAnnounce;
  declaredSuit?: Suit | null;
} {
  const hand = state.hands[state.currentPlayer];

  for (const card of hand) {
    if (card.type === "normal" && isLegalPlay(hand, card, state.currentTrick, state.trumpSuit)) {
      return { card };
    }
  }

  for (const card of hand) {
    if (card.type === "joker" && isLegalPlay(hand, card, state.currentTrick, state.trumpSuit)) {
      const isLeading = state.currentTrick.length === 0;
      const declaredSuit: Suit | null = isLeading
        ? state.trumpSuit ?? firstSuitInHand(hand) ?? "spades"
        : null;
      return { card, announce: "low", declaredSuit };
    }
  }

  throw new Error(
    `pickAutoCard : aucune carte légale pour le joueur ${state.currentPlayer}.`
  );
}

// Première couleur normale trouvée dans une main (pour la déclaration
// d'un Joker meneur qui n'a ni atout ni couleur "naturelle" évidente).
function firstSuitInHand(hand: Card[]): Suit | null {
  for (const card of hand) {
    if (card.type === "normal") return card.suit;
  }
  return null;
}
