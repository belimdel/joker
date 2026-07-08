import { randomBytes, createHash } from 'crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions, users, emailVerificationCodes, passwordResetCodes } from '../db/schema.js';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
export const COOKIE_NAME = 'jk_session';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

// Crée une session en BDD. Retourne le token brut à poser dans le cookie.
// Le token brut ne touche jamais la BDD : seul son SHA-256 y est stocké.
export async function createSession(userId: string): Promise<string> {
  if (!db) throw new Error('BDD non disponible');
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ userId, tokenHash, expiresAt });
  return rawToken;
}

// Résout un token brut → userId (ou null si absent/expiré/inconnu).
export async function resolveSession(rawToken: string): Promise<string | null> {
  if (!db) return null;
  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  if (rows.length === 0) return null;
  if (rows[0].expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }
  return rows[0].userId;
}

// Supprime la session associée au token brut (déconnexion).
export async function destroySession(rawToken: string): Promise<void> {
  if (!db) return;
  const tokenHash = hashToken(rawToken);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

// Révoque TOUTES les sessions d'un utilisateur (tous appareils). Appelé à
// chaque changement de mot de passe (reset ou modification volontaire) : un
// mot de passe compromis ne doit laisser aucune session active derrière lui.
export async function destroyAllUserSessions(userId: string): Promise<void> {
  if (!db) return;
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// Récupère un utilisateur depuis son id (pour /me et les middlewares).
export async function getUserById(userId: string) {
  if (!db) return null;
  const rows = await db
    .select({ id: users.id, email: users.email, username: users.username, xp: users.xp })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

// Nettoie les sessions expirées (appelable périodiquement).
export async function pruneExpiredSessions(): Promise<void> {
  if (!db) return;
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

// ─── Purge périodique des artefacts d'auth expirés ────────────────
// Sessions, codes de vérification et codes de réinitialisation expirés
// n'ont plus aucune valeur : on les supprime pour que la BDD ne reflète
// que des états réellement actifs. Lancée au boot puis toutes les heures.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export async function pruneExpiredAuthRecords(): Promise<void> {
  if (!db) return;
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(emailVerificationCodes).where(lt(emailVerificationCodes.expiresAt, now));
  await db.delete(passwordResetCodes).where(lt(passwordResetCodes.expiresAt, now));
}

export function startAuthPruning(): void {
  if (!db) return; // mode dégradé sans BDD : rien à purger
  const run = () =>
    pruneExpiredAuthRecords().catch((e: unknown) => {
      console.error('🧹 Purge auth échouée :', (e as Error).message);
    });
  void run();
  // unref() : le timer ne retient pas le process (tests, arrêt propre).
  setInterval(run, PRUNE_INTERVAL_MS).unref();
}
