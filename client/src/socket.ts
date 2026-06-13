import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@shared/events";

// Socket TYPÉ de bout en bout (mêmes contrats que le serveur, zéro any).
// Note l'ORDRE des génériques côté client : <Reçus, Émis>.
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const URL = import.meta.env.PROD
  ? window.location.origin
  : "http://localhost:3001";

// Connexion unique, partagée par toute l'app.
export const socket: AppSocket = io(URL, { autoConnect: true });
