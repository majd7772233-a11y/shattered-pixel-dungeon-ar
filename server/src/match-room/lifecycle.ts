import type { NetworkMessage, SessionData } from "../protocol/types";
import { hasCompleteNativeLevelSnapshot } from "../validators/world-state";
import { isValidNativeHeroStateJson } from "../validators/combat-state";
import { MatchRoomActions } from "./actions";

const ROOM_CAPACITY_BY_MODE: Record<string, number> = {
  COOP_DUNGEON: 4,
  PVP_ARENA: 4,
  DEATHMATCH: 6,
  SURVIVAL: 4
};

const ROOM_MIN_PLAYERS_BY_MODE: Record<string, number> = {
  COOP_DUNGEON: 2,
  PVP_ARENA: 2,
  DEATHMATCH: 2,
  SURVIVAL: 2
};

const ROOM_MEMBER_PREFIX = "roomMember:";
const ROOM_READY_PREFIX = "roomReady:";

interface RoomMemberState {
  playerId: string;
  joinedAt: number;
  ready: boolean;
  connected: boolean;
  className: string;
  pos: number;
  state: string;
}

/** Durable room membership and lobby operations. Legacy rooms remain on their existing path. */
export class MatchRoomLifecycle extends MatchRoomActions {

  private roomMetaValue(key: string): string | null {
    const row = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", key).toArray()[0];
    return row && row.value !== null && row.value !== undefined ? String(row.value) : null;
  }

  private setRoomMeta(key: string, value: string): void {
    this.sql.exec(
      "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key, value
    );
  }

  private deleteRoomMeta(key: string): void {
    this.sql.exec("DELETE FROM room_meta WHERE key = ?", key);
  }

  private roomMembers(): RoomMemberState[] {
    const rows = this.sql.exec(
      "SELECT key,value FROM room_meta WHERE substr(key,1,?) = ?", ROOM_MEMBER_PREFIX.length, ROOM_MEMBER_PREFIX
    ).toArray();
    const members: RoomMemberState[] = [];
    for (const row of rows) {
      const key = String(row.key || "");
      if (!key.startsWith(ROOM_MEMBER_PREFIX)) continue;
      const playerId = key.slice(ROOM_MEMBER_PREFIX.length);
      if (!playerId) continue;
      const player = this.sql.exec(
        "SELECT player_id,class_name,pos,ready,state,connected FROM players WHERE player_id = ?", playerId
      ).toArray()[0];
      if (!player) continue;
      let membership: any = null;
      try { membership = JSON.parse(String(row.value || "{}")); } catch (_) {}
      const joinedAt = Number(membership?.joinedAt);
      members.push({
        playerId,
        joinedAt: Number.isSafeInteger(joinedAt) && joinedAt >= 0 ? joinedAt : 0,
        ready: Number(player.ready) === 1,
        connected: Number(player.connected) === 1,
        className: String(player.class_name || "WARRIOR"),
        pos: Number.isSafeInteger(Number(player.pos)) && Number(player.pos) >= 0 ? Number(player.pos) : 0,
        state: String(player.state || "ALIVE")
      });
    }
    return members.sort((left, right) => left.joinedAt - right.joinedAt || left.playerId.localeCompare(right.playerId));
  }

  private hasCurrentRoomReadyProof(playerId: string): boolean {
    const proofRow = this.roomMetaValue(ROOM_READY_PREFIX + playerId);
    let proof: any = null;
    try { proof = proofRow ? JSON.parse(proofRow) : null; } catch (_) {}
    return !!proof && proof.ready === true && Number(proof.seed) === this.matchSeed
      && Number(proof.sequence) === this.currentSequence;
  }

