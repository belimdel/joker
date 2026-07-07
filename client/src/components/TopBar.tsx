import { useAuth } from "../AuthContext";
import { Avatar } from "./Avatar";
import { JokerLogo } from "./JokerLogo";
import { RankStars, rankLabel } from "./RankBadge";

// Barre du haut des écrans menu : logo, rang + étoiles, compteur de
// pièces (= XP du compte), pseudo (ou « Guest ⚠ ») et avatar → profil.
type TopBarProps = {
  onViewProfile: (username: string) => void;
  onLogin: () => void;
};

export function TopBar({ onViewProfile, onLogin }: TopBarProps) {
  const { user } = useAuth();
  const level = user?.level ?? 1;
  const openProfile = () => (user ? onViewProfile(user.username) : onLogin());

  return (
    <header className="jk-topbar">
      <span className="jk-topbar__logo" style={{ color: "#fff" }}>
        <JokerLogo size={34} />
      </span>
      <div className="jk-topbar__rank">
        <span className="jk-topbar__rankname">{rankLabel(user?.level ?? null)}</span>
        <RankStars level={level} />
      </div>
      <span className="jk-topbar__spacer" />
      <span className="jk-topbar__coins" title="XP">
        <span aria-hidden="true">🪙</span> {user?.xp ?? 0}
      </span>
      {user ? (
        <button className="jk-topbar__user" onClick={openProfile} title="Mon profil">
          {user.username}
        </button>
      ) : (
        <button className="jk-topbar__user" onClick={onLogin} title="Se connecter">
          Guest <span aria-hidden="true">⚠️</span>
        </button>
      )}
      <button className="jk-topbar__avatar" onClick={openProfile}>
        <Avatar name={user?.username ?? "Guest"} size={34} />
      </button>
    </header>
  );
}
