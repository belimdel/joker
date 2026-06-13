import { deal } from "./deal";
import { createDeck, shuffle, Card } from "./cards";
import { check, expectThrow } from "./test-utils";

const sig = (c: Card): string =>
  c.type === "normal" ? `${c.suit}-${c.rank}` : c.id;

// ── Distribution déterministe (paquet NON mélangé), donneur 0 ──
const deck = createDeck();
const r1 = deal(4, 3, 0, deck);

check("Cartes par joueur", r1.hands.map((h) => h.length), [3, 3, 3, 3]);
check("Total distribué", r1.hands.flat().length, 12);
check("Unicité (12 cartes distinctes)", new Set(r1.hands.flat().map(sig)).size, 12);

// Atout déterministe : après 12 cartes (spades 7..A puis hearts 6..9),
// la 13e carte retournée est le 10 de cœur → atout = cœur.
check("Carte d'atout (déterministe)", r1.trumpCard, {
  type: "normal",
  suit: "hearts",
  rank: "10",
});
check("Couleur d'atout", r1.trumpSuit, "hearts");

// ── Manche à 9 (paquet complet, plus de carte à retourner) ──
// On distribue les 36 cartes → l'atout est la DERNIÈRE carte du donneur,
// qui RESTE dans sa main (révélée). Paquet non mélangé → déterministe :
// la 9e carte du joueur 0 est l'indice 32 = K de trèfle.
const r3 = deal(4, 9, 0, createDeck());
check("Manche à 9 : tailles", r3.hands.map((h) => h.length), [9, 9, 9, 9]);
check("Manche à 9 : dernière carte du donneur", r3.hands[0][8], {
  type: "normal",
  suit: "clubs",
  rank: "K",
});
check("Manche à 9 : carte d'atout = dernière du donneur", r3.trumpCard, {
  type: "normal",
  suit: "clubs",
  rank: "K",
});
check("Manche à 9 : couleur d'atout = trèfle", r3.trumpSuit, "clubs");
check("Manche à 9 : carte révélée CONSERVÉE en main (9 cartes)", r3.hands[0].length, 9);

// ── Manche à 9, donneur 3 : sa dernière carte est le joker2 (indice 35) ──
// Joker retourné → manche SANS atout (comme une carte joker retournée).
const r3b = deal(4, 9, 3, createDeck());
check("Manche à 9 (donneur 3) : dernière carte = joker", r3b.hands[3][8], {
  type: "joker",
  id: "joker2",
});
check("Manche à 9 (donneur 3) : trumpCard = le joker", r3b.trumpCard, {
  type: "joker",
  id: "joker2",
});
check("Manche à 9 (donneur 3) : joker retourné → sans atout", r3b.trumpSuit, null);

// ── Manche à 9, paquet mélangé : invariant général ──
// L'atout est toujours la dernière carte du donneur, et trumpSuit en
// découle (null si joker, sinon sa couleur).
const dealerIdx = 2;
const r3c = deal(4, 9, dealerIdx, shuffle(createDeck()));
const dealerLast = r3c.hands[dealerIdx][8];
check("Manche à 9 (mélangée) : trumpCard = dernière du donneur", r3c.trumpCard, dealerLast);
check(
  "Manche à 9 (mélangée) : trumpSuit cohérent",
  r3c.trumpSuit,
  dealerLast.type === "normal" ? dealerLast.suit : null
);

// ── Garde-fou : pas assez de cartes → doit lever (try/catch) ──
expectThrow("Garde-fou (pas assez de cartes)", () => deal(4, 20, 0, createDeck()));
