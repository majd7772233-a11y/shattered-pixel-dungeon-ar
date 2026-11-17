import type { NetworkMessage, SessionData } from "../protocol/types";
import { validateWorkerInboundEnvelope } from "../protocol/message-admission";
import { MatchRoomLifecycle } from "./lifecycle";

export class MatchRoomMessages extends MatchRoomLifecycle {
  private sendProtocolError(ws: WebSocket, requestId: string | undefined, error: string): void {
    try {
      ws.send(JSON.stringify({
        protocolVersion: "1.0.0",
        messageType: "ERROR",
        ...(requestId ? { requestId } : {}),
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ error })
      }));
    } catch (_) {
      // A disconnected socket cannot receive a rejection; no state was committed here.
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    let requestId: string | undefined;
    try {
      const session = ws.deserializeAttachment() as SessionData | null;
      if (!session || typeof session.playerId !== "string" || session.playerId.length === 0
          || typeof session.sessionToken !== "string" || session.sessionToken.length === 0) {
        this.sendProtocolError(ws, undefined, "SESSION_REQUIRED");
        return;
      }

      if (typeof message !== "string") {
        this.sendProtocolError(ws, undefined, "UNSUPPORTED_FRAME_TYPE");
        return;
      }

      let rawMessage: unknown;
      try {
        rawMessage = JSON.parse(message);
      } catch (_) {
        this.sendProtocolError(ws, undefined, "MALFORMED_MESSAGE_ENVELOPE");
        return;
      }

      const admission = validateWorkerInboundEnvelope(rawMessage);
      if (!admission.ok) {
        this.sendProtocolError(ws, admission.requestId, admission.error);
        return;
      }

      const msg: NetworkMessage = admission.message;
      requestId = admission.requestId;

      // A superseded socket may still deliver frames after a newer authenticated reconnect.
      // The durable row's current token, not the stale attachment alone, decides session ownership.
      const activeSession = this.sql.exec(
        "SELECT session_token FROM players WHERE player_id = ?", session.playerId
      ).toArray();
      if (activeSession.length !== 1
          || String(activeSession[0].session_token || "") !== session.sessionToken) {
        this.sendProtocolError(ws, requestId, "SESSION_REPLACED");
        try { ws.close(4001, "Session replaced"); } catch (_) {}
        return;
      }

      // Never trust senderId from the frame; the accepted WebSocket attachment is authoritative.
      msg.senderId = session.playerId;

      const lifecycleEnabled = this.isRoomLifecycleEnabled();
      if (lifecycleEnabled && !["PING", "RECONNECT", "CREATE_ROOM", "JOIN_ROOM", "MATCH_START", "LEAVE"].includes(msg.messageType)
          && !this.isRoomMember(session.playerId)) {
        this.sendProtocolError(ws, requestId, "ROOM_MEMBERSHIP_REQUIRED");
        return;
      }

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
        if (lifecycleEnabled && this.gameStatus !== "PLAYING") {
          this.sendProtocolError(ws, requestId, "MATCH_NOT_STARTED");
          return;
        }
        await this.handleAction(ws, msg, session);
        return;
      } else if (msg.messageType === "READY") {
        if (lifecycleEnabled) {
          await this.handleRoomLifecycleMessage(ws, msg, session);
          return;
        }
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
        if (lifecycleEnabled) this.broadcastToRoomMembers(msg);
        else this.broadcast(msg);
      } else if (msg.messageType === "CREATE_ROOM" || msg.messageType === "JOIN_ROOM"
          || msg.messageType === "MATCH_START" || msg.messageType === "LEAVE") {
        if (!lifecycleEnabled) {
          this.sendProtocolError(ws, requestId, "ROOM_LIFECYCLE_NOT_ENABLED");
          return;
        }
        await this.handleRoomLifecycleMessage(ws, msg, session);
      }
    } catch (error) {
      // Preserve the existing handler-error contract used by transaction rollback regressions.
      // Envelope admission failures above remain stable, explicit protocol error codes.
      this.sendProtocolError(ws, requestId,
        error instanceof Error && error.message ? error.message : "UNKNOWN_ERROR");
    }
  }
}
