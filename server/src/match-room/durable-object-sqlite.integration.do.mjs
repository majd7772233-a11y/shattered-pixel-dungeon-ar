import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("MatchRoom real Durable Object SQLite lifecycle", () => {

  it("rolls back and replays the real Poison LifeLink MatchRoom action across DO eviction", async () => {
    const playerId = "phase9-live-handler-publisher-001";
    const requestId = "phase9-live-handler-poison-request-001";
    const roomId = env.MATCH_ROOM.idFromName("phase9-live-matchroom-poison-rollback-restart");
    const stub = env.MATCH_ROOM.get(roomId);
    const entityId = "phase9-live-linked-mob-0001";
    const poisonClass = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison";
    const linkClass = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LifeLink";
    const ratClass = "com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat";
    const beforeHero = {
      hp: 9, ht: 20, pos: 9, shielding: 0, gold: 0, alchemyEnergy: 5,
      inventoryBundle: "native-inventory", inventoryItemsJson: "[]", quickslotsJson: "[]",
      notesBundle: "notes", questStateBundle: "quests", ankhCount: 0, blessedAnkhCount: 0,
      cooldown: 1,
      combatBundle: JSON.stringify({
        id: 21, time: 10, lvl: 1, exp: 0, subClass: "NONE", STR: 10,
        HP: 9, HT: 20, pos: 9, items: "native-inventory", buffs: [],
        talents_tier_1: {}, talents_tier_2: {}, talents_tier_3: {}, talents_tier_4: {}
      }),
      buffCount: 2,
      buff_0: JSON.stringify({ buff: { __className: poisonClass, id: 44, time: 9, left: 9 } }),
      buffCooldown_0: 0,
      buff_1: JSON.stringify({ buff: { __className: linkClass, id: 45, time: 9, object: 7 } }),
      buffCooldown_1: 0
    };
    const afterHero = JSON.parse(JSON.stringify(beforeHero));
    afterHero.hp = 8;
    afterHero.buff_0 = JSON.stringify({ buff: { __className: poisonClass, id: 44, time: 10, left: 8 } });
    afterHero.buffCooldown_0 = 1;
    const afterCombat = JSON.parse(beforeHero.combatBundle);
    afterCombat.HP = 8;
    afterHero.combatBundle = JSON.stringify(afterCombat);
    const mobBundleBefore = JSON.stringify({
      mob: { __className: ratClass, id: 7, time: 9, HP: 20, HT: 20, pos: 25, max_lvl: 29, buffs: [] }
    });
    const mobBundleAfter = JSON.stringify({
      mob: { __className: ratClass, id: 7, time: 9, HP: 19, HT: 20, pos: 25, max_lvl: 29, buffs: [] }
    });
    const savedMob = {
      mobId: 7, entityId, name: "Rat", pos: 25, hp: 20, ht: 20, shielding: 0,
      state: "Hunting", serializedBundle: mobBundleBefore, buffs: [],
      defenseSkill: 5, baseSpeed: 1, effectiveSpeed: 1, cooldown: 0,
      targetCell: -1, targetType: "NONE", targetEntityId: "",
      enemySeen: false, alerted: false, rewardClassName: ratClass,
      rewardEligible: true, rewardExp: 2, rewardMaxLevel: 29,
      rewardSpawningWeight: 1, rewardMonkEnergy: 1
    };
    const levelSnapshot = {
      schemaVersion: 1, depth: 1, width: 32, height: 32, branch: 0,
      entrancePos: 0, exitPos: 1023, seed: 123456, locked: false, feeling: "NONE",
      levelClass: "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel",
      heroStateJson: JSON.stringify(beforeHero), nativeLevelMetadataBundle: "native-level-metadata",
      tiles: Array.from({ length: 1024 }, (_, pos) => ({
        pos, terrain: 1, passable: true, solid: false, pit: false, losBlocking: false,
        flammable: false, secret: false, avoid: false, water: false,
        discoverable: false, openSpace: false
      })),
      transitions: [], heaps: [], traps: [], blobs: [], plants: [],
      mobs: [savedMob], visitedPositions: [], mappedPositions: []
    };
    const mobDelta = {
      entityId, actorId: 7,
      hpBefore: 20, htBefore: 20, posBefore: 25, shieldBefore: 0,
      buffsBefore: "[]", serializedBundleBefore: mobBundleBefore,
      hpAfter: 19, htAfter: 20, posAfter: 25, shieldAfter: 0,
      buffsAfter: "[]", serializedBundleAfter: mobBundleAfter
    };
    const payload = {
      action: "SYNC_HERO_STATE",
      data: {
        sourceType: "BUFF_TICK", buffClass: poisonClass, buffId: 44,
        actorClockBefore: 9, sequenceBefore: 0,
        heroStateBeforeJson: JSON.stringify(beforeHero),
        secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [mobDelta] })
      },
      heroStateJson: JSON.stringify(afterHero)
    };
    const envelope = JSON.stringify({
      protocolVersion: "1.0.0", messageType: "ACTION", requestId,
      payloadJson: JSON.stringify(payload)
    });
    const session = { playerId, sessionToken: "phase9-live-handler-session" };
    const sent = [];
    const socket = {
      send: (value) => { sent.push(String(value)); },
      deserializeAttachment: () => session
    };

    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      sql.exec("DELETE FROM mobs");
      sql.exec(
        "INSERT INTO players (player_id,session_token,pos,hp,ht,state,connected) VALUES (?,?,?,?,?,?,?)",
        playerId, session.sessionToken, 9, 9, 20, "ALIVE", 1
      );
      sql.exec(
        "INSERT INTO mobs (mob_id,depth,name,pos,hp,ht,state) VALUES (?,?,?,?,?,?,?)",
        7, 1, "Rat", 25, 20, 20, "HUNTING"
      );
      const meta = [
        ["levelPublisher", playerId],
        ["levelPublisherTerm", "1"],
        ["levelPublisherReadyTerm", "1"],
        ["worldTime", "0"],
        ["depth", "1"],
        ["heroState:" + playerId, JSON.stringify(beforeHero)],
        ["levelSnapshot:1", JSON.stringify(levelSnapshot)]
      ];
      for (const [key,value] of meta) {
        sql.exec(
          "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          key, value
        );
      }
      sql.exec("CREATE TRIGGER phase9_fail_matchroom_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'phase9 real MatchRoom event failure'); END");

      await instance.webSocketMessage(socket, envelope);
      expect(sent).toHaveLength(1);
      const error = JSON.parse(sent[0]);
      expect(error).toMatchObject({ messageType: "ERROR", requestId, sequence: 0 });
      expect(JSON.parse(error.payloadJson).error).toBe("phase9 real MatchRoom event failure");
      expect(sql.exec("SELECT hp FROM players WHERE player_id = ?", playerId).toArray()[0].hp).toBe(9);
      expect(sql.exec("SELECT hp FROM mobs WHERE mob_id = ? AND depth = ?", 7, 1).toArray()[0].hp).toBe(20);
      expect(JSON.parse(sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + playerId).toArray()[0].value).hp).toBe(9);
      expect(JSON.parse(sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:1").toArray()[0].value).mobs[0].hp).toBe(20);
      expect(sql.exec("SELECT request_id FROM processed_actions WHERE request_id = ?", requestId).toArray()).toHaveLength(0);
      expect(sql.exec("SELECT sequence FROM events").toArray()).toHaveLength(0);
      expect(instance.currentSequence).toBe(0);

      sql.exec("DROP TRIGGER phase9_fail_matchroom_event");
      sent.length = 0;
      await instance.webSocketMessage(socket, envelope);
      expect(sent).toHaveLength(1);
      const accepted = JSON.parse(sent[0]);
      expect(accepted).toMatchObject({ messageType: "ACTION_ACCEPTED", requestId, sequence: 1 });
      expect(sql.exec("SELECT hp FROM players WHERE player_id = ?", playerId).toArray()[0].hp).toBe(8);
      expect(sql.exec("SELECT hp FROM mobs WHERE mob_id = ? AND depth = ?", 7, 1).toArray()[0].hp).toBe(19);
      expect(JSON.parse(sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + playerId).toArray()[0].value).hp).toBe(8);
      expect(JSON.parse(sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:1").toArray()[0].value).mobs[0].hp).toBe(19);
      expect(sql.exec("SELECT request_id FROM processed_actions WHERE request_id = ?", requestId).toArray()).toHaveLength(1);
      expect(sql.exec("SELECT sequence,event_type FROM events").toArray()).toEqual([{ sequence: 1, event_type: "HERO_BUFF_TICKED" }]);
      expect(instance.currentSequence).toBe(1);
    });

    await evictDurableObject(stub);
    sent.length = 0;
    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      expect(instance.currentSequence).toBe(1);
      expect(instance.worldTime).toBeGreaterThanOrEqual(0);
      expect(sql.exec("SELECT hp FROM players WHERE player_id = ?", playerId).toArray()[0].hp).toBe(8);
      expect(sql.exec("SELECT hp FROM mobs WHERE mob_id = ? AND depth = ?", 7, 1).toArray()[0].hp).toBe(19);
      expect(JSON.parse(sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + playerId).toArray()[0].value).hp).toBe(8);
      expect(JSON.parse(sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:1").toArray()[0].value).mobs[0].hp).toBe(19);
      expect(sql.exec("SELECT request_id FROM processed_actions WHERE request_id = ?", requestId).toArray()).toHaveLength(1);
      expect(sql.exec("SELECT sequence,event_type FROM events").toArray()).toEqual([{ sequence: 1, event_type: "HERO_BUFF_TICKED" }]);

      // The request is an idempotent replay across object recreation, not a second Mob/HP mutation.
      await instance.webSocketMessage(socket, envelope);
      expect(sent).toHaveLength(1);
      const replay = JSON.parse(sent[0]);
      expect(replay).toMatchObject({ messageType: "ACTION_ACCEPTED", requestId, sequence: 1 });
      expect(sql.exec("SELECT hp FROM players WHERE player_id = ?", playerId).toArray()[0].hp).toBe(8);
      expect(sql.exec("SELECT hp FROM mobs WHERE mob_id = ? AND depth = ?", 7, 1).toArray()[0].hp).toBe(19);
      expect(sql.exec("SELECT sequence FROM events").toArray()).toEqual([{ sequence: 1 }]);
    });
  });

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
