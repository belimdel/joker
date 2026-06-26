import { GameManager, GameManagerError, ID_LENGTH } from "./GameManager";
import { check, expectThrow } from "../../shared/test-utils";

console.log("══════ createGame ══════");
const m = new GameManager();
const g = m.createGame("Alice", "sock-A", "sess-A");
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
const g2 = m.createGame("Solo", "sock-Z", "sess-Z");
check("Deux parties distinctes", g.gameId !== g2.gameId, true);
check("Deux parties en mémoire", m.size, 2);

console.log("\n══════ joinGame : sièges, complet, inexistant ══════");
const m2 = new GameManager();
const room = m2.createGame("P0", "s0", "sess-0");
m2.joinGame(room.gameId, "P1", "s1", "sess-1");
m2.joinGame(room.gameId, "P2", "s2", "sess-2");
const afterThree = m2.getGame(room.gameId)!;
check(
  "Sièges attribués 0,1,2",
  afterThree.players.map((p) => p.seat),
  [0, 1, 2]
);
check("Toujours une seule partie", m2.size, 1);

m2.joinGame(room.gameId, "P3", "s3", "sess-3"); // 4e joueur → partie pleine
check("4 joueurs assis", m2.getGame(room.gameId)!.players.length, 4);
expectThrow("Refus si partie pleine", () =>
  m2.joinGame(room.gameId, "P4", "s4", "sess-4")
);
check(
  "Code d'erreur GAME_FULL",
  (() => {
    try {
      m2.joinGame(room.gameId, "P4", "s4", "sess-4");
      return "aucune";
    } catch (e) {
      return e instanceof GameManagerError ? e.code : "autre";
    }
  })(),
  "GAME_FULL"
);

expectThrow("Refus si partie inexistante", () =>
  m2.joinGame("ZZZZ", "X", "sx", "sess-x")
);
check(
  "Code d'erreur GAME_NOT_FOUND",
  (() => {
    try {
      m2.joinGame("ZZZZ", "X", "sx", "sess-x");
      return "aucune";
    } catch (e) {
      return e instanceof GameManagerError ? e.code : "autre";
    }
  })(),
  "GAME_NOT_FOUND"
);

console.log("\n══════ removePlayer : réoccupation de siège + suppression ══════");
const m3 = new GameManager();
const r3 = m3.createGame("A", "a", "sess-a");
m3.joinGame(r3.gameId, "B", "b", "sess-b"); // siège 1
m3.joinGame(r3.gameId, "C", "c", "sess-c"); // siège 2
m3.removePlayer("b"); // libère le siège 1
check(
  "Sièges restants 0,2",
  m3.getGame(r3.gameId)!.players.map((p) => p.seat).sort(),
  [0, 2]
);
const dJoin = m3.joinGame(r3.gameId, "D", "d", "sess-d"); // doit reprendre le siège 1
check("Réoccupation du plus petit siège libre", dJoin.players.find((p) => p.socketId === "d")!.seat, 1);

console.log("\n══════ removePlayer : partie vidée → supprimée ══════");
const m4 = new GameManager();
const r4 = m4.createGame("Seul", "solo", "sess-solo");
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
const r6 = m6.createGame("Zoe", "z", "sess-z");
m6.joinGame(r6.gameId, "Yann", "y", "sess-y");
const pub = m6.publicPlayers(m6.getGame(r6.gameId)!);
check("Vue publique triée par siège, sans socketId", pub, [
  { seat: 0, pseudo: "Zoe" },
  { seat: 1, pseudo: "Yann" },
]);

console.log("\n══════ getGameBySocket / seatOf ══════");
const m7 = new GameManager();
const r7 = m7.createGame("S0", "sock0", "sess-s0");
m7.joinGame(r7.gameId, "S1", "sock1", "sess-s1");
check("getGameBySocket retrouve la partie", m7.getGameBySocket("sock1")?.gameId, r7.gameId);
check("seatOf du créateur = 0", m7.seatOf(r7, "sock0"), 0);
check("seatOf du second = 1", m7.seatOf(r7, "sock1"), 1);
check("getGameBySocket d'un inconnu = undefined", m7.getGameBySocket("inconnu"), undefined);
check("seatOf d'un inconnu = undefined", m7.seatOf(r7, "inconnu"), undefined);

console.log("\n══════ startGame : 4 joueurs requis, crée le GameState ══════");
const m8 = new GameManager();
const r8 = m8.createGame("A", "a", "sess-a8");
m8.joinGame(r8.gameId, "B", "b", "sess-b8");
m8.joinGame(r8.gameId, "C", "c", "sess-c8");
// Avec 3 joueurs : refus.
expectThrow("Refus de démarrer à 3 joueurs", () => m8.startGame(r8));
check("État de jeu toujours vide", r8.state, null);
check("Statut toujours waiting", r8.status, "waiting");
// Avec 4 joueurs : démarrage OK.
m8.joinGame(r8.gameId, "D", "d", "sess-d8");
m8.startGame(r8);
check("GameState créé après démarrage", r8.state !== null, true);
check("Statut passé à in-progress", r8.status, "in-progress");
check("GameState : 4 joueurs", r8.state!.playerCount, 4);
check("GameState : donne 0, phase bidding", r8.state!.round.phase, "bidding");

