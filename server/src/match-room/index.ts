import type { Env } from "../protocol/types";
import { MatchRoomMessages } from "./messages";

export class MatchRoom extends MatchRoomMessages {
  constructor(state: DurableObjectState, env: Env) {
    super(state);
    this.initDatabase();
  }

  async alarm(): Promise<void> {
    const row = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
    if (!row || typeof row.value !== "string") {
      await this.state.storage.deleteAlarm();
      return;
    }
    let pending: any = null;
    try { pending = JSON.parse(String(row.value)); } catch (_) {}
    if (!pending || !Number.isFinite(Number(pending.startedAt))) {
      await this.state.storage.deleteAlarm();
      return;
    }
    const deadline = Number(pending.startedAt) + 30000;
    if (Date.now() < deadline) {
      await this.state.storage.setAlarm(deadline);
      return;
    }
    this.abortPendingLevelTransition(pending, "DESTINATION_NOT_READY");
    await this.state.storage.deleteAlarm();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/websocket")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const playerId = url.searchParams.get("playerId") || crypto.randomUUID();
      const sessionToken = crypto.randomUUID();
      const sessionData: SessionData = { playerId, sessionToken };

      this.state.acceptWebSocket(server);
      server.serializeAttachment(sessionData);

      const entranceRow = this.sql.exec(`SELECT entrance_pos FROM levels WHERE depth = ?`, this.currentDepth).toArray();
      const spawnPos = entranceRow.length > 0 ? Number(entranceRow[0].entrance_pos) : 100;

      this.sql.exec(
        `INSERT INTO players (player_id, session_token, pos, connected) VALUES (?, ?, ?, 1)
         ON CONFLICT(player_id) DO UPDATE SET session_token=excluded.session_token, connected=1`,
        playerId, sessionToken, spawnPos
      );
      if (this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray().length === 0) {
        this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('levelPublisher', ?)`, playerId);
      }

      const welcome: NetworkMessage = {
        protocolVersion: "1.0.0",
        messageType: "SESSION",
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({
          playerId,
          sessionToken,
          sequence: this.currentSequence,
          seed: this.matchSeed,
          depth: this.currentDepth,
          gameMode: this.gameMode,
          isLevelPublisher: String(this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray()[0]?.value || "") === playerId,
          pos: spawnPos
        })
      };
      server.send(JSON.stringify(welcome));

      this.broadcast({
        protocolVersion: "1.0.0",
        messageType: "PLAYER_JOINED",
        senderId: playerId,
        payloadJson: JSON.stringify({ playerId, pos: spawnPos })
      }, server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("MatchRoom Durable Object Active", { status: 200 });
  }
}
