import { Card, Suit, rankStrength } from "./cards";
import { deal } from "./deal";
import { isBidAllowed } from "./bidding";
import {
  determineTrickWinner,
  getLedSuit,
  PlayedCard,
  JokerAnnounce,
} from "./trick";

// ─── L'état d'une manche ─────────────────────────────────────────
// round.ts assemble les briques pures (deal, bidding, trick) en une
// petite MACHINE À ÉTATS : un RoundState représente la manche à un
// instant T, et chaque transition (placeBid, playCard) retourne un
// NOUVEL état sans muter l'ancien. Toujours pur, toujours testable,
// toujours sans réseau.
//
// La manche traverse trois phases :
//   "bidding"  → chacun annonce son contrat (enchères)
//   "playing"  → on joue les plis un par un
//   "finished" → toutes les cartes sont jouées, la manche est close
export type RoundPhase = "bidding" | "playing" | "finished";

export type RoundState = {
  phase: RoundPhase;
  playerCount: number;
  cardsPerPlayer: number;
  dealerIndex: number; // le donneur (parle/joue en dernier aux enchères)

  hands: Card[][]; // hands[i] = la main du joueur i
  trumpSuit: Suit | null; // couleur d'atout (null = sans atout)
  trumpCard: Card | null; // la carte retournée (affichage)

  bids: (number | null)[]; // bids[i] = enchère du joueur i, null si pas encore parlé
  tricksWon: number[]; // tricksWon[i] = plis remportés par le joueur i

  currentPlayer: number; // à qui de jouer / d'enchérir
  trickLeader: number; // qui a mené le pli en cours
  currentTrick: PlayedCard[]; // cartes déjà posées dans le pli en cours
};

// ─── Créer une manche ────────────────────────────────────────────
// Distribue (via deal), détermine l'atout, place tout le monde en
// phase "bidding". Le premier à parler est le joueur À GAUCHE du
// donneur ; le donneur, lui, parlera en dernier.
export function createRound(
  playerCount: number,
  cardsPerPlayer: number,
  dealerIndex: number,
  deck: Card[]
): RoundState {
  const { hands, trumpSuit, trumpCard } = deal(
    playerCount,
    cardsPerPlayer,
    dealerIndex,
    deck
  );

  const firstSpeaker = (dealerIndex + 1) % playerCount;

  return {
    phase: "bidding",
    playerCount,
    cardsPerPlayer,
    dealerIndex,
    hands,
    trumpSuit,
    trumpCard,
    bids: Array.from({ length: playerCount }, () => null),
    tricksWon: Array.from({ length: playerCount }, () => 0),
    currentPlayer: firstSpeaker,
    trickLeader: firstSpeaker,
    currentTrick: [],
  };
}

// ─── Enregistrer une enchère ─────────────────────────────────────
// Vérifie le tour et la phase, valide l'enchère (avec la contrainte
// du donneur), l'enregistre, passe la parole. Quand tout le monde a
// parlé, bascule en phase "playing".
export function placeBid(
  state: RoundState,
  playerIndex: number,
  bid: number
): RoundState {
  if (state.phase !== "bidding") {
    throw new Error(`placeBid impossible : phase "${state.phase}"`);
  }
  if (playerIndex !== state.currentPlayer) {
    throw new Error(
      `Pas le tour du joueur ${playerIndex} (tour de ${state.currentPlayer})`
    );
  }

  // Le donneur est le DERNIER à enchérir → c'est lui qui subit la
  // contrainte « total ≠ nombre de cartes ».
  const isLastBidder = playerIndex === state.dealerIndex;

  // Enchères déjà posées (on filtre les null) → sert au calcul du total.
  const previousBids = state.bids.filter((b): b is number => b !== null);

  if (!isBidAllowed(bid, state.cardsPerPlayer, previousBids, isLastBidder)) {
    throw new Error(
      `Enchère interdite : ${bid} (joueur ${playerIndex}, donneur=${isLastBidder})`
    );
  }

  // On enregistre l'enchère dans une COPIE du tableau.
  const bids = [...state.bids];
  bids[playerIndex] = bid;

  // Tout le monde a-t-il parlé ?
  const everyoneBid = bids.every((b) => b !== null);

  if (everyoneBid) {
    // On passe au jeu : le joueur à gauche du donneur mène le 1er pli.
    const leader = (state.dealerIndex + 1) % state.playerCount;
    return {
      ...state,
      bids,
      phase: "playing",
      currentPlayer: leader,
      trickLeader: leader,
      currentTrick: [],
    };
  }

  // Sinon, la parole passe au joueur suivant.
  return {
    ...state,
    bids,
    currentPlayer: (playerIndex + 1) % state.playerCount,
  };
}

