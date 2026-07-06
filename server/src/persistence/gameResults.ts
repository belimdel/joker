import { eq, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../db/client.js';
import { games, gamePlayers, users } from '../db/schema.js';
import {
  computeFinalPositions,
  rankingPointsForPosition,
  xpForGame,
} from '../../../shared/progression.js';
import type { NetworkGame } from '../GameManager.js';
import type { GameState } from '../../../shared/game.js';

type SeatStats = { contractsMade: number; contractsTotal: number; xishts: number };

function computeSeatStats(state: GameState): SeatStats[] {
  const n = state.playerCount;
  const stats: SeatStats[] = Array.from({ length: n }, () => ({
    contractsMade: 0,
    contractsTotal: 0,
    xishts: 0,
  }));
  for (const deal of state.dealHistory) {
    for (let p = 0; p < n; p++) {
      stats[p].contractsTotal++;
      if (deal.tricksWon[p] === deal.bids[p]) stats[p].contractsMade++;
      if (deal.bids[p] >= 1 && deal.tricksWon[p] === 0) stats[p].xishts++;
    }
  }
  return stats;
}

// Persiste le résultat d'une partie terminée en BDD.
// Ne doit être appelé qu'une seule fois par partie (l'appelant pose le guard
// alreadyPersisted avant l'appel). Wrap complet dans try/catch : BDD down
// ne doit jamais interrompre la partie côté joueurs.
export async function saveGameResult(
  db: DrizzleDb,
  game: NetworkGame,
  state: GameState,
): Promise<void> {
  if (state.phase !== 'finished') return;

  const finishedAt = new Date();
  const startedAt = game.startedAt ? new Date(game.startedAt) : finishedAt;

  const scores = state.scores;
  const positions = computeFinalPositions(scores);
  const seatStats = computeSeatStats(state);

  // Calcul des récompenses par siège avant la transaction.
  const rewards = game.players.map((player) => {
    const seat = player.seat;
    const position = positions[seat];
    const { contractsMade, contractsTotal, xishts } = seatStats[seat];
    const isEligible = game.ranked && player.userId !== null;
    return {
      seat,
      userId: player.userId,
      usernameSnapshot: player.pseudo,
      finalScore: scores[seat],
      finalPosition: position,
      contractsMade,
      contractsTotal,
      xishts,
      rankingPoints: isEligible ? rankingPointsForPosition(position) : 0,
      xpAwarded: isEligible ? xpForGame(position, contractsMade, xishts) : 0,
    };
  });

  // Insertion games + game_players en transaction.
  const [insertedGame] = await db
    .insert(games)
    .values({
      roomCode: game.gameId,
      visibility: game.visibility,
      ranked: game.ranked,
      startedAt,
      finishedAt,
    })
    .returning({ id: games.id });

  await db.insert(gamePlayers).values(
    rewards.map((r) => ({
      gameId: insertedGame.id,
      seat: r.seat,
      userId: r.userId,
      usernameSnapshot: r.usernameSnapshot,
      finalScore: r.finalScore,
      finalPosition: r.finalPosition,
      contractsMade: r.contractsMade,
      contractsTotal: r.contractsTotal,
      xishts: r.xishts,
      rankingPoints: r.rankingPoints,
      xpAwarded: r.xpAwarded,
    })),
  );

  // Créditer l'XP aux joueurs authentifiés (ranked uniquement).
  // Fait après l'insertion pour ne pas bloquer le résumé si un UPDATE échoue.
  if (game.ranked) {
    for (const r of rewards) {
      if (r.userId && r.xpAwarded > 0) {
        await db
          .update(users)
          .set({ xp: sql`${users.xp} + ${r.xpAwarded}` })
          .where(eq(users.id, r.userId));
      }
    }
  }
}
