import { describe, it, expect, vi } from "vitest";
import { isValidNativePublisherRebase } from "../validators/publisher-rebase";
import { MatchRoom } from "./index";
import { isValidNativeHeroBuffTick, nativeHeroBuffLifeLinkMobEntityIds,
  validateNativeLifeLinkDeathRewardTransition } from "../validators/hero-buffs";
import { buildNativeLifeLinkMobDamageEvents, parseAndValidateNativeLifeLinkMobDeltas, isValidNativeHeroStateJson } from "../validators/combat-state";
import { hasCompleteNativeLevelSnapshot } from "../validators/world-state";

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
  mobUpdates = 0;
  mobDeletes = 0;
  rewardClaimInsertAttempts = 0;
  failEventInsert = false;

  transactionCalls = 0;

  transactionSync<T>(callback: () => T): T {
    this.transactionCalls++;
    const snapshot = {
      roomMeta: new Map(this.roomMeta),
      players: new Map(Array.from(this.players, ([key, value]) => [key, { ...value }])),
      mobs: new Map(Array.from(this.mobs, ([key, value]) => [key, { ...value }])),
      processedActions: new Map(Array.from(this.processedActions, ([key, value]) => [key, { ...value }])),
      events: this.events.map(event => ({ ...event })),
      rewardClaims: new Set(this.rewardClaims),
      mobUpdates: this.mobUpdates,
      mobDeletes: this.mobDeletes,
      rewardClaimInsertAttempts: this.rewardClaimInsertAttempts
    };
    try {
      return callback();
    } catch (error) {
      this.roomMeta = snapshot.roomMeta;
      this.players = snapshot.players;
      this.mobs = snapshot.mobs;
      this.processedActions = snapshot.processedActions;
      this.events = snapshot.events;
      this.rewardClaims = snapshot.rewardClaims;
      this.mobUpdates = snapshot.mobUpdates;
      this.mobDeletes = snapshot.mobDeletes;
      this.rewardClaimInsertAttempts = snapshot.rewardClaimInsertAttempts;
      throw error;
    }
  }

  private cursor(rows: Row[] = []) {
    return { toArray: () => rows.map(row => ({ ...row })) };
  }

  exec(queryValue: string, ...args: any[]) {
    const query = String(queryValue).replace(/\s+/g, " ").trim();

    if (query === "SELECT value FROM room_meta WHERE key = 'transitionPending'") {
      const value = this.roomMeta.get("transitionPending");
      return this.cursor(value === undefined ? [] : [{ value }]);
    }
    if (query === "SELECT value FROM room_meta WHERE key = 'levelPublisher'") {
      const value = this.roomMeta.get("levelPublisher");
      return this.cursor(value === undefined ? [] : [{ value }]);
    }
    if (query === "SELECT player_id FROM players ORDER BY player_id ASC") {
      return this.cursor(Array.from(this.players.values())
        .sort((a,b) => String(a.player_id).localeCompare(String(b.player_id)))
        .map(player => ({ player_id: player.player_id })));
    }
    if (query === "SELECT player_id FROM players WHERE connected = 1 ORDER BY player_id ASC") {
      return this.cursor(Array.from(this.players.values())
        .filter(player => Number(player.connected) === 1)
        .sort((a,b) => String(a.player_id).localeCompare(String(b.player_id)))
        .map(player => ({ player_id: player.player_id })));
    }
    if (query === "SELECT key,value FROM room_meta WHERE key LIKE 'pendingCombat:%'") {
      return this.cursor(Array.from(this.roomMeta.entries())
        .filter(([key]) => key.startsWith("pendingCombat:"))
        .map(([key,value]) => ({ key, value })));
    }
    if (query === "SELECT player_id,pos,hp,ht FROM players WHERE state = 'ALIVE' AND connected = 1 ORDER BY player_id ASC") {
      return this.cursor(Array.from(this.players.values())
        .filter(player => String(player.state) === "ALIVE" && Number(player.connected) === 1)
        .sort((a,b) => String(a.player_id).localeCompare(String(b.player_id)))
        .map(player => ({
          player_id: player.player_id, pos: player.pos, hp: player.hp, ht: player.ht
        })));
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
    if (query.startsWith("SELECT pos FROM players WHERE player_id = ?")) {
      const row = this.players.get(String(args[0]));
      return this.cursor(row ? [{ pos: row.pos }] : []);
    }
    if (query.startsWith("SELECT solid, los_blocking FROM level_tiles WHERE depth = ? AND pos = ?")) {
      return this.cursor([]);
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
    if (query.startsWith("UPDATE players SET connected = 0 WHERE player_id = ?")) {
      const row = this.players.get(String(args[0]));
      if (row) row.connected = 0;
      return this.cursor();
    }
    if (query.startsWith("UPDATE players SET connected = 1 WHERE player_id = ?")) {
      const row = this.players.get(String(args[0]));
      if (row) row.connected = 1;
      return this.cursor();
    }
    if (query.startsWith("UPDATE players SET hp = ? WHERE player_id = ?")) {
      const row = this.players.get(String(args[1]));
      if (row) row.hp = Number(args[0]);
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
    if (query.startsWith("DELETE FROM room_meta WHERE key = ?")) {
      this.roomMeta.delete(String(args[0]));
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
      if (this.failEventInsert) throw new Error("forced event insert failure");
      this.events.push({
        sequence: Number(args[0]), sender_id: String(args[1]),
        event_type: String(args[2]), payload: String(args[3])
      });
      return this.cursor();
    }

    throw new Error("Unexpected MatchRoom SQL in integration test: " + query + " " + JSON.stringify(args));
  }
}

function nativeMobBundle(hp: number, pos: number = 25): string {
  return JSON.stringify({ mob: {
    __className: RAT_CLASS, id: 7, time: 9, HP: hp, HT: 20, pos, max_lvl: 29, buffs: []
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

function makeNonlethalPoisonFixture() {
  const sql = new MemoryMatchRoomSql();
  const beforeHero = makeHeroBefore();
  const afterHero = JSON.parse(JSON.stringify(beforeHero));
  afterHero.hp = 8;
  afterHero.buff_0 = JSON.stringify({ buff: {
    __className: POISON_CLASS, id: 44, time: 10, left: 8
  }});
  afterHero.buffCooldown_0 = 1;
  const afterCombat = JSON.parse(String(beforeHero.combatBundle));
  afterCombat.HP = 8;
  afterHero.combatBundle = JSON.stringify(afterCombat);

  const mobBefore = nativeMobBundle(20);
  const mobAfter = nativeMobBundle(19);
  const savedMob = {
    mobId: 7, entityId: ENTITY_ID, name: "Rat", pos: 25, hp: 20, ht: 20, shielding: 0,
    state: "Hunting", serializedBundle: mobBefore, buffs: [],
    defenseSkill: 5, baseSpeed: 1, effectiveSpeed: 1, cooldown: 0,
    targetCell: -1, targetType: "NONE", targetEntityId: "", enemySeen: false, alerted: false,
    rewardClassName: RAT_CLASS, rewardEligible: true, rewardExp: 2, rewardMaxLevel: 29,
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
  sql.roomMeta.set("levelPublisher", PLAYER_ID);
  sql.roomMeta.set("heroState:" + PLAYER_ID, JSON.stringify(beforeHero));
  sql.roomMeta.set("levelSnapshot:1", JSON.stringify(levelSnapshot));
  sql.players.set(PLAYER_ID, {
    player_id: PLAYER_ID, pos: 9, hp: 9, ht: 20, state: "ALIVE", deaths: 0
  });
  sql.mobs.set(7, { mob_id: 7, depth: 1, hp: 20, ht: 20, pos: 25 });

  const mobDelta = {
    entityId: ENTITY_ID, actorId: 7,
    hpBefore: 20, htBefore: 20, posBefore: 25, shieldBefore: 0,
    buffsBefore: "[]", serializedBundleBefore: mobBefore,
    hpAfter: 19, htAfter: 20, posAfter: 25, shieldAfter: 0,
    buffsAfter: "[]", serializedBundleAfter: mobAfter
  };
  const tickData = {
    sourceType: "BUFF_TICK", buffClass: POISON_CLASS, buffId: 44,
    actorClockBefore: 9, sequenceBefore: 0,
    heroStateBeforeJson: JSON.stringify(beforeHero),
    secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [mobDelta] })
  };
  const room = makeRoom(sql);
  const ws = { send: vi.fn() };
  const session = { playerId: PLAYER_ID, sessionToken: "session-token" };
  return {
    sql, beforeHero, afterHero, mobBefore, mobAfter, savedMob, levelSnapshot,
    mobDelta, tickData, room, ws, session
  };
}

function makeNonlethalHealingFixture() {
  const sql = new MemoryMatchRoomSql();
  const previousHero = makeHeroBefore();
  const previousCombat = JSON.parse(String(previousHero.combatBundle));
  previousHero.hp = 8;
  previousHero.cooldown = 2;
  previousHero.buffCount = 1;
  previousHero.buff_0 = JSON.stringify({ buff: {
    __className: "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing",
    id: 52, time: 9, left: 22, percent: 0.2, flat: 0, healing_limited: false
  }});
  previousHero.buffCooldown_0 = 1;
  delete previousHero.buff_1;
  delete previousHero.buffCooldown_1;
  previousCombat.HP = 8;
  previousHero.combatBundle = JSON.stringify(previousCombat);

  const beforeHero = JSON.parse(JSON.stringify(previousHero));
  beforeHero.cooldown = 1;
  beforeHero.buffCooldown_0 = 0;

  const afterHero = JSON.parse(JSON.stringify(beforeHero));
  afterHero.hp = 12;
  afterHero.buff_0 = JSON.stringify({ buff: {
    __className: "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing",
    id: 52, time: 10, left: 18, percent: 0.2, flat: 0, healing_limited: false
  }});
  afterHero.buffCooldown_0 = 1;
  const afterCombat = JSON.parse(String(beforeHero.combatBundle));
  afterCombat.HP = 12;
  afterHero.combatBundle = JSON.stringify(afterCombat);

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
    mobs: [], visitedPositions: [], mappedPositions: []
  };
  sql.roomMeta.set("levelPublisher", PLAYER_ID);
  sql.roomMeta.set("heroState:" + PLAYER_ID, JSON.stringify(previousHero));
  sql.roomMeta.set("levelSnapshot:1", JSON.stringify(levelSnapshot));
  sql.players.set(PLAYER_ID, {
    player_id: PLAYER_ID, pos: 9, hp: 8, ht: 20, state: "ALIVE", deaths: 0
  });

  const tickData = {
    sourceType: "BUFF_TICK",
    buffClass: "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing",
    buffId: 52, actorClockBefore: 9, sequenceBefore: 0,
    heroStateBeforeJson: JSON.stringify(beforeHero),
    secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [] })
  };
  const room = makeRoom(sql);
  const ws = { send: vi.fn() };
  const session = { playerId: PLAYER_ID, sessionToken: "session-token" };
  return { sql, previousHero, beforeHero, afterHero, levelSnapshot, tickData, room, ws, session };
}

const ATTACKER_ID = "spirit-arrow-attacker-001";
const PUBLISHER_ID = "spirit-arrow-publisher-001";
const SPIRIT_BOW_CLASS = "com.shatteredpixel.shatteredpixeldungeon.items.weapon.SpiritBow";
const SNIPERS_MARK_CLASS = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.SnipersMark";

function makeSpiritArrowForwardFixture() {
  const sql = new MemoryMatchRoomSql();
  const targetMobBundle = nativeMobBundle(20, 17);
  const targetMob = {
    mobId: 7, entityId: ENTITY_ID, name: "Rat", pos: 17, hp: 20, ht: 20, shielding: 0,
    state: "Hunting", serializedBundle: targetMobBundle, buffs: [],
    defenseSkill: 5, baseSpeed: 1, effectiveSpeed: 1, cooldown: 0,
    targetCell: -1, targetType: "NONE", targetEntityId: "", enemySeen: false, alerted: false
  };
  const bowItemId = "stable-spirit-bow-001";
  const bowBundle = JSON.stringify({ item: {
    __className: SPIRIT_BOW_CLASS, multiplayer_item_id: bowItemId, augment: "DAMAGE"
  }});
  const markBuffId = 77;
  const markBundle = JSON.stringify({ buff: {
    __className: SNIPERS_MARK_CLASS, id: markBuffId, time: 5, object: 42,
    bonus: 0.5, server_entity_id: ENTITY_ID
  }});
  const heroBefore = {
    hp: 20, ht: 20, pos: 9, shielding: 0, cooldown: 1,
    combatBundle: JSON.stringify({ id: 11, time: 10, STR: 10, buffs: [JSON.parse(markBundle).buff] }),
    inventoryBundle: JSON.stringify({ weapon: JSON.parse(bowBundle).item, inventory: [] }),
    inventoryItemsJson: JSON.stringify([{
      itemId: bowItemId, className: SPIRIT_BOW_CLASS, quantity: 1, level: 0,
      cursed: false, cursedKnown: false, stackable: false, equipped: true,
      serializedBundle: bowBundle
    }]),
    buffCount: 1, buff_0: markBundle, buffCooldown_0: 1,
    notesBundle: "{}", questStateBundle: "{}",
    ironKeyCount: 0, crystalKeyCount: 0, wornKeyCount: 0, goldenKeyCount: 0
  };
  const levelSnapshot = {
    schemaVersion: 1, depth: 1, width: 32, height: 32, branch: 0,
    entrancePos: 0, exitPos: 1023, seed: 123456, locked: false, feeling: "NONE",
    levelClass: "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel",
    heroStateJson: JSON.stringify(heroBefore), nativeLevelMetadataBundle: "{}",
    tiles: Array.from({ length: 1024 }, (_, pos) => ({
      pos, terrain: 1, passable: true, solid: false, pit: false, losBlocking: false,
      flammable: false, secret: false, avoid: false, water: false,
      discoverable: false, openSpace: false
    })),
    transitions: [], heaps: [], traps: [], blobs: [], plants: [],
    mobs: [targetMob], visitedPositions: [], mappedPositions: []
  };
  const spiritArrow = {
    formatVersion: 1, markBuffId, markBonus: 0.5,
    targetEntityId: ENTITY_ID, bowItemId
  };
  const attackData = {
    targetType: "MOB", targetId: 42, targetEntityId: ENTITY_ID,
    targetPos: 17, attackerPos: 9,
    attackerStateBefore: JSON.stringify(heroBefore),
    attackWeaponMode: "SPIRIT_ARROW", attackWeaponBundle: bowBundle,
    damageMultiplier: 1, damageBonus: 0, accuracyMultiplier: 1,
    engineRanged: true, spiritArrow
  };
  sql.roomMeta.set("levelPublisher", PUBLISHER_ID);
  sql.roomMeta.set("heroState:" + ATTACKER_ID, JSON.stringify(heroBefore));
  sql.roomMeta.set("levelSnapshot:1", JSON.stringify(levelSnapshot));
  sql.players.set(ATTACKER_ID, {
    player_id: ATTACKER_ID, pos: 9, hp: 20, ht: 20, state: "ALIVE", deaths: 0
  });
  sql.mobs.set(7, { mob_id: 7, depth: 1, hp: 20, ht: 20, pos: 17 });
  const room = makeRoom(sql);
  const attackerSession = { playerId: ATTACKER_ID, sessionToken: "attacker-session" };
  const publisherSession = { playerId: PUBLISHER_ID, sessionToken: "publisher-session" };
  const senderWs = {
    send: vi.fn(),
    deserializeAttachment: () => attackerSession
  };
  const authorityWs = {
    send: vi.fn(),
    deserializeAttachment: () => publisherSession
  };
  room.state.getWebSockets = () => [authorityWs, senderWs];
  return {
    sql, room, attackerSession, publisherSession, senderWs, authorityWs,
    heroBefore, levelSnapshot, bowBundle, spiritArrow, attackData, targetMobBundle
  };
}


const PVP_DEFENDER_ID = "spirit-arrow-pvp-defender-001";

function makePlayerCombatRollbackFixture() {
  const fixture = makeSpiritArrowForwardFixture();
  const { sql, room, heroBefore } = fixture;
  const defenderBefore: Record<string, any> = { ...heroBefore, pos: 10 };
  const defenderAfter = { ...defenderBefore, hp: 15 };
  const attackerBefore = JSON.stringify(heroBefore);
  const defenderBeforeJson = JSON.stringify(defenderBefore);
  const defenderAfterJson = JSON.stringify(defenderAfter);
  const buffRows = Array.from({ length: Number(defenderBefore.buffCount) }, (_, index) => ({
    serializedBundle: defenderBefore["buff_" + index],
    cooldown: defenderBefore["buffCooldown_" + index]
  }));
  const buffsJson = JSON.stringify(buffRows);
  const requestId = "delegated-player-combat-rollback-001";
  const now = Date.now();
  const pending = {
    requestId, attackerId: ATTACKER_ID, authorityId: PVP_DEFENDER_ID,
    targetType: "PLAYER", targetId: PVP_DEFENDER_ID,
    attackerPos: 9, targetPos: 10, targetLockKey: "PLAYER:" + PVP_DEFENDER_ID,
    depth: 1, createdAt: now,
    attackWeaponMode: "EQUIPPED", attackWeaponBundle: fixture.bowBundle,
    damageMultiplier: 1, damageBonus: 0, accuracyMultiplier: 1,
    attackerStateBefore: attackerBefore, attackerStateAfter: attackerBefore,
    targetHeroStateBefore: defenderBeforeJson
  };
  sql.roomMeta.set("levelPublisher", PVP_DEFENDER_ID);
  sql.roomMeta.set("heroState:" + ATTACKER_ID, attackerBefore);
  sql.roomMeta.set("heroState:" + PVP_DEFENDER_ID, defenderBeforeJson);
  sql.roomMeta.set("pendingCombat:" + requestId, JSON.stringify(pending));
  sql.roomMeta.set("pendingCombatAttacker:" + ATTACKER_ID, requestId);
  sql.roomMeta.set("pendingCombatTarget:PLAYER:" + PVP_DEFENDER_ID, requestId);
  sql.players.set(PVP_DEFENDER_ID, {
    player_id: PVP_DEFENDER_ID, pos: 10, hp: 20, ht: 20, state: "ALIVE", deaths: 0
  });
  const attackData = {
    combatRequestId: requestId, attackerId: ATTACKER_ID, attackerPos: 9,
    targetType: "PLAYER", targetId: PVP_DEFENDER_ID,
    targetHpBefore: 20, targetHtBefore: 20, targetHp: 15, targetHt: 20, damage: 5,
    targetPos: 10, targetPosAfter: 10,
    targetShieldBefore: 0, targetShieldAfter: 0,
    targetHeroStateBefore: defenderBeforeJson, targetHeroStateJson: defenderAfterJson,
    targetBuffsBefore: buffsJson, targetBuffs: buffsJson,
    engineResult: true, engineHit: true, engineRanged: true,
    attackKind: "RANGED", engineDistance: 1, engineActionCost: 1,
    combatSchemaVersion: 1, combatDepth: 1,
    secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [] }),
    attackWeaponMode: "EQUIPPED", attackWeaponBundle: fixture.bowBundle,
    damageMultiplier: 1, damageBonus: 0, accuracyMultiplier: 1
  };
  room.hasLineOfSight = vi.fn().mockReturnValue(true);
  room.state.getWebSockets = () => [fixture.authorityWs, fixture.senderWs];
  fixture.authorityWs.deserializeAttachment = () => ({
    playerId: PVP_DEFENDER_ID, sessionToken: "pvp-defender-session"
  });
  return { ...fixture, defenderBefore, defenderAfter, defenderBeforeJson, defenderAfterJson,
    attackerBefore, requestId, attackData, pending };
}

