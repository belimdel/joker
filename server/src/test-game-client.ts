// ─── Test de bout en bout : 4 clients réseau jouent une manche ───
// Prouve que le câblage marche ET que la diffusion ciblée ne fuit pas :
// chaque client reçoit SA main, jamais celle des autres — vérifié sur
// les PAYLOADS RÉELLEMENT REÇUS (pas seulement sur buildPlayerView).
//
// PRÉREQUIS : serveur lancé (terminal 1) :  cd server && npm run dev
// Lancer (terminal 2) :                     npx tsx server/src/test-game-client.ts
import { io, Socket } from "socket.io-client";
import { allowedBids } from "../../shared/bidding";
import { isLegalPlay } from "../../shared/round";
import { Card, Suit } from "../../shared/cards";
import { PlayerView } from "../../shared/views";
import { check } from "../../shared/test-utils";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../shared/events";

const URL = "http://localhost:3001";
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type GClient = {
  name: string;
  expectedSeat: number;
  socket: ClientSocket;
  latest: PlayerView | null;
  deal0: PlayerView | null; // 1re vue reçue de la donne 0
  deal1: PlayerView | null; // 1re vue reçue de la donne 1
  acted: Set<string>;
};

const clients: GClient[] = [];
let autoPlay = false;

// Résolveurs déclenchés quand les 4 clients ont capturé la vue d'une donne.
let resolveDeal0!: () => void;
const deal0Ready = new Promise<void>((r) => (resolveDeal0 = r));
let resolveDeal1!: () => void;
const deal1Ready = new Promise<void>((r) => (resolveDeal1 = r));

// Couleur déclarée quand on MÈNE un joker (stratégie naïve).
function pickDeclaredSuit(hand: Card[]): Suit {
  const normal = hand.find((c) => c.type === "normal");
  return normal && normal.type === "normal" ? normal.suit : "spades";
}

// Réaction d'un client à une nouvelle vue : capture + auto-play.
function onView(client: GClient, view: PlayerView): void {
  client.latest = view;
  if (view.currentDealIndex === 0 && client.deal0 === null) {
    client.deal0 = view;
    if (clients.every((c) => c.deal0 !== null)) resolveDeal0();
  }
  if (view.currentDealIndex === 1 && client.deal1 === null) {
    client.deal1 = view;
    if (clients.every((c) => c.deal1 !== null)) resolveDeal1();
  }
  if (autoPlay) maybeAct(client);
}

// Stratégie naïve déterministe, pilotée UNIQUEMENT via la vue réseau.
function maybeAct(client: GClient): void {
  const v = client.latest;
  if (!v || v.gamePhase === "finished") return;
  if (v.currentPlayer !== v.you) return; // pas mon tour

  // Dédoublonnage : un seul acte par point de décision.
  const key = `${v.currentDealIndex}|${v.roundPhase}|${v.currentPlayer}|${v.currentTrick.length}|${v.bids.filter((b) => b !== null).length}`;
  if (client.acted.has(key)) return;
  client.acted.add(key);

  if (v.roundPhase === "bidding") {
    const prev = v.bids.filter((b): b is number => b !== null);
    const options = allowedBids(v.cardsPerPlayer, prev, v.you === v.dealerIndex);
    client.socket.emit("placeBid", { bid: options[0] });
  } else if (v.roundPhase === "playing") {
    // Première carte LÉGALE de ma main (calcul local sur ma seule main).
    const card = v.hand.find((c) => isLegalPlay(v.hand, c, v.currentTrick, v.trumpSuit));
    if (!card) return;
    if (card.type === "joker") {
      const declared = v.currentTrick.length === 0 ? pickDeclaredSuit(v.hand) : undefined;
      client.socket.emit("playCard", { card, announce: "low", declaredSuit: declared });
    } else {
      client.socket.emit("playCard", { card });
    }
  }
}

function makeClient(name: string, expectedSeat: number): GClient {
  const socket: ClientSocket = io(URL, { transports: ["websocket"] });
  const client: GClient = {
    name,
    expectedSeat,
    socket,
    latest: null,
    deal0: null,
    deal1: null,
    acted: new Set(),
  };
  socket.on("gameStateUpdate", (view) => onView(client, view));
  socket.on("gameError", (e) => console.log(`[${name}] gameError ${e.code} : ${e.message}`));
  clients.push(client);
  return client;
}

