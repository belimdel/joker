import { Fragment, useEffect, useRef } from "react";
import type { PlayerView } from "@shared/views";
import "./ScoreModal.css";

export type ScoreModalProps = {
  view: PlayerView;
  pseudoOf: (seat: number) => string;
  onClose: () => void;
};

const SEATS = [0, 1, 2, 3];

// Schedule à 4 joueurs figé (cf. shared/game.ts buildGameSchedule) : 4 sets de
// tailles fixes 8/4/8/4 donnes. dealHistory n'a pas de champ setIndex, donc on
// déduit l'appartenance au set par bornes fixes sur dealIndex. LAST_DEAL_OF_SET[i]
// = dealIndex de la dernière donne du set i (où poser la ligne de sous-total).
const LAST_DEAL_OF_SET = [7, 11, 19, 23];

function formatPoints(raw: number): string {
  return (raw / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Dernière ligne de LAST_DEAL_OF_SET = fin du set 4 = fin de partie : son
// sous-total cumulé EST le total final (égal à view.scores, cf. garde-fou).
// On l'étiquette "Total" plutôt que "Set 4" pour éviter une ligne redondante.
const FINAL_SET_NUMBER = LAST_DEAL_OF_SET.length;

// ─── Tableau de scores plein écran (ouvert via le bouton 🏆) ───────
// Une ligne par donne TERMINÉE (view.roundHistory : enchère/score BRUT de
// chaque joueur, public, avant prime/effacement de fin de set), une ligne
// de sous-total cumulé après chaque set (running, recalculé à partir des
// flags doubled/erased — la dernière vaut le total final), puis la donne
// EN COURS (live, tant que la partie n'est pas finie).
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
            {(() => {
              // Cumul couru par siège (donne brute, doublée une 2e fois si
              // doubled, retranchée si erased), pour poser les sous-totaux
              // de set sans toucher au reste de la logique d'affichage.
              const running = [0, 0, 0, 0];
              return view.roundHistory.map((deal) => {
                for (const seat of SEATS) {
                  let delta = deal.scores[seat];
                  if (deal.doubled[seat]) delta += deal.scores[seat];
                  if (deal.erased[seat]) delta -= deal.scores[seat];
                  running[seat] += delta;
                }
                const isSetEnd = LAST_DEAL_OF_SET.includes(deal.dealIndex);

                return (
                  <Fragment key={deal.dealIndex}>
                    <tr>
                      <th className="jk-scoretable__rowlabel" scope="row">
                        {deal.cardsPerPlayer}
                      </th>
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
                        const scoreClass = xisht ? "is-xisht" : met ? "is-ok" : "is-pending";
                        return (
                          <td key={seat} className="jk-scoretable__cell">
                            <span className="jk-scoretable__bid">{bid}</span>
                            <span
                              className={`jk-scoretable__score ${scoreClass}${
                                showErased ? " is-erased" : ""
                              }`}
                            >
                              {score}
                              {showDouble && (
                                <span className="jk-scoretable__badge--double">×2</span>
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    {isSetEnd && (
                      <tr className="jk-scoretable__setrow">
                        <th className="jk-scoretable__rowlabel" scope="row">
                          {LAST_DEAL_OF_SET.indexOf(deal.dealIndex) + 1 === FINAL_SET_NUMBER
                            ? "Total"
                            : `Set ${LAST_DEAL_OF_SET.indexOf(deal.dealIndex) + 1}`}
                        </th>
                        {SEATS.map((seat) => (
                          <td key={seat} className="jk-scoretable__subtotal">
                            {formatPoints(running[seat])}
                          </td>
                        ))}
                      </tr>
                    )}
                  </Fragment>
                );
              });
            })()}

            {view.gamePhase !== "finished" && (
              <tr>
                <th className="jk-scoretable__rowlabel" scope="row">
                  En cours
                </th>
                {SEATS.map((seat) => {
                  const bid = view.bids[seat];
                  const won = view.tricksWon[seat];
                  const met = bid !== null && won === bid;
                  const scoreClass = bid === null ? "is-empty" : met ? "is-ok" : "is-pending";
                  return (
                    <td key={seat} className="jk-scoretable__cell">
                      <span className={`jk-scoretable__score ${scoreClass}`}>
                        {bid === null ? "—" : `${won}/${bid}`}
                      </span>
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {view.gamePhase === "finished" && (
        <p className="jk-scoretable__note">Partie terminée — score final ci-dessus.</p>
      )}
    </div>
  );
}
