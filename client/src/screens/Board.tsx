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
import { ScoreModal, ScoreTable, ScoreModeLabel } from "../components/ScoreModal";
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

// ─── Pli terminé : snapshot local, indépendant des vues suivantes ──
// Le serveur vide currentTrick juste après l'avoir diffusé : c'est
// lastTrick (cf. PlayerView) qui porte le pli qui vient de se terminer.
// On le fige dans ce snapshot au moment de sa détection, si bien que
// l'animation (pause → glissement vers le gagnant → disparition) se
// déroule TOUJOURS en entier, même si d'autres vues arrivent entre-temps
// (prochain joueur rapide, autoplay…). C'était la cause des ratés :
// l'ancien code annulait l'affichage dès que currentTrick se remplissait.
type FinishedTrick = {
  sig: string;
  trick: PlayedCard[];
  winnerSeat: number | null;
  winnerDir: SeatPos | null;
};

// ─── Centre de la table : pli en cours + éventuel pli qui se termine ─
// Les deux couches coexistent : le pli terminé glisse vers le gagnant
// pendant que les cartes du pli suivant peuvent déjà se poser dessous.
// La couche du pli terminé est re-montée à neuf pour chaque pli (clé =
// signature) : aucune transition résiduelle d'un pli précédent ne peut
// contaminer le suivant, et l'animation CSS repart de zéro à coup sûr.
function Center({ view, finished }: { view: PlayerView; finished: FinishedTrick | null }) {
  if (view.roundPhase === "bidding" && !finished) {
    return (
      <div className="jk-center jk-center--bidding">
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
        {finished && (
          <div key={finished.sig} className="jk-trick__overlay">
            {finished.trick.map((p) => (
              <div
                key={p.playerIndex}
                className={[
                  "jk-trick__slot",
                  `jk-trick__slot--${relPos(p.playerIndex, view.you)}`,
                  p.playerIndex === finished.winnerSeat && "is-winner",
                  finished.winnerDir && `is-collect--${finished.winnerDir}`,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <PlayedCardView played={p} />
              </div>
            ))}
          </div>
        )}
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
// On garde la feuille de score COMPLÈTE affichée (comme pendant la
// partie) : les positions finales apparaissent sous chaque colonne
// (ScoreTable), et le bandeau du haut porte le mode + le bouton Rejouer.
function GameOver({
  view,
  pseudoOf,
  onReplay,
  onShowScores,
}: {
  view: PlayerView;
  pseudoOf: (seat: number) => string;
  onReplay: () => void;
  onShowScores: () => void;
}) {
  return (
    <div className="jk-scoretable">
      <header className="jk-scoretable__header">
        <ScoreModeLabel view={view} />
        <div className="jk-scoretable__headactions">
          <button
            type="button"
            className="jk-btn jk-scorebtn"
            onClick={onShowScores}
            aria-label="Voir les scores"
            title="Scores"
          >
            ☰
          </button>
          <button type="button" className="jk-btn jk-btn--primary jk-btn--sm" onClick={onReplay}>
            Rejouer
          </button>
        </div>
      </header>
      <div className="jk-scoretable__finalnote">Partie terminée — classement final</div>
      <ScoreTable view={view} pseudoOf={pseudoOf} />
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
// 2) glissement des cartes vers le siège gagnant ;
// 3) le pli disparaît, libérant l'écran pour l'étape suivante (enchères…).
// Les étapes 1 et 2 sont entièrement pilotées par le CSS (animation
// `jk-collect-*` avec animation-delay, cf. board.css) : aucun timer JS
// ne peut manquer le déclenchement du glissement. Le seul timer restant
// démonte le snapshot APRÈS la fin du geste ; comme l'animation garde
// son état final (fill-mode: both → opacity 0), un retard de timer est
// invisible. PAUSE et SLIDE doivent rester alignés sur board.css.
const TRICK_PAUSE_MS = 1000;
const TRICK_SLIDE_MS = 300;
const TRICK_UNMOUNT_MS = TRICK_PAUSE_MS + TRICK_SLIDE_MS + 150;

// ════════════════════════════════════════════════════════════════
//  Le plateau de jeu
// ════════════════════════════════════════════════════════════════
export function Board() {
  const { view, lobby, error, clearError, placeBid, playCard, leaveGame } = useGame();

  // Quitter une partie EN COURS : on confirme (les tours seront joués
  // automatiquement en attendant le retour). Sur l'écran de fin, pas de
  // confirmation (rien à jouer) — cf. onReplay.
  const confirmLeave = () => {
    if (
      view &&
      view.gamePhase !== "finished" &&
      !window.confirm(
        "Quitter la partie ? Vos tours seront joués automatiquement jusqu'à votre retour.",
      )
    ) {
      return;
    }
    leaveGame();
  };

  const [pendingJoker, setPendingJoker] = useState<Card | null>(null);
  const [showScores, setShowScores] = useState(false);
  // Snapshot du pli qui vient de se terminer : figé à la détection, il
  // porte l'animation complète sans dépendre des vues suivantes.
  const [finished, setFinished] = useState<FinishedTrick | null>(null);

  // null = aucune vue encore reçue (montage/reconnexion) : on mémorise
  // alors la signature courante SANS animer, pour ne pas rejouer un pli
  // déjà résolu avant notre arrivée.
  const lastSigRef = useRef<string | null>(null);
  const finishedTimer = useRef<number | undefined>(undefined);

  // Détecte qu'un NOUVEAU pli complet vient d'arriver (signature de
  // view.lastTrick différente) et fige son snapshot. On ne l'annule
  // JAMAIS sur les vues suivantes : le démontage n'a qu'une seule
  // horloge, le timer posé ici, calé après la fin de l'animation CSS.
  useEffect(() => {
    if (!view) return;
    const sig = trickSignature(view.lastTrick);

    if (lastSigRef.current === null) {
      lastSigRef.current = sig;
      return;
    }
    if (!sig || sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    const winner = view.lastTrickWinner;
    setFinished({
      sig,
      trick: view.lastTrick,
      winnerSeat: winner,
      winnerDir: winner === null ? null : relPos(winner, view.you),
    });
    window.clearTimeout(finishedTimer.current);
    finishedTimer.current = window.setTimeout(() => setFinished(null), TRICK_UNMOUNT_MS);
  }, [view]);

  // Nettoyage de la minuterie à la sortie du plateau.
  useEffect(() => () => window.clearTimeout(finishedTimer.current), []);

  if (!view) return null;

  const me = view.you;
  const pseudoOf = (seat: number): string =>
    lobby?.players.find((p) => p.seat === seat)?.pseudo ?? `Joueur ${seat + 1}`;
  const isMyTurn = view.currentPlayer === me;

  // Fin de partie : classement final (la dernière vue a gamePhase "finished").
  // On garde le bouton ☰ pour rouvrir le tableau de score plein écran.
  if (view.gamePhase === "finished") {
    return (
      <>
        <GameOver
          view={view}
          pseudoOf={pseudoOf}
          onReplay={leaveGame}
          onShowScores={() => setShowScores(true)}
        />
        {showScores && (
          <ScoreModal view={view} pseudoOf={pseudoOf} onClose={() => setShowScores(false)} />
        )}
      </>
    );
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
    level: view.playerLevels?.[seat] ?? null,
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
        <button type="button" className="jk-btn jk-btn--ghost jk-table__leave" onClick={confirmLeave}>
          🔒 Leave
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
        <button
          type="button"
          className="jk-btn jk-scorebtn"
          onClick={() => setShowScores(true)}
          aria-label="Voir les scores"
          title="Scores"
        >
          ☰
        </button>
      </header>

      <ErrorToast error={error} onClose={clearError} />

      <TrumpOverlay
        trumpCard={view.trumpCard}
        trumpSuit={view.trumpSuit}
        roundPhase={view.roundPhase}
      />

      <div className="jk-table__felt">
        {opponents.map((seat) => (
          <div key={seat} className={`jk-pos--${relPos(seat, me)}`}>
            <PlayerSeat {...seatProps(seat)} />
          </div>
        ))}

        <div className="jk-pos--center">
          <Center view={view} finished={finished} />
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
