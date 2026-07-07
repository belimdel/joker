import { useState } from "react";
import { GameProvider, useGame } from "./GameContext";
import { AuthProvider, useAuth } from "./AuthContext";
import { Home } from "./screens/Home";
import { Play } from "./screens/Play";
import { ComingSoon } from "./screens/ComingSoon";
import { Login } from "./screens/Login";
import { Register } from "./screens/Register";
import { VerifyEmail } from "./screens/VerifyEmail";
import { Lobby } from "./screens/Lobby";
import { Board } from "./screens/Board";
import { Profile } from "./screens/Profile";
import { Leaderboard } from "./screens/Leaderboard";
import { ReconnectBanner } from "./components/ReconnectBanner";
import { TopBar } from "./components/TopBar";
import { BottomNav, type NavTab } from "./components/BottomNav";

// Écrans menu : les 5 onglets de la nav basse + landing/profil.
type NavScreen = "home" | NavTab | "profile";

function Screen() {
  const { view, lobby } = useGame();
  const { authView, showLogin } = useAuth();
  const [nav, setNav] = useState<NavScreen>("home");
  const [profileUsername, setProfileUsername] = useState("");

  // Les écrans de jeu et d'auth ont la priorité absolue (plein écran).
  if (view) return <Board />;
  if (lobby) return <Lobby />;
  if (authView === "login") return <Login />;
  if (authView === "register") return <Register />;
  if (authView === "verify") return <VerifyEmail />;

  const openProfile = (username: string) => {
    setProfileUsername(username);
    setNav("profile");
  };

  let page: React.ReactNode;
  switch (nav) {
    case "home":
      page = <Home onPlay={() => setNav("play")} onViewProfile={openProfile} />;
      break;
    case "play":
      page = <Play onLogin={showLogin} />;
      break;
    case "friends":
    case "tournaments":
    case "shop":
      page = <ComingSoon page={nav} />;
      break;
    case "top":
      page = (
        <Leaderboard onBack={() => setNav("home")} onViewProfile={openProfile} />
      );
      break;
    case "profile":
      page = (
        <Profile
          username={profileUsername}
          onBack={() => setNav("home")}
          onViewLeaderboard={() => setNav("top")}
        />
      );
      break;
  }

  const activeTab: NavTab | null =
    nav === "home" ? "play" : nav === "profile" ? null : nav;

  return (
    <>
      <TopBar onViewProfile={openProfile} onLogin={showLogin} />
      <main className="jk-page">{page}</main>
      <BottomNav
        active={activeTab}
        onSelect={(tab) => setNav(tab === "play" ? "home" : tab)}
      />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <ReconnectBanner />
        <div className="jk-screen">
          <Screen />
        </div>
      </GameProvider>
    </AuthProvider>
  );
}
