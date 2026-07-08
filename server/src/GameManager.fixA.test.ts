// ─── Tests FIX A : unicité d'identité, verrou « partie en cours », quitter ──
// Couvre les nouveaux comportements du GameManager introduits par FIX A :
//  • joinGame RATTACHE au lieu de dupliquer un siège pour la même identité ;
//  • activeGameFor détecte le verrou (partie démarrée non terminée) ;
//  • leaveGame libère (lobby) ou garde le siège (partie démarrée) ;
//  • resumeBySession fait revenir un joueur parti ;
//  • identité STRICTE : un siège de compte ne se reprend/reconnecte qu'avec
//    le bon userId (un navigateur seul ne prouve pas l'identité), et un
//    compte retrouve sa partie même avec un sessionId tout neuf.
import { GameManager, GameManagerError } from "./GameManager";
import { check, expectThrow } from "../../shared/test-utils";

// ── Unicité d'identité INVITÉ : même sessionId → rattachement, jamais 2 sièges ──
console.log("══════ joinGame : rattachement par sessionId (invité) ══════");
const m = new GameManager();
const g = m.createGame("Hôte", "sock-h", "sess-h");
m.joinGame(g.gameId, "Bob", "sock-b1", "sess-b"); // siège 1
check("2 sièges après un vrai join", m.getGame(g.gameId)!.players.length, 2);
// Même sessionId qui « rejoint » à nouveau (2e onglet / re-join après refresh).
m.joinGame(g.gameId, "Bob", "sock-b2", "sess-b");
check("Toujours 2 sièges (rattachement, pas de doublon)", m.getGame(g.gameId)!.players.length, 2);
check("Le socket suit le siège rattaché", m.getGameBySocket("sock-b2")?.gameId, g.gameId);
check("L'ancien socket est désindexé", m.getGameBySocket("sock-b1"), undefined);
check("Le siège rattaché est inchangé", m.seatOf(m.getGame(g.gameId)!, "sock-b2"), 1);

// ── Unicité d'identité COMPTE : même userId, sessionId différents → rattachement ──
console.log("\n══════ joinGame : rattachement par userId (compte) ══════");
const m2 = new GameManager();
const g2 = m2.createGame("Hôte", "sock-h2", "sess-h2", "user-host");
m2.joinGame(g2.gameId, "Alice", "sock-a1", "sess-a1", "user-alice"); // siège 1
// Même compte depuis un AUTRE navigateur (sessionId distinct) → rattachement.
m2.joinGame(g2.gameId, "Alice", "sock-a2", "sess-a2", "user-alice");
check("Toujours 2 sièges (même compte)", m2.getGame(g2.gameId)!.players.length, 2);
check("Le nouveau socket est rattaché", m2.getGameBySocket("sock-a2")?.gameId, g2.gameId);

// ── Scénario absurde : impossible d'occuper 4 sièges avec la même personne ──
console.log("\n══════ Scénario absurde : 4 sièges même identité impossible ══════");
const m3 = new GameManager();
const g3 = m3.createGame("Moi", "s1", "sess-moi");
m3.joinGame(g3.gameId, "Moi", "s2", "sess-moi");
m3.joinGame(g3.gameId, "Moi", "s3", "sess-moi");
m3.joinGame(g3.gameId, "Moi", "s4", "sess-moi");
check("Un seul siège pour la même identité", m3.getGame(g3.gameId)!.players.length, 1);

// ── Verrou « partie en cours » ──
console.log("\n══════ activeGameFor : verrou partie démarrée ══════");
const m4 = new GameManager();
const g4 = m4.createGame("A", "a", "sess-a", "user-a");
m4.joinGame(g4.gameId, "B", "b", "sess-b", "user-b");
m4.joinGame(g4.gameId, "C", "c", "sess-c", "user-c");
m4.joinGame(g4.gameId, "D", "d", "sess-d", "user-d");
check("Pas de verrou tant que la partie est en lobby", m4.activeGameFor("user-a", "sess-a"), null);
m4.startGame(g4);
check("Verrou actif après démarrage", m4.activeGameFor("user-a", "sess-a")?.gameId, g4.gameId);
check("Verrou par userId (compte), sessionId ignoré", m4.activeGameFor("user-b", "autre-sess")?.gameId, g4.gameId);
check("Aucun verrou pour une identité étrangère", m4.activeGameFor("user-x", "sess-x"), null);

// Verrou par sessionId de partie pour un INVITÉ (userId null).
const m4b = new GameManager();
const g4b = m4b.createGame("Invité", "gi", "sess-invite"); // pas de userId
m4b.joinGame(g4b.gameId, "B", "gb", "sess-gb");
m4b.joinGame(g4b.gameId, "C", "gc", "sess-gc");
m4b.joinGame(g4b.gameId, "D", "gd", "sess-gd");
m4b.startGame(g4b);
check("Verrou invité par sessionId", m4b.activeGameFor(null, "sess-invite")?.gameId, g4b.gameId);
// Fin de partie → le verrou tombe.
g4.state = { ...g4.state!, phase: "finished" };
check("Verrou levé quand la partie est terminée", m4.activeGameFor("user-a", "sess-a"), null);

