import type { Env, NetworkMessage, SessionData } from "../protocol/types";
import { hasCompleteNativeLevelSnapshot } from "../validators/world-state";
import { isValidNativeHeroStateJson } from "../validators/combat-state";
import { MatchRoomMessages } from "./messages";

export class MatchRoom extends MatchRoomMessages {
  constructor(state: DurableObjectState, env: Env) {
    super(state);
    this.initDatabase();
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const session = ws.deserializeAttachment() as SessionData | null;
    if (session) {
      // The durable session token is the identity fence. A stale socket close must never
      // disconnect a newer session, even if the replacement socket has already disappeared.
      const activeSession = this.sql.exec(
        "SELECT session_token FROM players WHERE player_id = ?", session.playerId
      ).toArray()[0];
      const activeToken = String(activeSession?.session_token || "");
      if (activeToken && activeToken !== session.sessionToken) {
        const replacementSocketExists = this.state.getWebSockets().some(peer => {
          try {
            const peerSession = peer.deserializeAttachment() as SessionData | null;
            return peerSession?.playerId === session.playerId && peerSession?.sessionToken === activeToken;
          } catch (_) { return false; }
        });
        if (replacementSocketExists) {
          this.sql.exec("UPDATE players SET connected = 1 WHERE player_id = ?", session.playerId);
        }
        return;
      }
      // Legacy player rows may not yet have a token; retain the old same-player socket guard.
      if (!activeToken) {
        const replacementSocketExists = this.state.getWebSockets().some(peer => {
          try {
            const peerSession = peer.deserializeAttachment() as SessionData | null;
            return peerSession?.playerId === session.playerId
              && peerSession?.sessionToken !== session.sessionToken;
          } catch (_) { return false; }
        });
        if (replacementSocketExists) {
          this.sql.exec("UPDATE players SET connected = 1 WHERE player_id = ?", session.playerId);
          return;
        }
      }
    }
    await super.webSocketClose(ws, code, reason, wasClean);
    if (session && this.isRoomLifecycleEnabled() && this.isRoomMember(session.playerId)) {
      this.broadcastToRoomMembers({
        protocolVersion: "1.0.0",
        messageType: "READY",
        senderId: session.playerId,
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ playerId: session.playerId, ready: false })
      }, ws);
      this.broadcastToRoomMembers({
        protocolVersion: "1.0.0",
        messageType: "PLAYER_LEFT",
        senderId: session.playerId,
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ playerId: session.playerId, code, reason })
      }, ws);
      this.broadcastRoomState("PLAYER_DISCONNECTED");
    }
    if (!session) return;

    const publisherRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
    if (String(publisherRow?.value || "") !== session.playerId) return;

    // A transition destination is bound to its original publisher. Abort that barrier rather
    // than allowing a different player to submit a destination built from another local world.
    const transitionRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
    if (transitionRow && typeof transitionRow.value === "string") {
      try {
        const pending = JSON.parse(String(transitionRow.value));
        if (String(pending?.publisherId || "") === session.playerId) {
          if (!this.abortPendingLevelTransition(pending, "LEVEL_PUBLISHER_DISCONNECTED")) return;
        }
      } catch (_) { return; }
    }

    const storage: any = this.state.storage;
    if (!storage || typeof storage.transactionSync !== "function") {
      // Do not transfer authority without a durable atomic update.
      return;
    }

    const liveSessionTokens = new Map<string, Set<string>>();
    for (const socket of this.state.getWebSockets()) {
      try {
        const liveSession = socket.deserializeAttachment() as SessionData | null;
        if (!liveSession?.playerId || !liveSession.sessionToken) continue;
        const tokens = liveSessionTokens.get(liveSession.playerId) || new Set<string>();
        tokens.add(liveSession.sessionToken);
        liveSessionTokens.set(liveSession.playerId, tokens);
      } catch (_) {}
    }

    let nextPublisherId: string | null = null;
    let nextTerm = 0;
    let preservedSnapshotAvailable = false;
    let handoffCommitted = false;
    let roomOwnerTransferred = false;
    const failedCombatRequests: Array<{ attackerId: string; requestId: string }> = [];
    try {
      storage.transactionSync(() => {
        const currentOwner = this.sql.exec(
          "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
        if (String(currentOwner?.value || "") !== session.playerId) return;

        const levelRow = this.sql.exec(
          "SELECT value FROM room_meta WHERE key = ?",
          "levelSnapshot:" + this.currentDepth).toArray()[0];
        let levelSnapshot: any = null;
        try {
          levelSnapshot = levelRow && typeof levelRow.value === "string"
            ? JSON.parse(String(levelRow.value)) : null;
        } catch (_) {}
        preservedSnapshotAvailable = hasCompleteNativeLevelSnapshot(levelSnapshot)
          && Number(levelSnapshot.depth) === this.currentDepth
          && Number(levelSnapshot.branch) === 0;

        // Never elect a new publisher from a room whose last authoritative native snapshot
        // is missing or invalid. Revoke the old term below so its stale socket is fenced.
        const candidates = preservedSnapshotAvailable ? this.sql.exec(
          "SELECT player_id,pos,hp,ht,session_token FROM players WHERE state = 'ALIVE' AND connected = 1 ORDER BY player_id ASC"
        ).toArray().filter((candidate: any) => !this.isRoomLifecycleEnabled() || this.isRoomMember(String(candidate.player_id))) : [];
        for (const candidate of candidates) {
          const candidateId = String(candidate.player_id || "");
          const candidateToken = String(candidate.session_token || "");
          if (!candidateId || candidateId === session.playerId || !candidateToken
              || !liveSessionTokens.get(candidateId)?.has(candidateToken)) continue;
          const heroRow = this.sql.exec(
            "SELECT value FROM room_meta WHERE key = ?", "heroState:" + candidateId
          ).toArray()[0];
          if (!heroRow || typeof heroRow.value !== "string") continue;
          let hero: any = null;
          try { hero = JSON.parse(String(heroRow.value)); } catch (_) {}
          if (!hero || !isValidNativeHeroStateJson(String(heroRow.value), {
            hp: Number(candidate.hp), ht: Number(candidate.ht), pos: Number(candidate.pos),
            shielding: Number(hero.shielding)
          })) continue;
          nextPublisherId = candidateId;
          break;
        }

        const termRow = this.sql.exec(
          "SELECT value FROM room_meta WHERE key = ?", "levelPublisherTerm").toArray()[0];
        const currentTerm = termRow === undefined ? 0 : Number(termRow?.value);
        if (!Number.isSafeInteger(currentTerm) || currentTerm < 0 || currentTerm >= Number.MAX_SAFE_INTEGER) {
          throw new Error("INVALID_LEVEL_PUBLISHER_TERM");
        }
        nextTerm = currentTerm + 1;
        this.sql.exec(
          "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          "levelPublisherTerm", String(nextTerm)
        );
        if (nextPublisherId && this.gameStatus !== "PLAYING") {
          this.sql.exec(
            "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            "levelPublisherReadyTerm", String(nextTerm)
          );
        } else {
          this.sql.exec("DELETE FROM room_meta WHERE key = ?", "levelPublisherReadyTerm");
        }
        if (nextPublisherId) {
          this.sql.exec(
            "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            "levelPublisher", nextPublisherId
          );
        } else {
          this.sql.exec("DELETE FROM room_meta WHERE key = ?", "levelPublisher");
        }

        if (this.isRoomLifecycleEnabled() && this.gameStatus === "LOBBY" && nextPublisherId) {
          const roomOwner = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "roomOwnerId").toArray()[0];
          if (String(roomOwner?.value || "") === session.playerId) {
            this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", "roomOwnerId", nextPublisherId);
            // An abrupt owner disconnect invalidates every READY proof just like an explicit
            // LEAVE. Keep player flags and durable proofs in the same handoff transaction.
            const roomMemberRows = this.sql.exec(
              "SELECT key FROM room_meta WHERE substr(key,1,?) = ?",
              "roomMember:".length, "roomMember:"
            ).toArray();
            for (const memberRow of roomMemberRows) {
              const memberId = String(memberRow.key || "").slice("roomMember:".length);
              if (!memberId) continue;
              this.sql.exec("UPDATE players SET ready = 0 WHERE player_id = ?", memberId);
              this.sql.exec(
                "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                "roomReady:" + memberId,
                JSON.stringify({ ready: false, seed: this.matchSeed, sequence: this.currentSequence })
              );
            }
            roomOwnerTransferred = true;
          }
        }

        // Discard combat reservations that depended on the disconnected authority. The
        // original attacker receives a correlated failure after the durable handoff commits.
        const pendingRows = this.sql.exec(
          "SELECT key,value FROM room_meta WHERE key LIKE 'pendingCombat:%'"
        ).toArray();
        for (const row of pendingRows) {
          let pending: any = null;
          try { pending = typeof row.value === "string" ? JSON.parse(String(row.value)) : null; } catch (_) {}
          if (!pending || (String(pending.authorityId || "") !== session.playerId
              && String(pending.attackerId || "") !== session.playerId)) continue;
          if (String(pending.authorityId || "") === session.playerId
              && String(pending.attackerId || "") !== session.playerId
              && typeof pending.requestId === "string") {
            failedCombatRequests.push({ attackerId: String(pending.attackerId), requestId: pending.requestId });
          }
          this.clearPendingCombat(pending);
        }
        this.sql.exec("DELETE FROM room_meta WHERE key = ?", "nativeMutationPending:" + session.playerId);
        handoffCommitted = true;
      });
    } catch (_) {
      // Failed SQL transactions leave the former publisher key untouched; every other player
      // remains unable to publish, so the room fails closed instead of splitting authority.
      return;
    }

    if (!handoffCommitted) return;

    for (const failed of failedCombatRequests) {
      const errorMessage = JSON.stringify({
        protocolVersion: "1.0.0",
        messageType: "ERROR",
        requestId: failed.requestId,
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_AUTHORITY_CHANGED" })
      });
      for (const peer of this.state.getWebSockets()) {
        try {
          const peerSession = peer.deserializeAttachment() as SessionData | null;
          if (peerSession?.playerId === failed.attackerId) peer.send(errorMessage);
        } catch (_) {}
      }
    }

    // This full snapshot is generated from committed server rows/bundles. Authority is announced
    // only after snapshot delivery has been attempted.
    if (preservedSnapshotAvailable) this.broadcastCurrentSnapshot(null);
    this.broadcast(this.levelPublisherStateMessage(preservedSnapshotAvailable
      ? "PUBLISHER_DISCONNECTED" : "PUBLISHER_DISCONNECTED_SNAPSHOT_UNAVAILABLE"));
    if (roomOwnerTransferred) this.broadcastRoomState("ROOM_OWNER_HANDOFF");
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
    if (!url.pathname.endsWith("/websocket")) {
      return new Response("MatchRoom Durable Object Active", { status: 200 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const storage: any = this.state.storage;
    if (!storage || typeof storage.transactionSync !== "function") {
      return new Response("Session storage is unavailable", { status: 503 });
    }

    const requestedPlayerId = url.searchParams.get("playerId");
    const authorization = request.headers.get("Authorization") || "";
    const bearerMatch = /^Bearer ([A-Za-z0-9._~-]{16,256})$/.exec(authorization);
    if (url.searchParams.has("sessionToken")) {
      return new Response("Session tokens must not be sent in URLs", { status: 400 });
    }
    if (authorization && !bearerMatch) {
      return new Response("Invalid or expired session", { status: 401 });
    }
    const presentedSessionToken = bearerMatch ? bearerMatch[1] : null;
    if (requestedPlayerId !== null
        && (requestedPlayerId.trim().length === 0 || requestedPlayerId.length > 128)) {
      return new Response("Invalid player identity", { status: 400 });
    }

    const lifecycleRequested = url.searchParams.get("lifecycle") === "1";
    if (url.searchParams.has("lifecycle") && !lifecycleRequested) {
      return new Response("Invalid room lifecycle version", { status: 400 });
    }
    const lifecycleEnabled = lifecycleRequested || this.isRoomLifecycleEnabled();
    if (lifecycleRequested && !this.isRoomLifecycleEnabled()) {
      const existingPlayers = this.sql.exec("SELECT player_id FROM players LIMIT 1").toArray();
      if (existingPlayers.length > 0) {
        return new Response("Legacy room cannot be upgraded after players have joined", { status: 409 });
      }
    }

    const reconnecting = presentedSessionToken !== null;

    let playerId = "";
    let sessionToken = crypto.randomUUID();
    let spawnPos = 100;
    let promotedOnConnect = false;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    try {
      // A reconnect token is the credential. A playerId query value is only a consistency
      // assertion and can never select or take over a different database row.
      if (reconnecting) {
        const tokenOwners = this.sql.exec(
          "SELECT player_id FROM players WHERE session_token = ?", presentedSessionToken!
        ).toArray();
        if (tokenOwners.length !== 1) {
          return new Response("Invalid or expired session", { status: 401 });
        }
        playerId = String(tokenOwners[0].player_id || "");
        if (!playerId || (requestedPlayerId !== null && requestedPlayerId !== playerId)) {
          return new Response("Session identity mismatch", { status: 403 });
        }
      } else {
        // A caller may create a new identity, but may not claim an existing one without its token.
        playerId = requestedPlayerId || crypto.randomUUID();
      }

      // Accept and attach the socket before rotating credentials. If the platform cannot
      // accept this WebSocket, the caller must retain its current usable session token.
      const sessionData: SessionData = { playerId, sessionToken };
      try {
        this.state.acceptWebSocket(server);
        server.serializeAttachment(sessionData);
      } catch (_) {
        try { server.close(1011, "Unable to accept session"); } catch (_) {}
        return new Response("Unable to accept session", { status: 503 });
      }

      storage.transactionSync(() => {
        if (lifecycleRequested && !this.isRoomLifecycleEnabled()) {
          this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", "roomLifecycleVersion", "1");
        }
        if (reconnecting) {
          const current = this.sql.exec(
            "SELECT player_id, pos FROM players WHERE player_id = ? AND session_token = ?",
            playerId, presentedSessionToken
          ).toArray();
          if (current.length !== 1) throw new Error("SESSION_REPLACED");
          const savedPos = Number(current[0].pos);
          spawnPos = Number.isSafeInteger(savedPos) && savedPos >= 0 ? savedPos : 100;
          this.sql.exec(
            "UPDATE players SET session_token = ?, connected = 1 WHERE player_id = ? AND session_token = ?",
            sessionToken, playerId, presentedSessionToken
          );
          const rotated = this.sql.exec(
            "SELECT player_id FROM players WHERE player_id = ? AND session_token = ?",
            playerId, sessionToken
          ).toArray();
          if (rotated.length !== 1) throw new Error("SESSION_REPLACED");
        } else {
          const existing = this.sql.exec(
            "SELECT player_id FROM players WHERE player_id = ?", playerId
          ).toArray();
          if (existing.length !== 0) throw new Error("PLAYER_ID_ALREADY_REGISTERED");
          const entranceRow = this.sql.exec(
            "SELECT entrance_pos FROM levels WHERE depth = ?", this.currentDepth
          ).toArray();
          const entrance = entranceRow.length > 0 ? Number(entranceRow[0].entrance_pos) : 100;
          spawnPos = Number.isSafeInteger(entrance) && entrance >= 0 ? entrance : 100;
          this.sql.exec(
            "INSERT INTO players (player_id, session_token, pos, connected) VALUES (?, ?, ?, 1)",
            playerId, sessionToken, spawnPos
          );
        }

        // Initial publisher assignment is part of the same identity transaction. Existing
        // reconnects retain their player row, position, Hero snapshot and authority identity.
        const publisherRow = this.sql.exec(
          "SELECT value FROM room_meta WHERE key = 'levelPublisher'"
        ).toArray()[0];
        if (!publisherRow && !lifecycleEnabled) {
          const existingPlayer = this.sql.exec(
            "SELECT pos,hp,ht,state FROM players WHERE player_id = ?", playerId
          ).toArray()[0];
          const heroRow = this.sql.exec(
            "SELECT value FROM room_meta WHERE key = ?", "heroState:" + playerId
          ).toArray()[0];
          const levelRow = this.sql.exec(
            "SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:" + this.currentDepth
          ).toArray()[0];
          let levelSnapshot: any = null;
          try {
            levelSnapshot = levelRow && typeof levelRow.value === "string"
              ? JSON.parse(String(levelRow.value)) : null;
          } catch (_) {}
          let savedHero: any = null;
          try {
            savedHero = heroRow && typeof heroRow.value === "string"
              ? JSON.parse(String(heroRow.value)) : null;
          } catch (_) {}
          const canRestoreInProgressRun = this.gameStatus !== "PLAYING"
            || (!!existingPlayer && String(existingPlayer.state) === "ALIVE"
              && !!savedHero && hasCompleteNativeLevelSnapshot(levelSnapshot)
              && Number(levelSnapshot.depth) === this.currentDepth
              && isValidNativeHeroStateJson(String(heroRow?.value || ""), {
                hp: Number(existingPlayer.hp), ht: Number(existingPlayer.ht),
                pos: Number(existingPlayer.pos), shielding: Number(savedHero.shielding)
              }));
          if (canRestoreInProgressRun) {
            const termRow = this.sql.exec(
              "SELECT value FROM room_meta WHERE key = ?", "levelPublisherTerm"
            ).toArray()[0];
            const currentTerm = termRow === undefined ? 0 : Number(termRow?.value);
            if (!Number.isSafeInteger(currentTerm) || currentTerm < 0 || currentTerm >= Number.MAX_SAFE_INTEGER) {
              throw new Error("INVALID_LEVEL_PUBLISHER_TERM");
            }
            this.sql.exec(
              "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
              "levelPublisher", playerId
            );
            this.sql.exec(
              "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
              "levelPublisherTerm", String(currentTerm + 1)
            );
            if (this.gameStatus !== "PLAYING") {
              this.sql.exec(
                "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                "levelPublisherReadyTerm", String(currentTerm + 1)
              );
            } else {
              this.sql.exec("DELETE FROM room_meta WHERE key = ?", "levelPublisherReadyTerm");
            }
            promotedOnConnect = true;
          }
        }
      });
    } catch (error) {
      try { server.close(1011, "Session establishment failed"); } catch (_) {}
      const reason = error instanceof Error ? error.message : "";
      if (reason === "PLAYER_ID_ALREADY_REGISTERED") {
        return new Response("A session token is required for this player", { status: 401 });
      }
      if (reason === "SESSION_REPLACED") {
        return new Response("Session was already replaced", { status: 409 });
      }
      return new Response("Unable to establish session", { status: 503 });
    }

    const currentPublisherRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = 'levelPublisher'"
    ).toArray()[0];
    const currentPublisherId = currentPublisherRow && typeof currentPublisherRow.value === "string"
      ? String(currentPublisherRow.value) : null;
    const publisherTermRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = ?", "levelPublisherTerm"
    ).toArray()[0];
    const publisherTerm = publisherTermRow === undefined ? 0 : Number(publisherTermRow.value);
    const activateAfterSnapshot = promotedOnConnect && this.gameStatus === "PLAYING";

    const welcome: NetworkMessage = {
      protocolVersion: "1.0.0",
      messageType: "SESSION",
      sequence: this.currentSequence,
      payloadJson: JSON.stringify({
        playerId,
        roomLifecycleVersion: lifecycleEnabled ? 1 : 0,
        roomMembership: this.isRoomMember(playerId),
        roomOwnerId: this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "roomOwnerId").toArray()[0]?.value || null,
        sessionToken,
        sequence: this.currentSequence,
        seed: this.matchSeed,
        depth: this.currentDepth,
        gameMode: this.gameMode,
        resumed: reconnecting,
        isLevelPublisher: currentPublisherId === playerId && !activateAfterSnapshot,
        levelPublisherId: currentPublisherId,
        publisherTerm,
        pos: spawnPos
      })
    };
    server.send(JSON.stringify(welcome));

    if (!lifecycleEnabled) {
      this.broadcast({
        protocolVersion: "1.0.0",
        messageType: "PLAYER_JOINED",
        senderId: playerId,
        payloadJson: JSON.stringify({ playerId, pos: spawnPos, resumed: reconnecting })
      }, server);
    } else if (this.isRoomMember(playerId)) {
      this.sendRoomStateToSocket(server, reconnecting ? "SESSION_RESUMED" : "SESSION_BOUND");
    }

    const publisherNeedsRebase = !promotedOnConnect && this.gameStatus === "PLAYING"
      && currentPublisherId !== null && !this.isLevelPublisherReady();
    if (promotedOnConnect || publisherNeedsRebase) {
      if (activateAfterSnapshot || publisherNeedsRebase) this.broadcastCurrentSnapshot(null);
      this.broadcast(this.levelPublisherStateMessage(
        publisherNeedsRebase ? "PUBLISHER_REBASE_REQUIRED" : "PUBLISHER_ASSIGNED_ON_CONNECT"
      ));
    }

    return new Response(null, { status: 101, webSocket: client });
  }
}
