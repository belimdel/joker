import { GameProvider, useGame } from "./GameContext";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Board } from "./screens/Board";

// Routeur d'écran piloté UNIQUEMENT par l'état réseau (le serveur fait foi) :
//   - une PlayerView reçue → on est en partie → plateau ;
//   - sinon un lobby connu → salle d'attente ;
//   - sinon → accueil.
function Screen() {
  const { view, lobby } = useGame();
  if (view) return <Board />;
  if (lobby) return <Lobby />;
  return <Home />;
}

export default function App() {
  return (
    <GameProvider>
      <div className="jk-screen">
        <Screen />
      </div>
    </GameProvider>
  );
}
