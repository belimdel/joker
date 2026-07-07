import { isBidAllowed, allowedBids, forbiddenLastBid } from "./bidding";

// ── Test 1 : l'exemple du doc ──────────────────────────────────
// Manche à 2 cartes. Trois joueurs ont déjà annoncé [0, 0, 1]
// (total = 1). Le donneur (dernier à parler) ne peut PAS dire 1,
// car 1 + 1 = 2 = nombre de cartes → total interdit.
console.log(
  "Test 1 (attendu false) :",
  isBidAllowed(1, 2, [0, 0, 1], true)
);
// Mais il PEUT dire 2 (total = 3, ≠ 2).
console.log(
  "Test 1b (attendu true) :",
  isBidAllowed(2, 2, [0, 0, 1], true)
);

// ── Test 2 : un non-donneur n'a aucune contrainte de total ─────
// Mêmes chiffres, mais ce joueur n'est PAS le donneur : dire 1 est
// permis même si ça mènerait le total à 2.
console.log(
  "Test 2 (attendu true) :",
  isBidAllowed(1, 2, [0, 0, 1], false)
);

// ── Test 3 : les bornes ────────────────────────────────────────
// Négatif → interdit. Au-dessus du nombre de cartes → interdit.
console.log(
  "Test 3a négatif (attendu false) :",
  isBidAllowed(-1, 3, [], false)
);
console.log(
  "Test 3b trop grand (attendu false) :",
  isBidAllowed(4, 3, [], false)
);
// Les bornes elles-mêmes (0 et cardsPerPlayer) sont valides pour un non-donneur.
console.log(
  "Test 3c borne 0 (attendu true) :",
  isBidAllowed(0, 3, [], false)
);
console.log(
  "Test 3d borne max (attendu true) :",
  isBidAllowed(3, 3, [], false)
);

// ── Test 4 : allowedBids pour le donneur ───────────────────────
// Manche à 3 cartes, déjà annoncé [1, 1] (total = 2). Le donneur ne
// peut pas dire 1 (1 + 2 = 3 = nb cartes). Reste [0, 2, 3].
console.log(
  "Test 4 (attendu [0,2,3]) :",
  allowedBids(3, [1, 1], true)
);

// ── Test 5 : allowedBids pour un non-donneur ───────────────────
// Aucune contrainte de total : toutes les bornes sont permises.
console.log(
  "Test 5 (attendu [0,1,2,3]) :",
  allowedBids(3, [1, 1], false)
);

// ── Test 7 : forbiddenLastBid ──────────────────────────────────
// Manche à 3 cartes, déjà annoncé [1, 1] (total 2). Interdit = 3-2 = 1.
console.log(
  "Test 7 (attendu 1) :",
  forbiddenLastBid(3, [1, 1])
);
// Manche à 3 cartes, déjà annoncé [3, 3] (total 6). Interdit = 3-6 = -3
// → hors bornes → aucune contrainte (null).
console.log(
  "Test 7b (attendu null) :",
  forbiddenLastBid(3, [3, 3])
);

// ── Test 6 : immutabilité ──────────────────────────────────────
// On vérifie que previousBids n'est jamais muté par les fonctions.
const bids = [1, 1];
allowedBids(3, bids, true);
isBidAllowed(1, 3, bids, true);
console.log(
  "Test 6 immutabilité (attendu [1,1]) :",
  JSON.stringify(bids)
);
