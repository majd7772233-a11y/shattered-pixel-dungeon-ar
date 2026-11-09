import { describe, it, expect, vi } from "vitest";
import { MatchRoom } from "./index";

const PLAYER_ID = "publisher-player-001";
const ENTITY_ID = "stable-linked-mob-0001";
const RAT_CLASS = "com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat";
const LIFE_LINK_CLASS = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LifeLink";
const POISON_CLASS = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison";

type Row = Record<string, any>;

class MemoryMatchRoomSql {
  roomMeta = new Map<string, string>();
  players = new Map<string, Row>();
  mobs = new Map<number, Row>();
  processedActions = new Map<string, Row>();
  events: Row[] = [];
  rewardClaims = new Set<string>();
  calls: Array<{query:string;args:any[]}> = [];
  mobUpdates = 0;
  mobDeletes = 0;
  rewardClaimInsertAttempts = 0;

  private cursor(rows: Row[] = []) {
    return { toArray: () => rows.map(row => ({ ...row })) };
  }

  exec(queryValue: string, ...args: any[]) {
    const query = String(queryValue).replace(/\s+/g, " ").trim();
    this.calls.push({ query, args });

    if (query === "SELECT value FROM room_meta WHERE key = 'transitionPending'") {
      const value = this.roomMeta.get("transitionPending");
      return this.cursor(value === undefined ? [] : [{ value }]);
    }
    if (query === "SELECT value FROM room_meta WHERE key = 'levelPublisher'") {
      const value = this.roomMeta.get("levelPublisher");
      return this.cursor(value === undefined ? [] : [{ value }]);
    }
    if (query === "SELECT value FROM room_meta WHERE key = ?") {
      const value = this.roomMeta.get(String(args[0]));
      return this.cursor(value === undefined ? [] : [{ value }]);
    }
    if (query.startsWith("SELECT player_id, sequence, result_json FROM processed_actions WHERE request_id = ?")) {
      const row = this.processedActions.get(String(args[0]));
      return this.cursor(row ? [row] : []);
    }
    if (query.startsWith("SELECT width,height FROM levels WHERE depth = ?")
        || query.startsWith("SELECT width, height FROM levels WHERE depth = ?")) {
      return this.cursor([{ width: 32, height: 32 }]);
    }
    if (query.startsWith("SELECT hp,ht,pos FROM mobs WHERE mob_id = ? AND depth = ?")
        || query.startsWith("SELECT hp, ht, pos FROM mobs WHERE mob_id = ? AND depth = ?")) {
      const row = this.mobs.get(Number(args[0]));
      return this.cursor(row && Number(row.depth) === Number(args[1])
        ? [{ hp: row.hp, ht: row.ht, pos: row.pos }] : []);
    }
    if (query.startsWith("SELECT pos, hp, ht, state FROM players WHERE player_id = ?")
        || query.startsWith("SELECT pos,hp,ht,state FROM players WHERE player_id = ?")) {
      const row = this.players.get(String(args[0]));
      return this.cursor(row ? [{ pos: row.pos, hp: row.hp, ht: row.ht, state: row.state }] : []);
    }
    if (query.startsWith("SELECT reward_id FROM native_mob_reward_claims WHERE reward_id = ?")) {
      const rewardId = String(args[0]);
      return this.cursor(this.rewardClaims.has(rewardId) ? [{ reward_id: rewardId }] : []);
    }
    if (query.startsWith("SELECT sequence FROM events WHERE sender_id = ? AND event_type = 'HERO_BUFF_TICKED'")) {
      const row = this.events.filter(event => event.sender_id === String(args[0])
        && event.event_type === "HERO_BUFF_TICKED")
        .sort((a,b) => Number(b.sequence) - Number(a.sequence))[0];
      return this.cursor(row ? [{ sequence: row.sequence }] : []);
    }
    if (query.startsWith("SELECT sequence,sender_id,event_type,payload FROM events WHERE sequence > ?")) {
      const rows = this.events.filter(event => Number(event.sequence) > Number(args[0])
        && event.sender_id === String(args[1]) && event.event_type === "CHAR_DAMAGED")
        .sort((a,b) => Number(a.sequence) - Number(b.sequence)).slice(0,513);
      return this.cursor(rows);
    }

    if (query.startsWith("UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?")) {
      const row = this.mobs.get(Number(args[3]));
      if (row && Number(row.depth) === Number(args[4])) {
        row.hp = Number(args[0]); row.ht = Number(args[1]); row.pos = Number(args[2]);
        this.mobUpdates++;
      }
      return this.cursor();
    }
    if (query.startsWith("DELETE FROM mobs WHERE mob_id = ? AND depth = ?")) {
      const id = Number(args[0]), row = this.mobs.get(id);
      if (row && Number(row.depth) === Number(args[1])) {
        this.mobs.delete(id);
        this.mobDeletes++;
      }
      return this.cursor();
    }
    if (query.startsWith("UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?")) {
      const row = this.players.get(String(args[4]));
      if (row) {
        row.hp = Number(args[0]); row.ht = Number(args[1]); row.pos = Number(args[2]); row.state = String(args[3]);
      }
      return this.cursor();
    }
    if (query.startsWith("UPDATE players SET deaths = deaths + 1 WHERE player_id = ?")) {
      const row = this.players.get(String(args[0]));
      if (row) row.deaths = Number(row.deaths || 0) + 1;
      return this.cursor();
    }
    if (query.startsWith("INSERT INTO room_meta (key,value) VALUES (?,?)")
        || query.startsWith("INSERT INTO room_meta (key, value) VALUES (?,?)")) {
      this.roomMeta.set(String(args[0]), String(args[1]));
      return this.cursor();
    }
    if (query.startsWith("INSERT INTO room_meta (key, value) VALUES ('worldTime', ?)")) {
      this.roomMeta.set("worldTime", String(args[0]));
      return this.cursor();
    }
    if (query.startsWith("INSERT OR IGNORE INTO native_mob_reward_claims")) {
      this.rewardClaimInsertAttempts++;
      this.rewardClaims.add(String(args[0]));
      return this.cursor();
    }
    if (query.startsWith("INSERT INTO processed_actions")) {
      this.processedActions.set(String(args[0]), {
        request_id: String(args[0]), player_id: String(args[1]),
        sequence: Number(args[2]), result_json: String(args[3])
      });
      return this.cursor();
    }
    if (query.startsWith("INSERT INTO events")) {
      this.events.push({
        sequence: Number(args[0]), sender_id: String(args[1]),
        event_type: String(args[2]), payload: String(args[3])
      });
      return this.cursor();
    }

    throw new Error("Unexpected MatchRoom SQL in integration test: " + query + " " + JSON.stringify(args));
  }
}

