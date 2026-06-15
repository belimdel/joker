import type { Card, Suit, Rank } from "./cards";
import { rankStrength } from "./cards";

export type JokerAnnounce = "high" | "low";

// Une carte jouée. Les champs announce/declaredSuit ne sont remplis
// que pour les jokers (compromis assumé : champs optionnels).
export type PlayedCard = {
  playerIndex: number;
  card: Card;
  announce?: JokerAnnounce;    // 'high' ou 'low' si c'est un joker
  declaredSuit?: Suit | null;  // couleur imposée si le joker est MENÉ
};

// ─── Déterminer la couleur demandée ─────────────────────────────
// Normalement c'est la couleur de la 1re carte. MAIS si un joker mène,
// c'est la couleur qu'il a déclarée (declaredSuit). Un joker mené 'bas'
// peut aussi déclarer une couleur que les autres doivent suivre.
// Exportée : round.ts s'en sert pour la légalité des coups (source unique).
export function getLedSuit(plays: PlayedCard[]): Suit | null {
  const first = plays[0];
  if (first.card.type === "joker") {
    return first.declaredSuit ?? null;
  }
  return first.card.suit;
}

// ─── La fonction principale ─────────────────────────────────────
export function determineTrickWinner(
  plays: PlayedCard[],
  trumpSuit: Suit | null
): number {
  const ledSuit = getLedSuit(plays);

  // ── EXCEPTION B (calcul préalable) ──────────────────────────
  // Le joker MENÉ est-il un joker 'haut' désignant une couleur NON-atout ?
  // Dans ce cas précis, un atout joué par un joueur peut le battre.
  const first = plays[0];
  const ledJokerHighNonTrump =
    first.card.type === "joker" &&
    first.announce === "high" &&
    first.declaredSuit != null &&
    first.declaredSuit !== trumpSuit;

  // ── CAS 1 : présence de joker(s) 'haut' ─────────────────────
  const highJokers = plays.filter(
    (p) => p.card.type === "joker" && p.announce === "high"
  );

  if (highJokers.length > 0) {
    // Exception B : un joker haut mené sur couleur non-atout peut être
    // battu par un atout. On vérifie s'il existe un atout joué.
    if (ledJokerHighNonTrump) {
      const trumpPlays = plays.filter(
        (p) => p.card.type === "normal" && p.card.suit === trumpSuit
      );
      if (trumpPlays.length > 0) {
        // Le plus haut atout l'emporte sur le joker haut mené.
        return highestTrump(trumpPlays);
      }
    }

    // Exception A : si plusieurs jokers 'haut', le DERNIER joué gagne.
    // (plays est dans l'ordre de jeu, donc on prend le dernier du filtre)
    return highJokers[highJokers.length - 1].playerIndex;
  }

  // ── CAS 2 : pas de joker 'haut'. Logique de pli classique ───
  // On ignore les jokers 'bas' pour l'instant (ils ne gagnent qu'en
  // dernier recours, cas C). On ne compare que les cartes normales.
 // ── CAS 2 : pas de joker 'haut'. Logique de pli classique ───
  // On ne garde que les cartes ÉLIGIBLES à gagner : un atout, ou une
  // carte de la couleur demandée. Les défausses pures sont écartées.
  const eligiblePlays = plays.filter((p) => {
    if (p.card.type !== "normal") return false;
    const isTrump = trumpSuit !== null && p.card.suit === trumpSuit;
    const followsLed = ledSuit !== null && p.card.suit === ledSuit;
    return isTrump || followsLed;
  });

  if (eligiblePlays.length > 0 && ledSuit !== null) {
    let winner = eligiblePlays[0];
    for (let i = 1; i < eligiblePlays.length; i++) {
      const candidate = eligiblePlays[i];
      if (candidate.card.type !== "normal" || winner.card.type !== "normal") {
        continue;
      }
      if (beats(candidate.card, winner.card, ledSuit, trumpSuit)) {
        winner = candidate;
      }
    }
    return winner.playerIndex;
  }

  // ── CAS 3 (Exception C) : il ne reste qu'un joker mené 'bas' ─
  // Personne n'a joué la couleur demandée ni un atout ni un joker haut.
  // Le joker mené gagne par défaut.
  return plays[0].playerIndex;
}

// ─── Helper : le plus haut atout parmi des cartes jouées ────────
// trumpPlays est déjà filtré par l'appelant (cartes de trumpSuit
// uniquement) : pas besoin de la couleur ici, seule la force compte.
function highestTrump(trumpPlays: PlayedCard[]): number {
  let best = trumpPlays[0];
  for (let i = 1; i < trumpPlays.length; i++) {
    const cand = trumpPlays[i];
    if (cand.card.type === "normal" && best.card.type === "normal") {
      if (rankStrength(cand.card.rank) > rankStrength(best.card.rank)) {
        best = cand;
      }
    }
  }
  return best.playerIndex;
}

// ─── La carte A bat-elle la carte B ? (cartes normales only) ────
function beats(
  candidate: { suit: Suit; rank: Rank },
  current: { suit: Suit; rank: Rank },
  ledSuit: Suit,
  trumpSuit: Suit | null
): boolean {
  const candIsTrump = trumpSuit !== null && candidate.suit === trumpSuit;
  const currIsTrump = trumpSuit !== null && current.suit === trumpSuit;

  if (candIsTrump && !currIsTrump) return true;
  if (!candIsTrump && currIsTrump) return false;

  if (candIsTrump && currIsTrump) {
    return rankStrength(candidate.rank) > rankStrength(current.rank);
  }

  const candFollowsLed = candidate.suit === ledSuit;
  const currFollowsLed = current.suit === ledSuit;

  if (candFollowsLed && !currFollowsLed) return true;
  if (!candFollowsLed) return false;

  return rankStrength(candidate.rank) > rankStrength(current.rank);
}