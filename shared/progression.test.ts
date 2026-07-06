import {
  xpForGame,
  xpRequiredForLevel,
  levelForXp,
  xpProgress,
  rankingPointsForPosition,
  computeFinalPositions,
} from './progression.js';

let passed = 0;
let failed = 0;

function eq<T>(label: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`✅ ${label}`);
    passed++;
  } else {
    console.log(`❌ FAIL ${label} — attendu ${e}, obtenu ${a}`);
    failed++;
  }
}

// ── xpRequiredForLevel ─────────────────────────────────────────────
eq('xpRequiredForLevel(1) = 0', xpRequiredForLevel(1), 0);
eq('xpRequiredForLevel(2) = 100', xpRequiredForLevel(2), 100);
eq('xpRequiredForLevel(3) = 300', xpRequiredForLevel(3), 300);
eq('xpRequiredForLevel(4) = 600', xpRequiredForLevel(4), 600);
eq('xpRequiredForLevel(5) = 1000', xpRequiredForLevel(5), 1000);

// ── levelForXp ────────────────────────────────────────────────────
eq('levelForXp(0) = 1', levelForXp(0), 1);
eq('levelForXp(99) = 1', levelForXp(99), 1);
eq('levelForXp(100) = 2', levelForXp(100), 2);
eq('levelForXp(299) = 2', levelForXp(299), 2);
eq('levelForXp(300) = 3', levelForXp(300), 3);
eq('levelForXp(599) = 3', levelForXp(599), 3);
eq('levelForXp(600) = 4', levelForXp(600), 4);

// ── xpProgress ────────────────────────────────────────────────────
eq('xpProgress(0)', xpProgress(0), { level: 1, currentLevelXp: 0, nextLevelXp: 100 });
eq('xpProgress(100)', xpProgress(100), { level: 2, currentLevelXp: 0, nextLevelXp: 200 });
eq('xpProgress(150)', xpProgress(150), { level: 2, currentLevelXp: 50, nextLevelXp: 200 });
eq('xpProgress(300)', xpProgress(300), { level: 3, currentLevelXp: 0, nextLevelXp: 300 });

// ── rankingPointsForPosition ───────────────────────────────────────
eq('rankingPoints(1) = 30', rankingPointsForPosition(1), 30);
eq('rankingPoints(2) = 15', rankingPointsForPosition(2), 15);
eq('rankingPoints(3) = 5', rankingPointsForPosition(3), 5);
eq('rankingPoints(4) = 0', rankingPointsForPosition(4), 0);

// ── computeFinalPositions ─────────────────────────────────────────
eq('classement normal', computeFinalPositions([100, 200, 300, 400]), [4, 3, 2, 1]);
eq('ex æquo 1,1,3,4', computeFinalPositions([200, 150, 200, 100]), [1, 3, 1, 4]);
eq('ex æquo 1,1,1,4', computeFinalPositions([200, 200, 200, 100]), [1, 1, 1, 4]);
eq('quadruple ex æquo', computeFinalPositions([150, 150, 150, 150]), [1, 1, 1, 1]);
eq('ex æquo 2,3', computeFinalPositions([400, 100, 100, 50]), [1, 2, 2, 4]);

// ── xpForGame ─────────────────────────────────────────────────────
eq('xpForGame 1er, 5 contrats', xpForGame(1, 5, 0), 200); // 50+100+50
eq('xpForGame 2e, 3 contrats', xpForGame(2, 3, 1), 80);   // 50+0+30
eq('xpForGame 4e, 0 contrats', xpForGame(4, 0, 0), 50);   // 50+0+0
eq('xpForGame 1er, 0 contrats', xpForGame(1, 0, 5), 150); // 50+100+0

console.log(`\n${passed} OK, ${failed} échec(s).`);
if (failed > 0) process.exit(1);