function nativeMobBundle(hp: number): string {
  return JSON.stringify({ mob: {
    __className: RAT_CLASS, id: 7, time: 9, HP: hp, HT: 20, pos: 25, max_lvl: 29, buffs: []
  }});
}

function makeHeroBefore(): Row {
  const poison = JSON.stringify({ buff: {
    __className: POISON_CLASS, id: 44, time: 9, left: 9
  }});
  const link = JSON.stringify({ buff: {
    __className: LIFE_LINK_CLASS, id: 45, time: 9, object: 7
  }});
  const combat = {
    id: 21, time: 10, lvl: 1, exp: 0, subClass: "NONE", STR: 10,
    HP: 9, HT: 20, pos: 9, items: "native-inventory", buffs: [],
    talents_tier_1: {}, talents_tier_2: {}, talents_tier_3: {}, talents_tier_4: {}
  };
  return {
    hp: 9, ht: 20, pos: 9, shielding: 0, gold: 0, alchemyEnergy: 5,
    inventoryBundle: "native-inventory", inventoryItemsJson: "[]", quickslotsJson: "[]",
    notesBundle: "notes", questStateBundle: "quests", ankhCount: 0, blessedAnkhCount: 0,
    cooldown: 1, combatBundle: JSON.stringify(combat), buffCount: 2,
    buff_0: poison, buffCooldown_0: 0,
    buff_1: link, buffCooldown_1: 0
  };
}

function makeHeroAfterDeath(before: Row): { state: Row; targetBuffsBefore: string; targetBuffs: string } {
  const poison = String(before.buff_0);
  const buffsBefore = [
    { serializedBundle: poison, cooldown: 0 },
    { serializedBundle: String(before.buff_1), cooldown: 0 }
  ];
  const buffsAfter = [{ serializedBundle: poison, cooldown: 0 }];
  const combatBefore = JSON.parse(String(before.combatBundle));
  const combatAfter = { ...combatBefore, HP: 0, HT: 20, pos: 9, exp: 2 };
  const state = {
    ...before, hp: 0, buffCount: 1,
    buff_0: poison, buffCooldown_0: 0,
    combatBundle: JSON.stringify(combatAfter)
  };
  delete (state as any).buff_1;
  delete (state as any).buffCooldown_1;
  return {
    state,
    targetBuffsBefore: JSON.stringify(buffsBefore),
    targetBuffs: JSON.stringify(buffsAfter)
  };
}

