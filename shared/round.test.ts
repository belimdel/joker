import { createRound, placeBid, playCard, RoundState } from "./round";
import { createDeck } from "./cards";
import { Card } from "./cards";
import { check, expectThrow } from "./test-utils";

// Raccourci pour écrire des cartes normales.
const c = (suit: any, rank: any): Card => ({ type: "normal", suit, rank });

console.log("══════ Manche à 1 carte (4 joueurs, donneur 0) ══════");

// createDeck() non mélangé → distribution déterministe :
//   p0=7♠ p1=8♠ p2=9♠ p3=10♠ ; carte retournée = V♠ → atout = pique.
let s: RoundState = createRound(4, 1, 0, createDeck());

check("Phase initiale", s.phase, "bidding");
check("Atout", s.trumpSuit, "spades");
check("Premier à parler (gauche du donneur)", s.currentPlayer, 1);
check("Mains (tailles)", s.hands.map((h) => h.length), [1, 1, 1, 1]);

// ── Les enchères (ordre : 1, 2, 3, puis le donneur 0) ──
s = placeBid(s, 1, 0);
s = placeBid(s, 2, 0);
s = placeBid(s, 3, 0);
// Le donneur ne pourrait pas dire 1 (total = 1 = nb cartes). Il dit 0.
s = placeBid(s, 0, 0);

check("Phase après enchères", s.phase, "playing");
check("Enchères enregistrées", s.bids, [0, 0, 0, 0]);
check("Meneur du 1er pli (gauche du donneur)", s.currentPlayer, 1);

// ── Le pli (ordre de jeu : 1, 2, 3, 0) ──
s = playCard(s, 1, c("spades", "8"));
s = playCard(s, 2, c("spades", "9"));
s = playCard(s, 3, c("spades", "10"));
s = playCard(s, 0, c("spades", "7"));

// 10♠ est le plus haut atout → joueur 3 gagne.
check("Phase finale", s.phase, "finished");
check("Plis gagnés", s.tricksWon, [0, 0, 0, 1]);
check(
  "Total plis = cartes par joueur",
  s.tricksWon.reduce((a, b) => a + b, 0),
  1
);
check("Mains vidées", s.hands.map((h) => h.length), [0, 0, 0, 0]);

console.log("\n══════ Manche à 2 cartes (4 joueurs, donneur 0) ══════");

// Distribution déterministe (createDeck non mélangé) :
//   p0=[7♠,V♠] p1=[8♠,D♠] p2=[9♠,R♠] p3=[10♠,A♠]
//   carte retournée = 6♥ → atout = cœur (personne n'a de cœur).
let t: RoundState = createRound(4, 2, 0, createDeck());

check("Atout (cœur)", t.trumpSuit, "hearts");
check("Main du joueur 0 (taille)", t.hands[0].length, 2);

// Enchères : 1, 1, 1, puis donneur 1 (total 4, ≠ 2 → OK).
t = placeBid(t, 1, 1);
t = placeBid(t, 2, 1);
t = placeBid(t, 3, 1);
t = placeBid(t, 0, 1);
check("Phase après enchères", t.phase, "playing");
check("Meneur 1er pli", t.currentPlayer, 1);

// ── Pli 1 (ordre 1,2,3,0) : R♠ est le plus haut → joueur 2 gagne ──
t = playCard(t, 1, c("spades", "8"));
t = playCard(t, 2, c("spades", "K"));
t = playCard(t, 3, c("spades", "10"));
t = playCard(t, 0, c("spades", "J"));
check("Après pli 1, phase", t.phase, "playing");
check("Après pli 1, plis gagnés", t.tricksWon, [0, 0, 1, 0]);
check("Gagnant du pli 1 mène le pli 2", t.currentPlayer, 2);
check("Pli en cours vidé", t.currentTrick.length, 0);

// ── Pli 2 (ordre 2,3,0,1) : A♠ est le plus haut → joueur 3 gagne ──
t = playCard(t, 2, c("spades", "9"));
t = playCard(t, 3, c("spades", "A"));
t = playCard(t, 0, c("spades", "7"));
t = playCard(t, 1, c("spades", "Q"));

check("Phase finale", t.phase, "finished");
check("Plis gagnés finaux", t.tricksWon, [0, 0, 1, 1]);
check(
  "Total plis = cartes par joueur",
  t.tricksWon.reduce((a, b) => a + b, 0),
  2
);

console.log("\n══════ Chemins d'erreur (fail fast) ══════");

// Enchérir hors de son tour (c'est au joueur 1 de parler).
const e1 = createRound(4, 1, 0, createDeck());
expectThrow("Enchère hors-tour", () => placeBid(e1, 0, 0));

// Le donneur tente l'enchère interdite (total = nb cartes).
let e2 = createRound(4, 1, 0, createDeck());
e2 = placeBid(e2, 1, 0);
e2 = placeBid(e2, 2, 0);
e2 = placeBid(e2, 3, 0);
expectThrow("Contrainte donneur (enchère interdite)", () => placeBid(e2, 0, 1));

// Renonce : ne pas suivre la couleur alors qu'on le peut (état fabriqué).
const renonceState: RoundState = {
  phase: "playing",
  playerCount: 2,
  cardsPerPlayer: 2,
  dealerIndex: 1,
  hands: [
    [c("hearts", "8"), c("clubs", "K")],
    [c("hearts", "7"), c("diamonds", "9")],
  ],
  trumpSuit: "spades",
  trumpCard: null,
  bids: [1, 1],
  tricksWon: [0, 0],
  currentPlayer: 0,
  trickLeader: 0,
  currentTrick: [],
};
const afterLead = playCard(renonceState, 0, c("hearts", "8")); // p0 mène cœur
expectThrow("Renonce (couleur non suivie)", () =>
  playCard(afterLead, 1, c("diamonds", "9"))
);

// Suivi légal : jouer 7♥ ne lève pas et résout le pli (8♥ gagne).
const afterFollow = playCard(afterLead, 1, c("hearts", "7"));
check("Suivi légal → pli résolu, phase", afterFollow.phase, "playing");
check("Suivi légal → 8♥ gagne (joueur 0)", afterFollow.tricksWon, [1, 0]);
