// ─── Les couleurs ───────────────────────────────────────────────
// 'as const' fige ce tableau : son type devient le tuple exact
// ['spades', 'hearts', 'diamonds', 'clubs'], pas un simple string[].
export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;

// On dérive le type Suit DEPUIS le tableau, plutôt que de le réécrire
// à la main. Une seule source de vérité : si on modifie SUITS, Suit suit.
export type Suit = (typeof SUITS)[number];
// → Suit vaut : 'spades' | 'hearts' | 'diamonds' | 'clubs'

// ─── Les rangs ──────────────────────────────────────────────────
// On les liste du PLUS FAIBLE au PLUS FORT. L'ordre dans ce tableau
// EST la hiérarchie : l'index donne directement la force de la carte.
// (le 6 n'existe que pour les couleurs rouges, on gère ça plus bas)
export const RANKS = [
  "6", "7", "8", "9", "10", "J", "Q", "K", "A",
] as const;

export type Rank = (typeof RANKS)[number];

// ─── Une carte normale ──────────────────────────────────────────
// Le champ 'type' est le discriminant de notre union.
export type NormalCard = {
  type: "normal";
  suit: Suit;
  rank: Rank;
};

// ─── Un Joker ───────────────────────────────────────────────────
// Il y en a deux, on les distingue par un id. Pas de couleur ni de
// rang : un Joker n'en a pas tant qu'on ne l'a pas joué haut/bas.
export type Joker = {
  type: "joker";
  id: "joker1" | "joker2";
};

// ─── Une carte = soit l'un, soit l'autre ────────────────────────
// C'est ÇA, l'union discriminée. Le champ 'type' permettra à
// TypeScript de savoir lequel des deux on manipule.
export type Card = NormalCard | Joker;




// ─── Construire le paquet de 38 cartes (36 + 2 jokers) ──────────
export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      // Règle du jeu : le 6 noir (pique/trèfle) est REMPLACÉ par un
      // Joker. Donc on ne crée pas de 6 pour les couleurs noires.
      const estNoire = suit === "spades" || suit === "clubs";
      if (rank === "6" && estNoire) {
        continue; // on saute : pas de 6 de pique ni de 6 de trèfle
      }
      deck.push({ type: "normal", suit, rank });
    }
  }

  // On ajoute les deux Jokers
  deck.push({ type: "joker", id: "joker1" });
  deck.push({ type: "joker", id: "joker2" });

  return deck;
}


// ─── Mélanger le paquet (algorithme de Fisher-Yates) ────────────
// On NE modifie PAS le tableau d'origine : on en retourne une copie
// mélangée. Travailler sur des copies (immutabilité) évite des bugs
// vicieux où un mélange écrase l'état du jeu par effet de bord.
export function shuffle(deck: Card[]): Card[] {
  const result = [...deck]; // copie

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // échange result[i] et result[j]
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}


// ─── Force d'un rang ────────────────────────────────────────────
// L'index dans RANKS donne directement la hiérarchie.
// '6' → 0 (le plus faible), 'A' → 8 (le plus fort).
export function rankStrength(rank: Rank): number {
  return RANKS.indexOf(rank);
}