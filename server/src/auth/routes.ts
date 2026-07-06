import { Router, type Request, type Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { createSession, destroySession, getUserById, COOKIE_NAME } from './sessions.js';

// ─── Schémas de validation ────────────────────────────────────────
const registerSchema = z.object({
  email:    z.string().email().transform(s => s.toLowerCase().trim()),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email:    z.string().email().transform(s => s.toLowerCase().trim()),
  password: z.string().min(1),
});

// ─── Helpers ─────────────────────────────────────────────────────

// Dérive le niveau depuis l'XP (formule §6, sans dépendre de shared/progression.ts).
function levelForXp(xp: number): number {
  let n = 1;
  while (100 * (n + 1) * n / 2 <= xp) n++;
  return n;
}

// Mapper explicite : jamais de password_hash ni d'info privée hors propriétaire.
function toPublicUser(user: { id: string; username: string; xp: number }) {
  return { id: user.id, username: user.username, xp: user.xp, level: levelForXp(user.xp) };
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

// ─── Rate limiting (login + register) ────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessaie dans 15 minutes.' },
});

// ─── Router ──────────────────────────────────────────────────────
export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', authLimiter, async (req: Request, res: Response) => {
  if (!db) { res.status(503).json({ error: 'Service indisponible.' }); return; }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Données invalides.', details: parsed.error.flatten() });
    return;
  }
  const { email, username, password } = parsed.data;

  try {
    // Vérifier unicité email (insensible à la casse car stocké lowercase).
    const existingEmail = await db.select({ id: users.id }).from(users)
      .where(eq(users.email, email)).limit(1);
    if (existingEmail.length > 0) {
      res.status(409).json({ error: 'Cet email est déjà utilisé.' });
      return;
    }

    // Vérifier unicité username (insensible à la casse via index lower(username)).
    const existingUsername = await db.select({ id: users.id }).from(users)
      .where(eq(sql`lower(${users.username})`, username.toLowerCase())).limit(1);
    if (existingUsername.length > 0) {
      res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(users)
      .values({ email, username, passwordHash })
      .returning({ id: users.id, username: users.username, xp: users.xp });

    const token = await createSession(user.id);
    res.cookie(COOKIE_NAME, token, cookieOptions(req));
    res.status(201).json({ user: toPublicUser(user) });
  } catch (e) {
    console.error('register error:', e);
    res.status(500).json({ error: 'Erreur interne, réessaie.' });
  }
});

// POST /api/auth/login
authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  if (!db) { res.status(503).json({ error: 'Service indisponible.' }); return; }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: 'Identifiants invalides.' });
    return;
  }
  const { email, password } = parsed.data;

  try {
    const rows = await db
      .select({ id: users.id, username: users.username, xp: users.xp, passwordHash: users.passwordHash })
      .from(users).where(eq(users.email, email)).limit(1);

    const INVALID = 'Identifiants invalides.';
    if (rows.length === 0) { res.status(401).json({ error: INVALID }); return; }

    const user = rows[0];
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) { res.status(401).json({ error: INVALID }); return; }

    const token = await createSession(user.id);
    res.cookie(COOKIE_NAME, token, cookieOptions(req));
    res.status(200).json({ user: toPublicUser(user) });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: 'Erreur interne, réessaie.' });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) await destroySession(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.status(204).send();
});

// GET /api/auth/me
authRouter.get('/me', async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) { res.status(401).json({ error: 'Non authentifié.' }); return; }

  const { resolveSession } = await import('./sessions.js');
  const userId = await resolveSession(token);
  if (!userId) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(401).json({ error: 'Session expirée.' });
    return;
  }

  const user = await getUserById(userId);
  if (!user) { res.status(401).json({ error: 'Utilisateur introuvable.' }); return; }

  // /me inclut l'email pour le propriétaire (uniquement ici).
  res.status(200).json({
    user: { ...toPublicUser(user), email: user.email },
  });
});