// ─── Jouer une carte ─────────────────────────────────────────────
// Vérifie le tour, la phase, la possession, la légalité (renonce
// simple). Retire la carte de la main, l'ajoute au pli. Quand le pli
// est complet, désigne le gagnant et lui donne la main. Quand toutes
// les cartes sont jouées, bascule en "finished".
//
// NB : pour cet objectif, les Jokers sont jouables LIBREMENT (on
// raffinera leur légalité fine dans un objectif dédié).
export function playCard(
  state: RoundState,
  playerIndex: number,
  card: Card,
  jokerAnnounce?: JokerAnnounce,
  declaredSuit?: Suit | null
): RoundState {
  if (state.phase !== "playing") {
    throw new Error(`playCard impossible : phase "${state.phase}"`);
  }
  if (playerIndex !== state.currentPlayer) {
    throw new Error(
      `Pas le tour du joueur ${playerIndex} (tour de ${state.currentPlayer})`
    );
  }

  const hand = state.hands[playerIndex];

  // Possession : le joueur a-t-il bien cette carte en main ?
  const cardIndex = hand.findIndex((c) => sameCard(c, card));
  if (cardIndex === -1) {
    throw new Error(
      `Le joueur ${playerIndex} ne possède pas cette carte : ${describe(card)}`
    );
  }

  // Validation propre au Joker JOUÉ : il doit être annoncé haut/bas, et
  // s'il MÈNE le pli il doit déclarer une couleur (que les autres suivront).
  if (card.type === "joker") {
    if (jokerAnnounce !== "high" && jokerAnnounce !== "low") {
      throw new Error(
        `Un joker doit être annoncé haut ("high") ou bas ("low").`
      );
    }
    const isLeading = state.currentTrick.length === 0;
    if (isLeading && (declaredSuit === null || declaredSuit === undefined)) {
      throw new Error(
        `Un joker qui mène le pli doit déclarer une couleur (declaredSuit).`
      );
    }
  }

  // Légalité du coup : renonce simple, ou obligations spéciales si le
  // pli a été MENÉ par un joker.
  assertLegalPlay(hand, card, state.currentTrick, state.trumpSuit);

  // On retire la carte de la main (copie immutable).
  const newHand = [
    ...hand.slice(0, cardIndex),
    ...hand.slice(cardIndex + 1),
  ];
  const hands = state.hands.map((h, i) => (i === playerIndex ? newHand : h));

  // On construit la carte jouée. announce/declaredSuit ne sont
  // pertinents que pour un joker.
  const played: PlayedCard =
    card.type === "joker"
      ? { playerIndex, card, announce: jokerAnnounce, declaredSuit }
      : { playerIndex, card };

  const currentTrick = [...state.currentTrick, played];

  // Le pli est-il complet (autant de cartes que de joueurs) ?
  if (currentTrick.length < state.playerCount) {
    // Non : au joueur suivant de jouer.
    return {
      ...state,
      hands,
      currentTrick,
      currentPlayer: (playerIndex + 1) % state.playerCount,
    };
  }

  // Pli complet → on désigne le gagnant.
  const winner = determineTrickWinner(currentTrick, state.trumpSuit);

  const tricksWon = [...state.tricksWon];
  tricksWon[winner] += 1;

  // Toutes les cartes ont-elles été jouées ?
  const allCardsPlayed = hands.every((h) => h.length === 0);

  if (allCardsPlayed) {
    // Fin de manche.
    return {
      ...state,
      hands,
      tricksWon,
      currentTrick: [],
      phase: "finished",
      currentPlayer: winner,
      trickLeader: winner,
    };
  }

  // Sinon : le gagnant mène le pli suivant.
  return {
    ...state,
    hands,
    tricksWon,
    currentTrick: [],
    currentPlayer: winner,
    trickLeader: winner,
  };
}

// ─── Helpers internes ────────────────────────────────────────────

// Égalité de cartes (par valeur). Normale : couleur+rang. Joker : id.
function sameCard(a: Card, b: Card): boolean {
  if (a.type === "joker" && b.type === "joker") {
    return a.id === b.id;
  }
  if (a.type === "normal" && b.type === "normal") {
    return a.suit === b.suit && a.rank === b.rank;
  }
  return false;
}

// La main contient-elle une carte (normale) de cette couleur ?
function handHasSuit(hand: Card[], suit: Suit): boolean {
  return hand.some((c) => c.type === "normal" && c.suit === suit);
}

// La main contient-elle un atout ?
function handHasTrump(hand: Card[], trumpSuit: Suit | null): boolean {
  if (trumpSuit === null) return false;
  return handHasSuit(hand, trumpSuit);
}

// Force de la plus haute carte d'une couleur donnée dans la main
// (-1 si la couleur est absente). Sert à la contrainte « joker haut ».
function highestStrengthOfSuit(hand: Card[], suit: Suit): number {
  let best = -1;
  for (const c of hand) {
    if (c.type === "normal" && c.suit === suit) {
      const s = rankStrength(c.rank);
      if (s > best) best = s;
    }
  }
  return best;
}

// ─── Prédicat public de légalité ────────────────────────────────
// Version « booléenne » d'assertLegalPlay. La légalité d'un coup ne
// dépend QUE de la main du joueur, du pli en cours (public) et de
// l'atout — jamais des mains adverses. Un client peut donc l'utiliser
// sur sa PROPRE main pour griser les cartes injouables, sans rien
// connaître des autres. (Le serveur reste l'autorité via playCard.)
export function isLegalPlay(
  hand: Card[],
  card: Card,
  currentTrick: PlayedCard[],
  trumpSuit: Suit | null
): boolean {
  try {
    assertLegalPlay(hand, card, currentTrick, trumpSuit);
    return true;
  } catch {
    return false;
  }
}

