import { Card, Suit } from "./cards";

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
