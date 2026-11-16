import { isNativeLootClaimSchemaCurrent } from "../validators/inventory-claims";
import { hasCompleteNativeLevelSnapshot } from "../validators/world-state";
import { MatchRoomBase } from "./base";

export class MatchRoomPersistence extends MatchRoomBase {
  protected migrateProcessedActions(): void {
    const names = new Set(this.sql.exec("PRAGMA table_info(processed_actions)").toArray()
      .map((column: any) => String(column.name)));
    const requiredColumns = [
      ["request_fingerprint", "TEXT"],
      ["authority_id", "TEXT"],
      ["completion_fingerprint", "TEXT"]
    ] as const;
    for (const [name, type] of requiredColumns) {
      if (!names.has(name)) this.sql.exec("ALTER TABLE processed_actions ADD COLUMN " + name + " " + type);
    }
  }

  protected migrateClaimedItemInstances(): void {
    const columns: any[] = this.sql.exec("PRAGMA table_info(claimed_item_instances)").toArray();
    if (isNativeLootClaimSchemaCurrent(columns)) return;
    const hasBranch = columns.some((column: any) => String(column.name) === "branch");
    this.sql.exec("ALTER TABLE claimed_item_instances RENAME TO claimed_item_instances_legacy");
    this.sql.exec("CREATE TABLE claimed_item_instances (depth INTEGER NOT NULL, branch INTEGER NOT NULL DEFAULT 0, heap_id TEXT NOT NULL, item_id TEXT NOT NULL, claimed_by TEXT NOT NULL, request_id TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (depth, branch, heap_id, item_id))");
    const branchExpression = hasBranch ? "branch" : "0";
    this.sql.exec("INSERT OR IGNORE INTO claimed_item_instances (depth,branch,heap_id,item_id,claimed_by,request_id,created_at) SELECT depth," + branchExpression + ",heap_id,item_id,claimed_by,request_id,created_at FROM claimed_item_instances_legacy");
    this.sql.exec("DROP TABLE claimed_item_instances_legacy");
  }

