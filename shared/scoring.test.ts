import { computePlayerScore } from "./scoring";

// ── Test 1 : contrat réussi, cas général ───────────────────────
// Enchère 3, gagne 3 (manche à 9 cartes) → 3×50 + 50 = 200.
console.log(
  "Test 1 (attendu 200) :",
  computePlayerScore(3, 3, 9)
);

// ── Test 2 : contrat raté, gagne plus que prévu ────────────────
// Enchère 3, gagne 4 → 10×4 = 40.
console.log(
  "Test 2 (attendu 40) :",
  computePlayerScore(3, 4, 9)
);

// ── Test 3 : contrat raté, gagne moins que prévu ───────────────
// Enchère 4, gagne 3 → 10×3 = 30.
console.log(
  "Test 3 (attendu 30) :",
  computePlayerScore(4, 3, 9)
);

// ── Test 4 : enchère pleine réussie ────────────────────────────
// Manche à 4 cartes, enchère 4, gagne 4 → 4×100 = 400.
console.log(
  "Test 4 (attendu 400) :",
  computePlayerScore(4, 4, 4)
);

// ── Test 5 : passe réussie (0 / 0) ─────────────────────────────
// Enchère 0, gagne 0 → contrat réussi → 0×50 + 50 = 50.
console.log(
  "Test 5 (attendu 50) :",
  computePlayerScore(0, 0, 5)
);

// ── Test 6 : passe ratée (0 mais gagne 2) ──────────────────────
// Enchère 0, gagne 2 → contrat raté → 10×2 = 20.
console.log(
  "Test 6 (attendu 20) :",
  computePlayerScore(0, 2, 5)
);

// ── Test 7 : enchère pleine RATÉE ──────────────────────────────
// Manche à 4 cartes, enchère 4 mais gagne 3 → NE doit PAS prendre
// le barème ×100. Contrat raté → 10×3 = 30.
console.log(
  "Test 7 (attendu 30, pas 400) :",
  computePlayerScore(4, 3, 4)
);

// ── Test 11 : xisht, enchère 2 mais 0 pli ──────────────────────
// Enchère 2, gagne 0 → pénalité fixe xisht → -200.
console.log(
  "Test 11 (attendu -200) :",
  computePlayerScore(2, 0, 9)
);

// ── Test 12 : xisht, enchère 1 mais 0 pli ──────────────────────
// Enchère 1, gagne 0 → pénalité fixe xisht → -200.
console.log(
  "Test 12 (attendu -200) :",
  computePlayerScore(1, 0, 9)
);

// ── Test 13 : passe réussie (0 / 0), PAS un xisht ──────────────
// Enchère 0, gagne 0 → contrat réussi → 0×50 + 50 = 50.
console.log(
  "Test 13 (attendu 50) :",
  computePlayerScore(0, 0, 9)
);

// ── Garde-fous « fail fast » : les appels invalides doivent LEVER ──

// Test 8 : tricksWon > cardsPerPlayer → erreur.
try {
  computePlayerScore(2, 5, 4);
  console.log("Test 8 : ÉCHEC, aurait dû lever une erreur");
} catch (e) {
  console.log("Test 8 (erreur attendue) :", (e as Error).message);
}

// Test 9 : bid négatif → erreur.
try {
  computePlayerScore(-1, 0, 4);
  console.log("Test 9 : ÉCHEC, aurait dû lever une erreur");
} catch (e) {
  console.log("Test 9 (erreur attendue) :", (e as Error).message);
}

// Test 10 : tricksWon non entier → erreur.
try {
  computePlayerScore(2, 1.5, 4);
  console.log("Test 10 : ÉCHEC, aurait dû lever une erreur");
} catch (e) {
  console.log("Test 10 (erreur attendue) :", (e as Error).message);
}
