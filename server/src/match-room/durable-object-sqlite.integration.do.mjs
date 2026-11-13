import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("MatchRoom real Durable Object SQLite lifecycle", () => {
  it("rolls back the complete native batch and reloads committed room state after eviction", async () => {
    const playerId = "phase9-sqlite-player-001";
    const roomId = env.MATCH_ROOM.idFromName("phase9-real-sqlite-rollback-eviction");
    const stub = env.MATCH_ROOM.get(roomId);

    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      expect(sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'players'").toArray())
        .toHaveLength(1);

      sql.exec(
        "INSERT INTO players (player_id, pos, hp, ht, state, connected) VALUES (?, ?, ?, ?, ?, ?)",
        playerId, 9, 20, 20, "ALIVE", 1
      );
      sql.exec(
        "INSERT INTO mobs (mob_id, depth, name, pos, hp, ht, state) VALUES (?, ?, ?, ?, ?, ?, ?)",
        777, 1, "Rat", 25, 20, 20, "HUNTING"
      );
      sql.exec(
        "INSERT INTO room_meta (key, value) VALUES (?, ?)",
        "heroState:" + playerId, "native-hero-before"
      );
      sql.exec("CREATE TRIGGER phase9_fail_final_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'phase9 forced final event failure'); END");

      expect(() => state.storage.transactionSync(() => {
        // Mirrors the rows committed by the native Poison/LifeLink batch:
        // player and Hero state, linked Mob, reward receipt, processed request, and event.
        sql.exec("UPDATE players SET hp = ? WHERE player_id = ?", 9, playerId);
        sql.exec("UPDATE mobs SET hp = ? WHERE mob_id = ? AND depth = ?", 0, 777, 1);
        sql.exec(
          "UPDATE room_meta SET value = ? WHERE key = ?",
          "native-hero-after", "heroState:" + playerId
        );
        sql.exec(
          "INSERT INTO native_mob_reward_claims (reward_id, player_id, request_id, depth) VALUES (?, ?, ?, ?)",
          "phase9-reward-rollback-001", playerId, "phase9-request-rollback-001", 1
        );
        sql.exec(
          "INSERT INTO processed_actions (request_id, player_id, sequence, result_json) VALUES (?, ?, ?, ?)",
          "phase9-request-rollback-001", playerId, 1, "{}"
        );
        // The trigger fails after every preceding write has executed inside the transaction.
        sql.exec(
          "INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, ?, ?, ?)",
          1, playerId, "HERO_BUFF_TICKED", "{}"
        );
      })).toThrow(/phase9 forced final event failure/);

      expect(sql.exec("SELECT hp FROM players WHERE player_id = ?", playerId).toArray()[0].hp).toBe(20);
      expect(sql.exec("SELECT hp FROM mobs WHERE mob_id = ? AND depth = ?", 777, 1).toArray()[0].hp).toBe(20);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + playerId).toArray()[0].value)
        .toBe("native-hero-before");
      expect(sql.exec("SELECT reward_id FROM native_mob_reward_claims WHERE reward_id = ?",
        "phase9-reward-rollback-001").toArray()).toHaveLength(0);
      expect(sql.exec("SELECT request_id FROM processed_actions WHERE request_id = ?",
        "phase9-request-rollback-001").toArray()).toHaveLength(0);
      expect(sql.exec("SELECT sequence FROM events").toArray()).toHaveLength(0);
      expect(instance.currentSequence).toBe(0);

      sql.exec("DROP TRIGGER phase9_fail_final_event");
      sql.exec(
        "INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, ?, ?, ?)",
        1, playerId, "ROOM_CHECKPOINT_COMMITTED", "{}"
      );
      sql.exec(
        "INSERT INTO room_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        "worldTime", "17.5"
      );
      sql.exec(
        "INSERT INTO room_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        "depth", "3"
      );
    });

    // Eviction destroys the in-memory MatchRoom instance; the next access constructs a new
    // instance over the same Durable Object SQLite storage, matching the production lifecycle.
    await evictDurableObject(stub);

    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      expect(instance.currentSequence).toBe(1);
      expect(instance.worldTime).toBe(17.5);
      expect(instance.currentDepth).toBe(3);
      expect(sql.exec("SELECT hp FROM players WHERE player_id = ?", playerId).toArray()[0].hp).toBe(20);
      expect(sql.exec("SELECT hp FROM mobs WHERE mob_id = ? AND depth = ?", 777, 1).toArray()[0].hp).toBe(20);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + playerId).toArray()[0].value)
        .toBe("native-hero-before");
      expect(sql.exec("SELECT reward_id FROM native_mob_reward_claims").toArray()).toHaveLength(0);
      expect(sql.exec("SELECT request_id FROM processed_actions").toArray()).toHaveLength(0);
      expect(sql.exec("SELECT sequence FROM events").toArray()).toEqual([{ sequence: 1 }]);
    });
  });
});
