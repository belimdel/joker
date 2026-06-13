// ─── Harnais de non-régression CÔTÉ SERVEUR ─────────────────────
// Équivalent de shared/run-all-tests.ts, mais pour les *.test.ts du
// dossier server/src/. Chaque test tourne dans son propre process (via
// `npx tsx`) pour isoler les crashs, avec un résumé fichier par fichier.
//
// NB : les scripts d'intégration qui ont besoin d'un serveur lancé
// (test-client.ts, test-game-client.ts) ne sont PAS des *.test.ts et
// ne sont donc pas ramassés ici — ils se lancent à la main.
//
// Lancement (depuis la racine) :
//   npx tsx server/src/run-server-tests.ts
import { readdirSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));

const testFiles = readdirSync(here)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

function extractExpected(raw: string): string {
  const s = raw.trim();
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    return end >= 0 ? s.slice(0, end + 1) : s;
  }
  const comma = s.indexOf(",");
  return comma >= 0 ? s.slice(0, comma) : s;
}

const norm = (s: string): string => s.replace(/\s+/g, "");

type Result = { file: string; ok: boolean; detail: string };
const results: Result[] = [];
const attenduRe = /\(attendu\s+([^)]+)\)\s*:\s*(.+)$/;

for (const file of testFiles) {
  const full = join(here, file);
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

  console.log("\n" + "═".repeat(64));
  console.log("▶ " + file);
  console.log("═".repeat(64));
  console.log(output.trimEnd());

  const reasons: string[] = [];
  if (crashed) reasons.push(`crash (code ${exitCode})`);

  const lines = output.split(/\r?\n/);
  const markers = lines.filter((l) => l.includes("FAIL") || l.includes("ÉCHEC"));
  if (markers.length > 0) reasons.push(`${markers.length} marqueur(s) FAIL/ÉCHEC`);

  let checked = 0;
  const mismatches: string[] = [];
  for (const l of lines) {
    const m = l.match(attenduRe);
    if (!m) continue;
    checked++;
    if (norm(extractExpected(m[1])) !== norm(m[2])) mismatches.push(l.trim());
  }
  if (mismatches.length > 0) {
    reasons.push(`${mismatches.length} non-conformité(s) : ${mismatches.join(" | ")}`);
  }
  checked += lines.filter((l) => l.includes("✅")).length;

  const ok = reasons.length === 0;
  results.push({
    file,
    ok,
    detail: ok
      ? `OK${checked > 0 ? ` (${checked} assertion(s) « attendu » vérifiée(s))` : ""}`
      : reasons.join(" ; "),
  });
}

console.log("\n" + "═".repeat(64));
console.log("RÉSUMÉ SERVEUR");
console.log("═".repeat(64));
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"}  ${r.file.padEnd(26)} ${r.detail}`);
}
const failed = results.filter((r) => !r.ok);
console.log("─".repeat(64));
console.log(
  `${results.length} fichier(s) — ${results.length - failed.length} OK, ${failed.length} en échec.`
);

process.exit(failed.length === 0 ? 0 : 1);
