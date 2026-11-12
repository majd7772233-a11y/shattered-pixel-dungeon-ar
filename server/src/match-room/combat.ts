import type { NetworkMessage, SessionData } from "../protocol/types";
import { mergeNativeCombatAttackerState } from "../validators/combat-state";
import { canAbortNativeFloorTransition } from "../validators/floor-transitions";
import { MatchRoomPersistence } from "./persistence";

export class MatchRoomCombat extends MatchRoomPersistence {
  protected abortPendingLevelTransition(pending: any, reasonCode: string): boolean {
    const currentRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
    let currentPending: any = null;
    try { currentPending = currentRow && typeof currentRow.value === "string"
      ? JSON.parse(String(currentRow.value)) : null; } catch (_) {}
    if (!canAbortNativeFloorTransition(this.currentDepth, pending) || !currentPending
        || currentPending.startedAt !== pending.startedAt
        || currentPending.fromDepth !== this.currentDepth) return false;

    const payload = {
      playerId: String(pending.initiatorId || ""),
      fromDepth: Number(pending.fromDepth),
      depth: Number(pending.depth),
      transitionPos: Number(pending.transitionPos),
      targetBranch: 0,
      reasonCode
    };
    this.sql.exec("DELETE FROM room_meta WHERE key = 'transitionPending'");
    this.sql.exec("DELETE FROM room_meta WHERE key LIKE 'transitionReady:%'");
    this.currentSequence++;
    this.sql.exec("INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
      this.currentSequence, "server", "LEVEL_TRANSITION_ABORTED", JSON.stringify(payload));
    const eventBatch = [{
      sequence: this.currentSequence,
      sender_id: "server",
      event_type: "LEVEL_TRANSITION_ABORTED",
      payload: JSON.stringify(payload)
    }];
    const message = JSON.stringify({
      protocolVersion: "1.0.0",
      messageType: "EVENT_BATCH",
      senderId: "server",
      sequence: this.currentSequence,
      payloadJson: JSON.stringify(eventBatch)
    });
    for (const peer of this.state.getWebSockets()) {
      try { peer.send(message); } catch (_) {}
    }
    return true;
  }

