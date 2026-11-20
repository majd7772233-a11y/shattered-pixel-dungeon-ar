import type { NetworkMessage, SessionData } from "../protocol/types";

export const MAX_REPLAY_WINDOW_EVENTS = 200;
export const MAX_RETAINED_LIFELINK_DAMAGE_EVENTS_PER_PLAYER = 513;

export class MatchRoomBase {
  state: DurableObjectState;
  sql: SqlStorage;
  currentSequence: number = 0;
  matchSeed: number = 123456789;
  currentDepth: number = 1;
  worldTime: number = 0.0;
  gameMode: "COOP_DUNGEON" | "PVP_ARENA" | "DEATHMATCH" | "SURVIVAL" = "COOP_DUNGEON";
  gameStatus: "LOBBY" | "PLAYING" | "ENDED" = "LOBBY";

  /**
   * Persist the room cursor/status and bound replay history without discarding evidence
   * still required by the native LifeLink validation path.
   *
   * Replay keeps the newest 200 events. In addition, each sender retains the most recent
   * 513 CHAR_DAMAGED rows since their newest HERO_BUFF_TICKED row (513 intentionally
   * preserves the validator's over-512 fail-closed signal), plus their latest buff/damage
   * boundary rows. These proof rows are not replay retention; they are validation state.
   */
  protected persistEventLogState(): void {
    this.sql.exec(
      "INSERT INTO room_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      "currentSequence", String(this.currentSequence)
    );
    this.sql.exec(
      "INSERT INTO room_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      "gameStatus", this.gameStatus
    );
    this.sql.exec(`
      WITH ranked_lifelink_damage AS (
        SELECT e.sequence,
          ROW_NUMBER() OVER (PARTITION BY e.sender_id ORDER BY e.sequence DESC) AS evidence_rank
        FROM events e
        WHERE e.event_type = 'CHAR_DAMAGED'
          AND e.sequence > COALESCE((
            SELECT MAX(h.sequence) FROM events h
            WHERE h.sender_id = e.sender_id AND h.event_type = 'HERO_BUFF_TICKED'
          ), 0)
      ),
      protected_events AS (
        SELECT sequence FROM ranked_lifelink_damage WHERE evidence_rank <= ?
        UNION
        SELECT MAX(sequence) FROM events WHERE event_type = 'HERO_BUFF_TICKED' GROUP BY sender_id
        UNION
        SELECT MAX(sequence) FROM events WHERE event_type = 'PLAYER_DAMAGED' GROUP BY sender_id
      )
      DELETE FROM events
      WHERE sequence NOT IN (SELECT sequence FROM events ORDER BY sequence DESC LIMIT ?)
        AND sequence NOT IN (SELECT sequence FROM protected_events)
    `, MAX_RETAINED_LIFELINK_DAMAGE_EVENTS_PER_PLAYER, MAX_REPLAY_WINDOW_EVENTS);
  }
  /**
   * Returns only the bounded client replay window. Older protected LifeLink evidence remains
   * in SQLite for server-side validation, but is not replay history and must not inflate SNAPSHOT.
   */
  protected replayWindowEvents(): any[] {
    const newestFirst = this.sql.exec(
      "SELECT sequence, sender_id, event_type, payload FROM events ORDER BY sequence DESC LIMIT ?",
      MAX_REPLAY_WINDOW_EVENTS
    ).toArray();
    return newestFirst.reverse();
  }

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sql = state.storage.sql;
  }

  /** Lifecycle extension point invoked only after publisher rebase commits durably. */
  protected onPublisherRecoveryCommitted(): void {}

  protected isRoomLifecycleEnabled(): boolean {
    const row = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "roomLifecycleVersion").toArray()[0];
    return String(row?.value || "") === "1";
  }

  protected isRoomMember(playerId: string): boolean {
    if (!playerId) return false;
    return this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "roomMember:" + playerId).toArray().length === 1;
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const session = ws.deserializeAttachment() as SessionData | null;
    if (session) {
      if (session.sessionToken) {
        if (this.isRoomLifecycleEnabled()) {
          this.sql.exec("UPDATE players SET connected = 0, ready = 0 WHERE player_id = ? AND session_token = ?",
            session.playerId, session.sessionToken);
        } else {
          this.sql.exec("UPDATE players SET connected = 0 WHERE player_id = ? AND session_token = ?",
            session.playerId, session.sessionToken);
        }
      } else if (this.isRoomLifecycleEnabled()) {
        this.sql.exec("UPDATE players SET connected = 0, ready = 0 WHERE player_id = ?", session.playerId);
      } else {
        this.sql.exec("UPDATE players SET connected = 0 WHERE player_id = ?", session.playerId);
      }
      if (!this.isRoomLifecycleEnabled()) {
        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "PLAYER_LEFT",
          senderId: session.playerId,
          payloadJson: JSON.stringify({ playerId: session.playerId, code, reason })
        });
      }
    }
  }

  protected connectedPlayerIds(): Set<string> {
    const connected = new Set<string>();
    for (const ws of this.state.getWebSockets()) {
      try {
        const session = ws.deserializeAttachment() as SessionData | null;
        if (session?.playerId && (!this.isRoomLifecycleEnabled() || this.isRoomMember(String(session.playerId)))) {
          connected.add(String(session.playerId));
        }
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
