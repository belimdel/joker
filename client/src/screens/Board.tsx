import { useEffect, useRef, useState } from "react";
import { useGame } from "../GameContext";
import { PlayingCard } from "../components/PlayingCard";
import { JokerModal } from "../components/JokerModal";
import { PlayerSeat, type SeatPos } from "../components/PlayerSeat";
import { TurnTimer } from "../components/TurnTimer";
import { BidStatus } from "../components/BidStatus";
import { TrumpOverlay } from "../components/TrumpOverlay";
import { BidOverlay } from "../components/BidOverlay";
import { TrumpChoiceOverlay } from "../components/TrumpChoiceOverlay";
import { ScoreModal } from "../components/ScoreModal";
import { isLegalPlay } from "@shared/round";
import { rankStrength, type Card, type Suit } from "@shared/cards";
import type { JokerAnnounce, PlayedCard } from "@shared/trick";
import type { PlayerView } from "@shared/views";
import type { GameErrorPayload } from "@shared/events";
import "./board.css";

// ─── Helpers d'affichage (présentation pure, zéro logique de jeu) ──

const SUIT_META: Record<Suit, { glyph: string; name: string; red: boolean }> = {
  spades: { glyph: "♠", name: "Piques", red: false },
  hearts: { glyph: "♥", name: "Cœurs", red: true },
  diamonds: { glyph: "♦", name: "Carreaux", red: true },
  clubs: { glyph: "♣", name: "Trèfles", red: false },
};

// Position d'un siège RELATIVE au joueur local : en face = +2, gauche
// = +1, droite = +3 (cf. spécification du plateau).
function relPos(seat: number, me: number): SeatPos {
  const d = (seat - me + 4) % 4;
  return d === 0 ? "self" : d === 1 ? "left" : d === 2 ? "top" : "right";
}

// Clé stable d'une carte (les cartes d'une main sont toutes distinctes).
function cardKey(card: Card): string {
  return card.type === "joker" ? card.id : `${card.suit}-${card.rank}`;
}

// ─── Tri d'AFFICHAGE de la main (purement visuel) ──────────────────
// Enseignes groupées en alternance rouge/noir, valeurs croissantes
// dans chaque enseigne, Jokers à l'extrémité. Ne change ni l'ordre
// côté serveur ni la carte référencée par un clic : on trie une copie
// et chaque carte garde sa propre identité (closure sur `card`).
const HAND_SUIT_ORDER: Suit[] = ["hearts", "spades", "diamonds", "clubs"];

function compareCardsForDisplay(a: Card, b: Card): number {
  if (a.type === "joker" || b.type === "joker") {
    if (a.type === "joker" && b.type === "joker") return a.id.localeCompare(b.id);
    return a.type === "joker" ? 1 : -1;
  }
  const suitDiff = HAND_SUIT_ORDER.indexOf(a.suit) - HAND_SUIT_ORDER.indexOf(b.suit);
  if (suitDiff !== 0) return suitDiff;
  return rankStrength(a.rank) - rankStrength(b.rank);
}

function trumpLabel(trumpSuit: Suit | null): string {
  if (trumpSuit === null) return "Sans atout";
  const m = SUIT_META[trumpSuit];
  return `${m.glyph} ${m.name}`;
}

