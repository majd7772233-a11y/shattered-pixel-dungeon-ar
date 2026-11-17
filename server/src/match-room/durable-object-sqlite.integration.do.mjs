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
      expect(JSON.parse(error.payloadJson).error).toContain("phase9 real MatchRoom event failure");
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


  it("transfers publisher authority in real DO SQLite only after a persisted snapshot and closes pending combat", async () => {
    const oldPublisher = "phase9-real-handoff-old-publisher";
    const nextPublisher = "phase9-real-handoff-next-publisher";
    const attackerId = "phase9-real-handoff-z-attacker";
    const requestId = "phase9-real-handoff-pending-combat";
    const entityId = "phase9-real-handoff-linked-mob";
    const roomId = env.MATCH_ROOM.idFromName("phase9-real-sqlite-publisher-handoff");
    const stub = env.MATCH_ROOM.get(roomId);
    const ratClass = "com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat";
    const heroState = {
      hp: 9, ht: 20, pos: 9, shielding: 0, gold: 0, alchemyEnergy: 5,
      inventoryBundle: "native-inventory", inventoryItemsJson: "[]", quickslotsJson: "[]",
      notesBundle: "notes", questStateBundle: "quests", ankhCount: 0, blessedAnkhCount: 0,
      cooldown: 1,
      combatBundle: JSON.stringify({
        id: 21, time: 10, lvl: 1, exp: 0, subClass: "NONE", STR: 10,
        HP: 9, HT: 20, pos: 9, items: "native-inventory", buffs: [],
        talents_tier_1: {}, talents_tier_2: {}, talents_tier_3: {}, talents_tier_4: {}
      }),
      buffCount: 0
    };
    const mobBundle = JSON.stringify({
      mob: { __className: ratClass, id: 7, time: 9, HP: 20, HT: 20, pos: 25, max_lvl: 29, buffs: [] }
    });
    const savedMob = {
      mobId: 7, entityId, name: "Rat", pos: 25, hp: 20, ht: 20, shielding: 0,
      state: "Hunting", serializedBundle: mobBundle, buffs: [],
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
      heroStateJson: JSON.stringify(heroState), nativeLevelMetadataBundle: "native-level-metadata",
      tiles: Array.from({ length: 1024 }, (_, pos) => ({
        pos, terrain: 1, passable: true, solid: false, pit: false, losBlocking: false,
        flammable: false, secret: false, avoid: false, water: false,
        discoverable: false, openSpace: false
      })),
      transitions: [], heaps: [], traps: [], blobs: [], plants: [],
      mobs: [savedMob], visitedPositions: [], mappedPositions: []
    };
    const sent = { next: [], attacker: [] };
    const liveSockets = [
      {
        send: (value) => sent.next.push(String(value)),
        deserializeAttachment: () => ({ playerId: nextPublisher, sessionToken: nextPublisher + "-token" })
      },
      {
        send: (value) => sent.attacker.push(String(value)),
        deserializeAttachment: () => ({ playerId: attackerId, sessionToken: attackerId + "-token" })
      }
    ];
    const closingSocket = {
      deserializeAttachment: () => ({ playerId: oldPublisher, sessionToken: oldPublisher + "-token" })
    };

    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      instance.currentDepth = 1;
      instance.currentSequence = 0;
      instance.worldTime = 0;
      instance.matchSeed = 123456;
      instance.gameStatus = "PLAYING";
      instance.state.getWebSockets = () => liveSockets;

      // initDatabase() seeds default depth-one Mobs. Replace them so SQL rows and the
      // trusted serialized level snapshot describe the same stable Mob ID and HP.
      sql.exec("DELETE FROM mobs WHERE depth = ?", 1);

      for (const playerId of [oldPublisher, nextPublisher, attackerId]) {
        sql.exec(
          "INSERT INTO players (player_id,session_token,class_name,pos,hp,ht,state,connected) VALUES (?,?,?,?,?,?,?,?)",
          playerId, playerId + "-token", "WARRIOR", 9, 9, 20, "ALIVE", 1
        );
        sql.exec(
          "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          "heroState:" + playerId, JSON.stringify(heroState)
        );
      }
      sql.exec(
        "INSERT INTO mobs (mob_id,depth,name,pos,hp,ht,state) VALUES (?,?,?,?,?,?,?)",
        7, 1, "Rat", 25, 20, 20, "HUNTING"
      );
      const meta = [
        ["levelPublisher", oldPublisher],
        ["levelPublisherTerm", "4"],
        ["levelPublisherReadyTerm", "4"],
        ["worldTime", "0"],
        ["depth", "1"],
        ["levelSnapshot:1", JSON.stringify(levelSnapshot)],
        ["pendingCombat:" + requestId, JSON.stringify({
          requestId, attackerId, authorityId: oldPublisher,
          targetType: "MOB", targetId: entityId,
          targetLockKey: "MOB:" + entityId, createdAt: Date.now()
        })],
        ["pendingCombatAttacker:" + attackerId, requestId],
        ["pendingCombatTarget:MOB:" + entityId, requestId],
        ["nativeMutationPending:" + oldPublisher, JSON.stringify({
          playerId: oldPublisher, requestId: "old-publisher-native-mutation", actionType: "ATTACK"
        })]
      ];
      for (const [key,value] of meta) {
        sql.exec(
          "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          key, value
        );
      }

      await instance.webSocketClose(closingSocket, 1006, "publisher disconnected", false);

      expect(sql.exec("SELECT connected FROM players WHERE player_id = ?", oldPublisher).toArray()[0].connected).toBe(0);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelPublisher").toArray()[0].value).toBe(nextPublisher);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelPublisherTerm").toArray()[0].value).toBe("5");
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelPublisherReadyTerm").toArray()).toHaveLength(0);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombat:" + requestId).toArray()).toHaveLength(0);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombatAttacker:" + attackerId).toArray()).toHaveLength(0);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombatTarget:MOB:" + entityId).toArray()).toHaveLength(0);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "nativeMutationPending:" + oldPublisher).toArray()).toHaveLength(0);

      const nextMessages = sent.next.map(value => JSON.parse(value));
      const snapshotIndex = nextMessages.findIndex(message => message.messageType === "SNAPSHOT");
      const authorityIndex = nextMessages.findIndex(message => message.messageType === "LEVEL_PUBLISHER_CHANGED");
      expect(snapshotIndex).toBeGreaterThanOrEqual(0);
      expect(authorityIndex).toBeGreaterThan(snapshotIndex);
      expect(JSON.parse(nextMessages[snapshotIndex].payloadJson).level.mobs[0]).toMatchObject({
        entityId, mobId: 7, hp: 20
      });
      expect(JSON.parse(nextMessages[authorityIndex].payloadJson)).toMatchObject({
        publisherId: nextPublisher, term: 5, reason: "PUBLISHER_DISCONNECTED"
      });

      const attackerError = sent.attacker.map(value => JSON.parse(value))
        .find(message => message.messageType === "ERROR" && message.requestId === requestId);
      expect(attackerError).toBeTruthy();
      expect(attackerError.sequence).toBe(0);
      expect(JSON.parse(attackerError.payloadJson).error).toBe("NATIVE_COMBAT_AUTHORITY_CHANGED");
    });

    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      expect(instance.currentDepth).toBe(1);
      expect(instance.currentSequence).toBe(0);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelPublisher").toArray()[0].value).toBe(nextPublisher);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelPublisherTerm").toArray()[0].value).toBe("5");
      expect(sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelPublisherReadyTerm").toArray()).toHaveLength(0);
      expect(sql.exec("SELECT connected FROM players WHERE player_id = ?", oldPublisher).toArray()[0].connected).toBe(0);
      expect(sql.exec("SELECT hp FROM mobs WHERE mob_id = ? AND depth = ?", 7, 1).toArray()[0].hp).toBe(20);
    });
  });

  it("revokes a disconnected publisher without electing or broadcasting from a missing native snapshot", async () => {
    const playerId = "phase12-missing-snapshot-publisher";
    const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName("phase12-missing-publisher-snapshot"));
    const received = [];
    const spectatorSocket = {
      send: value => received.push(String(value)),
      deserializeAttachment: () => ({ playerId: "phase12-missing-snapshot-spectator", sessionToken: "spectator-token" })
    };
    const closingSocket = {
      deserializeAttachment: () => ({ playerId, sessionToken: playerId + "-token" })
    };
    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      sql.exec("INSERT INTO players (player_id,session_token,class_name,pos,hp,ht,state,connected) VALUES (?,?,?,?,?,?,?,?)",
        playerId, playerId + "-token", "WARRIOR", 9, 20, 20, "ALIVE", 1);
      for (const [key,value] of [["levelPublisher", playerId], ["levelPublisherTerm", "4"], ["levelPublisherReadyTerm", "4"]]) {
        sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value);
      }
      instance.state.getWebSockets = () => [spectatorSocket];
      await instance.webSocketClose(closingSocket, 1006, "publisher socket lost", false);
      expect(sql.exec("SELECT connected FROM players WHERE player_id=?", playerId).toArray()[0].connected).toBe(0);
      expect(sql.exec("SELECT value FROM room_meta WHERE key=?", "levelPublisher").toArray()).toHaveLength(0);
      expect(sql.exec("SELECT value FROM room_meta WHERE key=?", "levelPublisherTerm").toArray()[0].value).toBe("5");
      expect(sql.exec("SELECT value FROM room_meta WHERE key=?", "levelPublisherReadyTerm").toArray()).toHaveLength(0);
      expect(sql.exec("SELECT value FROM room_meta WHERE key=?", "levelSnapshot:1").toArray()).toHaveLength(0);
    });
    const messages = received.map(value => JSON.parse(value));
    expect(messages.some(message => message.messageType === "SNAPSHOT")).toBe(false);
    const publisherChange = messages.find(message => message.messageType === "LEVEL_PUBLISHER_CHANGED");
    expect(publisherChange).toBeTruthy();
    expect(JSON.parse(publisherChange.payloadJson)).toMatchObject({
      publisherId: null, term: 5, reason: "PUBLISHER_DISCONNECTED_SNAPSHOT_UNAVAILABLE"
    });
  });

  it("persists request replay identity fields in Durable Object SQLite", async () => {
    const roomId = env.MATCH_ROOM.idFromName("phase11b-request-fingerprint-migration");
    const stub = env.MATCH_ROOM.get(roomId);
    await runInDurableObject(stub, async (_instance, state) => {
      const schemaVersion = state.storage.sql.exec("SELECT value FROM room_meta WHERE key = ?", "schemaVersion").toArray()[0];
      expect(schemaVersion.value).toBe("2");
      const columns = state.storage.sql.exec("PRAGMA table_info(processed_actions)").toArray()
        .map(column => String(column.name));
      expect(columns).toContain("request_fingerprint");
      expect(columns).toContain("authority_id");
      expect(columns).toContain("completion_fingerprint");
      const fingerprint = JSON.stringify({ action: "MOVE", data: { to: 17 } });
      state.storage.sql.exec(
        `INSERT INTO processed_actions
         (request_id,player_id,sequence,result_json,request_fingerprint,authority_id,completion_fingerprint)
         VALUES (?,?,?,?,?,?,?)`,
        "phase11b-sqlite-request-001", "phase11b-owner", 3, JSON.stringify({ status: "ACCEPTED" }),
        fingerprint, "phase11b-authority", JSON.stringify({ action: "SYNC_MOB_STATE" })
      );
      const row = state.storage.sql.exec(
        "SELECT player_id,request_fingerprint,authority_id,completion_fingerprint FROM processed_actions WHERE request_id = ?",
        "phase11b-sqlite-request-001"
      ).toArray()[0];
      expect(row.player_id).toBe("phase11b-owner");
      expect(row.request_fingerprint).toBe(fingerprint);
      expect(row.authority_id).toBe("phase11b-authority");
      expect(row.completion_fingerprint).toContain("SYNC_MOB_STATE");
    });
  });

  it("rolls back the complete native batch and reloads committed room state after eviction", async () => {
    const playerId = "phase9-sqlite-player-001";
    const roomId = env.MATCH_ROOM.idFromName("phase9-real-sqlite-rollback-eviction");
    const stub = env.MATCH_ROOM.get(roomId);

    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      // Preserve a real destination level before setting its persisted depth checkpoint.
      instance.ensureLevelGenerated(3);
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

  it("binds a reconnect socket to the authenticated token owner and rejects identity takeover", async () => {
    const roomId = env.MATCH_ROOM.idFromName("phase12a-session-token-owner-binding");
    const stub = env.MATCH_ROOM.get(roomId);
    const baseUrl = "https://match.test/room/phase12a-session-token-owner-binding/websocket";
    const receiveMessage = (socket, expectedType) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.removeEventListener("message", listener);
        reject(new Error("Timed out waiting for " + expectedType));
      }, 5000);
      const listener = event => {
        let message;
        try { message = JSON.parse(String(event.data)); } catch (_) { return; }
        if (message.messageType !== expectedType) return;
        clearTimeout(timeout);
        socket.removeEventListener("message", listener);
        resolve(message);
      };
      socket.addEventListener("message", listener);
    });

    const collectMessages = (socket, requiredCounts) => new Promise((resolve, reject) => {
      const messages = [];
      const timeout = setTimeout(() => {
        socket.removeEventListener("message", listener);
        reject(new Error("Timed out collecting lifecycle resume messages"));
      }, 5000);
      const listener = event => {
        let message;
        try { message = JSON.parse(String(event.data)); } catch (_) { return; }
        messages.push(message);
        const complete = Object.entries(requiredCounts).every(([type,count]) =>
          messages.filter(value => value.messageType === type).length >= count
        );
        if (!complete) return;
        clearTimeout(timeout);
        socket.removeEventListener("message", listener);
        resolve(messages);
      };
      socket.addEventListener("message", listener);
    });
    const firstResponse = await stub.fetch(new Request(baseUrl + "?lifecycle=1", {
      headers: { Upgrade: "websocket" }
    }));
    expect(firstResponse.status).toBe(101);
    const firstSocket = firstResponse.webSocket;
    expect(firstSocket).toBeTruthy();
    firstSocket.accept();
    const firstWelcome = await receiveMessage(firstSocket, "SESSION");
    const firstSession = JSON.parse(firstWelcome.payloadJson);
    expect(firstSession.playerId).toBeTruthy();
    expect(firstSession.sessionToken).toBeTruthy();
    const playerId = firstSession.playerId;
    const firstToken = firstSession.sessionToken;

    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec("UPDATE players SET pos = ?, hp = ?, ready = 1 WHERE player_id = ?", 77, 13, playerId);
      const observerId = "phase13-reconnect-observer";
      sql.exec(
        "INSERT INTO players (player_id,session_token,class_name,pos,hp,ht,state,connected,ready) VALUES (?,?,?,?,?,?,?,?,?)",
        observerId, observerId + "-token", "MAGE", 88, 12, 20, "ALIVE", 1, 1
      );
      for (const [key,value] of [
        ["roomCreated","1"], ["roomClosed","0"], ["roomLifecycleState","LOBBY"],
        ["roomOwnerId",playerId], ["roomCapacity","4"], ["gameMode","COOP_DUNGEON"]
      ]) {
        sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value);
      }
      for (const [memberId,joinedAt,role] of [[playerId,1,"OWNER"],[observerId,2,"PLAYER"]]) {
        sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          "roomMember:" + memberId, JSON.stringify({ joinedAt, role }));
        sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          "roomReady:" + memberId, JSON.stringify({ ready: true, seed: _instance.matchSeed, sequence: _instance.currentSequence }));
      }
    });

    // Neither a bare playerId nor another player's token can claim this existing identity.
    const bareIdentity = await stub.fetch(new Request(baseUrl + "?lifecycle=1&playerId=" + encodeURIComponent(playerId), {
      headers: { Upgrade: "websocket" }
    }));
    expect(bareIdentity.status).toBe(401);
    const tokenInUrl = await stub.fetch(new Request(
      baseUrl + "?lifecycle=1&playerId=" + encodeURIComponent(playerId) + "&sessionToken=" + encodeURIComponent(firstToken),
      { headers: { Upgrade: "websocket" } }
    ));
    expect(tokenInUrl.status).toBe(400);
    const mismatchedIdentity = await stub.fetch(new Request(
      baseUrl + "?playerId=attacker-player-0001",
      { headers: { Upgrade: "websocket", Authorization: "Bearer " + firstToken } }
    ));
    expect(mismatchedIdentity.status).toBe(403);

    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql.exec(
        "SELECT player_id,session_token,pos,hp,connected FROM players WHERE player_id = ?", playerId
      ).toArray()[0];
      expect(row).toMatchObject({ player_id: playerId, session_token: firstToken, pos: 77, hp: 13, connected: 1 });
      expect(state.storage.sql.exec("SELECT player_id FROM players").toArray()).toHaveLength(2);
    });

    const reconnectUrl = baseUrl + "?lifecycle=1&playerId=" + encodeURIComponent(playerId);
    const secondResponse = await stub.fetch(new Request(reconnectUrl, {
      headers: { Upgrade: "websocket", Authorization: "Bearer " + firstToken }
    }));
    expect(secondResponse.status).toBe(101);
    const secondSocket = secondResponse.webSocket;
    expect(secondSocket).toBeTruthy();
    secondSocket.accept();
    const lifecycleResumePromise = collectMessages(secondSocket, { ROOM_STATE: 1, PLAYER_JOINED: 2 });
    const secondWelcome = await receiveMessage(secondSocket, "SESSION");
    const secondSession = JSON.parse(secondWelcome.payloadJson);
    expect(secondSession).toMatchObject({ playerId, pos: 77, resumed: true });
    expect(secondSession.sessionToken).toBeTruthy();
    expect(secondSession.sessionToken).not.toBe(firstToken);
    expect(secondSession).toMatchObject({
      roomLifecycleVersion: 1, roomMembership: true, roomOwnerId: playerId
    });
    const lifecycleResumeMessages = await lifecycleResumePromise;
    const resumedRoomState = lifecycleResumeMessages.find(message => message.messageType === "ROOM_STATE");
    expect(JSON.parse(resumedRoomState.payloadJson)).toMatchObject({
      reason: "SESSION_RESUMED", ownerId: playerId, memberCount: 2, roomStatus: "LOBBY"
    });
    const resumedRoster = lifecycleResumeMessages.filter(message => message.messageType === "PLAYER_JOINED");
    expect(resumedRoster.map(message => message.senderId)).toEqual(expect.arrayContaining([playerId, "phase13-reconnect-observer"]));

    // The authenticated current socket attachment is sufficient; the message carries no token.
    const recoveryPromise = receiveMessage(secondSocket, "SNAPSHOT");
    secondSocket.send(JSON.stringify({
      protocolVersion: "1.0.0", messageType: "RECONNECT", requestId: "phase12a-reconnect-001",
      payloadJson: JSON.stringify({ lastSequence: 0 })
    }));
    const recovered = await recoveryPromise;
    expect(recovered.sequence).toBe(0);

    // The old socket cannot keep acting after its token has been replaced.
    const staleSocketError = receiveMessage(firstSocket, "ERROR");
    firstSocket.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "PING", payloadJson: "{}" }));
    const staleError = await staleSocketError;
    expect(JSON.parse(staleError.payloadJson).error).toBe("SESSION_REPLACED");

    const oldTokenRetry = await stub.fetch(new Request(reconnectUrl, {
      headers: { Upgrade: "websocket", Authorization: "Bearer " + firstToken }
    }));
    expect(oldTokenRetry.status).toBe(401);

    await runInDurableObject(stub, async (_instance, state) => {
      const rows = state.storage.sql.exec(
        "SELECT player_id,session_token,pos,hp,connected FROM players"
      ).toArray();
      expect(rows).toHaveLength(2);
      expect(rows.find(row => row.player_id === playerId)).toMatchObject({
        player_id: playerId, session_token: secondSession.sessionToken,
        pos: 77, hp: 13, connected: 1
      });
      expect(rows.find(row => row.player_id === "phase13-reconnect-observer")).toMatchObject({
        player_id: "phase13-reconnect-observer", session_token: "phase13-reconnect-observer-token",
        pos: 88, hp: 12, connected: 1
      });
    });

    try { firstSocket.close(); } catch (_) {}
    try { secondSocket.close(); } catch (_) {}
  });

  it("restores the durable cursor, room status, replay and full snapshot after Durable Object eviction", async () => {
    const playerId = "phase12b-restore-player-001";
    const sessionToken = "phase12b-restore-session-token-001";
    const roomId = env.MATCH_ROOM.idFromName("phase12b-durable-cursor-retention-reconnect");
    const stub = env.MATCH_ROOM.get(roomId);
    const heroState = JSON.stringify({ hp: 13, ht: 20, pos: 77, shielding: 2, buffs: [] });
    const sent = [];
    const socket = {
      send: (value) => sent.push(String(value)),
      deserializeAttachment: () => ({ playerId, sessionToken })
    };

    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      sql.exec(
        "INSERT INTO players (player_id,session_token,class_name,pos,hp,ht,state,connected,ready) VALUES (?,?,?,?,?,?,?,?,?)",
        playerId, sessionToken, "WARRIOR", 77, 13, 20, "ALIVE", 1, 1
      );
      sql.exec(
        "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        "heroState:" + playerId, heroState
      );
      sql.exec(
        "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        "levelPublisher", "phase12b-publisher-owner-002"
      );
      sql.exec(
        "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        "levelPublisherTerm", "3"
      );
      sql.exec(
        "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        "worldTime", "123.5"
      );
      sql.exec("DELETE FROM mobs WHERE depth = ?", 1);
      sql.exec(
        "INSERT INTO mobs (mob_id,depth,name,pos,hp,ht,str,dmg_max,next_act_at,state) VALUES (?,?,?,?,?,?,?,?,?,?)",
        7, 1, "Rat", 25, 18, 20, 8, 6, 0, "HUNTING"
      );
      const savedLevel = {
        schemaVersion: 1, depth: 1, width: 32, height: 32, branch: 0,
        entrancePos: 33, exitPos: 990, seed: 123456, locked: false, feeling: "NONE",
        levelClass: "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel",
        nativeLevelMetadataBundle: "phase12b-level-metadata",
        tiles: Array.from({ length: 1024 }, (_, pos) => ({
          pos, terrain: 1, passable: true, solid: false, pit: false, losBlocking: false,
          flammable: false, secret: false, avoid: false, water: false,
          discoverable: false, openSpace: false
        })),
        transitions: [{ transitionId: "phase12b-exit-1", pos: 990, type: "EXIT", targetDepth: 2 }],
        mobs: [{ mobId: 7, entityId: "phase12b-stable-mob-0007", name: "Rat", pos: 25, hp: 18, ht: 20,
          state: "HUNTING", serializedBundle: "native-rat-bundle", buffs: [], defenseSkill: 5,
          baseSpeed: 1, cooldown: 0 }],
        heaps: [{ heapId: "phase12b-heap-001", pos: 40, type: "HEAP", items: [{ itemId: "phase12b-item-001", bundle: "native-item-bundle" }] }],
        traps: [{ pos: 41, trapClass: "com.shatteredpixel.shatteredpixeldungeon.levels.traps.PoisonDartTrap", visible: true, active: true }],
        blobs: [{ blobClass: "com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Fire", cells: [{ pos: 42, volume: 4 }] }],
        plants: [{ pos: 43, plantClass: "com.shatteredpixel.shatteredpixeldungeon.plants.Sungrass", seedClass: "com.shatteredpixel.shatteredpixeldungeon.plants.Sungrass$Seed", active: true }]
      };
      sql.exec(
        "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        "levelSnapshot:1", JSON.stringify(savedLevel)
      );
      sql.exec("DELETE FROM events");
      for (let sequence = 1; sequence <= 1000; sequence++) {
        const eventType = sequence === 1 ? "HERO_BUFF_TICKED"
          : sequence <= 514 ? "CHAR_DAMAGED"
          : sequence === 515 ? "PLAYER_DAMAGED" : "ROOM_EVENT";
        sql.exec(
          "INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
          sequence, playerId, eventType, JSON.stringify({ sequence })
        );
      }
      instance.currentSequence = 1000;
      instance.worldTime = 123.5;
      instance.gameStatus = "ENDED";
      instance.persistEventLogState();

      const retained = sql.exec("SELECT sequence,sender_id,event_type FROM events ORDER BY sequence ASC").toArray();
      expect(retained).toHaveLength(715);
      expect(retained.slice(-200).map(row => Number(row.sequence))).toEqual(
        Array.from({ length: 200 }, (_, index) => 801 + index)
      );
      expect(sql.exec(
        "SELECT sequence FROM events WHERE sender_id = ? AND event_type = 'CHAR_DAMAGED' ORDER BY sequence ASC",
        playerId
      ).toArray()).toHaveLength(513);
      expect(sql.exec(
        "SELECT sequence FROM events WHERE sender_id = ? AND event_type = 'HERO_BUFF_TICKED'",
        playerId
      ).toArray().map(row => Number(row.sequence))).toEqual([1]);
      expect(sql.exec(
        "SELECT sequence FROM events WHERE sender_id = ? AND event_type = 'PLAYER_DAMAGED'",
        playerId
      ).toArray().map(row => Number(row.sequence))).toEqual([515]);
      expect(sql.exec("SELECT value FROM room_meta WHERE key = 'currentSequence'").toArray()[0].value).toBe("1000");
      expect(sql.exec("SELECT value FROM room_meta WHERE key = 'gameStatus'").toArray()[0].value).toBe("ENDED");
    });

    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance) => {
      expect(instance.currentSequence).toBe(1000);
      expect(instance.gameStatus).toBe("ENDED");
      expect(instance.gameMode).toBe("COOP_DUNGEON");
      expect(instance.currentDepth).toBe(1);
      expect(instance.worldTime).toBe(123.5);
      // The snapshot intentionally includes currently connected players only.
      instance.state.getWebSockets = () => [socket];

      await instance.webSocketMessage(socket, JSON.stringify({
        protocolVersion: "1.0.0", messageType: "RECONNECT", requestId: "phase12b-replay-after-eviction",
        payloadJson: JSON.stringify({ lastSequence: 980 })
      }));
      expect(sent).toHaveLength(2);
      const replay = JSON.parse(sent[0]);
      expect(replay).toMatchObject({ messageType: "EVENT_BATCH", sequence: 1000 });
      const replayRows = JSON.parse(replay.payloadJson);
      expect(replayRows).toHaveLength(20);
      expect(replayRows.map(row => Number(row.sequence))).toEqual(
        Array.from({ length: 20 }, (_, index) => 981 + index)
      );

      expect(JSON.parse(sent[1])).toMatchObject({ messageType: "LEVEL_PUBLISHER_CHANGED" });

      sent.length = 0;
      await instance.webSocketMessage(socket, JSON.stringify({
        protocolVersion: "1.0.0", messageType: "RECONNECT", requestId: "phase12b-snapshot-after-eviction",
        payloadJson: JSON.stringify({ lastSequence: 0 })
      }));
      expect(sent).toHaveLength(2);
      const snapshot = JSON.parse(sent[0]);
      expect(snapshot).toMatchObject({ messageType: "SNAPSHOT", sequence: 1000 });
      const payload = JSON.parse(snapshot.payloadJson);
      expect(payload).toMatchObject({
        sequence: 1000, depth: 1, gameMode: "COOP_DUNGEON", worldTime: 123.5
      });
      expect(payload.players).toHaveLength(1);
      expect(payload.players[0]).toMatchObject({
        player_id: playerId, pos: 77, hp: 13, ht: 20, hero_state_json: heroState
      });
      expect(payload.level).toMatchObject({ depth: 1, width: 32, height: 32 });
      expect(payload.level.tiles).toHaveLength(1024);
      expect(payload.level).toMatchObject({
        heaps: [{ heapId: "phase12b-heap-001", pos: 40 }],
        traps: [{ pos: 41, visible: true, active: true }],
        blobs: [{ blobClass: "com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Fire" }],
        plants: [{ pos: 43, active: true }]
      });
      expect(payload.level.mobs).toHaveLength(1);
      expect(payload.level.mobs[0]).toMatchObject({
        mob_id: 7, pos: 25, hp: 18, ht: 20,
        entityId: "phase12b-stable-mob-0007", serializedBundle: "native-rat-bundle"
      });
      expect(JSON.parse(sent[1])).toMatchObject({ messageType: "LEVEL_PUBLISHER_CHANGED" });
    });
  });

  it("rejects missing critical room metadata when only orphaned level tables remain", async () => {
    const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName("phase12b-orphaned-level-metadata-fail-closed"));
    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec("DELETE FROM level_tiles WHERE depth = ?", 1);
      sql.exec(
        "INSERT INTO level_tiles (depth,pos,terrain,passable,solid,pit,los_blocking) VALUES (?,?,?,?,?,?,?)",
        1, 12, "3", 1, 0, 0, 0
      );
      sql.exec("DELETE FROM levels WHERE depth = ?", 1);
      sql.exec("DELETE FROM room_meta WHERE key IN ('gameMode','seed','depth')");
    });
    await evictDurableObject(stub);
    await expect(runInDurableObject(stub, async () => undefined))
      .rejects.toThrow("ROOM_RECOVERY_MISSING_GAME_MODE");
  });
  it("refuses to regenerate a missing level while non-default room_meta state remains", async () => {
    const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName("phase12b-orphaned-room-meta-state-fail-closed"));
    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec("DELETE FROM players");
      sql.exec("DELETE FROM events");
      sql.exec("DELETE FROM levels");
      sql.exec("DELETE FROM level_tiles");
      sql.exec("DELETE FROM level_transitions");
      sql.exec("DELETE FROM mobs");
      sql.exec("DELETE FROM processed_actions");
      sql.exec("DELETE FROM claimed_item_instances");
      sql.exec("DELETE FROM claimed_chest_instances");
      sql.exec("DELETE FROM native_mob_reward_claims");
      sql.exec("DELETE FROM room_meta WHERE key NOT IN ('gameMode','seed','depth')");
      sql.exec(
        "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        "worldTime", "4.5"
      );
    });
    await evictDurableObject(stub);
    await expect(runInDurableObject(stub, async () => undefined))
      .rejects.toThrow("ROOM_RECOVERY_INCOMPLETE");
  });
  it("fails closed instead of regenerating a missing level when durable player data remains", async () => {
    const roomId = env.MATCH_ROOM.idFromName("phase12b-missing-level-fail-closed");
    const stub = env.MATCH_ROOM.get(roomId);
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO players (player_id,session_token,pos,hp,ht,state,connected) VALUES (?,?,?,?,?,?,?)",
        "phase12b-orphaned-player-001", "phase12b-orphaned-session-001", 17, 12, 20, "ALIVE", 0
      );
      state.storage.sql.exec(
        "INSERT INTO claimed_item_instances (depth,branch,heap_id,item_id,claimed_by,request_id) VALUES (?,?,?,?,?,?)",
        1, 0, "phase12b-orphaned-heap", "phase12b-orphaned-item", "phase12b-orphaned-player-001", "phase12b-orphaned-request"
      );
      state.storage.sql.exec(
        "INSERT INTO native_mob_reward_claims (reward_id,player_id,request_id,depth) VALUES (?,?,?,?)",
        "phase12b-orphaned-reward", "phase12b-orphaned-player-001", "phase12b-orphaned-request", 1
      );
      state.storage.sql.exec("DELETE FROM levels WHERE depth = ?", 1);
    });
    await evictDurableObject(stub);
    await expect(runInDurableObject(stub, async () => undefined))
      .rejects.toThrow("ROOM_RECOVERY_INCOMPLETE");
  });

  it("restores a legacy in-progress room as PLAYING from its complete native snapshot", async () => {
    const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName("phase12b-legacy-active-room-recovery"));
    const snapshot = {
      schemaVersion: 1, depth: 1, width: 8, height: 8, branch: 0,
      entrancePos: 0, exitPos: 63, seed: 7654321, locked: false, feeling: "NONE",
      heroStateJson: "{}", nativeLevelMetadataBundle: "legacy-active-level-metadata",
      tiles: Array.from({ length: 64 }, (_, pos) => ({
        pos, terrain: 1, passable: true, solid: false, pit: false, losBlocking: false,
        flammable: false, secret: false, avoid: false, water: false,
        discoverable: false, openSpace: false
      })),
      transitions: [], heaps: [], traps: [], blobs: [], plants: [], mobs: [],
      visitedPositions: [], mappedPositions: []
    };

    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec(
        "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        "levelSnapshot:1", JSON.stringify(snapshot)
      );
      sql.exec(
        "INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
        90, "phase12b-legacy-active-player", "NATIVE_WORLD_TURN", JSON.stringify({ turnCounter: 1 })
      );
      sql.exec("DELETE FROM room_meta WHERE key IN ('currentSequence','gameStatus')");
    });

    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance, state) => {
      expect(instance.currentSequence).toBe(90);
      expect(instance.worldTime).toBe(0);
      expect(instance.gameStatus).toBe("PLAYING");
      expect(state.storage.sql.exec(
        "SELECT value FROM room_meta WHERE key = 'gameStatus'"
      ).toArray()[0].value).toBe("PLAYING");
    });
  });
  it("derives legacy ended-room status from MATCH_END before compacting the old event log", async () => {
    const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName("phase12b-legacy-match-end-recovery"));
    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec(
        "INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
        42, "phase12b-legacy-server", "MATCH_END", JSON.stringify({ winnerId: "phase12b-winner" })
      );
      sql.exec("DELETE FROM room_meta WHERE key IN ('currentSequence','gameStatus')");
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance, state) => {
      expect(instance.currentSequence).toBe(42);
      expect(instance.gameStatus).toBe("ENDED");
      expect(state.storage.sql.exec(
        "SELECT value FROM room_meta WHERE key = 'gameStatus'"
      ).toArray()[0].value).toBe("ENDED");
      expect(state.storage.sql.exec(
        "SELECT sequence FROM events WHERE event_type = 'MATCH_END'"
      ).toArray()).toEqual([{ sequence: 42 }]);
    });
  });




  it("atomically replaces every LEVEL_DATA table and snapshot before acknowledging the publisher", async () => {
    const playerId = "phase12-level-atomic-publisher";
    const sessionToken = "phase12-level-atomic-session";
    const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName("phase12-level-data-atomic-rollback"));
    const sent = [];
    const socket = {
      send: value => sent.push(String(value)),
      deserializeAttachment: () => ({ playerId, sessionToken })
    };
    const heroStateJson = JSON.stringify({ hp: 9, ht: 20, pos: 9, shielding: 0 });
    const makeSnapshot = (seed, mobHp, terrain = 1) => ({
      schemaVersion: 1, depth: 1, branch: 0, width: 32, height: 32,
      entrancePos: 0, exitPos: 1023, seed, locked: false, feeling: "NONE",
      levelClass: "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel",
      heroStateJson, nativeLevelMetadataBundle: "phase12-native-level-metadata",
      tiles: Array.from({ length: 1024 }, (_, pos) => ({
        pos, terrain, passable: true, solid: false, pit: false, losBlocking: false,
        flammable: false, secret: false, avoid: false, water: false,
        discoverable: false, openSpace: false
      })),
      transitions: [], heaps: [], traps: [], blobs: [], plants: [],
      mobs: [{
        mobId: 71, entityId: "phase12-atomic-mob-0071", name: "Rat", pos: 25,
        hp: mobHp, ht: 20, shielding: 0, state: "Hunting", defenseSkill: 5,
        baseSpeed: 1, effectiveSpeed: 1, cooldown: 0, targetCell: -1,
        targetType: "NONE", targetEntityId: "", enemySeen: false, alerted: false,
        serializedBundle: JSON.stringify({ mob: { __className: "com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat", id: 71, time: 9, HP: mobHp, HT: 20, pos: 25, max_lvl: 29, buffs: [] } }),
        buffs: []
      }],
      visitedPositions: [], mappedPositions: []
    });
    const oldSnapshot = makeSnapshot(123456, 20, 1);
    const nextSnapshot = makeSnapshot(654321, 17, 2);
    const envelope = JSON.stringify({
      protocolVersion: "1.0.0", messageType: "LEVEL_DATA", requestId: "phase12-level-data-request-1",
      payloadJson: JSON.stringify(nextSnapshot)
    });

    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      sql.exec("DELETE FROM mobs WHERE depth = ?", 1);
      sql.exec("INSERT INTO players (player_id,session_token,pos,hp,ht,state,connected) VALUES (?,?,?,?,?,?,?)",
        playerId, sessionToken, 9, 9, 20, "ALIVE", 1);
      for (const [key, value] of [
        ["levelPublisher", playerId], ["levelPublisherTerm", "1"],
        ["levelPublisherReadyTerm", "1"], ["heroState:" + playerId, heroStateJson],
        ["levelSnapshot:1", JSON.stringify(oldSnapshot)]
      ]) sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value);
      sql.exec("UPDATE levels SET width=32,height=32,entrance_pos=0,exit_pos=1023,seed=123456 WHERE depth=1");
      sql.exec("DELETE FROM level_tiles WHERE depth=1");
      sql.exec("DELETE FROM level_transitions WHERE depth=1");
      sql.exec("INSERT INTO level_tiles (depth,pos,terrain,passable,solid,pit,los_blocking) VALUES (1,0,1,1,0,0,0)");
      sql.exec("INSERT INTO mobs (mob_id,depth,name,pos,hp,ht,state) VALUES (71,1,'Rat',25,20,20,'HUNTING')");
      sql.exec("CREATE TRIGGER phase12_fail_level_data BEFORE INSERT ON mobs BEGIN SELECT RAISE(ABORT, 'phase12 forced LEVEL_DATA insert failure'); END");

      await instance.webSocketMessage(socket, envelope);
      expect(sent).toHaveLength(1);
      const failed = JSON.parse(sent[0]);
      expect(failed).toMatchObject({ messageType: "ERROR", requestId: "phase12-level-data-request-1", sequence: 0 });
      expect(JSON.parse(failed.payloadJson).error).toBe("LEVEL_DATA_COMMIT_FAILED");
      expect(JSON.parse(sql.exec("SELECT value FROM room_meta WHERE key=?", "levelSnapshot:1").toArray()[0].value).seed).toBe(123456);
      expect(sql.exec("SELECT seed FROM levels WHERE depth=1").toArray()[0].seed).toBe(123456);
      expect(sql.exec("SELECT COUNT(*) AS count FROM level_tiles WHERE depth=1").toArray()[0].count).toBe(1);
      expect(sql.exec("SELECT hp FROM mobs WHERE mob_id=71 AND depth=1").toArray()[0].hp).toBe(20);
      expect(instance.currentSequence).toBe(0);

      sql.exec("DROP TRIGGER phase12_fail_level_data");
      sent.length = 0;
      await instance.webSocketMessage(socket, envelope);
      expect(sent).toHaveLength(1);
      const accepted = JSON.parse(sent[0]);
      expect(accepted).toMatchObject({ messageType: "ACK", requestId: "phase12-level-data-request-1", sequence: 0 });
      expect(JSON.parse(sql.exec("SELECT value FROM room_meta WHERE key=?", "levelSnapshot:1").toArray()[0].value).seed).toBe(654321);
      expect(sql.exec("SELECT seed FROM levels WHERE depth=1").toArray()[0].seed).toBe(654321);
      expect(sql.exec("SELECT COUNT(*) AS count FROM level_tiles WHERE depth=1").toArray()[0].count).toBe(1024);
      expect(sql.exec("SELECT hp FROM mobs WHERE mob_id=71 AND depth=1").toArray()[0].hp).toBe(17);
      expect(instance.currentSequence).toBe(0);
    });
  });


  it("upgrades legacy SQLite tables through atomic schema versions and preserves old claim rows", async () => {
    const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName("phase12-versioned-legacy-schema-upgrade"));
    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql;
      expect(sql.exec("SELECT value FROM room_meta WHERE key=?", "schemaVersion").toArray()[0].value).toBe("2");
      sql.exec("DROP TABLE claimed_item_instances");
      sql.exec("CREATE TABLE claimed_item_instances (depth INTEGER NOT NULL, heap_id TEXT NOT NULL, item_id TEXT NOT NULL, claimed_by TEXT NOT NULL, request_id TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (depth, heap_id, item_id))");
      sql.exec("INSERT INTO claimed_item_instances (depth,heap_id,item_id,claimed_by,request_id) VALUES (1,?,?,?,?)", "phase12-legacy-heap", "phase12-legacy-item", "phase12-legacy-owner", "phase12-legacy-request");
      sql.exec("ALTER TABLE processed_actions RENAME TO processed_actions_current");
      sql.exec("CREATE TABLE processed_actions (request_id TEXT PRIMARY KEY, player_id TEXT, sequence INTEGER, result_json TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
      sql.exec("INSERT INTO processed_actions (request_id,player_id,sequence,result_json) VALUES (?,?,?,?)", "phase12-legacy-receipt", "legacy-player", 41, JSON.stringify({ accepted: true, source: "legacy" }));
      sql.exec("DROP TABLE processed_actions_current");
      sql.exec("DELETE FROM room_meta WHERE key=?", "schemaVersion");
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql;
      expect(sql.exec("SELECT value FROM room_meta WHERE key=?", "schemaVersion").toArray()[0].value).toBe("2");
      const actionColumns = sql.exec("PRAGMA table_info(processed_actions)").toArray().map(column => String(column.name));
      expect(actionColumns).toEqual(expect.arrayContaining(["request_fingerprint", "authority_id", "completion_fingerprint"]));
      const legacyReceipt = sql.exec("SELECT player_id,sequence,result_json FROM processed_actions WHERE request_id=?", "phase12-legacy-receipt").toArray()[0];
      expect(legacyReceipt).toEqual({ player_id: "legacy-player", sequence: 41, result_json: JSON.stringify({ accepted: true, source: "legacy" }) });
      const claims = sql.exec("PRAGMA table_info(claimed_item_instances)").toArray();
      const primaryKey = claims.filter(column => Number(column.pk) > 0).sort((a,b) => Number(a.pk)-Number(b.pk)).map(column => String(column.name));
      expect(primaryKey).toEqual(["depth", "branch", "heap_id", "item_id"]);
      const preserved = sql.exec("SELECT depth,branch,heap_id,item_id,claimed_by,request_id FROM claimed_item_instances WHERE item_id=?", "phase12-legacy-item").toArray()[0];
      expect(preserved).toEqual({ depth: 1, branch: 0, heap_id: "phase12-legacy-heap", item_id: "phase12-legacy-item", claimed_by: "phase12-legacy-owner", request_id: "phase12-legacy-request" });
    });
  });

  it("starts a fully synchronized room atomically and refuses late joins or cancellation", async () => {
    const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName("phase13-authoritative-match-start"));
    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      const broadcasts = [];
      instance.broadcastToRoomMembers = message => broadcasts.push(message);
      sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", "roomLifecycleVersion", "1");
      const clients = new Map();
      for (const playerId of ["phase13-start-host", "phase13-start-guest", "phase13-start-late"]) {
        const sessionToken = playerId + "-token";
        sql.exec("INSERT INTO players (player_id,session_token,pos,hp,ht,state,connected,ready) VALUES (?,?,?,?,?,?,?,?)",
          playerId, sessionToken, 0, 10, 10, "ALIVE", 1, 0);
        const sent = [];
        clients.set(playerId, { sent, socket: { send: value => sent.push(String(value)), deserializeAttachment: () => ({ playerId, sessionToken }) } });
      }
      let requestNumber = 0;
      const send = async (playerId, messageType, payload) => {
        const client = clients.get(playerId);
        const startAt = client.sent.length;
        await instance.webSocketMessage(client.socket, JSON.stringify({
          protocolVersion: "1.0.0", messageType, requestId: "phase13-start-" + (++requestNumber),
          senderId: "untrusted", payloadJson: JSON.stringify(payload || {})
        }));
        return client.sent.slice(startAt).map(value => JSON.parse(value));
      };
      const errorOf = messages => {
        const error = messages.find(message => message.messageType === "ERROR");
        return error?.payloadJson ? JSON.parse(error.payloadJson).error : null;
      };
      const meta = key => sql.exec("SELECT value FROM room_meta WHERE key = ?", key).toArray()[0]?.value;

      const created = await send("phase13-start-host", "CREATE_ROOM", { gameMode: "COOP_DUNGEON" });
      expect(created.some(message => message.messageType === "ACK")).toBe(true);
      const seed = instance.matchSeed;
      const sequence = instance.currentSequence;
      const nativeLevel = {
        schemaVersion: 1, depth: instance.currentDepth, width: 8, height: 8, branch: 0,
        entrancePos: 0, exitPos: 63, seed, locked: false, feeling: "NONE",
        levelClass: "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel",
        heroStateJson: "{}", nativeLevelMetadataBundle: "phase13-start-native-level",
        tiles: Array.from({ length: 64 }, (_, pos) => ({ pos, terrain: 1, passable: true,
          solid: false, pit: false, losBlocking: false, flammable: false, secret: false,
          avoid: false, water: false, discoverable: false, openSpace: false })),
        transitions: [], heaps: [], traps: [], blobs: [], plants: [], mobs: [],
        visitedPositions: [], mappedPositions: []
      };
      sql.exec("UPDATE levels SET width=8,height=8,entrance_pos=0,exit_pos=63,seed=? WHERE depth=?", seed, instance.currentDepth);
      sql.exec("DELETE FROM level_tiles WHERE depth=?", instance.currentDepth);
      sql.exec("DELETE FROM mobs WHERE depth=?", instance.currentDepth);
      for (let pos = 0; pos < 64; pos++) {
        sql.exec("INSERT INTO level_tiles (depth,pos,terrain,passable,solid,pit,los_blocking) VALUES (?,?,?,?,?,?,?)",
          instance.currentDepth, pos, 1, 1, 0, 0, 0);
      }
      sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        "levelSnapshot:" + instance.currentDepth, JSON.stringify(nativeLevel));
      const heroStateJson = JSON.stringify({ hp: 10, ht: 10, pos: 0, shielding: 0,
        combatBundle: "phase13-start-combat", inventoryBundle: "phase13-start-inventory", buffCount: 0 });
      const readyPayload = { ready: true, seed, sequence, className: "WARRIOR", heroStateJson };
      expect(errorOf(await send("phase13-start-host", "READY", readyPayload))).toBe(null);
      expect(errorOf(await send("phase13-start-guest", "JOIN_ROOM", {}))).toBe(null);
      expect(errorOf(await send("phase13-start-guest", "READY", readyPayload))).toBe(null);
      expect(meta("levelPublisherReadyTerm")).toBe(meta("levelPublisherTerm"));

      const started = await send("phase13-start-host", "MATCH_START", { seed, sequence });
      expect(errorOf(started)).toBe(null);
      expect(instance.gameStatus).toBe("PLAYING");
      expect(meta("roomLifecycleState")).toBe("PLAYING");
      expect(Number(meta("roomStartedAt"))).toBeGreaterThan(0);
      expect(broadcasts.some(message => message.messageType === "MATCH_START"
        && message.senderId === "SERVER")).toBe(true);
      expect(broadcasts.some(message => message.messageType === "ROOM_STATE"
        && JSON.parse(message.payloadJson).gameStatus === "PLAYING")).toBe(true);

      expect(errorOf(await send("phase13-start-late", "JOIN_ROOM", {}))).toBe("ROOM_NOT_JOINABLE");
      expect(errorOf(await send("phase13-start-host", "MATCH_START", { operation: "CANCEL" })))
        .toBe("ROOM_START_CANCEL_FORBIDDEN");
      expect(instance.gameStatus).toBe("PLAYING");
    });
  });

  it("enforces lifecycle minimum and maximum player counts, readiness, action gating, handoff, and permanent closure", async () => {
    const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName("phase13-room-lifecycle-core"));
    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      const roomBroadcasts = [];
      instance.broadcastToRoomMembers = message => roomBroadcasts.push(message);

      sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", "roomLifecycleVersion", "1");
      const clients = new Map();
      for (const playerId of ["phase13-host", "phase13-guest", "phase13-third", "phase13-fourth", "phase13-pending"]) {
        const sessionToken = playerId + "-token";
        sql.exec("INSERT INTO players (player_id,session_token,pos,hp,ht,state,connected,ready) VALUES (?,?,?,?,?,?,?,?)",
          playerId, sessionToken, 0, 10, 10, "ALIVE", 1, 0);
        const sent = [];
        clients.set(playerId, { sent, socket: { send: value => sent.push(String(value)), deserializeAttachment: () => ({ playerId, sessionToken }) } });
      }
      let requestNumber = 0;
      const send = async (playerId, messageType, payload) => {
        const client = clients.get(playerId);
        const startAt = client.sent.length;
        await instance.webSocketMessage(client.socket, JSON.stringify({
          protocolVersion: "1.0.0", messageType, requestId: "phase13-" + (++requestNumber),
          senderId: "untrusted", payloadJson: JSON.stringify(payload || {})
        }));
        return client.sent.slice(startAt).map(value => JSON.parse(value));
      };
      const errorOf = messages => {
        const error = messages.find(message => message.messageType === "ERROR");
        return error?.payloadJson ? JSON.parse(error.payloadJson).error : null;
      };
      const meta = key => sql.exec("SELECT value FROM room_meta WHERE key = ?", key).toArray()[0]?.value;
      const memberCount = () => sql.exec("SELECT COUNT(*) AS count FROM room_meta WHERE substr(key,1,11)='roomMember:'").toArray()[0].count;

      const created = await send("phase13-host", "CREATE_ROOM", { gameMode: "COOP_DUNGEON" });
      expect(created.some(message => message.messageType === "ACK")).toBe(true);
      expect(meta("roomOwnerId")).toBe("phase13-host");
      expect(meta("roomCapacity")).toBe("4");
      expect(meta("levelPublisher")).toBe("phase13-host");
      expect(memberCount()).toBe(1);

      const seed = instance.matchSeed;
      const sequence = instance.currentSequence;
      const nativeLevel = { schemaVersion: 1, depth: instance.currentDepth, width: 8, height: 8, branch: 0, entrancePos: 0, exitPos: 63, seed, locked: false, feeling: "NONE", levelClass: "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel", heroStateJson: "{}", nativeLevelMetadataBundle: "phase13-native-level", tiles: Array.from({ length: 64 }, (_, pos) => ({ pos, terrain: 1, passable: true, solid: false, pit: false, losBlocking: false, flammable: false, secret: false, avoid: false, water: false, discoverable: false, openSpace: false })), transitions: [], heaps: [], traps: [], blobs: [], plants: [], mobs: [], visitedPositions: [], mappedPositions: [] };
      sql.exec("UPDATE levels SET width=8,height=8,entrance_pos=0,exit_pos=63,seed=? WHERE depth=?", seed, instance.currentDepth);
      sql.exec("DELETE FROM level_tiles WHERE depth=?", instance.currentDepth);
      sql.exec("DELETE FROM mobs WHERE depth=?", instance.currentDepth);
      for (let pos = 0; pos < 64; pos++) sql.exec("INSERT INTO level_tiles (depth,pos,terrain,passable,solid,pit,los_blocking) VALUES (?,?,?,?,?,?,?)", instance.currentDepth, pos, 1, 1, 0, 0, 0);
      sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", "levelSnapshot:" + instance.currentDepth, JSON.stringify(nativeLevel));
      const readyHeroStateJson = JSON.stringify({ hp: 10, ht: 10, pos: 0, shielding: 0, combatBundle: "phase13-native-combat", inventoryBundle: "phase13-native-inventory", buffCount: 0 });
      const readyPayload = { ready: true, seed, sequence, className: "WARRIOR", heroStateJson: readyHeroStateJson };
      await send("phase13-host", "READY", readyPayload);
      expect(errorOf(await send("phase13-host", "MATCH_START", { seed, sequence }))).toBe("ROOM_NOT_ENOUGH_PLAYERS");

      const firstJoin = await send("phase13-guest", "JOIN_ROOM", {});
      expect(firstJoin.some(message => message.messageType === "ACK")).toBe(true);

      // JOIN_ROOM and MATCH_START race through the same Durable Object transaction queue.
      // Regardless of which handler wins, the unready third member cannot be omitted from start validation.
      const [racingJoin, racingStart] = await Promise.all([
        send("phase13-third", "JOIN_ROOM", {}),
        send("phase13-host", "MATCH_START", { seed, sequence })
      ]);
      expect(errorOf(racingJoin)).toBe(null);
      expect(racingJoin.some(message => message.messageType === "ACK")).toBe(true);
      expect(errorOf(racingStart)).toBe("ROOM_PLAYERS_NOT_READY");
      expect(instance.gameStatus).toBe("LOBBY");
      expect(memberCount()).toBe(3);

      const fourthJoin = await send("phase13-fourth", "JOIN_ROOM", {});
      expect(fourthJoin.some(message => message.messageType === "ACK")).toBe(true);
      expect(memberCount()).toBe(4);
      expect(roomBroadcasts.some(message => message.messageType === "SNAPSHOT")).toBe(true);
      const rosterFor = playerId => clients.get(playerId).sent.map(value => JSON.parse(value)).filter(message => message.messageType === "PLAYER_JOINED").map(message => message.senderId);
      expect(rosterFor("phase13-guest")).toEqual(expect.arrayContaining(["phase13-host", "phase13-guest"]));
      expect(rosterFor("phase13-third")).toEqual(expect.arrayContaining(["phase13-host", "phase13-guest", "phase13-third"]));
      expect(rosterFor("phase13-fourth")).toEqual(expect.arrayContaining(["phase13-host", "phase13-guest", "phase13-third", "phase13-fourth"]));
      expect(roomBroadcasts.filter(message => message.messageType === "PLAYER_JOINED").map(message => message.senderId)).toEqual(
        ["phase13-guest", "phase13-third", "phase13-fourth"]
      );
      const resumedMessages = [];
      instance.sendRoomStateToSocket({ send: value => resumedMessages.push(JSON.parse(String(value))) }, "SESSION_RESUMED");
      expect(resumedMessages.filter(message => message.messageType === "PLAYER_JOINED")).toHaveLength(4);
      expect(errorOf(await send("phase13-pending", "JOIN_ROOM", {}))).toBe("ROOM_FULL");
      expect(memberCount()).toBe(4);
      expect(errorOf(await send("phase13-pending", "ACTION", { action: "MOVE", data: {} }))).toBe("ROOM_MEMBERSHIP_REQUIRED");
      expect(errorOf(await send("phase13-host", "ACTION", { action: "MOVE", data: {} }))).toBe("MATCH_NOT_STARTED");
      expect(errorOf(await send("phase13-host", "MATCH_START", { seed, sequence }))).toBe("ROOM_PLAYERS_NOT_READY");

      expect(errorOf(await send("phase13-third", "READY", { ready: true, seed: seed + 1, sequence }))).toBe("ROOM_WORLD_NOT_SYNCHRONIZED");
      for (const playerId of ["phase13-guest", "phase13-third", "phase13-fourth"]) {
        const readyMessages = await send(playerId, "READY", readyPayload);
        expect(errorOf(readyMessages)).toBe(null);
        expect(readyMessages.some(message => message.messageType === "ACK")).toBe(true);
      }
      expect(Number(sql.exec("SELECT COUNT(*) AS count FROM players WHERE ready=1 AND player_id IN ('phase13-host','phase13-guest','phase13-third','phase13-fourth')").toArray()[0].count)).toBe(4);

      const cancelled = await send("phase13-host", "MATCH_START", { operation: "CANCEL" });
      expect(errorOf(cancelled)).toBe(null);
      expect(cancelled.some(message => message.messageType === "ACK")).toBe(true);
      expect(meta("roomLifecycleState")).toBe("LOBBY");
      expect(instance.gameStatus).toBe("LOBBY");
      expect(Number(sql.exec("SELECT COUNT(*) AS count FROM players WHERE ready=1 AND player_id IN ('phase13-host','phase13-guest','phase13-third','phase13-fourth')").toArray()[0].count)).toBe(0);
      for (const playerId of ["phase13-host", "phase13-guest", "phase13-third", "phase13-fourth"]) {
        const readiness = JSON.parse(meta("roomReady:" + playerId));
        expect(readiness).toMatchObject({ ready: false, seed, sequence });
      }

      // Cancellation is an authoritative reset: every member must explicitly ready again.
      for (const playerId of ["phase13-host", "phase13-guest", "phase13-third", "phase13-fourth"]) {
        const readyMessages = await send(playerId, "READY", readyPayload);
        expect(errorOf(readyMessages)).toBe(null);
        expect(readyMessages.some(message => message.messageType === "ACK")).toBe(true);
      }
      expect(Number(sql.exec("SELECT COUNT(*) AS count FROM players WHERE ready=1 AND player_id IN ('phase13-host','phase13-guest','phase13-third','phase13-fourth')").toArray()[0].count)).toBe(4);

      sql.exec("DELETE FROM room_meta WHERE key = ?", "levelSnapshot:" + instance.currentDepth);
      expect(errorOf(await send("phase13-guest", "MATCH_START", { seed, sequence }))).toBe("MATCH_START_AUTHORITY_REQUIRED");
      expect(errorOf(await send("phase13-host", "MATCH_START", { seed, sequence }))).toBe("ROOM_START_SNAPSHOT_REQUIRED");

      sql.exec("UPDATE players SET connected=0,ready=0 WHERE player_id=?", "phase13-guest");
      const ownerLeave = await send("phase13-host", "LEAVE", {});
      expect(ownerLeave.some(message => message.messageType === "ACK")).toBe(true);
      expect(meta("roomOwnerId")).toBe("phase13-third");
      expect(meta("levelPublisher")).toBe("phase13-third");
      expect(Number(meta("levelPublisherTerm"))).toBe(2);
      expect(Number(sql.exec("SELECT ready FROM players WHERE player_id = 'phase13-third'").toArray()[0].ready)).toBe(0);

      sql.exec("UPDATE players SET connected=1 WHERE player_id=?", "phase13-guest");
      await send("phase13-guest", "LEAVE", {});
      expect(meta("roomOwnerId")).toBe("phase13-third");
      await send("phase13-third", "LEAVE", {});
      expect(meta("roomOwnerId")).toBe("phase13-fourth");
      await send("phase13-fourth", "LEAVE", {});
      expect(meta("roomClosed")).toBe("1");
      expect(meta("roomLifecycleState")).toBe("CLOSED");
      expect(memberCount()).toBe(0);
      expect(errorOf(await send("phase13-pending", "JOIN_ROOM", {}))).toBe("ROOM_CLOSED");
    });
  });


  it("atomically resets every READY proof when the room owner loses its WebSocket", async () => {
    const ownerId = "phase13-network-owner";
    const successorId = "phase13-a-successor";
    const observerId = "phase13-z-observer";
    const seed = 24681357;
    const roomId = env.MATCH_ROOM.idFromName("phase13-owner-network-disconnect-readiness-reset");
    const stub = env.MATCH_ROOM.get(roomId);
    const successorMessages = [];
    const observerMessages = [];
    const successorHero = JSON.stringify({
      hp: 10, ht: 10, pos: 0, shielding: 0,
      combatBundle: "phase13-successor-native-combat",
      inventoryBundle: "phase13-successor-native-inventory",
      buffCount: 0
    });
    const ownerSocket = {
      deserializeAttachment: () => ({ playerId: ownerId, sessionToken: ownerId + "-token" })
    };
    const successorSocket = {
      send: value => successorMessages.push(JSON.parse(String(value))),
      deserializeAttachment: () => ({ playerId: successorId, sessionToken: successorId + "-token" })
    };
    const observerSocket = {
      send: value => observerMessages.push(JSON.parse(String(value))),
      deserializeAttachment: () => ({ playerId: observerId, sessionToken: observerId + "-token" })
    };

    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      instance.gameMode = "COOP_DUNGEON";
      instance.gameStatus = "LOBBY";
      instance.currentDepth = 1;
      instance.currentSequence = 0;
      instance.matchSeed = seed;
      instance.state.getWebSockets = () => [successorSocket, observerSocket];

      const nativeLevel = {
        schemaVersion: 1, depth: 1, width: 8, height: 8, branch: 0,
        entrancePos: 0, exitPos: 63, seed, locked: false, feeling: "NONE",
        levelClass: "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel",
        heroStateJson: successorHero, nativeLevelMetadataBundle: "phase13-network-native-level",
        tiles: Array.from({ length: 64 }, (_, pos) => ({
          pos, terrain: 1, passable: true, solid: false, pit: false,
          losBlocking: false, flammable: false, secret: false, avoid: false,
          water: false, discoverable: false, openSpace: false
        })),
        transitions: [], heaps: [], traps: [], blobs: [], plants: [], mobs: [],
        visitedPositions: [], mappedPositions: []
      };
      sql.exec(
        "UPDATE levels SET width=8,height=8,entrance_pos=0,exit_pos=63,seed=? WHERE depth=?",
        seed, instance.currentDepth
      );
      sql.exec("DELETE FROM level_tiles WHERE depth=?", instance.currentDepth);
      sql.exec("DELETE FROM mobs WHERE depth=?", instance.currentDepth);
      for (let pos = 0; pos < 64; pos++) {
        sql.exec(
          "INSERT INTO level_tiles (depth,pos,terrain,passable,solid,pit,los_blocking) VALUES (?,?,?,?,?,?,?)",
          instance.currentDepth, pos, 1, 1, 0, 0, 0
        );
      }

      for (const [playerId, joinedAt] of [[ownerId, 1], [successorId, 2], [observerId, 3]]) {
        sql.exec(
          "INSERT INTO players (player_id,session_token,class_name,pos,hp,ht,state,connected,ready) VALUES (?,?,?,?,?,?,?,?,?)",
          playerId, playerId + "-token", "WARRIOR", 0, 10, 10, "ALIVE", 1, 1
        );
        sql.exec(
          "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          "roomMember:" + playerId, JSON.stringify({ joinedAt, role: playerId === ownerId ? "OWNER" : "PLAYER" })
        );
        sql.exec(
          "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          "roomReady:" + playerId, JSON.stringify({ ready: true, seed, sequence: 0 })
        );
        sql.exec(
          "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          "heroState:" + playerId, successorHero
        );
      }

      for (const [key, value] of [
        ["roomLifecycleVersion", "1"],
        ["roomCreated", "1"],
        ["roomClosed", "0"],
        ["roomLifecycleState", "LOBBY"],
        ["roomOwnerId", ownerId],
        ["roomCapacity", "4"],
        ["gameMode", "COOP_DUNGEON"],
        ["levelPublisher", ownerId],
        ["levelPublisherTerm", "4"],
        ["levelPublisherReadyTerm", "4"],
        ["seed", String(seed)],
        ["depth", "1"],
        ["levelSnapshot:1", JSON.stringify(nativeLevel)]
      ]) {
        sql.exec(
          "INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          key, value
        );
      }

      await instance.webSocketClose(ownerSocket, 1006, "network connection lost", false);

      expect(sql.exec("SELECT connected,ready FROM players WHERE player_id=?", ownerId).toArray()[0])
        .toMatchObject({ connected: 0, ready: 0 });
      expect(sql.exec("SELECT value FROM room_meta WHERE key='roomOwnerId'").toArray()[0].value).toBe(successorId);
      expect(sql.exec("SELECT value FROM room_meta WHERE key='levelPublisher'").toArray()[0].value).toBe(successorId);
      expect(sql.exec("SELECT value FROM room_meta WHERE key='levelPublisherTerm'").toArray()[0].value).toBe("5");
      expect(sql.exec("SELECT value FROM room_meta WHERE key='levelPublisherReadyTerm'").toArray()[0].value).toBe("5");

      for (const playerId of [ownerId, successorId, observerId]) {
        const row = sql.exec("SELECT ready FROM players WHERE player_id=?", playerId).toArray()[0];
        expect(row.ready).toBe(0);
        const readiness = JSON.parse(sql.exec("SELECT value FROM room_meta WHERE key=?", "roomReady:" + playerId).toArray()[0].value);
        expect(readiness).toEqual({ ready: false, seed, sequence: 0 });
      }

      const ownerHandoff = successorMessages.find(message =>
        message.messageType === "ROOM_STATE" && JSON.parse(message.payloadJson).reason === "ROOM_OWNER_HANDOFF"
      );
      expect(ownerHandoff).toBeTruthy();
      expect(JSON.parse(ownerHandoff.payloadJson)).toMatchObject({
        ownerId: successorId, memberCount: 3, allReady: false, roomStatus: "LOBBY"
      });
      expect(JSON.parse(ownerHandoff.payloadJson).members).toEqual(expect.arrayContaining([
        expect.objectContaining({ playerId: ownerId, connected: false, ready: false }),
        expect.objectContaining({ playerId: successorId, connected: true, ready: false }),
        expect.objectContaining({ playerId: observerId, connected: true, ready: false })
      ]));
      expect(observerMessages.some(message =>
        message.messageType === "ROOM_STATE" && JSON.parse(message.payloadJson).reason === "ROOM_OWNER_HANDOFF"
      )).toBe(true);
    });
  });});
