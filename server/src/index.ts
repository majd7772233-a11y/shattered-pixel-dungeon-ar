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

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed % 2147483647;
    if (this.state <= 0) this.state += 2147483646;
  }

  public nextFloat(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }

  public nextInt(max: number): number {
    return Math.floor(this.nextFloat() * max);
  }

  public intRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }
}

export class MatchRoom {
  state: DurableObjectState;
  sql: SqlStorage;
  currentSequence: number = 0;
  matchSeed: number = 123456789;
  currentDepth: number = 1;
  worldTime: number = 0.0;
  gameMode: "COOP_DUNGEON" | "PVP_ARENA" | "DEATHMATCH" | "SURVIVAL" = "COOP_DUNGEON";
  gameStatus: "LOBBY" | "PLAYING" | "ENDED" = "LOBBY";

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
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        next_act_at REAL DEFAULT 0.0,
        ready INTEGER DEFAULT 0,
        state TEXT DEFAULT 'ALIVE',
        connected INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS levels (
        depth INTEGER PRIMARY KEY,
        width INTEGER DEFAULT 32,
        height INTEGER DEFAULT 32,
        entrance_pos INTEGER,
        exit_pos INTEGER,
        seed INTEGER
      );
      CREATE TABLE IF NOT EXISTS level_tiles (
        depth INTEGER,
        pos INTEGER,
        terrain TEXT,
        passable INTEGER DEFAULT 1,
        solid INTEGER DEFAULT 0,
        pit INTEGER DEFAULT 0,
        los_blocking INTEGER DEFAULT 0,
        PRIMARY KEY (depth, pos)
      );
      CREATE TABLE IF NOT EXISTS mobs (
        mob_id INTEGER PRIMARY KEY,
        depth INTEGER DEFAULT 1,
        name TEXT,
        pos INTEGER DEFAULT 0,
        hp INTEGER DEFAULT 10,
        ht INTEGER DEFAULT 10,
        str INTEGER DEFAULT 8,
        dmg_max INTEGER DEFAULT 6,
        next_act_at REAL DEFAULT 0.0,
        state TEXT DEFAULT 'HUNTING'
      );
      CREATE TABLE IF NOT EXISTS claimed_items (
        item_pos INTEGER PRIMARY KEY,
        depth INTEGER DEFAULT 1,
        claimed_by TEXT,
        claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS level_transitions (
        transition_id TEXT PRIMARY KEY,
        depth INTEGER,
        pos INTEGER,
        type TEXT,
        target_depth INTEGER
      );
      CREATE TABLE IF NOT EXISTS processed_actions (
        request_id TEXT PRIMARY KEY,
        player_id TEXT,
        sequence INTEGER,
        result_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    this.ensureLevelGenerated(this.currentDepth);
  }

  private ensureLevelGenerated(depth: number) {
    const existingLevel = this.sql.exec(`SELECT depth FROM levels WHERE depth = ?`, depth).toArray();
    if (existingLevel.length === 0) {
      const levelSeed = this.matchSeed + depth * 10007;
      const width = 32;
      const height = 32;
      const entrancePos = 100;
      const exitPos = 920;

      this.sql.exec(
        `INSERT INTO levels (depth, width, height, entrance_pos, exit_pos, seed) VALUES (?, ?, ?, ?, ?, ?)`,
        depth, width, height, entrancePos, exitPos, levelSeed
      );

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pos = y * width + x;
          const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
          const isWall = isBorder;
          const terrain = isWall ? "WALL" : "EMPTY";
          const passable = isWall ? 0 : 1;
          const solid = isWall ? 1 : 0;
          const losBlocking = isWall ? 1 : 0;

          this.sql.exec(
            `INSERT INTO level_tiles (depth, pos, terrain, passable, solid, pit, los_blocking) VALUES (?, ?, ?, ?, ?, 0, ?)`,
            depth, pos, terrain, passable, solid, losBlocking
          );
        }
      }

      this.sql.exec(
        `INSERT INTO level_transitions (transition_id, depth, pos, type, target_depth) VALUES (?, ?, ?, 'ENTRANCE', ?)`,
        `trans_up_${depth}`, depth, entrancePos, depth > 1 ? depth - 1 : 1
      );
      this.sql.exec(
        `INSERT INTO level_transitions (transition_id, depth, pos, type, target_depth) VALUES (?, ?, ?, 'EXIT', ?)`,
        `trans_down_${depth}`, depth, exitPos, depth + 1
      );

      const mobNames = depth === 1 ? ['Rat', 'Gnoll'] : ['Skeleton', 'Thief'];
      this.sql.exec(
        `INSERT INTO mobs (depth, name, pos, hp, ht, str, dmg_max, next_act_at) VALUES (?, ?, 105, 12, 12, 10, 6, 0.0)`,
        depth, mobNames[0]
      );
      this.sql.exec(
        `INSERT INTO mobs (depth, name, pos, hp, ht, str, dmg_max, next_act_at) VALUES (?, ?, 200, 18, 18, 12, 8, 0.0)`,
        depth, mobNames[1]
      );
    }
  }

  public hasLineOfSight(fromPos: number, toPos: number, depth: number): boolean {
    const width = 32;
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

      const entranceRow = this.sql.exec(`SELECT entrance_pos FROM levels WHERE depth = ?`, this.currentDepth).toArray();
      const spawnPos = entranceRow.length > 0 ? Number(entranceRow[0].entrance_pos) : 100;

      this.sql.exec(
        `INSERT INTO players (player_id, session_token, pos, connected) VALUES (?, ?, ?, 1)
         ON CONFLICT(player_id) DO UPDATE SET session_token=excluded.session_token, connected=1`,
        playerId, sessionToken, spawnPos
      );

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
            this.sql.exec(`UPDATE players SET connected = 1 WHERE player_id = ?`, session.playerId);
            const gap = this.currentSequence - lastSeq;

            if (gap > 0 && gap <= 50) {
              const missingEvents = this.sql.exec(`SELECT sequence, sender_id, event_type, payload FROM events WHERE sequence > ? ORDER BY sequence ASC`, lastSeq).toArray();
              if (missingEvents.length === gap) {
                ws.send(JSON.stringify({
                  protocolVersion: "1.0.0",
                  messageType: "EVENT_BATCH",
                  sequence: this.currentSequence,
                  payloadJson: JSON.stringify(missingEvents)
                }));
                return;
              }
            }

            const players = this.sql.exec(`SELECT player_id, class_name, pos, hp, ht, ready, state FROM players`).toArray();
            const mobs = this.sql.exec(`SELECT mob_id, name, pos, hp, ht FROM mobs WHERE depth = ?`, this.currentDepth).toArray();
            const claims = this.sql.exec(`SELECT item_pos, claimed_by FROM claimed_items WHERE depth = ?`, this.currentDepth).toArray();

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
                claims
              })
            }));
            return;
          }
        } catch (_) {}
      }

      if (msg.messageType === "ACTION") {
        if (this.gameStatus === "ENDED") {
          ws.send(JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ERROR",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify({ error: "MATCH_ALREADY_ENDED" })
          }));
          return;
        }

        // Persistent Deduplication Check
        if (msg.requestId) {
          const dupRow = this.sql.exec(`SELECT sequence, result_json FROM processed_actions WHERE request_id = ?`, msg.requestId).toArray();
          if (dupRow.length > 0) {
            const origSeq = Number(dupRow[0].sequence);
            const origResult = String(dupRow[0].result_json);
            ws.send(JSON.stringify({
              protocolVersion: "1.0.0",
              messageType: "ACTION_ACCEPTED",
              requestId: msg.requestId,
              sequence: origSeq,
              payloadJson: origResult
            }));
            return;
          }
        }

        let eventType = "PLAYER_MOVED";
        let actionResultPayload: any = {};
        let actionValid = false;
        let actionCost = 1.0;

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

          if (actionStr === "MOVE" && targetPos >= 0 && targetPos < 1024) {
            const playerRow = this.sql.exec(`SELECT pos, state FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0 && String(playerRow[0].state) === "ALIVE") {
              const currentPos = Number(playerRow[0].pos);
              const mapWidth = 32;
              const dx = Math.abs((currentPos % mapWidth) - (targetPos % mapWidth));
              const dy = Math.abs(Math.floor(currentPos / mapWidth) - Math.floor(targetPos / mapWidth));

              if (dx <= 1 && dy <= 1) {
                const tileRow = this.sql.exec(`SELECT passable, solid FROM level_tiles WHERE depth = ? AND pos = ?`, this.currentDepth, targetPos).toArray();
                if (tileRow.length > 0 && Number(tileRow[0].passable) === 1 && Number(tileRow[0].solid) === 0) {
                  this.sql.exec(`UPDATE players SET pos = ? WHERE player_id = ?`, targetPos, session.playerId);
                  eventType = "PLAYER_MOVED";
                  actionResultPayload = { playerId: session.playerId, pos: targetPos };
                  actionValid = true;
                  actionCost = 1.0;
                }
              }
            }
          } else if (actionStr === "LVL_TRANSITION") {
            const playerRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0) {
              const currentPos = Number(playerRow[0].pos);
              const transRow = this.sql.exec(`SELECT target_depth FROM level_transitions WHERE depth = ? AND pos = ? AND type = 'EXIT'`, this.currentDepth, currentPos).toArray();
              if (transRow.length > 0) {
                const targetDepth = Number(transRow[0].target_depth);
                this.currentDepth = targetDepth;
                this.sql.exec(`UPDATE room_meta SET value = ? WHERE key = 'depth'`, this.currentDepth.toString());

                this.ensureLevelGenerated(this.currentDepth);

                const newEntranceRow = this.sql.exec(`SELECT entrance_pos FROM levels WHERE depth = ?`, this.currentDepth).toArray();
                const newPos = newEntranceRow.length > 0 ? Number(newEntranceRow[0].entrance_pos) : 100;
                this.sql.exec(`UPDATE players SET pos = ? WHERE player_id = ?`, newPos, session.playerId);

                eventType = "LEVEL_TRANSITION";
                actionResultPayload = { depth: this.currentDepth, newPos };
                actionValid = true;
                actionCost = 1.0;
              }
            }
          } else if (actionStr === "ATTACK") {
            const targetId = payload.data?.targetId || payload.targetId;
            const targetType = payload.data?.targetType || payload.targetType || "MOB";

            const attackerRow = this.sql.exec(`SELECT pos, str, weapon_dmg_max FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (attackerRow.length > 0) {
              const attackerPos = Number(attackerRow[0].pos);
              const weaponDmgMax = Number(attackerRow[0].weapon_dmg_max);

              if (targetType === "PLAYER") {
                if (this.gameMode === "PVP_ARENA" || this.gameMode === "DEATHMATCH") {
                  const defenderRow = this.sql.exec(`SELECT pos, hp, armor_val, state FROM players WHERE player_id = ?`, targetId).toArray();
                  if (defenderRow.length > 0 && String(defenderRow[0].state) === "ALIVE") {
                    const defPos = Number(defenderRow[0].pos);
                    const defHp = Number(defenderRow[0].hp);
                    const armorVal = Number(defenderRow[0].armor_val);

                    if (this.hasLineOfSight(attackerPos, defPos, this.currentDepth)) {
                      const rng = new SeededRNG(this.matchSeed + this.currentSequence + 1);
                      const hit = rng.nextFloat() > 0.15;
                      const rawDmg = hit ? rng.intRange(2, weaponDmgMax) : 0;
                      const finalDmg = Math.max(0, rawDmg - armorVal);
                      const newHp = Math.max(0, defHp - finalDmg);

                      const newState = newHp === 0 ? (this.gameMode === "DEATHMATCH" ? "ALIVE" : "SPECTATOR") : "ALIVE";
                      this.sql.exec(`UPDATE players SET hp = ?, state = ? WHERE player_id = ?`, newHp, newState, targetId);

                      if (newHp === 0) {
                        this.sql.exec(`UPDATE players SET kills = kills + 1 WHERE player_id = ?`, session.playerId);
                        this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, targetId);
                        this.checkMatchEndCondition();
                      }

                      eventType = "PLAYER_ATTACKED";
                      actionResultPayload = {
                        attackerId: session.playerId,
                        targetId,
                        targetType: "PLAYER",
                        hit,
                        damage: finalDmg,
                        targetHp: newHp,
                        targetState: newState
                      };
                      actionValid = true;
                      actionCost = 1.0;
                    }
                  }
                }
              } else {
                const mobRow = this.sql.exec(`SELECT mob_id, hp, pos FROM mobs WHERE mob_id = ? AND depth = ?`, targetId, this.currentDepth).toArray();
                if (mobRow.length > 0) {
                  const mobPos = Number(mobRow[0].pos);
                  const mobHp = Number(mobRow[0].hp);

                  if (this.hasLineOfSight(attackerPos, mobPos, this.currentDepth)) {
                    const rng = new SeededRNG(this.matchSeed + this.currentSequence + 1);
                    const hit = rng.nextFloat() > 0.15;
                    const rawDmg = hit ? rng.intRange(2, weaponDmgMax) : 0;
                    const newHp = Math.max(0, mobHp - rawDmg);

                    this.sql.exec(`UPDATE mobs SET hp = ? WHERE mob_id = ?`, newHp, targetId);
                    eventType = "PLAYER_ATTACKED";
                    actionResultPayload = {
                      attackerId: session.playerId,
                      targetId,
                      targetType: "MOB",
                      hit,
                      damage: rawDmg,
                      targetHp: newHp
                    };
                    actionValid = true;
                    actionCost = 1.0;
                  }
                }
              }
            }
          } else if (actionStr === "PICKUP" || actionStr === "OPEN_CHEST") {
            const itemPos = payload.data?.itemPos ?? targetPos;
            const existingClaim = this.sql.exec(`SELECT claimed_by FROM claimed_items WHERE item_pos = ? AND depth = ?`, itemPos, this.currentDepth).toArray();
            if (existingClaim.length > 0) {
              ws.send(JSON.stringify({
                protocolVersion: "1.0.0",
                messageType: "ERROR",
                requestId: msg.requestId,
                sequence: this.currentSequence,
                payloadJson: JSON.stringify({ error: "ITEM_ALREADY_CLAIMED", itemPos })
              }));
              return;
            } else {
              this.sql.exec(`INSERT INTO claimed_items (item_pos, depth, claimed_by) VALUES (?, ?, ?)`, itemPos, this.currentDepth, session.playerId);
              eventType = actionStr === "PICKUP" ? "ITEM_PICKED_UP" : "CHEST_OPENED";
              actionResultPayload = { itemPos, claimedBy: session.playerId };
              actionValid = true;
              actionCost = 1.0;
            }
          }
        } catch (_) {}

        if (actionValid) {
          // Increment sequence ONLY after successful validation and commit
          this.currentSequence++;
          this.worldTime += actionCost;

          const resultJson = JSON.stringify({ status: "ACCEPTED", sequence: this.currentSequence });

          if (msg.requestId) {
            this.sql.exec(
              `INSERT INTO processed_actions (request_id, player_id, sequence, result_json) VALUES (?, ?, ?, ?)`,
              msg.requestId, session.playerId, this.currentSequence, resultJson
            );
          }

          this.sql.exec(
            `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, ?, ?, ?)`,
            this.currentSequence, session.playerId, eventType, JSON.stringify(actionResultPayload)
          );

          ws.send(JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ACTION_ACCEPTED",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: resultJson
          }));

          this.broadcastWithFOV(session.playerId, eventType, actionResultPayload, ws);

          this.processMobTurns();
        } else {
          ws.send(JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ERROR",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify({ error: "INVALID_ACTION" })
          }));
        }
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
        const mobs = this.sql.exec(`SELECT mob_id, name, pos, hp, ht FROM mobs WHERE depth = ?`, this.currentDepth).toArray();
        const claims = this.sql.exec(`SELECT item_pos, claimed_by FROM claimed_items WHERE depth = ?`, this.currentDepth).toArray();

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
            claims,
            events
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
        payloadJson: JSON.stringify({ error: (e as Error).message })
      }));
    }
  }

  private checkMatchEndCondition() {
    if (this.gameMode === "DEATHMATCH") {
      const topKills = this.sql.exec(`SELECT player_id, kills FROM players ORDER BY kills DESC LIMIT 1`).toArray();
      if (topKills.length > 0 && Number(topKills[0].kills) >= 10) {
        this.gameStatus = "ENDED";
        const winnerId = String(topKills[0].player_id);

        this.currentSequence++;
        const matchEndPayload = {
          reason: "KILL_LIMIT_REACHED",
          winnerId,
          kills: Number(topKills[0].kills)
        };

        this.sql.exec(
          `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, 'SERVER', 'MATCH_END', ?)`,
          this.currentSequence, JSON.stringify(matchEndPayload)
        );

        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "EVENT_BATCH",
          senderId: "SERVER",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType: "MATCH_END", depth: this.currentDepth, action: matchEndPayload }])
        });
      }
    } else if (this.gameMode === "PVP_ARENA") {
      const alivePlayers = this.sql.exec(`SELECT player_id FROM players WHERE state = 'ALIVE'`).toArray();
      if (alivePlayers.length === 1) {
        this.gameStatus = "ENDED";
        const winnerId = String(alivePlayers[0].player_id);

        this.currentSequence++;
        const matchEndPayload = {
          reason: "LAST_PLAYER_STANDING",
          winnerId
        };

        this.sql.exec(
          `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, 'SERVER', 'MATCH_END', ?)`,
          this.currentSequence, JSON.stringify(matchEndPayload)
        );

        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "EVENT_BATCH",
          senderId: "SERVER",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType: "MATCH_END", depth: this.currentDepth, action: matchEndPayload }])
        });
      }
    }
  }

  private processMobTurns() {
    const activeMobs = this.sql.exec(`SELECT mob_id, name, pos, hp, dmg_max FROM mobs WHERE depth = ? AND hp > 0`, this.currentDepth).toArray();
    const activePlayers = this.sql.exec(`SELECT player_id, pos, hp, armor_val FROM players WHERE state = 'ALIVE'`).toArray();

    if (activeMobs.length === 0 || activePlayers.length === 0) return;

    const mapWidth = 32;

    for (const mob of activeMobs) {
      const mobId = Number(mob.mob_id);
      const mobPos = Number(mob.pos);
      const mobDmgMax = Number(mob.dmg_max);

      let closestPlayer: any = null;
      let minDistance = 999999;

      for (const player of activePlayers) {
        const playerPos = Number(player.pos);
        if (this.hasLineOfSight(mobPos, playerPos, this.currentDepth)) {
          const dx = Math.abs((mobPos % mapWidth) - (playerPos % mapWidth));
          const dy = Math.abs(Math.floor(mobPos / mapWidth) - Math.floor(playerPos / mapWidth));
          const dist = dx + dy;
          if (dist < minDistance) {
            minDistance = dist;
            closestPlayer = player;
          }
        }
      }

      if (!closestPlayer) continue;

      const targetPos = Number(closestPlayer.pos);
      const targetPlayerId = String(closestPlayer.player_id);
      const targetHp = Number(closestPlayer.hp);
      const targetArmor = Number(closestPlayer.armor_val);

      const dx = Math.abs((mobPos % mapWidth) - (targetPos % mapWidth));
      const dy = Math.abs(Math.floor(mobPos / mapWidth) - Math.floor(targetPos / mapWidth));

      if (dx <= 1 && dy <= 1) {
        this.currentSequence++;
        const rng = new SeededRNG(this.matchSeed + this.currentSequence + mobId);
        const hit = rng.nextFloat() > 0.20;
        const rawDmg = hit ? rng.intRange(1, mobDmgMax) : 0;
        const finalDmg = Math.max(0, rawDmg - targetArmor);
        const newPlayerHp = Math.max(0, targetHp - finalDmg);

        const newState = newPlayerHp === 0 ? "DEAD" : "ALIVE";
        this.sql.exec(`UPDATE players SET hp = ?, state = ? WHERE player_id = ?`, newPlayerHp, newState, targetPlayerId);

        const attackPayload = {
          mobId,
          targetPlayerId,
          hit,
          damage: finalDmg,
          playerHp: newPlayerHp,
          playerState: newState
        };

        this.sql.exec(
          `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, 'SERVER', 'MOB_ATTACKED', ?)`,
          this.currentSequence, JSON.stringify(attackPayload)
        );

        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "EVENT_BATCH",
          senderId: "SERVER",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType: "MOB_ATTACKED", depth: this.currentDepth, action: attackPayload }])
        });
      } else if (minDistance <= 8) {
        let stepX = mobPos % mapWidth;
        let stepY = Math.floor(mobPos / mapWidth);

        if (targetPos % mapWidth > stepX) stepX++;
        else if (targetPos % mapWidth < stepX) stepX--;

        if (Math.floor(targetPos / mapWidth) > stepY) stepY++;
        else if (Math.floor(targetPos / mapWidth) < stepY) stepY--;

        const nextPos = stepY * mapWidth + stepX;

        const tileRow = this.sql.exec(`SELECT passable FROM level_tiles WHERE depth = ? AND pos = ?`, this.currentDepth, nextPos).toArray();
        if (tileRow.length > 0 && Number(tileRow[0].passable) === 1) {
          this.sql.exec(`UPDATE mobs SET pos = ? WHERE mob_id = ?`, nextPos, mobId);

          this.currentSequence++;
          const movePayload = { mobId, fromPos: mobPos, toPos: nextPos };

          this.sql.exec(
            `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, 'SERVER', 'MOB_MOVED', ?)`,
            this.currentSequence, JSON.stringify(movePayload)
          );

          this.broadcast({
            protocolVersion: "1.0.0",
            messageType: "EVENT_BATCH",
            senderId: "SERVER",
            sequence: this.currentSequence,
            payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType: "MOB_MOVED", depth: this.currentDepth, action: movePayload }])
          });
        }
      }
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
    const senderRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, senderId).toArray();
    const actionPos = actionPayload.pos !== undefined ? Number(actionPayload.pos) : (senderRow.length > 0 ? Number(senderRow[0].pos) : -1);

    for (const ws of this.state.getWebSockets()) {
      if (ws === excludeWs) continue;

      const recipientSession = ws.deserializeAttachment() as SessionData | null;
      if (!recipientSession) continue;

      let sendToClient = true;

      if (this.gameMode === "PVP_ARENA" || this.gameMode === "DEATHMATCH") {
        const recipientRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, recipientSession.playerId).toArray();
        if (recipientRow.length > 0 && actionPos >= 0) {
          const recipientPos = Number(recipientRow[0].pos);
          sendToClient = this.hasLineOfSight(recipientPos, actionPos, this.currentDepth);
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