  protected reconcileCombatAttackerState(
    pending: any,
    authorityStateAfter: unknown,
    allowNativeMaxHpIncrease: boolean = false
  ): string | null {
    if (!pending || typeof pending.attackerId !== "string" || typeof pending.attackerStateBefore !== "string") return null;
    const playerId = pending.attackerId;
    const stateRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + playerId).toArray()[0];
    const trustedState = stateRow && typeof stateRow.value === "string" ? String(stateRow.value) : "";
    const playerRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", playerId).toArray()[0];
    if (!trustedState || !playerRow) return null;
    // Use the same exact pre-state checks and bounded native transition rules for delegated
    // results and attacks published directly by this player's own client.
    return mergeNativeCombatAttackerState(
      trustedState,
      pending.attackerStateBefore,
      authorityStateAfter,
      playerRow,
      allowNativeMaxHpIncrease
    );
  }

  protected clearPendingCombat(pending: any) {
    if (!pending || typeof pending !== "object") return;
    if (typeof pending.requestId === "string") {
      this.sql.exec("DELETE FROM room_meta WHERE key = ?", "pendingCombat:" + pending.requestId);
    }
    if (typeof pending.attackerId === "string") {
      this.sql.exec("DELETE FROM room_meta WHERE key = ?", "pendingCombatAttacker:" + pending.attackerId);
    }
    if (typeof pending.targetLockKey === "string") {
      this.sql.exec("DELETE FROM room_meta WHERE key = ?", "pendingCombatTarget:" + pending.targetLockKey);
    }
  }

  /** Reserve one native combat per attacker and target; stale reservations expire after 15 seconds. */

  protected reservePendingCombat(pending: any): boolean {
    if (!pending || typeof pending.requestId !== "string" || typeof pending.attackerId !== "string") return false;
    const now = Date.now();
    const lockKeys = ["pendingCombatAttacker:" + pending.attackerId];
    if (typeof pending.targetLockKey === "string" && pending.targetLockKey.length > 0) {
      lockKeys.push("pendingCombatTarget:" + pending.targetLockKey);
    }
    for (const key of lockKeys) {
      const lock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", key).toArray()[0];
      if (!lock || typeof lock.value !== "string") continue;
      const previousRequestId = String(lock.value);
      const row = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombat:" + previousRequestId).toArray()[0];
      let previous: any = null;
      try { previous = row && typeof row.value === "string" ? JSON.parse(String(row.value)) : null; } catch (_) {}
      if (previous && Number.isFinite(Number(previous.createdAt)) && now - Number(previous.createdAt) <= 15000) return false;
      if (previous) this.clearPendingCombat(previous);
      else this.sql.exec("DELETE FROM room_meta WHERE key = ?", key);
    }
    pending.createdAt = now;
    this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      "pendingCombat:" + pending.requestId, JSON.stringify(pending));
    for (const key of lockKeys) {
      this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        key, pending.requestId);
    }
    return true;
  }

  protected isMeleeAdjacent(fromPos: number, toPos: number, depth: number): boolean {
    const row = this.sql.exec(`SELECT width,height FROM levels WHERE depth = ?`, depth).toArray()[0];
    if (!row) return false;
    const width = Number(row.width), height = Number(row.height);
    if (!Number.isInteger(fromPos) || !Number.isInteger(toPos) || fromPos < 0 || toPos < 0
      || fromPos >= width * height || toPos >= width * height || fromPos === toPos) return false;
    const dx = Math.abs((fromPos % width) - (toPos % width));
    const dy = Math.abs(Math.floor(fromPos / width) - Math.floor(toPos / width));
    if (dx > 1 || dy > 1) return false;
    if (dx === 1 && dy === 1) {
      const sideA = Math.floor(fromPos / width) * width + (toPos % width);
      const sideB = Math.floor(toPos / width) * width + (fromPos % width);
      const sides = this.sql.exec(`SELECT passable,solid FROM level_tiles WHERE depth = ? AND pos IN (?,?)`, depth, sideA, sideB).toArray();
      if (sides.length !== 2 || sides.some((t: any) => Number(t.passable) !== 1 || Number(t.solid) === 1)) return false;
    }
    return true;
  }

  protected isCombatDestinationFree(pos: number, depth: number, targetType: string, targetId: string | number): boolean {
    if (targetType === "MOB") {
      const mobRows = this.sql.exec(`SELECT mob_id FROM mobs WHERE depth = ? AND hp > 0 AND pos = ? AND mob_id != ?`,
        depth, pos, Number(targetId)).toArray();
      const playerRows = this.sql.exec(`SELECT player_id FROM players WHERE state = 'ALIVE' AND pos = ?`, pos).toArray();
      return mobRows.length === 0 && playerRows.length === 0;
    }
    const playerRows = this.sql.exec(`SELECT player_id FROM players WHERE state = 'ALIVE' AND pos = ? AND player_id != ?`,
      pos, String(targetId)).toArray();
    const mobRows = this.sql.exec(`SELECT mob_id FROM mobs WHERE depth = ? AND hp > 0 AND pos = ?`, depth, pos).toArray();
    return playerRows.length === 0 && mobRows.length === 0;
  }

  protected isValidCombatTargetPosition(pos: number, depth: number): boolean {
    const level = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, depth).toArray()[0];
    if (!level) return false;
    const width = Number(level.width), height = Number(level.height);
    if (!Number.isInteger(pos) || pos < 0 || pos >= width * height) return false;
    const tile = this.sql.exec(`SELECT passable, solid FROM level_tiles WHERE depth = ? AND pos = ?`, depth, pos).toArray()[0];
    return !!tile && Number(tile.solid) !== 1 && Number(tile.passable) === 1;
  }

  public hasLineOfSight(fromPos: number, toPos: number, depth: number): boolean {
    const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, depth).toArray();
    const width = levelRow.length > 0 ? Number(levelRow[0].width) : 32;
    const height = levelRow.length > 0 ? Number(levelRow[0].height) : 32;
    if (fromPos < 0 || toPos < 0 || fromPos >= width * height || toPos >= width * height) return false;
    let x0 = fromPos % width;
    let y0 = Math.floor(fromPos / width);
    const x1 = toPos % width;
    const y1 = Math.floor(toPos / width);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (x0 !== x1 || y0 !== y1) {
      const currentCell = y0 * width + x0;
      if (currentCell !== fromPos && currentCell !== toPos) {
        const tile = this.sql.exec(`SELECT solid, los_blocking FROM level_tiles WHERE depth = ? AND pos = ?`, depth, currentCell).toArray();
        if (tile.length > 0 && (Number(tile[0].solid) === 1 || Number(tile[0].los_blocking) === 1)) {
          return false;
        }
      }

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    return true;
  }

  protected broadcastWithFOV(senderId: string, eventType: string, actionPayload: any, excludeWs?: WebSocket) {
    const senderRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, senderId).toArray();
    const senderPos = senderRow.length > 0 ? Number(senderRow[0].pos) : -1;
    const actionPos = actionPayload.pos !== undefined ? Number(actionPayload.pos)
      : actionPayload.toPos !== undefined ? Number(actionPayload.toPos)
      : actionPayload.targetPos !== undefined ? Number(actionPayload.targetPos)
      : senderPos;

    let targetPos = -1;
    const targetId = actionPayload.targetId || actionPayload.targetPlayerId;
    if (targetId !== undefined && targetId !== null) {
      const targetPlayer = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, String(targetId)).toArray();
      if (targetPlayer.length > 0) targetPos = Number(targetPlayer[0].pos);
      else {
        const targetMob = this.sql.exec(`SELECT pos FROM mobs WHERE mob_id = ? AND depth = ?`, Number(targetId), this.currentDepth).toArray();
        if (targetMob.length > 0) targetPos = Number(targetMob[0].pos);
      }
    }

    // WebSocket implementations may wrap the same accepted socket. Exclude by both
    // object identity and authenticated player identity so the action author never receives
    // its own sequenced EVENT_BATCH as a second copy of the request.
    let excludedPlayerId: string | null = null;
    if (excludeWs) {
      try {
        const excludedSession = excludeWs.deserializeAttachment() as SessionData | null;
        excludedPlayerId = excludedSession?.playerId || null;
      } catch (_) {}
    }

    for (const ws of this.state.getWebSockets()) {
      if (ws === excludeWs) continue;
      const recipientSession = ws.deserializeAttachment() as SessionData | null;
      if (!recipientSession || (excludedPlayerId && recipientSession.playerId === excludedPlayerId)) continue;

      let sendToClient = true;
      if (this.gameMode === "PVP_ARENA" || this.gameMode === "DEATHMATCH") {
        const recipientRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, recipientSession.playerId).toArray();
        if (recipientRow.length > 0) {
          const recipientPos = Number(recipientRow[0].pos);
          if (actionPos >= 0) sendToClient = this.hasLineOfSight(recipientPos, actionPos, this.currentDepth);
          // Combat events that identify a target are only disclosed when that target is visible too.
          if (sendToClient && targetPos >= 0) {
            sendToClient = this.hasLineOfSight(recipientPos, targetPos, this.currentDepth);
          }
          if (sendToClient && senderPos >= 0 && actionPos < 0) {
            sendToClient = this.hasLineOfSight(recipientPos, senderPos, this.currentDepth);
          }
        }
      }

      if (sendToClient) {
        try {
          const eventMsg: NetworkMessage = {
            protocolVersion: "1.0.0",
            messageType: "EVENT_BATCH",
            senderId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType, depth: this.currentDepth, action: actionPayload }])
          };
          ws.send(JSON.stringify(eventMsg));
        } catch (_) {}
      }
    }
  }
}
