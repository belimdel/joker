import "./BidStatus.css";

export type BidStatusProps = {
  bid: number | null; // enchère annoncée par le joueur (null = pas encore annoncée)
  tricksWon: number; // plis remportés par le joueur cette manche
};

// ─── Statut « annoncé / gagné » d'un siège ───────────────────────
// Affiche clairement l'enchère annoncée par le joueur face aux plis
// qu'il a effectivement remportés cette manche (ex. "2 / 1" = annoncé
// 2, gagné 1). Si l'enchère n'a pas encore été annoncée, affiche "—"
// au lieu de "null". Purement présentationnel, aucune logique de jeu.
export function BidStatus({ bid, tricksWon }: BidStatusProps) {
  const bidLabel = bid === null ? "—" : String(bid);

  // Une fois l'enchère connue, on colore selon l'écart au contrat.
  let stateClass = "";
  if (bid !== null) {
    if (tricksWon === bid) stateClass = "is-met";
    else if (tricksWon > bid) stateClass = "is-over";
  }

  return (
    <span
      className={["jk-bidstatus", stateClass].filter(Boolean).join(" ")}
      title={`Annoncé : ${bidLabel} · Plis remportés : ${tricksWon}`}
    >
      <span className="jk-bidstatus__item">
        <span className="jk-bidstatus__value">{bidLabel}</span>
        <span className="jk-bidstatus__label">annoncé</span>
      </span>
      <span className="jk-bidstatus__sep" aria-hidden="true">
        /
      </span>
      <span className="jk-bidstatus__item">
        <span className="jk-bidstatus__value">{tricksWon}</span>
        <span className="jk-bidstatus__label">pris</span>
      </span>
    </span>
  );
}
