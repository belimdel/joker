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
check("dealHistory initial vide", g0.dealHistory, []);

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

console.log("\n══════ advanceToNextRound : dealHistory ══════");
check("dealHistory : 1 entrée après la donne 0", g1.dealHistory.length, 1);
check("dealHistory[0] : dealIndex", g1.dealHistory[0].dealIndex, 0);
check("dealHistory[0] : cardsPerPlayer", g1.dealHistory[0].cardsPerPlayer, 1);
check("dealHistory[0] : enchères", g1.dealHistory[0].bids, [1, 0, 0, 0]);
check("dealHistory[0] : plis gagnés", g1.dealHistory[0].tricksWon, [1, 0, 0, 0]);
check("dealHistory[0] : scores bruts de la donne", g1.dealHistory[0].scores, [100, 50, 50, 50]);

console.log("\n══════ advanceToNextRound : lastTrick/lastTrickWinner conservés ══════");
const g0b = createGame(4);
const fakeLastTrick: RoundState["lastTrick"] = [
  { playerIndex: 0, card: { type: "normal", suit: "spades", rank: "A" } },
];
const withLastTrick: GameState = {
  ...g0b,
  round: {
    ...g0b.round,
    phase: "finished",
    bids: [0, 0, 0, 0],
    tricksWon: [0, 0, 0, 0],
    lastTrick: fakeLastTrick,
    lastTrickWinner: 0,
  },
};
const afterAdv = advanceToNextRound(withLastTrick);
check("lastTrick conservé dans la nouvelle donne", afterAdv.round.lastTrick, fakeLastTrick);
check("lastTrickWinner conservé dans la nouvelle donne", afterAdv.round.lastTrickWinner, 0);
check("Nouvelle donne en phase bidding malgré lastTrick conservé", afterAdv.round.phase, "bidding");

console.log("\n══════ Bonus de set V2 : un seul gagnant (doublement + effacement) ══════");
let gb = createGame(4);
for (let d = 0; d < 8; d++) {
  const lastDeal = d === 7;
  // p0 annonce 1 et le réussit à chaque donne → set complet réussi.
  // p1 et p3 réussissent toutes leurs passes (0/0) SAUF la dernière
  // donne où ils annoncent 1 et gagnent 0 plis → xisht (-200), set raté.
  const bids = [1, lastDeal ? 1 : 0, 0, lastDeal ? 1 : 0];
  // p2 rate sa passe à la donne 3 (gagne 1 pli alors qu'il a annoncé 0).
  const won = [1, 0, d === 3 ? 1 : 0, 0];
  gb = advanceToNextRound(finishRoundWith(gb, bids, won));
}
// Avant bonus :
//   p0 : 8×100 (enchère pleine ou 50+50, réussit tout)        = 800
//   p1 : 7×50 (passe réussie) + 1×(-200) (xisht donne 7)       = 150
//   p2 : 7×50 + 10 (donne 3 ratée)                             = 360
//   p3 : idem p1                                               = 150
// Seul p0 a réussi TOUTES ses enchères du set → seul gagnant.
//   1. Doublement : meilleur score de p0 = 100 → +100 → 900.
//   2. Effacement : parmi p1/p2/p3, meilleur score de manche = 50,
//      partout à égalité → on prend l'index le plus bas = p1.
//      On efface sa meilleure donne (valeur 50) → 150 - 50 = 100.
check("Scores après bonus de set (un gagnant)", gb.scores, [900, 100, 360, 150]);
check("Passage au set 1", gb.schedule[gb.currentDealIndex].setIndex, 1);
check("Donne courante = 8", gb.currentDealIndex, 8);
check("Accumulateur setAllMade réinitialisé", gb.setAllMade, [
  true,
  true,
  true,
  true,
]);

console.log("\n══════ Bonus de set V2 : set raté → aucune prime ══════");
let gn = createGame(4);
for (let d = 0; d < 8; d++) {
  if (d === 0) {
    // 1 carte/joueur : tous annoncent 1, seul p0 gagne le pli.
    // p1/p2/p3 → xisht (-200), set raté pour eux dès la donne 0.
    gn = advanceToNextRound(finishRoundWith(gn, [1, 1, 1, 1], [1, 0, 0, 0]));
  } else if (d === 1) {
    // p0 annonce 0 mais gagne 1 pli → raté (10 pts), set raté pour p0.
    gn = advanceToNextRound(finishRoundWith(gn, [0, 0, 0, 0], [1, 0, 0, 0]));
  } else {
    // Tout le monde passe proprement (0/0 → 50 chacun).
    gn = advanceToNextRound(finishRoundWith(gn, [0, 0, 0, 0], [0, 0, 0, 0]));
  }
}
// Avant bonus :
//   p0 : 100 (donne 0, enchère pleine) + 10 (donne 1 ratée) + 6×50 = 410
//   p1/p2/p3 : -200 (donne 0, xisht) + 7×50                         = 150
// Personne n'a réussi TOUTES ses enchères du set → AUCUNE prime.
check("Scores après set raté (aucune prime)", gn.scores, [410, 150, 150, 150]);
check("Accumulateur setAllMade réinitialisé (set raté)", gn.setAllMade, [
  true,
  true,
  true,
  true,
]);

