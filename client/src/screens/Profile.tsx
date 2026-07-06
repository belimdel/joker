import { useState, useEffect } from "react";
import { api, type UserStats } from "../api";
import "./screens.css";

type Props = {
  username: string;
  onBack: () => void;
  onViewLeaderboard: () => void;
};

export function Profile({ username, onBack, onViewLeaderboard }: Props) {
  const [data, setData] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.userStats(username).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setData(res.data);
      } else {
        setError(res.status === 404 ? 'Joueur introuvable.' : res.error);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [username]);

  const xpBarPct = data
    ? Math.min(100, Math.round((data.progression.currentLevelXp / data.progression.nextLevelXp) * 100))
    : 0;

  return (
    <div className="jk-profile jk-fade-up">
      <div className="jk-profile__nav">
        <button className="jk-btn jk-btn--ghost jk-btn--sm" onClick={onBack}>← Retour</button>
        <button className="jk-btn jk-btn--ghost jk-btn--sm" onClick={onViewLeaderboard}>Classement →</button>
      </div>

      {loading && <p className="jk-profile__loading">Chargement…</p>}
      {error && <p className="jk-error">{error}</p>}

      {data && (
        <>
          <header className="jk-profile__head">
            <h2 className="jk-profile__name">{data.user.username}</h2>
            <div className="jk-profile__level">Niv. {data.progression.level}</div>
            <div className="jk-xp-bar">
              <div className="jk-xp-bar__fill" style={{ width: `${xpBarPct}%` }} />
            </div>
            <div className="jk-profile__xp-label">
              {data.progression.currentLevelXp} / {data.progression.nextLevelXp} XP
            </div>
          </header>

          <div className="jk-panel jk-profile__panel">
            <div className="jk-stats-grid">
              <div className="jk-stat">
                <div className="jk-stat__val">{data.stats.gamesPlayed}</div>
                <div className="jk-stat__lbl">Parties</div>
              </div>
              <div className="jk-stat">
                <div className="jk-stat__val">{data.stats.wins}</div>
                <div className="jk-stat__lbl">Victoires</div>
              </div>
              <div className="jk-stat">
                <div className="jk-stat__val">{data.stats.winRate}%</div>
                <div className="jk-stat__lbl">% Victoire</div>
              </div>
              <div className="jk-stat">
                <div className="jk-stat__val">
                  {data.stats.contractsMade}/{data.stats.contractsTotal}
                </div>
                <div className="jk-stat__lbl">Contrats</div>
              </div>
              <div className="jk-stat">
                <div className="jk-stat__val">{data.stats.contractRate}%</div>
                <div className="jk-stat__lbl">% Contrats</div>
              </div>
              <div className="jk-stat">
                <div className="jk-stat__val">{data.stats.xishts}</div>
                <div className="jk-stat__lbl">Xishts</div>
              </div>
              <div className="jk-stat">
                <div className="jk-stat__val">{data.stats.bestScore}</div>
                <div className="jk-stat__lbl">Meilleur score</div>
              </div>
              <div className="jk-stat">
                <div className="jk-stat__val">
                  {data.stats.avgPosition !== null ? data.stats.avgPosition : '—'}
                </div>
                <div className="jk-stat__lbl">Pos. moyenne</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
