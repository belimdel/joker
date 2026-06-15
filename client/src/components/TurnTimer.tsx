import "./TurnTimer.css";

export type TurnTimerProps = {
  turnStartedAt: number;
  turnDurationMs: number;
};

// ─── Barre de progression du temps de réflexion ──────────────────
// Le serveur fait autorité sur le temps (cf. PlayerView.turnStartedAt /
// turnDurationMs) : on ne calcule pas de "secondes restantes" en JS
// (ça dériverait avec le lag réseau). On lance une animation CSS dont
// la durée totale est turnDurationMs, avec un décalage négatif égal au
// temps déjà écoulé — la barre reprend donc à la bonne position même
// après un refresh/reconnexion. `key={turnStartedAt}` (posée par
// l'appelant) force le redémarrage de l'animation à chaque nouveau tour.
export function TurnTimer({ turnStartedAt, turnDurationMs }: TurnTimerProps) {
  const elapsed = Date.now() - turnStartedAt;

  return (
    <div className="jk-turntimer">
      <div
        className="jk-turntimer__bar"
        style={{
          animationDuration: `${turnDurationMs}ms`,
          animationDelay: `-${elapsed}ms`,
        }}
      />
    </div>
  );
}
