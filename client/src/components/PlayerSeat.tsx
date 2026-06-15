import type { RoundPhase } from "@shared/round";
import { BidStatus } from "./BidStatus";
import { TurnTimer } from "./TurnTimer";

// Position d'un siège RELATIVE au joueur local (calculée par le plateau).
export type SeatPos = "self" | "left" | "top" | "right";

export type PlayerSeatProps = {
  pos: SeatPos;
  pseudo: string;
  bid: number | null; // enchère (null = pas encore annoncée)
  tricksWon: number; // plis remportés cette manche
  handCount: number; // nombre de cartes en main
  roundPhase: RoundPhase;
  isTurn: boolean; // c'est son tour (enchère ou jeu)
  isDealer: boolean;
  isMe: boolean;
  turnStartedAt: number; // timer autoritatif serveur (cf. TurnTimer)
  turnDurationMs: number;
};

// ─── Siège d'un joueur autour de la table ────────────────────────
// Purement présentationnel : affiche pseudo, l'enchère (phase
// d'enchères) ou le contrat « annoncé / pris » (phase de jeu), le nombre
// de cartes en main pour les adversaires, et met en évidence le tour
// courant + le donneur. Aucune logique de jeu ici.
export function PlayerSeat({
  pos,
  pseudo,
  bid,
  tricksWon,
  handCount,
  roundPhase,
  isTurn,
  isDealer,
  isMe,
  turnStartedAt,
  turnDurationMs,
}: PlayerSeatProps) {
  const initial = pseudo.trim().charAt(0).toUpperCase() || "?";
  // Le décompte n'a de sens que pendant l'enchère/le jeu (pas une fois
  // la manche "finished", où currentPlayer ne représente plus un tour).
  const showTimer = isTurn && roundPhase !== "finished";

  return (
    <div
      className={[
        "jk-pseat",
        `jk-pseat--${pos}`,
        isTurn && "is-turn",
        isMe && "is-me",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="jk-pseat__avatar">
        <span className="jk-pseat__initial">{initial}</span>
        {isDealer && (
          <span className="jk-pseat__dealer" title="Donneur">
            D
          </span>
        )}
      </div>

      <div className="jk-pseat__info">
        <span className="jk-pseat__name">
          {pseudo}
          {isMe ? " (vous)" : ""}
        </span>

        <div className="jk-pseat__meta">
          {roundPhase === "bidding" ? (
            <span className="jk-pseat__bid">
              {bid === null ? "réfléchit…" : `mise ${bid}`}
            </span>
          ) : (
            <BidStatus bid={bid} tricksWon={tricksWon} />
          )}

          {!isMe && (
            <span className="jk-pseat__count" title={`${handCount} cartes`}>
              <i className="jk-minicard" aria-hidden="true" />
              {handCount}
            </span>
          )}
        </div>

        {showTimer && (
          <TurnTimer key={turnStartedAt} turnStartedAt={turnStartedAt} turnDurationMs={turnDurationMs} />
        )}
      </div>
    </div>
  );
}
