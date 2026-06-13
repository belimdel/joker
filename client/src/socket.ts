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

export const socket: AppSocket = io(URL, {
  autoConnect: true,
});