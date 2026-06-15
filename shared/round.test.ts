import { createRound, placeBid, playCard, chooseTrump, RoundState } from "./round";
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
check("lastTrick initial vide", s.lastTrick, []);
check("lastTrickWinner initial = null", s.lastTrickWinner, null);

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
check("lastTrick = le pli complet (4 cartes)", s.lastTrick, [
  { playerIndex: 1, card: c("spades", "8") },
  { playerIndex: 2, card: c("spades", "9") },
  { playerIndex: 3, card: c("spades", "10") },
  { playerIndex: 0, card: c("spades", "7") },
]);
check("lastTrickWinner = joueur 3 (10♠)", s.lastTrickWinner, 3);
check("currentTrick vidé après le pli", s.currentTrick, []);

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
check("lastTrick (pli 1) = le pli complet (4 cartes)", t.lastTrick, [
  { playerIndex: 1, card: c("spades", "8") },
  { playerIndex: 2, card: c("spades", "K") },
  { playerIndex: 3, card: c("spades", "10") },
  { playerIndex: 0, card: c("spades", "J") },
]);
check("lastTrickWinner (pli 1) = joueur 2 (R♠)", t.lastTrickWinner, 2);

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
check("lastTrick (pli 2) = le pli complet (4 cartes)", t.lastTrick, [
  { playerIndex: 2, card: c("spades", "9") },
  { playerIndex: 3, card: c("spades", "A") },
  { playerIndex: 0, card: c("spades", "7") },
  { playerIndex: 1, card: c("spades", "Q") },
]);
check("lastTrickWinner (pli 2) = joueur 3 (A♠)", t.lastTrickWinner, 3);

console.log("\n══════ Manche à 8 cartes : pas de choix d'atout ══════");

// Régression : une manche NON-9-cartes saute "choosing-trump" et part
// directement en "bidding", comme avant.
const eight: RoundState = createRound(4, 8, 0, createDeck());
check("Manche à 8 : phase directe", eight.phase, "bidding");
check("Manche à 8 : pendingDeck absent", eight.pendingDeck, null);

console.log("\n══════ Manche à 9 cartes : choix de l'atout ══════");

// createDeck() non mélangé, donneur 0 → 1er joueur = joueur 1.
// Distribution déterministe (cf. investigation) :
//   - joueur 1 reçoit ses 3 PREMIÈRES cartes : 7♠ 8♠ 9♠
//   - les autres mains sont vides
//   - 33 cartes restent en attente (pendingDeck)
let n: RoundState = createRound(4, 9, 0, createDeck());

check("Manche à 9 : phase initiale", n.phase, "choosing-trump");
check("Manche à 9 : décideur = 1er joueur (gauche du donneur)", n.currentPlayer, 1);
check("Manche à 9 : mains avant choix (tailles)", n.hands.map((h) => h.length), [0, 3, 0, 0]);
check("Manche à 9 : 3 premières cartes du décideur", n.hands[1], [
  { type: "normal", suit: "spades", rank: "7" },
  { type: "normal", suit: "spades", rank: "8" },
  { type: "normal", suit: "spades", rank: "9" },
]);
check("Manche à 9 : pendingDeck = reste du paquet (33 cartes)", n.pendingDeck?.length, 33);
check("Manche à 9 : atout pas encore décidé", n.trumpSuit, null);
check("Manche à 9 : pas de carte retournée", n.trumpCard, null);

// ── On ne peut pas enchérir avant le choix d'atout ──
expectThrow("Enchère impossible avant choix d'atout", () => placeBid(n, 1, 0));

// ── Seul le décideur (joueur 1) peut choisir, et seulement en phase
// "choosing-trump" ──
expectThrow("Choix d'atout par un autre joueur que le décideur", () =>
  chooseTrump(n, 0, "hearts")
);

