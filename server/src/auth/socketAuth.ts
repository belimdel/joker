import { parseCookie } from 'cookie';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/events.js';
import { resolveSession, COOKIE_NAME } from './sessions.js';

// Middleware Socket.IO : lit le cookie jk_session du handshake,
// résout la session et pose socket.data.userId (string | null).
// Ne rejette JAMAIS la connexion : un invité (userId = null) est légitime.
export function applySocketAuth(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  io.use(async (socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie ?? '';
      const cookies = parseCookie(rawCookie);
      const token = cookies[COOKIE_NAME];
      if (token) {
        const userId = await resolveSession(token);
        socket.data.userId = userId ?? null;
      } else {
        socket.data.userId = null;
      }
    } catch {
      socket.data.userId = null;
    }
    next();
  });
}
