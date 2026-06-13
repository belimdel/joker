import { Card, Suit, createDeck, shuffle } from "./cards";
import { JokerAnnounce } from "./trick";
import { createRound, placeBid, playCard, RoundState } from "./round";
import { computePlayerScore } from "./scoring";

// ─── Niveau PARTIE ───────────────────────────────────────────────
// game.ts orchestre les 24 donnes d'une partie en s'appuyant sur
// round.ts (qui gère une manche). Comme round.ts, tout est pur et
// immutable : chaque transition retourne un NOUVEau GameState.

// Une donne planifiée : à quel set elle appartient, et combien de
// cartes chaque joueur reçoit.
export type DealPlan = {
  setIndex: number;
  cardsPerPlayer: number;
};

export type GamePhase = "playing" | "finished";

export type GameState = {
  playerCount: number;
  schedule: DealPlan[]; // la séquence ordonnée des 24 donnes
  currentDealIndex: number; // indice de la donne en cours dans schedule
  dealerIndex: number; // donneur de la manche EN COURS
  round: RoundState; // la manche en cours (type réutilisé de round.ts)
  scores: number[]; // scores CUMULÉS par joueur
  phase: GamePhase;

  // ── Suivi du set courant (nécessaire au bonus de set) ──
  // Pour chaque donne déjà jouée du set courant, le tableau des scores
  // par joueur (sert à retrouver le meilleur score d'une donne du set).
  setDealScores: number[][];
  // Par joueur : a-t-il réussi TOUTES ses enchères du set jusqu'ici ?
  setAllMade: boolean[];
};

// ─── La séquence des donnes d'une partie ─────────────────────────
// Structure 4 joueurs (24 donnes) :
//   Set 0 : 8 donnes  → 1,2,3,4,5,6,7,8 cartes
//   Set 1 : 4 donnes  → 9 cartes
//   Set 2 : 8 donnes  → 8,7,6,5,4,3,2,1 cartes
//   Set 3 : 4 donnes  → 9 cartes
//
// NB : seule la structure à 4 joueurs est implémentée pour l'instant.
// Les structures 3/5/6 joueurs diffèrent (document) et seront ajoutées
// plus tard ; le code est isolé ici pour faciliter cette extension.
export function buildGameSchedule(playerCount: number): DealPlan[] {
  if (playerCount !== 4) {
    throw new Error(
      `buildGameSchedule : seule la structure à 4 joueurs est implémentée (reçu ${playerCount}).`
    );
  }

  const schedule: DealPlan[] = [];

  // Set 0 : 1 → 8 cartes.
  for (let n = 1; n <= 8; n++) {
    schedule.push({ setIndex: 0, cardsPerPlayer: n });
  }
  // Set 1 : 4 donnes de 9 cartes.
  for (let i = 0; i < 4; i++) {
    schedule.push({ setIndex: 1, cardsPerPlayer: 9 });
  }
  // Set 2 : 8 → 1 cartes.
  for (let n = 8; n >= 1; n--) {
    schedule.push({ setIndex: 2, cardsPerPlayer: n });
  }
  // Set 3 : 4 donnes de 9 cartes.
  for (let i = 0; i < 4; i++) {
    schedule.push({ setIndex: 3, cardsPerPlayer: 9 });
  }

  return schedule;
}

// ─── Démarrer une partie ─────────────────────────────────────────
// Construit le schedule et lance la première manche (deck mélangé +
// createRound avec le cardsPerPlayer de la donne 0).
// Convention : le joueur 0 est le donneur de la première manche.
export function createGame(playerCount: number): GameState {
  if (playerCount !== 4) {
    throw new Error(
      `createGame : seule la partie à 4 joueurs est implémentée pour l'instant (reçu ${playerCount}).`
    );
  }

  const schedule = buildGameSchedule(playerCount);
  const dealerIndex = 0;
  const first = schedule[0];
  const round = createRound(
    playerCount,
    first.cardsPerPlayer,
    dealerIndex,
    shuffle(createDeck())
  );

  return {
    playerCount,
    schedule,
    currentDealIndex: 0,
    dealerIndex,
    round,
    scores: Array.from({ length: playerCount }, () => 0),
    phase: "playing",
    setDealScores: [],
    setAllMade: Array.from({ length: playerCount }, () => true),
  };
}

