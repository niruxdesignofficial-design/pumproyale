import { Client, type Room } from "colyseus.js";
import {
  EMOTE_MESSAGE,
  INPUT_MESSAGE,
  MATCH_ROOM,
  type InputIntent,
  type JoinOptions,
} from "@party-royale/shared";

/** How the player wants to enter a match. */
export type PlayMode =
  | { kind: "quick" }
  | { kind: "create" }
  | { kind: "join"; code: string };

/**
 * Thin Colyseus client wrapper. Connects to a match room (quick play, a new
 * private room, or an existing room by code), forwards input intents + emotes,
 * and exposes the room so the game can subscribe to authoritative state. The
 * client never sends anything that could decide the game — only intents.
 */
export class NetClient {
  private client: Client | null = null;
  room: Room | null = null;

  async connect(url: string, options: JoinOptions, mode: PlayMode = { kind: "quick" }): Promise<Room> {
    this.client = new Client(url);
    if (mode.kind === "create") {
      this.room = await this.client.create(MATCH_ROOM, { ...options, private: true });
    } else if (mode.kind === "join") {
      this.room = await this.client.joinById(mode.code, options);
    } else {
      this.room = await this.client.joinOrCreate(MATCH_ROOM, options);
    }
    return this.room;
  }

  sendInput(intent: InputIntent): void {
    this.room?.send(INPUT_MESSAGE, intent);
  }

  sendEmote(id: number): void {
    this.room?.send(EMOTE_MESSAGE, { id });
  }

  /** The room id, which doubles as the shareable code for private games. */
  get roomCode(): string | null {
    return this.room?.roomId ?? null;
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  async dispose(): Promise<void> {
    try {
      await this.room?.leave();
    } catch {
      // ignore leave errors on teardown
    }
    this.room = null;
    this.client = null;
  }
}

/** Default game server URL: env override, else the page host on the Colyseus port. */
export function defaultServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  const host = typeof location !== "undefined" ? location.hostname : "localhost";
  return `ws://${host}:2567`;
}

/**
 * Whether real online play is configured. We only attempt to reach a game server
 * when VITE_SERVER_URL is set; otherwise the client runs the match fully offline
 * (1 human + bots) with no failed-connection delay.
 */
export function isOnlineEnabled(): boolean {
  const url = import.meta.env.VITE_SERVER_URL;
  return typeof url === "string" && url.length > 0;
}
