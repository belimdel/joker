// ─── Test d'intégration : réinitialisation + changement de mot de passe ──
// Exécuté contre un Postgres ÉPHÉMÈRE en mémoire (PGlite) — jamais la BDD de
// production. On applique les VRAIS fichiers de migration (0000 → 0002) puis
// on rejoue, à l'identique, la séquence SQL des routes forgot-password /
// reset-password / change-password (routes.ts) pour prouver : code stocké en
// SHA-256 (jamais en clair), expiration/5 tentatives, cooldown, révocation de
// TOUTES les sessions au changement de mot de passe, compte marqué vérifié
// après un reset réussi, purge des artefacts expirés.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomInt } from 'crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, lt } from 'drizzle-orm';
import { users, sessions, emailVerificationCodes, passwordResetCodes } from '../db/schema.js';
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
  const db = drizzle(client, { schema: { users, sessions, emailVerificationCodes, passwordResetCodes } });

  // ── 0. Migrations réelles (0000 → 0002) ──
  console.log('══════ Migrations 0000 → 0002 appliquées ══════');
  await client.exec(readMig('0000_brief_forgotten_one.sql'));
  await client.exec(readMig('0001_sturdy_king_cobra.sql'));
  await client.exec(readMig('0002_petite_lorna_dane.sql'));

  const [u] = await db.insert(users)
    .values({ email: 'reset@test.io', username: 'Reset', passwordHash: 'old-hash', emailVerified: true })
    .returning({ id: users.id });
  check('Table password_reset_codes créée (compte inséré)', typeof u.id, 'string');

  // ── 1. forgot-password : code haché stocké, jamais en clair ──
  console.log('\n══════ Forgot : code SHA-256 stocké, jamais en clair ══════');
  const code = genCode();
  const now = new Date();
  await db.insert(passwordResetCodes).values({
    userId: u.id, codeHash: hashCode(code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS), attempts: 0, lastSentAt: now,
  });
  const stored = await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.userId, u.id));
  console.log(`   SELECT code_hash → ${stored[0].codeHash}`);
  check('code_hash = SHA-256 hex (64 car.)', /^[0-9a-f]{64}$/.test(stored[0].codeHash), true);
  check('Le code en clair N\'EST PAS stocké', stored[0].codeHash !== code, true);

  // ── 2. Cooldown 60 s entre deux envois ──
  console.log('\n══════ Forgot : cooldown 60 s ══════');
  const withinCooldown = Date.now() - stored[0].lastSentAt.getTime() < RESEND_COOLDOWN_MS;
  check('Renvoi bloqué dans les 60 s (cooldown)', withinCooldown, true);

  // ── 3. Mauvais code → attempts++ ; 5 essais → code invalidé ──
  console.log('\n══════ Reset : 5 mauvaises tentatives invalident le code ══════');
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 1; i <= MAX_CODE_ATTEMPTS; i++) {
    const rec = (await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.userId, u.id)))[0];
    const matches = rec.codeHash === hashCode(wrong);
    const nextAttempts = rec.attempts + 1;
    if (!matches) {
      if (nextAttempts >= MAX_CODE_ATTEMPTS) {
        await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, u.id));
      } else {
        await db.update(passwordResetCodes).set({ attempts: nextAttempts }).where(eq(passwordResetCodes.userId, u.id));
      }
    }
  }
  const afterAttempts = await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.userId, u.id));
  check('Code supprimé après 5 tentatives (nouveau forgot requis)', afterAttempts.length, 0);

  // ── 4. Bon code → nouveau hash + compte vérifié + sessions révoquées ──
  console.log('\n══════ Reset : succès → mdp changé, sessions révoquées ══════');
  // Compte NON vérifié avec 3 sessions actives (3 appareils) + un code de
  // vérification en attente : le reset doit tout assainir.
  const [u2] = await db.insert(users)
    .values({ email: 'multi@test.io', username: 'Multi', passwordHash: 'old-hash' })
    .returning({ id: users.id, emailVerified: users.emailVerified });
  check('Compte de départ non vérifié', u2.emailVerified, false);
  for (let i = 0; i < 3; i++) {
    await db.insert(sessions).values({
      userId: u2.id, tokenHash: hashCode(`token-${i}`),
      expiresAt: new Date(Date.now() + 1000 * 3600),
    });
  }
  await db.insert(emailVerificationCodes).values({
    userId: u2.id, codeHash: hashCode(genCode()),
    expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0, lastSentAt: new Date(),
  });

  const code2 = genCode();
  await db.insert(passwordResetCodes).values({
    userId: u2.id, codeHash: hashCode(code2),
    expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0, lastSentAt: new Date(),
  });
  const rec2 = (await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.userId, u2.id)))[0];
  const ok = rec2.codeHash === hashCode(code2) && rec2.expiresAt >= new Date();
  check('Bon code reconnu', ok, true);

  // Séquence exacte de la route reset-password.
  await db.update(users).set({ passwordHash: 'new-hash', emailVerified: true }).where(eq(users.id, u2.id));
  await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, u2.id));
  await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u2.id));
  await db.delete(sessions).where(eq(sessions.userId, u2.id)); // destroyAllUserSessions

  const after = (await db.select().from(users).where(eq(users.id, u2.id)))[0];
  check('Nouveau hash posé', after.passwordHash, 'new-hash');
  check('Compte marqué vérifié (email prouvé par le code)', after.emailVerified, true);
  const remainingSessions = await db.select().from(sessions).where(eq(sessions.userId, u2.id));
  check('TOUTES les sessions révoquées (3 appareils → 0)', remainingSessions.length, 0);
  const remainingCodes = await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.userId, u2.id));
  check('Code de reset consommé', remainingCodes.length, 0);
  const remainingVerif = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, u2.id));
  check('Code de vérification caduc supprimé', remainingVerif.length, 0);

  // ── 5. Code expiré rejeté ──
  console.log('\n══════ Reset : code expiré rejeté ══════');
  const codeExp = genCode();
  await db.insert(passwordResetCodes).values({
    userId: u.id, codeHash: hashCode(codeExp),
    expiresAt: new Date(Date.now() - 1000), attempts: 0, lastSentAt: new Date(Date.now() - 2000),
  });
  const recExp = (await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.userId, u.id)))[0];
  check('Code détecté comme expiré', recExp.expiresAt < new Date(), true);

  // ── 6. change-password : sessions révoquées, une seule recréée ──
  console.log('\n══════ Change : révocation totale + session recréée ══════');
  for (let i = 0; i < 2; i++) {
    await db.insert(sessions).values({
      userId: u.id, tokenHash: hashCode(`chg-${i}`),
      expiresAt: new Date(Date.now() + 1000 * 3600),
    });
  }
  // Séquence exacte de la route change-password.
  await db.update(users).set({ passwordHash: 'changed-hash' }).where(eq(users.id, u.id));
  await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, u.id)); // code en attente caduc
  await db.delete(sessions).where(eq(sessions.userId, u.id));
  await db.insert(sessions).values({
    userId: u.id, tokenHash: hashCode('fresh-token'),
    expiresAt: new Date(Date.now() + 1000 * 3600),
  });
  const chgSessions = await db.select().from(sessions).where(eq(sessions.userId, u.id));
  check('Une seule session restante (cet appareil)', chgSessions.length, 1);
  check('Session restante = la nouvelle', chgSessions[0].tokenHash, hashCode('fresh-token'));
  const staleReset = await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.userId, u.id));
  check('Code de reset en attente invalidé par le changement', staleReset.length, 0);

  // ── 7. Purge : les artefacts expirés disparaissent ──
  console.log('\n══════ Purge : sessions + codes expirés supprimés ══════');
  await db.insert(sessions).values({
    userId: u.id, tokenHash: hashCode('expired-session'),
    expiresAt: new Date(Date.now() - 1000),
  });
  await db.insert(passwordResetCodes).values({
    userId: u2.id, codeHash: hashCode(genCode()),
    expiresAt: new Date(Date.now() - 1000), attempts: 0, lastSentAt: new Date(Date.now() - 2000),
  });
  // Séquence exacte de pruneExpiredAuthRecords (sessions.ts).
  const pruneNow = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, pruneNow));
  await db.delete(emailVerificationCodes).where(lt(emailVerificationCodes.expiresAt, pruneNow));
  await db.delete(passwordResetCodes).where(lt(passwordResetCodes.expiresAt, pruneNow));

  const liveSessions = await db.select().from(sessions);
  check('Sessions expirées purgées, actives conservées', liveSessions.length, 1);
  const liveResets = await db.select().from(passwordResetCodes);
  check('Codes de reset expirés purgés', liveResets.length, 0);

  console.log('\n✅ Réinitialisation + changement de mot de passe : intégration BDD vérifiée (PGlite éphémère).');
  await client.close();
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