// ─── Passer à la manche suivante ─────────────────────────────────
// À appeler quand la manche courante est terminée (round.phase ===
// "finished"). Calcule les scores de la manche, les cumule, gère le
// bonus de fin de set, fait tourner le donneur, puis démarre la donne
// suivante — ou termine la partie après la 24e donne.
export function advanceToNextRound(state: GameState): GameState {
  if (state.phase === "finished") {
    throw new Error("advanceToNextRound : la partie est déjà terminée.");
  }
  if (state.round.phase !== "finished") {
    throw new Error(
      `advanceToNextRound : la manche courante n'est pas terminée (phase "${state.round.phase}").`
    );
  }

  const { playerCount, round } = state;
  const deal = state.schedule[state.currentDealIndex];
  const cardsPerPlayer = deal.cardsPerPlayer;

  // 1. Score de la manche, joueur par joueur (via computePlayerScore).
  const bids: number[] = [];
  const roundScores: number[] = [];
  for (let p = 0; p < playerCount; p++) {
    const bid = round.bids[p];
    if (bid === null) {
      throw new Error(
        `Manche terminée mais enchère manquante pour le joueur ${p}.`
      );
    }
    bids.push(bid);
    roundScores.push(computePlayerScore(bid, round.tricksWon[p], cardsPerPlayer));
  }

  // 2. Cumul des scores.
  let scores = state.scores.map((s, p) => s + roundScores[p]);

  // 3. Accumulateurs du set courant.
  let setDealScores = [...state.setDealScores, roundScores];
  let setAllMade = state.setAllMade.map(
    (made, p) => made && round.tricksWon[p] === bids[p]
  );

  // 4. Franchit-on la fin d'un set ?
  const isLastDeal = state.currentDealIndex === state.schedule.length - 1;
  const setEnds =
    isLastDeal ||
    state.schedule[state.currentDealIndex + 1].setIndex !== deal.setIndex;

  if (setEnds) {
    // Bonus de set : chaque joueur ayant réussi TOUTES ses enchères du
    // set gagne son meilleur score sur une seule donne de ce set.
    for (let p = 0; p < playerCount; p++) {
      if (setAllMade[p]) {
        const best = Math.max(...setDealScores.map((d) => d[p]));
        scores[p] += best;
      }
    }
    // Réinitialisation des accumulateurs pour le set suivant.
    setDealScores = [];
    setAllMade = Array.from({ length: playerCount }, () => true);
  }

  // 5. Le donneur tourne d'un cran vers la gauche.
  const nextDealer = (state.dealerIndex + 1) % playerCount;

  // 6. Fin de partie ou manche suivante.
  if (isLastDeal) {
    return {
      ...state,
      scores,
      setDealScores,
      setAllMade,
      dealerIndex: nextDealer,
      phase: "finished",
    };
  }

  const nextDeal = state.schedule[state.currentDealIndex + 1];
  const nextRound = createRound(
    playerCount,
    nextDeal.cardsPerPlayer,
    nextDealer,
    shuffle(createDeck())
  );

  return {
    ...state,
    scores,
    setDealScores,
    setAllMade,
    dealerIndex: nextDealer,
    currentDealIndex: state.currentDealIndex + 1,
    round: nextRound,
  };
}

// ─── Actions de jeu au NIVEAU PARTIE ─────────────────────────────
// Le serveur reçoit des intentions (enchère, carte) et les applique à
// la manche en cours, en réutilisant la logique pure et testée de
// round.ts. Ces enveloppes retournent un nouveau GameState (immutable).

// Appliquer une enchère. Délègue la validation à placeBid (round.ts) :
// hors-tour, mauvaise phase, enchère interdite → exception propagée.
export function submitBid(
  game: GameState,
  playerIndex: number,
  bid: number
): GameState {
  if (game.phase !== "playing") {
    throw new Error("submitBid : la partie n'est pas en cours.");
  }
  const round = placeBid(game.round, playerIndex, bid);
  return { ...game, round };
}

// Appliquer un coup. Délègue la validation à playCard (round.ts). Si le
// coup TERMINE la manche, on enchaîne automatiquement (advanceToNextRound)
// vers la donne suivante — ou la fin de partie. Le client n'a rien à
// demander : il recevra simplement les nouvelles vues.
export function submitCard(
  game: GameState,
  playerIndex: number,
  card: Card,
  announce?: JokerAnnounce,
  declaredSuit?: Suit | null
): GameState {
  if (game.phase !== "playing") {
    throw new Error("submitCard : la partie n'est pas en cours.");
  }
  const round = playCard(game.round, playerIndex, card, announce, declaredSuit);
  const next: GameState = { ...game, round };
  if (round.phase === "finished") {
    return advanceToNextRound(next);
  }
  return next;
}