  /** Versioned storage migrations; each step and its checkpoint are one SQLite transaction. */
  protected migrateSchema(): void {
    const readVersion = (): number => {
      const row = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "schemaVersion").toArray()[0];
      if (!row) return 0;
      const version = Number(row.value);
      if (!Number.isSafeInteger(version) || version < 0) throw new Error("ROOM_SCHEMA_VERSION_INVALID");
      return version;
    };
    const migrations = [
      { version: 1, apply: () => this.migrateProcessedActions() },
      { version: 2, apply: () => this.migrateClaimedItemInstances() }
    ];
    const latestVersion = migrations[migrations.length - 1].version;
    const initialVersion = readVersion();
    if (initialVersion > latestVersion) throw new Error("ROOM_SCHEMA_VERSION_UNSUPPORTED");
    for (const migration of migrations) {
      if (migration.version <= readVersion()) continue;
      this.state.storage.transactionSync(() => {
        const currentVersion = readVersion();
        if (currentVersion >= migration.version) return;
        if (currentVersion !== migration.version - 1) throw new Error("ROOM_SCHEMA_MIGRATION_GAP");
        migration.apply();
        this.sql.exec("INSERT INTO room_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          "schemaVersion", String(migration.version));
      });
    }
  }
  protected initDatabase() {
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
      CREATE TABLE IF NOT EXISTS claimed_item_instances (
        depth INTEGER NOT NULL,
        branch INTEGER NOT NULL DEFAULT 0,
        heap_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        claimed_by TEXT NOT NULL,
        request_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (depth, branch, heap_id, item_id)
      );
      CREATE TABLE IF NOT EXISTS claimed_chest_instances (
        depth INTEGER NOT NULL,
        heap_id TEXT NOT NULL,
        claimed_by TEXT NOT NULL,
        request_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (depth, heap_id)
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
        request_fingerprint TEXT,
        authority_id TEXT,
        completion_fingerprint TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS native_mob_reward_claims (
        reward_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        depth INTEGER NOT NULL,
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

    this.migrateSchema();

    const storedRoomData = this.sql.exec(`SELECT
      (SELECT COUNT(*) FROM players) AS players_count,
      (SELECT COUNT(*) FROM events) AS events_count,
      (SELECT COUNT(*) FROM levels) AS levels_count,
      (SELECT COUNT(*) FROM processed_actions) AS processed_count,
      (SELECT COUNT(*) FROM room_meta WHERE key LIKE 'levelSnapshot:%') AS snapshots_count,
      (SELECT COUNT(*) FROM room_meta WHERE key = 'levelPublisher') AS publisher_count,
      (SELECT COUNT(*) FROM room_meta WHERE key NOT IN ('gameMode','seed','depth','schemaVersion') AND NOT (key = 'currentSequence' AND value = '0') AND NOT (key = 'gameStatus' AND value = 'LOBBY')) AS other_meta_count,
      (SELECT COUNT(*) FROM level_tiles) AS tiles_count,
      (SELECT COUNT(*) FROM level_transitions) AS transitions_count,
      (SELECT COUNT(*) FROM mobs) AS mobs_count,
      (SELECT COUNT(*) FROM claimed_item_instances) AS item_claims_count,
      (SELECT COUNT(*) FROM claimed_chest_instances) AS chest_claims_count,
      (SELECT COUNT(*) FROM native_mob_reward_claims) AS reward_claims_count
    `).toArray()[0];
    const hasDurableRoomData = [
      storedRoomData?.players_count, storedRoomData?.events_count, storedRoomData?.levels_count,
      storedRoomData?.processed_count, storedRoomData?.snapshots_count, storedRoomData?.publisher_count,
      storedRoomData?.other_meta_count, storedRoomData?.tiles_count, storedRoomData?.transitions_count, storedRoomData?.mobs_count,
      storedRoomData?.item_claims_count, storedRoomData?.chest_claims_count, storedRoomData?.reward_claims_count
    ].some(value => Number(value || 0) > 0);

    // Older rooms wrote worldTime lazily on the first accepted ACTION. An absent row
    // therefore retains the legacy zero-clock default; any stored value must still validate.
    const timeRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'worldTime'`).toArray();
    if (timeRow.length > 0) {
      this.worldTime = Number(timeRow[0].value);
      if (!Number.isFinite(this.worldTime) || this.worldTime < 0) {
        throw new Error("ROOM_RECOVERY_INVALID_WORLD_TIME");
      }
    }

    // `events` may be compacted, so never derive the durable cursor from MAX(sequence) alone.
    // The metadata cursor is monotonic; MAX(events.sequence) is only the legacy backfill source.
    const seqRow = this.sql.exec(`SELECT MAX(sequence) as max_seq FROM events`).toArray();
    const eventSequence = seqRow.length > 0 && seqRow[0].max_seq !== null
      ? Number(seqRow[0].max_seq) : 0;
    if (!Number.isSafeInteger(eventSequence) || eventSequence < 0) {
      throw new Error("ROOM_RECOVERY_INVALID_EVENT_SEQUENCE");
    }
    const storedSequenceRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = ?", "currentSequence"
    ).toArray()[0];
    let storedSequence = 0;
    if (storedSequenceRow) {
      storedSequence = Number(storedSequenceRow.value);
      if (!Number.isSafeInteger(storedSequence) || storedSequence < 0) {
        throw new Error("ROOM_RECOVERY_INVALID_SEQUENCE_CHECKPOINT");
      }
    }
    this.currentSequence = Math.max(eventSequence, storedSequence);

    const modeRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'gameMode'`).toArray();
    if (modeRow.length > 0) {
      const persistedMode = String(modeRow[0].value);
      if (!["COOP_DUNGEON", "PVP_ARENA", "DEATHMATCH", "SURVIVAL"].includes(persistedMode)) {
        throw new Error("ROOM_RECOVERY_INVALID_GAME_MODE");
      }
      this.gameMode = persistedMode as any;
    } else {
      if (hasDurableRoomData) throw new Error("ROOM_RECOVERY_MISSING_GAME_MODE");
      this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('gameMode', 'COOP_DUNGEON')`);
    }

    const metaRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'seed'`).toArray();
    if (metaRow.length > 0) {
      this.matchSeed = Number(metaRow[0].value);
      if (!Number.isSafeInteger(this.matchSeed) || this.matchSeed < 0) {
        throw new Error("ROOM_RECOVERY_INVALID_SEED");
      }
    } else {
      if (hasDurableRoomData) throw new Error("ROOM_RECOVERY_MISSING_SEED");
      this.matchSeed = Math.floor(Math.random() * 1000000000);
      this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('seed', ?)`, this.matchSeed.toString());
    }

    const depthRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'depth'`).toArray();
    if (depthRow.length > 0) {
      this.currentDepth = Number(depthRow[0].value);
      if (!Number.isSafeInteger(this.currentDepth) || this.currentDepth < 1 || this.currentDepth > 100) {
        throw new Error("ROOM_RECOVERY_INVALID_DEPTH");
      }
    } else {
      if (hasDurableRoomData) throw new Error("ROOM_RECOVERY_MISSING_DEPTH");
      this.currentDepth = 1;
      this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('depth', '1')`);
    }

    const gameStatusRow = this.sql.exec(
      "SELECT value FROM room_meta WHERE key = ?", "gameStatus"
    ).toArray()[0];
    if (gameStatusRow) {
      const persistedStatus = String(gameStatusRow.value);
      if (!["LOBBY", "PLAYING", "ENDED"].includes(persistedStatus)) {
        throw new Error("ROOM_RECOVERY_INVALID_GAME_STATUS");
      }
      this.gameStatus = persistedStatus as any;
    } else {
      // Legacy rooms did not persist gameStatus. Preserve terminal rooms from MATCH_END first;
      // otherwise a complete native snapshot for the current depth proves play had begun.
      const legacyMatchEnd = this.sql.exec(
        "SELECT sequence FROM events WHERE event_type = ? ORDER BY sequence DESC LIMIT 1", "MATCH_END"
      ).toArray()[0];
      const legacySnapshotRow = this.sql.exec(
        "SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`
      ).toArray()[0];
      let legacySnapshot: any = null;
      try {
        legacySnapshot = legacySnapshotRow && typeof legacySnapshotRow.value === "string"
          ? JSON.parse(String(legacySnapshotRow.value)) : null;
      } catch (_) {}
      const legacyRunWasStarted = hasCompleteNativeLevelSnapshot(legacySnapshot)
        && Number(legacySnapshot.depth) === this.currentDepth && Number(legacySnapshot.branch) === 0;
      this.gameStatus = legacyMatchEnd ? "ENDED" : legacyRunWasStarted ? "PLAYING" : "LOBBY";
    }

    this.ensureLevelGenerated(this.currentDepth);
    this.persistEventLogState();
  }

