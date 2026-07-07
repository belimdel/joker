import type { Card, Suit } from "./cards";
import type { PlayedCard } from "./trick";
import type { RoundPhase } from "./round";
import { TURN_DURATION_MS } from "./round";
import type { DealPlan, DealResult, GameConfig, GamePhase, GameState } from "./game";

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
  // Config de la partie (mode + pénalité de xisht) — affichée en en-tête
  // de la feuille de score.
  config: GameConfig;
  // La séquence complète des donnes : le client en dérive les bornes de
  // sets (sous-totaux de la feuille de score), quel que soit le mode.
  schedule: DealPlan[];
  currentDealIndex: number;
  totalDeals: number;
  setIndex: number; // set courant (0-3)
  cardsPerPlayer: number; // cartes de la donne courante
  dealerIndex: number;
  scores: number[]; // scores cumulés (publics)

  // ── Niveau manche (tout public sauf les mains) ──
  roundPhase: RoundPhase; // "choosing-trump" | "bidding" | "playing" | "finished"
  trumpSuit: Suit | null;
  trumpCard: Card | null; // la carte d'atout est RÉVÉLÉE à tous (null sur les manches à 9 cartes)
  bids: (number | null)[]; // enchères de tous (publiques)
  tricksWon: number[]; // plis gagnés de tous (publics)
  // À qui d'enchérir / de jouer / de choisir l'atout. En phase
  // "choosing-trump", c'est le SIÈGE DU DÉCIDEUR : information publique
  // et légitime (tout le monde sait qui doit choisir, pas CE QU'IL voit).
  currentPlayer: number;
  trickLeader: number;
  currentTrick: PlayedCard[]; // cartes déjà posées sur la table (publiques)

  // Dernier pli COMPLET (4 cartes) et son gagnant : le serveur vide
  // currentTrick juste après l'avoir diffusé, donc c'est ICI que le
  // client retrouve le pli qui vient de se terminer pour l'afficher
  // brièvement avant le suivant.
  lastTrick: PlayedCard[];
  lastTrickWinner: number | null;

  // ── Timer de tour (autoritatif serveur) ──
  // Le client calcule l'affichage (barre de progression) à partir de
  // CES DEUX valeurs : `Date.now() - turnStartedAt` écoulé sur
  // `turnDurationMs`. Robuste au lag (pas de "secondes restantes"
  // envoyées en boucle). Si le délai expire côté serveur, le joueur
  // dont c'est le tour joue automatiquement (cf. shared/bot.ts).
  turnStartedAt: number; // Date.now() au début du tour courant
  turnDurationMs: number; // toujours TURN_DURATION_MS (15000)

  // ── Cartes ──
  hand: Card[]; // MA main, en clair
  handCounts: number[]; // nombre de cartes par joueur (les autres = compte SEUL)

  // Manches à 9 cartes, phase "choosing-trump" UNIQUEMENT : les 3
  // premières cartes du décideur (round.currentPlayer), visibles PAR LUI
  // SEUL — anti-triche : null pour tous les autres joueurs, et null pour
  // le décideur lui-même hors de cette phase. `pendingDeck` (le reste du
  // paquet) n'apparaît JAMAIS dans une PlayerView, quel que soit `you`.
  trumpChoiceHand: Card[] | null;

  // ── Historique ──
  // Une entrée par donne TERMINÉE (bids/tricksWon/score brut, plus
  // doubled/erased pour la prime de set). Tout public — sert à
  // afficher la matrice complète manche par manche.
  // NB nommage : ce champ correspond à `GameState.dealHistory`
  // (game.ts) — même type DealResult, juste un nom différent côté vue
  // (déjà consommé par le client, cf. ScoreModal.tsx : ne pas renommer).
  roundHistory: DealResult[];

  // ── Niveaux des joueurs (V5) ──
  // Niveau cosmétique de chaque siège (index = siège 0-3).
  // null = invité ou bot (rien affiché côté client pour ce siège).
  // Calculé depuis xp au moment du join (une seule requête BDD, pas par manche).
  playerLevels: (number | null)[];
};

// ─── La projection (fonction pure) ──────────────────────────────
// Produit la vue qu'un joueur donné a le DROIT de voir. Ne mute pas le
// GameState (on retourne des copies des tableaux). Le type PlayerView
// n'a structurellement aucun champ pour les mains adverses : une fuite
// est donc impossible par construction — et le test le prouve aussi à
// l'exécution.
export function buildPlayerView(
  state: GameState,
  playerIndex: number,
  turnStartedAt: number = Date.now(),
  playerLevels: (number | null)[] = []
): PlayerView {
  const round = state.round;
  const deal = state.schedule[state.currentDealIndex];

  return {
    you: playerIndex,

    gamePhase: state.phase,
    config: { ...state.config },
    schedule: state.schedule.map((d) => ({ ...d })),
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
    lastTrick: round.lastTrick.map((p) => ({ ...p })),
    lastTrickWinner: round.lastTrickWinner,

    turnStartedAt,
    turnDurationMs: TURN_DURATION_MS,

    // Sa main en clair…
    hand: [...round.hands[playerIndex]],
    // …mais pour TOUS, seulement le compte (le contenu adverse ne sort pas).
    handCounts: round.hands.map((h) => h.length),

    // Choix de l'atout (manches à 9) : SEUL le décideur (you === currentPlayer
    // en phase "choosing-trump") reçoit ses 3 cartes ; tous les autres → null.
    trumpChoiceHand:
      round.phase === "choosing-trump" && playerIndex === round.currentPlayer
        ? [...round.hands[playerIndex]]
        : null,

    roundHistory: state.dealHistory.map((d) => ({
      ...d,
      bids: [...d.bids],
      tricksWon: [...d.tricksWon],
      scores: [...d.scores],
    })),

    playerLevels: Array.from({ length: state.playerCount }, (_, i) => playerLevels[i] ?? null),
  };
}
