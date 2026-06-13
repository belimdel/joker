import { Card, Suit } from "./cards";
import { PlayedCard } from "./trick";
import { RoundPhase } from "./round";
import { GamePhase, GameState } from "./game";

// ─── La vue filtrée d'un joueur ─────────────────────────────────
// SÉCURITÉ : le GameState complet contient les mains de TOUS les
// joueurs. On ne l'envoie JAMAIS tel quel au client (sinon on lit les
// cartes des autres dans l'onglet réseau et on triche). Chaque joueur
// reçoit cette PlayerView : sa main en clair, et pour les autres
// UNIQUEMENT leur nombre de cartes — jamais leur contenu.
//
// « Le serveur fait autorité, le client est un menteur. »
export type PlayerView = {
  // Qui regarde (siège du destinataire).
  you: number;

  // ── Niveau partie (tout public) ──
  gamePhase: GamePhase; // "playing" | "finished"
  currentDealIndex: number;
  totalDeals: number;
  setIndex: number; // set courant (0-3)
  cardsPerPlayer: number; // cartes de la donne courante
  dealerIndex: number;
  scores: number[]; // scores cumulés (publics)

  // ── Niveau manche (tout public sauf les mains) ──
  roundPhase: RoundPhase; // "bidding" | "playing" | "finished"
  trumpSuit: Suit | null;
  trumpCard: Card | null; // la carte d'atout est RÉVÉLÉE à tous
  bids: (number | null)[]; // enchères de tous (publiques)
  tricksWon: number[]; // plis gagnés de tous (publics)
  currentPlayer: number; // à qui d'enchérir / de jouer
  trickLeader: number;
  currentTrick: PlayedCard[]; // cartes déjà posées sur la table (publiques)

  // ── Cartes ──
  hand: Card[]; // MA main, en clair
  handCounts: number[]; // nombre de cartes par joueur (les autres = compte SEUL)
};

// ─── La projection (fonction pure) ──────────────────────────────
// Produit la vue qu'un joueur donné a le DROIT de voir. Ne mute pas le
// GameState (on retourne des copies des tableaux). Le type PlayerView
// n'a structurellement aucun champ pour les mains adverses : une fuite
// est donc impossible par construction — et le test le prouve aussi à
// l'exécution.
export function buildPlayerView(
  state: GameState,
  playerIndex: number
): PlayerView {
  const round = state.round;
  const deal = state.schedule[state.currentDealIndex];

  return {
    you: playerIndex,

    gamePhase: state.phase,
    currentDealIndex: state.currentDealIndex,
    totalDeals: state.schedule.length,
    setIndex: deal.setIndex,
    cardsPerPlayer: deal.cardsPerPlayer,
    dealerIndex: state.dealerIndex,
    scores: [...state.scores],

    roundPhase: round.phase,
    trumpSuit: round.trumpSuit,
    trumpCard: round.trumpCard,
    bids: [...round.bids],
    tricksWon: [...round.tricksWon],
    currentPlayer: round.currentPlayer,
    trickLeader: round.trickLeader,
    currentTrick: round.currentTrick.map((p) => ({ ...p })),

    // Sa main en clair…
    hand: [...round.hands[playerIndex]],
    // …mais pour TOUS, seulement le compte (le contenu adverse ne sort pas).
    handCounts: round.hands.map((h) => h.length),
  };
}