  private roomStatePayload(reason: string): Record<string, unknown> {
    const mode = this.roomMetaValue("gameMode") || this.gameMode;
    const rawMembers = this.roomMembers();
    // For Co-op, expose only server-verified readiness; clients can validate allReady
    // from the same roster projection without receiving or trusting the ready-proof rows.
    const members = mode === "COOP_DUNGEON"
      ? rawMembers.map(member => ({
        ...member,
        ready: member.ready && this.hasCurrentRoomReadyProof(member.playerId)
      }))
      : rawMembers;
    const parsedCapacity = Number(this.roomMetaValue("roomCapacity"));
    const capacity = Number.isSafeInteger(parsedCapacity) && parsedCapacity === ROOM_CAPACITY_BY_MODE[mode]
      ? parsedCapacity : (ROOM_CAPACITY_BY_MODE[mode] || 4);
    const ownerId = this.roomMetaValue("roomOwnerId");
    const snapshot = this.getCurrentLevelSnapshot();
    const snapshotReady = hasCompleteNativeLevelSnapshot(snapshot)
      && Number((snapshot as any).depth) === this.currentDepth
      && Number((snapshot as any).seed) === this.matchSeed;
    const roomClosed = this.roomMetaValue("roomClosed") === "1";
    const storedRoomStatus = this.roomMetaValue("roomLifecycleState") || "LOBBY";
    const allReady = members.length > 0 && members.every(member => member.connected && member.ready);
    const enoughPlayers = members.length >= (ROOM_MIN_PLAYERS_BY_MODE[mode] || 2);

    const publisherId = this.roomMetaValue("levelPublisher");
    const publisherPresent = !!publisherId && members.some(member => member.playerId === publisherId
      && member.connected && (mode !== "COOP_DUNGEON" || member.state === "ALIVE"));
    const publisherReady = this.isLevelPublisherReady();
    let roomStatus = storedRoomStatus;
    if (roomClosed || storedRoomStatus === "CLOSED") {
      roomStatus = "CLOSED";
    } else if (this.gameStatus === "ENDED" || storedRoomStatus === "ENDED") {
      roomStatus = "ENDED";
    } else if (mode === "COOP_DUNGEON" && this.gameStatus === "PLAYING") {
      if (storedRoomStatus === "SUSPENDED" || !publisherPresent) {
        roomStatus = "SUSPENDED";
      } else if (storedRoomStatus === "RECOVERING" || !publisherReady) {
        roomStatus = "RECOVERING";
      } else {
        roomStatus = "PLAYING";
      }
    } else if (mode === "COOP_DUNGEON" && this.gameStatus === "LOBBY") {
      roomStatus = enoughPlayers && allReady && snapshotReady && publisherPresent && publisherReady
        ? "READY" : "LOBBY";
    }
    return {
      lifecycleVersion: 1,
      roomCreated: this.roomMetaValue("roomCreated") === "1",
      roomClosed,
      roomStatus,
      gameStatus: this.gameStatus,
      ownerId: ownerId || null,
      gameMode: mode,
      seed: this.matchSeed,
      depth: this.currentDepth,
      sequence: this.currentSequence,
      maxPlayers: capacity,
      memberCount: members.length,
      allReady,
      worldSnapshotReady: snapshotReady,
      members,
      reason
    };
  }

  private sendRoomRosterToSocket(ws: WebSocket): void {
    for (const member of this.roomMembers()) {
      const message: NetworkMessage = { protocolVersion: "1.0.0", messageType: "PLAYER_JOINED", senderId: member.playerId, sequence: this.currentSequence, payloadJson: JSON.stringify({ playerId: member.playerId, pos: member.pos }) };
      try { ws.send(JSON.stringify(message)); } catch (_) { return; }
    }
  }

  protected sendRoomStateToSocket(ws: WebSocket, reason: string): void {
    try {
      const message: NetworkMessage = {
        protocolVersion: "1.0.0",
        messageType: "ROOM_STATE",
        sequence: this.currentSequence,
        senderId: "SERVER",
        payloadJson: JSON.stringify(this.roomStatePayload(reason))
      };
      ws.send(JSON.stringify(message));
      if (reason === "SESSION_RESUMED" || reason === "ALREADY_MEMBER") {
        this.sendRoomRosterToSocket(ws);
        if (hasCompleteNativeLevelSnapshot(this.getCurrentLevelSnapshot())) this.broadcastRoomSnapshot();
      }
    } catch (error) {
      // Do not silently hide a rejected oversized snapshot from a resumed member.
      try {
        ws.send(JSON.stringify({
          protocolVersion: "1.0.0",
          messageType: "ERROR",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify({
            error: error instanceof Error && error.message ? error.message : "UNKNOWN_ERROR"
          })
        }));
      } catch (_) {}
    }
  }

  protected override onMatchEndCommitted(): void {
    this.broadcastRoomState("MATCH_ENDED");
  }

  protected override onPublisherRecoveryCommitted(): void {
    // Rebase state and publisher-ready term are already committed in SQLite.
    this.broadcastRoomSnapshot();
    this.broadcastRoomState("PUBLISHER_RECOVERED");
  }

  protected override onPublisherAuthorityChangedCommitted(reason: string): void {
    this.broadcast(this.levelPublisherStateMessage(reason));
    this.broadcastRoomState(reason);
  }

  protected override onCoopLifeStateChangedCommitted(reason: string): void {
    this.broadcastRoomState(reason);
  }