console.log("\n══════ Bonus de set V2 : deux gagnants (gagnants protégés) ══════");
let gd = createGame(4);
for (let d = 0; d < 8; d++) {
  // p0 annonce 1 et le réussit (set complet), p1 passe proprement (set
  // complet aussi) → 2 gagnants de prime. p2 rate la donne 3, p3 rate
  // la donne 5 → 2 non-gagnants, tous deux ciblés par l'effacement.
  const bids = [1, 0, 0, 0];
  const won = [1, 0, d === 3 ? 1 : 0, d === 5 ? 1 : 0];
  gd = advanceToNextRound(finishRoundWith(gd, bids, won));
}
// Avant bonus : p0=800, p1=400, p2=360, p3=360.
// Gagnants (protégés) : p0 (meilleure donne 100) et p1 (meilleure donne
// 50). Non-gagnants : p2 et p3, chacun avec une meilleure donne = 50.
//   - Doublement : p0 → 800+100=900 ; p1 → 400+50=450.
//   - Effacement : 2 gagnants → 2 cibles parmi les non-gagnants, classés
//     par meilleure donne décroissante (égalité 50/50 → index le plus
//     bas) = [p2, p3]. Les deux sont effacés (50 > 0) :
//     p2 → 360-50=310 ; p3 → 360-50=310. p0/p1 ne perdent rien (protégés).
check("Scores après bonus de set (deux gagnants, gagnants protégés)", gd.scores, [
  900, 450, 310, 310,
]);

console.log("\n══════ Bonus de set V2 : effacement sans effet sur une manche négative (xisht) ══════");
let gx = createGame(4);
for (let d = 0; d < 8; d++) {
  // p0 annonce 1 et le réussit à chaque donne → set complet réussi.
  // p1/p2/p3 annoncent 1 mais ne gagnent JAMAIS de pli → xisht (-200)
  // à chaque donne : leur "meilleure" manche du set est négative.
  gx = advanceToNextRound(finishRoundWith(gx, [1, 1, 1, 1], [1, 0, 0, 0]));
}
// Avant bonus : p0 = 8×100 = 800 ; p1=p2=p3 = 8×(-200) = -1600.
// p0 (seul gagnant) double sa meilleure manche (100) → 900.
// Cible d'effacement (1 gagnant → 1 cible) : p1 (meilleure manche =
// -200, premier ex-aequo parmi p1/p2/p3). Comme -200 <= 0, l'effacement
// n'a AUCUN EFFET — on ne remonte jamais un score. p1/p2/p3 inchangés.
check("Effacement sans effet sur une manche négative", gx.scores, [
  900, -1600, -1600, -1600,
]);

console.log("\n══════ doubled / erased : marquage dans dealHistory ══════");
let gm = createGame(4);
for (let d = 0; d < 8; d++) {
  // p0 (gagnant unique du set) : passe (50) à chaque donne, sauf à la
  // donne 3 où il annonce l'enchère pleine (4) et la réussit → 400,
  // sa meilleure manche du set.
  const bidP0 = d === 3 ? 4 : 0;
  const wonP0 = d === 3 ? 4 : 0;

  // p1 (non-gagnant) : xisht à la donne 0 (rate son set), puis enchère
  // pleine réussie (6) à la donne 5 → 600, sa meilleure manche — la
  // plus haute parmi les non-gagnants.
  const bidP1 = d === 0 ? 1 : d === 5 ? 6 : 0;
  const wonP1 = d === 0 ? 0 : d === 5 ? 6 : 0;

  // p2/p3 (non-gagnants, meilleure manche = 50 < 600 → pas ciblés) :
  // chacun rate son set via un xisht isolé (donne 2 pour p2, donne 4
  // pour p3), passe (50) ailleurs.
  const bidP2 = d === 2 ? 1 : 0;
  const bidP3 = d === 4 ? 1 : 0;

  gm = advanceToNextRound(
    finishRoundWith(gm, [bidP0, bidP1, bidP2, bidP3], [wonP0, wonP1, 0, 0])
  );
}
// Seul p0 réussit toutes ses enchères du set → seul gagnant. Sa
// meilleure manche (400, donne 3) est doublée : doubled[0] = true.
// Parmi p1/p2/p3, p1 a la meilleure manche (600, donne 5) → c'est elle
// qui est effacée (1 gagnant → 1 cible) : erased[1] = true.
check("Donne 3 : p0 doublé, personne d'autre", gm.dealHistory[3].doubled, [
  true, false, false, false,
]);
check("Donne 3 : personne effacé", gm.dealHistory[3].erased, [
  false, false, false, false,
]);
check("Donne 5 : p1 effacé, personne d'autre", gm.dealHistory[5].erased, [
  false, true, false, false,
]);
check("Donne 5 : personne doublé", gm.dealHistory[5].doubled, [
  false, false, false, false,
]);
for (const d of [0, 1, 2, 4, 6, 7]) {
  check(`Donne ${d} : aucun siège doublé`, gm.dealHistory[d].doubled, [
    false, false, false, false,
  ]);
  check(`Donne ${d} : aucun siège effacé`, gm.dealHistory[d].erased, [
    false, false, false, false,
  ]);
}

