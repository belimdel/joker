// Formules pures V5 : XP, niveaux, points de classement.
// Importé côté serveur (gameResults) et côté client (profil).
// ⚠️ Ce fichier NE doit JAMAIS importer Drizzle, pg, ni quoi que ce soit de serveur.

export function xpForGame(position: number, contractsMade: number, _xishts: number): number {
  return 50 + (position === 1 ? 100 : 0) + contractsMade * 10;
}

// Cumul XP requis pour ATTEINDRE le niveau n (niveau 1 = 0 XP).
export function xpRequiredForLevel(n: number): number {
  return 100 * n * (n - 1) / 2;
}

// Plus grand n tel que xpRequiredForLevel(n) <= xp.
export function levelForXp(xp: number): number {
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= xp) level++;
  return level;
}

export type XpProgress = {
  level: number;
  currentLevelXp: number; // XP accumulé dans le niveau actuel
  nextLevelXp: number;    // XP total requis pour atteindre le niveau suivant (relatif au début du niveau)
};

export function xpProgress(xp: number): XpProgress {
  const level = levelForXp(xp);
  const currentLevelStart = xpRequiredForLevel(level);
  const nextLevelStart = xpRequiredForLevel(level + 1);
  return {
    level,
    currentLevelXp: xp - currentLevelStart,
    nextLevelXp: nextLevelStart - currentLevelStart,
  };
}

export function rankingPointsForPosition(position: number): number {
  if (position === 1) return 30;
  if (position === 2) return 15;
  if (position === 3) return 5;
  return 0;
}

// Calcule la position finale (1-4) de chaque siège d'après les scores bruts.
// Ex æquo : même position, la suivante saute (ex : [200,150,200,100] → [1,3,1,4]).
export function computeFinalPositions(scores: number[]): number[] {
  return scores.map((score) => {
    let rank = 1;
    for (const other of scores) {
      if (other > score) rank++;
    }
    return rank;
  });
}
