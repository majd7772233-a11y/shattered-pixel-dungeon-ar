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

  protected connectedPlayerIds(): Set<string> {
    const connected = new Set<string>();
    for (const ws of this.state.getWebSockets()) {
      try {
        const session = ws.deserializeAttachment() as SessionData | null;
        if (session?.playerId) connected.add(String(session.playerId));
      } catch (_) {}
    }
    return connected;
  }

  protected currentLevelPublisherTerm(): number {
    const row = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = ?", "levelPublisherTerm").toArray()[0];
    if (row === undefined) return 0;
    const term = Number(row.value);
    return Number.isSafeInteger(term) && term >= 0 ? term : -1;
  }

  protected isLevelPublisherReady(): boolean {
    const owner = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
    if (!owner || typeof owner.value !== "string" || !owner.value) return false;
    const term = this.currentLevelPublisherTerm();
    const ready = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = ?", "levelPublisherReadyTerm").toArray()[0];
    return term >= 0 && ready !== undefined && Number(ready.value) === term;
  }

  protected levelPublisherStateMessage(reason: string): NetworkMessage {
    const publisherRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
    const termRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = ?", "levelPublisherTerm").toArray()[0];
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
