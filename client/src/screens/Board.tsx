import { useEffect, useRef, useState } from "react";
import { useGame } from "../GameContext";
import { PlayingCard } from "../components/PlayingCard";
import { JokerModal } from "../components/JokerModal";
import { PlayerSeat, type SeatPos } from "../components/PlayerSeat";
import { allowedBids } from "@shared/bidding";
import { isLegalPlay } from "@shared/round";
import type { Card, Suit } from "@shared/cards";
import type { JokerAnnounce, PlayedCard } from "@shared/trick";
import type { PlayerView } from "@shared/views";
import type { RoundPhase } from "@shared/round";
import type { GamePhase } from "@shared/game";
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

// ─── Centre de la table : atout (enchères) ou pli en cours (jeu) ───
function Center({ view }: { view: PlayerView }) {
  const trump = view.trumpCard;

  if (view.roundPhase === "bidding") {
    return (
      <div className="jk-center jk-center--bidding">
        <div className="jk-eyebrow">Atout</div>
        {trump ? (
          <PlayingCard card={trump} size="lg" />
        ) : (
          <div className="jk-card jk-card--lg jk-card--back" aria-hidden="true">
            <span className="jk-card__back">
              <span className="jk-card__back-emblem">✦</span>
            </span>
          </div>
        )}
        <div className="jk-trump-label">{trumpLabel(view.trumpSuit)}</div>
        <p className="jk-center__hint">Phase d'enchères</p>
      </div>
    );
  }

  return (
    <div className="jk-center jk-center--playing">
      <div className="jk-trick">
        {view.currentTrick.map((p) => (
          <div
            key={p.playerIndex}
            className={`jk-trick__slot jk-trick__slot--${relPos(p.playerIndex, view.you)}`}
          >
            <PlayedCardView played={p} />
          </div>
        ))}
      </div>
      <div className="jk-trump-mini">
        <span className="jk-eyebrow">Atout</span>
        {trump && <PlayingCard card={trump} size="sm" />}
        <span className="jk-trump-mini__suit">{trumpLabel(view.trumpSuit)}</span>
      </div>
    </div>
  );
}

