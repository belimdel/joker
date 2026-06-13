// ─── Mini-utilitaires de test partagés ──────────────────────────
// Juste assez pour nos tests maison lancés via `npx tsx`. En cas
// d'échec, on écrit le marqueur "FAIL" dans la sortie pour que le
// harnais global (run-all-tests.ts) le détecte. On reste minimal.

// Assertion de valeur. Égalité « profonde » suffisante ici : on compare
// les sérialisations JSON des deux côtés (couvre nombres, chaînes,
// booléens, tableaux et objets simples).
export function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`✅ ${label}`);
  } else {
    console.log(`❌ FAIL — ${label} — attendu ${e}, obtenu ${a}`);
  }
}

// Le bloc DOIT lever une erreur (garde-fou, coup illégal, etc.).
export function expectThrow(label: string, fn: () => unknown): void {
  try {
    fn();
    console.log(`❌ FAIL — ${label} : aucune erreur alors qu'une était attendue`);
  } catch (e) {
    console.log(`✅ ${label} (erreur attendue) — ${(e as Error).message}`);
  }
}

// Le bloc NE DOIT PAS lever d'erreur (coup légal).
export function expectOk(label: string, fn: () => unknown): void {
  try {
    fn();
    console.log(`✅ ${label}`);
  } catch (e) {
    console.log(`❌ FAIL — ${label} — erreur inattendue : ${(e as Error).message}`);
  }
}
