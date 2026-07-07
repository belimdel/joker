import { useGame } from "../GameContext";
import { useAuth } from "../AuthContext";
import "./screens.css";

// Landing : éventail de 3 cartes (VIP / Stats / Community) + gros
// bouton Play qui mène à la page Play (rooms).
type HomeProps = {
  onPlay: () => void;
  onViewProfile: (username: string) => void;
};

export function Home({ onPlay, onViewProfile }: HomeProps) {
  const { connected } = useGame();
  const { user, showLogin } = useAuth();

  return (
    <div className="jk-home">
      <div className="jk-fan jk-fade-up">
        <button className="jk-fan__card jk-fan__card--left" title="Bientôt disponible">
          <span className="jk-fan__badge">VIP</span>
          <span className="jk-fan__suit">♣</span>
          <span className="jk-fan__label">Membership</span>
        </button>
        <button
          className="jk-fan__card jk-fan__card--right"
          title="Bientôt disponible"
        >
          <span className="jk-fan__icon" style={{ color: "var(--card-red)" }}>♥</span>
          <span className="jk-fan__suit jk-fan__suit--red">♥</span>
          <span className="jk-fan__label" style={{ color: "var(--card-red)" }}>
            Community
          </span>
        </button>
        <button
          className="jk-fan__card jk-fan__card--center"
          onClick={() => (user ? onViewProfile(user.username) : showLogin())}
          title="Mes statistiques"
        >
          <span className="jk-fan__icon">📊</span>
          <span className="jk-fan__suit">♠</span>
          <span className="jk-fan__label">Stats</span>
        </button>
      </div>

      <button className="jk-btn jk-btn--blue jk-home__play jk-fade-up" onClick={onPlay}>
        Play
      </button>

      <footer className="jk-home__foot">
        <span className={`jk-dot ${connected ? "is-on" : ""}`} />
        {connected ? "Connecté au serveur" : "Connexion au serveur…"}
      </footer>
    </div>
  );
}