console.log("\n══════ joinGame : refus si partie déjà démarrée (join frais) ══════");
expectThrow("Refus de rejoindre une partie en cours", () =>
  m8.joinGame(r8.gameId, "Intrus", "sock-intrus", "sess-intrus")
);
check(
  "Code d'erreur GAME_IN_PROGRESS",
  (() => {
    try {
      m8.joinGame(r8.gameId, "Intrus", "sock-intrus", "sess-intrus");
      return "aucune";
    } catch (e) {
      return e instanceof GameManagerError ? e.code : "autre";
    }
  })(),
  "GAME_IN_PROGRESS"
);
check("Aucun siège attribué à l'intrus", m8.getGameBySocket("sock-intrus"), undefined);
check("Toujours 4 joueurs dans la partie", r8.players.length, 4);

console.log("\n══════ reconnect : non affecté par le garde GAME_IN_PROGRESS ══════");
const reco8 = m8.reconnect("sess-b8", "sock-b8-reco");
check("Reconnexion OK sur une partie en cours", reco8?.game.gameId, r8.gameId);
check("Reconnexion retrouve le bon siège", reco8?.seat, 1);
check("Reconnexion retrouve le bon pseudo", reco8?.pseudo, "B");

console.log("\n══════ handleDisconnect / reconnect : grace period ══════");
const m9 = new GameManager();
const r9 = m9.createGame("A", "sock-a", "sess-a9");
m9.joinGame(r9.gameId, "B", "sock-b", "sess-b9"); // siège 1

let expiredCalled = false;
m9.handleDisconnect("sock-b", () => {
  expiredCalled = true;
});

check("Le joueur reste dans la partie pendant la grace period", m9.getGame(r9.gameId)!.players.length, 2);
check("Le socket déconnecté n'est plus indexé", m9.getGameBySocket("sock-b"), undefined);
check("onExpire pas (encore) appelé", expiredCalled, false);

const reco = m9.reconnect("sess-b9", "sock-b2");
check("Reconnexion retrouve la bonne partie", reco?.game.gameId, r9.gameId);
check("Reconnexion retrouve le bon siège", reco?.seat, 1);
check("Reconnexion retrouve le bon pseudo", reco?.pseudo, "B");
check("getGameBySocket suit le nouveau socketId", m9.getGameBySocket("sock-b2")?.gameId, r9.gameId);
check("Toujours 2 joueurs après reconnexion", m9.getGame(r9.gameId)!.players.length, 2);

console.log("\n══════ reconnect : session inconnue ou expirée → null ══════");
check("Session inconnue → pas de reconnexion", m9.reconnect("session-fantome", "sock-x"), null);

console.log("\n══════ handleDisconnect : socket sans partie → no-op ══════");
const m10 = new GameManager();
let calledForUnknown = false;
m10.handleDisconnect("inconnu", () => {
  calledForUnknown = true;
});
check("Aucun callback pour un socket inconnu", calledForUnknown, false);

console.log("\n══════ addBotPlayers : mode solo de test ══════");
const m11 = new GameManager();
const r11 = m11.createGame("Solo", "sock-solo", "sess-solo11");
m11.addBotPlayers(r11);
check("4 sièges occupés après ajout des bots", r11.players.length, 4);
check(
  "Sièges 1,2,3 occupés par des bots",
  r11.players.filter((p) => p.isBot).map((p) => p.seat),
  [1, 2, 3]
);
check(
  "Pseudos des bots",
  r11.players.filter((p) => p.isBot).map((p) => p.pseudo),
  ["Bot 1", "Bot 2", "Bot 3"]
);
check("Le créateur n'est pas marqué bot", r11.players[0].isBot, undefined);
check(
  "Les bots ne sont indexés dans aucune session/socket connu",
  r11.players.filter((p) => p.isBot).every((p) => m11.getGameBySocket(p.socketId) === undefined),
  true
);
m11.startGame(r11); // 4 sièges occupés → démarrage normal, sans modification de startGame()
check("GameState créé avec bots", r11.state !== null, true);
check("Statut passé à in-progress", r11.status, "in-progress");

console.log("\n══════ addBotPlayers : ne remplit que les sièges libres ══════");
const m12 = new GameManager();
const r12 = m12.createGame("A", "sock-a12", "sess-a12");
m12.joinGame(r12.gameId, "B", "sock-b12", "sess-b12"); // siège 1 déjà pris
m12.addBotPlayers(r12);
check("4 joueurs au total", r12.players.length, 4);
check(
  "Seuls les sièges 2 et 3 reçoivent un bot",
  r12.players.filter((p) => p.isBot).map((p) => p.seat),
  [2, 3]
);
