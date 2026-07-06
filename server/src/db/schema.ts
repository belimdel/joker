import { pgTable, uuid, text, integer, boolean, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── users ──────────────────────────────────────────────────────
export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  email:        text('email').unique().notNull(),
  username:     text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  xp:           integer('xp').notNull().default(0),
  // Vérification d'email par code (FIX B). Les comptes pré-existants sont
  // passés à true par la migration ; un nouveau compte naît à false.
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Unicité insensible à la casse sur username.
  index('users_username_lower_idx').on(sql`lower(${table.username})`),
]);

// ─── email_verification_codes ────────────────────────────────────
// Un seul code actif par utilisateur (user_id = clé primaire). On ne stocke
// JAMAIS le code en clair : uniquement son SHA-256 hex.
export const emailVerificationCodes = pgTable('email_verification_codes', {
  userId:     uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  codeHash:   text('code_hash').notNull(),           // SHA-256 hex du code à 6 chiffres
  expiresAt:  timestamp('expires_at', { withTimezone: true }).notNull(), // création + 15 min
  attempts:   integer('attempts').notNull().default(0),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull(),
});

// ─── sessions ────────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('sessions_token_hash_idx').on(table.tokenHash),
  index('sessions_user_id_idx').on(table.userId),
]);

// ─── games ───────────────────────────────────────────────────────
export const games = pgTable('games', {
  id:         uuid('id').primaryKey().defaultRandom(),
  roomCode:   text('room_code').notNull(),
  visibility: text('visibility').notNull(), // 'public' | 'private'
  ranked:     boolean('ranked').notNull(),
  startedAt:  timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
});

// ─── game_players ────────────────────────────────────────────────
export const gamePlayers = pgTable('game_players', {
  gameId:           uuid('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  seat:             integer('seat').notNull(),
  userId:           uuid('user_id').references(() => users.id),
  usernameSnapshot: text('username_snapshot').notNull(),
  finalScore:       integer('final_score').notNull(),
  finalPosition:    integer('final_position').notNull(),
  contractsMade:    integer('contracts_made').notNull(),
  contractsTotal:   integer('contracts_total').notNull(),
  xishts:           integer('xishts').notNull(),
  rankingPoints:    integer('ranking_points').notNull().default(0),
  xpAwarded:        integer('xp_awarded').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.gameId, table.seat] }),
  index('game_players_user_id_idx').on(table.userId),
]);
