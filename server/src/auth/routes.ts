import { Router, type Request, type Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { randomInt, createHash } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from '../db/client.js';
import { users, emailVerificationCodes, passwordResetCodes } from '../db/schema.js';
import { hashPassword, verifyPassword } from './passwords.js';
import {
  createSession, destroySession, destroyAllUserSessions,
  getUserById, resolveSession, COOKIE_NAME,
} from './sessions.js';
import { mailService } from '../mail/MailService.js';

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

const verifyEmailSchema = z.object({
  email: z.string().email().transform(s => s.toLowerCase().trim()),
  code:  z.string().regex(/^\d{6}$/),
});

const resendSchema = z.object({
  email: z.string().email().transform(s => s.toLowerCase().trim()),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().transform(s => s.toLowerCase().trim()),
});

const resetPasswordSchema = z.object({
  email:       z.string().email().transform(s => s.toLowerCase().trim()),
  code:        z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8),
});

// ─── Vérification d'email par code ───────────────────────────────
const CODE_TTL_MS = 15 * 60 * 1000;     // le code expire 15 min après création
const RESEND_COOLDOWN_MS = 60 * 1000;   // 60 s minimum entre deux envois
const MAX_CODE_ATTEMPTS = 5;            // au-delà, le code est invalidé

// Code à 6 chiffres cryptographiquement aléatoire (000000-999999, paddé).
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// SHA-256 hex du code — seul le hash touche la BDD, jamais le code en clair.
function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// Génère un code, l'enregistre (remplace tout code actif du user) et l'envoie.
// L'envoi de mail peut échouer sans laisser un compte inutilisable : le code
// est stocké quoi qu'il arrive, l'utilisateur pourra passer par resend-code.
async function issueVerificationCode(
  database: NonNullable<typeof db>,
  userId: string,
  email: string,
): Promise<void> {
  const code = generateCode();
  const now = new Date();
  await database
    .insert(emailVerificationCodes)
    .values({
      userId,
      codeHash: hashCode(code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: now,
    })
    .onConflictDoUpdate({
      target: emailVerificationCodes.userId,
      set: {
        codeHash: hashCode(code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        attempts: 0,
        lastSentAt: now,
      },
    });
  // Le code est déjà stocké : la réponse HTTP ne doit PAS attendre le SMTP
  // (fire-and-forget, timeouts bornés dans MailService). Le .catch attaché
  // synchronement garantit qu'aucune rejection non gérée ne peut crasher le
  // process. En cas d'échec : log serveur, la réponse reste un succès (anti-
  // énumération), l'utilisateur dispose du bouton « renvoyer le code ».
  void mailService.sendVerificationCode(email, code).catch((e: unknown) => {
    console.error(`✉️  Envoi du code échoué pour ${email} :`, (e as Error).message);
  });
}

// Miroir de issueVerificationCode pour la réinitialisation de mot de passe :
// mêmes garanties (hash seul en BDD, un code actif par user, envoi asynchrone
// qui ne bloque jamais la réponse HTTP et ne peut pas crasher le process).
async function issuePasswordResetCode(
  database: NonNullable<typeof db>,
  userId: string,
  email: string,
): Promise<void> {
  const code = generateCode();
  const now = new Date();
  await database
    .insert(passwordResetCodes)
    .values({
      userId,
      codeHash: hashCode(code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: now,
    })
    .onConflictDoUpdate({
      target: passwordResetCodes.userId,
      set: {
        codeHash: hashCode(code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        attempts: 0,
        lastSentAt: now,
      },
    });
  void mailService.sendPasswordResetCode(email, code).catch((e: unknown) => {
    console.error(`✉️  Envoi du code de réinitialisation échoué pour ${email} :`, (e as Error).message);
  });
}

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

// Limiteur dédié au renvoi de code (anti-abus d'envoi de mails) : 5 requêtes
// par IP toutes les 15 min. Répond 204 comme la route (pas de fuite d'info).
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(204).send(),
});

// Limiteur « mot de passe oublié » : mêmes contraintes que resend (anti-abus
// d'envoi de mails, réponse 204 systématique pour ne rien révéler).
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(204).send(),
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
      .values({ email, username, passwordHash }) // email_verified = false (défaut)
      .returning({ id: users.id, username: users.username, xp: users.xp });

    // Génère + envoie le code. AUCUNE session, AUCUN cookie : le compte doit
    // d'abord être vérifié via POST /verify-email.
    await issueVerificationCode(db, user.id, email);
    res.status(201).json({ requiresVerification: true });
  } catch (e) {
    console.error('register error:', e);
    res.status(500).json({ error: 'Erreur interne, réessaie.' });
  }
});