function makeRoom(sql: MemoryMatchRoomSql): any {
  // Exercise the real MatchRoom prototype/handler without invoking the production
  // Durable Object constructor or its level-generation/migration side effects.
  const room = Object.create(MatchRoom.prototype) as any;
  room.sql = sql as any;
  room.currentSequence = 0;
  room.currentDepth = 1;
  room.worldTime = 0;
  room.gameMode = "COOP_DUNGEON";
  room.gameStatus = "PLAYING";
  room.state = { id: { toString: () => "lifelink-match-test" }, getWebSockets: () => [] };
  room.broadcastWithFOV = vi.fn();
  room.checkMatchEndCondition = vi.fn();
  return room;
}

function actionMessage(requestId: string, payload: Row): Row {
  return {
    protocolVersion: "1.0.0", messageType: "ACTION", requestId,
    payloadJson: JSON.stringify(payload)
  };
}

function acceptedMessage(ws: any, index: number): Row {
  const message = JSON.parse(String(ws.send.mock.calls[index][0]));
  expect(message.messageType).toBe("ACTION_ACCEPTED");
  return JSON.parse(String(message.payloadJson));
}

describe("MatchRoom lethal Poison LifeLink event pipeline", () => {
  it("commits the linked Mob event before Hero death and claims its reward once", async () => {
    const sql = new MemoryMatchRoomSql();
    const beforeHero = makeHeroBefore();
    const mobBundle = nativeMobBundle(1);
    const savedMob = {
      mobId: 7, entityId: ENTITY_ID, name: "Rat", pos: 25, hp: 1, ht: 20, shielding: 0,
      state: "Hunting", serializedBundle: mobBundle, buffs: [],
      defenseSkill: 5, baseSpeed: 1, effectiveSpeed: 1, cooldown: 0,
      targetCell: -1, targetType: "NONE", targetEntityId: "", enemySeen: false, alerted: false,
      rewardClassName: RAT_CLASS, rewardEligible: true, rewardExp: 2, rewardMaxLevel: 29,
      rewardSpawningWeight: 1, rewardMonkEnergy: 1
    };
    sql.roomMeta.set("levelPublisher", PLAYER_ID);
    sql.roomMeta.set("heroState:" + PLAYER_ID, JSON.stringify(beforeHero));
    sql.roomMeta.set("levelSnapshot:1", JSON.stringify({
      depth: 1, width: 32, height: 32, branch: 0, locked: false,
      levelClass: "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel",
      heaps: [], mobs: [savedMob]
    }));
    sql.players.set(PLAYER_ID, {
      player_id: PLAYER_ID, pos: 9, hp: 9, ht: 20, state: "ALIVE", deaths: 0
    });
    sql.mobs.set(7, { mob_id: 7, depth: 1, hp: 1, ht: 20, pos: 25 });

    const room = makeRoom(sql);
    const ws = { send: vi.fn() };
    const session = { playerId: PLAYER_ID, sessionToken: "session-token" };
    const mobDelta = {
      entityId: ENTITY_ID, hpBefore: 1, htBefore: 20, posBefore: 25, shieldBefore: 0,
      buffsBefore: "[]", hpAfter: 0, htAfter: 20, posAfter: 25, shieldAfter: 0,
      buffsAfter: "[]", serializedBundleAfter: mobBundle
    };

    await room.handleAction(ws, actionMessage("lifelink-mob-death-001", {
      action: "SYNC_MOB_STATE",
      data: {
        entityId: ENTITY_ID, sourceClass: LIFE_LINK_CLASS, combatSchemaVersion: 1,
        combatDepth: 1, engineDamageResult: true,
        hpBefore: 1, htBefore: 20, posBefore: 25, shieldBefore: 0, buffsBefore: "[]",
        hpAfter: 0, htAfter: 20, posAfter: 25, shieldAfter: 0, buffsAfter: "[]",
        serializedBundleAfter: mobBundle, secondaryMobDeltas: { complete: true, deltas: [] },
        heaps: []
      }
    }), session);

    expect(sql.events).toHaveLength(1);
    expect(sql.events[0].event_type).toBe("CHAR_DAMAGED");
    expect(JSON.parse(String(sql.events[0].payload)).nativeActorId).toBe(7);
    expect(sql.mobs.has(7)).toBe(false);
    expect(JSON.parse(String(sql.roomMeta.get("levelSnapshot:1"))).mobs).toHaveLength(0);
    expect(sql.mobDeletes).toBe(1);
    expect(sql.rewardClaims.size).toBe(0);

    // A second request UUID cannot repeat the already-committed native Mob death.
    await room.handleAction(ws, actionMessage("lifelink-mob-death-002", {
      action: "SYNC_MOB_STATE",
      data: {
        entityId: ENTITY_ID, sourceClass: LIFE_LINK_CLASS, combatSchemaVersion: 1,
        combatDepth: 1, engineDamageResult: true,
        hpBefore: 1, htBefore: 20, posBefore: 25, shieldBefore: 0, buffsBefore: "[]",
        hpAfter: 0, htAfter: 20, posAfter: 25, shieldAfter: 0, buffsAfter: "[]",
        serializedBundleAfter: mobBundle, secondaryMobDeltas: { complete: true, deltas: [] },
        heaps: []
      }
    }), session);
    expect(JSON.parse(String(ws.send.mock.calls[1][0])).messageType).toBe("ERROR");
    expect(sql.events).toHaveLength(1);
    expect(sql.mobDeletes).toBe(1);

    const heroDeath = makeHeroAfterDeath(beforeHero);
    await room.handleAction(ws, actionMessage("lifelink-hero-death-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(heroDeath.state),
      data: {
        sourceType: "ENVIRONMENT", sourceClass: POISON_CLASS, engineDamageResult: true,
        targetHpBefore: 9, targetHtBefore: 20, targetHp: 0, targetHt: 20,
        targetPosBefore: 9, targetPosAfter: 9,
        targetShieldBefore: 0, targetShieldAfter: 0,
        targetState: "DEAD", damage: 9, effectiveDamage: 9,
        targetBuffsBefore: heroDeath.targetBuffsBefore, targetBuffs: heroDeath.targetBuffs
      }
    }), session);

    expect(sql.events).toHaveLength(2);
    expect(sql.events.map(event => event.event_type)).toEqual(["CHAR_DAMAGED", "PLAYER_DAMAGED"]);
    const heroEvent = JSON.parse(String(sql.events[1].payload));
    expect(heroEvent.nativeLifeLinkDeathEntityIds).toEqual([ENTITY_ID]);
    expect(sql.players.get(PLAYER_ID)).toMatchObject({ hp: 0, ht: 20, pos: 9, state: "DEAD", deaths: 1 });
    const storedHero = JSON.parse(String(sql.roomMeta.get("heroState:" + PLAYER_ID)));
    expect(JSON.parse(String(storedHero.combatBundle)).exp).toBe(2);
    expect(storedHero.buffCount).toBe(1);
    expect(sql.rewardClaims).toEqual(new Set(["mob-kill:1:" + ENTITY_ID]));
    expect(sql.rewardClaimInsertAttempts).toBe(1);
    expect(sql.mobDeletes).toBe(1);

    // Same request ID is idempotent; a new request ID cannot replay a dead Hero's old Mob event.
    const acceptedCount = ws.send.mock.calls.length;
    await room.handleAction(ws, actionMessage("lifelink-hero-death-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(heroDeath.state),
      data: {
        sourceType: "ENVIRONMENT", sourceClass: POISON_CLASS, engineDamageResult: true,
        targetHpBefore: 9, targetHtBefore: 20, targetHp: 0, targetHt: 20,
        targetPosBefore: 9, targetPosAfter: 9, targetShieldBefore: 0, targetShieldAfter: 0,
        targetState: "DEAD", damage: 9, effectiveDamage: 9,
        targetBuffsBefore: heroDeath.targetBuffsBefore, targetBuffs: heroDeath.targetBuffs
      }
    }), session);
    expect(ws.send).toHaveBeenCalledTimes(acceptedCount + 1);
    expect(JSON.parse(String(ws.send.mock.calls[acceptedCount][0])).messageType).toBe("ACTION_ACCEPTED");
    expect(sql.events).toHaveLength(2);
    expect(sql.rewardClaimInsertAttempts).toBe(1);

    await room.handleAction(ws, actionMessage("lifelink-hero-death-002", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(heroDeath.state),
      data: {
        sourceType: "ENVIRONMENT", sourceClass: POISON_CLASS, engineDamageResult: true,
        targetHpBefore: 9, targetHtBefore: 20, targetHp: 0, targetHt: 20,
        targetPosBefore: 9, targetPosAfter: 9, targetShieldBefore: 0, targetShieldAfter: 0,
        targetState: "DEAD", damage: 9, effectiveDamage: 9,
        targetBuffsBefore: heroDeath.targetBuffsBefore, targetBuffs: heroDeath.targetBuffs
      }
    }), session);
    expect(JSON.parse(String(ws.send.mock.calls.at(-1)[0])).messageType).toBe("ERROR");
    expect(sql.events).toHaveLength(2);
    expect(sql.rewardClaims.size).toBe(1);
    expect(sql.rewardClaimInsertAttempts).toBe(1);
    expect(sql.players.get(PLAYER_ID)?.deaths).toBe(1);
  });
});