// ── Choix d'une couleur : cœur ──
const chosenHearts = chooseTrump(n, 1, "hearts");
check("Choix cœur : phase → bidding", chosenHearts.phase, "bidding");
check("Choix cœur : trumpSuit = hearts", chosenHearts.trumpSuit, "hearts");
check("Choix cœur : pas de carte retournée", chosenHearts.trumpCard, null);
check("Choix cœur : pendingDeck vidé", chosenHearts.pendingDeck, null);
check("Choix cœur : mains complètes (9 chacun)", chosenHearts.hands.map((h) => h.length), [9, 9, 9, 9]);

// Distribution complète attendue (déterministe, cf. investigation).
check("Choix cœur : main du joueur 0", chosenHearts.hands[0], [
  { type: "normal", suit: "spades", rank: "10" },
  { type: "normal", suit: "spades", rank: "A" },
  { type: "normal", suit: "hearts", rank: "9" },
  { type: "normal", suit: "hearts", rank: "K" },
  { type: "normal", suit: "diamonds", rank: "8" },
  { type: "normal", suit: "diamonds", rank: "Q" },
  { type: "normal", suit: "clubs", rank: "8" },
  { type: "normal", suit: "clubs", rank: "J" },
  { type: "normal", suit: "clubs", rank: "A" },
]);
check("Choix cœur : main du joueur 1 (3 initiales + 6)", chosenHearts.hands[1], [
  { type: "normal", suit: "spades", rank: "7" },
  { type: "normal", suit: "spades", rank: "8" },
  { type: "normal", suit: "spades", rank: "9" },
  { type: "normal", suit: "spades", rank: "J" },
  { type: "normal", suit: "hearts", rank: "6" },
  { type: "normal", suit: "hearts", rank: "10" },
  { type: "normal", suit: "hearts", rank: "A" },
  { type: "normal", suit: "diamonds", rank: "9" },
  { type: "normal", suit: "diamonds", rank: "K" },
]);
check("Choix cœur : main du joueur 2", chosenHearts.hands[2], [
  { type: "normal", suit: "spades", rank: "Q" },
  { type: "normal", suit: "hearts", rank: "7" },
  { type: "normal", suit: "hearts", rank: "J" },
  { type: "normal", suit: "diamonds", rank: "6" },
  { type: "normal", suit: "diamonds", rank: "10" },
  { type: "normal", suit: "diamonds", rank: "A" },
  { type: "normal", suit: "clubs", rank: "9" },
  { type: "normal", suit: "clubs", rank: "Q" },
  { type: "joker", id: "joker1" },
]);
check("Choix cœur : main du joueur 3", chosenHearts.hands[3], [
  { type: "normal", suit: "spades", rank: "K" },
  { type: "normal", suit: "hearts", rank: "8" },
  { type: "normal", suit: "hearts", rank: "Q" },
  { type: "normal", suit: "diamonds", rank: "7" },
  { type: "normal", suit: "diamonds", rank: "J" },
  { type: "normal", suit: "clubs", rank: "7" },
  { type: "normal", suit: "clubs", rank: "10" },
  { type: "normal", suit: "clubs", rank: "K" },
  { type: "joker", id: "joker2" },
]);

// Après le choix, l'enchère normale peut commencer, le décideur (1)
// parle en premier (comme avant : aucun changement).
check("Choix cœur : 1er à enchérir = le décideur", chosenHearts.currentPlayer, 1);

// ── Choix "passe" : sans atout, AUCUNE cascade vers un autre joueur ──
const passState: RoundState = createRound(4, 9, 0, createDeck());
const chosenNone = chooseTrump(passState, 1, null);
check("Passe : phase → bidding", chosenNone.phase, "bidding");
check("Passe : trumpSuit = null (sans atout)", chosenNone.trumpSuit, null);
check("Passe : mains complètes (9 chacun)", chosenNone.hands.map((h) => h.length), [9, 9, 9, 9]);
check("Passe : aucune cascade, le décideur reste 1er à parler", chosenNone.currentPlayer, 1);

