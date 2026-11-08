import { isNativeLootClaimSchemaCurrent } from "../validators/inventory-claims";
import { MatchRoomBase } from "./base";

export class MatchRoomPersistence extends MatchRoomBase {
  protected migrateClaimedItemInstances(): void {
    const inspect = () => this.sql.exec("PRAGMA table_info(claimed_item_instances)").toArray();
    if (isNativeLootClaimSchemaCurrent(inspect())) return;
    this.state.storage.transactionSync(() => {
      const columns: any[] = inspect();
      if (isNativeLootClaimSchemaCurrent(columns)) return;
      const hasBranch = columns.some((column: any) => String(column.name) === "branch");
      this.sql.exec("ALTER TABLE claimed_item_instances RENAME TO claimed_item_instances_legacy");
      this.sql.exec(`CREATE TABLE claimed_item_instances (
        depth INTEGER NOT NULL,
        branch INTEGER NOT NULL DEFAULT 0,
        heap_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        claimed_by TEXT NOT NULL,
        request_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (depth, branch, heap_id, item_id)
      )`);
      const branchExpression = hasBranch ? "branch" : "0";
      this.sql.exec(`INSERT OR IGNORE INTO claimed_item_instances
        (depth,branch,heap_id,item_id,claimed_by,request_id,created_at)
        SELECT depth,${branchExpression},heap_id,item_id,claimed_by,request_id,created_at
        FROM claimed_item_instances_legacy`);
      this.sql.exec("DROP TABLE claimed_item_instances_legacy");
    });
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

    this.migrateClaimedItemInstances();

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

  protected ensureLevelGenerated(depth: number) {
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
}