// ── leaveGame en LOBBY : libère le siège ──
console.log("\n══════ leaveGame : lobby libère le siège ══════");
const m5 = new GameManager();
const g5 = m5.createGame("A", "a5", "sess-a5");
m5.joinGame(g5.gameId, "B", "b5", "sess-b5");
const r5 = m5.leaveGame("b5");
check("keepsSeat=false en lobby", r5.keepsSeat, false);
check("Siège libéré (1 joueur restant)", m5.getGame(g5.gameId)!.players.length, 1);
check("Socket désindexé après leaveGame", m5.getGameBySocket("b5"), undefined);
// Dernier joueur quitte → partie détruite.
const r5b = m5.leaveGame("a5");
check("Partie détruite quand elle devient vide", r5b.deleted, true);
check("Plus aucune partie", m5.size, 0);

// ── leaveGame en PARTIE DÉMARRÉE : garde le siège + marque parti ──
console.log("\n══════ leaveGame : partie démarrée garde le siège ══════");
const m6 = new GameManager();
const g6 = m6.createGame("A", "a6", "sess-a6", "user-a6");
m6.joinGame(g6.gameId, "B", "b6", "sess-b6", "user-b6");
m6.joinGame(g6.gameId, "C", "c6", "sess-c6", "user-c6");
m6.joinGame(g6.gameId, "D", "d6", "sess-d6", "user-d6");
m6.startGame(g6);
const r6 = m6.leaveGame("b6");
check("keepsSeat=true en partie démarrée", r6.keepsSeat, true);
check("Le siège reste occupé (4 joueurs)", m6.getGame(g6.gameId)!.players.length, 4);
check("Le joueur parti est marqué leftAt", m6.getGame(g6.gameId)!.players.find(p => p.seat === 1)!.leftAt !== null, true);
check("Verrou toujours actif après avoir quitté", m6.activeGameFor("user-b6", "sess-b6")?.gameId, g6.gameId);
// Retour via resumeBySession : le siège appartient au COMPTE user-b6, il
// faut donc fournir le bon userId (identité stricte).
const resumed = m6.resumeBySession("sess-b6", "b6-new", "user-b6");
check("resumeBySession retrouve la partie", resumed?.game.gameId, g6.gameId);
check("resumeBySession retrouve le siège", resumed?.seat, 1);
check("leftAt effacé au retour", m6.getGame(g6.gameId)!.players.find(p => p.seat === 1)!.leftAt, null);
check("Socket re-mappé après retour", m6.getGameBySocket("b6-new")?.gameId, g6.gameId);

// ── Identité stricte : reprise/reconnexion d'un siège de compte ──
console.log("\n══════ Identité stricte : compte requis pour reprendre le siège ══════");
// Le même navigateur (sess-b6) SANS le compte (logout) ne reprend pas le siège.
check("resumeBySession refusé sans le compte (invité)", m6.resumeBySession("sess-b6", "b6-x"), null);
// Ni avec un AUTRE compte connecté sur ce navigateur.
check("resumeBySession refusé avec un autre compte", m6.resumeBySession("sess-b6", "b6-y", "user-intrus")?.game.gameId, undefined);
// En revanche le compte retrouve sa partie avec un sessionId TOUT NEUF
// (re-login, autre appareil) : reprise par userId.
m6.leaveGame("b6-new"); // reparti (leftAt posé)
const resumed2 = m6.resumeBySession("sess-b6-fresh", "b6-fresh", "user-b6");
check("Reprise par compte avec session neuve", resumed2?.game.gameId, g6.gameId);
check("Reprise par compte : bon siège", resumed2?.seat, 1);
check("Le nouveau socket est mappé", m6.getGameBySocket("b6-fresh")?.gameId, g6.gameId);
// reconnect (reconnexion silencieuse) applique la même règle : le siège du
// compte user-d6 n'est pas restauré pour un invité ou un autre compte.
m6.handleDisconnect("d6", () => {});
check("reconnect refusé sans le compte", m6.reconnect("sess-d6", "d6-x"), null);
check("reconnect refusé avec un autre compte", m6.reconnect("sess-d6", "d6-y", "user-intrus"), null);
const reco6 = m6.reconnect("sess-d6", "d6-new", "user-d6");
check("reconnect OK avec le bon compte", reco6?.game.gameId, g6.gameId);
check("reconnect OK : bon siège", reco6?.seat, 3);

// ── Rejoindre sa PROPRE partie démarrée par joinGame = rattachement ──
console.log("\n══════ joinGame : rattachement autorisé sur partie démarrée ══════");
const m7 = new GameManager();
const g7 = m7.createGame("A", "a7", "sess-a7", "user-a7");
m7.joinGame(g7.gameId, "B", "b7", "sess-b7", "user-b7");
m7.joinGame(g7.gameId, "C", "c7", "sess-c7", "user-c7");
m7.joinGame(g7.gameId, "D", "d7", "sess-d7", "user-d7");
m7.startGame(g7);
// Un ÉTRANGER ne peut pas rejoindre une partie démarrée.
expectThrow("Étranger refusé sur partie démarrée", () =>
  m7.joinGame(g7.gameId, "X", "x7", "sess-x7", "user-x7"),
);
check("Code GAME_IN_PROGRESS", (() => {
  try { m7.joinGame(g7.gameId, "X", "x7", "sess-x7", "user-x7"); return "aucune"; }
  catch (e) { return e instanceof GameManagerError ? e.code : "autre"; }
})(), "GAME_IN_PROGRESS");
// Mais le joueur B (déjà assis) est rattaché sans erreur ni doublon.
m7.joinGame(g7.gameId, "B", "b7-bis", "sess-b7", "user-b7");
check("Rattachement de B sans doublon", m7.getGame(g7.gameId)!.players.length, 4);
check("B suit son nouveau socket", m7.getGameBySocket("b7-bis")?.gameId, g7.gameId);

console.log("\n✅ FIX A : tous les scénarios vérifiés.");