async function connectAndJoin(client: GClient, gameId: string): Promise<void> {
  await new Promise<void>((resolve) => {
    client.socket.once("lobbyUpdate", () => resolve());
    client.socket.emit("joinGame", { gameId, pseudo: client.name });
  });
}

// Vérifie qu'AUCUNE carte d'un autre joueur n'apparaît dans le payload
// réellement reçu par chaque client.
function leakCheck(label: string, pick: (c: GClient) => PlayerView | null): void {
  const views = clients.map(pick);
  let leaked = 0;
  for (let x = 0; x < views.length; x++) {
    const vx = views[x];
    if (!vx) continue;
    const json = JSON.stringify(vx);
    for (let y = 0; y < views.length; y++) {
      if (y === x) continue;
      const vy = views[y];
      if (!vy) continue;
      for (const card of vy.hand) {
        const sig =
          card.type === "normal"
            ? `"suit":"${card.suit}","rank":"${card.rank}"`
            : `"id":"${card.id}"`;
        if (json.includes(sig)) leaked++;
      }
    }
  }
  check(`${label} : zéro carte adverse dans les payloads réseau`, leaked, 0);
}

async function main() {
  console.log("─── 4 clients réseau jouent la donne 0 en auto ───\n");

  const timeout = setTimeout(() => {
    console.log("❌ FAIL — timeout : le test ne s'est pas terminé.");
    process.exit(1);
  }, 15000);

  // 1) Alice crée la partie.
  const alice = makeClient("Alice", 0);
  const gameId = await new Promise<string>((resolve) => {
    alice.socket.on("gameCreated", (p) => resolve(p.gameId));
    alice.socket.emit("createGame", { pseudo: "Alice" });
  });
  console.log(`Partie créée : ${gameId}`);

  // 2) Bob, Carol, Dave rejoignent SÉQUENTIELLEMENT (sièges 1,2,3).
  await connectAndJoin(makeClient("Bob", 1), gameId);
  await connectAndJoin(makeClient("Carol", 2), gameId);
  await connectAndJoin(makeClient("Dave", 3), gameId);
  console.log("4 joueurs dans la room.\n");

  // 3) Démarrage par Alice (siège 0).
  alice.socket.emit("startGame");

  // 4) On attend la vue initiale (donne 0) chez les 4.
  await deal0Ready;
  console.log("Vues de la donne 0 reçues. Vérifications anti-fuite :");
  for (const c of clients) {
    check(`Donne 0 : ${c.name} reçoit la vue de SON siège`, c.deal0!.you, c.expectedSeat);
  }
  check("Donne 0 : handCounts complets [1,1,1,1]", clients[0].deal0!.handCounts, [1, 1, 1, 1]);
  check("Donne 0 : chacun voit 1 carte (la sienne)", clients[0].deal0!.hand.length, 1);
  leakCheck("Donne 0", (c) => c.deal0);

  // 5) Auto-play : les 4 clients jouent la donne via le réseau.
  console.log("\nAuto-play de la donne 0…");
  autoPlay = true;
  for (const c of clients) maybeAct(c);

  // 6) La donne 0 finie, le serveur a enchaîné la donne 1 (advanceToNextRound).
  await deal1Ready;
  console.log("Donne 1 atteinte (la manche 0 s'est jouée et a été scorée).");
  for (const c of clients) {
    check(`Donne 1 : ${c.name} reçoit la vue de SON siège`, c.deal1!.you, c.expectedSeat);
  }
  check("Donne 1 : handCounts [2,2,2,2]", clients[0].deal1!.handCounts, [2, 2, 2, 2]);
  check("Donne 1 : phase bidding", clients[0].deal1!.roundPhase, "bidding");
  check("Donne 1 : manche 0 scorée (somme des scores = 160)", clients[0].deal1!.scores.reduce((a, b) => a + b, 0), 160);
  leakCheck("Donne 1", (c) => c.deal1);

  // 7) Fin.
  clearTimeout(timeout);
  await new Promise((r) => setTimeout(r, 200));
  for (const c of clients) c.socket.disconnect();
  console.log("\n─── Fin du test e2e ───");
  process.exit(0);
}

main();