// POST /api/auth/verify-email — { email, code }
authRouter.post('/verify-email', authLimiter, async (req: Request, res: Response) => {
  if (!db) { res.status(503).json({ error: 'Service indisponible.' }); return; }

  const parsed = verifyEmailSchema.safeParse(req.body);
  // Message générique : on ne distingue jamais code faux / expiré / email inconnu.
  const GENERIC = 'Code invalide ou expiré.';
  if (!parsed.success) { res.status(400).json({ error: GENERIC }); return; }
  const { email, code } = parsed.data;

  try {
    const rows = await db
      .select({ id: users.id, username: users.username, xp: users.xp, emailVerified: users.emailVerified })
      .from(users).where(eq(users.email, email)).limit(1);
    if (rows.length === 0) { res.status(400).json({ error: GENERIC }); return; }
    const user = rows[0];

    // Déjà vérifié (double soumission) : on ne recrée pas de session ici.
    if (user.emailVerified) { res.status(400).json({ error: GENERIC }); return; }

    const codeRows = await db
      .select({ codeHash: emailVerificationCodes.codeHash, expiresAt: emailVerificationCodes.expiresAt, attempts: emailVerificationCodes.attempts })
      .from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, user.id)).limit(1);
    if (codeRows.length === 0) { res.status(400).json({ error: GENERIC }); return; }
    const record = codeRows[0];

    const expired = record.expiresAt < new Date();
    const matches = record.codeHash === hashCode(code);

    if (expired || !matches) {
      const nextAttempts = record.attempts + 1;
      if (nextAttempts >= MAX_CODE_ATTEMPTS || expired) {
        // Trop d'essais ou code expiré : on invalide le code (resend requis).
        await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, user.id));
      } else {
        await db.update(emailVerificationCodes)
          .set({ attempts: nextAttempts })
          .where(eq(emailVerificationCodes.userId, user.id));
      }
      res.status(400).json({ error: GENERIC });
      return;
    }

    // Succès : compte vérifié, code supprimé, session créée (connexion directe).
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, user.id));

    const token = await createSession(user.id);
    res.cookie(COOKIE_NAME, token, cookieOptions(req));
    res.status(200).json({ user: toPublicUser(user) });
  } catch (e) {
    console.error('verify-email error:', e);
    res.status(500).json({ error: 'Erreur interne, réessaie.' });
  }
});

// POST /api/auth/resend-code — { email }
// Répond TOUJOURS 204 (anti-énumération), que l'email existe ou non, qu'il
// soit vérifié ou non. Renvoie un nouveau code seulement si : compte non
// vérifié ET dernier envoi il y a plus de RESEND_COOLDOWN_MS.
authRouter.post('/resend-code', resendLimiter, async (req: Request, res: Response) => {
  // Toujours 204, même en mode dégradé sans BDD.
  const respond = () => res.status(204).send();
  if (!db) { respond(); return; }

  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) { respond(); return; }
  const { email } = parsed.data;

  try {
    const rows = await db
      .select({ id: users.id, emailVerified: users.emailVerified })
      .from(users).where(eq(users.email, email)).limit(1);
    if (rows.length === 0 || rows[0].emailVerified) { respond(); return; }
    const user = rows[0];

    // Cooldown : ne pas renvoyer si un code a été émis il y a moins de 60 s.
    const existing = await db
      .select({ lastSentAt: emailVerificationCodes.lastSentAt })
      .from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, user.id)).limit(1);
    if (existing.length > 0 && Date.now() - existing[0].lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      respond();
      return;
    }

    await issueVerificationCode(db, user.id, email);
  } catch (e) {
    console.error('resend-code error:', e);
  }
  respond();
});

// POST /api/auth/forgot-password — { email }
// Répond TOUJOURS 204 (anti-énumération), que l'email existe ou non. Émet un
// code de réinitialisation si le compte existe (vérifié ou non : le code
// prouve la possession de l'email, exactement comme la vérification), avec
// le même cooldown de 60 s entre deux envois.
authRouter.post('/forgot-password', forgotLimiter, async (req: Request, res: Response) => {
  const respond = () => res.status(204).send();
  if (!db) { respond(); return; }

  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) { respond(); return; }
  const { email } = parsed.data;

  try {
    const rows = await db
      .select({ id: users.id })
      .from(users).where(eq(users.email, email)).limit(1);
    if (rows.length === 0) { respond(); return; }
    const user = rows[0];

    // Cooldown : ne pas renvoyer si un code a été émis il y a moins de 60 s.
    const existing = await db
      .select({ lastSentAt: passwordResetCodes.lastSentAt })
      .from(passwordResetCodes).where(eq(passwordResetCodes.userId, user.id)).limit(1);
    if (existing.length > 0 && Date.now() - existing[0].lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      respond();
      return;
    }

    await issuePasswordResetCode(db, user.id, email);
  } catch (e) {
    console.error('forgot-password error:', e);
  }
  respond();
});

