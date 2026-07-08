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
// Généré par navigateur et conservé dans localStorage. Permet au serveur
// de reconnaître un client qui rafraîchit sa page et de le remettre dans
// sa partie (cf. GameManager.reconnect). Il identifie le NAVIGATEUR, pas
// la personne : à chaque changement d'identité (login, création de compte,
// logout) il est régénéré via renewIdentity() pour ne pas hériter de la
// partie de l'ancienne identité.
const SESSION_STORAGE_KEY = "joker:sessionId";

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, id);
  return id;
}

export const socket: AppSocket = io(URL, {
  autoConnect: true,
  // Callback (et non objet figé) : chaque (re)connexion relit le sessionId
  // COURANT dans localStorage — indispensable après renewIdentity().
  auth: (cb) => cb({ sessionId: getOrCreateSessionId() }),
});

// Changement d'identité (login, compte créé, logout) : l'éventuelle partie
// en cours appartenait à l'ANCIENNE identité, et rien ne garantit que c'est
// la même personne derrière l'écran (appareil partagé). On oublie le
// sessionId local et on force une reconnexion : nouveau sessionId + relecture
// du cookie jk_session par le serveur (socket.data.userId à jour).
export function renewIdentity(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  socket.disconnect();
  socket.connect();
}