  protected ensureLevelGenerated(depth: number) {
    const existingLevel = this.sql.exec(`SELECT depth FROM levels WHERE depth = ?`, depth).toArray();
    if (existingLevel.length === 0) {
      const recoveryRows = this.sql.exec(`SELECT
        (SELECT COUNT(*) FROM players) AS players_count,
        (SELECT COUNT(*) FROM events) AS events_count,
        (SELECT COUNT(*) FROM processed_actions) AS processed_count,
        (SELECT COUNT(*) FROM room_meta WHERE key LIKE 'levelSnapshot:%') AS snapshots_count,
        (SELECT COUNT(*) FROM room_meta WHERE key = 'levelPublisher') AS publisher_count,
        (SELECT COUNT(*) FROM room_meta WHERE key NOT IN ('gameMode','seed','depth','schemaVersion') AND NOT (key = 'currentSequence' AND value = '0') AND NOT (key = 'gameStatus' AND value = 'LOBBY')) AS other_meta_count,
        (SELECT COUNT(*) FROM level_tiles WHERE depth = ?) AS tiles_count,
        (SELECT COUNT(*) FROM level_transitions WHERE depth = ?) AS transitions_count,
        (SELECT COUNT(*) FROM mobs WHERE depth = ?) AS mobs_count,
        (SELECT COUNT(*) FROM claimed_item_instances WHERE depth = ?) AS item_claims_count,
        (SELECT COUNT(*) FROM claimed_chest_instances WHERE depth = ?) AS chest_claims_count,
        (SELECT COUNT(*) FROM native_mob_reward_claims WHERE depth = ?) AS reward_claims_count
      `, depth, depth, depth, depth, depth, depth).toArray()[0];
      const hasOrphanedDurableState = [
        recoveryRows?.players_count, recoveryRows?.events_count, recoveryRows?.processed_count,
        recoveryRows?.snapshots_count, recoveryRows?.publisher_count, recoveryRows?.other_meta_count,
        recoveryRows?.tiles_count, recoveryRows?.transitions_count, recoveryRows?.mobs_count, recoveryRows?.item_claims_count,
        recoveryRows?.chest_claims_count, recoveryRows?.reward_claims_count
      ].some(value => Number(value || 0) > 0);
      if (hasOrphanedDurableState) {
        throw new Error("ROOM_RECOVERY_INCOMPLETE: persisted room data exists but the current level row is missing");
      }
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
}
