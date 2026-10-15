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

    const timeRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'worldTime'`).toArray();
    this.worldTime = timeRow.length > 0 ? Number(timeRow[0].value) || 0 : 0;

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

  private isMeleeAdjacent(fromPos: number, toPos: number, depth: number): boolean {
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
      if (this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray().length === 0) {
        this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('levelPublisher', ?)`, playerId);
      }

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

            const players = this.sql.exec(`SELECT player_id, class_name, pos, hp, ht, ready, state FROM players`).toArray().map((player: any) => {
              const savedHero = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `heroState:${player.player_id}`).toArray()[0];
              return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
            });
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
                worldTime: this.worldTime,
                level: this.getCurrentLevelSnapshot()
              })
            }));
            return;
          }
        } catch (_) {}
      }

      if (msg.messageType === "LEVEL_DATA") {
        const authority = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray();
        if (!authority.length || String(authority[0].value) !== session.playerId) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "LEVEL_PUBLISHER_ONLY" }) }));
          return;
        }
        const level = JSON.parse(msg.payloadJson || "{}");
        const width = Number(level.width), height = Number(level.height), depth = Number(level.depth);
        const tiles = level.tiles, transitions = Array.isArray(level.transitions) ? level.transitions : [];
        const mobs = Array.isArray(level.mobs) ? level.mobs : [];
        const size = width * height;
        const validPos = (p: number) => Number.isInteger(p) && p >= 0 && p < size;
        if (Number(level.schemaVersion) !== 1 || Number(level.branch) !== 0 || depth < 1 || depth > 100
          || !Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
          || width > 100 || height > 100 || !Array.isArray(tiles) || tiles.length !== size
          || !validPos(Number(level.entrancePos)) || !validPos(Number(level.exitPos))
          || transitions.length > 128 || mobs.length > 512) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_LEVEL_SNAPSHOT" }) }));
          return;
        }
        const positions = new Set<number>();
        for (const tile of tiles) {
          const pos = Number(tile?.pos);
          if (!validPos(pos) || positions.has(pos) || !Number.isInteger(Number(tile?.terrain))
            || typeof tile?.passable !== "boolean" || typeof tile?.solid !== "boolean"
            || typeof tile?.pit !== "boolean" || typeof tile?.losBlocking !== "boolean") {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_LEVEL_TILES" }) }));
            return;
          }
          positions.add(pos);
        }
        for (const t of transitions) {
          if (!validPos(Number(t?.pos)) || !Number.isInteger(Number(t?.targetDepth))
            || !["SURFACE", "REGULAR_ENTRANCE", "REGULAR_EXIT", "BRANCH_ENTRANCE", "BRANCH_EXIT"].includes(String(t?.type))) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_TRANSITIONS" }) }));
            return;
          }
        }
        for (const mob of mobs) {
          if (!validPos(Number(mob?.pos)) || !Number.isInteger(Number(mob?.mobId))
            || !Number.isFinite(Number(mob?.hp)) || !Number.isFinite(Number(mob?.ht))
            || typeof mob?.name !== "string") {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_MOBS" }) }));
            return;
          }
        }
        this.sql.exec(`DELETE FROM level_tiles WHERE depth = ?`, depth);
        this.sql.exec(`DELETE FROM level_transitions WHERE depth = ?`, depth);
        this.sql.exec(`DELETE FROM mobs WHERE depth = ?`, depth);
        this.sql.exec(`INSERT INTO levels (depth,width,height,entrance_pos,exit_pos,seed) VALUES (?,?,?,?,?,?)
          ON CONFLICT(depth) DO UPDATE SET width=excluded.width,height=excluded.height,
          entrance_pos=excluded.entrance_pos,exit_pos=excluded.exit_pos,seed=excluded.seed`,
          depth,width,height,Number(level.entrancePos),Number(level.exitPos),Number(level.seed)||this.matchSeed);
        this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
          `levelSnapshot:${depth}`, JSON.stringify(level));
        if (typeof level.heroStateJson === "string" && level.heroStateJson.length <= 200000) {
          this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            `heroState:${session.playerId}`, level.heroStateJson);
        }
        for (const t of tiles) {
          this.sql.exec(`INSERT INTO level_tiles (depth,pos,terrain,passable,solid,pit,los_blocking) VALUES (?,?,?,?,?,?,?)`,
            depth,Number(t.pos),String(Number(t.terrain)),t.passable?1:0,t.solid?1:0,t.pit?1:0,t.losBlocking?1:0);
        }
        for (const t of transitions) {
          const type = String(t.type).endsWith("EXIT") ? "EXIT" : "ENTRANCE";
          this.sql.exec(`INSERT INTO level_transitions (transition_id,depth,pos,type,target_depth) VALUES (?,?,?,?,?)`,
            `spd_${depth}_${Number(t.pos)}_${String(t.type)}`,depth,Number(t.pos),type,Number(t.targetDepth));
        }
        for (const m of mobs) {
          const initialCooldown = Math.max(0, Math.min(100, Number(m.cooldown) || 0));
          this.sql.exec(`INSERT OR REPLACE INTO mobs (mob_id,depth,name,pos,hp,ht,str,dmg_max,next_act_at,state)
            VALUES (?,?,?,?,?,?,8,6,?,'HUNTING')`,
            Number(m.mobId),depth,String(m.name).slice(0,80),Number(m.pos),Number(m.hp),Math.max(1,Number(m.ht)),this.worldTime + initialCooldown);
        }
        ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ACK", requestId: msg.requestId,
          sequence: this.currentSequence, payloadJson: JSON.stringify({ accepted: true, source: "SPD_JAVA_GENERATOR",
            depth,width,height,tileCount: tiles.length,transitionCount: transitions.length,mobCount: mobs.length }) }));
        return;
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
          if (typeof payload.heroStateJson === "string" && payload.heroStateJson.length <= 200000) {
            this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
              `heroState:${session.playerId}`, payload.heroStateJson);
          }
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

          if (actionStr === "SYNC_HERO_STATE") {
            const hp = Number(payload.data?.targetHp);
            const ht = Number(payload.data?.targetHt);
            if (Number.isInteger(hp) && hp >= 0 && Number.isInteger(ht) && ht > 0) {
              const previous = this.sql.exec(`SELECT hp, state FROM players WHERE player_id = ?`, session.playerId).toArray();
              if (previous.length > 0) {
                const oldState = String(previous[0].state);
                const newState = hp === 0 && this.gameMode !== "DEATHMATCH" ? "DEAD" : "ALIVE";
                this.sql.exec(`UPDATE players SET hp = ?, ht = ?, state = ? WHERE player_id = ?`,
                  Math.min(hp, ht), ht, newState, session.playerId);
                if (oldState !== "DEAD" && newState === "DEAD") {
                  this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, session.playerId);
                }
                eventType = "PLAYER_DAMAGED";
                actionResultPayload = {
                  targetId: session.playerId, targetType: "PLAYER",
                  targetHp: Math.min(hp, ht), targetHt: ht,
                  targetState: newState, damage: Math.max(0, Number(payload.data?.damage) || 0),
                  engineResolved: true
                };
                actionValid = true;
                actionCost = 0;
              }
            }
          } else if (actionStr === "MOVE" && targetPos >= 0) {
            const playerRow = this.sql.exec(`SELECT pos, state FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0 && String(playerRow[0].state) === "ALIVE") {
              const currentPos = Number(playerRow[0].pos);
              const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray();
              const mapWidth = levelRow.length > 0 ? Number(levelRow[0].width) : 32;
              const mapHeight = levelRow.length > 0 ? Number(levelRow[0].height) : 32;
              const dx = Math.abs((currentPos % mapWidth) - (targetPos % mapWidth));
              const dy = Math.abs(Math.floor(currentPos / mapWidth) - Math.floor(targetPos / mapWidth));
              const inBounds = targetPos < mapWidth * mapHeight;
              const adjacent = dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
              let cornerBlocked = false;
              if (dx === 1 && dy === 1) {
                const sideA = currentPos + (targetPos % mapWidth > currentPos % mapWidth ? 1 : -1);
                const sideB = currentPos + (Math.floor(targetPos / mapWidth) > Math.floor(currentPos / mapWidth) ? mapWidth : -mapWidth);
                const sideRows = this.sql.exec(`SELECT passable, solid FROM level_tiles WHERE depth = ? AND pos IN (?, ?)`, this.currentDepth, sideA, sideB).toArray();
                cornerBlocked = sideRows.length !== 2 || sideRows.some((tile: any) => Number(tile.passable) !== 1 || Number(tile.solid) === 1);
              }
              const tileRow = inBounds ? this.sql.exec(`SELECT passable, solid, pit FROM level_tiles WHERE depth = ? AND pos = ?`, this.currentDepth, targetPos).toArray() : [];
              if (adjacent && inBounds && !cornerBlocked && tileRow.length > 0
                  && Number(tileRow[0].passable) === 1 && Number(tileRow[0].solid) === 0
                  && Number(tileRow[0].pit) === 0) {
                this.sql.exec(`UPDATE players SET pos = ? WHERE player_id = ?`, targetPos, session.playerId);
                eventType = "PLAYER_MOVED";
                actionResultPayload = { playerId: session.playerId, pos: targetPos };
                actionValid = true;
                const nativeMoveCost = Number(payload.data?.engineActionCost);
                actionCost = Number.isFinite(nativeMoveCost) ? Math.max(0.05, Math.min(10, nativeMoveCost)) : 1.0;
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
                if (this.gameMode === "COOP_DUNGEON" || this.gameMode === "SURVIVAL") {
                  this.sql.exec(`UPDATE players SET pos = ? WHERE state = 'ALIVE'`, newPos);
                } else {
                  this.sql.exec(`UPDATE players SET pos = ? WHERE player_id = ?`, newPos, session.playerId);
                }

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

                    if (this.isMeleeAdjacent(attackerPos, defPos, this.currentDepth)) {
                      const rng = new SeededRNG(this.matchSeed + this.currentSequence + 1);
                      const hit = rng.nextFloat() > 0.15;
                      const rawDmg = hit ? rng.intRange(2, weaponDmgMax) : 0;
                      const finalDmg = Math.max(0, rawDmg - armorVal);
                      const newHp = Math.max(0, defHp - finalDmg);

                      const newState = newHp === 0 ? (this.gameMode === "DEATHMATCH" ? "ALIVE" : "SPECTATOR") : "ALIVE";
                      this.sql.exec(`UPDATE players SET hp = ?, state = ? WHERE player_id = ?`, newHp, newState, targetId);

                      if (newHp === 0) {
                        this.sql.exec(`UPDATE players SET kills = kills + 1, score = score + 1 WHERE player_id = ?`, session.playerId);
                        this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, targetId);
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
                const mobRow = this.sql.exec(`SELECT mob_id, hp, ht, pos FROM mobs WHERE mob_id = ? AND depth = ?`, targetId, this.currentDepth).toArray();
                if (mobRow.length > 0) {
                  const mobPos = Number(mobRow[0].pos);
                  const mobHp = Number(mobRow[0].hp);
                  const nativeResult = payload.data?.engineResult === true;
                  const requestedPos = Number(payload.data?.targetPos ?? -1);

                  if (nativeResult) {
                    const distance = Number(payload.data?.engineDistance);
                    const nativeCost = Number(payload.data?.engineActionCost);
                    const ranged = payload.data?.engineRanged === true;
                    const targetHp = Number(payload.data?.targetHp);
                    const reportedDamage = Number(payload.data?.damage);
                    const validNativeTarget = requestedPos === mobPos && Number.isFinite(distance)
                      && distance >= 0 && distance <= (ranged ? 8 : 1)
                      && Number.isFinite(targetHp) && Number.isFinite(reportedDamage);
                    if (validNativeTarget) {
                      const targetHt = Math.max(1, Number(mobRow[0].ht) || Number(payload.data?.targetHt) || 1);
                      const newHp = Math.max(0, Math.min(targetHt, targetHp));
                      const rawDmg = Math.max(0, Math.min(targetHt, reportedDamage));
                      this.sql.exec(`UPDATE mobs SET hp = ? WHERE mob_id = ? AND depth = ?`, newHp, targetId, this.currentDepth);
                      eventType = "PLAYER_ATTACKED";
                      actionResultPayload = {
                        attackerId: session.playerId, targetId, targetType: "MOB",
                        hit: payload.data?.engineHit === true, damage: rawDmg, targetHp: newHp,
                        targetHt, engineResolved: true
                      };
                      actionValid = true;
                      actionCost = Number.isFinite(nativeCost) ? Math.max(0.05, Math.min(10, nativeCost)) : 1.0;
                    }
                  } else if (this.isMeleeAdjacent(attackerPos, mobPos, this.currentDepth)) {
                    // Compatibility path for clients that do not yet submit native SPD outcomes.
                    const rng = new SeededRNG(this.matchSeed + this.currentSequence + 1);
                    const hit = rng.nextFloat() > 0.15;
                    const rawDmg = hit ? rng.intRange(2, weaponDmgMax) : 0;
                    const newHp = Math.max(0, mobHp - rawDmg);
                    this.sql.exec(`UPDATE mobs SET hp = ? WHERE mob_id = ?`, newHp, targetId);
                    eventType = "PLAYER_ATTACKED";
                    actionResultPayload = { attackerId: session.playerId, targetId, targetType: "MOB", hit, damage: rawDmg, targetHp: newHp };
                    actionValid = true;
                    actionCost = 1.0;
                  }
                }
              }
            }
          } else if (actionStr === "WAIT") {
            const playerRow = this.sql.exec(`SELECT state FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0 && String(playerRow[0].state) === "ALIVE") {
              eventType = "PLAYER_WAITED";
              actionResultPayload = { playerId: session.playerId };
              actionValid = true;
              actionCost = 1.0;
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
          this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('worldTime', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, String(this.worldTime));

          const resultJson = JSON.stringify({
            status: "ACCEPTED",
            sequence: this.currentSequence,
            eventType,
            action: actionResultPayload,
            actionCost
          });

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
          this.checkMatchEndCondition();
          if (actionStr !== "SYNC_HERO_STATE") this.processMobTurns();
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
        const players = this.sql.exec(`SELECT player_id, class_name, pos, hp, ht, ready, state FROM players`).toArray().map((player: any) => {
              const savedHero = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `heroState:${player.player_id}`).toArray()[0];
              return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
            });
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
        payloadJson: JSON.stringify({ error: (e as Error).message })
      }));
    }
  }

  private getCurrentLevelSnapshot() {
    const level = this.sql.exec(`SELECT depth,width,height,entrance_pos,exit_pos,seed FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0];
    if (!level) return null;
    const saved = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `levelSnapshot:${this.currentDepth}`).toArray()[0];
    let original: any = {};
    if (saved && typeof saved.value === "string") {
      try { original = JSON.parse(String(saved.value)); } catch (_) { original = {}; }
    }
    // Hero inventory/buffs belong to an individual player, never to the shared level snapshot.
    const { heroStateJson: _sharedHeroState, ...originalWorld } = original;
    const originalMobs = new Map<number, any>(
      (Array.isArray(original.mobs) ? original.mobs : []).map((mob: any) => [Number(mob.mobId), mob])
    );
    const liveMobs = this.sql.exec(`SELECT mob_id,name,pos,hp,ht,str,dmg_max,next_act_at,state FROM mobs WHERE depth = ?`, this.currentDepth).toArray();
    return {
      ...originalWorld,
      depth: Number(level.depth), width: Number(level.width), height: Number(level.height),
      entrancePos: Number(level.entrance_pos), exitPos: Number(level.exit_pos), seed: Number(level.seed),
      tiles: this.sql.exec(`SELECT pos,terrain,passable,solid,pit,los_blocking FROM level_tiles WHERE depth = ? ORDER BY pos`, this.currentDepth).toArray(),
      transitions: Array.isArray(original.transitions) ? original.transitions :
        this.sql.exec(`SELECT transition_id,pos,type,target_depth FROM level_transitions WHERE depth = ? ORDER BY pos`, this.currentDepth).toArray(),
      mobs: liveMobs.map((mob: any) => {
        const savedMob = originalMobs.get(Number(mob.mob_id)) || {};
        return {
          ...savedMob, ...mob,
          state: typeof savedMob.state === "string" ? savedMob.state : mob.state,
          defenseSkill: Number(savedMob.defenseSkill) || 0,
          baseSpeed: Number(savedMob.baseSpeed) || 1,
          cooldown: Number(savedMob.cooldown) || 0
        };
      }),
      heaps: Array.isArray(original.heaps) ? original.heaps : [],
      traps: Array.isArray(original.traps) ? original.traps : [],
      claims: this.sql.exec(`SELECT item_pos,claimed_by FROM claimed_items WHERE depth = ?`, this.currentDepth).toArray()
    };
  }

  private checkMatchEndCondition() {
    if (this.gameStatus === "ENDED") return;
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
      const playerCount = this.sql.exec(`SELECT COUNT(*) AS total FROM players`).toArray();
      const alivePlayers = this.sql.exec(`SELECT player_id FROM players WHERE state = 'ALIVE'`).toArray();
      if (Number(playerCount[0]?.total || 0) >= 2 && alivePlayers.length === 1) {
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

  /** Finds the shortest legal 8-way SPD-style step without cutting corners or overlapping actors. */
  private findNextMobStep(start: number, target: number, width: number, depth: number, mobId: number): number {
    const levelRows = this.sql.exec(
      `SELECT pos, passable, solid, pit FROM level_tiles WHERE depth = ?`, depth
    ).toArray();
    const tiles = new Map<number, { passable: number; solid: number; pit: number }>();
    for (const row of levelRows) {
      tiles.set(Number(row.pos), {
        passable: Number(row.passable), solid: Number(row.solid), pit: Number(row.pit)
      });
    }
    const mobRows = this.sql.exec(`SELECT pos FROM mobs WHERE depth = ? AND hp > 0 AND mob_id != ?`, depth, mobId).toArray();
    const occupied = new Set<number>(mobRows.map((row: any) => Number(row.pos)));
    const playerRows = this.sql.exec(`SELECT pos FROM players WHERE state = 'ALIVE'`).toArray();
    for (const row of playerRows) occupied.add(Number(row.pos));

    const height = levelRows.length / Math.max(1, width);
    const count = Math.floor(width * height);
    if (start < 0 || target < 0 || start >= count || target >= count || width < 1) return -1;
    const queue = new Int32Array(count);
    const previous = new Int32Array(count);
    const firstStep = new Int32Array(count);
    previous.fill(-2);
    previous[start] = -1;
    let head = 0, tail = 0;
    queue[tail++] = start;
    const targetX = target % width, targetY = Math.floor(target / width);
    let goal = -1;
    const dirs = [-1, 0, 1];

    while (head < tail) {
      const current = queue[head++];
      if (current !== start) {
        const cx = current % width, cy = Math.floor(current / width);
        if (Math.abs(cx - targetX) <= 1 && Math.abs(cy - targetY) <= 1
          && (cx !== targetX || cy !== targetY)) {
          goal = current;
          break;
        }
      }
      const x = current % width, y = Math.floor(current / width);
      for (const dy of dirs) for (const dx of dirs) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny * width + nx >= count) continue;
        const next = ny * width + nx;
        if (previous[next] !== -2 || occupied.has(next)) continue;
        const tile = tiles.get(next);
        if (!tile || tile.passable !== 1 || tile.solid === 1 || tile.pit === 1) continue;
        if (dx !== 0 && dy !== 0) {
          const sideA = tiles.get(y * width + nx);
          const sideB = tiles.get(ny * width + x);
          if (!sideA || !sideB || sideA.passable !== 1 || sideA.solid === 1 || sideA.pit === 1
            || sideB.passable !== 1 || sideB.solid === 1 || sideB.pit === 1) continue;
        }
        previous[next] = current;
        firstStep[next] = current === start ? next : firstStep[current];
        queue[tail++] = next;
      }
    }
    return goal < 0 ? -1 : firstStep[goal];
  }

  private getNativeMobTurnDelay(mobId: number): number {
    try {
      const row = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `levelSnapshot:${this.currentDepth}`).toArray()[0];
      if (row && typeof row.value === "string") {
        const snapshot = JSON.parse(String(row.value));
        const mobs = Array.isArray(snapshot.mobs) ? snapshot.mobs : [];
        const mob = mobs.find((entry: any) => Number(entry.mobId) === mobId);
        const speed = Number(mob?.baseSpeed);
        if (Number.isFinite(speed) && speed > 0) return Math.max(0.05, Math.min(10, 1 / speed));
      }
    } catch (_) {}
    return 1.0;
  }

  private processMobTurns() {
    if (this.gameStatus === "ENDED") return;
    const activeMobs = this.sql.exec(`SELECT mob_id, name, pos, hp, dmg_max, next_act_at FROM mobs WHERE depth = ? AND hp > 0 AND next_act_at <= ? ORDER BY next_act_at ASC, mob_id ASC`, this.currentDepth, this.worldTime).toArray();
    const activePlayers = this.sql.exec(`SELECT player_id, pos, hp, armor_val FROM players WHERE state = 'ALIVE'`).toArray();

    if (activeMobs.length === 0 || activePlayers.length === 0) return;

    const levelRow = this.sql.exec(`SELECT width FROM levels WHERE depth = ?`, this.currentDepth).toArray();
    const mapWidth = levelRow.length > 0 ? Number(levelRow[0].width) : 32;

    for (const mob of activeMobs) {
      const mobId = Number(mob.mob_id);
      const mobPos = Number(mob.pos);
      const mobDmgMax = Number(mob.dmg_max);

      let closestPlayer: any = null;
      let minDistance = 999999;

      for (const player of activePlayers) {
        const playerPos = Number(player.pos);
        {
          const dx = Math.abs((mobPos % mapWidth) - (playerPos % mapWidth));
          const dy = Math.abs(Math.floor(mobPos / mapWidth) - Math.floor(playerPos / mapWidth));
          const dist = Math.max(dx, dy) + (this.hasLineOfSight(mobPos, playerPos, this.currentDepth) ? 0 : 2);
          if (dist < minDistance) {
            minDistance = dist;
            closestPlayer = player;
          }
        }
      }

      if (!closestPlayer) {
        this.sql.exec(`UPDATE mobs SET next_act_at = ? WHERE mob_id = ?`, this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);
        continue;
      }

      const targetPos = Number(closestPlayer.pos);
      const targetPlayerId = String(closestPlayer.player_id);
      const targetHp = Number(closestPlayer.hp);
      const targetArmor = Number(closestPlayer.armor_val);

      const dx = Math.abs((mobPos % mapWidth) - (targetPos % mapWidth));
      const dy = Math.abs(Math.floor(mobPos / mapWidth) - Math.floor(targetPos / mapWidth));

      if (this.isMeleeAdjacent(mobPos, targetPos, this.currentDepth)) {
        this.currentSequence++;
        const rng = new SeededRNG(this.matchSeed + this.currentSequence + mobId);
        const hit = rng.nextFloat() > 0.20;
        const rawDmg = hit ? rng.intRange(1, mobDmgMax) : 0;
        const finalDmg = Math.max(0, rawDmg - targetArmor);
        const newPlayerHp = Math.max(0, targetHp - finalDmg);

        const newState = newPlayerHp === 0 ? "DEAD" : "ALIVE";
        this.sql.exec(`UPDATE players SET hp = ?, state = ?, deaths = deaths + CASE WHEN ? = 'DEAD' THEN 1 ELSE 0 END WHERE player_id = ?`, newPlayerHp, newState, newState, targetPlayerId);
        this.sql.exec(`UPDATE mobs SET next_act_at = ? WHERE mob_id = ?`, this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);

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
      } else if (Math.max(dx, dy) <= 8) {
        const nextPos = this.findNextMobStep(mobPos, targetPos, mapWidth, this.currentDepth, mobId);
        if (nextPos >= 0) {
          this.sql.exec(`UPDATE mobs SET pos = ?, next_act_at = ? WHERE mob_id = ?`, nextPos, this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);
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
        } else {
          this.sql.exec(`UPDATE mobs SET next_act_at = ? WHERE mob_id = ?`, this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);
        }
      } else {
        // A mob that cannot currently reach a visible target still consumes its turn.
        this.sql.exec(`UPDATE mobs SET next_act_at = ? WHERE mob_id = ?`, this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);
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

    for (const ws of this.state.getWebSockets()) {
      if (ws === excludeWs) continue;
      const recipientSession = ws.deserializeAttachment() as SessionData | null;
      if (!recipientSession) continue;

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
