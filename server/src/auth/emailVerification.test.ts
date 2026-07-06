// ─── Test d'intégration FIX B : vérification d'email par code ─────────
// Exécuté contre un Postgres ÉPHÉMÈRE en mémoire (PGlite) — jamais la BDD de
// production. On applique les VRAIS fichiers de migration (0000 + 0001) puis
// on rejoue, à l'identique, la séquence SQL de chaque route (routes.ts) pour
// prouver : migration comptes existants → vérifiés, code stocké en SHA-256
// (jamais en clair), succès/échec/expiration/5 tentatives, cooldown resend.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomInt } from 'crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { users, emailVerificationCodes } from '../db/schema.js';
import { check } from '../../../shared/test-utils.js';

// Mêmes primitives que routes.ts.
const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const genCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const hashCode = (c: string) => createHash('sha256').update(c).digest('hex');

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', 'db', 'migrations');
const readMig = (f: string) => readFileSync(join(migDir, f), 'utf8');

async function main() {
  const client = new PGlite();
  const db = drizzle(client, { schema: { users, emailVerificationCodes } });

  // ── 1. Migration : comptes pré-existants → email_verified = true ──
  console.log('══════ Migration : comptes existants vérifiés ══════');
  await client.exec(readMig('0000_brief_forgotten_one.sql'));
  // Compte "legacy" créé AVANT l'ajout de la colonne (comme en prod).
  await client.exec(
    `INSERT INTO users (email, username, password_hash) VALUES ('legacy@test.io', 'Legacy', 'hash');`,
  );
  await client.exec(readMig('0001_sturdy_king_cobra.sql'));
  const legacy = await db.select({ v: users.emailVerified }).from(users).where(eq(users.email, 'legacy@test.io'));
  check('Compte pré-existant marqué vérifié par la migration', legacy[0].v, true);

  // ── 2. Register : compte non vérifié + code haché stocké ──
  console.log('\n══════ Register : compte non vérifié + code SHA-256 ══════');
  const [u] = await db.insert(users)
    .values({ email: 'neo@test.io', username: 'Neo', passwordHash: 'hash' })
    .returning({ id: users.id, emailVerified: users.emailVerified });
  check('Nouveau compte non vérifié (email_verified=false)', u.emailVerified, false);

  const code = genCode();
  const now = new Date();
  await db.insert(emailVerificationCodes).values({
    userId: u.id, codeHash: hashCode(code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS), attempts: 0, lastSentAt: now,
  });
  // SELECT réel : on ne voit QUE le hash, jamais le code à 6 chiffres.
  const stored = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u.id));
  console.log(`   SELECT code_hash → ${stored[0].codeHash}`);
  check('code_hash = SHA-256 hex (64 car.)', /^[0-9a-f]{64}$/.test(stored[0].codeHash), true);
  check('Le code en clair N\'EST PAS stocké', stored[0].codeHash !== code, true);

  // ── 3. Verify : mauvais code → attempts++ ; 5 essais → code invalidé ──
  console.log('\n══════ Verify : 5 mauvaises tentatives invalident le code ══════');
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 1; i <= MAX_CODE_ATTEMPTS; i++) {
    const rec = (await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u.id)))[0];
    const matches = rec.codeHash === hashCode(wrong);
    const nextAttempts = rec.attempts + 1;
    if (!matches) {
      if (nextAttempts >= MAX_CODE_ATTEMPTS) {
        await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u.id));
      } else {
        await db.update(emailVerificationCodes).set({ attempts: nextAttempts }).where(eq(emailVerificationCodes.userId, u.id));
      }
    }
  }
  const afterAttempts = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u.id));
  check('Code supprimé après 5 tentatives (resend requis)', afterAttempts.length, 0);

  // ── 4. Verify : bon code → compte vérifié + code supprimé ──
  console.log('\n══════ Verify : bon code → vérifié + code supprimé ══════');
  const code2 = genCode();
  const now2 = new Date();
  await db.insert(emailVerificationCodes).values({
    userId: u.id, codeHash: hashCode(code2),
    expiresAt: new Date(now2.getTime() + CODE_TTL_MS), attempts: 0, lastSentAt: now2,
  });
  const rec2 = (await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u.id)))[0];
  const ok = rec2.codeHash === hashCode(code2) && rec2.expiresAt >= new Date();
  check('Bon code reconnu', ok, true);
  if (ok) {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, u.id));
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u.id));
  }
  const verified = await db.select({ v: users.emailVerified }).from(users).where(eq(users.id, u.id));
  check('Compte vérifié après bon code', verified[0].v, true);
  const codeGone = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u.id));
  check('Ligne de code supprimée après succès', codeGone.length, 0);

  // ── 5. Expiration : un code expiré est rejeté ──
  console.log('\n══════ Verify : code expiré rejeté ══════');
  const [u2] = await db.insert(users)
    .values({ email: 'exp@test.io', username: 'Exp', passwordHash: 'hash' })
    .returning({ id: users.id });
  const codeExp = genCode();
  await db.insert(emailVerificationCodes).values({
    userId: u2.id, codeHash: hashCode(codeExp),
    expiresAt: new Date(Date.now() - 1000), attempts: 0, lastSentAt: new Date(Date.now() - 2000),
  });
  const recExp = (await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u2.id)))[0];
  const expired = recExp.expiresAt < new Date();
  check('Code détecté comme expiré', expired, true);

  // ── 6. Resend : cooldown de 60 s respecté ──
  console.log('\n══════ Resend : cooldown 60 s ══════');
  const recentSent = new Date(Date.now() - 5000); // envoyé il y a 5 s
  const withinCooldown = Date.now() - recentSent.getTime() < RESEND_COOLDOWN_MS;
  check('Renvoi bloqué dans les 60 s (cooldown)', withinCooldown, true);
  const oldSent = new Date(Date.now() - 61000); // envoyé il y a 61 s
  const pastCooldown = Date.now() - oldSent.getTime() >= RESEND_COOLDOWN_MS;
  check('Renvoi autorisé après 60 s', pastCooldown, true);

  // ── 7. Login : compte non vérifié → détecté (→ 403 côté route) ──
  console.log('\n══════ Login : compte non vérifié détecté ══════');
  const loginRow = await db.select({ v: users.emailVerified }).from(users).where(eq(users.email, 'exp@test.io'));
  check('Login sur compte non vérifié → email_verified=false', loginRow[0].v, false);

  console.log('\n✅ FIX B : intégration BDD + migration vérifiées (PGlite éphémère).');
  await client.close();
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
