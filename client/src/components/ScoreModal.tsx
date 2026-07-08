import { Fragment, useEffect, useRef } from "react";
import type { PlayerView } from "@shared/views";
import { computeFinalPositions } from "@shared/progression";
import { Avatar } from "./Avatar";
import { rankLabel } from "./RankBadge";
import "./ScoreModal.css";

export type ScoreModalProps = {
  view: PlayerView;
  pseudoOf: (seat: number) => string;
  onClose: () => void;
};

const SEATS = [0, 1, 2, 3];

// Bornes de sets DÉRIVÉES du schedule de la vue (le mode Only 9 n'a pas
// la même séquence que le Standard) : dealIndex de la dernière donne de
// chaque set (où poser la ligne de sous-total).
function lastDealOfSet(schedule: PlayerView["schedule"]): number[] {
  const out: number[] = [];
  for (let i = 0; i < schedule.length; i++) {
    if (i === schedule.length - 1 || schedule[i + 1].setIndex !== schedule[i].setIndex) {
      out.push(i);
    }
  }
  return out;
}

function formatPoints(raw: number): string {
  return (raw / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// ─── La feuille de score (tableau réutilisable) ───────────────────
// Une ligne par donne TERMINÉE (view.roundHistory : enchère/score BRUT de
// chaque joueur, public, avant prime/effacement de fin de set), une ligne
// de sous-total cumulé après chaque set (running, recalculé à partir des
// flags doubled/erased — la dernière vaut le total final), puis la donne
// EN COURS + le score cumulé actuel (tant que la partie n'est pas finie).
// Utilisée à l'identique dans l'overlay plein écran ET sur l'écran de fin.
export function ScoreTable({
  view,
  pseudoOf,
}: {
  view: PlayerView;
  pseudoOf: (seat: number) => string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const finished = view.gamePhase === "finished";
  // Mode 2 contre 2 : pendant la partie, le total du bas est agrégé par équipe
  // (sièges 0+2 vs 1+3). À la fin, on reste individuel (placements) — donc ce
  // drapeau ne s'applique qu'au bloc !finished.
  const pairs = view.config.pairs === true;
  // Ordre des COLONNES : en 2v2, les partenaires (sièges 0+2 vs 1+3,
  // assis en face) sont regroupés côte à côte — ainsi la ligne de total
  // d'équipe (colSpan 2) recouvre exactement les colonnes de l'équipe.
  const seatOrder = pairs ? [0, 2, 1, 3] : SEATS;
  const setEnds = lastDealOfSet(view.schedule);
  const finalSetNumber = setEnds.length;
  // Positions finales (1er/2e…) affichées sous chaque colonne en fin de partie.
  const positions = finished ? computeFinalPositions(view.scores) : null;

  // Nombre exact de lignes affichées : sert à dimensionner la police (via la
  // variable CSS --rows) pour que TOUT le tableau tienne dans la hauteur de
  // l'écran, sans scroll, quel que soit le mode (Standard 24 / Only 9 16).
  const dealsShown = view.roundHistory.length;
  const subtotalsShown = setEnds.filter((d) => d < dealsShown).length;
  const rows = 1 + dealsShown + subtotalsShown + (finished ? 0 : 2);

  // On garde la dernière donne visible (au cas où l'écran serait vraiment court).
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [view.currentDealIndex, view.gamePhase]);

  return (
    <div
      className="jk-scoretable__scroll"
      ref={scrollRef}
      style={{ ["--rows" as string]: rows }}
    >
      <table className="jk-scoretable__table">
        <thead>
          <tr>
            <th className="jk-scoretable__rowlabel" scope="col" />
            {seatOrder.map((seat) => (
              <th key={seat} scope="col" className={seat === view.you ? "is-me" : ""}>
                <span className="jk-scoretable__player">
                  <Avatar name={pseudoOf(seat)} size={30} />
                  <span className="jk-scoretable__playername">
                    {seat === view.you ? "Me" : pseudoOf(seat)}
                  </span>
                  <span className="jk-scoretable__playerrank">
                    {positions
                      ? `${positions[seat]}${positions[seat] === 1 ? "er" : "e"}`
                      : rankLabel(view.playerLevels?.[seat] ?? null)}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const running = [0, 0, 0, 0];
            return view.roundHistory.map((deal) => {
              for (const seat of SEATS) {
                let delta = deal.scores[seat];
                if (deal.doubled[seat]) delta += deal.scores[seat];
                if (deal.erased[seat]) delta -= deal.scores[seat];
                running[seat] += delta;
              }
              const isSetEnd = setEnds.includes(deal.dealIndex);

              return (
                <Fragment key={deal.dealIndex}>
                  <tr>
                    <th className="jk-scoretable__rowlabel" scope="row">
                      {deal.cardsPerPlayer}
                    </th>
                    {seatOrder.map((seat) => {
                      const bid = deal.bids[seat];
                      const won = deal.tricksWon[seat];
                      const score = deal.scores[seat];
                      const met = won === bid;
                      const xisht = bid >= 1 && won === 0;
                      const showDouble = deal.doubled[seat];
                      const showErased = deal.erased[seat];
                      const scoreClass = xisht ? "is-xisht" : met ? "is-ok" : "is-pending";
                      return (
                        <td key={seat} className="jk-scoretable__cell">
                          <span className="jk-scoretable__bid">{bid === 0 ? "–" : bid}</span>
                          <span
                            className={`jk-scoretable__score ${scoreClass}${
                              showErased ? " is-erased" : ""
                            }`}
                          >
                            {xisht ? "|---|" : score}
                            {showDouble && <span className="jk-scoretable__badge--double">2x</span>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                  {isSetEnd && (
                    <tr className="jk-scoretable__setrow">
                      <th className="jk-scoretable__rowlabel" scope="row">
                        {setEnds.indexOf(deal.dealIndex) + 1 === finalSetNumber
                          ? "Total"
                          : `Set ${setEnds.indexOf(deal.dealIndex) + 1}`}
                      </th>
                      {seatOrder.map((seat) => (
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

          {!finished && (
            <>
              <tr>
                <th className="jk-scoretable__rowlabel" scope="row">
                  En cours
                </th>
                {seatOrder.map((seat) => {
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
              <tr className="jk-scoretable__setrow jk-scoretable__totalrow">
                <th className="jk-scoretable__rowlabel" scope="row">
                  Score
                </th>
                {pairs ? (
                  // 2 totaux d'équipe (somme des partenaires en face), ancrés
                  // sur l'ordre des colonnes [0, 2, 1, 3] : le 1er colSpan
                  // recouvre les colonnes des sièges 0+2, le 2d celles de 1+3.
                  // « Nous »/« Eux » suit l'équipe de view.you (parité).
                  (() => {
                    const teamOfMe = view.you % 2;
                    const totalA = view.scores[0] + view.scores[2]; // sièges 0+2
                    const totalB = view.scores[1] + view.scores[3]; // sièges 1+3
                    return (
                      <>
                        <td
                          colSpan={2}
                          className={`jk-scoretable__subtotal jk-scoretable__teamscore${
                            teamOfMe === 0 ? " is-mine" : ""
                          }`}
                        >
                          <span className="jk-scoretable__teamlabel">
                            {teamOfMe === 0 ? "Nous" : "Eux"}
                          </span>
                          {formatPoints(totalA)}
                        </td>
                        <td
                          colSpan={2}
                          className={`jk-scoretable__subtotal jk-scoretable__teamscore${
                            teamOfMe === 1 ? " is-mine" : ""
                          }`}
                        >
                          <span className="jk-scoretable__teamlabel">
                            {teamOfMe === 1 ? "Nous" : "Eux"}
                          </span>
                          {formatPoints(totalB)}
                        </td>
                      </>
                    );
                  })()
                ) : (
                  seatOrder.map((seat) => (
                    <td key={seat} className="jk-scoretable__subtotal">
                      {formatPoints(view.scores[seat])}
                    </td>
                  ))
                )}
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

// En-tête « STANDARD MODE · -200 » réutilisable.
export function ScoreModeLabel({ view }: { view: PlayerView }) {
  const modeLabel = view.config.mode === "only9" ? "ONLY 9 MODE" : "STANDARD MODE";
  return (
    <span className="jk-scoretable__mode">
      {modeLabel} <span className="jk-scoretable__stake">-{view.config.khishtiPenalty}</span>
    </span>
  );
}

// ─── Overlay plein écran (ouvert via le bouton ≡ pendant la partie) ─
export function ScoreModal({ view, pseudoOf, onClose }: ScoreModalProps) {
  return (
    <div className="jk-scoretable" role="dialog" aria-modal="true" aria-label="Scores">
      <header className="jk-scoretable__header">
        <ScoreModeLabel view={view} />
        <button type="button" className="jk-btn jk-btn--ghost" onClick={onClose}>
          Fermer
        </button>
      </header>
      <ScoreTable view={view} pseudoOf={pseudoOf} />
    </div>
  );
}
