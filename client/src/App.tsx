import { useState } from "react";
import { GameProvider, useGame } from "./GameContext";
import { AuthProvider, useAuth } from "./AuthContext";
import { Home } from "./screens/Home";
import { Login } from "./screens/Login";
import { Register } from "./screens/Register";
import { Lobby } from "./screens/Lobby";
import { Board } from "./screens/Board";
import { Profile } from "./screens/Profile";
import { Leaderboard } from "./screens/Leaderboard";
import { ReconnectBanner } from "./components/ReconnectBanner";

type NavScreen = 'home' | 'profile' | 'leaderboard';

function Screen() {
  const { view, lobby } = useGame();
  const { authView } = useAuth();
  const [nav, setNav] = useState<NavScreen>('home');
  const [profileUsername, setProfileUsername] = useState('');

  // Les écrans de jeu ont la priorité absolue.
  if (view) return <Board />;
  if (lobby) return <Lobby />;
  if (authView === 'login') return <Login />;
  if (authView === 'register') return <Register />;

  if (nav === 'profile') {
    return (
      <Profile
        username={profileUsername}
        onBack={() => setNav('home')}
        onViewLeaderboard={() => setNav('leaderboard')}
      />
    );
  }

  if (nav === 'leaderboard') {
    return (
      <Leaderboard
        onBack={() => setNav('home')}
        onViewProfile={(u) => { setProfileUsername(u); setNav('profile'); }}
      />
    );
  }

  return (
    <Home
      onViewProfile={(u) => { setProfileUsername(u); setNav('profile'); }}
      onViewLeaderboard={() => setNav('leaderboard')}
    />
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