// ─── Une carte posée sur la table (avec badge si c'est un Joker) ───
function PlayedCardView({ played }: { played: PlayedCard }) {
  const { card, announce, declaredSuit } = played;
  return (
    <div className="jk-played">
      <PlayingCard card={card} size="md" />
      {card.type === "joker" && (
        <span className="jk-played__joker">
          <span>{announce === "high" ? "↑ haut" : "↓ bas"}</span>
          {declaredSuit && (
            <span className={SUIT_META[declaredSuit].red ? "is-red" : ""}>
              {SUIT_META[declaredSuit].glyph}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// ─── Centre de la table : pli en cours, ou dernier pli complet ────
// Le serveur vide currentTrick juste après l'avoir diffusé : c'est
// lastTrick (cf. PlayerView) qui porte le pli qui vient de se terminer.
// Tant que `showLastTrick` est actif (cf. effet dans Board) et que la
// table est vide, on affiche ce dernier pli avec son gagnant surligné.
function Center({
  view,
  showLastTrick,
  slideDir,
}: {
  view: PlayerView;
  showLastTrick: boolean;
  slideDir: SeatPos | null;
}) {
  const tableEmpty = view.currentTrick.length === 0;

  if (view.roundPhase === "bidding" && !(showLastTrick && tableEmpty)) {
    return (
      <div className="jk-center jk-center--bidding">
        <p className="jk-center__hint">Phase d'enchères</p>
      </div>
    );
  }

  const showingLastTrick = tableEmpty && showLastTrick;
  const displayTrick = showingLastTrick ? view.lastTrick : view.currentTrick;
  const winnerSeat = showingLastTrick ? view.lastTrickWinner : null;
  // Glissement vers le siège gagnant : purement visuel, ne s'active que
  // pendant la fenêtre d'affichage du pli déjà résolu (cf. effet dans Board).
  const sliding = showingLastTrick && slideDir !== null;

  return (
    <div className="jk-center jk-center--playing">
      <div className="jk-trick">
        {displayTrick.map((p) => (
          <div
            key={p.playerIndex}
            className={[
              "jk-trick__slot",
              `jk-trick__slot--${relPos(p.playerIndex, view.you)}`,
              p.playerIndex === winnerSeat && "is-winner",
              sliding && `is-sliding--${slideDir}`,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <PlayedCardView played={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ma main ──────────────────────────────────────────────────────
function Hand({
  view,
  isMyTurn,
  onPlay,
  pendingKey,
}: {
  view: PlayerView;
  isMyTurn: boolean;
  onPlay: (card: Card) => void;
  pendingKey: string | null;
}) {
  const interactive = view.roundPhase === "playing";

  // Tri d'affichage uniquement : la légalité se vérifie toujours sur
  // view.hand (ordre brut, sans incidence sur isLegalPlay), et chaque
  // carte triée garde sa propre référence pour le clic — aucun risque
  // de mapping puisqu'on ne passe jamais par un index.
  const sortedHand = [...view.hand].sort(compareCardsForDisplay);

  return (
    <div className="jk-hand">
      {sortedHand.map((card, i) => {
        // Confort UX : on grise les cartes injouables (le serveur revalide).
        const legal =
          interactive &&
          isMyTurn &&
          isLegalPlay(view.hand, card, view.currentTrick, view.trumpSuit);
        const key = cardKey(card);

        return (
          <div key={key} className="jk-hand__slot">
            <PlayingCard
              card={card}
              size="md"
              dealIndex={i}
              disabled={interactive && !legal}
              selected={key === pendingKey}
              // Stable pendant toute la phase "playing" (ne dépend pas
              // de `legal`, qui varie pli après pli) : évite que le
              // tag bouton/div change et ne remonte la carte à chaque
              // coup joué. Le clic réel reste gardé par `legal`.
              onClick={
                interactive
                  ? () => {
                      if (legal) onPlay(card);
                    }
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Écran de fin de partie ───────────────────────────────────────
function GameOver({
  view,
  pseudoOf,
  onReplay,
}: {
  view: PlayerView;
  pseudoOf: (seat: number) => string;
  onReplay: () => void;
}) {
  const ranking = view.scores
    .map((score, seat) => ({ seat, score }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="jk-gameover">
      <div className="jk-eyebrow">Partie terminée</div>
      <h1 className="jk-brand" style={{ fontSize: "2rem" }}>
        Classement final
      </h1>
      <ol className="jk-gameover__list">
        {ranking.map((r, idx) => (
          <li
            key={r.seat}
            className={`jk-gameover__row ${r.seat === view.you ? "is-me" : ""}`}
          >
            <span className="jk-gameover__rank">{idx === 0 ? "♛" : idx + 1}</span>
            <span className="jk-gameover__name">
              {pseudoOf(r.seat)}
              {r.seat === view.you ? " (vous)" : ""}
            </span>
            <span className="jk-gameover__score">{r.score} pts</span>
          </li>
        ))}
      </ol>
      <button type="button" className="jk-btn jk-btn--primary" onClick={onReplay}>
        Rejouer
      </button>
    </div>
  );
}

// ─── Toast d'erreur (coup refusé, etc.) ───────────────────────────
function ErrorToast({
  error,
  onClose,
}: {
  error: GameErrorPayload | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(t);
  }, [error, onClose]);

  if (!error) return null;
  return (
    <div className="jk-toast" role="alert">
      <span>⚠️ {error.message}</span>
      <button type="button" className="jk-toast__close" onClick={onClose} aria-label="Fermer">
        ✕
      </button>
    </div>
  );
}

// Signature stable d'un pli (pour détecter qu'un NOUVEAU pli complet
// vient d'arriver, et pas seulement que la table est vide).
function trickSignature(trick: PlayedCard[]): string {
  return trick.map((p) => `${p.playerIndex}:${cardKey(p.card)}`).join("|");
}

// Séquençage de l'affichage du pli gagné, trois étapes bien séparées :
// 1) pause figée (on voit les 4 cartes + le halo du gagnant) ;
// 2) glissement des cartes vers le siège gagnant (cf. board.css) ;
// 3) le pli disparaît, libérant l'écran pour l'étape suivante (enchères…).
// TRICK_SLIDE_MS doit rester égal à la durée de transition CSS sur
// `.jk-trick__slot` pour que la disparition coïncide avec la fin du geste.
const TRICK_PAUSE_MS = 1000;
const TRICK_SLIDE_MS = 300;
const TRICK_DISPLAY_MS = TRICK_PAUSE_MS + TRICK_SLIDE_MS;

// ════════════════════════════════════════════════════════════════
//  Le plateau de jeu
// ════════════════════════════════════════════════════════════════
export function Board() {
  const { view, lobby, error, clearError, placeBid, playCard, leave } = useGame();

  const [pendingJoker, setPendingJoker] = useState<Card | null>(null);
  const [showScores, setShowScores] = useState(false);
  const [showLastTrick, setShowLastTrick] = useState(false);
  // Direction (relative à l'écran) vers laquelle les 4 cartes du pli
  // glissent juste avant de disparaître : siège gagnant vu depuis `me`.
  const [slideDir, setSlideDir] = useState<SeatPos | null>(null);

  const lastSigRef = useRef<string>("");
  const lastTrickTimer = useRef<number | undefined>(undefined);
  const slideTimer = useRef<number | undefined>(undefined);

  // Affiche brièvement le DERNIER pli complet (view.lastTrick) quand la
  // table vient de se vider et qu'un nouveau pli (signature différente)
  // est arrivé — couvre aussi bien la fin d'un pli en cours de manche
  // que le dernier pli de la donne précédente, conservé par le serveur
  // jusqu'à la première vue de la nouvelle donne (cf. Tâche A).
  useEffect(() => {
    if (!view) return;
    const sig = trickSignature(view.lastTrick);

    if (view.currentTrick.length > 0) {
      setShowLastTrick(false);
      setSlideDir(null);
      window.clearTimeout(lastTrickTimer.current);
      window.clearTimeout(slideTimer.current);
      return;
    }

    if (sig && sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      setShowLastTrick(true);
      window.clearTimeout(lastTrickTimer.current);
      lastTrickTimer.current = window.setTimeout(() => setShowLastTrick(false), TRICK_DISPLAY_MS);

      // Glissement visuel des 4 cartes vers le siège gagnant, déclenché
      // après la pause figée (TRICK_PAUSE_MS) : pause → glissement →
      // disparition (à TRICK_DISPLAY_MS, juste après la fin du geste),
      // ce qui laisse la place aux enchères seulement une fois le
      // glissement terminé. Le siège est capturé ici pour ce pli précis,
      // indépendamment de l'atout ou d'une vue ultérieure.
      const winner = view.lastTrickWinner;
      setSlideDir(null);
      window.clearTimeout(slideTimer.current);
      if (winner !== null) {
        const dir = relPos(winner, view.you);
        slideTimer.current = window.setTimeout(() => setSlideDir(dir), TRICK_PAUSE_MS);
      }
    }
  }, [view]);

  // Nettoyage des minuteries à la sortie du plateau.
  useEffect(
    () => () => {
      window.clearTimeout(lastTrickTimer.current);
      window.clearTimeout(slideTimer.current);
    },
    [],
  );

  if (!view) return null;

  const me = view.you;
  const pseudoOf = (seat: number): string =>
    lobby?.players.find((p) => p.seat === seat)?.pseudo ?? `Joueur ${seat + 1}`;
  const isMyTurn = view.currentPlayer === me;

  // Fin de partie : classement final (la dernière vue a gamePhase "finished").
  if (view.gamePhase === "finished") {
    return <GameOver view={view} pseudoOf={pseudoOf} onReplay={leave} />;
  }

  // Clic sur une carte de ma main : un Joker ouvre la modale, sinon on joue.
  const onPlay = (card: Card) => {
    if (card.type === "joker") {
      setPendingJoker(card);
    } else {
      playCard(card);
    }
  };

  const confirmJoker = (announce: JokerAnnounce, declaredSuit: Suit | null) => {
    if (!pendingJoker) return;
    playCard(pendingJoker, announce, declaredSuit);
    setPendingJoker(null);
  };

  const seatProps = (seat: number) => ({
    pos: relPos(seat, me),
    pseudo: pseudoOf(seat),
    bid: view.bids[seat],
    tricksWon: view.tricksWon[seat],
    roundPhase: view.roundPhase,
    isTurn: view.currentPlayer === seat,
    isDealer: view.dealerIndex === seat,
    isMe: seat === me,
    turnStartedAt: view.turnStartedAt,
    turnDurationMs: view.turnDurationMs,
  });

  const opponents = [0, 1, 2, 3].filter((s) => s !== me);

  return (
    <div className="jk-table">
      <header className="jk-table__header">
        <button type="button" className="jk-btn jk-btn--ghost jk-table__leave" onClick={leave}>
          Quitter
        </button>
        <div className="jk-table__deal">
          <span className="jk-eyebrow">
            Donne {view.currentDealIndex + 1}/{view.totalDeals} · Set {view.setIndex + 1}
          </span>
          <span className="jk-table__cards">
            {view.cardsPerPlayer} carte{view.cardsPerPlayer > 1 ? "s" : ""} ·{" "}
            {trumpLabel(view.trumpSuit)}
          </span>
        </div>
      </header>

      <ErrorToast error={error} onClose={clearError} />

      <TrumpOverlay
        trumpCard={view.trumpCard}
        trumpSuit={view.trumpSuit}
        roundPhase={view.roundPhase}
      />

      <button
        type="button"
        className="jk-btn jk-scorebtn"
        onClick={() => setShowScores(true)}
        aria-label="Voir les scores"
        title="Scores"
      >
        🏆
      </button>

      <div className="jk-table__felt">
        {opponents.map((seat) => (
          <div key={seat} className={`jk-pos--${relPos(seat, me)}`}>
            <PlayerSeat {...seatProps(seat)} />
          </div>
        ))}

        <div className="jk-pos--center">
          <Center view={view} showLastTrick={showLastTrick} slideDir={slideDir} />
        </div>

        <div className="jk-pos--hand">
          <div className="jk-myzone">
            <BidStatus bid={view.bids[me]} tricksWon={view.tricksWon[me]} />
            <div className="jk-myzone__action">
              {view.roundPhase === "choosing-trump" ? (
                isMyTurn ? (
                  <span className="jk-turnnote is-active">À vous de choisir l'atout</span>
                ) : (
                  <span className="jk-turnnote">
                    {pseudoOf(view.currentPlayer)} choisit l'atout…
                  </span>
                )
              ) : view.roundPhase === "bidding" ? (
                isMyTurn ? (
                  <span className="jk-turnnote is-active">À vous d'enchérir</span>
                ) : (
                  <span className="jk-turnnote">
                    En attente de l'enchère de {pseudoOf(view.currentPlayer)}…
                  </span>
                )
              ) : isMyTurn ? (
                <span className="jk-turnnote is-active">À vous de jouer</span>
              ) : (
                <span className="jk-turnnote">Au tour de {pseudoOf(view.currentPlayer)}…</span>
              )}
            </div>
          </div>

          {isMyTurn && view.roundPhase !== "finished" && (
            <TurnTimer
              key={view.turnStartedAt}
              turnStartedAt={view.turnStartedAt}
              turnDurationMs={view.turnDurationMs}
            />
          )}

          {/* Masquée pendant choosing-trump pour le décideur : l'overlay
              montre déjà les 3 cartes, inutile de les doubler en bas. */}
          {view.trumpChoiceHand === null && (
            <Hand
              view={view}
              isMyTurn={isMyTurn}
              onPlay={onPlay}
              pendingKey={pendingJoker ? cardKey(pendingJoker) : null}
            />
          )}
        </div>
      </div>

      {pendingJoker && (
        <JokerModal
          card={pendingJoker}
          mustDeclareSuit={view.currentTrick.length === 0}
          onConfirm={confirmJoker}
          onCancel={() => setPendingJoker(null)}
        />
      )}

      {view.roundPhase === "bidding" && isMyTurn && (
        <BidOverlay view={view} onBid={placeBid} />
      )}

      {view.roundPhase === "choosing-trump" && view.trumpChoiceHand && (
        <TrumpChoiceOverlay hand={view.trumpChoiceHand} />
      )}

      {showScores && (
        <ScoreModal view={view} pseudoOf={pseudoOf} onClose={() => setShowScores(false)} />
      )}
    </div>
  );
}