function makeSpiritArrowAuthorityResult(fixture: any, requestId: string, overrides: Record<string, any> = {}) {
  return {
    combatRequestId: requestId, attackerId: ATTACKER_ID, attackerPos: 9,
    targetType: "MOB", targetEntityId: ENTITY_ID, targetPos: 17, targetPosAfter: 17,
    targetHpBefore: 20, targetHtBefore: 20, targetHp: 15, targetHt: 20, damage: 5,
    targetShieldBefore: 0, targetShieldAfter: 0, targetBuffsBefore: "[]", targetBuffs: "[]",
    targetMobBundleAfter: nativeMobBundle(15, 17),
    engineResult: true, engineHit: true, engineRanged: true, attackKind: "RANGED",
    engineDistance: 8, engineActionCost: 1, combatSchemaVersion: 1, combatDepth: 1,
    secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [] }),
    attackWeaponMode: "SPIRIT_ARROW", attackWeaponBundle: fixture.bowBundle,
    damageMultiplier: 1, damageBonus: 0, accuracyMultiplier: 1,
    spiritArrow: fixture.spiritArrow, ...overrides
  };
}

function makeRoom(sql: MemoryMatchRoomSql): any {
  // Exercise the real MatchRoom prototype/handler without invoking the production
  // Durable Object constructor or its level-generation/migration side effects.
  const room = Object.create(MatchRoom.prototype) as any;
  room.sql = sql as any;
  const currentPublisher = sql.roomMeta.get("levelPublisher");
  if (currentPublisher) {
    const term = sql.roomMeta.get("levelPublisherTerm") || "1";
    sql.roomMeta.set("levelPublisherTerm", term);
    sql.roomMeta.set("levelPublisherReadyTerm", term);
  }
  room.currentSequence = 0;
  room.currentDepth = 1;
  room.worldTime = 0;
  room.gameMode = "COOP_DUNGEON";
  room.gameStatus = "PLAYING";
  room.state = {
    id: { toString: () => "lifelink-match-test" },
    getWebSockets: () => [],
    storage: { transactionSync: <T>(callback: () => T) => sql.transactionSync(callback) }
  };
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
  it("forwards the exact trusted SnipersMark SpiritArrow intent to the level publisher", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    expect(hasCompleteNativeLevelSnapshot(fixture.levelSnapshot)).toBe(true);
    const requestId = "spirit-arrow-authority-request-001";

    await fixture.room.webSocketMessage(fixture.senderWs, JSON.stringify(actionMessage(requestId, {
      action: "ATTACK",
      data: fixture.attackData,
      heroStateJson: JSON.stringify(fixture.heroBefore)
    })));

    expect(fixture.authorityWs.send).toHaveBeenCalledTimes(1);
    const forwarded = JSON.parse(String(fixture.authorityWs.send.mock.calls[0][0]));
    expect(forwarded.messageType).toBe("COMBAT_REQUEST");
    expect(forwarded.requestId).toBe(requestId);
    const payload = JSON.parse(String(forwarded.payloadJson));
    expect(payload.attackWeaponMode).toBe("SPIRIT_ARROW");
    expect(payload.attackWeaponBundle).toBe(fixture.bowBundle);
    expect(payload.spiritArrow).toEqual(fixture.spiritArrow);
    expect(payload.targetType).toBe("MOB");
    expect(payload.targetEntityId).toBe(ENTITY_ID);

    const pending = JSON.parse(String(fixture.sql.roomMeta.get("pendingCombat:" + requestId)));
    expect(pending.attackWeaponMode).toBe("SPIRIT_ARROW");
    expect(pending.spiritArrow).toEqual(fixture.spiritArrow);
    expect(pending.attackWeaponBundle).toBe(fixture.bowBundle);
    expect(pending.targetEntityId).toBe(ENTITY_ID);
    expect(pending.authorityId).toBe(PUBLISHER_ID);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 17 });
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.room.currentSequence).toBe(0);
    expect(fixture.senderWs.send).not.toHaveBeenCalled();
  });

  it("commits the publisher's native SpiritArrow result and returns its sequenced event to the requester", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    // Use the real inherited FOV broadcaster so the accepted event is delivered to the
    // requester socket while the publisher socket is excluded as the sender.
    delete fixture.room.broadcastWithFOV;
    const requestId = "spirit-arrow-authority-roundtrip-001";

    await fixture.room.webSocketMessage(fixture.senderWs, JSON.stringify(actionMessage(requestId, {
      action: "ATTACK",
      data: fixture.attackData,
      heroStateJson: JSON.stringify(fixture.heroBefore)
    })));

    expect(fixture.authorityWs.send).toHaveBeenCalledTimes(1);
    const forwarded = JSON.parse(String(fixture.authorityWs.send.mock.calls[0][0]));
    expect(forwarded.messageType).toBe("COMBAT_REQUEST");
    expect(forwarded.requestId).toBe(requestId);

    const afterMobBundle = nativeMobBundle(15, 17);
    const authorityResult = makeSpiritArrowAuthorityResult(fixture, requestId, {
      targetMobBundleAfter: afterMobBundle
    });

    await fixture.room.webSocketMessage(fixture.authorityWs, JSON.stringify(actionMessage(requestId, {
      action: "SYNC_MOB_STATE",
      data: authorityResult,
      heroStateJson: JSON.stringify(fixture.heroBefore)
    })));

    // The publisher receives its own correlated ACTION_ACCEPTED; the requester receives only
    // the sequenced result event. It must not receive a second copy of the publisher's request.
    const publisherMessages = fixture.authorityWs.send.mock.calls
      .map(call => JSON.parse(String(call[0])) as { messageType: string; requestId?: string; sequence?: number; payloadJson?: string });
    expect(publisherMessages.map(message => message.messageType)).toEqual(["COMBAT_REQUEST", "ACTION_ACCEPTED"]);
    const publisherAck = publisherMessages[1];
    expect(publisherAck.messageType, "Publisher authority result rejected: " + String(publisherAck.payloadJson || "")).toBe("ACTION_ACCEPTED");
    expect(publisherAck.requestId).toBe(requestId);
    expect(publisherAck.sequence).toBe(1);

    expect(fixture.senderWs.send).toHaveBeenCalledTimes(1);
    const eventMessage = JSON.parse(String(fixture.senderWs.send.mock.calls[0][0]));
    expect(eventMessage.messageType).toBe("EVENT_BATCH");
    expect(eventMessage.sequence).toBe(1);
    const events = JSON.parse(String(eventMessage.payloadJson));
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("PLAYER_ATTACKED");
    expect(events[0].sequence).toBe(1);
    expect(events[0].action).toMatchObject({
      combatRequestId: requestId,
      attackerId: ATTACKER_ID,
      targetId: ENTITY_ID,
      targetType: "MOB",
      targetPos: 17,
      targetHpBefore: 20,
      targetHp: 15,
      targetHt: 20,
      damage: 5,
      attackKind: "RANGED",
      engineResolved: true
    });
    expect(events[0].action.attackerStateJson).toBeTruthy();

    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 15, ht: 20, pos: 17 });
    const savedLevel = JSON.parse(String(fixture.sql.roomMeta.get("levelSnapshot:1")));
    expect(savedLevel.mobs).toHaveLength(1);
    expect(savedLevel.mobs[0]).toMatchObject({
      mobId: 7, entityId: ENTITY_ID, hp: 15, ht: 20, pos: 17, serializedBundle: afterMobBundle
    });
    expect(fixture.sql.roomMeta.has("pendingCombat:" + requestId)).toBe(false);
    expect(fixture.sql.roomMeta.has("pendingCombatAttacker:" + ATTACKER_ID)).toBe(false);
    expect(fixture.sql.roomMeta.has("pendingCombatTarget:MOB:" + ENTITY_ID)).toBe(false);
    expect(fixture.sql.processedActions.get(requestId)).toMatchObject({
      player_id: ATTACKER_ID, sequence: 1
    });
    expect(fixture.sql.events).toHaveLength(1);
    expect(fixture.sql.events[0]).toMatchObject({
      sequence: 1, sender_id: PUBLISHER_ID, event_type: "PLAYER_ATTACKED"
    });
    expect(fixture.room.currentSequence).toBe(1);
    expect(fixture.room.worldTime).toBe(1);
  });





  it("accepts only lossless publisher rebase snapshots with stable Mob and Hero Actor identities", () => {
    const fixture = makeSpiritArrowForwardFixture();
    const { levelSnapshot, heroBefore } = fixture;
    const ownHero = JSON.parse(JSON.stringify(heroBefore));
    ownHero.combatBundle = JSON.stringify({ id: 11, time: 10, STR: 10, buffs: [] });
    ownHero.buffCount = 0;
    delete ownHero.buff_0;
    delete ownHero.buffCooldown_0;
    const ownJson = JSON.stringify(ownHero);
    const connected = [{ playerId: ATTACKER_ID, heroStateJson: ownJson }];
    const rebase = JSON.parse(JSON.stringify(levelSnapshot));
    rebase.heroStateJson = ownJson;
    rebase.nativeRemoteHeroActorIds = [];
    expect(isValidNativePublisherRebase(levelSnapshot, rebase, ATTACKER_ID, ownJson, connected)).toBe(true);

    const changedMobActor = JSON.parse(JSON.stringify(rebase));
    changedMobActor.mobs[0].mobId += 100;
    expect(isValidNativePublisherRebase(levelSnapshot, changedMobActor, ATTACKER_ID, ownJson, connected)).toBe(false);

    const changedTerrain = JSON.parse(JSON.stringify(rebase));
    changedTerrain.tiles[20].terrain = 4;
    expect(isValidNativePublisherRebase(levelSnapshot, changedTerrain, ATTACKER_ID, ownJson, connected)).toBe(false);

    const changedHero = JSON.parse(JSON.stringify(ownHero));
    changedHero.hp--;
    expect(isValidNativePublisherRebase(levelSnapshot, {
      ...rebase, heroStateJson: JSON.stringify(changedHero)
    }, ATTACKER_ID, ownJson, connected)).toBe(false);
  });

  it("requires the exact Actor IDs of every connected RemoteHero", () => {
    const fixture = makeSpiritArrowForwardFixture();
    const { levelSnapshot, heroBefore } = fixture;
    const ownHero = JSON.parse(JSON.stringify(heroBefore));
    ownHero.combatBundle = JSON.stringify({ id: 11, time: 10, STR: 10, buffs: [] });
    ownHero.buffCount = 0;
    delete ownHero.buff_0;
    delete ownHero.buffCooldown_0;
    const remoteHero = JSON.parse(JSON.stringify(ownHero));
    remoteHero.combatBundle = JSON.stringify({ id: 21, time: 10, STR: 10, buffs: [] });
    remoteHero.buffCount = 1;
    remoteHero.buff_0 = JSON.stringify({ buff: {
      __className: "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison", id: 88, time: 10
    }});
    remoteHero.buffCooldown_0 = 1;
    const ownJson = JSON.stringify(ownHero), remoteJson = JSON.stringify(remoteHero);
    const rebase = JSON.parse(JSON.stringify(levelSnapshot));
    rebase.heroStateJson = ownJson;
    rebase.nativeRemoteHeroActorIds = [21, 88];
    const connected = [
      { playerId: ATTACKER_ID, heroStateJson: ownJson },
      { playerId: "remote-player-identity-002", heroStateJson: remoteJson }
    ];
    expect(isValidNativePublisherRebase(levelSnapshot, rebase, ATTACKER_ID, ownJson, connected)).toBe(true);
    rebase.nativeRemoteHeroActorIds = [21];
    expect(isValidNativePublisherRebase(levelSnapshot, rebase, ATTACKER_ID, ownJson, connected)).toBe(false);

    // A connected player that has not created a Hero yet gets one fresh RemoteHero Actor,
    // but no persisted Buff IDs. Rebase admits exactly one such extra ID, not an arbitrary set.
    rebase.nativeRemoteHeroActorIds = [21, 88, 99];
    expect(isValidNativePublisherRebase(levelSnapshot, rebase, ATTACKER_ID, ownJson, connected, 1)).toBe(true);
    expect(isValidNativePublisherRebase(levelSnapshot, rebase, ATTACKER_ID, ownJson, connected, 0)).toBe(false);
    expect(isValidNativePublisherRebase(levelSnapshot, rebase, ATTACKER_ID, ownJson, connected, 2)).toBe(false);

    // RemoteHero LifeLink.object belongs to another device. This fixture deliberately
    // collides it with the publisher's Mob Actor ID (7); numeric equality is not identity.
    const remoteLinkedHero = JSON.parse(JSON.stringify(remoteHero));
    remoteLinkedHero.buffCount = 2;
    remoteLinkedHero.buff_1 = JSON.stringify({ buff: {
      __className: "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LifeLink", id: 89, time: 10, object: 7
    }});
    remoteLinkedHero.buffCooldown_1 = 1;
    const linkedRemoteJson = JSON.stringify(remoteLinkedHero);
    const linkedRemoteSet = [
      { playerId: ATTACKER_ID, heroStateJson: ownJson },
      { playerId: "remote-player-identity-002", heroStateJson: linkedRemoteJson }
    ];
    rebase.nativeRemoteHeroActorIds = [21, 88, 89];
    expect(isValidNativePublisherRebase(levelSnapshot, rebase, ATTACKER_ID, ownJson, linkedRemoteSet)).toBe(false);
  });



  it("rebinds publisher SnipersMark only when its local Actor and stable Mob identity agree", () => {
    const fixture = makeSpiritArrowForwardFixture();
    const { levelSnapshot, heroBefore } = fixture;
    const markedHero = JSON.parse(JSON.stringify(heroBefore));
    markedHero.combatBundle = JSON.stringify({ id: 11, time: 10, STR: 10, buffs: [] });
    markedHero.buffCount = 1;
    markedHero.buff_0 = JSON.stringify({ buff: {
      __className: "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.SnipersMark",
      id: 51, time: 10, object: 7, bonus: 0.5, server_entity_id: ENTITY_ID
    }});
    markedHero.buffCooldown_0 = 1;
    const markedJson = JSON.stringify(markedHero);
    const connected = [{ playerId: ATTACKER_ID, heroStateJson: markedJson }];
    const rebase = JSON.parse(JSON.stringify(levelSnapshot));
    rebase.heroStateJson = markedJson;
    rebase.nativeRemoteHeroActorIds = [];
    expect(isValidNativePublisherRebase(levelSnapshot, rebase, ATTACKER_ID, markedJson, connected)).toBe(true);

    const forgedEntity = JSON.parse(JSON.stringify(markedHero));
    const forgedBundle = JSON.parse(String(forgedEntity.buff_0));
    forgedBundle.buff.server_entity_id = "another-linked-mob-009";
    forgedEntity.buff_0 = JSON.stringify(forgedBundle);
    const forgedEntityJson = JSON.stringify(forgedEntity);
    expect(isValidNativePublisherRebase(levelSnapshot, {
      ...rebase, heroStateJson: forgedEntityJson
    }, ATTACKER_ID, forgedEntityJson, [{ playerId: ATTACKER_ID, heroStateJson: forgedEntityJson }])).toBe(false);

    const forgedActor = JSON.parse(JSON.stringify(markedHero));
    const forgedActorBundle = JSON.parse(String(forgedActor.buff_0));
    forgedActorBundle.buff.object = 8;
    forgedActor.buff_0 = JSON.stringify(forgedActorBundle);
    const forgedActorJson = JSON.stringify(forgedActor);
    expect(isValidNativePublisherRebase(levelSnapshot, {
      ...rebase, heroStateJson: forgedActorJson
    }, ATTACKER_ID, forgedActorJson, [{ playerId: ATTACKER_ID, heroStateJson: forgedActorJson }])).toBe(false);

    const missingStableId = JSON.parse(JSON.stringify(markedHero));
    const missingBundle = JSON.parse(String(missingStableId.buff_0));
    delete missingBundle.buff.server_entity_id;
    missingStableId.buff_0 = JSON.stringify(missingBundle);
    const missingJson = JSON.stringify(missingStableId);
    expect(isValidNativePublisherRebase(levelSnapshot, {
      ...rebase, heroStateJson: missingJson
    }, ATTACKER_ID, missingJson, [{ playerId: ATTACKER_ID, heroStateJson: missingJson }])).toBe(false);

    // A RemoteHero's object ID belongs to the remote device and cannot be resolved locally.
    const remoteJson = JSON.stringify({ ...markedHero, combatBundle: JSON.stringify({ id: 21, time: 10, STR: 10, buffs: [] }) });
    const remoteRebase = JSON.parse(JSON.stringify(rebase));
    remoteRebase.nativeRemoteHeroActorIds = [21, 51];
    expect(isValidNativePublisherRebase(levelSnapshot, remoteRebase, ATTACKER_ID, markedJson, [
      { playerId: ATTACKER_ID, heroStateJson: markedJson },
      { playerId: "remote-player-identity-002", heroStateJson: remoteJson }
    ])).toBe(false);
  });

  it("blocks native actions until the active publisher generation has committed its rebase", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    fixture.sql.roomMeta.set("levelPublisherTerm", "9");
    fixture.sql.roomMeta.set("levelPublisherReadyTerm", "8");

    await fixture.room.handleActionInTransaction(
      fixture.senderWs,
      actionMessage("publisher-rebase-gate-action-001", { action: "WAIT", data: {} }),
      fixture.attackerSession
    );

    const response = JSON.parse(String(fixture.senderWs.send.mock.calls[0][0]));
    expect(response.messageType).toBe("ERROR");
    expect(response.requestId).toBe("publisher-rebase-gate-action-001");
    expect(JSON.parse(String(response.payloadJson)).error).toBe("PUBLISHER_REBASE_REQUIRED");
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.processedActions.size).toBe(0);
    expect(fixture.room.currentSequence).toBe(0);
  });

  it("rejects a stale publisher rebase generation without opening the action gate", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    fixture.sql.roomMeta.set("levelPublisherTerm", "9");
    fixture.sql.roomMeta.set("levelPublisherReadyTerm", "8");
    const staleRebase = {
      publisherRebase: true,
      publisherRebaseTerm: 8,
      depth: 1
    };

    await fixture.room.webSocketMessage(fixture.authorityWs, JSON.stringify({
      protocolVersion: "1.0.0", messageType: "LEVEL_DATA", requestId: "publisher-rebase-stale-001",
      payloadJson: JSON.stringify(staleRebase)
    }));

    const response = JSON.parse(String(fixture.authorityWs.send.mock.calls[0][0]));
    expect(response.messageType).toBe("ERROR");
    expect(JSON.parse(String(response.payloadJson)).error).toBe("INVALID_PUBLISHER_REBASE_GENERATION");
    expect(fixture.sql.roomMeta.get("levelPublisherReadyTerm")).toBe("8");
  });

  it("hands Level Publisher authority to a connected living player and cancels its pending combat", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    const { sql, room, heroBefore, levelSnapshot } = fixture;
    const oldPublisher = "publisher-z-old-001";
    const nextPublisher = "publisher-a-next-001";
    const attackerId = "publisher-y-attacker-001";
    const requestId = "publisher-handoff-pending-combat-001";
    const heroJson = JSON.stringify(heroBefore);

    sql.roomMeta.set("levelPublisher", oldPublisher);
    sql.roomMeta.set("levelPublisherTerm", "4");
    sql.roomMeta.set("levelSnapshot:1", JSON.stringify(levelSnapshot));
    for (const playerId of [oldPublisher, nextPublisher, attackerId]) {
      sql.roomMeta.set("heroState:" + playerId, heroJson);
      sql.players.set(playerId, {
        player_id: playerId, pos: 9, hp: 20, ht: 20, state: "ALIVE", connected: 1
      });
    }
    sql.roomMeta.set("pendingCombat:" + requestId, JSON.stringify({
      requestId, attackerId, authorityId: oldPublisher, targetType: "MOB",
      targetLockKey: "MOB:" + ENTITY_ID, createdAt: Date.now()
    }));
    sql.roomMeta.set("pendingCombatAttacker:" + attackerId, requestId);
    sql.roomMeta.set("pendingCombatTarget:MOB:" + ENTITY_ID, requestId);
    sql.roomMeta.set("nativeMutationPending:" + oldPublisher, JSON.stringify({
      playerId: oldPublisher, requestId: "old-publisher-mutation-001", actionType: "ATTACK"
    }));

    const closingSocket = {
      deserializeAttachment: () => ({ playerId: oldPublisher, sessionToken: "old-publisher-token" }),
      send: vi.fn()
    };
    const nextPublisherSocket = {
      deserializeAttachment: () => ({ playerId: nextPublisher, sessionToken: "next-publisher-token" }),
      send: vi.fn()
    };
    const attackerSocket = {
      deserializeAttachment: () => ({ playerId: attackerId, sessionToken: "attacker-token" }),
      send: vi.fn()
    };
    room.state.getWebSockets = () => [nextPublisherSocket, attackerSocket];
    room.broadcastCurrentSnapshot = vi.fn();

    await room.webSocketClose(closingSocket, 1006, "publisher disconnected", false);

    expect(sql.players.get(oldPublisher)).toBeDefined();
    expect(sql.players.get(oldPublisher)?.connected).toBe(0);
    expect(sql.roomMeta.get("levelPublisher")).toBe(nextPublisher);
    expect(sql.roomMeta.get("levelPublisherTerm")).toBe("5");
    expect(sql.roomMeta.has("pendingCombat:" + requestId)).toBe(false);
    expect(sql.roomMeta.has("pendingCombatAttacker:" + attackerId)).toBe(false);
    expect(sql.roomMeta.has("pendingCombatTarget:MOB:" + ENTITY_ID)).toBe(false);
    expect(sql.roomMeta.has("nativeMutationPending:" + oldPublisher)).toBe(false);
    expect(room.broadcastCurrentSnapshot).toHaveBeenCalledTimes(1);

    const requesterError = attackerSocket.send.mock.calls
      .map(call => JSON.parse(String(call[0])))
      .find(message => message.messageType === "ERROR" && message.requestId === requestId);
    expect(requesterError).toBeTruthy();
    expect(JSON.parse(String(requesterError.payloadJson)).error).toBe("NATIVE_COMBAT_AUTHORITY_CHANGED");

    const publisherChange = nextPublisherSocket.send.mock.calls
      .map(call => JSON.parse(String(call[0])))
      .find(message => message.messageType === "LEVEL_PUBLISHER_CHANGED");
    expect(publisherChange).toBeTruthy();
    expect(publisherChange.sequence).toBe(room.currentSequence);
    expect(JSON.parse(String(publisherChange.payloadJson))).toMatchObject({
      publisherId: nextPublisher, term: 5, reason: "PUBLISHER_DISCONNECTED"
    });
  });

  it("ignores an old WebSocket close after the same player has reconnected", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    const { sql, room } = fixture;
    const playerId = "replacement-socket-player-001";
    sql.players.set(playerId, {
      player_id: playerId, pos: 9, hp: 20, ht: 20, state: "ALIVE", connected: 1
    });
    const closingSocket = {
      deserializeAttachment: () => ({ playerId, sessionToken: "old-session-token" }),
      send: vi.fn()
    };
    const replacementSocket = {
      deserializeAttachment: () => ({ playerId, sessionToken: "new-session-token" }),
      send: vi.fn()
    };
    const otherSocket = {
      deserializeAttachment: () => ({ playerId: "other-live-player-001", sessionToken: "other-session-token" }),
      send: vi.fn()
    };
    room.state.getWebSockets = () => [replacementSocket, otherSocket];

    await room.webSocketClose(closingSocket, 1006, "late old socket close", false);

    expect(sql.players.get(playerId)?.connected).toBe(1);
    expect(replacementSocket.send).not.toHaveBeenCalled();
    expect(otherSocket.send).not.toHaveBeenCalled();
  });

  it("clears Level Publisher authority when no connected living replacement exists", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    const { sql, room, levelSnapshot } = fixture;
    const oldPublisher = "last-publisher-001";
    sql.roomMeta.set("levelPublisher", oldPublisher);
    sql.roomMeta.set("levelPublisherTerm", "2");
    sql.roomMeta.set("levelSnapshot:1", JSON.stringify(levelSnapshot));
    sql.players.set(oldPublisher, {
      player_id: oldPublisher, pos: 9, hp: 0, ht: 20, state: "DEAD", connected: 1
    });

    const closingSocket = {
      deserializeAttachment: () => ({ playerId: oldPublisher, sessionToken: "last-publisher-token" }),
      send: vi.fn()
    };
    const spectatorSocket = {
      deserializeAttachment: () => ({ playerId: "spectator-001", sessionToken: "spectator-token" }),
      send: vi.fn()
    };
    room.state.getWebSockets = () => [spectatorSocket];
    room.broadcastCurrentSnapshot = vi.fn();

    await room.webSocketClose(closingSocket, 1006, "publisher disconnected", false);

    expect(sql.roomMeta.has("levelPublisher")).toBe(false);
    expect(sql.roomMeta.get("levelPublisherTerm")).toBe("3");
    const publisherChange = spectatorSocket.send.mock.calls
      .map(call => JSON.parse(String(call[0])))
      .find(message => message.messageType === "LEVEL_PUBLISHER_CHANGED");
    expect(publisherChange).toBeTruthy();
    expect(JSON.parse(String(publisherChange.payloadJson))).toMatchObject({
      publisherId: null, term: 3, reason: "PUBLISHER_DISCONNECTED"
    });
  });

  it("rolls back delegated SYNC_PLAYER_COMBAT atomically when event persistence fails", async () => {
    const fixture = makePlayerCombatRollbackFixture();
    const requestId = fixture.requestId;
    fixture.sql.failEventInsert = true;
    const beforeSequence = fixture.room.currentSequence;
    const beforeWorldTime = fixture.room.worldTime;

    await fixture.room.webSocketMessage(fixture.authorityWs, JSON.stringify(actionMessage(requestId, {
      action: "SYNC_PLAYER_COMBAT",
      data: fixture.attackData,
      heroStateJson: fixture.attackerBefore
    })));

    expect(fixture.sql.transactionCalls).toBe(1);
    const authorityMessages = fixture.authorityWs.send.mock.calls.map(call =>
      JSON.parse(String(call[0])) as { messageType: string; requestId?: string; sequence?: number; payloadJson?: string });
    expect(authorityMessages.map(message => message.messageType)).toEqual(["ERROR"]);
    expect(authorityMessages[0].requestId).toBe(requestId);
    expect(authorityMessages[0].sequence).toBe(beforeSequence);
    expect(JSON.parse(String(authorityMessages[0].payloadJson)).error).toBe("forced event insert failure");

    expect(fixture.senderWs.send).toHaveBeenCalledTimes(1);
    const requesterError = JSON.parse(String(fixture.senderWs.send.mock.calls[0][0]));
    expect(requesterError.messageType).toBe("ERROR");
    expect(requesterError.requestId).toBe(requestId);
    expect(requesterError.sequence).toBe(beforeSequence);
    expect(JSON.parse(String(requesterError.payloadJson)).error).toBe("forced event insert failure");

    expect(fixture.sql.players.get(ATTACKER_ID)).toMatchObject({ hp: 20, ht: 20, pos: 9, state: "ALIVE" });
    expect(fixture.sql.players.get(PVP_DEFENDER_ID)).toMatchObject({ hp: 20, ht: 20, pos: 10, state: "ALIVE" });
    expect(fixture.sql.roomMeta.get("heroState:" + ATTACKER_ID)).toBe(fixture.attackerBefore);
    expect(fixture.sql.roomMeta.get("heroState:" + PVP_DEFENDER_ID)).toBe(fixture.defenderBeforeJson);
    expect(fixture.sql.roomMeta.get("pendingCombat:" + requestId)).toBe(JSON.stringify(fixture.pending));
    expect(fixture.sql.roomMeta.get("pendingCombatAttacker:" + ATTACKER_ID)).toBe(requestId);
    expect(fixture.sql.roomMeta.get("pendingCombatTarget:PLAYER:" + PVP_DEFENDER_ID)).toBe(requestId);
    expect(fixture.sql.processedActions.has(requestId)).toBe(false);
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.room.currentSequence).toBe(beforeSequence);
    expect(fixture.room.worldTime).toBe(beforeWorldTime);
  });

  it("resolves a stable Mob entity ID before applying the PvP target FOV gate", () => {
    const fixture = makeSpiritArrowForwardFixture();
    fixture.room.gameMode = "PVP_ARENA";
    delete fixture.room.broadcastWithFOV;
    const lineOfSight = vi.spyOn(fixture.room, "hasLineOfSight").mockReturnValue(true);

    fixture.room.broadcastWithFOV(ATTACKER_ID, "PLAYER_ATTACKED", {
      targetId: ENTITY_ID, targetType: "MOB", targetPos: 17
    }, fixture.authorityWs);

    expect(lineOfSight).toHaveBeenCalledWith(9, 17, 1);
    expect(fixture.senderWs.send).toHaveBeenCalledTimes(1);
    const event = JSON.parse(String(fixture.senderWs.send.mock.calls[0][0]));
    expect(event.messageType).toBe("EVENT_BATCH");
  });

  it("rolls back a publisher SpiritArrow result when the event insert fails and correlates ERROR to both clients", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    const requestId = "spirit-arrow-sql-rollback-001";

    await fixture.room.webSocketMessage(fixture.senderWs, JSON.stringify(actionMessage(requestId, {
      action: "ATTACK", data: fixture.attackData, heroStateJson: JSON.stringify(fixture.heroBefore)
    })));
    expect(JSON.parse(String(fixture.authorityWs.send.mock.calls[0][0])).messageType).toBe("COMBAT_REQUEST");

    fixture.sql.failEventInsert = true;
    const afterMobBundle = nativeMobBundle(15, 17);
    const authorityResult = makeSpiritArrowAuthorityResult(fixture, requestId, {
      targetMobBundleAfter: afterMobBundle
    });
    await fixture.room.webSocketMessage(fixture.authorityWs, JSON.stringify(actionMessage(requestId, {
      action: "SYNC_MOB_STATE", data: authorityResult, heroStateJson: JSON.stringify(fixture.heroBefore)
    })));

    const publisherMessages = fixture.authorityWs.send.mock.calls.map(call =>
      JSON.parse(String(call[0])) as { messageType: string; requestId?: string; sequence?: number; payloadJson?: string });
    expect(publisherMessages.map(message => message.messageType)).toEqual(["COMBAT_REQUEST", "ERROR"]);
    expect(publisherMessages[1].requestId).toBe(requestId);
    expect(publisherMessages[1].sequence).toBe(0);
    expect(JSON.parse(String(publisherMessages[1].payloadJson)).error).toBe("forced event insert failure");

    expect(fixture.senderWs.send).toHaveBeenCalledTimes(1);
    const requesterError = JSON.parse(String(fixture.senderWs.send.mock.calls[0][0]));
    expect(requesterError.messageType).toBe("ERROR");
    expect(requesterError.requestId).toBe(requestId);
    expect(requesterError.sequence).toBe(0);
    expect(JSON.parse(String(requesterError.payloadJson)).error).toBe("forced event insert failure");

    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.processedActions.has(requestId)).toBe(false);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 17 });
    const savedLevel = JSON.parse(String(fixture.sql.roomMeta.get("levelSnapshot:1")));
    expect(savedLevel.mobs[0]).toMatchObject({ hp: 20, ht: 20, pos: 17 });
    expect(fixture.sql.roomMeta.has("pendingCombat:" + requestId)).toBe(true);
    expect(fixture.sql.roomMeta.get("pendingCombatAttacker:" + ATTACKER_ID)).toBe(requestId);
    expect(fixture.sql.roomMeta.get("pendingCombatTarget:MOB:" + ENTITY_ID)).toBe(requestId);
    expect(fixture.room.currentSequence).toBe(0);
    expect(fixture.room.worldTime).toBe(0);
  });

  it("rejects a SpiritArrow publisher result when attackerPos is omitted", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    const requestId = "spirit-arrow-missing-attacker-pos-001";
    await fixture.room.webSocketMessage(fixture.senderWs, JSON.stringify(actionMessage(requestId, {
      action: "ATTACK", data: fixture.attackData, heroStateJson: JSON.stringify(fixture.heroBefore)
    })));
    expect(JSON.parse(String(fixture.authorityWs.send.mock.calls[0][0])).messageType).toBe("COMBAT_REQUEST");
    const result: Record<string, any> = makeSpiritArrowAuthorityResult(fixture, requestId);
    delete result.attackerPos;
    await fixture.room.webSocketMessage(fixture.authorityWs, JSON.stringify(actionMessage(requestId, {
      action: "SYNC_MOB_STATE", data: result, heroStateJson: JSON.stringify(fixture.heroBefore)
    })));
    const response = JSON.parse(String(fixture.authorityWs.send.mock.calls.at(-1)[0]));
    expect(response.messageType).toBe("ERROR");
    expect(response.requestId).toBe(requestId);
    expect(response.sequence).toBe(0);
    expect(JSON.parse(String(response.payloadJson)).error).toBe("INVALID_ACTION");
    expect(fixture.senderWs.send).toHaveBeenCalledTimes(1);
    const requesterError = JSON.parse(String(fixture.senderWs.send.mock.calls[0][0]));
    expect(requesterError.messageType).toBe("ERROR");
    expect(requesterError.requestId).toBe(requestId);
    expect(requesterError.sequence).toBe(0);
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.processedActions.has(requestId)).toBe(false);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 17 });
    expect(fixture.sql.roomMeta.has("pendingCombat:" + requestId)).toBe(false);
    expect(fixture.sql.roomMeta.has("pendingCombatAttacker:" + ATTACKER_ID)).toBe(false);
    expect(fixture.sql.roomMeta.has("pendingCombatTarget:MOB:" + ENTITY_ID)).toBe(false);
    expect(fixture.room.currentSequence).toBe(0);
    expect(fixture.room.worldTime).toBe(0);
  });

  it("rejects a SpiritArrow publisher result when attackerPos does not match trusted player position", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    const requestId = "spirit-arrow-forged-attacker-pos-001";
    await fixture.room.webSocketMessage(fixture.senderWs, JSON.stringify(actionMessage(requestId, {
      action: "ATTACK", data: fixture.attackData, heroStateJson: JSON.stringify(fixture.heroBefore)
    })));
    expect(JSON.parse(String(fixture.authorityWs.send.mock.calls[0][0])).messageType).toBe("COMBAT_REQUEST");
    const result = makeSpiritArrowAuthorityResult(fixture, requestId, { attackerPos: 10 });
    await fixture.room.webSocketMessage(fixture.authorityWs, JSON.stringify(actionMessage(requestId, {
      action: "SYNC_MOB_STATE", data: result, heroStateJson: JSON.stringify(fixture.heroBefore)
    })));
    const response = JSON.parse(String(fixture.authorityWs.send.mock.calls.at(-1)[0]));
    expect(response.messageType).toBe("ERROR");
    expect(response.requestId).toBe(requestId);
    expect(response.sequence).toBe(0);
    expect(JSON.parse(String(response.payloadJson)).error).toBe("INVALID_ACTION");
    expect(fixture.senderWs.send).toHaveBeenCalledTimes(1);
    const requesterError = JSON.parse(String(fixture.senderWs.send.mock.calls[0][0]));
    expect(requesterError.messageType).toBe("ERROR");
    expect(requesterError.requestId).toBe(requestId);
    expect(requesterError.sequence).toBe(0);
    expect(JSON.parse(String(requesterError.payloadJson)).error).toBe("INVALID_ACTION");
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.processedActions.has(requestId)).toBe(false);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 17 });
    expect(fixture.sql.roomMeta.has("pendingCombat:" + requestId)).toBe(false);
    expect(fixture.sql.roomMeta.has("pendingCombatAttacker:" + ATTACKER_ID)).toBe(false);
    expect(fixture.sql.roomMeta.has("pendingCombatTarget:MOB:" + ENTITY_ID)).toBe(false);
    expect(fixture.room.currentSequence).toBe(0);
    expect(fixture.room.worldTime).toBe(0);
  });

  it("rejects SpiritArrow authority requests when the trusted mark points at another Mob", async () => {
    const fixture = makeSpiritArrowForwardFixture();
    const forgedHero = {
      ...fixture.heroBefore,
      buff_0: JSON.stringify({ buff: {
        __className: SNIPERS_MARK_CLASS, id: 77, time: 5, object: 42,
        bonus: 0.5, server_entity_id: "stable-unrelated-mob-0001"
      }})
    };
    fixture.attackData.attackerStateBefore = JSON.stringify(forgedHero);
    const requestId = "spirit-arrow-forged-mark-001";

    await fixture.room.webSocketMessage(fixture.senderWs, JSON.stringify(actionMessage(requestId, {
      action: "ATTACK", data: fixture.attackData,
      heroStateJson: JSON.stringify(fixture.heroBefore)
    })));

    expect(fixture.authorityWs.send).not.toHaveBeenCalled();
    expect(fixture.sql.roomMeta.has("pendingCombat:" + requestId)).toBe(false);
    expect(JSON.parse(String(fixture.senderWs.send.mock.calls[0][0])).messageType).toBe("ERROR");
    expect(JSON.parse(String(JSON.parse(String(fixture.senderWs.send.mock.calls[0][0])).payloadJson)).error)
      .toBe("INVALID_NATIVE_SPIRIT_ARROW_INTENT");
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 17 });
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.room.currentSequence).toBe(0);
  });


  it("rolls back a non-Poison Hero Healing Buff tick when event insertion fails", async () => {
    const fixture = makeNonlethalHealingFixture();
    expect(hasCompleteNativeLevelSnapshot(fixture.levelSnapshot)).toBe(true);
    expect(isValidNativeHeroBuffTick(
      JSON.stringify(fixture.previousHero),
      fixture.tickData.heroStateBeforeJson,
      JSON.stringify(fixture.afterHero),
      fixture.tickData,
      fixture.levelSnapshot,
      [],
      [],
      []
    )).toBe(true);
    fixture.sql.failEventInsert = true;
    const ws = {
      send: vi.fn(),
      deserializeAttachment: () => fixture.session
    };
    const requestId = "hero-healing-buff-atomic-rollback-001";

    await fixture.room.webSocketMessage(ws, JSON.stringify(actionMessage(requestId, {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(fixture.afterHero),
      data: fixture.tickData
    })));

    expect(ws.send).toHaveBeenCalledTimes(1);
    const response = JSON.parse(String(ws.send.mock.calls[0][0]));
    expect(response.messageType).toBe("ERROR");
    expect(response.requestId).toBe(requestId);
    expect(response.sequence).toBe(0);
    expect(JSON.parse(String(response.payloadJson)).error).toBe("forced event insert failure");
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.processedActions.size).toBe(0);
    expect(fixture.sql.players.get(PLAYER_ID)).toMatchObject({ hp: 8, ht: 20, pos: 9, state: "ALIVE" });
    const storedHero = JSON.parse(String(fixture.sql.roomMeta.get("heroState:" + PLAYER_ID)));
    expect(storedHero.hp).toBe(8);
    expect(JSON.parse(String(storedHero.buff_0)).buff).toMatchObject({ time: 9, left: 22 });
    expect(fixture.room.currentSequence).toBe(0);
    expect(fixture.room.worldTime).toBe(0);
  });

  it("commits the publisher's complete LifeLink batch and Hero death in one ACTION transaction", async () => {
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
    const heroDeath = makeHeroAfterDeath(beforeHero);
    const mobDelta = {
      entityId: ENTITY_ID, actorId: 7,
      hpBefore: 1, htBefore: 20, posBefore: 25, shieldBefore: 0,
      buffsBefore: "[]", hpAfter: 0, htAfter: 20, posAfter: 25, shieldAfter: 0,
      buffsAfter: "[]", serializedBundleAfter: mobBundle
    };

    await room.handleAction(ws, actionMessage("lifelink-atomic-death-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(heroDeath.state),
      data: {
        sourceType: "ENVIRONMENT", sourceClass: POISON_CLASS, engineDamageResult: true,
        targetHpBefore: 9, targetHtBefore: 20, targetHp: 0, targetHt: 20,
        targetPosBefore: 9, targetPosAfter: 9,
        targetShieldBefore: 0, targetShieldAfter: 0,
        targetState: "DEAD", damage: 9, effectiveDamage: 9,
        targetBuffsBefore: heroDeath.targetBuffsBefore, targetBuffs: heroDeath.targetBuffs,
        heroStateBeforeJson: JSON.stringify(beforeHero),
        sequenceBefore: 0, actorClockBefore: 9, buffClass: POISON_CLASS, buffId: 44,
        secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [mobDelta], heaps: [] })
      }
    }), session);

    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(ws.send.mock.calls[0][0])).messageType).toBe("ACTION_ACCEPTED");
    expect(sql.events).toHaveLength(1);
    expect(sql.events[0].event_type).toBe("PLAYER_DAMAGED");
    const event = JSON.parse(String(sql.events[0].payload));
    expect(event.nativeLifeLinkDeathEntityIds).toEqual([ENTITY_ID]);
    expect(event.nativeLifeLinkAtomicBatch).toBe(true);
    expect(event.secondaryMobDeltas.deltas).toHaveLength(1);
    expect(sql.mobs.has(7)).toBe(false);
    expect(JSON.parse(String(sql.roomMeta.get("levelSnapshot:1"))).mobs).toHaveLength(0);
    expect(sql.players.get(PLAYER_ID)).toMatchObject({ hp: 0, ht: 20, pos: 9, state: "DEAD", deaths: 1 });
    const storedHero = JSON.parse(String(sql.roomMeta.get("heroState:" + PLAYER_ID)));
    expect(JSON.parse(String(storedHero.combatBundle)).exp).toBe(2);
    expect(storedHero.buffCount).toBe(1);
    expect(sql.rewardClaims).toEqual(new Set(["mob-kill:1:" + ENTITY_ID]));
    expect(sql.rewardClaimInsertAttempts).toBe(1);

    // Replaying either the same request or the same batch under a new request ID cannot
    // commit the linked Mob death or its reward twice.
    const acceptedCount = ws.send.mock.calls.length;
    await room.handleAction(ws, actionMessage("lifelink-atomic-death-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(heroDeath.state),
      data: {
        sourceType: "ENVIRONMENT", sourceClass: POISON_CLASS, engineDamageResult: true,
        targetHpBefore: 9, targetHtBefore: 20, targetHp: 0, targetHt: 20,
        targetPosBefore: 9, targetPosAfter: 9, targetShieldBefore: 0, targetShieldAfter: 0,
        targetState: "DEAD", damage: 9, effectiveDamage: 9,
        targetBuffsBefore: heroDeath.targetBuffsBefore, targetBuffs: heroDeath.targetBuffs,
        heroStateBeforeJson: JSON.stringify(beforeHero),
        sequenceBefore: 0, actorClockBefore: 9, buffClass: POISON_CLASS, buffId: 44,
        secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [mobDelta], heaps: [] })
      }
    }), session);
    expect(JSON.parse(String(ws.send.mock.calls[acceptedCount][0])).messageType).toBe("ACTION_ACCEPTED");

    await room.handleAction(ws, actionMessage("lifelink-atomic-death-002", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(heroDeath.state),
      data: {
        sourceType: "ENVIRONMENT", sourceClass: POISON_CLASS, engineDamageResult: true,
        targetHpBefore: 9, targetHtBefore: 20, targetHp: 0, targetHt: 20,
        targetPosBefore: 9, targetPosAfter: 9, targetShieldBefore: 0, targetShieldAfter: 0,
        targetState: "DEAD", damage: 9, effectiveDamage: 9,
        targetBuffsBefore: heroDeath.targetBuffsBefore, targetBuffs: heroDeath.targetBuffs,
        heroStateBeforeJson: JSON.stringify(beforeHero),
        sequenceBefore: 0, actorClockBefore: 9, buffClass: POISON_CLASS, buffId: 44,
        secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [mobDelta], heaps: [] })
      }
    }), session);
    expect(JSON.parse(String(ws.send.mock.calls.at(-1)[0])).messageType).toBe("ERROR");
    expect(sql.events).toHaveLength(1);
    expect(sql.rewardClaimInsertAttempts).toBe(1);
    expect(sql.players.get(PLAYER_ID)?.deaths).toBe(1);
  });


  it("accepts only exact non-level-up LifeLink XP and rejects updateHT/item/Monk callbacks", () => {
    const fixture = makeNonlethalPoisonFixture();
    const beforeHero = fixture.beforeHero;
    const deadDelta = {
      ...fixture.mobDelta,
      hpAfter: 0,
      serializedBundleAfter: nativeMobBundle(0)
    };
    const acceptedEvents = buildNativeLifeLinkMobDamageEvents(
      { complete: true, deltas: [deadDelta] }, [fixture.savedMob], PLAYER_ID, 0
    );
    expect(acceptedEvents).toHaveLength(1);

    const afterHero = JSON.parse(JSON.stringify(beforeHero));
    afterHero.buffCount = 1;
    afterHero.buff_0 = JSON.stringify({ buff: {
      __className: POISON_CLASS, id: 44, time: 10, left: 8
    }});
    afterHero.buffCooldown_0 = 1;
    delete afterHero.buff_1;
    delete afterHero.buffCooldown_1;
    const validAfterCombat = JSON.parse(String(beforeHero.combatBundle));
    validAfterCombat.exp = 2;
    afterHero.combatBundle = JSON.stringify(validAfterCombat);
    const rewardData = { buffClass: POISON_CLASS, sequenceBefore: 0 };

    const validContract = validateNativeLifeLinkDeathRewardTransition(
      beforeHero, afterHero, rewardData, acceptedEvents, [7], fixture.levelSnapshot
    );
    expect(validContract).toEqual({ allowExperienceChange: true, allowMonkEnergyChange: false });
    expect(isValidNativeHeroBuffTick(
      beforeHero, beforeHero, afterHero,
      { ...rewardData, buffId: 44, actorClockBefore: 9 },
      fixture.levelSnapshot, [ENTITY_ID], acceptedEvents, [7]
    )).toBe(true);

    // Cross the level-one threshold. Hero.updateHT() and item onHeroGainExp callbacks
    // are not a partial reward contract, so the whole LifeLink transition must fail closed.
    const levelUpBefore = JSON.parse(JSON.stringify(beforeHero));
    const levelUpBeforeCombat = JSON.parse(String(levelUpBefore.combatBundle));
    levelUpBeforeCombat.exp = 9;
    levelUpBefore.combatBundle = JSON.stringify(levelUpBeforeCombat);
    const levelUpAfter = JSON.parse(JSON.stringify(afterHero));
    const levelUpAfterCombat = JSON.parse(String(levelUpAfter.combatBundle));
    levelUpAfterCombat.lvl = 2;
    levelUpAfterCombat.exp = 1;
    levelUpAfter.combatBundle = JSON.stringify(levelUpAfterCombat);
    expect(validateNativeLifeLinkDeathRewardTransition(
      levelUpBefore, levelUpAfter, rewardData, acceptedEvents, [7], fixture.levelSnapshot
    )).toBeNull();

    // Even without a level-up, a reward callback that changes inventory/equipment is not
    // included in this bounded XP contract.
    const callbackAfter = JSON.parse(JSON.stringify(afterHero));
    callbackAfter.inventoryBundle = "item-callback-mutated-inventory";
    expect(isValidNativeHeroBuffTick(
      beforeHero, beforeHero, callbackAfter,
      { ...rewardData, buffId: 44, actorClockBefore: 9 },
      fixture.levelSnapshot, [ENTITY_ID], acceptedEvents, [7]
    )).toBe(false);

    // Monk's Unencumbered Spirit multiplier is explicitly outside the base-energy contract.
    const unencumberedBefore = JSON.parse(JSON.stringify(beforeHero));
    const unencumberedCombat = JSON.parse(String(unencumberedBefore.combatBundle));
    unencumberedCombat.subClass = "MONK";
    unencumberedCombat.talents_tier_1.UNENCUMBERED_SPIRIT = 1;
    unencumberedBefore.combatBundle = JSON.stringify(unencumberedCombat);
    const unencumberedAfter = JSON.parse(JSON.stringify(afterHero));
    const unencumberedAfterCombat = JSON.parse(String(unencumberedAfter.combatBundle));
    unencumberedAfterCombat.subClass = "MONK";
    unencumberedAfterCombat.talents_tier_1.UNENCUMBERED_SPIRIT = 1;
    unencumberedAfter.combatBundle = JSON.stringify(unencumberedAfterCombat);
    expect(validateNativeLifeLinkDeathRewardTransition(
      unencumberedBefore, unencumberedAfter, rewardData,
      acceptedEvents, [7], fixture.levelSnapshot
    )).toBeNull();

    // The Monk unarmed-ability tracker changes reward energy/cap semantics and is also
    // rejected until its entire callback lifecycle has a separate authoritative contract.
    const unarmedBefore = JSON.parse(JSON.stringify(beforeHero));
    const unarmedCombat = JSON.parse(String(unarmedBefore.combatBundle));
    unarmedCombat.subClass = "MONK";
    unarmedBefore.combatBundle = JSON.stringify(unarmedCombat);
    unarmedBefore.buffCount = 3;
    unarmedBefore.buff_2 = JSON.stringify({ buff: {
      __className: "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.MonkEnergy$MonkAbility$UnarmedAbilityTracker",
      id: 66, time: 9
    }});
    unarmedBefore.buffCooldown_2 = 0;
    const unarmedAfter = JSON.parse(JSON.stringify(afterHero));
    const unarmedAfterCombat = JSON.parse(String(unarmedAfter.combatBundle));
    unarmedAfterCombat.subClass = "MONK";
    unarmedAfter.combatBundle = JSON.stringify(unarmedAfterCombat);
    unarmedAfter.buffCount = 2;
    unarmedAfter.buff_1 = unarmedBefore.buff_2;
    unarmedAfter.buffCooldown_1 = 0;
    expect(validateNativeLifeLinkDeathRewardTransition(
      unarmedBefore, unarmedAfter, rewardData,
      acceptedEvents, [7], fixture.levelSnapshot
    )).toBeNull();
  });

  it("commits a nonlethal Poison tick and its linked Mob damage as one publisher transaction", async () => {
    const sql = new MemoryMatchRoomSql();
    const beforeHero = makeHeroBefore();
    const previousHero = JSON.parse(JSON.stringify(beforeHero));
    const afterHero = JSON.parse(JSON.stringify(beforeHero));
    afterHero.hp = 8;
    afterHero.buff_0 = JSON.stringify({ buff: {
      __className: POISON_CLASS, id: 44, time: 10, left: 8
    }});
    afterHero.buffCooldown_0 = 1;
    const afterCombat = JSON.parse(String(beforeHero.combatBundle));
    afterCombat.HP = 8;
    afterHero.combatBundle = JSON.stringify(afterCombat);

    const mobBefore = nativeMobBundle(20);
    const mobAfter = nativeMobBundle(19);
    const savedMob = {
      mobId: 7, entityId: ENTITY_ID, name: "Rat", pos: 25, hp: 20, ht: 20, shielding: 0,
      state: "Hunting", serializedBundle: mobBefore, buffs: [],
      defenseSkill: 5, baseSpeed: 1, effectiveSpeed: 1, cooldown: 0,
      targetCell: -1, targetType: "NONE", targetEntityId: "", enemySeen: false, alerted: false,
      rewardClassName: RAT_CLASS, rewardEligible: true, rewardExp: 2, rewardMaxLevel: 29,
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
    sql.roomMeta.set("levelPublisher", PLAYER_ID);
    sql.roomMeta.set("heroState:" + PLAYER_ID, JSON.stringify(previousHero));
    sql.roomMeta.set("levelSnapshot:1", JSON.stringify(levelSnapshot));
    sql.players.set(PLAYER_ID, {
      player_id: PLAYER_ID, pos: 9, hp: 9, ht: 20, state: "ALIVE", deaths: 0
    });
    sql.mobs.set(7, { mob_id: 7, depth: 1, hp: 20, ht: 20, pos: 25 });

    const room = makeRoom(sql);
    const ws = { send: vi.fn() };
    const session = { playerId: PLAYER_ID, sessionToken: "session-token" };
    const mobDelta = {
      entityId: ENTITY_ID, actorId: 7,
      hpBefore: 20, htBefore: 20, posBefore: 25, shieldBefore: 0,
      buffsBefore: "[]", serializedBundleBefore: mobBefore,
      hpAfter: 19, htAfter: 20, posAfter: 25, shieldAfter: 0,
      buffsAfter: "[]", serializedBundleAfter: mobAfter
    };
    expect(hasCompleteNativeLevelSnapshot(levelSnapshot)).toBe(true);
    expect(isValidNativeHeroStateJson(JSON.stringify(afterHero), {
      hp: 8, ht: 20, pos: 9, shielding: 0
    })).toBe(true);
    const tickData = {
      sourceType: "BUFF_TICK", buffClass: POISON_CLASS, buffId: 44,
      actorClockBefore: 9, sequenceBefore: 0,
      heroStateBeforeJson: JSON.stringify(beforeHero),
      secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [mobDelta] })
    };
    const parsedMobPayload = parseAndValidateNativeLifeLinkMobDeltas(
      tickData.secondaryMobDeltas, levelSnapshot.mobs, [ENTITY_ID], 1024, 32);
    expect(parsedMobPayload).not.toBeNull();
    const linkedIds = nativeHeroBuffLifeLinkMobEntityIds(JSON.stringify(beforeHero), levelSnapshot, []);
    expect(linkedIds).toEqual([ENTITY_ID]);
    const mobEvents = buildNativeLifeLinkMobDamageEvents(parsedMobPayload, levelSnapshot.mobs, PLAYER_ID, 0);
    expect(mobEvents).not.toBeNull();
    expect(isValidNativeHeroBuffTick(
      JSON.stringify(previousHero), JSON.stringify(beforeHero), JSON.stringify(afterHero),
      tickData, levelSnapshot, linkedIds, mobEvents, []
    )).toBe(true);

    await room.handleAction(ws, actionMessage("lifelink-poison-buff-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(afterHero),
      data: {
        ...tickData
      }
    }), session);

    const firstResponse = JSON.parse(String(ws.send.mock.calls[0][0]));
    if (firstResponse.messageType !== "ACTION_ACCEPTED") {
      throw new Error("Nonlethal Poison LifeLink response: " + JSON.stringify(firstResponse));
    }
    expect(sql.events).toHaveLength(1);
    expect(sql.events[0].event_type).toBe("HERO_BUFF_TICKED");
    const event = JSON.parse(String(sql.events[0].payload));
    expect(event.nativeLifeLinkAtomicBatch).toBe(true);
    expect(event.secondaryMobDeltas.deltas).toHaveLength(1);
    expect(sql.mobs.get(7)).toMatchObject({ hp: 19, ht: 20, pos: 25 });
    const savedLevel = JSON.parse(String(sql.roomMeta.get("levelSnapshot:1")));
    expect(savedLevel.mobs[0]).toMatchObject({ hp: 19, ht: 20, pos: 25 });
    expect(savedLevel.mobs[0].serializedBundle).toBe(mobAfter);
    expect(sql.players.get(PLAYER_ID)).toMatchObject({ hp: 8, ht: 20, pos: 9, state: "ALIVE" });
    const storedHero = JSON.parse(String(sql.roomMeta.get("heroState:" + PLAYER_ID)));
    expect(storedHero.hp).toBe(8);
    expect(JSON.parse(String(storedHero.buff_0)).buff).toMatchObject({ time: 10, left: 8 });
    expect(sql.rewardClaims.size).toBe(0);
    expect(room.currentSequence).toBe(1);

    // The accepted Hero Buff sequence and new Mob pre-state make the same batch stale,
    // even when the client retries it with a fresh request ID.
    await room.handleAction(ws, actionMessage("lifelink-poison-buff-002", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(afterHero),
      data: {
        sourceType: "BUFF_TICK", buffClass: POISON_CLASS, buffId: 44,
        actorClockBefore: 9, sequenceBefore: 0,
        heroStateBeforeJson: JSON.stringify(beforeHero),
        secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [mobDelta] })
      }
    }), session);

    expect(JSON.parse(String(ws.send.mock.calls.at(-1)[0])).messageType).toBe("ERROR");
    expect(sql.events).toHaveLength(1);
    expect(sql.mobs.get(7)).toMatchObject({ hp: 19, ht: 20, pos: 25 });
    expect(sql.players.get(PLAYER_ID)).toMatchObject({ hp: 8, state: "ALIVE" });
    expect(room.currentSequence).toBe(1);
  });

  it("rejects non-publisher LifeLink Mob mutations without changing either authoritative state", async () => {
    const fixture = makeNonlethalPoisonFixture();
    fixture.sql.roomMeta.set("levelPublisher", "different-level-publisher-002");

    await fixture.room.handleAction(fixture.ws, actionMessage("lifelink-nonpublisher-forged-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(fixture.afterHero),
      data: fixture.tickData
    }), fixture.session);

    const response = JSON.parse(String(fixture.ws.send.mock.calls[0][0]));
    expect(response.messageType).toBe("ERROR");
    expect(JSON.parse(String(response.payloadJson)).error).toBe("BUFF_TICK_MOB_AUTHORITY_REQUIRED");
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    const savedLevel = JSON.parse(String(fixture.sql.roomMeta.get("levelSnapshot:1")));
    expect(savedLevel.mobs[0]).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    expect(savedLevel.mobs[0].serializedBundle).toBe(fixture.mobBefore);
    expect(fixture.sql.players.get(PLAYER_ID)).toMatchObject({ hp: 9, state: "ALIVE", deaths: 0 });
    expect(JSON.parse(String(fixture.sql.roomMeta.get("heroState:" + PLAYER_ID))).hp).toBe(9);
    expect(fixture.sql.rewardClaims.size).toBe(0);
    expect(fixture.room.currentSequence).toBe(0);
  });

  it("rejects a non-publisher LifeLink Poison tick even when its local Mob delta is empty", async () => {
    const fixture = makeNonlethalPoisonFixture();
    fixture.sql.roomMeta.set("levelPublisher", "different-level-publisher-002");
    const tickData = {
      ...fixture.tickData,
      secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [] })
    };

    await fixture.room.handleAction(fixture.ws, actionMessage("lifelink-nonpublisher-empty-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(fixture.afterHero),
      data: tickData
    }), fixture.session);

    const response = JSON.parse(String(fixture.ws.send.mock.calls[0][0]));
    expect(response.messageType).toBe("ERROR");
    expect(JSON.parse(String(response.payloadJson)).error).toBe("BUFF_TICK_MOB_AUTHORITY_REQUIRED");
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    const savedLevel = JSON.parse(String(fixture.sql.roomMeta.get("levelSnapshot:1")));
    expect(savedLevel.mobs[0]).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    expect(savedLevel.mobs[0].serializedBundle).toBe(fixture.mobBefore);
    expect(fixture.sql.players.get(PLAYER_ID)).toMatchObject({ hp: 9, state: "ALIVE", deaths: 0 });
    expect(JSON.parse(String(fixture.sql.roomMeta.get("heroState:" + PLAYER_ID))).hp).toBe(9);
    expect(fixture.sql.rewardClaims.size).toBe(0);
    expect(fixture.room.currentSequence).toBe(0);
  });

  it("rolls back a nonlethal Hero and Mob Poison batch when its final event insert fails", async () => {
    const fixture = makeNonlethalPoisonFixture();
    fixture.sql.failEventInsert = true;

    await expect(fixture.room.handleAction(fixture.ws, actionMessage("lifelink-poison-buff-rollback-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(fixture.afterHero),
      data: fixture.tickData
    }), fixture.session)).rejects.toThrow("forced event insert failure");

    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.processedActions.size).toBe(0);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    const savedLevel = JSON.parse(String(fixture.sql.roomMeta.get("levelSnapshot:1")));
    expect(savedLevel.mobs[0]).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    expect(savedLevel.mobs[0].serializedBundle).toBe(fixture.mobBefore);
    expect(fixture.sql.players.get(PLAYER_ID)).toMatchObject({ hp: 9, state: "ALIVE", deaths: 0 });
    expect(JSON.parse(String(fixture.sql.roomMeta.get("heroState:" + PLAYER_ID))).hp).toBe(9);
    expect(fixture.sql.rewardClaims.size).toBe(0);
    expect(fixture.sql.mobUpdates).toBe(0);
    expect(fixture.room.currentSequence).toBe(0);
    expect(fixture.room.worldTime).toBe(0);
    expect(fixture.ws.send).not.toHaveBeenCalled();
  });

  it("returns a correlated ERROR after rolling back a failed Poison LifeLink transaction", async () => {
    const fixture = makeNonlethalPoisonFixture();
    fixture.sql.failEventInsert = true;
    const requestId = "lifelink-poison-websocket-rollback-001";
    const ws = {
      send: vi.fn(),
      deserializeAttachment: () => fixture.session
    };

    await fixture.room.webSocketMessage(ws, JSON.stringify(actionMessage(requestId, {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(fixture.afterHero),
      data: fixture.tickData
    })));

    expect(ws.send).toHaveBeenCalledTimes(1);
    const response = JSON.parse(String(ws.send.mock.calls[0][0]));
    expect(response.messageType).toBe("ERROR");
    expect(response.requestId).toBe(requestId);
    expect(response.sequence).toBe(0);
    expect(JSON.parse(String(response.payloadJson)).error).toBe("forced event insert failure");
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.processedActions.size).toBe(0);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    const savedLevel = JSON.parse(String(fixture.sql.roomMeta.get("levelSnapshot:1")));
    expect(savedLevel.mobs[0]).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    expect(savedLevel.mobs[0].serializedBundle).toBe(fixture.mobBefore);
    expect(fixture.sql.players.get(PLAYER_ID)).toMatchObject({ hp: 9, state: "ALIVE", deaths: 0 });
    expect(JSON.parse(String(fixture.sql.roomMeta.get("heroState:" + PLAYER_ID))).hp).toBe(9);
    expect(fixture.sql.rewardClaims.size).toBe(0);
    expect(fixture.room.currentSequence).toBe(0);
    expect(fixture.room.worldTime).toBe(0);
  });

  it("does not publish ACTION_ACCEPTED or events when a post-write transactional hook throws", async () => {
    const fixture = makeNonlethalPoisonFixture();
    const broadcast = vi.fn();
    const broadcastWithFOV = vi.fn();
    fixture.room.broadcast = broadcast;
    fixture.room.broadcastWithFOV = broadcastWithFOV;
    fixture.room.checkMatchEndCondition = vi.fn(() => {
      throw new Error("forced post-write match-end failure");
    });
    const ws = {
      send: vi.fn(),
      deserializeAttachment: () => fixture.session
    };
    const requestId = "lifelink-poison-post-write-rollback-001";

    await fixture.room.webSocketMessage(ws, JSON.stringify(actionMessage(requestId, {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(fixture.afterHero),
      data: fixture.tickData
    })));

    expect(ws.send).toHaveBeenCalledTimes(1);
    const response = JSON.parse(String(ws.send.mock.calls[0][0]));
    expect(response.messageType).toBe("ERROR");
    expect(response.requestId).toBe(requestId);
    expect(response.sequence).toBe(0);
    expect(JSON.parse(String(response.payloadJson)).error).toBe("forced post-write match-end failure");

    // No external success/event may escape before the SQL transaction commits.
    expect(broadcast).not.toHaveBeenCalled();
    expect(broadcastWithFOV).not.toHaveBeenCalled();
    expect(fixture.sql.events).toHaveLength(0);
    expect(fixture.sql.processedActions.size).toBe(0);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    const savedLevel = JSON.parse(String(fixture.sql.roomMeta.get("levelSnapshot:1")));
    expect(savedLevel.mobs[0]).toMatchObject({ hp: 20, ht: 20, pos: 25 });
    expect(savedLevel.mobs[0].serializedBundle).toBe(fixture.mobBefore);
    expect(fixture.sql.players.get(PLAYER_ID)).toMatchObject({ hp: 9, state: "ALIVE", deaths: 0 });
    expect(JSON.parse(String(fixture.sql.roomMeta.get("heroState:" + PLAYER_ID))).hp).toBe(9);
    expect(fixture.sql.rewardClaims.size).toBe(0);
    expect(fixture.room.currentSequence).toBe(0);
    expect(fixture.room.worldTime).toBe(0);
    expect(fixture.room.gameStatus).toBe("PLAYING");
  });

  it("flushes accepted ACTION and FOV event only after the Poison transaction commits", async () => {
    const fixture = makeNonlethalPoisonFixture();
    const order: string[] = [];
    fixture.room.broadcastWithFOV = vi.fn(() => { order.push("broadcast"); });
    const ws = {
      send: vi.fn((_message: string) => { order.push("accepted"); }),
      deserializeAttachment: () => fixture.session
    };

    await fixture.room.webSocketMessage(ws, JSON.stringify(actionMessage("lifelink-poison-after-commit-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(fixture.afterHero),
      data: fixture.tickData
    })));

    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(ws.send.mock.calls[0][0])).messageType).toBe("ACTION_ACCEPTED");
    expect(fixture.room.broadcastWithFOV).toHaveBeenCalledTimes(1);
    expect(fixture.room.broadcastWithFOV.mock.calls[0][3]).toBe(ws);
    expect(order).toEqual(["accepted", "broadcast"]);
    expect(fixture.sql.events).toHaveLength(1);
    expect(fixture.sql.mobs.get(7)).toMatchObject({ hp: 19, ht: 20, pos: 25 });
    expect(fixture.sql.players.get(PLAYER_ID)).toMatchObject({ hp: 8, state: "ALIVE" });
    expect(fixture.room.currentSequence).toBe(1);
  });

  it("rejects a LifeLink death batch that adds a heap outside every dead Mob cell", async () => {
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
    const heroDeath = makeHeroAfterDeath(beforeHero);
    const mobDelta = {
      entityId: ENTITY_ID, actorId: 7,
      hpBefore: 1, htBefore: 20, posBefore: 25, shieldBefore: 0,
      buffsBefore: "[]", hpAfter: 0, htAfter: 20, posAfter: 25, shieldAfter: 0,
      buffsAfter: "[]", serializedBundleAfter: mobBundle
    };
    const unrelatedHeap = {
      pos: 100, type: "HEAP", seen: false, haunted: false,
      hidden: false, autoExplored: false, items: []
    };

    await room.handleAction(ws, actionMessage("lifelink-atomic-forged-loot-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(heroDeath.state),
      data: {
        sourceType: "ENVIRONMENT", sourceClass: POISON_CLASS, engineDamageResult: true,
        targetHpBefore: 9, targetHtBefore: 20, targetHp: 0, targetHt: 20,
        targetPosBefore: 9, targetPosAfter: 9,
        targetShieldBefore: 0, targetShieldAfter: 0,
        targetState: "DEAD", damage: 9, effectiveDamage: 9,
        targetBuffsBefore: heroDeath.targetBuffsBefore, targetBuffs: heroDeath.targetBuffs,
        heroStateBeforeJson: JSON.stringify(beforeHero),
        sequenceBefore: 0, actorClockBefore: 9, buffClass: POISON_CLASS, buffId: 44,
        secondaryMobDeltas: JSON.stringify({
          complete: true, deltas: [mobDelta], heaps: [unrelatedHeap]
        })
      }
    }), session);

    expect(JSON.parse(String(ws.send.mock.calls[0][0])).messageType).toBe("ERROR");
    expect(sql.events).toHaveLength(0);
    expect(sql.mobs.get(7)).toMatchObject({ hp: 1, ht: 20, pos: 25 });
    expect(JSON.parse(String(sql.roomMeta.get("levelSnapshot:1"))).mobs).toHaveLength(1);
    expect(JSON.parse(String(sql.roomMeta.get("levelSnapshot:1"))).heaps).toEqual([]);
    expect(sql.players.get(PLAYER_ID)).toMatchObject({ hp: 9, state: "ALIVE", deaths: 0 });
    expect(sql.rewardClaims.size).toBe(0);
  });

  it("rolls back Mob death, Hero death, heaps and reward claims when the final event insert fails", async () => {
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
    const levelSnapshot = {
      depth: 1, width: 32, height: 32, branch: 0, locked: false,
      levelClass: "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel",
      heaps: [], mobs: [savedMob]
    };
    sql.roomMeta.set("levelPublisher", PLAYER_ID);
    sql.roomMeta.set("heroState:" + PLAYER_ID, JSON.stringify(beforeHero));
    sql.roomMeta.set("levelSnapshot:1", JSON.stringify(levelSnapshot));
    sql.players.set(PLAYER_ID, {
      player_id: PLAYER_ID, pos: 9, hp: 9, ht: 20, state: "ALIVE", deaths: 0
    });
    sql.mobs.set(7, { mob_id: 7, depth: 1, hp: 1, ht: 20, pos: 25 });

    const room = makeRoom(sql);
    const ws = { send: vi.fn() };
    const session = { playerId: PLAYER_ID, sessionToken: "session-token" };
    const heroDeath = makeHeroAfterDeath(beforeHero);
    const mobDelta = {
      entityId: ENTITY_ID, actorId: 7,
      hpBefore: 1, htBefore: 20, posBefore: 25, shieldBefore: 0,
      buffsBefore: "[]", hpAfter: 0, htAfter: 20, posAfter: 25, shieldAfter: 0,
      buffsAfter: "[]", serializedBundleAfter: mobBundle
    };
    sql.failEventInsert = true;

    await expect(room.handleAction(ws, actionMessage("lifelink-atomic-death-fail-001", {
      action: "SYNC_HERO_STATE",
      heroStateJson: JSON.stringify(heroDeath.state),
      data: {
        sourceType: "ENVIRONMENT", sourceClass: POISON_CLASS, engineDamageResult: true,
        targetHpBefore: 9, targetHtBefore: 20, targetHp: 0, targetHt: 20,
        targetPosBefore: 9, targetPosAfter: 9,
        targetShieldBefore: 0, targetShieldAfter: 0,
        targetState: "DEAD", damage: 9, effectiveDamage: 9,
        targetBuffsBefore: heroDeath.targetBuffsBefore, targetBuffs: heroDeath.targetBuffs,
        heroStateBeforeJson: JSON.stringify(beforeHero),
        sequenceBefore: 0, actorClockBefore: 9, buffClass: POISON_CLASS, buffId: 44,
        secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [mobDelta], heaps: [] })
      }
    }), session)).rejects.toThrow("forced event insert failure");

    expect(sql.events).toHaveLength(0);
    expect(sql.mobs.get(7)).toMatchObject({ hp: 1, ht: 20, pos: 25 });
    expect(JSON.parse(String(sql.roomMeta.get("levelSnapshot:1"))).mobs).toHaveLength(1);
    expect(sql.players.get(PLAYER_ID)).toMatchObject({ hp: 9, ht: 20, pos: 9, state: "ALIVE", deaths: 0 });
    expect(JSON.parse(String(sql.roomMeta.get("heroState:" + PLAYER_ID))).hp).toBe(9);
    expect(sql.rewardClaims.size).toBe(0);
    expect(sql.rewardClaimInsertAttempts).toBe(0);
    expect(room.currentSequence).toBe(0);
    expect(room.worldTime).toBe(0);
    expect(ws.send).not.toHaveBeenCalled();
  });

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

    expect(JSON.parse(String(ws.send.mock.calls.at(-1)[0])))
      .toMatchObject({ messageType: "ACTION_ACCEPTED" });
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
