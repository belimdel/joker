import { useState, useEffect } from "react";
import { api, type LeaderboardResponse } from "../api";
import "./screens.css";

type Props = {
  onBack: () => void;
  onViewProfile: (username: string) => void;
};

export function Leaderboard({ onBack, onViewProfile }: Props) {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.leaderboard().then((res) => {
      if (cancelled) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="jk-leaderboard jk-fade-up">
      <div className="jk-profile__nav">
        <button className="jk-btn jk-btn--ghost jk-btn--sm" onClick={onBack}>← Retour</button>
      </div>

      <header className="jk-home__head">
        <div className="jk-eyebrow">Classement mensuel</div>
        <h2 className="jk-brand" style={{ fontSize: 'clamp(1.8rem, 8vw, 3rem)', marginTop: '0.2rem' }}>
          Top 50
        </h2>
        {data && <p className="jk-home__sub">Saison {data.season}</p>}
      </header>

      {loading && <p className="jk-profile__loading">Chargement…</p>}
      {error && <p className="jk-error">{error}</p>}

      {data && data.entries.length === 0 && (
        <p className="jk-leaderboard__empty">Aucune partie ranked ce mois-ci.</p>
      )}

      {data && data.entries.length > 0 && (
        <div className="jk-panel jk-leaderboard__panel">
          <div className="jk-lb-header">
            <span>#</span>
            <span>Joueur</span>
            <span>Niv.</span>
            <span>Points</span>
            <span>Parties</span>
          </div>
          {data.entries.map((entry) => (
            <button
              key={entry.username}
              className="jk-lb-row"
              onClick={() => onViewProfile(entry.username)}
            >
              <span className={`jk-lb-rank ${entry.rank <= 3 ? `jk-lb-rank--top${entry.rank}` : ''}`}>
                {entry.rank}
              </span>
              <span className="jk-lb-name">{entry.username}</span>
              <span className="jk-lb-level">{entry.level}</span>
              <span className="jk-lb-points">{entry.points}</span>
              <span className="jk-lb-games">{entry.gamesPlayed}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
