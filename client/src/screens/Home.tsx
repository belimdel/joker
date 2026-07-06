import { useState } from "react";
import { useGame } from "../GameContext";
import { useAuth } from "../AuthContext";
import "./screens.css";

type HomeProps = {
  onViewProfile: (username: string) => void;
  onViewLeaderboard: () => void;
};

export function Home({ onViewProfile, onViewLeaderboard }: HomeProps) {
  const { createGame, joinGame, startTestGame, error, notice, connected, publicGames } = useGame();
  const { user, authLoading, showLogin, showRegister, logout } = useAuth();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [pseudo, setPseudo] = useState("");
  const [code, setCode] = useState("");
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');

  const effectivePseudo = user ? user.username : pseudo;
  const cleanPseudo = effectivePseudo.trim();
  const cleanCode = code.trim();
  const canCreate = cleanPseudo.length > 0 && connected;
  const canJoin = cleanPseudo.length > 0 && cleanCode.length > 0 && connected;

  return (
    <div className="jk-home">
      <header className="jk-home__head jk-fade-up">
        <div className="jk-eyebrow">Salon de cartes géorgien</div>
        <h1 className="jk-brand jk-home__title">Joker</h1>
        <p className="jk-home__sub">
          Le Whist à la géorgienne — 4 joueurs, 2 jokers, et des nerfs.
        </p>
      </header>

      {!authLoading && (
        <div className="jk-auth-bar jk-fade-up">
          {user ? (
            <>
              <button
                className="jk-auth-bar__name jk-auth-bar__profile-btn"
                onClick={() => onViewProfile(user.username)}
                title="Voir mon profil"
              >
                {user.username} <span className="jk-auth-bar__level">niv. {user.level}</span>
              </button>
              <button className="jk-btn jk-btn--ghost jk-btn--sm" onClick={logout}>Se déconnecter</button>
            </>
          ) : (
            <>
              <button className="jk-btn jk-btn--ghost jk-btn--sm" onClick={showLogin}>Se connecter</button>
              <button className="jk-btn jk-btn--ghost jk-btn--sm" onClick={showRegister}>Créer un compte</button>
            </>
          )}
        </div>
      )}

      <div className="jk-panel jk-home__panel jk-fade-up">
        <div className="jk-tabs">
          <button
            className={`jk-tab ${mode === "create" ? "is-active" : ""}`}
            onClick={() => setMode("create")}
          >
            Créer
          </button>
          <button
            className={`jk-tab ${mode === "join" ? "is-active" : ""}`}
            onClick={() => setMode("join")}
          >
            Rejoindre
          </button>
        </div>

        <div className="jk-form">
          <div>
            <label className="jk-label">Votre pseudo</label>
            <input
              className="jk-input"
              value={user ? user.username : pseudo}
              maxLength={16}
              readOnly={!!user}
              onChange={(e) => { if (!user) setPseudo(e.target.value); }}
              placeholder="Ex. Tamar"
              style={user ? { opacity: 0.7, cursor: 'default' } : undefined}
            />
          </div>

          {mode === "create" && (
            <div className="jk-visibility-row">
              <label className="jk-label">Visibilité</label>
              <div className="jk-toggle-group">
                <button
                  type="button"
                  className={`jk-toggle ${visibility === 'public' ? 'is-active' : ''}`}
                  onClick={() => setVisibility('public')}
                >
                  Publique
                </button>
                <button
                  type="button"
                  className={`jk-toggle ${visibility === 'private' ? 'is-active' : ''}`}
                  onClick={() => setVisibility('private')}
                >
                  Privée
                </button>
              </div>
            </div>
          )}

          {mode === "join" && (
            <>
              {publicGames.length > 0 && (
                <div className="jk-public-games">
                  <div className="jk-label" style={{ marginBottom: '0.5rem' }}>Tables ouvertes</div>
                  {publicGames.map((g) => (
                    <button
                      key={g.roomCode}
                      type="button"
                      className="jk-public-game-row"
                      disabled={!cleanPseudo || !connected}
                      onClick={() => joinGame(g.roomCode, effectivePseudo)}
                    >
                      <span className="jk-public-game__host">{g.hostUsername}</span>
                      <span className="jk-public-game__code">{g.roomCode}</span>
                      <span className="jk-public-game__count">{g.playerCount}/4</span>
                      <span className="jk-btn jk-btn--ghost jk-btn--sm">Rejoindre</span>
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="jk-label">Code de la table</label>
                <input
                  className="jk-input jk-input--code"
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABCD"
                />
              </div>
            </>
          )}

          {notice && (
            <div
              className="jk-error"
              style={{
                background: "rgba(123, 158, 232, 0.14)",
                borderColor: "rgba(123, 158, 232, 0.5)",
                color: "#d9e4ff",
              }}
            >
              ℹ {notice}
            </div>
          )}

          {error && <div className="jk-error">⚠ {error.message}</div>}

          {mode === "create" ? (
            <button
              className="jk-btn jk-btn--primary jk-btn--block"
              disabled={!canCreate}
              onClick={() => createGame(effectivePseudo, visibility)}
            >
              Créer la table
            </button>
          ) : (
            <button
              className="jk-btn jk-btn--primary jk-btn--block"
              disabled={!canJoin}
              onClick={() => joinGame(cleanCode, effectivePseudo)}
            >
              Rejoindre par code
            </button>
          )}

          <button
            className="jk-btn jk-btn--ghost jk-btn--block"
            disabled={!canCreate}
            onClick={() => startTestGame(effectivePseudo)}
          >
            Partie solo (test)
          </button>
        </div>
      </div>

      <div className="jk-home__links">
        <button className="jk-btn jk-btn--ghost jk-btn--sm" onClick={onViewLeaderboard}>
          Classement
        </button>
      </div>

      <footer className="jk-home__foot">
        <span className={`jk-dot ${connected ? "is-on" : ""}`} />
        {connected ? "Connecté au serveur" : "Connexion au serveur…"}
      </footer>
    </div>
  );
}