console.log("\n══════ Partie complète (24 donnes) ══════");
let fg = createGame(4);
for (let d = 0; d < 24; d++) {
  fg = advanceToNextRound(finishRoundWith(fg, [0, 0, 0, 0], [0, 0, 0, 0]));
}
// Chaque donne : passe réussie 50 × 24 = 1200 pour tout le monde.
// Les 4 joueurs réussissent TOUTES leurs enchères de TOUS les sets →
// 4 gagnants de prime et 0 non-gagnant à chaque fin de set.
//   - Doublement : chacun double son meilleur (50) → +50 par joueur.
//   - Effacement : il faut 4 cibles mais il y a 0 non-gagnant
//     disponible → targetCount = min(4, 0) = 0 → AUCUN effacement.
// Par set : +50 pour chacun, symétrique. Sur 4 sets : +200 chacun.
// Total attendu : 1200 + 200 = 1400 pour les 4 joueurs (comme l'ancien
// barème V1 — la cascade observée dans une version intermédiaire de ce
// calcul a disparu : les gagnants sont désormais protégés entre eux).
check("Partie terminée", fg.phase, "finished");
check("Scores finaux (4 gagnants, 0 non-gagnant → aucun effacement)", fg.scores, [
  1400, 1400, 1400, 1400,
]);
// 4 gagnants / 0 non-gagnant à chaque set → les 4 sièges doublent, et il
// n'y a aucune cible d'effacement (targetCount = 0).
check(
  "Aucun siège effacé sur toute la partie",
  fg.dealHistory.every((d) => d.erased.every((e) => !e)),
  true
);
check(
  "Première manche de chaque set : les 4 sièges doublés (0, 8, 12, 20)",
  [0, 8, 12, 20].every((i) => fg.dealHistory[i].doubled.every((dbl) => dbl)),
  true
);
check(
  "Manches suivantes : aucun siège doublé (1, 9, 13, 21)",
  [1, 9, 13, 21].every((i) => fg.dealHistory[i].doubled.every((dbl) => !dbl)),
  true
);
// Avancer une partie terminée doit être refusé.
expectThrow("Refus d'avancer une partie terminée", () =>
  advanceToNextRound(fg)
);

console.log("\n══════ Mode only9 (v6) ══════");
const s9 = buildGameSchedule(4, "only9");
check("only9 : 16 donnes", s9.length, 16);
check(
  "only9 : toutes à 9 cartes",
  s9.every((d) => d.cardsPerPlayer === 9),
  true
);
check(
  "only9 : 4 sets de 4 donnes",
  s9.map((d) => d.setIndex),
  [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]
);

const g9 = createGame(4, { mode: "only9", khishtiPenalty: 200 });
check("only9 : config posée sur l'état", g9.config.mode, "only9");
check(
  "only9 : première manche en choix d'atout (9 cartes)",
  g9.round.phase,
  "choosing-trump"
);
check(
  "only9 : 16 donnes planifiées dans l'état",
  g9.schedule.length,
  16
);

console.log("\n══════ Pénalité khishti configurable (v6) ══════");
// Mise -500 : p0 fait un xisht (enchère 2, 0 pli), les autres passent.
let g500 = createGame(4, { mode: "standard", khishtiPenalty: 500 });
check("Config par défaut standard/-500", g500.config.khishtiPenalty, 500);
g500 = advanceToNextRound(finishRoundWith(g500, [1, 0, 0, 0], [0, 1, 0, 0]));
check(
  "Xisht à -500 (et passe ratée 10, passes réussies 50)",
  g500.scores,
  [-500, 10, 50, 50]
);

// Défaut inchangé : createGame sans config → standard / -200.
const gDef = createGame(4);
check("Défaut : mode standard", gDef.config.mode, "standard");
check("Défaut : pénalité 200", gDef.config.khishtiPenalty, 200);