// POST /api/auth/reset-password — { email, code, newPassword }
// Mêmes règles que verify-email : message générique, expiration 15 min,
// 5 tentatives max puis code invalidé. Succès → nouveau mot de passe,
// compte marqué vérifié (possession de l'email prouvée), TOUTES les
// sessions révoquées (tous appareils), puis connexion directe.
authRouter.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  if (!db) { res.status(503).json({ error: 'Service indisponible.' }); return; }

  const parsed = resetPasswordSchema.safeParse(req.body);
  const GENERIC = 'Code invalide ou expiré.';
  if (!parsed.success) {
    // Seule erreur distinguée : mot de passe trop court (aide légitime,
    // ne révèle rien sur l'existence du compte ou la validité du code).
    const pwIssue = parsed.error.issues.some(i => i.path[0] === 'newPassword');
    res.status(400).json({ error: pwIssue ? 'Le mot de passe doit faire au moins 8 caractères.' : GENERIC });
    return;
  }
  const { email, code, newPassword } = parsed.data;

  try {
    const rows = await db
      .select({ id: users.id, username: users.username, xp: users.xp })
      .from(users).where(eq(users.email, email)).limit(1);
    if (rows.length === 0) { res.status(400).json({ error: GENERIC }); return; }
    const user = rows[0];

    const codeRows = await db
      .select({ codeHash: passwordResetCodes.codeHash, expiresAt: passwordResetCodes.expiresAt, attempts: passwordResetCodes.attempts })
      .from(passwordResetCodes).where(eq(passwordResetCodes.userId, user.id)).limit(1);
    if (codeRows.length === 0) { res.status(400).json({ error: GENERIC }); return; }
    const record = codeRows[0];

    const expired = record.expiresAt < new Date();
    const matches = record.codeHash === hashCode(code);

    if (expired || !matches) {
      const nextAttempts = record.attempts + 1;
      if (nextAttempts >= MAX_CODE_ATTEMPTS || expired) {
        await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, user.id));
      } else {
        await db.update(passwordResetCodes)
          .set({ attempts: nextAttempts })
          .where(eq(passwordResetCodes.userId, user.id));
      }
      res.status(400).json({ error: GENERIC });
      return;
    }

    // Succès : nouveau hash, compte vérifié (l'email est prouvé), codes
    // consommés, toutes les sessions existantes révoquées.
    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash, emailVerified: true }).where(eq(users.id, user.id));
    await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, user.id));
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, user.id));
    await destroyAllUserSessions(user.id);

    const token = await createSession(user.id);
    res.cookie(COOKIE_NAME, token, cookieOptions(req));
    res.status(200).json({ user: toPublicUser(user) });
  } catch (e) {
    console.error('reset-password error:', e);
    res.status(500).json({ error: 'Erreur interne, réessaie.' });
  }
});

// POST /api/auth/change-password — { currentPassword, newPassword }
// Authentifié (cookie de session). Vérifie le mot de passe actuel, pose le
// nouveau, révoque TOUTES les sessions (tous appareils) puis en recrée une
// pour cet appareil : l'utilisateur reste connecté ici, déconnecté partout
// ailleurs.
authRouter.post('/change-password', authLimiter, async (req: Request, res: Response) => {
  if (!db) { res.status(503).json({ error: 'Service indisponible.' }); return; }

  const token = req.cookies?.[COOKIE_NAME];
  if (!token) { res.status(401).json({ error: 'Non authentifié.' }); return; }
  const userId = await resolveSession(token);
  if (!userId) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(401).json({ error: 'Session expirée.' });
    return;
  }

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;

  try {
    const rows = await db
      .select({ id: users.id, username: users.username, xp: users.xp, passwordHash: users.passwordHash })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (rows.length === 0) { res.status(401).json({ error: 'Utilisateur introuvable.' }); return; }
    const user = rows[0];

    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) { res.status(400).json({ error: 'Mot de passe actuel incorrect.' }); return; }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    // Un éventuel code de réinitialisation en attente devient caduc.
    await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, user.id));
    await destroyAllUserSessions(user.id);

    const newToken = await createSession(user.id);
    res.cookie(COOKIE_NAME, newToken, cookieOptions(req));
    res.status(200).json({ user: toPublicUser(user) });
  } catch (e) {
    console.error('change-password error:', e);
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
      .select({ id: users.id, username: users.username, xp: users.xp, passwordHash: users.passwordHash, emailVerified: users.emailVerified })
      .from(users).where(eq(users.email, email)).limit(1);

    const INVALID = 'Identifiants invalides.';
    if (rows.length === 0) { res.status(401).json({ error: INVALID }); return; }

    const user = rows[0];
    const ok = await verifyPassword(user.passwordHash, password);
    // Mot de passe FAUX → 401 générique, même si le compte est non vérifié :
    // on ne révèle jamais l'état d'un compte à qui n'a pas le mot de passe.
    if (!ok) { res.status(401).json({ error: INVALID }); return; }

    // Mot de passe BON mais email non vérifié → 403 typé, pas de session.
    if (!user.emailVerified) {
      res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', error: 'Compte non vérifié. Vérifie ton email.' });
      return;
    }

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
