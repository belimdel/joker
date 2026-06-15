import { createGame, advanceToNextRound } from "./game";
import { placeBid, playCard, chooseTrump, RoundState } from "./round";
import { allowedBids } from "./bidding";
import { Card, Suit } from "./cards";
import { check } from "./test-utils";

// ─── Stratégie naïve déterministe pour piloter une manche ────────
// But : exercer la VRAIE couture round↔game de bout en bout, pas bien
// jouer. On enchérit le plus petit montant légal, et on joue la
// première carte légale de la main.

// Couleur déclarée quand on MÈNE un joker : celle de la 1re carte
// normale en main, sinon pique par défaut (main composée de jokers).
function pickDeclaredSuit(hand: Card[]): Suit {
  const normal = hand.find((c) => c.type === "normal");
  return normal && normal.type === "normal" ? normal.suit : "spades";
}

// Tente de jouer une carte. Pour un joker on fournit une annonce
// ("low" par défaut) et, s'il mène, une couleur déclarée. Renvoie le
// nouvel état si le coup est légal, sinon null (playCard étant pur, on
// peut « essayer » sans rien casser).
function tryPlay(round: RoundState, p: number, card: Card): RoundState | null {
  const isLeading = round.currentTrick.length === 0;
  try {
    if (card.type === "joker") {
      const declared = isLeading ? pickDeclaredSuit(round.hands[p]) : undefined;
      return playCard(round, p, card, "low", declared);
    }
    return playCard(round, p, card);
  } catch {
    return null;
  }
}

// Pilote une manche entière jusqu'à round.phase === "finished".
export function playRoundAutomatically(round: RoundState): RoundState {
  let r = round;
  let safety = 0;

  while (r.phase !== "finished") {
    if (++safety > 100000) {
      throw new Error("playRoundAutomatically : boucle anormale (sécurité)");
    }

    if (r.phase === "choosing-trump") {
      // Manche à 9 cartes : le décideur choisit l'atout de la couleur
      // de sa 1re carte normale (ou passe si sa main de 3 n'a que des
      // jokers — improbable mais couvert : suit = null = sans atout).
      const p = r.currentPlayer;
      const firstNormal = r.hands[p].find((c) => c.type === "normal");
      const suit = firstNormal && firstNormal.type === "normal" ? firstNormal.suit : null;
      r = chooseTrump(r, p, suit);
    } else if (r.phase === "bidding") {
      const p = r.currentPlayer;
      const isLast = p === r.dealerIndex;
      const previous = r.bids.filter((b): b is number => b !== null);
      const options = allowedBids(r.cardsPerPlayer, previous, isLast);
      r = placeBid(r, p, options[0]); // plus petit montant légal
    } else {
      // phase "playing" : première carte légale de la main.
      const p = r.currentPlayer;
      let next: RoundState | null = null;
      for (const card of r.hands[p]) {
        const attempt = tryPlay(r, p, card);
        if (attempt !== null) {
          next = attempt;
          break;
        }
      }
      if (next === null) {
        throw new Error(`Aucun coup légal trouvé pour le joueur ${p}`);
      }
      r = next;
    }
  }

  return r;
}

console.log("══════ Une vraie manche jouée de bout en bout ══════");
const g = createGame(4);
const finished = playRoundAutomatically(g.round);
check("Manche auto : phase finished", finished.phase, "finished");
check("Manche auto : mains vidées", finished.hands.map((h) => h.length), [
  0, 0, 0, 0,
]);
check(
  "Manche auto : somme des plis = 1 (donne 0, 1 carte)",
  finished.tricksWon.reduce((a, b) => a + b, 0),
  1
);

// La couture : on injecte la manche finie dans le game et on avance.
const g2 = advanceToNextRound({ ...g, round: finished });
check("Après advance : donne courante = 1", g2.currentDealIndex, 1);
check("Après advance : nouvelle manche en bidding", g2.round.phase, "bidding");
check(
  "Après advance : scores cumulés ≥ 0",
  g2.scores.every((s) => s >= 0),
  true
);

console.log("\n══════ Auto-parties complètes (24 donnes) ══════");
// On fait tourner plusieurs parties entières en pilotage automatique.
// Chaque deck est mélangé (aléatoire) → on couvre des cas variés, dont
// des jokers et des donnes à 9. Invariants vérifiés à chaque donne :
//   - playRoundAutomatically termine bien la manche ;
//   - somme des plis d'une manche === cartes par joueur de la donne.
const N = 3;
let allFinished = true;
let allCoherent = true;
let allScoresOk = true;
let dealsTotal = 0;

for (let iter = 0; iter < N; iter++) {
  let game = createGame(4);
  let deals = 0;

  while (game.phase !== "finished") {
    const fr = playRoundAutomatically(game.round);
    if (fr.phase !== "finished") allFinished = false;

    const expected = game.schedule[game.currentDealIndex].cardsPerPlayer;
    const sumTricks = fr.tricksWon.reduce((a, b) => a + b, 0);
    if (sumTricks !== expected) allCoherent = false;

    game = advanceToNextRound({ ...game, round: fr });
    deals++;
  }

  if (deals !== 24) allFinished = false;
  if (game.phase !== "finished") allFinished = false;
  if (!game.scores.every((s) => Number.isFinite(s) && s >= 0)) allScoresOk = false;
  dealsTotal += deals;
}

check(`Auto-parties ×${N} : chaque manche se termine`, allFinished, true);
check(
  `Auto-parties ×${N} : somme des plis = cartes/joueur (chaque donne)`,
  allCoherent,
  true
);
check(`Auto-parties ×${N} : scores cumulés plausibles (finis, ≥0)`, allScoresOk, true);
check(`Auto-parties ×${N} : total donnes jouées`, dealsTotal, N * 24);
