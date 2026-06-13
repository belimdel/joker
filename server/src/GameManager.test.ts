import { GameManager, GameManagerError, ID_LENGTH } from "./GameManager";
import { check, expectThrow } from "../../shared/test-utils";

console.log("══════ createGame ══════");
const m = new GameManager();
const g = m.createGame("Alice", "sock-A");
check("Une partie en mémoire", m.size, 1);
check("Identifiant de la bonne longueur", g.gameId.length, ID_LENGTH);
check(
  "Identifiant lisible (charset non ambigu)",
  /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/.test(g.gameId),
  true
);
check("Créateur au siège 0", g.players[0].seat, 0);
check("Statut initial waiting", g.status, "waiting");
check("Pas encore d'état de jeu", g.state, null);

console.log("\n══════ Identifiants uniques ══════");
const g2 = m.createGame("Solo", "sock-Z");
check("Deux parties distinctes", g.gameId !== g2.gameId, true);
check("Deux parties en mémoire", m.size, 2);

console.log("\n══════ joinGame : sièges, complet, inexistant ══════");
const m2 = new GameManager();
const room = m2.createGame("P0", "s0");
m2.joinGame(room.gameId, "P1", "s1");
m2.joinGame(room.gameId, "P2", "s2");
const afterThree = m2.getGame(room.gameId)!;
check(
  "Sièges attribués 0,1,2",
  afterThree.players.map((p) => p.seat),
  [0, 1, 2]
);
check("Toujours une seule partie", m2.size, 1);

m2.joinGame(room.gameId, "P3", "s3"); // 4e joueur → partie pleine
check("4 joueurs assis", m2.getGame(room.gameId)!.players.length, 4);
expectThrow("Refus si partie pleine", () =>
  m2.joinGame(room.gameId, "P4", "s4")
);
check(
  "Code d'erreur GAME_FULL",
  (() => {
    try {
      m2.joinGame(room.gameId, "P4", "s4");
      return "aucune";
    } catch (e) {
      return e instanceof GameManagerError ? e.code : "autre";
    }
  })(),
  "GAME_FULL"
);

expectThrow("Refus si partie inexistante", () =>
  m2.joinGame("ZZZZ", "X", "sx")
);
check(
  "Code d'erreur GAME_NOT_FOUND",
  (() => {
    try {
      m2.joinGame("ZZZZ", "X", "sx");
      return "aucune";
    } catch (e) {
      return e instanceof GameManagerError ? e.code : "autre";
    }
  })(),
  "GAME_NOT_FOUND"
);

console.log("\n══════ removePlayer : réoccupation de siège + suppression ══════");
const m3 = new GameManager();
const r3 = m3.createGame("A", "a");
m3.joinGame(r3.gameId, "B", "b"); // siège 1
m3.joinGame(r3.gameId, "C", "c"); // siège 2
m3.removePlayer("b"); // libère le siège 1
check(
  "Sièges restants 0,2",
  m3.getGame(r3.gameId)!.players.map((p) => p.seat).sort(),
  [0, 2]
);
const dJoin = m3.joinGame(r3.gameId, "D", "d"); // doit reprendre le siège 1
check("Réoccupation du plus petit siège libre", dJoin.players.find((p) => p.socketId === "d")!.seat, 1);

console.log("\n══════ removePlayer : partie vidée → supprimée ══════");
const m4 = new GameManager();
const r4 = m4.createGame("Seul", "solo");
check("Une partie", m4.size, 1);
const res = m4.removePlayer("solo");
check("Partie marquée supprimée", res.deleted, true);
check("Plus aucune partie", m4.size, 0);
check("getGame retourne undefined", m4.getGame(r4.gameId), undefined);

console.log("\n══════ removePlayer : socket inconnu → no-op ══════");
const m5 = new GameManager();
const res5 = m5.removePlayer("fantome");
check("Aucune partie touchée", res5.deleted, false);
check("Aucune partie associée", res5.gameId, null);

console.log("\n══════ publicPlayers : vue publique sans socketId ══════");
const m6 = new GameManager();
const r6 = m6.createGame("Zoe", "z");
m6.joinGame(r6.gameId, "Yann", "y");
const pub = m6.publicPlayers(m6.getGame(r6.gameId)!);
check("Vue publique triée par siège, sans socketId", pub, [
  { seat: 0, pseudo: "Zoe" },
  { seat: 1, pseudo: "Yann" },
]);

console.log("\n══════ getGameBySocket / seatOf ══════");
const m7 = new GameManager();
const r7 = m7.createGame("S0", "sock0");
m7.joinGame(r7.gameId, "S1", "sock1");
check("getGameBySocket retrouve la partie", m7.getGameBySocket("sock1")?.gameId, r7.gameId);
check("seatOf du créateur = 0", m7.seatOf(r7, "sock0"), 0);
check("seatOf du second = 1", m7.seatOf(r7, "sock1"), 1);
check("getGameBySocket d'un inconnu = undefined", m7.getGameBySocket("inconnu"), undefined);
check("seatOf d'un inconnu = undefined", m7.seatOf(r7, "inconnu"), undefined);

console.log("\n══════ startGame : 4 joueurs requis, crée le GameState ══════");
const m8 = new GameManager();
const r8 = m8.createGame("A", "a");
m8.joinGame(r8.gameId, "B", "b");
m8.joinGame(r8.gameId, "C", "c");
// Avec 3 joueurs : refus.
expectThrow("Refus de démarrer à 3 joueurs", () => m8.startGame(r8));
check("État de jeu toujours vide", r8.state, null);
check("Statut toujours waiting", r8.status, "waiting");
// Avec 4 joueurs : démarrage OK.
m8.joinGame(r8.gameId, "D", "d");
m8.startGame(r8);
check("GameState créé après démarrage", r8.state !== null, true);
check("Statut passé à in-progress", r8.status, "in-progress");
check("GameState : 4 joueurs", r8.state!.playerCount, 4);
check("GameState : donne 0, phase bidding", r8.state!.round.phase, "bidding");