// ─── Légalité d'un coup ──────────────────────────────────────────
// Deux régimes selon le meneur du pli :
//   • pli mené par une couleur normale → renonce simple (suivre /
//     couper / défausser), jokers jouables librement ;
//   • pli mené par un JOKER → obligations spéciales (high/low),
//     déléguées à assertJokerLedObligation.
// Lève une Error si le coup est illégal (fail fast).
function assertLegalPlay(
  hand: Card[],
  card: Card,
  trick: PlayedCard[],
  trumpSuit: Suit | null
): void {
  // Le meneur du pli n'a aucune contrainte de couleur (la validation
  // annonce/declaredSuit d'un joker mené est faite en amont).
  if (trick.length === 0) return;

  const first = trick[0];
  const ledSuit = getLedSuit(trick);

  // ── Pli MENÉ par un Joker : obligations spéciales high/low. ──
  if (first.card.type === "joker") {
    assertJokerLedObligation(hand, card, ledSuit, first.announce, trumpSuit);
    return;
  }

  // ── Pli mené par une couleur normale ──
  // Les jokers restent jouables librement en suivi.
  if (card.type === "joker") return;

  // Rien à suivre (théorique ici, le meneur est une carte normale).
  if (ledSuit === null) return;

  // 1. Suit-on la couleur demandée ? Si oui : OK.
  if (card.suit === ledSuit) return;

  // On ne suit pas. A-t-on une carte de la couleur demandée ?
  if (handHasSuit(hand, ledSuit)) {
    throw new Error(
      `Renonce : vous devez suivre la couleur demandée (${ledSuit})`
    );
  }

  // 2. On ne peut pas suivre → doit-on couper ? Si la carte est un
  //    atout : OK. Sinon, si on possède un atout, on est obligé.
  if (card.suit === trumpSuit) return;
  if (handHasTrump(hand, trumpSuit)) {
    throw new Error(
      `Renonce : à défaut de suivre, vous devez couper à l'atout (${trumpSuit})`
    );
  }

  // 3. Ni couleur demandée ni atout en main → défausse libre.
}

// ─── Obligations imposées par un Joker MENÉ ──────────────────────
// Le pli a été ouvert par un joker, qui a déclaré une couleur S et une
// annonce (high/low). Les autres joueurs doivent :
//
//   • JOKER HAUT (high) sur S : jouer leur PLUS HAUTE carte de S
//     (contrainte la plus spécifique du jeu). À défaut de S :
//       - si S est l'atout et qu'on n'a pas d'atout → jeu libre ;
//       - si S n'est pas l'atout → couper à l'atout (n'importe lequel)
//         si possible, sinon défausser librement.
//
//   • JOKER BAS (low) sur S : SUIVRE la couleur S si possible (sans
//     contrainte de hauteur), sinon couper à l'atout si possible,
//     sinon défausser.
//
//   • Dans les deux cas, jouer l'AUTRE Joker est TOUJOURS permis.
//
// Lève une Error explicite si l'obligation n'est pas respectée.
function assertJokerLedObligation(
  hand: Card[],
  card: Card,
  declaredSuit: Suit | null,
  announce: JokerAnnounce | undefined,
  trumpSuit: Suit | null
): void {
  // Jouer l'autre Joker est toujours permis.
  if (card.type === "joker") return;

  // Sécurité : un joker mené sans couleur déclarée n'aurait pas dû
  // passer la validation amont ; par prudence on ne contraint rien.
  if (declaredSuit === null) return;

  const S = declaredSuit;
  const requireHighest = announce === "high";

  // ── On possède la couleur imposée S ──
  if (handHasSuit(hand, S)) {
    if (card.suit !== S) {
      throw new Error(`Joker mené sur ${S} : vous devez suivre cette couleur.`);
    }
    if (requireHighest) {
      const maxStrength = highestStrengthOfSuit(hand, S);
      if (rankStrength(card.rank) < maxStrength) {
        throw new Error(
          `Joker haut sur ${S} : vous devez jouer votre plus haute carte de ${S}.`
        );
      }
    }
    return;
  }

  // ── On ne possède PAS la couleur imposée S ──
  // Si S est l'atout et qu'on n'en a pas → jeu totalement libre.
  if (S === trumpSuit) return;

  // S est une couleur non-atout absente → couper à l'atout si possible.
  if (handHasTrump(hand, trumpSuit)) {
    if (card.suit !== trumpSuit) {
      throw new Error(
        `Joker mené sur ${S} (absente) : vous devez couper à l'atout (${trumpSuit}).`
      );
    }
    return;
  }

  // Ni couleur imposée ni atout en main → défausse libre.
}

// Petite description lisible d'une carte (messages d'erreur).
function describe(card: Card): string {
  return card.type === "normal" ? `${card.rank} de ${card.suit}` : card.id;
}
