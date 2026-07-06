import { Router } from 'express';
import { sql, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, games, gamePlayers } from '../db/schema.js';
import { levelForXp, xpProgress } from '../../../shared/progression.js';

export const statsRouter = Router();

// ── GET /api/users/:username/stats ──────────────────────────────────
statsRouter.get('/users/:username/stats', async (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Base de données non disponible.' });
    return;
  }

  const { username } = req.params;

  // Récupérer l'utilisateur.
  const [user] = await db
    .select({ id: users.id, username: users.username, xp: users.xp })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  if (!user) {
    res.status(404).json({ error: 'Joueur introuvable.' });
    return;
  }

  // Agréger les stats (parties ranked uniquement).
  const [stats] = await db
    .select({
      gamesPlayed:    sql<number>`count(${gamePlayers.gameId})::int`,
      wins:           sql<number>`count(case when ${gamePlayers.finalPosition} = 1 then 1 end)::int`,
      contractsMade:  sql<number>`coalesce(sum(${gamePlayers.contractsMade}), 0)::int`,
      contractsTotal: sql<number>`coalesce(sum(${gamePlayers.contractsTotal}), 0)::int`,
      xishts:         sql<number>`coalesce(sum(${gamePlayers.xishts}), 0)::int`,
      bestScore:      sql<number>`coalesce(max(${gamePlayers.finalScore}), 0)::int`,
      avgPosition:    sql<number>`coalesce(avg(${gamePlayers.finalPosition}), 0)::float`,
      totalXpAwarded: sql<number>`coalesce(sum(${gamePlayers.xpAwarded}), 0)::int`,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(gamePlayers.gameId, games.id))
    .where(sql`${gamePlayers.userId} = ${user.id} and ${games.ranked} = true`);

  const progress = xpProgress(user.xp);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      xp: user.xp,
      level: levelForXp(user.xp),
    },
    stats: {
      gamesPlayed:    stats.gamesPlayed,
      wins:           stats.wins,
      winRate:        stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0,
      contractsMade:  stats.contractsMade,
      contractsTotal: stats.contractsTotal,
      contractRate:   stats.contractsTotal > 0
        ? Math.round((stats.contractsMade / stats.contractsTotal) * 100)
        : 0,
      xishts:         stats.xishts,
      bestScore:      stats.bestScore,
      avgPosition:    stats.gamesPlayed > 0 ? Math.round(stats.avgPosition * 10) / 10 : null,
    },
    progression: {
      level:          progress.level,
      currentLevelXp: progress.currentLevelXp,
      nextLevelXp:    progress.nextLevelXp,
      totalXp:        user.xp,
    },
  });
});

// ── GET /api/leaderboard ────────────────────────────────────────────
statsRouter.get('/leaderboard', async (_req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Base de données non disponible.' });
    return;
  }

  const now = new Date();
  const season = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const rows = await db
    .select({
      username:    users.username,
      xp:          users.xp,
      points:      sql<number>`coalesce(sum(${gamePlayers.rankingPoints}), 0)::int`,
      gamesPlayed: sql<number>`count(distinct ${gamePlayers.gameId})::int`,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(gamePlayers.gameId, games.id))
    .innerJoin(users, eq(gamePlayers.userId, users.id))
    .where(sql`
      ${games.ranked} = true
      and ${games.finishedAt} >= ${monthStart}
      and ${games.finishedAt} < ${monthEnd}
    `)
    .groupBy(users.id, users.username, users.xp)
    .orderBy(sql`sum(${gamePlayers.rankingPoints}) desc`)
    .limit(50);

  // Calcul du rang (ex æquo = même rang).
  let rank = 1;
  const entries = rows.map((row, i) => {
    if (i > 0 && row.points < rows[i - 1].points) rank = i + 1;
    return {
      rank,
      username:    row.username,
      level:       levelForXp(row.xp),
      points:      row.points,
      gamesPlayed: row.gamesPlayed,
    };
  });

  res.json({ season, entries });
});
