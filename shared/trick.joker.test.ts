import { determineTrickWinner, PlayedCard } from "./trick";
import { Card } from "./cards";

const c = (suit: any, rank: any): Card => ({ type: "normal", suit, rank });
const joker = (id: any): Card => ({ type: "joker", id });

// ── Exception A : deux jokers 'haut', le 2nd gagne ──
// Joueur 0 mène joker1 haut (couleur cœur). Joueur 2 joue joker2 haut.
// Le second joker haut (joueur 2) doit gagner.
const tA: PlayedCard[] = [
  { playerIndex: 0, card: joker("joker1"), announce: "high", declaredSuit: "hearts" },
  { playerIndex: 1, card: c("hearts", "A") },
  { playerIndex: 2, card: joker("joker2"), announce: "high" },
];
console.log("Exception A (attendu 2) :", determineTrickWinner(tA, "spades"));

// ── Exception B : joker haut mené sur couleur NON-atout, un atout le bat ──
// Joueur 0 mène joker1 haut en désignant cœur. Atout = pique.
// Joueur 1 n'a pas de cœur et coupe au pique (atout) → l'atout gagne.
const tB: PlayedCard[] = [
  { playerIndex: 0, card: joker("joker1"), announce: "high", declaredSuit: "hearts" },
  { playerIndex: 1, card: c("spades", "7") }, // atout, bat le joker haut
  { playerIndex: 2, card: c("hearts", "K") },
];
console.log("Exception B (attendu 1) :", determineTrickWinner(tB, "spades"));

// ── Exception B bis : joker haut mené sur l'ATOUT → aucun atout ne le bat ──
// Même situation mais le joker désigne pique = atout. Là, l'exception B
// ne s'applique PAS, le joker haut gagne malgré l'atout joué.
const tBbis: PlayedCard[] = [
  { playerIndex: 0, card: joker("joker1"), announce: "high", declaredSuit: "spades" },
  { playerIndex: 1, card: c("spades", "A") },
  { playerIndex: 2, card: c("spades", "K") },
];
console.log("Exception B bis (attendu 0) :", determineTrickWinner(tBbis, "spades"));

// ── Exception C : joker mené 'bas', personne ne suit → gagne par défaut ──
// Joueur 0 mène joker1 bas en désignant cœur. Atout = pique.
// Les autres n'ont ni cœur ni pique → ils défaussent. Le joker bas
// gagne par défaut (il ne reste que lui).
const tC: PlayedCard[] = [
  { playerIndex: 0, card: joker("joker1"), announce: "low", declaredSuit: "hearts" },
  { playerIndex: 1, card: c("diamonds", "8") }, // défausse
  { playerIndex: 2, card: c("clubs", "9") },    // défausse
];
console.log("Exception C (attendu 0) :", determineTrickWinner(tC, "spades"));

// ── Cas normal : joker 'bas' perd quand quelqu'un suit ──
// Joker bas mené sur cœur, joueur 1 suit en cœur → c'est lui qui gagne.
const tD: PlayedCard[] = [
  { playerIndex: 0, card: joker("joker1"), announce: "low", declaredSuit: "hearts" },
  { playerIndex: 1, card: c("hearts", "9") },
  { playerIndex: 2, card: c("hearts", "Q") },
];
console.log("Joker bas perd (attendu 2) :", determineTrickWinner(tD, "spades"));

// ═══════════════════════════════════════════════════════════════
// Comportement des Jokers en SANS-ATOUT (trumpSuit = null)
// ═══════════════════════════════════════════════════════════════
// Aucune règle ne change : il n'existe simplement aucun atout pour
// "racheter" un joker haut mené, et l'exception B ne peut donc jamais
// se déclencher (trumpPlays est toujours vide quand trumpSuit = null).

// ── Joker haut mené sans atout : rien ne peut le battre, il gagne ──
const tE: PlayedCard[] = [
  { playerIndex: 0, card: joker("joker1"), announce: "high", declaredSuit: "hearts" },
  { playerIndex: 1, card: c("spades", "A") }, // défausse, pas d'atout pour couper
  { playerIndex: 2, card: c("hearts", "K") },
];
console.log("Sans atout, joker haut mené gagne (attendu 0) :", determineTrickWinner(tE, null));

// ── Joker bas mené sans atout, quelqu'un suit la couleur déclarée ──
// → c'est le suiveur qui gagne (le joker bas perd, comme tD).
const tF: PlayedCard[] = [
  { playerIndex: 0, card: joker("joker1"), announce: "low", declaredSuit: "hearts" },
  { playerIndex: 1, card: c("hearts", "9") },
  { playerIndex: 2, card: c("hearts", "Q") },
];
console.log("Sans atout, joker bas perd au profit du suiveur (attendu 2) :", determineTrickWinner(tF, null));

// ── Joker bas mené sans atout, personne ne suit → il gagne par défaut ──
const tG: PlayedCard[] = [
  { playerIndex: 0, card: joker("joker1"), announce: "low", declaredSuit: "hearts" },
  { playerIndex: 1, card: c("diamonds", "8") }, // défausse
  { playerIndex: 2, card: c("clubs", "9") },    // défausse
];
console.log("Sans atout, joker bas mené gagne par défaut (attendu 0) :", determineTrickWinner(tG, null));