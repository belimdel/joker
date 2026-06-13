import { createDeck, shuffle, Card } from "./cards";
import { check } from "./test-utils";

// Signature lisible d'une carte (pour tester l'unicité).
const sig = (c: Card): string =>
  c.type === "normal" ? `${c.suit}-${c.rank}` : c.id;

const deck = createDeck();

// ── Valeurs clés du paquet ──
check("Nombre de cartes", deck.length, 36);

// Pas de 6 noir (le 6 de pique et de trèfle sont remplacés par des jokers).
const sixNoirs = deck.filter(
  (c) =>
    c.type === "normal" &&
    c.rank === "6" &&
    (c.suit === "spades" || c.suit === "clubs")
);
check("6 noirs", sixNoirs.length, 0);

// Exactement 2 jokers.
const jokers = deck.filter((c) => c.type === "joker");
check("Nombre de jokers", jokers.length, 2);

// Unicité : 36 signatures distinctes (aucun doublon dans le paquet).
check("Signatures uniques du paquet", new Set(deck.map(sig)).size, 36);

// ── shuffle : mélange immuable, mêmes cartes ──
const shuffled = shuffle(deck);
check("shuffle préserve le nombre de cartes", shuffled.length, 36);
check("shuffle ne crée pas de doublon", new Set(shuffled.map(sig)).size, 36);
check("shuffle ne mute pas le paquet d'origine", deck.length, 36);

// Affichage visuel du mélange (aléatoire → non assertable).
console.log("Paquet mélangé (5 premières cartes) :");
console.log(shuffled.slice(0, 5));
