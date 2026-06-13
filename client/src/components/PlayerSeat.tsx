import type { RoundPhase } from "@shared/round";

// Position d'un siège RELATIVE au joueur local (calculée par le plateau).
export type SeatPos = "self" | "left" | "top" | "right";

export type PlayerSeatProps = {
  pos: SeatPos;
  pseudo: string;
  score: number; // score cumulé (public)
  bid: number | null; // enchère (null = pas encore annoncée)
  tricksWon: number; // plis remportés cette manche
  handCount: number; // nombre de cartes en main
  roundPhase: RoundPhase;
  isTurn: boolean; // c'est son tour (enchère ou jeu)
  isDealer: boolean;
  isMe: boolean;
};

// ─── Siège d'un joueur autour de la table ────────────────────────
// Purement présentationnel : affiche pseudo, score, l'enchère (phase
// d'enchères) ou le contrat « plis / mise » (phase de jeu), le nombre
// de cartes en main pour les adversaires, et met en évidence le tour
// courant + le donneur. Aucune logique de jeu ici.
export function PlayerSeat({
  pos,
  pseudo,
  score,
  bid,
  tricksWon,
  handCount,
  roundPhase,
  isTurn,
  isDealer,
  isMe,
}: PlayerSeatProps) {
  const initial = pseudo.trim().charAt(0).toUpperCase() || "?";

  // En phase de jeu, on colore le contrat : atteint (=) ou dépassé (>).
  let contractClass = "";
  if (roundPhase !== "bidding" && bid !== null) {
    if (tricksWon === bid) contractClass = "is-met";
    else if (tricksWon > bid) contractClass = "is-over";
  }

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
        <span className="jk-pseat__score">{score} pts</span>

        <div className="jk-pseat__meta">
          {roundPhase === "bidding" ? (
            <span className="jk-pseat__bid">
              {bid === null ? "réfléchit…" : `mise ${bid}`}
            </span>
          ) : (
            <span className={`jk-pseat__contract ${contractClass}`}>
              {tricksWon}
              {bid !== null ? ` / ${bid}` : ""} plis
            </span>
          )}

          {!isMe && (
            <span className="jk-pseat__count" title={`${handCount} cartes`}>
              <i className="jk-minicard" aria-hidden="true" />
              {handCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
