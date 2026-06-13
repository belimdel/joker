import {
  buildGameSchedule,
  createGame,
  advanceToNextRound,
  GameState,
} from "./game";
import { RoundState } from "./round";
import { check, expectThrow } from "./test-utils";

// Force la manche courante à "finished" avec des enchères et plis
// gagnés donnés. advanceToNextRound ne lit que phase/bids/tricksWon,
// donc le reste du RoundState peut rester tel quel.
function finishRoundWith(
  state: GameState,
  bids: number[],
  tricksWon: number[]
): GameState {
  const round: RoundState = { ...state.round, phase: "finished", bids, tricksWon };
  return { ...state, round };
}

console.log("══════ buildGameSchedule(4) ══════");
const schedule = buildGameSchedule(4);
check("Nombre de donnes", schedule.length, 24);
check(
  "Séquence cartes/joueur",
  schedule.map((d) => d.cardsPerPlayer),
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 8, 7, 6, 5, 4, 3, 2, 1, 9, 9, 9, 9]
);
check(
  "Séquence des sets",
  schedule.map((d) => d.setIndex),
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3]
);

console.log("\n══════ createGame(4) ══════");
const g0 = createGame(4);
check("Phase de partie", g0.phase, "playing");
check("Donne courante = 0", g0.currentDealIndex, 0);
check("Donneur initial = 0", g0.dealerIndex, 0);
check("Scores initiaux à zéro", g0.scores, [0, 0, 0, 0]);
check("Manche démarrée en bidding", g0.round.phase, "bidding");
check(
  "1 carte/joueur à la donne 0",
  g0.round.hands.map((h) => h.length),
  [1, 1, 1, 1]
);

// Avancer une manche non terminée doit être refusé.
expectThrow("Refus d'avancer si manche non finie", () => advanceToNextRound(g0));

console.log("\n══════ advanceToNextRound : cumul + rotation ══════");
// Donne 0 (1 carte) : p0 enchère 1 et gagne 1 → enchère pleine → 100.
// Les autres passent (0/0) → 50 chacun.
const g1 = advanceToNextRound(finishRoundWith(g0, [1, 0, 0, 0], [1, 0, 0, 0]));
check("Scores après donne 0", g1.scores, [100, 50, 50, 50]);
check("Donne courante avancée à 1", g1.currentDealIndex, 1);
check("Donneur tourné à 1", g1.dealerIndex, 1);
check("Nouvelle manche en bidding", g1.round.phase, "bidding");
check(
  "Donne 1 = 2 cartes/joueur",
  g1.round.hands.map((h) => h.length),
  [2, 2, 2, 2]
);
check("Donneur de la nouvelle manche = 1", g1.round.dealerIndex, 1);
check("Premier parleur = 2 (gauche du donneur)", g1.round.currentPlayer, 2);

console.log("\n══════ Bonus de set (fin du set 0) ══════");
let gb = createGame(4);
for (let d = 0; d < 8; d++) {
  const bids = [1, 0, 0, 0]; // p0 annonce 1 à chaque donne
  // p2 RATE sa passe à la donne 3 (gagne 1 pli alors qu'il a annoncé 0).
  const won = [1, 0, d === 3 ? 1 : 0, 0];
  gb = advanceToNextRound(finishRoundWith(gb, bids, won));
}
// p0 : 8×100 (réussit tout) + bonus 100 = 900.
// p1 : 8×50 (passe réussie) + bonus 50 = 450.
// p2 : 7×50 + 10 (donne 3 ratée), PAS de bonus = 360.
// p3 : 8×50 + bonus 50 = 450.
check("Scores après bonus de set", gb.scores, [900, 450, 360, 450]);
check("Passage au set 1", gb.schedule[gb.currentDealIndex].setIndex, 1);
check("Donne courante = 8", gb.currentDealIndex, 8);
check("Accumulateur setAllMade réinitialisé", gb.setAllMade, [
  true,
  true,
  true,
  true,
]);

console.log("\n══════ Partie complète (24 donnes) ══════");
let fg = createGame(4);
for (let d = 0; d < 24; d++) {
  fg = advanceToNextRound(finishRoundWith(fg, [0, 0, 0, 0], [0, 0, 0, 0]));
}
// Chaque donne : passe réussie 50 × 24 = 1200. Bonus 4 sets × 50 = 200.
// Total attendu : 1400 chacun.
check("Partie terminée", fg.phase, "finished");
check("Scores finaux (passe réussie + 4 bonus)", fg.scores, [
  1400, 1400, 1400, 1400,
]);
// Avancer une partie terminée doit être refusé.
expectThrow("Refus d'avancer une partie terminée", () =>
  advanceToNextRound(fg)
);
