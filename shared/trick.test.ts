import { determineTrickWinner, PlayedCard } from "./trick";
import { Card } from "./cards";

// Petit raccourci pour écrire des cartes plus vite dans les tests
const c = (suit: any, rank: any): Card => ({ type: "normal", suit, rank });

// ── Test 1 : pas d'atout, tout le monde suit la couleur ──
// Cœur demandé. J de cœur doit battre 9 et 7 de cœur. Gagnant = joueur 1.
const t1: PlayedCard[] = [
  { playerIndex: 0, card: c("hearts", "9") },
  { playerIndex: 1, card: c("hearts", "J") },
  { playerIndex: 2, card: c("hearts", "7") },
];
console.log("Test 1 (attendu 1) :", determineTrickWinner(t1, null));

// ── Test 2 : un atout coupe ──
// Cœur demandé, atout = pique. Le 7 de pique (atout) bat l'As de cœur.
const t2: PlayedCard[] = [
  { playerIndex: 0, card: c("hearts", "A") },
  { playerIndex: 1, card: c("spades", "7") }, // atout !
  { playerIndex: 2, card: c("hearts", "K") },
];
console.log("Test 2 (attendu 1) :", determineTrickWinner(t2, "spades"));

// ── Test 3 : défausse hors couleur ne gagne pas ──
// Cœur demandé, atout = pique. Le joueur 2 balance un As de carreau
// (ni atout ni couleur demandée) : il ne peut PAS gagner.
const t3: PlayedCard[] = [
  { playerIndex: 0, card: c("hearts", "10") },
  { playerIndex: 1, card: c("hearts", "Q") },
  { playerIndex: 2, card: c("diamonds", "A") }, // défausse, nulle ici
];
console.log("Test 3 (attendu 1) :", determineTrickWinner(t3, "spades"));

// ── Test 4 : deux atouts entre eux ──
// Carreau demandé, atout = trèfle. Deux trèfles joués : K bat 9.
const t4: PlayedCard[] = [
  { playerIndex: 0, card: c("diamonds", "A") },
  { playerIndex: 1, card: c("clubs", "9") },  // atout
  { playerIndex: 2, card: c("clubs", "K") },  // atout plus fort
];
console.log("Test 4 (attendu 2) :", determineTrickWinner(t4, "clubs"));
