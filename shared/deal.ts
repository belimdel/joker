import type { Card, Suit } from "./cards";

// Le résultat d'une distribution.
export type DealResult = {
  hands: Card[][];        // hands[i] = la main du joueur i
  trumpSuit: Suit | null; // la couleur d'atout, ou null si "sans atout"
  trumpCard: Card | null; // la carte retournée (pour l'affichage). null si non applicable
};

// ─── Distribuer une manche ──────────────────────────────────────
// Entrées :
//   - playerCount : nombre de joueurs (4 en standard)
//   - cardsPerPlayer : combien de cartes chacun reçoit cette manche
//   - dealerIndex : le donneur (sert à retrouver SA dernière carte quand
//                   tout le paquet est distribué — voir plus bas)
//   - deck : un paquet DÉJÀ MÉLANGÉ (on le passe en paramètre plutôt
//            que de le créer dedans → fonction plus testable, on peut
//            lui donner un paquet connu pour tester)
export function deal(
  playerCount: number,
  cardsPerPlayer: number,
  dealerIndex: number,
  deck: Card[]
): DealResult {
  const totalNeeded = playerCount * cardsPerPlayer;

  if (totalNeeded > deck.length) {
    throw new Error(
      `Pas assez de cartes : besoin de ${totalNeeded}, paquet de ${deck.length}`
    );
  }

  // On initialise une main vide par joueur
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);

  // Distribution une par une (carte 0 → joueur 0, carte 1 → joueur 1, ...)
  // Le modulo fait tourner le tour de distribution entre les joueurs.
  for (let i = 0; i < totalNeeded; i++) {
    const joueur = i % playerCount;
    hands[joueur].push(deck[i]);
  }

  // Détermination de l'atout.
  let trumpCard: Card | null = null;

  if (totalNeeded < deck.length) {
    // Cas normal : il reste des cartes → on retourne la suivante.
    trumpCard = deck[totalNeeded];
  } else {
    // Paquet ENTIÈREMENT distribué (ex. donne à 9 cartes × 4 joueurs) :
    // il ne reste rien à retourner, alors on RÉVÈLE la dernière carte
    // distribuée au donneur. Elle reste dans sa main (juste montrée) ;
    // le donneur la jouera normalement.
    const dealerHand = hands[dealerIndex];
    trumpCard = dealerHand.length > 0 ? dealerHand[dealerHand.length - 1] : null;
  }

  // La couleur d'atout vient de la carte retournée. Si c'est un joker
  // (ou s'il n'y a pas de carte), la manche est "sans atout".
  const trumpSuit: Suit | null =
    trumpCard !== null && trumpCard.type === "normal" ? trumpCard.suit : null;

  return { hands, trumpSuit, trumpCard };
}

// ─── Distribution en deux temps (manches à 9 cartes) ─────────────
// Sur ces manches, le 1er joueur choisit l'atout avant que le reste
// des cartes ne soit distribué (cf. round.ts : phase "choosing-trump").

// Le résultat d'une 1re distribution partielle.
export type PartialDealResult = {
  hands: Card[][];      // hands[firstSpeaker] = 3 cartes, les autres mains sont vides
  remainingDeck: Card[]; // le reste du paquet, à distribuer après le choix
};

// ─── Distribuer les 3 premières cartes au 1er joueur ────────────
// Le reste du paquet est conservé tel quel (remainingDeck), pour être
// distribué par dealRemaining une fois l'atout choisi.
export function dealFirstThree(
  playerCount: number,
  firstSpeaker: number,
  deck: Card[]
): PartialDealResult {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  hands[firstSpeaker] = deck.slice(0, 3);
  return { hands, remainingDeck: deck.slice(3) };
}

// ─── Compléter la distribution après le choix d'atout ───────────
// Distribue remainingDeck en tournant siège par siège (0, 1, 2, ...),
// en ne servant que les joueurs dont la main n'a pas encore atteint
// cardsPerPlayer. Le joueur qui a déjà reçu ses 3 cartes (cf.
// dealFirstThree) en reçoit donc moins que les autres au total.
// Retourne de NOUVELLES mains (hands n'est pas muté).
export function dealRemaining(
  playerCount: number,
  cardsPerPlayer: number,
  hands: Card[][],
  remainingDeck: Card[]
): Card[][] {
  const result = hands.map((h) => [...h]);

  let i = 0;
  while (result.some((h) => h.length < cardsPerPlayer)) {
    for (let p = 0; p < playerCount; p++) {
      if (result[p].length < cardsPerPlayer) {
        result[p].push(remainingDeck[i]);
        i++;
      }
    }
  }

  return result;
}
