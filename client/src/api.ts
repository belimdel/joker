// Helper fetch pour les appels REST /api/*
// credentials: 'include' → envoie le cookie jk_session automatiquement (same-origin).

export type ApiError = { error: string; details?: unknown };

export type PublicUser = {
  id: string;
  username: string;
  xp: number;
  level: number;
  email?: string; // présent uniquement sur /me pour le propriétaire
};

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; code?: string }> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
  } catch {
    return { ok: false, status: 0, error: 'Impossible de joindre le serveur.' };
  }

  if (res.status === 204) return { ok: true, data: undefined as unknown as T };

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // `code` typé (ex. EMAIL_NOT_VERIFIED) exposé au front pour l'aiguillage.
    return {
      ok: false,
      status: res.status,
      error: (json as ApiError).error ?? `Erreur serveur (${res.status}).`,
      code: (json as { code?: string }).code,
    };
  }
  return { ok: true, data: json as T };
}

export type UserStats = {
  user: PublicUser;
  stats: {
    gamesPlayed: number;
    wins: number;
    winRate: number;
    contractsMade: number;
    contractsTotal: number;
    contractRate: number;
    xishts: number;
    bestScore: number;
    avgPosition: number | null;
  };
  progression: {
    level: number;
    currentLevelXp: number;
    nextLevelXp: number;
    totalXp: number;
  };
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  level: number;
  points: number;
  gamesPlayed: number;
};

export type LeaderboardResponse = {
  season: string;
  entries: LeaderboardEntry[];
};

export const api = {
  me: () =>
    apiFetch<{ user: PublicUser }>('/api/auth/me'),

  login: (email: string, password: string) =>
    apiFetch<{ user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // Register ne connecte plus directement : il déclenche la vérification email.
  register: (email: string, username: string, password: string) =>
    apiFetch<{ requiresVerification: boolean }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }),

  // Vérifie le code → connecte l'utilisateur (cookie posé côté serveur).
  verifyEmail: (email: string, code: string) =>
    apiFetch<{ user: PublicUser }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  // Renvoie un code (réponse 204 systématique, anti-énumération).
  resendCode: (email: string) =>
    apiFetch<void>('/api/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  logout: () =>
    apiFetch<void>('/api/auth/logout', { method: 'POST' }),

  userStats: (username: string) =>
    apiFetch<UserStats>(`/api/users/${encodeURIComponent(username)}/stats`),

  leaderboard: () =>
    apiFetch<LeaderboardResponse>('/api/leaderboard'),
};