// ── Choisir l'atout hors phase "choosing-trump" → erreur ──
expectThrow("Choix d'atout impossible une fois en bidding", () =>
  chooseTrump(chosenHearts, 1, "spades")
);
expectThrow("Choix d'atout impossible sur une manche à 8 cartes", () =>
  chooseTrump(eight, eight.currentPlayer, "spades")
);

console.log("\n══════ Sans atout : résolution de plis (bout à bout) ══════");

// État fabriqué : 4 joueurs, 3 cartes chacun, trumpSuit = null (manche
// sans atout, comme après un "passe" en choosing-trump).
const noTrumpState: RoundState = {
  phase: "playing",
  playerCount: 4,
  cardsPerPlayer: 3,
  dealerIndex: 0,
  hands: [
    [c("spades", "7"), c("diamonds", "A"), c("clubs", "K")],
    [c("spades", "8"), c("diamonds", "K"), c("hearts", "6")],
    [c("spades", "9"), c("diamonds", "6"), c("hearts", "A")],
    [c("spades", "10"), c("diamonds", "Q"), c("hearts", "7")],
  ],
  trumpSuit: null,
  trumpCard: null,
  pendingDeck: null,
  bids: [0, 0, 0, 0],
  tricksWon: [0, 0, 0, 0],
  currentPlayer: 1,
  trickLeader: 1,
  currentTrick: [],
  lastTrick: [],
  lastTrickWinner: null,
};

// ── Pli 1 (pique demandé) : la plus haute carte de pique gagne (10♠) ──
let nt = playCard(noTrumpState, 1, c("spades", "8"));
nt = playCard(nt, 2, c("spades", "9"));
nt = playCard(nt, 3, c("spades", "10"));
nt = playCard(nt, 0, c("spades", "7"));
check("Sans atout, pli 1 : 10♠ gagne (joueur 3)", nt.tricksWon, [0, 0, 0, 1]);
check("Sans atout, pli 1 : le gagnant mène le pli suivant", nt.currentPlayer, 3);

// ── Pli 2 (carreau demandé) : la plus haute carte de carreau gagne (A♦) ──
nt = playCard(nt, 3, c("diamonds", "Q"));
nt = playCard(nt, 0, c("diamonds", "A"));
nt = playCard(nt, 1, c("diamonds", "K"));
nt = playCard(nt, 2, c("diamonds", "6"));
check("Sans atout, pli 2 : A♦ gagne (joueur 0)", nt.tricksWon, [1, 0, 0, 1]);

// ── Pli 3 (trèfle demandé) : seul le K♣ suit, les défausses cœur (même
// l'As♥) ne peuvent PAS gagner faute d'atout pour les "racheter" ──
nt = playCard(nt, 0, c("clubs", "K"));
nt = playCard(nt, 1, c("hearts", "6"));
nt = playCard(nt, 2, c("hearts", "A"));
nt = playCard(nt, 3, c("hearts", "7"));
check("Sans atout, pli 3 : seul le K♣ suit → joueur 0 gagne", nt.tricksWon, [2, 0, 0, 1]);
check("Sans atout : manche terminée, mains vidées", nt.phase, "finished");
check("Sans atout : total plis = cartes par joueur", nt.tricksWon.reduce((a, b) => a + b, 0), 3);

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
  pendingDeck: null,
  bids: [1, 1],
  tricksWon: [0, 0],
  currentPlayer: 0,
  trickLeader: 0,
  currentTrick: [],
  lastTrick: [],
  lastTrickWinner: null,
};
const afterLead = playCard(renonceState, 0, c("hearts", "8")); // p0 mène cœur
expectThrow("Renonce (couleur non suivie)", () =>
  playCard(afterLead, 1, c("diamonds", "9"))
);

// Suivi légal : jouer 7♥ ne lève pas et résout le pli (8♥ gagne).
const afterFollow = playCard(afterLead, 1, c("hearts", "7"));
check("Suivi légal → pli résolu, phase", afterFollow.phase, "playing");
check("Suivi légal → 8♥ gagne (joueur 0)", afterFollow.tricksWon, [1, 0]);
