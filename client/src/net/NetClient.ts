import { Client, type Room } from "colyseus.js";
import { INPUT_MESSAGE, MATCH_ROOM, type InputIntent, type JoinOptions } from "@party-royale/shared";

/**
 * Thin Colyseus client wrapper. Connects to a match room, forwards input
 * intents, and exposes the room so the game can subscribe to authoritative
 * state. The client never sends anything but input intents.
 */
export class NetClient {
  private client: Client | null = null;
  room: Room | null = null;

  async connect(url: string, options: JoinOptions): Promise<Room> {
    this.client = new Client(url);
    this.room = await this.client.joinOrCreate(MATCH_ROOM, options);
    return this.room;
  }

  sendInput(intent: InputIntent): void {
    this.room?.send(INPUT_MESSAGE, intent);
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
