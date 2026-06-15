import { createRound, placeBid, RoundState } from "./round";
import { createDeck, Card } from "./cards";
import { pickAutoBid, pickAutoCard } from "./bot";
import { check } from "./test-utils";

// Raccourci pour écrire des cartes normales.
const c = (suit: any, rank: any): Card => ({ type: "normal", suit, rank });

console.log("══════ pickAutoBid : choisit la plus petite enchère autorisée ══════");

// Non-donneur : aucune contrainte → 0 est toujours autorisé.
const s: RoundState = createRound(4, 3, 0, createDeck());
check("Non-donneur : auto-bid = 0", pickAutoBid(s), 0);

// Donneur : 0 interdit si le total tomberait sur cardsPerPlayer (1).
let d: RoundState = createRound(4, 1, 0, createDeck());
d = placeBid(d, 1, 1);
d = placeBid(d, 2, 0);
d = placeBid(d, 3, 0);
// total des autres = 1 ; cardsPerPlayer = 1 → 0 interdit (1+0=1), 1 autorisé (1+1=2≠1).
check("Donneur : auto-bid évite l'enchère interdite (0)", pickAutoBid(d), 1);

console.log("\n══════ pickAutoCard : préfère une carte normale légale ══════");

// 1 carte/joueur, atout pique. Après les enchères, le meneur (joueur 1)
// doit jouer la seule carte de sa main.
let p: RoundState = createRound(4, 1, 0, createDeck());
p = placeBid(p, 1, 0);
p = placeBid(p, 2, 0);
p = placeBid(p, 3, 0);
p = placeBid(p, 0, 0);
const auto1 = pickAutoCard(p);
check("Carte choisie = la seule carte en main", auto1.card, p.hands[1][0]);
check("Pas d'annonce pour une carte normale", auto1.announce, undefined);

console.log("\n══════ pickAutoCard : doit suivre la couleur demandée ══════");
const followState: RoundState = {
  phase: "playing",
  playerCount: 2,
  cardsPerPlayer: 2,
  dealerIndex: 1,
  hands: [
    [c("clubs", "8"), c("hearts", "7")],
    [c("hearts", "9"), c("diamonds", "K")],
  ],
  trumpSuit: "spades",
  trumpCard: null,
  pendingDeck: null,
  bids: [1, 1],
  tricksWon: [0, 0],
  currentPlayer: 0,
  trickLeader: 1,
  currentTrick: [{ playerIndex: 1, card: c("hearts", "Q") }],
  lastTrick: [],
  lastTrickWinner: null,
};
const auto2 = pickAutoCard(followState);
check("Suit la couleur demandée (cœur) plutôt que la défausse", auto2.card, c("hearts", "7"));

console.log("\n══════ pickAutoCard : Joker légal annoncé 'low' ══════");
const jokerOnlyState: RoundState = {
  phase: "playing",
  playerCount: 2,
  cardsPerPlayer: 1,
  dealerIndex: 1,
  hands: [
    [{ type: "joker", id: "joker1" }],
    [c("hearts", "9")],
  ],
  trumpSuit: "hearts",
  trumpCard: null,
  pendingDeck: null,
  bids: [0, 0],
  tricksWon: [0, 0],
  currentPlayer: 0,
  trickLeader: 0,
  currentTrick: [],
  lastTrick: [],
  lastTrickWinner: null,
};
const auto3 = pickAutoCard(jokerOnlyState);
check("Joker choisi (seule carte)", auto3.card, { type: "joker", id: "joker1" });
check("Annonce 'low'", auto3.announce, "low");
check("Couleur déclarée = atout (cœur)", auto3.declaredSuit, "hearts");
