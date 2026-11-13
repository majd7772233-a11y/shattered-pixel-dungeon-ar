import type { NetworkMessage, SessionData } from "../protocol/types";
import { MatchRoomActions } from "./actions";

export class MatchRoomMessages extends MatchRoomActions {
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    let requestId: string | undefined;
    try {
      const msg: NetworkMessage = JSON.parse(message);
      requestId = typeof msg.requestId === "string" && msg.requestId.length > 0
        ? msg.requestId : undefined;
      const session = ws.deserializeAttachment() as SessionData | null;
      if (!session) return;

      msg.senderId = session.playerId;

      if (msg.messageType === "RECONNECT") {
        await this.handleReconnect(ws, msg, session);
        return;
      }

      if (msg.messageType === "LEVEL_DATA") {
        await this.handleLevelData(ws, msg, session);
        return;
      }

      if (msg.messageType === "LEVEL_READY") {
        await this.handleLevelReady(ws, msg, session);
        return;
      }

      if (msg.messageType === "ACTION") {
        await this.handleAction(ws, msg, session);
        return;
      } else if (msg.messageType === "READY") {
        this.sql.exec(`UPDATE players SET ready = 1 WHERE player_id = ?`, session.playerId);
        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "READY",
          senderId: session.playerId,
          payloadJson: JSON.stringify({ playerId: session.playerId, ready: true })
        });
      } else if (msg.messageType === "RESYNC") {
        const events = this.sql.exec(`SELECT sequence, sender_id, event_type, payload FROM events ORDER BY sequence ASC`).toArray();
        const connectedPlayerIds = this.connectedPlayerIds();
        const players = this.sql.exec(`SELECT player_id, class_name, pos, hp, ht, ready, state FROM players`).toArray()
          .filter((player: any) => connectedPlayerIds.has(String(player.player_id))).map((player: any) => {
          const savedHero = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `heroState:${player.player_id}`).toArray()[0];
          return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
        });
        const mobs = this.sql.exec(`SELECT mob_id, name, pos, hp, ht FROM mobs WHERE depth = ?`, this.currentDepth).toArray();

        ws.send(JSON.stringify({
          protocolVersion: "1.0.0",
          messageType: "SNAPSHOT",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify({
            sequence: this.currentSequence,
            seed: this.matchSeed,
            depth: this.currentDepth,
            gameMode: this.gameMode,
            players,
            mobs,
            events,
            worldTime: this.worldTime,
            level: this.getCurrentLevelSnapshot()
          })
        }));
      } else if (msg.messageType === "PING") {
        ws.send(JSON.stringify({
          protocolVersion: "1.0.0",
          messageType: "PING",
          payloadJson: JSON.stringify({ pong: true })
        }));
      } else if (msg.messageType === "CHAT") {
        this.broadcast(msg);
      }
    } catch (e) {
      ws.send(JSON.stringify({
        protocolVersion: "1.0.0",
        messageType: "ERROR",
        ...(requestId ? { requestId } : {}),
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ error: (e as Error).message })
      }));
    }
  }
}
