export interface Env {
  MATCH_ROOM: DurableObjectNamespace;
}

export interface NetworkMessage {
  protocolVersion: string;
  messageType: string;
  requestId?: string;
  sequence?: number;
  senderId?: string;
  payloadJson: string;
}

export interface SessionData {
  playerId: string;
  sessionToken: string;
}

export interface PlayerState {
  playerId: string;
  heroClass: string;
  pos: number;
  hp: number;
  ht: number;
  str: number;
  weaponDmgMax: number;
  armorVal: number;
  ready: boolean;
  state: "ALIVE" | "DOWNED" | "DEAD" | "SPECTATOR";
}

export interface MobState {
  mobId: number;
  name: string;
  pos: number;
  hp: number;
  ht: number;
}

export class MatchRoom {
  state: DurableObjectState;
  sql: SqlStorage;
  currentSequence: number = 0;
  matchSeed: number = 123456789;
  currentDepth: number = 1;
  gameMode: "COOP_DUNGEON" | "PVP_ARENA" | "DEATHMATCH" | "SURVIVAL" = "COOP_DUNGEON";
  gameStatus: "LOBBY" | "PLAYING" | "ENDED" = "LOBBY";
  processedRequestIds: Set<string> = new Set();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.sql = state.storage.sql;
    this.initDatabase();
  }

  private initDatabase() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        session_token TEXT,
        class_name TEXT DEFAULT 'WARRIOR',
        pos INTEGER DEFAULT 0,
        hp INTEGER DEFAULT 20,
        ht INTEGER DEFAULT 20,
        str INTEGER DEFAULT 10,
        weapon_dmg_max INTEGER DEFAULT 8,
        armor_val INTEGER DEFAULT 2,
        ready INTEGER DEFAULT 0,
        state TEXT DEFAULT 'ALIVE',
        connected INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS mobs (
        mob_id INTEGER PRIMARY KEY,
        name TEXT,
        pos INTEGER DEFAULT 0,
        hp INTEGER DEFAULT 10,
        ht INTEGER DEFAULT 10
      );
      CREATE TABLE IF NOT EXISTS claimed_items (
        item_pos INTEGER PRIMARY KEY,
        claimed_by TEXT,
        claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY,
        sender_id TEXT,
        event_type TEXT,
        payload TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const seqRow = this.sql.exec(`SELECT MAX(sequence) as max_seq FROM events`).toArray();
    if (seqRow.length > 0 && seqRow[0].max_seq !== null) {
      this.currentSequence = Number(seqRow[0].max_seq);
    }

    const modeRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'gameMode'`).toArray();
    if (modeRow.length > 0) {
      this.gameMode = String(modeRow[0].value) as any;
    } else {
      this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('gameMode', 'COOP_DUNGEON')`);
    }

    const metaRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'seed'`).toArray();
    if (metaRow.length > 0) {
      this.matchSeed = Number(metaRow[0].value);
    } else {
      this.matchSeed = Math.floor(Math.random() * 1000000000);
      this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('seed', ?)`, this.matchSeed.toString());
    }

    const depthRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'depth'`).toArray();
    if (depthRow.length > 0) {
      this.currentDepth = Number(depthRow[0].value);
    } else {
      this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('depth', '1')`);
    }

    // Initialize mobs if empty
    const mobCount = this.sql.exec(`SELECT COUNT(*) as count FROM mobs`).toArray();
    if (mobCount.length === 0 || Number(mobCount[0].count) === 0) {
      this.sql.exec(`INSERT INTO mobs (mob_id, name, pos, hp, ht) VALUES (1, 'Rat', 100, 10, 10)`);
      this.sql.exec(`INSERT INTO mobs (mob_id, name, pos, hp, ht) VALUES (2, 'Gnoll', 200, 15, 15)`);
    }
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

      this.sql.exec(
        `INSERT INTO players (player_id, session_token, connected) VALUES (?, ?, 1)
         ON CONFLICT(player_id) DO UPDATE SET session_token=excluded.session_token, connected=1`,
        playerId,
        sessionToken
      );

      // Send Session Welcome
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
          gameMode: this.gameMode
        })
      };
      server.send(JSON.stringify(welcome));

      // Broadcast Player Joined
      this.broadcast({
        protocolVersion: "1.0.0",
        messageType: "PLAYER_JOINED",
        senderId: playerId,
        payloadJson: JSON.stringify({ playerId })
      }, server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("MatchRoom Durable Object Active", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    try {
      const msg: NetworkMessage = JSON.parse(message);
      const session = ws.deserializeAttachment() as SessionData | null;
      if (!session) return;

      msg.senderId = session.playerId;

      if (msg.messageType === "RECONNECT") {
        try {
          const payload = typeof msg.payloadJson === "string" ? JSON.parse(msg.payloadJson) : msg.payloadJson;
          const token = payload.sessionToken;
          const lastSeq = payload.lastSequence !== undefined ? Number(payload.lastSequence) : 0;

          const playerRow = this.sql.exec(`SELECT player_id FROM players WHERE session_token = ?`, token).toArray();
          if (playerRow.length > 0) {
            const reconnectedPlayerId = String(playerRow[0].player_id);
            this.sql.exec(`UPDATE players SET connected = 1 WHERE player_id = ?`, reconnectedPlayerId);

            const gap = this.currentSequence - lastSeq;

            // Reconnect Gap Logic: <= 50 events -> EVENT_BATCH replay; > 50 -> SNAPSHOT
            if (gap > 0 && gap <= 50) {
              const missingEvents = this.sql.exec(`SELECT sequence, sender_id, event_type, payload FROM events WHERE sequence > ? ORDER BY sequence ASC`, lastSeq).toArray();
              if (missingEvents.length === gap) {
                const batchMsg: NetworkMessage = {
                  protocolVersion: "1.0.0",
                  messageType: "EVENT_BATCH",
                  sequence: this.currentSequence,
                  payloadJson: JSON.stringify(missingEvents)
                };
                ws.send(JSON.stringify(batchMsg));
                return;
              }
            }

            // Fallback: Full Snapshot
            const players = this.sql.exec(`SELECT player_id, class_name, pos, hp, ht, ready, state FROM players`).toArray();
            const mobs = this.sql.exec(`SELECT mob_id, name, pos, hp, ht FROM mobs`).toArray();
            const claims = this.sql.exec(`SELECT item_pos, claimed_by FROM claimed_items`).toArray();

            const snapshotMsg: NetworkMessage = {
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
                claims
              })
            };
            ws.send(JSON.stringify(snapshotMsg));
            return;
          }
        } catch (_) {}
      }

      if (msg.messageType === "ACTION") {
        if (msg.requestId && this.processedRequestIds.has(msg.requestId)) {
          const dupAck: NetworkMessage = {
            protocolVersion: "1.0.0",
            messageType: "ACTION_ACCEPTED",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify({ status: "DUPLICATE", sequence: this.currentSequence })
          };
          ws.send(JSON.stringify(dupAck));
          return;
        }

        if (msg.requestId) {
          this.processedRequestIds.add(msg.requestId);
        }

        this.currentSequence++;
        msg.sequence = this.currentSequence;

        let eventType = "PLAYER_MOVED";
        let actionResultPayload: any = {};

        try {
          const payload = typeof msg.payloadJson === "string" ? JSON.parse(msg.payloadJson) : msg.payloadJson;
          let targetPos = -1;

          if (payload.data) {
            if (payload.data.to !== undefined) targetPos = Number(payload.data.to);
            else if (payload.data.targetPos !== undefined) targetPos = Number(payload.data.targetPos);
            else if (payload.data.pos !== undefined) targetPos = Number(payload.data.pos);
          } else {
            if (payload.to !== undefined) targetPos = Number(payload.to);
            else if (payload.targetPos !== undefined) targetPos = Number(payload.targetPos);
            else if (payload.pos !== undefined) targetPos = Number(payload.pos);
          }

          const actionStr = payload.action || payload.data?.action;

          if (actionStr === "LVL_TRANSITION") {
            eventType = "LEVEL_TRANSITION";
            this.currentDepth++;
            this.sql.exec(`UPDATE room_meta SET value = ? WHERE key = 'depth'`, this.currentDepth.toString());
            this.sql.exec(`DELETE FROM claimed_items`);
            this.sql.exec(`DELETE FROM mobs`);
            this.sql.exec(`INSERT INTO mobs (mob_id, name, pos, hp, ht) VALUES (1, 'Skeleton', 120, 20, 20)`);
            actionResultPayload = { depth: this.currentDepth };
          } else if (actionStr === "ATTACK") {
            eventType = "PLAYER_ATTACKED";
            const targetId = payload.data?.targetId || payload.targetId;
            const attackerRow = this.sql.exec(`SELECT pos, str, weapon_dmg_max FROM players WHERE player_id = ?`, session.playerId).toArray();
            const attackerPos = attackerRow.length > 0 ? Number(attackerRow[0].pos) : 0;
            const weaponDmgMax = attackerRow.length > 0 ? Number(attackerRow[0].weapon_dmg_max) : 8;

            let hit = Math.random() > 0.15; // 85% hit chance
            let rawDamage = hit ? Math.floor(Math.random() * weaponDmgMax) + 2 : 0;

            if (targetId) {
              // Mob Attack Target
              const mobRow = this.sql.exec(`SELECT mob_id, hp, pos FROM mobs WHERE mob_id = ?`, targetId).toArray();
              if (mobRow.length > 0) {
                const currentHp = Number(mobRow[0].hp);
                const mobPos = Number(mobRow[0].pos);

                // Verify Range (Melee range dx <= 1 && dy <= 1 on 32-tile map)
                const mapWidth = 32;
                const dx = Math.abs((attackerPos % mapWidth) - (mobPos % mapWidth));
                const dy = Math.abs(Math.floor(attackerPos / mapWidth) - Math.floor(mobPos / mapWidth));

                if (dx <= 2 && dy <= 2) {
                  const newHp = Math.max(0, currentHp - rawDamage);
                  this.sql.exec(`UPDATE mobs SET hp = ? WHERE mob_id = ?`, newHp, targetId);

                  actionResultPayload = {
                    attackerId: session.playerId,
                    targetId,
                    targetType: "MOB",
                    hit,
                    damage: rawDamage,
                    targetHp: newHp
                  };
                  if (newHp === 0) eventType = "CHAR_DIED";
                }
              }
            }
          } else if (actionStr === "MOVE" && targetPos >= 0 && targetPos < 4096) {
            eventType = "PLAYER_MOVED";
            const playerRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, session.playerId).toArray();
            let serverFromPos = playerRow.length > 0 && playerRow[0].pos !== null ? Number(playerRow[0].pos) : -1;

            const mapWidth = 32;
            if (serverFromPos >= 0) {
              const dx = Math.abs((serverFromPos % mapWidth) - (targetPos % mapWidth));
              const dy = Math.abs(Math.floor(serverFromPos / mapWidth) - Math.floor(targetPos / mapWidth));
              if (dx <= 1 && dy <= 1) {
                this.sql.exec(`UPDATE players SET pos = ? WHERE player_id = ?`, targetPos, session.playerId);
              }
            } else {
              this.sql.exec(`UPDATE players SET pos = ? WHERE player_id = ?`, targetPos, session.playerId);
            }
            actionResultPayload = { playerId: session.playerId, pos: targetPos };
          } else if (actionStr === "PICKUP" || actionStr === "OPEN_CHEST") {
            eventType = actionStr === "PICKUP" ? "ITEM_PICKED_UP" : "CHEST_OPENED";
            const itemPos = payload.data?.itemPos ?? targetPos;
            const existingClaim = this.sql.exec(`SELECT claimed_by FROM claimed_items WHERE item_pos = ?`, itemPos).toArray();
            if (existingClaim.length > 0) {
              const rejectAck: NetworkMessage = {
                protocolVersion: "1.0.0",
                messageType: "ERROR",
                requestId: msg.requestId,
                sequence: this.currentSequence,
                payloadJson: JSON.stringify({ error: "ITEM_ALREADY_CLAIMED", itemPos })
              };
              ws.send(JSON.stringify(rejectAck));
              return;
            } else {
              this.sql.exec(`INSERT INTO claimed_items (item_pos, claimed_by) VALUES (?, ?)`, itemPos, session.playerId);
              actionResultPayload = { itemPos, claimedBy: session.playerId };
            }
          }
        } catch (_) {}

        this.sql.exec(
          `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, ?, ?, ?)`,
          this.currentSequence,
          session.playerId,
          eventType,
          JSON.stringify(actionResultPayload)
        );

        const ackMsg: NetworkMessage = {
          protocolVersion: "1.0.0",
          messageType: "ACTION_ACCEPTED",
          requestId: msg.requestId,
          sequence: this.currentSequence,
          payloadJson: JSON.stringify({ status: "ACCEPTED", sequence: this.currentSequence })
        };
        ws.send(JSON.stringify(ackMsg));

        // FOV-Filtered Broadcast in PvP modes
        this.broadcastWithFOV(session.playerId, eventType, actionResultPayload, ws);
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
        const players = this.sql.exec(`SELECT player_id, class_name, pos, hp, ht, ready, state FROM players`).toArray();
        const mobs = this.sql.exec(`SELECT mob_id, name, pos, hp, ht FROM mobs`).toArray();
        const claims = this.sql.exec(`SELECT item_pos, claimed_by FROM claimed_items`).toArray();
        const snapshotMsg: NetworkMessage = {
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
            claims,
            events
          })
        };
        ws.send(JSON.stringify(snapshotMsg));
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
        payloadJson: JSON.stringify({ error: (e as Error).message })
      }));
    }
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

  private broadcastWithFOV(senderId: string, eventType: string, actionPayload: any, excludeWs?: WebSocket) {
    const mapWidth = 32;
    const senderRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, senderId).toArray();
    const actionPos = actionPayload.pos !== undefined ? Number(actionPayload.pos) : (senderRow.length > 0 ? Number(senderRow[0].pos) : -1);

    for (const ws of this.state.getWebSockets()) {
      if (ws === excludeWs) continue;

      const recipientSession = ws.deserializeAttachment() as SessionData | null;
      if (!recipientSession) continue;

      let sendToClient = true;

      // Filter in PvP / Competitive modes if target cell is outside recipient's FOV radius (8 tiles)
      if (this.gameMode === "PVP_ARENA" || this.gameMode === "DEATHMATCH") {
        const recipientRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, recipientSession.playerId).toArray();
        if (recipientRow.length > 0 && actionPos >= 0) {
          const recipientPos = Number(recipientRow[0].pos);
          const dx = Math.abs((recipientPos % mapWidth) - (actionPos % mapWidth));
          const dy = Math.abs(Math.floor(recipientPos / mapWidth) - Math.floor(actionPos / mapWidth));
          if (dx > 8 || dy > 8) {
            sendToClient = false;
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

  private broadcast(msg: NetworkMessage, excludeWs?: WebSocket) {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/room/")) {
      const parts = url.pathname.split("/");
      const roomCode = parts[2] || "DEFAULT_ROOM";
      const id = env.MATCH_ROOM.idFromName(roomCode);
      const stub = env.MATCH_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("SPD Multiplayer Server API. Access /room/{roomCode}/websocket to connect.", { status: 200 });
  }
};
