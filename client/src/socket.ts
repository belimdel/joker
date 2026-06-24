import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@shared/events";

export type AppSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

const URL = import.meta.env.PROD
  ? window.location.origin
  : "http://localhost:3001";

// ─── Identifiant de session persistant ──────────────────────────
// Généré une seule fois par navigateur et conservé dans localStorage.
// Permet au serveur de reconnaître un client qui rafraîchit sa page
// et de le remettre dans sa partie (cf. GameManager.reconnect).
const SESSION_STORAGE_KEY = "joker:sessionId";

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, id);
  return id;
}

// Purge la session locale (ex. sessionExpired) : le prochain connect()
// en fabriquera une nouvelle via getOrCreateSessionId.
export function clearSessionId(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export const socket: AppSocket = io(URL, {
  autoConnect: true,
  auth: { sessionId: getOrCreateSessionId() },
});
