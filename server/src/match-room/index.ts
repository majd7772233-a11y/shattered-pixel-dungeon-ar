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
    await super.webSocketClose(ws, code, reason, wasClean);
    if (!session) return;

    // Ignore an old close callback if a replacement socket for this same authenticated player
    // is already active. Session tokens distinguish the newer socket from the closing socket.
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

    const liveSockets = this.state.getWebSockets();
    const livePlayerIds = new Set<string>();
    for (const peer of liveSockets) {
      try {
        const peerSession = peer.deserializeAttachment() as SessionData | null;
        if (peerSession?.playerId) livePlayerIds.add(peerSession.playerId);
      } catch (_) {}
    }

    let nextPublisherId: string | null = null;
    let nextTerm = 0;
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
        if (!hasCompleteNativeLevelSnapshot(levelSnapshot)
            || Number(levelSnapshot.depth) !== this.currentDepth
            || Number(levelSnapshot.branch) !== 0) {
          throw new Error("AUTHORITATIVE_LEVEL_SNAPSHOT_UNAVAILABLE");
        }

        const candidates = this.sql.exec(
          "SELECT player_id,pos,hp,ht FROM players WHERE state = 'ALIVE' AND connected = 1 ORDER BY player_id ASC"
        ).toArray();
        for (const candidate of candidates) {
          const candidateId = String(candidate.player_id || "");
          if (!candidateId || !livePlayerIds.has(candidateId) || candidateId === session.playerId) continue;
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
        if (nextPublisherId) {
          this.sql.exec(
            "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            "levelPublisher", nextPublisherId
          );
        } else {
          this.sql.exec("DELETE FROM room_meta WHERE key = ?", "levelPublisher");
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
      });
    } catch (_) {
      // Failed SQL transactions leave the former publisher key untouched; every other player
      // remains unable to publish, so the room fails closed instead of splitting authority.
      return;
    }

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
    this.broadcastCurrentSnapshot(null);
    this.broadcast(this.levelPublisherStateMessage("PUBLISHER_DISCONNECTED"));
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

      const publisherBeforeConnect = this.sql.exec(
        "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
      const publisherMissing = !publisherBeforeConnect;
      const storage: any = this.state.storage;
      if (publisherMissing && (!storage || typeof storage.transactionSync !== "function")) {
        return new Response("Publisher authority is unavailable", { status: 503 });
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
      let promotedOnConnect = false;
      if (this.sql.exec("SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray().length === 0) {
        const existingPlayer = this.sql.exec(
          "SELECT pos,hp,ht,state FROM players WHERE player_id = ?", playerId).toArray()[0];
        const heroRow = this.sql.exec(
          "SELECT value FROM room_meta WHERE key = ?", "heroState:" + playerId).toArray()[0];
        const levelRow = this.sql.exec(
          "SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:" + this.currentDepth).toArray()[0];
        let levelSnapshot: any = null;
        try { levelSnapshot = levelRow && typeof levelRow.value === "string"
          ? JSON.parse(String(levelRow.value)) : null; } catch (_) {}
        let savedHero: any = null;
        try { savedHero = heroRow && typeof heroRow.value === "string"
          ? JSON.parse(String(heroRow.value)) : null; } catch (_) {}
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
            "SELECT value FROM room_meta WHERE key = ?", "levelPublisherTerm").toArray()[0];
          const currentTerm = termRow === undefined ? 0 : Number(termRow?.value);
          if (!Number.isSafeInteger(currentTerm) || currentTerm < 0
              || currentTerm >= Number.MAX_SAFE_INTEGER) {
            server.close(1011, "Invalid publisher generation");
            return new Response("Publisher authority is unavailable", { status: 503 });
          }
          storage.transactionSync(() => {
            if (this.sql.exec("SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray().length !== 0) return;
            this.sql.exec(
              "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
              "levelPublisher", playerId
            );
            this.sql.exec(
              "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
              "levelPublisherTerm", String(currentTerm + 1)
            );
            promotedOnConnect = true;
          });
        }
      }
      const currentPublisherRow = this.sql.exec(
        "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
      const currentPublisherId = currentPublisherRow && typeof currentPublisherRow.value === "string"
        ? String(currentPublisherRow.value) : null;
      const publisherTermRow = this.sql.exec(
        "SELECT value FROM room_meta WHERE key = ?", "levelPublisherTerm").toArray()[0];
      const publisherTerm = publisherTermRow === undefined ? 0 : Number(publisherTermRow.value);
      const activateAfterSnapshot = promotedOnConnect && this.gameStatus === "PLAYING";

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
          isLevelPublisher: currentPublisherId === playerId && !activateAfterSnapshot,
          levelPublisherId: currentPublisherId,
          publisherTerm,
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

      if (promotedOnConnect) {
        if (activateAfterSnapshot) this.broadcastCurrentSnapshot(null);
        this.broadcast(this.levelPublisherStateMessage("PUBLISHER_ASSIGNED_ON_CONNECT"));
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("MatchRoom Durable Object Active", { status: 200 });
  }
}
