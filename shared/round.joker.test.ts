import { playCard, RoundState } from "./round";
import { Card } from "./cards";
import { expectThrow, expectOk } from "./test-utils";

// Raccourcis pour écrire des cartes.
const c = (suit: any, rank: any): Card => ({ type: "normal", suit, rank });
const J1: Card = { type: "joker", id: "joker1" };
const J2: Card = { type: "joker", id: "joker2" };

// Fabrique un état "playing" à 4 joueurs où le pli a été MENÉ par J1
// (annonce + couleur déclarée paramétrables), et c'est au joueur 1 de
// jouer. Les mains des autres joueurs sont vides (on n'y touche pas :
// le pli reste incomplet, pas de résolution de gagnant à gérer).
function ledByJoker(
  announce: "high" | "low",
  declaredSuit: any,
  p1hand: Card[],
  trumpSuit: any = "spades"
): RoundState {
  return {
    phase: "playing",
    playerCount: 4,
    cardsPerPlayer: 5,
    dealerIndex: 0,
    hands: [[], p1hand, [], []],
    trumpSuit,
    trumpCard: null,
    bids: [0, 0, 0, 0],
    tricksWon: [0, 0, 0, 0],
    currentPlayer: 1,
    trickLeader: 0,
    currentTrick: [
      { playerIndex: 0, card: J1, announce, declaredSuit },
    ],
  };
}

console.log("══════ Validation du Joker JOUÉ (annonce / couleur) ══════");

// État : c'est au joueur 0 de MENER, il a J1 en main.
const leadState: RoundState = {
  phase: "playing",
  playerCount: 4,
  cardsPerPlayer: 5,
  dealerIndex: 0,
  hands: [[J1, c("hearts", "K")], [], [], []],
  trumpSuit: "spades",
  trumpCard: null,
  bids: [0, 0, 0, 0],
  tricksWon: [0, 0, 0, 0],
  currentPlayer: 0,
  trickLeader: 0,
  currentTrick: [],
};

// Joker joué SANS annonce → rejet.
expectThrow("Joker sans annonce", () => playCard(leadState, 0, J1));

// Joker mené avec annonce mais SANS couleur déclarée → rejet.
expectThrow("Joker mené sans declaredSuit", () =>
  playCard(leadState, 0, J1, "high")
);

// Joker mené correctement (annonce + couleur) → accepté.
expectOk("Joker mené high + couleur", () =>
  playCard(leadState, 0, J1, "high", "hearts")
);

// Vérifions que la carte jouée porte bien l'annonce et la couleur.
const afterLead = playCard(leadState, 0, J1, "high", "hearts");
console.log(
  "Carte menée enregistrée :",
  JSON.stringify(afterLead.currentTrick[0]),
  "| tour suivant :",
  afterLead.currentPlayer
);

console.log("\n══════ Joker mené HIGH : plus haute carte de la couleur ══════");

// J1 mené high sur cœur (non-atout). Joueur 1 a K♥ et 9♥ → doit jouer K♥.
// (J2 en main aussi : pour tester que jouer l'autre joker reste permis.)
const highHearts = ledByJoker("high", "hearts", [
  c("hearts", "K"),
  c("hearts", "9"),
  c("clubs", "7"),
  J2,
]);
expectThrow("High : jouer 9♥ alors qu'on a K♥", () =>
  playCard(highHearts, 1, c("hearts", "9"))
);
expectOk("High : jouer K♥ (la plus haute)", () =>
  playCard(highHearts, 1, c("hearts", "K"))
);
// Jouer l'AUTRE joker reste permis même si on a du cœur.
expectOk("High : jouer l'autre Joker (J2)", () =>
  playCard(highHearts, 1, J2, "low")
);

console.log("\n══════ Joker mené HIGH sur couleur non-atout, sans la couleur ══════");

// J1 mené high sur cœur, atout = pique. Joueur 1 n'a pas de cœur mais a
// du pique → doit COUPER (n'importe quel atout).
const highNoSuit = ledByJoker("high", "hearts", [
  c("spades", "7"),
  c("clubs", "K"),
  c("diamonds", "9"),
]);
expectThrow("High sans cœur : défausser ♣ alors qu'on peut couper", () =>
  playCard(highNoSuit, 1, c("clubs", "K"))
);
expectOk("High sans cœur : couper avec 7♠ (atout)", () =>
  playCard(highNoSuit, 1, c("spades", "7"))
);

console.log("\n══════ Joker mené HIGH sur l'ATOUT, joueur sans atout → libre ══════");

// J1 mené high sur pique (= atout). Joueur 1 n'a aucun pique → jeu libre.
const highTrumpDeclared = ledByJoker(
  "high",
  "spades",
  [c("hearts", "K"), c("clubs", "9")],
  "spades"
);
expectOk("High sur atout, sans atout : jouer n'importe quoi (K♥)", () =>
  playCard(highTrumpDeclared, 1, c("hearts", "K"))
);

console.log("\n══════ Joker mené LOW : suivre la couleur, sans contrainte de hauteur ══════");

// J1 mené low sur cœur. Joueur 1 a K♥ et 9♥ → peut jouer 9♥ (pas de
// contrainte de plus haute carte), mais doit rester en cœur.
const lowHearts = ledByJoker("low", "hearts", [
  c("hearts", "K"),
  c("hearts", "9"),
  c("clubs", "7"),
  J2,
]);
expectOk("Low : jouer 9♥ (basse autorisée)", () =>
  playCard(lowHearts, 1, c("hearts", "9"))
);
expectThrow("Low : défausser ♣ alors qu'on a du cœur", () =>
  playCard(lowHearts, 1, c("clubs", "7"))
);

// Low, sans la couleur → doit couper si possible.
const lowNoSuit = ledByJoker("low", "hearts", [
  c("spades", "7"),
  c("clubs", "K"),
]);
expectThrow("Low sans cœur : défausser ♣ alors qu'on peut couper", () =>
  playCard(lowNoSuit, 1, c("clubs", "K"))
);
expectOk("Low sans cœur : couper avec 7♠", () =>
  playCard(lowNoSuit, 1, c("spades", "7"))
);
// Jouer l'autre joker reste permis.
expectOk("Low : jouer l'autre Joker (J2)", () =>
  playCard(lowHearts, 1, J2, "high")
);

console.log("\n══════ Joker en SUIVI d'un pli mené par une couleur ══════");

// Pli mené par une couleur normale (K♥). Le joueur 1 a J1 et du cœur :
// le joker reste jouable librement, mais doit être annoncé.
const normalLed: RoundState = {
  phase: "playing",
  playerCount: 4,
  cardsPerPlayer: 5,
  dealerIndex: 0,
  hands: [[], [J1, c("hearts", "9")], [], []],
  trumpSuit: "spades",
  trumpCard: null,
  bids: [0, 0, 0, 0],
  tricksWon: [0, 0, 0, 0],
  currentPlayer: 1,
  trickLeader: 0,
  currentTrick: [{ playerIndex: 0, card: c("hearts", "K") }],
};
expectThrow("Suivi : joker sans annonce", () => playCard(normalLed, 1, J1));
expectOk("Suivi : joker annoncé (low) jouable librement", () =>
  playCard(normalLed, 1, J1, "low")
);
