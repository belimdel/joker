import { useState } from "react";
import { useGame } from "../GameContext";
import "./screens.css";

export function Home() {
  const { createGame, joinGame, startTestGame, error, notice, connected } = useGame();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [pseudo, setPseudo] = useState("");
  const [code, setCode] = useState("");

  const cleanPseudo = pseudo.trim();
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
              value={pseudo}
              maxLength={16}
              onChange={(e) => setPseudo(e.target.value)}
              placeholder="Ex. Tamar"
            />
          </div>

          {mode === "join" && (
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
              onClick={() => createGame(cleanPseudo)}
            >
              Créer la table
            </button>
          ) : (
            <button
              className="jk-btn jk-btn--primary jk-btn--block"
              disabled={!canJoin}
              onClick={() => joinGame(cleanCode, cleanPseudo)}
            >
              Rejoindre
            </button>
          )}

          <button
            className="jk-btn jk-btn--ghost jk-btn--block"
            disabled={!canCreate}
            onClick={() => startTestGame(cleanPseudo)}
          >
            Partie solo (test)
          </button>
        </div>
      </div>

      <footer className="jk-home__foot">
        <span className={`jk-dot ${connected ? "is-on" : ""}`} />
        {connected ? "Connecté au serveur" : "Connexion au serveur…"}
      </footer>
    </div>
  );
}
