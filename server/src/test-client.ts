// ─── Script de test du lobby (sans front) ───────────────────────
// Simule plusieurs clients socket.io-client contre le serveur en cours
// d'exécution. Prouve que créer / rejoindre / synchroniser fonctionne.
//
// PRÉREQUIS : le serveur doit tourner (terminal 1) :
//     cd server && npm run dev
// Puis, dans un terminal 2 :
//     cd server && npx tsx src/test-client.ts
import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameCreatedPayload,
  LobbyUpdatePayload,
  GameErrorPayload,
} from "../../shared/events";

const URL = "http://localhost:3001";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Connecte un client et branche les logs des événements reçus.
function connect(name: string): ClientSocket {
  const socket: ClientSocket = io(URL, { transports: ["websocket"] });
  socket.on("welcome", (p) => console.log(`[${name}] welcome : ${p.message}`));
  socket.on("lobbyUpdate", (p: LobbyUpdatePayload) =>
    console.log(
      `[${name}] lobbyUpdate ${p.gameId} (${p.status}) : ` +
        p.players.map((x) => `#${x.seat} ${x.pseudo}`).join(", ")
    )
  );
  socket.on("gameError", (e: GameErrorPayload) =>
    console.log(`[${name}] gameError ${e.code} : ${e.message}`)
  );
  return socket;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("─── Test lobby : Alice crée, Bob rejoint, Carol échoue ───\n");

  // 1) Alice se connecte et crée une partie.
  const alice = connect("Alice");
  const gameId: string = await new Promise((resolve) => {
    alice.on("gameCreated", (p: GameCreatedPayload) => {
      console.log(`[Alice] gameCreated : ${p.gameId} (siège ${p.seat})`);
      resolve(p.gameId);
    });
    alice.emit("createGame", { pseudo: "Alice" });
  });

  await wait(300);

  // 2) Bob rejoint la partie d'Alice → les deux reçoivent lobbyUpdate.
  const bob = connect("Bob");
  await wait(200);
  console.log(`\n[Bob] rejoint ${gameId}…`);
  bob.emit("joinGame", { gameId, pseudo: "Bob" });
  await wait(400);

  // 3) Carol tente une partie inexistante → gameError pour elle seule.
  const carol = connect("Carol");
  await wait(200);
  console.log(`\n[Carol] tente de rejoindre "ZZZZ" (inexistante)…`);
  carol.emit("joinGame", { gameId: "ZZZZ", pseudo: "Carol" });
  await wait(400);

  // 4) Bob se déconnecte → Alice reçoit un lobbyUpdate sans Bob.
  console.log(`\n[Bob] se déconnecte…`);
  bob.disconnect();
  await wait(400);

  // Nettoyage.
  alice.disconnect();
  carol.disconnect();
  await wait(200);
  console.log("\n─── Fin du test ───");
  process.exit(0);
}

main();