// ─── Barre d'enchères (uniquement quand c'est mon tour) ────────────
function BidBar({
  view,
  onBid,
}: {
  view: PlayerView;
  onBid: (bid: number) => void;
}) {
  // Enchères déjà annoncées avant moi (l'ordre garantit que ce sont
  // bien les « précédentes »). Le donneur (= moi si you === dealerIndex)
  // est le dernier à parler : allowedBids applique alors la contrainte.
  const previousBids = view.bids.filter((b): b is number => b !== null);
  const isLastBidder = view.you === view.dealerIndex;
  const options = allowedBids(view.cardsPerPlayer, previousBids, isLastBidder);

  return (
    <div className="jk-bidbar">
      <span className="jk-bidbar__label">Votre enchère</span>
      <div className="jk-bidbar__btns">
        {options.map((n) => (
          <button
            type="button"
            key={n}
            className="jk-btn jk-bidbar__btn"
            onClick={() => onBid(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {isLastBidder && (
        <span className="jk-bidbar__hook">
          Donneur : le total des mises ne peut pas faire {view.cardsPerPlayer}.
        </span>
      )}
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

  return (
    <div className="jk-hand">
      {view.hand.map((card, i) => {
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
              onClick={legal ? () => onPlay(card) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Bannière éphémère « X remporte le pli » ──────────────────────
function WinnerBanner({ pseudo }: { pseudo: string }) {
  return <div className="jk-winnerbanner jk-fade-up">🏆 {pseudo} remporte le pli</div>;
}

// ─── Récap de manche (reconstruit via le delta de scores cumulés) ──
type RecapState = {
  endedDealIndex: number;
  deltas: number[];
  totals: number[];
};

function RoundRecap({
  recap,
  pseudoOf,
  onClose,
}: {
  recap: RecapState;
  pseudoOf: (seat: number) => string;
  onClose: () => void;
}) {
  return (
    <div className="jk-recap" role="dialog" aria-modal="true">
      <div className="jk-panel jk-recap__panel jk-fade-up">
        <div className="jk-eyebrow">Donne {recap.endedDealIndex + 1} terminée</div>
        <h2 className="jk-recap__title">Manche comptabilisée</h2>
        <ul className="jk-recap__list">
          {recap.deltas.map((d, seat) => (
            <li key={seat} className="jk-recap__row">
              <span className="jk-recap__name">{pseudoOf(seat)}</span>
              <span className={`jk-recap__delta ${d > 0 ? "is-pos" : ""}`}>
                +{d}
              </span>
              <span className="jk-recap__total">{recap.totals[seat]} pts</span>
            </li>
          ))}
        </ul>
        <button type="button" className="jk-btn jk-btn--primary jk-btn--block" onClick={onClose}>
          Continuer
        </button>
      </div>
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

// Cliché d'une vue (pour détecter les transitions d'une vue à l'autre).
type Snap = {
  dealIndex: number;
  roundPhase: RoundPhase;
  gamePhase: GamePhase;
  tricksWon: number[];
  scores: number[];
};

// ════════════════════════════════════════════════════════════════
//  Le plateau de jeu
// ════════════════════════════════════════════════════════════════
export function Board() {
  const { view, lobby, error, clearError, placeBid, playCard, leave } = useGame();

  const [pendingJoker, setPendingJoker] = useState<Card | null>(null);
  const [recap, setRecap] = useState<RecapState | null>(null);
  const [winner, setWinner] = useState<number | null>(null);

  const prevRef = useRef<Snap | null>(null);
  const winnerTimer = useRef<number | undefined>(undefined);
  const recapTimer = useRef<number | undefined>(undefined);

  // Détection des transitions entre deux vues reçues du serveur :
  //   • nouvelle donne   → récap de la manche précédente (delta de scores) ;
  //   • pli remporté      → bannière du gagnant (delta de tricksWon).
  // (Le serveur vide le pli et enchaîne la manche AVANT de diffuser, donc
  //  on reconstruit ces deux événements côté client — voir le récap.)
  useEffect(() => {
    if (!view) return;
    const prev = prevRef.current;
    const snap: Snap = {
      dealIndex: view.currentDealIndex,
      roundPhase: view.roundPhase,
      gamePhase: view.gamePhase,
      tricksWon: [...view.tricksWon],
      scores: [...view.scores],
    };
    prevRef.current = snap;
    if (!prev) return;

    // Nouvelle manche : on affiche le récap de celle qui vient de finir.
    if (view.currentDealIndex > prev.dealIndex) {
      const deltas = view.scores.map((s, i) => s - prev.scores[i]);
      setRecap({ endedDealIndex: prev.dealIndex, deltas, totals: [...view.scores] });
      setWinner(null);
      window.clearTimeout(recapTimer.current);
      recapTimer.current = window.setTimeout(() => setRecap(null), 6500);
      return;
    }

    // Même manche, un pli vient d'être remporté (le total des plis monte).
    if (
      view.currentDealIndex === prev.dealIndex &&
      view.roundPhase === "playing" &&
      prev.roundPhase === "playing"
    ) {
      const before = prev.tricksWon.reduce((a, b) => a + b, 0);
      const after = view.tricksWon.reduce((a, b) => a + b, 0);
      if (after > before) {
        const w = view.tricksWon.findIndex((t, i) => t > prev.tricksWon[i]);
        if (w >= 0) {
          setWinner(w);
          window.clearTimeout(winnerTimer.current);
          winnerTimer.current = window.setTimeout(() => setWinner(null), 1800);
        }
      }
    }
  }, [view]);

  // Nettoyage des minuteries à la sortie du plateau.
  useEffect(
    () => () => {
      window.clearTimeout(winnerTimer.current);
      window.clearTimeout(recapTimer.current);
    },
    []
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
    score: view.scores[seat],
    bid: view.bids[seat],
    tricksWon: view.tricksWon[seat],
    handCount: view.handCounts[seat],
    roundPhase: view.roundPhase,
    isTurn: view.currentPlayer === seat,
    isDealer: view.dealerIndex === seat,
    isMe: seat === me,
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

      <div className="jk-table__felt">
        {opponents.map((seat) => (
          <div key={seat} className={`jk-pos--${relPos(seat, me)}`}>
            <PlayerSeat {...seatProps(seat)} />
          </div>
        ))}

        <div className="jk-pos--center">
          <Center view={view} />
          {winner !== null && <WinnerBanner pseudo={pseudoOf(winner)} />}
        </div>

        <div className="jk-pos--hand">
          <div className="jk-myzone">
            <PlayerSeat {...seatProps(me)} />
            <div className="jk-myzone__action">
              {view.roundPhase === "bidding" ? (
                isMyTurn ? (
                  <BidBar view={view} onBid={placeBid} />
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

          <Hand
            view={view}
            isMyTurn={isMyTurn}
            onPlay={onPlay}
            pendingKey={pendingJoker ? cardKey(pendingJoker) : null}
          />
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

      {recap && (
        <RoundRecap recap={recap} pseudoOf={pseudoOf} onClose={() => setRecap(null)} />
      )}
    </div>
  );
}