  protected broadcastRoomState(reason: string): void {
    const message: NetworkMessage = {
      protocolVersion: "1.0.0",
      messageType: "ROOM_STATE",
      sequence: this.currentSequence,
      senderId: "SERVER",
      payloadJson: JSON.stringify(this.roomStatePayload(reason))
    };
    this.broadcastToRoomMembers(message);
  }

  protected broadcastToRoomMembers(message: NetworkMessage, excludeWs?: WebSocket): void {
    this.broadcastSerializedToRoomMembers(JSON.stringify(message), excludeWs);
  }

  protected broadcastSerializedToRoomMembers(serialized: string, excludeWs?: WebSocket): void {
    for (const socket of this.state.getWebSockets()) {
      if (socket === excludeWs) continue;
      try {
        const session = socket.deserializeAttachment() as SessionData | null;
        if (!session?.playerId || !this.isRoomMember(String(session.playerId))) continue;
        const row = this.sql.exec(
          "SELECT session_token FROM players WHERE player_id = ?", session.playerId
        ).toArray()[0];
        if (!row || String(row.session_token || "") !== String(session.sessionToken || "")) continue;
        this.sendRoomSocketMessage(socket, serialized);
      } catch (_) {}
    }
  }

  private sendLifecycleError(ws: WebSocket, msg: NetworkMessage, error: string): void {
    try {
      ws.send(JSON.stringify({
        protocolVersion: "1.0.0",
        messageType: "ERROR",
        ...(msg.requestId ? { requestId: msg.requestId } : {}),
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ error })
      }));
    } catch (_) {}
  }

  private sendLifecycleAck(ws: WebSocket, msg: NetworkMessage, operation: string): void {
    try {
      ws.send(JSON.stringify({
        protocolVersion: "1.0.0",
        messageType: "ACK",
        ...(msg.requestId ? { requestId: msg.requestId } : {}),
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ accepted: true, operation })
      }));
    } catch (_) {}
  }

  protected async handleRoomLifecycleMessage(ws: WebSocket, msg: NetworkMessage, session: SessionData): Promise<void> {
    if (!this.isRoomLifecycleEnabled()) {
      this.sendLifecycleError(ws, msg, "ROOM_LIFECYCLE_NOT_ENABLED");
      return;
    }

    let payload: any;
    try { payload = JSON.parse(msg.payloadJson || "{}"); } catch (_) { payload = null; }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      this.sendLifecycleError(ws, msg, "INVALID_ROOM_OPERATION");
      return;
    }

    if (msg.messageType === "CREATE_ROOM") {
      const requestedMode = String(payload.gameMode || this.gameMode).trim().toUpperCase();
      const capacity = ROOM_CAPACITY_BY_MODE[requestedMode];
      if (!capacity) {
        this.sendLifecycleError(ws, msg, "INVALID_GAME_MODE");
        return;
      }
      const player = this.sql.exec(
        "SELECT connected FROM players WHERE player_id = ?", session.playerId
      ).toArray()[0];
      if (!player || Number(player.connected) !== 1) {
        this.sendLifecycleError(ws, msg, "SESSION_NOT_CONNECTED");
        return;
      }
      if (this.roomMetaValue("roomClosed") === "1") {
        this.sendLifecycleError(ws, msg, "ROOM_CLOSED");
        return;
      }
      if (this.roomMetaValue("roomCreated") === "1" || this.roomMembers().length > 0) {
        this.sendLifecycleError(ws, msg, "ROOM_ALREADY_EXISTS");
        return;
      }
      if (this.gameStatus !== "LOBBY") {
        this.sendLifecycleError(ws, msg, "MATCH_ALREADY_STARTED");
        return;
      }
      const publisherRow = this.sql.exec(
        "SELECT value FROM room_meta WHERE key = 'levelPublisher'"
      ).toArray()[0];
      const termRow = this.sql.exec(
        "SELECT value FROM room_meta WHERE key = 'levelPublisherTerm'"
      ).toArray()[0];
      const currentTerm = termRow === undefined ? 0 : Number(termRow.value);
      if (!Number.isSafeInteger(currentTerm) || currentTerm < 0 || currentTerm >= Number.MAX_SAFE_INTEGER) {
        this.sendLifecycleError(ws, msg, "INVALID_LEVEL_PUBLISHER_TERM");
        return;
      }
      if (publisherRow && String(publisherRow.value || "") !== session.playerId) {
        this.sendLifecycleError(ws, msg, "ROOM_CREATOR_AUTHORITY_MISMATCH");
        return;
      }
      try {
        this.state.storage.transactionSync(() => {
          const created = this.roomMetaValue("roomCreated");
          if (created === "1" || this.roomMetaValue("roomClosed") === "1") throw new Error("ROOM_ALREADY_EXISTS");
          const now = Date.now();
          this.setRoomMeta("roomCreated", "1");
          this.setRoomMeta("roomLifecycleState", "LOBBY");
          this.setRoomMeta("roomOwnerId", session.playerId);
          this.setRoomMeta("roomCapacity", String(capacity));
          this.setRoomMeta("gameMode", requestedMode);
          this.setRoomMeta("seed", String(this.matchSeed));
          this.setRoomMeta(ROOM_MEMBER_PREFIX + session.playerId, JSON.stringify({ joinedAt: now, role: "OWNER" }));
          this.sql.exec("UPDATE players SET ready = 0, connected = 1 WHERE player_id = ?", session.playerId);
          if (!publisherRow) {
            this.setRoomMeta("levelPublisher", session.playerId);
            this.setRoomMeta("levelPublisherTerm", String(currentTerm + 1));
            this.setRoomMeta("levelPublisherReadyTerm", String(currentTerm + 1));
          }
        });
      } catch (error) {
        this.sendLifecycleError(ws, msg, error instanceof Error ? error.message : "ROOM_CREATE_FAILED");
        return;
      }
      this.gameMode = requestedMode as typeof this.gameMode;
      this.sendLifecycleAck(ws, msg, "CREATE_ROOM");
      this.broadcastToRoomMembers(this.levelPublisherStateMessage("ROOM_CREATED"));
      this.broadcastRoomState("ROOM_CREATED");
      return;
    }

    if (msg.messageType === "JOIN_ROOM") {
      const existingMember = this.isRoomMember(session.playerId);
      if (this.roomMetaValue("roomClosed") === "1" || this.roomMetaValue("roomLifecycleState") === "CLOSED") {
        this.sendLifecycleError(ws, msg, "ROOM_CLOSED");
        return;
      }
      if (this.roomMetaValue("roomCreated") !== "1") {
        this.sendLifecycleError(ws, msg, "ROOM_NOT_FOUND");
        return;
      }
      if (this.gameStatus !== "LOBBY" || this.roomMetaValue("roomLifecycleState") !== "LOBBY") {
        this.sendLifecycleError(ws, msg, "ROOM_NOT_JOINABLE");
        return;
      }
      const player = this.sql.exec(
        "SELECT connected FROM players WHERE player_id = ?", session.playerId
      ).toArray()[0];
      if (!player || Number(player.connected) !== 1) {
        this.sendLifecycleError(ws, msg, "SESSION_NOT_CONNECTED");
        return;
      }
      if (existingMember) {
        this.sendLifecycleAck(ws, msg, "JOIN_ROOM");
        this.sendRoomStateToSocket(ws, "ALREADY_MEMBER");
        return;
      }
      const members = this.roomMembers();
      const capacity = Number(this.roomMetaValue("roomCapacity"));
      if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 6) {
        this.sendLifecycleError(ws, msg, "ROOM_CAPACITY_INVALID");
        return;
      }
      if (members.length >= capacity) {
        this.sendLifecycleError(ws, msg, "ROOM_FULL");
        return;
      }
      try {
        this.state.storage.transactionSync(() => {
          if (this.roomMetaValue("roomLifecycleState") !== "LOBBY") throw new Error("ROOM_NOT_JOINABLE");
          if (this.roomMembers().length >= capacity && !this.isRoomMember(session.playerId)) throw new Error("ROOM_FULL");
          this.setRoomMeta(ROOM_MEMBER_PREFIX + session.playerId, JSON.stringify({ joinedAt: Date.now(), role: "PLAYER" }));
          this.setRoomMeta(ROOM_READY_PREFIX + session.playerId, JSON.stringify({ ready: false, seed: this.matchSeed, sequence: this.currentSequence }));
          this.sql.exec("UPDATE players SET ready = 0, connected = 1 WHERE player_id = ?", session.playerId);
          // Reject membership before commit if the resulting authoritative room snapshot is too large.
          this.buildSnapshotMessage("SERVER");
        });
      } catch (error) {
        this.sendLifecycleError(ws, msg, error instanceof Error ? error.message : "ROOM_JOIN_FAILED");
        return;
      }
      this.sendLifecycleAck(ws, msg, "JOIN_ROOM");
      this.sendRoomRosterToSocket(ws);
      const joinedMember = this.roomMembers().find(member => member.playerId === session.playerId);
      if (joinedMember) this.broadcastToRoomMembers({ protocolVersion: "1.0.0", messageType: "PLAYER_JOINED", senderId: joinedMember.playerId, sequence: this.currentSequence, payloadJson: JSON.stringify({ playerId: joinedMember.playerId, pos: joinedMember.pos }) }, ws);
      this.broadcastRoomState("PLAYER_JOINED_LOBBY");
      if (hasCompleteNativeLevelSnapshot(this.getCurrentLevelSnapshot())) this.broadcastRoomSnapshot();
      return;
    }

    if (msg.messageType === "READY") {
      if (!this.isRoomMember(session.playerId)) {
        this.sendLifecycleError(ws, msg, "ROOM_MEMBERSHIP_REQUIRED");
        return;
      }
      if (this.gameStatus !== "LOBBY" || this.roomMetaValue("roomLifecycleState") !== "LOBBY") {
        this.sendLifecycleError(ws, msg, "READY_STATE_LOCKED");
        return;
      }
      if (typeof payload.ready !== "boolean") {
        this.sendLifecycleError(ws, msg, "INVALID_READY_STATE");
        return;
      }
      const player = this.sql.exec(
        "SELECT connected FROM players WHERE player_id = ?", session.playerId
      ).toArray()[0];
      if (!player || Number(player.connected) !== 1) {
        this.sendLifecycleError(ws, msg, "SESSION_NOT_CONNECTED");
        return;
      }

      let heroStateJson: string | null = null;
      let heroClass: string | null = null;
      let hero: any = null;
      if (payload.ready) {
        const seed = Number(payload.seed);
        const sequence = Number(payload.sequence);
        if (!Number.isSafeInteger(seed) || seed !== this.matchSeed
            || !Number.isSafeInteger(sequence) || sequence !== this.currentSequence) {
          this.sendLifecycleError(ws, msg, "ROOM_WORLD_NOT_SYNCHRONIZED");
          return;
        }
        const level = this.getCurrentLevelSnapshot();
        const width = Number((level as any)?.width);
        const height = Number((level as any)?.height);
        heroStateJson = typeof payload.heroStateJson === "string" ? payload.heroStateJson : null;
        heroClass = typeof payload.className === "string" ? payload.className : null;
        try { hero = heroStateJson ? JSON.parse(heroStateJson) : null; } catch (_) { hero = null; }
        const allowedClasses = new Set(["WARRIOR", "MAGE", "ROGUE", "HUNTRESS", "DUELIST"]);
        if (!hasCompleteNativeLevelSnapshot(level)
            || Number((level as any).depth) !== this.currentDepth
            || Number((level as any).seed) !== this.matchSeed) {
          this.sendLifecycleError(ws, msg, "ROOM_START_SNAPSHOT_REQUIRED");
          return;
        }
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
            || width < 1 || height < 1 || width * height > 100000
            || !heroStateJson || !heroClass || !allowedClasses.has(heroClass)
            || !hero || !Number.isInteger(hero.hp) || hero.hp < 1
            || !Number.isInteger(hero.ht) || hero.ht < hero.hp
            || !Number.isInteger(hero.pos) || hero.pos < 0 || hero.pos >= width * height
            || !Number.isInteger(hero.shielding) || hero.shielding < 0) {
          this.sendLifecycleError(ws, msg, "INVALID_NATIVE_READY_STATE");
          return;
        }
        if (!isValidNativeHeroStateJson(heroStateJson, {
          hp: hero.hp, ht: hero.ht, pos: hero.pos, shielding: hero.shielding
        })) {
          this.sendLifecycleError(ws, msg, "INVALID_NATIVE_HERO_STATE_JSON");
          return;
        }
      }

      this.state.storage.transactionSync(() => {
        if (payload.ready && heroStateJson && heroClass && hero) {
          this.setRoomMeta("heroState:" + session.playerId, heroStateJson);
          this.sql.exec(
            "UPDATE players SET ready = 1, class_name = ?, pos = ?, hp = ?, ht = ?, state = 'ALIVE' WHERE player_id = ? AND connected = 1",
            heroClass, hero.pos, hero.hp, hero.ht, session.playerId
          );
        } else {
          this.sql.exec("UPDATE players SET ready = 0 WHERE player_id = ? AND connected = 1", session.playerId);
        }
        this.setRoomMeta(ROOM_READY_PREFIX + session.playerId, JSON.stringify({
          ready: payload.ready,
          seed: this.matchSeed,
          sequence: this.currentSequence
        }));
        // Hero/READY state contributes to every room SNAPSHOT; enforce its size before committing it.
        this.buildSnapshotMessage("SERVER");
      });
      this.sendLifecycleAck(ws, msg, "READY");
      this.broadcastToRoomMembers({
        protocolVersion: "1.0.0",
        messageType: "READY",
        senderId: session.playerId,
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ playerId: session.playerId, ready: payload.ready, seed: this.matchSeed, sequence: this.currentSequence })
      });
      this.broadcastRoomState("READY_CHANGED");
      return;
    }

    if (msg.messageType === "MATCH_START") {
      const operation = String(payload.operation || "START").toUpperCase();
      if (operation === "CANCEL") {
        if (this.roomMetaValue("roomOwnerId") !== session.playerId || this.gameStatus !== "LOBBY") {
          this.sendLifecycleError(ws, msg, "ROOM_START_CANCEL_FORBIDDEN");
          return;
        }
        this.state.storage.transactionSync(() => {
          for (const member of this.roomMembers()) {
            this.sql.exec("UPDATE players SET ready = 0 WHERE player_id = ?", member.playerId);
            this.setRoomMeta(ROOM_READY_PREFIX + member.playerId, JSON.stringify({ ready: false, seed: this.matchSeed, sequence: this.currentSequence }));
          }
          this.setRoomMeta("roomLifecycleState", "LOBBY");
        });
        this.sendLifecycleAck(ws, msg, "CANCEL_MATCH_START");
        this.broadcastRoomState("MATCH_START_CANCELLED");
        return;
      }
      if (operation !== "START") {
        this.sendLifecycleError(ws, msg, "INVALID_MATCH_START_OPERATION");
        return;
      }
      if (!this.isRoomMember(session.playerId)
          || this.roomMetaValue("roomOwnerId") !== session.playerId
          || this.roomMetaValue("levelPublisher") !== session.playerId) {
        this.sendLifecycleError(ws, msg, "MATCH_START_AUTHORITY_REQUIRED");
        return;
      }
      if (this.gameStatus !== "LOBBY" || this.roomMetaValue("roomLifecycleState") !== "LOBBY") {
        this.sendLifecycleError(ws, msg, "MATCH_ALREADY_STARTED");
        return;
      }
      const members = this.roomMembers();
      const minimumPlayers = ROOM_MIN_PLAYERS_BY_MODE[this.gameMode] || 2;
      if (members.length < minimumPlayers) {
        this.sendLifecycleError(ws, msg, "ROOM_NOT_ENOUGH_PLAYERS");
        return;
      }
      if (members.some(member => !member.connected || !member.ready)) {
        this.sendLifecycleError(ws, msg, "ROOM_PLAYERS_NOT_READY");
        return;
      }
      const seed = Number(payload.seed);
      const sequence = Number(payload.sequence);
      if (!Number.isSafeInteger(seed) || seed !== this.matchSeed
          || !Number.isSafeInteger(sequence) || sequence !== this.currentSequence
          || members.some(member => !this.hasCurrentRoomReadyProof(member.playerId))) {
        this.sendLifecycleError(ws, msg, "ROOM_WORLD_NOT_SYNCHRONIZED");
        return;
      }
      const level = this.getCurrentLevelSnapshot();
      if (!hasCompleteNativeLevelSnapshot(level)
          || Number((level as any).depth) !== this.currentDepth
          || Number((level as any).branch) !== 0
          || Number((level as any).seed) !== this.matchSeed) {
        this.sendLifecycleError(ws, msg, "ROOM_START_SNAPSHOT_REQUIRED");
        return;
      }
      if (!this.isLevelPublisherReady()) {
        this.sendLifecycleError(ws, msg, "ROOM_START_PUBLISHER_NOT_READY");
        return;
      }
      if (this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0) {
        this.sendLifecycleError(ws, msg, "ROOM_START_TRANSITION_PENDING");
        return;
      }
      try {
        this.state.storage.transactionSync(() => {
          if (this.gameStatus !== "LOBBY" || this.roomMetaValue("roomOwnerId") !== session.playerId) {
            throw new Error("MATCH_ALREADY_STARTED");
          }
          this.gameStatus = "PLAYING";
          this.setRoomMeta("roomLifecycleState", "PLAYING");
          this.setRoomMeta("roomStartedAt", String(Date.now()));
          this.persistEventLogState();
          // Prove the exact PLAYING room snapshot fits before committing the lifecycle transition.
          this.buildSnapshotMessage("SERVER");
        });
      } catch (error) {
        this.gameStatus = "LOBBY";
        this.sendLifecycleError(ws, msg, error instanceof Error ? error.message : "MATCH_START_FAILED");
        return;
      }
      this.broadcastToRoomMembers({
        protocolVersion: "1.0.0",
        messageType: "MATCH_START",
        senderId: "SERVER",
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({
          status: "PLAYING",
          ownerId: session.playerId,
          seed: this.matchSeed,
          gameMode: this.gameMode,
          depth: this.currentDepth,
          sequence: this.currentSequence,
          snapshotReady: true
        })
      });
      this.broadcastRoomSnapshot();
      this.sendLifecycleAck(ws, msg, "MATCH_START");
      this.broadcastRoomState("MATCH_STARTED");
      return;
    }

    if (msg.messageType === "LEAVE") {
      if (!this.isRoomMember(session.playerId)) {
        this.sendRoomStateToSocket(ws, "NOT_A_ROOM_MEMBER");
        return;
      }
      const lifecycleState = this.roomMetaValue("roomLifecycleState");
      const inMatchLeave = this.gameMode === "COOP_DUNGEON"
        && (this.gameStatus === "PLAYING" || this.gameStatus === "ENDED")
        && ["PLAYING", "SUSPENDED", "RECOVERING", "ENDED"].includes(String(lifecycleState || ""));
      if (inMatchLeave) {
        const previousGameStatus = this.gameStatus;
        const previousSequence = this.currentSequence;
        const previousOwner = this.roomMetaValue("roomOwnerId");
        let nextOwner: RoomMemberState | null = null;
        let leaveEventMessage: NetworkMessage | null = null;
        let matchEndMessage: NetworkMessage | null = null;
        let publisherChangedReason: string | null = null;
        try {
          this.state.storage.transactionSync(() => {
            if (!this.isRoomMember(session.playerId)) throw new Error("NOT_A_ROOM_MEMBER");
            this.deleteRoomMeta(ROOM_MEMBER_PREFIX + session.playerId);
            this.deleteRoomMeta(ROOM_READY_PREFIX + session.playerId);
            this.sql.exec(
              "UPDATE players SET connected = 0, ready = 0, state = 'LEFT' WHERE player_id = ?",
              session.playerId
            );
            const remaining = this.roomMembers();
            nextOwner = remaining.find(member => member.connected && member.state === "ALIVE")
              || remaining.find(member => member.connected) || remaining[0] || null;
            const ownerLeaving = previousOwner === session.playerId;
            if (ownerLeaving) this.setRoomMeta("roomOwnerId", nextOwner ? nextOwner.playerId : "");

            this.currentSequence++;
            const leavePayload = { playerId: session.playerId, reason: "VOLUNTARY_LEAVE" };
            this.sql.exec(
              "INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
              this.currentSequence, "SERVER", "PLAYER_LEFT", JSON.stringify(leavePayload)
            );
            this.persistEventLogState();
            leaveEventMessage = {
              protocolVersion: "1.0.0",
              messageType: "EVENT_BATCH",
              senderId: "SERVER",
              sequence: this.currentSequence,
              payloadJson: JSON.stringify([{
                sequence: this.currentSequence,
                eventType: "PLAYER_LEFT",
                depth: this.currentDepth,
                action: leavePayload
              }])
            };
            matchEndMessage = this.checkMatchEndCondition();
            const publisherRow = this.sql.exec(
              "SELECT value FROM room_meta WHERE key = ?", "levelPublisher"
            ).toArray()[0];
            const currentPublisherId = String(publisherRow?.value || "");
            if (currentPublisherId === session.playerId && !matchEndMessage) {
              publisherChangedReason = this.reassignCoopPublisherAfterAuthorityLoss(
                session.playerId, this.gameStatus === "LOBBY" ? "PUBLISHER_LEFT_LOBBY" : "PUBLISHER_LEFT_MATCH"
              );
            } else if (ownerLeaving && !matchEndMessage) {
              const activePublisher = currentPublisherId
                ? remaining.find(member => member.playerId === currentPublisherId && member.connected && member.state === "ALIVE")
                : null;
              if (activePublisher) {
                nextOwner = activePublisher;
                this.setRoomMeta("roomOwnerId", activePublisher.playerId);
              } else {
                publisherChangedReason = currentPublisherId
                  ? this.reassignCoopPublisherAfterAuthorityLoss(currentPublisherId, "PUBLISHER_LEFT_LOBBY")
                  : this.reassignCoopPublisherAfterAuthorityLoss(null, "PUBLISHER_LEFT_LOBBY");
              }
            }
            if (this.gameStatus === "LOBBY" && publisherChangedReason) {
              const electedPublisherId = this.roomMetaValue("levelPublisher");
              const electedPublisher = remaining.find(member => member.playerId === electedPublisherId
                && member.connected && member.state === "ALIVE");
              if (electedPublisher) {
                nextOwner = electedPublisher;
                this.setRoomMeta("roomOwnerId", electedPublisher.playerId);
              }
            }
          });
        } catch (error) {
          this.gameStatus = previousGameStatus;
          this.currentSequence = previousSequence;
          this.sendLifecycleError(ws, msg, error instanceof Error ? error.message : "ROOM_LEAVE_FAILED");
          return;
        }

        this.sendLifecycleAck(ws, msg, "LEAVE");
        this.sendRoomStateToSocket(ws, "ROOM_LEFT");
        if (leaveEventMessage) this.broadcastToRoomMembers(leaveEventMessage);
        if (matchEndMessage) {
          this.broadcastToRoomMembers(matchEndMessage);
          this.onMatchEndCommitted();
        } else if (publisherChangedReason) {
          this.onPublisherAuthorityChangedCommitted(publisherChangedReason);
        } else {
          this.broadcastRoomState("PLAYER_LEFT_MATCH");
        }
        try {
          if (typeof ws.close === "function") ws.close(1000, "LEFT_MATCH");
        } catch (_) {}
        return;
      }

      if (this.gameStatus !== "LOBBY" || lifecycleState !== "LOBBY") {
        this.sendLifecycleError(ws, msg, "MATCH_ALREADY_STARTED");
        return;
      }
      const previousOwner = this.roomMetaValue("roomOwnerId");
      let nextOwner: RoomMemberState | null = null;
      let publisherChangedReason: string | null = null;
      try {
        this.state.storage.transactionSync(() => {
          this.deleteRoomMeta(ROOM_MEMBER_PREFIX + session.playerId);
          this.deleteRoomMeta(ROOM_READY_PREFIX + session.playerId);
          this.sql.exec("UPDATE players SET connected = 0, ready = 0, state = 'LEFT' WHERE player_id = ?", session.playerId);
          const remaining = this.roomMembers();
          nextOwner = remaining.find(member => member.connected && member.state === "ALIVE")
            || remaining.find(member => member.connected)
            || remaining.find(member => member.state === "ALIVE") || remaining[0] || null;
          const currentPublisherId = this.roomMetaValue("levelPublisher");
          if (!nextOwner) {
            this.setRoomMeta("roomClosed", "1");
            this.setRoomMeta("roomLifecycleState", "CLOSED");
            this.setRoomMeta("roomOwnerId", "");
            this.deleteRoomMeta("levelPublisher");
            this.deleteRoomMeta("levelPublisherReadyTerm");
            const currentTerm = this.currentLevelPublisherTerm();
            if (currentTerm < 0 || currentTerm >= Number.MAX_SAFE_INTEGER) throw new Error("INVALID_LEVEL_PUBLISHER_TERM");
            this.setRoomMeta("levelPublisherTerm", String(currentTerm + 1));
          } else {
            if (previousOwner === session.playerId) {
              this.setRoomMeta("roomOwnerId", nextOwner.playerId);
              for (const member of remaining) {
                this.sql.exec("UPDATE players SET ready = 0 WHERE player_id = ?", member.playerId);
                this.setRoomMeta(ROOM_READY_PREFIX + member.playerId, JSON.stringify({ ready: false, seed: this.matchSeed, sequence: this.currentSequence }));
              }
            }
            if (currentPublisherId === session.playerId) {
              publisherChangedReason = this.reassignCoopPublisherAfterAuthorityLoss(
                session.playerId, "PUBLISHER_LEFT_LOBBY"
              );
            } else if (!currentPublisherId && previousOwner === session.playerId) {
              publisherChangedReason = this.reassignCoopPublisherAfterAuthorityLoss(
                null, "PUBLISHER_LEFT_LOBBY"
              );
            }
          }
        });
      } catch (error) {
        this.sendLifecycleError(ws, msg, error instanceof Error ? error.message : "ROOM_LEAVE_FAILED");
        return;
      }
      this.broadcastToRoomMembers({
        protocolVersion: "1.0.0",
        messageType: "PLAYER_LEFT",
        senderId: session.playerId,
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ playerId: session.playerId, reason: "ROOM_LEAVE" })
      });
      this.sendLifecycleAck(ws, msg, "LEAVE");
      this.sendRoomStateToSocket(ws, "ROOM_LEFT");
      if (publisherChangedReason) this.onPublisherAuthorityChangedCommitted(publisherChangedReason);
      else this.broadcastRoomState("PLAYER_LEFT_LOBBY");
      try {
        if (typeof ws.close === "function") ws.close(1000, "LEFT_ROOM");
      } catch (_) {}
      return;
    }
    this.sendLifecycleError(ws, msg, "UNSUPPORTED_ROOM_OPERATION");
  }

  protected broadcastRoomSnapshot(): void {
    this.broadcastSerializedToRoomMembers(this.buildSnapshotMessage("SERVER"));
  }
}
