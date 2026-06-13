// ─── Harnais de non-régression global ───────────────────────────
// Lance séquentiellement TOUS les fichiers *.test.ts du dossier shared/
// (chacun dans son propre process, via `npx tsx`, pour isoler les
// crashs) et affiche un résumé clair fichier par fichier.
//
// Un fichier est considéré EN ÉCHEC si :
//   • son process plante (code de sortie ≠ 0 : crash, erreur de compil,
//     exception non rattrapée) ; ou
//   • sa sortie contient un marqueur d'échec posé par le test
//     ("FAIL" ou "ÉCHEC") ; ou
//   • une ligne « (attendu X) : Y » présente X ≠ Y (vérification auto).
//
// Lancement (depuis la racine du projet) :
//   npx tsx shared/run-all-tests.ts
import { readdirSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Dossier de CE script (= shared/), quelle que soit la racine d'appel.
const sharedDir = dirname(fileURLToPath(import.meta.url));

// Tous les fichiers de test, triés (ordre déterministe).
const testFiles = readdirSync(sharedDir)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

// ─── Extraction de la valeur attendue d'une annotation « attendu … » ─
// "[0,2,3]"      → "[0,2,3]"        (tableau : on prend jusqu'au ])
// "30, pas 400"  → "30"            (prose : on prend jusqu'à la 1re ,)
// "false"        → "false"
function extractExpected(raw: string): string {
  const s = raw.trim();
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    return end >= 0 ? s.slice(0, end + 1) : s;
  }
  const comma = s.indexOf(",");
  return comma >= 0 ? s.slice(0, comma) : s;
}

// Compare en ignorant les espaces ("[ 0, 2, 3 ]" === "[0,2,3]").
const norm = (s: string): string => s.replace(/\s+/g, "");

type Result = { file: string; ok: boolean; detail: string };
const results: Result[] = [];

// Motif « ... (attendu <E>) : <A> » (pour les tests à sortie visuelle).
const attenduRe = /\(attendu\s+([^)]+)\)\s*:\s*(.+)$/;

for (const file of testFiles) {
  const full = join(sharedDir, file);

  let output = "";
  let crashed = false;
  let exitCode = 0;

  try {
    output = execSync(`npx tsx "${full}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    crashed = true;
    const err = e as { status?: number; stdout?: string; stderr?: string };
    exitCode = err.status ?? 1;
    output = (err.stdout ?? "") + (err.stderr ?? "");
  }

  // Affiche la sortie complète du fichier.
  console.log("\n" + "═".repeat(64));
  console.log("▶ " + file);
  console.log("═".repeat(64));
  console.log(output.trimEnd());

  // ── Analyse ──
  const reasons: string[] = [];
  if (crashed) reasons.push(`crash (code ${exitCode})`);

  const lines = output.split(/\r?\n/);

  // Marqueurs d'échec explicites posés par les tests eux-mêmes.
  const markers = lines.filter((l) => l.includes("FAIL") || l.includes("ÉCHEC"));
  if (markers.length > 0) {
    reasons.push(`${markers.length} marqueur(s) FAIL/ÉCHEC`);
  }

  // Vérification automatique des lignes « (attendu X) : Y »
  // (tests à sortie visuelle : bidding, scoring, trick, trick.joker).
  let checked = 0;
  const mismatches: string[] = [];
  for (const l of lines) {
    const m = l.match(attenduRe);
    if (!m) continue;
    checked++;
    const expected = norm(extractExpected(m[1]));
    const actual = norm(m[2]);
    if (expected !== actual) mismatches.push(l.trim());
  }

  // Assertions du helper partagé check()/expectOk/expectThrow : chaque
  // succès imprime une ligne « ✅ … » (les échecs portent déjà « FAIL »).
  checked += lines.filter((l) => l.includes("✅")).length;
  if (mismatches.length > 0) {
    reasons.push(
      `${mismatches.length} non-conformité(s) attendu≠obtenu : ${mismatches.join(" | ")}`
    );
  }

  const ok = reasons.length === 0;
  results.push({
    file,
    ok,
    detail: ok
      ? `OK${checked > 0 ? ` (${checked} assertion(s) « attendu » vérifiée(s))` : " (pas de crash, aucun marqueur d'échec)"}`
      : reasons.join(" ; "),
  });
}

// ─── Résumé global ──────────────────────────────────────────────
console.log("\n" + "═".repeat(64));
console.log("RÉSUMÉ GLOBAL");
console.log("═".repeat(64));
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"}  ${r.file.padEnd(24)} ${r.detail}`);
}
const failed = results.filter((r) => !r.ok);
console.log("─".repeat(64));
console.log(
  `${results.length} fichier(s) — ${results.length - failed.length} OK, ${failed.length} en échec.`
);

process.exit(failed.length === 0 ? 0 : 1);
