import type { NetworkMessage, SessionData } from "../protocol/types";

export class MatchRoomBase {
  state: DurableObjectState;
  sql: SqlStorage;
  currentSequence: number = 0;
  matchSeed: number = 123456789;
  currentDepth: number = 1;
  worldTime: number = 0.0;
  gameMode: "COOP_DUNGEON" | "PVP_ARENA" | "DEATHMATCH" | "SURVIVAL" = "COOP_DUNGEON";
  gameStatus: "LOBBY" | "PLAYING" | "ENDED" = "LOBBY";

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sql = state.storage.sql;
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const session = ws.deserializeAttachment() as SessionData | null;
    if (session) {
      this.sql.exec(`UPDATE players SET connected = 0 WHERE player_id = ?`, session.playerId);
      this.broadcast({
        protocolVersion: "1.0.0",
        messageType: "PLAYER_LEFT",
        senderId: session.playerId,
        payloadJson: JSON.stringify({ playerId: session.playerId, code, reason })
      });
    }
  }

  protected levelPublisherStateMessage(reason: string): NetworkMessage {
    const publisherRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
    const termRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = 'levelPublisherTerm'").toArray()[0];
    const termValue = Number(termRow?.value);
    const term = Number.isSafeInteger(termValue) && termValue >= 0 ? termValue : 0;
    return {
      protocolVersion: "1.0.0",
      messageType: "LEVEL_PUBLISHER_CHANGED",
      sequence: this.currentSequence,
      senderId: "SERVER",
      payloadJson: JSON.stringify({
        publisherId: publisherRow && typeof publisherRow.value === "string"
          ? String(publisherRow.value) : null,
        term,
        reason
      })
    };
  }

  protected broadcast(msg: NetworkMessage, excludeWs?: WebSocket) {
    const str = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws !== excludeWs) {
        try {
          ws.send(str);
        } catch (_) {}
      }
    }
  }
}
