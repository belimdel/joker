import { useEffect, useRef } from "react";
import type { PlayerView } from "@shared/views";
import "./ScoreModal.css";

export type ScoreModalProps = {
  view: PlayerView;
  pseudoOf: (seat: number) => string;
  onClose: () => void;
};

const SEATS = [0, 1, 2, 3];

// ─── Tableau de scores plein écran (ouvert via le bouton 🏆) ───────
// Une ligne par donne TERMINÉE (view.roundHistory : enchère/plis/score
// BRUT de chaque joueur, public, avant prime/effacement de fin de set),
// puis la donne EN COURS (live, tant que la partie n'est pas finie), et
// le cumul total (view.scores, qui lui inclut primes/effacements).
export function ScoreModal({ view, pseudoOf, onClose }: ScoreModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // On garde la dernière donne visible (la table peut devenir longue).
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [view.currentDealIndex, view.gamePhase]);

  return (
    <div className="jk-scoretable" role="dialog" aria-modal="true" aria-label="Scores">
      <header className="jk-scoretable__header">
        <span className="jk-eyebrow">
          Donne {view.currentDealIndex + 1}/{view.totalDeals} · Set {view.setIndex + 1}
        </span>
        <button type="button" className="jk-btn jk-btn--ghost" onClick={onClose}>
          Fermer
        </button>
      </header>

      <div className="jk-scoretable__scroll" ref={scrollRef}>
        <table className="jk-scoretable__table">
          <thead>
            <tr>
              <th className="jk-scoretable__rowlabel" scope="col" />
              {SEATS.map((seat) => (
                <th key={seat} scope="col" className={seat === view.you ? "is-me" : ""}>
                  {pseudoOf(seat)}
                  {seat === view.you ? " (vous)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.roundHistory.map((deal) => (
              <tr key={deal.dealIndex}>
                <th className="jk-scoretable__rowlabel" scope="row" />
                {SEATS.map((seat) => {
                  const bid = deal.bids[seat];
                  const won = deal.tricksWon[seat];
                  const score = deal.scores[seat];
                  const met = won === bid;
                  // Xisht : enchère non nulle totalement ratée (sanction -200).
                  const xisht = bid >= 1 && won === 0;
                  // ×2 / barré : indexés par siège (prime de set).
                  const showDouble = deal.doubled[seat];
                  const showErased = deal.erased[seat];
                  const cellClass = xisht ? "is-xisht" : met ? "is-ok" : "is-pending";
                  return (
                    <td key={seat} className={`jk-scoretable__cell ${cellClass}`}>
                      <span
                        className={`jk-scoretable__cellpoints${showErased ? " is-erased" : ""}`}
                      >
                        {score}
                        {showDouble && (
                          <span className="jk-scoretable__badge jk-scoretable__badge--double">
                            ×2
                          </span>
                        )}
                      </span>
                      <span className="jk-scoretable__cellratio">
                        {won}/{bid}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}

            {view.gamePhase !== "finished" && (
              <tr>
                <th className="jk-scoretable__rowlabel" scope="row">
                  En cours
                </th>
                {SEATS.map((seat) => {
                  const bid = view.bids[seat];
                  const won = view.tricksWon[seat];
                  const met = bid !== null && won === bid;
                  return (
                    <td
                      key={seat}
                      className={`jk-scoretable__cell ${
                        bid === null ? "is-empty" : met ? "is-ok" : "is-pending"
                      }`}
                    >
                      {bid === null ? "—" : `${won} / ${bid}`}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th className="jk-scoretable__rowlabel" scope="row">
                Total
              </th>
              {SEATS.map((seat) => (
                <td key={seat} className="jk-scoretable__total">
                  {(view.scores[seat] / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{" "}
                  pts
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {view.gamePhase === "finished" && (
        <p className="jk-scoretable__note">Partie terminée — score final ci-dessus.</p>
      )}
    </div>
  );
}
