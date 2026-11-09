import { parseNativeBundleObject, nativeItemBundleData } from "./abilities";
import { parseNativeQuickslotIndex, nativeEquipmentTalentPoints } from "./equipment";
import { parseNativeInventoryIndex, parseNativeItemEconomyIndex } from "./inventory-claims";
import { itemValueWithout, sameNativeItemValue } from "./inventory-economy";
import { nativeUseItemBuffMap } from "./item-state";

type NativeHeroBuffTickRow = {className:string,id:number,time:number,cooldown:number,bundle:string,data:any};

const NATIVE_LIFE_LINK = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LifeLink";

function nativeHeroBuffTickState(value: unknown): {state:any,clock:number,rows:NativeHeroBuffTickRow[]} | null {
  let state:any;
  try { state = typeof value === "string" ? JSON.parse(value) : value; } catch (_) { return null; }
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const combat = parseNativeBundleObject(state.combatBundle);
  const heroTime = Number(combat?.time), heroCooldown = Number(state.cooldown);
  const clock = heroTime - heroCooldown;
  if (!Number.isFinite(heroTime) || !Number.isFinite(heroCooldown) || heroCooldown < 0
      || heroCooldown > 100000 || !Number.isFinite(clock) || clock < 0) return null;
  if (!Number.isInteger(state.buffCount) || state.buffCount < 0 || state.buffCount > 256) return null;
  const rows: NativeHeroBuffTickRow[] = [];
  const keys = new Set<string>();
  for (let i=0;i<state.buffCount;i++) {
    const bundle = state["buff_"+i], cooldown = Number(state["buffCooldown_"+i]);
    const root = parseNativeBundleObject(bundle), data = root && root.buff;
    const className = String(data?.__className || ""), id = Number(data?.id), time = Number(data?.time);
    // Native Hero Buffs are not all declared in actors.buffs: some are package-nested
    // classes beside their owning items/spells (for example BrokenSeal.WarriorShield,
    // Blocking.BlockBuff and Wand.Charger). Keep those rows parseable and immutable unless
    // the exact ticking class has a dedicated validator below.
    if (typeof bundle !== "string" || bundle.length < 1 || bundle.length > 200000
        || !className.startsWith("com.shatteredpixel.shatteredpixeldungeon.")
        || className.length > 240 || !/^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(className)
        || !Number.isInteger(id) || id < 1 || !Number.isFinite(time)
        || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > 100000
        || Math.abs(cooldown - Math.max(0,time-clock)) > 0.06) return null;
    const key = className+"#"+id;
    if (keys.has(key)) return null;
    keys.add(key);
    rows.push({className,id,time,cooldown,bundle,data});
  }
  return {state,clock,rows};
}

/** Returns the exact publisher-local Actor IDs named by native LifeLink Buffs. */
export function nativeHeroBuffLifeLinkMobActorIds(heroValue: unknown): number[] | null {
  const hero = nativeHeroBuffTickState(heroValue);
  if (!hero) return null;
  const actorIds: number[] = [];
  const seen = new Set<number>();
  for (const row of hero.rows.filter(value=>value.className===NATIVE_LIFE_LINK)) {
    const actorId = Number(row.data?.object);
    if (!Number.isInteger(actorId) || actorId < 1 || actorId > 2147483647 || seen.has(actorId)) return null;
    seen.add(actorId);
    actorIds.push(actorId);
  }
  return actorIds.sort((a,b)=>a-b);
}

/** Resolves LifeLink Actor IDs to stable Mob IDs. A dead Mob can be resolved only from
 * its accepted, same-publisher Poison damage event after the Mob was removed from the snapshot.
 */
export function nativeHeroBuffLifeLinkMobEntityIds(
  heroValue: unknown, levelValue: unknown, acceptedMobDamageEventsValue?: unknown
): string[] | null {
  const actorIds = nativeHeroBuffLifeLinkMobActorIds(heroValue);
  let level:any = levelValue;
  try { if (typeof level === "string") level = JSON.parse(level); } catch (_) { return null; }
  const events = Array.isArray(acceptedMobDamageEventsValue) ? acceptedMobDamageEventsValue : [];
  if (!actorIds || !level || typeof level !== "object" || !Array.isArray(level.mobs)
      || level.mobs.length > 512 || events.length > 512) return null;
  const targets: string[] = [];
  for (const actorId of actorIds) {
    const matches = level.mobs.filter((mob:any)=>Number(mob?.mobId)===actorId);
    let entityId = "";
    if (matches.length === 1) {
      entityId = String(matches[0]?.entityId || "");
    } else if (matches.length === 0) {
      const eventMatches = events.filter((event:any) => {
        if (String(event?.event_type || "") !== "CHAR_DAMAGED") return false;
        let body:any;
        try { body = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload; }
        catch (_) { return false; }
        return Number(body?.nativeActorId) === actorId
          && body?.targetType === "MOB" && body?.sourceType === "ENVIRONMENT"
          && body?.sourceClass === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LifeLink";
      });
      if (eventMatches.length !== 1) return null;
      let body:any;
      try { body = typeof eventMatches[0].payload === "string"
        ? JSON.parse(eventMatches[0].payload) : eventMatches[0].payload; }
      catch (_) { return null; }
      entityId = String(body?.targetId || "");
    } else return null;
    if (!/^[A-Za-z0-9._:-]{8,80}$/.test(entityId) || targets.includes(entityId)) return null;
    targets.push(entityId);
  }
  return targets.sort();
}

function nativeHeroBuffTickRowsByKey(rows: NativeHeroBuffTickRow[]): Map<string,NativeHeroBuffTickRow> {
  return new Map(rows.map(row=>[row.className+"#"+row.id,row]));
}

/** Reads VialOfBlood from the authoritative pre/post Hero inventory snapshot. */
export function nativeVialOfBloodLevel(heroValue: any): number | null {
  const inventory = parseNativeInventoryIndex(heroValue);
  if (!inventory) return null;
  const className = "com.shatteredpixel.shatteredpixeldungeon.items.trinkets.VialOfBlood";
  const rows = inventory.filter((row:any) => String(row.className) === className);
  if (rows.length > 1) return null;
  if (rows.length === 0) return -1;
  const row = rows[0], decoded = nativeItemBundleData(row);
  if (!decoded || row.quantity !== 1 || !Number.isInteger(row.level) || row.level < 0 || row.level > 3
      || String(decoded.item.__className || "") !== className
      || String(decoded.item.multiplayer_item_id || "") !== String(row.itemId)
      || Number(decoded.item.quantity) !== 1 || Number(decoded.item.level) !== Number(row.level)) return null;
  return Number(row.level);
}

function nativeVialOfBloodMaxHealPerTurn(heroValue: any): number | null {
  const level = nativeVialOfBloodLevel(heroValue), ht = Number(heroValue?.ht);
  if (level === null || !Number.isInteger(ht) || ht < 1 || ht > 100000) return null;
  if (level === -1) return ht;
  switch (level) {
    case 0: return 4 + Math.round(Math.fround(0.15 * ht));
    case 1: return 3 + Math.round(Math.fround(0.10 * ht));
    case 2: return 2 + Math.round(Math.fround(0.07 * ht));
    case 3: return 1 + Math.round(Math.fround(0.05 * ht));
    default: return null;
  }
}


const NATIVE_WAND_CHARGER = "com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand$Charger";
const NATIVE_BLOCK_BUFF = "com.shatteredpixel.shatteredpixeldungeon.items.weapon.enchantments.Blocking$BlockBuff";
const NATIVE_WARRIOR_SHIELD = "com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal$WarriorShield";
const NATIVE_BERSERK_BUFF = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Berserk";
const NATIVE_WAND_PREFIX = "com.shatteredpixel.shatteredpixeldungeon.items.wands.";
const NATIVE_RING_OF_ENERGY = "com.shatteredpixel.shatteredpixeldungeon.items.rings.RingOfEnergy";
const NATIVE_ENERGY_BUFF = NATIVE_RING_OF_ENERGY + "$Energy";
const NATIVE_LOCKED_FLOOR = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LockedFloor";
const NATIVE_HOLD_FAST = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.HoldFast";

function scrubNativeWandChargeValue(value: any, itemId: string): number {
  let matches = 0;
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    if (String(node.__className || "").startsWith(NATIVE_WAND_PREFIX)
        && String(node.multiplayer_item_id || "") === itemId) {
      delete node.curCharges;
      delete node.partialCharge;
      matches++;
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(value);
  return matches;
}

/**
 * A Wand nested in MagicalHolster appears in both its own flattened inventory row
 * and each ancestor Bag's serialized Bundle. During a native Charger tick only
 * curCharges/partialCharge may change in those repeated representations.
 */
function nativeWandStableInventoryRows(heroValue: any, itemId: string): any[] | null {
  const rows = parseNativeInventoryIndex(heroValue);
  if (!rows) return null;
  const targets = rows.filter(row => String(row.itemId) === itemId);
  if (targets.length !== 1) return null;
  for (const row of rows) {
    const bundle = parseNativeBundleObject(row.serializedBundle);
    if (!bundle) return null;
    const matches = scrubNativeWandChargeValue(bundle,itemId);
    if (String(row.itemId) === itemId ? matches !== 1 : matches > 1) return null;
    row.serializedBundle = bundle;
  }
  return rows;
}

function nativeHeroBuffTickStableState(stateValue: any, ignoredWandItemId = ""): any | null {
  const state = {...stateValue};
  delete state.hp;
  delete state.shielding;
  delete state.cooldown;
  delete state.buffCount;
  for (const key of Object.keys(state)) if (/^buff_\d+$/.test(key) || /^buffCooldown_\d+$/.test(key)) delete state[key];
  const combat = parseNativeBundleObject(state.combatBundle);
  if (!combat) return null;
  delete combat.buffs;
  if (ignoredWandItemId) scrubNativeWandChargeValue(combat, ignoredWandItemId);
  state.combatBundle = combat;

  if (ignoredWandItemId) {
    const inventoryBundle = parseNativeBundleObject(state.inventoryBundle);
    if (!inventoryBundle || scrubNativeWandChargeValue(inventoryBundle, ignoredWandItemId) !== 1) return null;
    state.inventoryBundle = inventoryBundle;

    const inventoryRows = nativeWandStableInventoryRows(state,ignoredWandItemId);
    if (!inventoryRows) return null;
    state.inventoryItemsJson = inventoryRows;
  }
  return state;
}

function nativeBuffTickRegenerationOn(level: any, rows: NativeHeroBuffTickRow[]): boolean | null {
  // Match Regeneration.regenOn() exactly: only VaultLevel and LockedFloor affect it.
  // Dungeon branch and Level.locked are not consulted by the native method.
  const levelClass = String(level?.levelClass || "");
  if (!levelClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.levels.")) return null;
  if (levelClass === "com.shatteredpixel.shatteredpixeldungeon.levels.VaultLevel"
      || levelClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.levels.VaultLevel$")) return false;
  const locked = rows.filter(row => row.className === NATIVE_LOCKED_FLOOR);
  if (locked.length > 1) return null;
  if (locked.length === 0) return true;
  const left = Number(locked[0].data.left);
  return Number.isFinite(left) ? left >= 1 : null;
}

function nativeWandRingChargeMultiplier(hero: any, inventory: any[], rows: NativeHeroBuffTickRow[]): number | null {
  const magicImmune = rows.some(row => row.className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.MagicImmune");
  if (magicImmune) return 1;
  if (rows.some(row => row.className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Degrade"
      || row.className === "com.shatteredpixel.shatteredpixeldungeon.actors.hero.spells.SpiritForm$SpiritFormBuff")) return null;

  const energyItems = inventory.filter(row => String(row.className) === NATIVE_RING_OF_ENERGY && row.equipped === true);
  const energyBuffs = rows.filter(row => row.className === NATIVE_ENERGY_BUFF);
  if (energyItems.length !== energyBuffs.length || energyItems.length > 2) return null;

  const enhanced = rows.some(row => row.className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.EnhancedRings");
  let bonus = 0;
  for (const ring of energyItems) {
    const decoded = nativeItemBundleData(ring);
    if (!decoded || String(decoded.item.__className || "") !== NATIVE_RING_OF_ENERGY
        || String(decoded.item.multiplayer_item_id || "") !== String(ring.itemId)
        || !Number.isInteger(ring.level) || typeof ring.cursed !== "boolean") return null;
    const buffedLevel = Number(ring.level) + (enhanced ? 1 : 0);
    bonus += ring.cursed ? Math.min(0, buffedLevel - 2) : buffedLevel + 1;
  }
  const multiplier = Math.fround(Math.pow(1.175, bonus));
  const combat = parseNativeBundleObject(hero.combatBundle);
  if (!combat) return null;
  const heroClass = String(combat.class || "");
  const lightReading = heroClass === "CLERIC" ? 0 : nativeEquipmentTalentPoints(combat, "LIGHT_READING");
  if (!Number.isInteger(lightReading) || lightReading < 0 || lightReading > 3) return null;
  if (lightReading === 0) return multiplier;
  const talentFactor = Math.fround(1 + Math.fround(Math.fround(0.2 * lightReading) / 3));
  return Math.fround(multiplier * talentFactor);
}

function nativeWandChargerInventoryDelta(beforeHero: any, afterHero: any, itemId: string): {
  before: any; after: any; beforeItem: any; afterItem: any; inventory: any[];
} | null {
  const beforeInventory = parseNativeInventoryIndex(beforeHero);
  const afterInventory = parseNativeInventoryIndex(afterHero);
  const beforeStableInventory = nativeWandStableInventoryRows(beforeHero,itemId);
  const afterStableInventory = nativeWandStableInventoryRows(afterHero,itemId);
  if (!beforeInventory || !afterInventory || !beforeStableInventory || !afterStableInventory) return null;
  const oldRows = beforeInventory.filter(row => String(row.itemId) === itemId);
  const newRows = afterInventory.filter(row => String(row.itemId) === itemId);
  if (oldRows.length !== 1 || newRows.length !== 1) return null;
  const oldRow = oldRows[0], newRow = newRows[0];
  if (!String(oldRow.className || "").startsWith(NATIVE_WAND_PREFIX)
      || !sameNativeItemValue(itemValueWithout(oldRow, ["serializedBundle"]), itemValueWithout(newRow, ["serializedBundle"]))
      || !sameNativeItemValue(beforeStableInventory.filter(row=>String(row.itemId)!==itemId),
          afterStableInventory.filter(row=>String(row.itemId)!==itemId))) return null;
  const oldBundle = nativeItemBundleData(oldRow), newBundle = nativeItemBundleData(newRow);
  if (!oldBundle || !newBundle
      || String(oldBundle.item.__className || "") !== String(oldRow.className)
      || String(newBundle.item.__className || "") !== String(newRow.className)
      || String(oldBundle.item.multiplayer_item_id || "") !== itemId
      || String(newBundle.item.multiplayer_item_id || "") !== itemId) return null;
  const oldItem = oldBundle.item, newItem = newBundle.item;
  if (!sameNativeItemValue(itemValueWithout(oldBundle.root, ["item"]), itemValueWithout(newBundle.root, ["item"]))
      || !sameNativeItemValue(itemValueWithout(oldItem, ["curCharges", "partialCharge"]),
          itemValueWithout(newItem, ["curCharges", "partialCharge"]))) return null;
  const maxCharges = Number(oldItem.maxCharges), oldCharges = Number(oldItem.curCharges), newCharges = Number(newItem.curCharges);
  const oldPartial = Number(oldItem.partialCharge), newPartial = Number(newItem.partialCharge);
  if (!Number.isInteger(maxCharges) || maxCharges < 1 || maxCharges > 10
      || !Number.isInteger(oldCharges) || oldCharges < 0 || oldCharges > maxCharges
      || !Number.isInteger(newCharges) || newCharges < 0 || newCharges > maxCharges
      || !Number.isFinite(oldPartial) || oldPartial < 0 || oldPartial >= 1
      || !Number.isFinite(newPartial) || newPartial < 0 || newPartial >= 1
      || (oldCharges === maxCharges && oldPartial !== 0)) return null;

  const oldEconomy = parseNativeItemEconomyIndex(beforeHero), newEconomy = parseNativeItemEconomyIndex(afterHero);
  if ((oldEconomy === null) !== (newEconomy === null)
      || (oldEconomy && newEconomy && !sameNativeItemValue(oldEconomy,newEconomy))) return null;
  const oldSlots = parseNativeQuickslotIndex(beforeHero), newSlots = parseNativeQuickslotIndex(afterHero);
  if (!oldSlots || !newSlots || oldSlots.length !== newSlots.length) return null;
  const slotsWithoutWand = (slots:any[]) => slots.filter(row=>String(row.itemId)!==itemId);
  if (!sameNativeItemValue(slotsWithoutWand(oldSlots),slotsWithoutWand(newSlots))) return null;
  const oldWandSlots = oldSlots.filter(row=>String(row.itemId)===itemId);
  const newWandSlots = newSlots.filter(row=>String(row.itemId)===itemId);
  if (oldWandSlots.length !== newWandSlots.length || oldWandSlots.length > 1) return null;
  if (oldWandSlots.length === 1
      && (oldWandSlots[0].slot !== newWandSlots[0].slot
        || String(newWandSlots[0].serializedBundle) !== String(newRow.serializedBundle))) return null;
  return {before:oldRow,after:newRow,beforeItem:oldItem,afterItem:newItem,inventory:beforeInventory};
}

function isValidNativeWandChargerTick(before: any, after: any, source: NativeHeroBuffTickRow,
  result: NativeHeroBuffTickRow | undefined, data: any, level: any): boolean {
  const itemId = String(data?.wandItemId || "");
  const beforeState = before?.state, afterState = after?.state;
  if (!beforeState || !afterState || !Array.isArray(before.rows)
      || !result || itemId.length < 8 || itemId.length > 80
      || String(source.data.multiplayer_wand_item_id || "") !== itemId
      || !Number.isFinite(Number(source.data.multiplayer_scale_factor))
      || !Number.isFinite(Number(source.time)) || source.time > before.clock + 0.06
      || Math.abs(result.time-source.time-1) > 0.1
      || Number(afterState.hp) !== Number(beforeState.hp)
      || Number(afterState.shielding) !== Number(beforeState.shielding)) return false;

  // Charger ownership and its container-dependent scale are native identity fields,
  // not tick output. Only Actor.time is allowed to advance on the resulting Buff.
  const sourceFields={...source.data}, resultFields={...result.data};
  for (const fields of [sourceFields,resultFields]) {
    delete fields.__className;
    delete fields.id;
    delete fields.time;
  }
  if (!result.data || !sameNativeItemValue(sourceFields,resultFields)) return false;

  const delta = nativeWandChargerInventoryDelta(beforeState,afterState,itemId);
  if (!delta) return false;
  const {beforeItem,afterItem,inventory,before:oldRow} = delta;
  const expectedScale = oldRow.containerId && oldRow.containerId !== "BACKPACK"
    && inventory.some(row=>String(row.itemId)===String(oldRow.containerId)
      && String(row.className)==="com.shatteredpixel.shatteredpixeldungeon.items.bags.MagicalHolster")
      ? 0.85 : 0.875;
  const scale = Number(source.data.multiplayer_scale_factor);
  if (Math.abs(scale-expectedScale)>0.0001) return false;

  const currentCharges = Number(beforeItem.curCharges), maxCharges = Number(beforeItem.maxCharges);
  let expectedPartial = Number(beforeItem.partialCharge);
  let expectedCharges = currentCharges;
  const magicImmune = before.rows.some((row: NativeHeroBuffTickRow)=>row.className==="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.MagicImmune");
  if (currentCharges < maxCharges && !magicImmune) {
    const regenerationOn = nativeBuffTickRegenerationOn(level,before.rows);
    if (regenerationOn === null) return false;
    if (regenerationOn) {
      const missing = Math.max(0,maxCharges-currentCharges);
      const turnsToCharge = Math.fround(10 + 40*Math.pow(scale,missing));
      const ringMultiplier = nativeWandRingChargeMultiplier(beforeState,beforeHeroInventory(beforeState),before.rows);
      if (ringMultiplier === null) return false;
      const baseCharge = Math.fround(Math.fround(1/turnsToCharge)*ringMultiplier);
      expectedPartial = Math.fround(expectedPartial+baseCharge);
    }
    for (const recharging of before.rows.filter((row: NativeHeroBuffTickRow)=>row.className==="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Recharging")) {
      if (recharging.cooldown > 0) {
        const remainder = Math.min(1,recharging.cooldown);
        expectedPartial = Math.fround(expectedPartial+Math.fround(0.25*remainder));
      }
    }
  }
  while (expectedPartial >= 1 && expectedCharges < maxCharges) {
    expectedPartial = Math.fround(expectedPartial-1);
    expectedCharges++;
  }
  if (expectedCharges === maxCharges) expectedPartial = 0;
  return Number(afterItem.curCharges)===expectedCharges
    && Math.abs(Number(afterItem.partialCharge)-expectedPartial)<=0.001;
}

function beforeHeroInventory(state: any): any[] {
  return parseNativeInventoryIndex(state) || [];
}

function isValidNativeBlockBuffTick(before: any, after: any, source: NativeHeroBuffTickRow,
  result: NativeHeroBuffTickRow | undefined): {valid:boolean,allowHoldFastRemoval:boolean} {
  if (!before?.state || !after?.state || !Array.isArray(before.rows)) {
    return {valid:false,allowHoldFastRemoval:false};
  }
  const oldData = source.data, nextData = result?.data;
  const left = Number(oldData.left), shielding = Number(oldData.shielding);
  if (!Number.isFinite(left) || left <= 0 || left > 5.01
      || !Number.isInteger(shielding) || shielding < 0 || shielding > 100000
      || source.time > before.clock + 0.06) return {valid:false,allowHoldFastRemoval:false};
  const holdFast = before.rows.filter((row: NativeHeroBuffTickRow)=>row.className===NATIVE_HOLD_FAST);
  if (holdFast.length > 1) return {valid:false,allowHoldFastRemoval:false};
  let factor = 1, allowHoldFastRemoval = false;
  if (holdFast.length === 1) {
    const holdPos = Number(holdFast[0].data.pos), heroPos = Number(before.state.pos);
    if (!Number.isInteger(holdPos)) return {valid:false,allowHoldFastRemoval:false};
    if (holdPos !== heroPos) allowHoldFastRemoval = true;
    else {
      const combat = parseNativeBundleObject(before.state.combatBundle);
      if (!combat) return {valid:false,allowHoldFastRemoval:false};
      const points = nativeEquipmentTalentPoints(combat,"HOLD_FAST");
      factor = points===1 ? 0.5 : points===2 ? 0.25 : points===3 ? 0 : 1;
    }
  }
  const expectedLeft = Math.fround(left-factor);
  const expired = expectedLeft <= 0;
  const hpStable = Number(after.state.hp)===Number(before.state.hp);
  const expectedShield = expired ? Number(before.state.shielding)-shielding : Number(before.state.shielding);
  if (!hpStable || Number(after.state.shielding)!==expectedShield) return {valid:false,allowHoldFastRemoval:false};
  if (expired) {
    if (result) return {valid:false,allowHoldFastRemoval:false};
  } else {
    if (!result || Math.abs(result.time-source.time-1)>0.1
        || Math.abs(Number(nextData.left)-expectedLeft)>0.001
        || Number(nextData.shielding)!==shielding) return {valid:false,allowHoldFastRemoval:false};
    const oldFields={...oldData}, newFields={...nextData};
    for (const fields of [oldFields,newFields]) {
      delete fields.__className; delete fields.id; delete fields.time; delete fields.left;
    }
    if (!sameNativeItemValue(oldFields,newFields)) return {valid:false,allowHoldFastRemoval:false};
  }
  return {valid:true,allowHoldFastRemoval};
}

function isValidNativeWarriorShieldTick(before: any, after: any, source: NativeHeroBuffTickRow,
  result: NativeHeroBuffTickRow | undefined, level: any): boolean {
  const old = source.data, next = result?.data;
  if (!before?.state || !after?.state || !Array.isArray(before.rows)) return false;
  const shielding = Number(old.shielding), cooldown = Number(old.cooldown);
  const turnsSinceEnemies = Number(old.turns_since_enemies), initialShield = Number(old.initial_shield);
  if (shielding !== 0 || !Number.isInteger(cooldown) || cooldown < 2 || cooldown > 100000
      || !Number.isFinite(turnsSinceEnemies) || turnsSinceEnemies < 0 || turnsSinceEnemies > 100000
      || !Number.isInteger(initialShield) || initialShield < 0 || initialShield > 100000
      || source.time > before.clock + 0.06 || !result || Math.abs(result.time-source.time-1)>0.1
      || Number(after.state.hp)!==Number(before.state.hp) || Number(after.state.shielding)!==Number(before.state.shielding)) return false;
  const regenerationOn = nativeBuffTickRegenerationOn(level,before.rows);
  if (regenerationOn === null) return false;
  const expectedCooldown = cooldown-(regenerationOn?1:0);
  if (expectedCooldown <= 0 || Number(next.cooldown)!==expectedCooldown
      || Number(next.turns_since_enemies)!==turnsSinceEnemies
      || Number(next.initial_shield)!==initialShield || Number(next.shielding)!==0) return false;
  const oldFields={...old}, newFields={...next};
  for (const fields of [oldFields,newFields]) {
    delete fields.__className; delete fields.id; delete fields.time; delete fields.cooldown;
  }
  return sameNativeItemValue(oldFields,newFields);
}

function isValidNativeBerserkTick(before: any, after: any, source: NativeHeroBuffTickRow,
  result: NativeHeroBuffTickRow | undefined, level: any): boolean {
  const old = source.data, next = result?.data;
  if (!before?.state || !after?.state || !Array.isArray(before.rows)
      || Number(old.shielding)!==0 || Number(after.state.hp)!==Number(before.state.hp)
      || Number(after.state.shielding)!==Number(before.state.shielding) || source.time>before.clock+0.06) return false;
  const state = String(old.state || "");
  let expectedState = state, expectedPower = Number(old.power);
  let expectedBuffer = Number(old.power_buffer), expectedTurnRecovery = Number(old.turn_recovery);
  let expectedLevelRecovery = Number(old.levelrecovery);
  if (!Number.isFinite(expectedPower) || expectedPower < 0 || expectedPower > 2
      || !Number.isInteger(expectedBuffer) || expectedBuffer < 0 || expectedBuffer > 10
      || !Number.isInteger(expectedTurnRecovery) || expectedTurnRecovery < 0 || expectedTurnRecovery > 1000
      || !Number.isFinite(expectedLevelRecovery) || expectedLevelRecovery < 0 || expectedLevelRecovery > 10) return false;

  if (state === "BERSERK") return false; // Random shield decay can kill and mutate other native state.
  if (state === "NORMAL") {
    if (expectedBuffer > 0) expectedBuffer--;
    else {
      const hp = Number(before.state.hp), ht = Number(before.state.ht);
      if (!Number.isInteger(hp) || !Number.isInteger(ht) || ht < 1) return false;
      const gate = Math.max(0.1,Math.min(expectedPower,1));
      const decayProduct = Math.fround(gate*0.05);
      expectedPower = Math.fround(expectedPower-decayProduct*Math.pow(Math.fround(hp/ht),2));
    }
    if (expectedPower <= 0) return !result;
  } else if (state === "RECOVERING") {
    const regenerationOn = nativeBuffTickRegenerationOn(level,before.rows);
    if (regenerationOn === null) return false;
    if (expectedLevelRecovery === 0 && regenerationOn) {
      expectedTurnRecovery--;
      if (expectedTurnRecovery <= 0) {
        expectedTurnRecovery = 0;
        expectedState = "NORMAL";
      }
    }
  } else return false;

  if (!result || Math.abs(result.time-source.time-1)>0.1
      || String(next.state || "")!==expectedState
      || Math.abs(Number(next.power)-expectedPower)>0.001
      || Number(next.power_buffer)!==expectedBuffer
      || Number(next.turn_recovery)!==expectedTurnRecovery
      || Math.abs(Number(next.levelrecovery)-expectedLevelRecovery)>0.001) return false;
  const oldFields={...old}, newFields={...next};
  for (const fields of [oldFields,newFields]) {
    delete fields.__className; delete fields.id; delete fields.time;
    delete fields.state; delete fields.power; delete fields.power_buffer;
    delete fields.turn_recovery; delete fields.levelrecovery;
  }
  return sameNativeItemValue(oldFields,newFields);
}



function nativeWarriorShieldDamageMax(heroState: any): number | null {
  const combat = parseNativeBundleObject(heroState?.combatBundle);
  if (!combat) return null;
  const heroClass = String(combat.class || "");
  const ironWill = nativeEquipmentTalentPoints(combat,"IRON_WILL");
  if (!Number.isInteger(ironWill) || ironWill < 0 || ironWill > 3) return null;

  // BrokenSeal.WarriorShield.maxShield() uses Iron Will alone for non-Warriors
  // who acquired that talent; in that branch the equipped armor is irrelevant.
  if (heroClass !== "WARRIOR" && ironWill > 0) return ironWill;

  const inventory = parseNativeInventoryIndex(heroState);
  if (!inventory) return null;
  const equippedArmor = inventory.filter((row:any) =>
    row.equipped === true && String(row.containerId || "") === "ARMOR");
  if (equippedArmor.length > 1) return null;
  if (equippedArmor.length === 0) return 0;

  const row = equippedArmor[0];
  const decoded = nativeItemBundleData(row);
  if (!decoded || !String(row.className || "").startsWith(
      "com.shatteredpixel.shatteredpixeldungeon.items.armor.")
      || String(decoded.item.__className || "") !== String(row.className)
      || String(decoded.item.multiplayer_item_id || "") !== String(row.itemId)) return null;

  // Armor.tier is a constructor property, not a serialized Bundle field. These are
  // the exact native SPD constructors; do not infer a tier from a client-supplied number.
  const armorTiers: Record<string,number> = {
    "com.shatteredpixel.shatteredpixeldungeon.items.armor.ClothArmor":1,
    "com.shatteredpixel.shatteredpixeldungeon.items.armor.LeatherArmor":2,
    "com.shatteredpixel.shatteredpixeldungeon.items.armor.MailArmor":3,
    "com.shatteredpixel.shatteredpixeldungeon.items.armor.ScaleArmor":4,
    "com.shatteredpixel.shatteredpixeldungeon.items.armor.PlateArmor":5,
    "com.shatteredpixel.shatteredpixeldungeon.items.armor.ClassArmor":5
  };
  const tier = armorTiers[String(row.className)];
  if (!Number.isInteger(tier)) return null;
  const seal = decoded.item.seal;
  if (seal === undefined || seal === null) return 0;
  if (!seal || typeof seal !== "object" || Array.isArray(seal)
      || String(seal.__className || "") !== "com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal"
      || String(seal.multiplayer_item_id || "").length < 8
      || String(seal.multiplayer_item_id || "").length > 80) return null;
  return 3 + 2*tier + ironWill;
}

/** The native Char.damage() callback may activate WarriorShield before ShieldBuff.processDamage(). */
function isValidNativeWarriorShieldDamageActivation(
  beforeState: any, afterState: any,
  before: NativeHeroBuffTickRow, after: NativeHeroBuffTickRow
): boolean {
  if (!beforeState || !afterState || before.className !== NATIVE_WARRIOR_SHIELD
      || after.className !== NATIVE_WARRIOR_SHIELD || before.id !== after.id
      || Math.abs(before.time-after.time) > 0.06 || Math.abs(before.cooldown-after.cooldown) > 0.06) return false;

  const maxShield = nativeWarriorShieldDamageMax(beforeState);
  const oldShield = Number(before.data.shielding), newShield = Number(after.data.shielding);
  const oldCooldown = Number(before.data.cooldown), newCooldown = Number(after.data.cooldown);
  const oldInitialShield = Number(before.data.initial_shield), newInitialShield = Number(after.data.initial_shield);
  const oldTurnsSinceEnemies = Number(before.data.turns_since_enemies);
  const newTurnsSinceEnemies = Number(after.data.turns_since_enemies);
  if (maxShield === null || !Number.isInteger(maxShield) || maxShield < 0 || maxShield > 100000
      || !Number.isInteger(oldShield) || oldShield < 0 || oldShield > 100000
      || !Number.isInteger(newShield) || newShield < 0 || newShield > oldShield + maxShield
      || !Number.isInteger(oldCooldown) || oldCooldown < -150 || oldCooldown > 0
      || !Number.isInteger(newCooldown) || newCooldown !== Math.max(0,oldCooldown+150)
      || !Number.isInteger(oldInitialShield) || oldInitialShield < 0 || oldInitialShield > 100000
      || newInitialShield !== maxShield
      || !Number.isFinite(oldTurnsSinceEnemies) || oldTurnsSinceEnemies < -100 || oldTurnsSinceEnemies > 100000
      || newTurnsSinceEnemies !== 0) return false;

  const oldFields = {...before.data}, newFields = {...after.data};
  for (const fields of [oldFields,newFields]) {
    delete fields.__className;
    delete fields.id;
    delete fields.time;
    delete fields.shielding;
    delete fields.cooldown;
    delete fields.initial_shield;
    delete fields.turns_since_enemies;
  }
  if (!sameNativeItemValue(oldFields,newFields)) return false;

  const hpBefore = Number(beforeState.hp), hpAfter = Number(afterState.hp);
  const ht = Number(beforeState.ht), shieldBefore = Number(beforeState.shielding);
  const shieldAfter = Number(afterState.shielding);
  if (!Number.isInteger(hpBefore) || !Number.isInteger(hpAfter) || !Number.isInteger(ht) || ht < 1
      || !Number.isInteger(shieldBefore) || shieldBefore < oldShield
      || !Number.isInteger(shieldAfter) || shieldAfter < newShield) return false;

  // Conservation recovers the integer, post-resistance damage passed to
  // ShieldBuff.processDamage(), including damage absorbed by the newly added shield.
  const damage = hpBefore + shieldBefore + maxShield - hpAfter - shieldAfter;
  if (!Number.isInteger(damage) || damage <= 0 || damage > 100000
      || newShield !== Math.max(0,oldShield+maxShield-damage)
      // WarriorShield has native shield priority 2. Any other shield that also absorbs
      // this hit changes its own row and is rejected by the outer immutable-buff check.
      || shieldBefore-oldShield !== shieldAfter-newShield) return false;
  const halfHp = Math.floor(ht/2);
  return hpBefore <= halfHp || hpBefore + shieldBefore - damage <= halfHp;
}

function isValidNativeDamageRecoveryBuffTransition(
  before: NativeHeroBuffTickRow,
  after: NativeHeroBuffTickRow | undefined
): boolean {
  const charm = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Charm";
  const terror = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Terror";
  const dread = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Dread";
  if (before.className === charm || before.className === terror) {
    // Char.damage() calls Charm/Terror.recover(), which spends exactly -5 turns and
    // detaches the effect when its remaining cooldown reaches zero.
    if (before.cooldown > 0 && before.cooldown <= 0.06) return false;
    if (before.cooldown <= 5.0) return after === undefined;
    if (before.cooldown < 5.06 || !after) return false;
    const expectedTime = before.time - 5;
    const expectedCooldown = before.cooldown - 5;
    const oldFields = {...before.data}, newFields = {...after.data};
    for (const fields of [oldFields,newFields]) {
      delete fields.__className;
      delete fields.id;
      delete fields.time;
    }
    return after.className === before.className && after.id === before.id
      && Math.abs(after.time-expectedTime) <= 0.06
      && Math.abs(after.cooldown-expectedCooldown) <= 0.06
      && sameNativeItemValue(oldFields,newFields);
  }
  if (before.className === dread) {
    // Dread.recover() shortens its integer left counter by five without changing Actor.time.
    const left = Number(before.data.left), object = Number(before.data.object);
    if (!Number.isInteger(left) || left < 1 || left > 100000
        || !Number.isInteger(object) || object < 0) return false;
    const expectedLeft = left - 5;
    if (expectedLeft <= 0) return after === undefined;
    if (!after) return false;
    const oldFields = {...before.data}, newFields = {...after.data};
    for (const fields of [oldFields,newFields]) {
      delete fields.__className;
      delete fields.id;
      delete fields.left;
    }
    return after.className === before.className && after.id === before.id
      && Math.abs(after.time-before.time) <= 0.06
      && Math.abs(after.cooldown-before.cooldown) <= 0.06
      && Number(after.data.left) === expectedLeft
      && Number(after.data.object) === object
      && sameNativeItemValue(oldFields,newFields);
  }
  return false;
}

/** A single native Hero Buff.act() may update only its own trusted actor and its bounded native effect. */
export function isValidNativeHeroBuffTick(previousValue: unknown, beforeValue: unknown,
  afterValue: unknown, dataValue: unknown, levelValue?: unknown,
  lifeLinkMobEntityIdsValue?: unknown, acceptedMobDamageEventsValue?: unknown,
  deadLifeLinkMobActorIdsValue?: unknown): boolean {
  const previous = nativeHeroBuffTickState(previousValue);
  const before = nativeHeroBuffTickState(beforeValue);
  const after = nativeHeroBuffTickState(afterValue);
  const data:any = dataValue;
  const level:any = levelValue;
  if (!previous || !before || !after || !data || typeof data !== "object"
      || typeof data.buffClass !== "string" || !Number.isInteger(data.buffId) || data.buffId < 0
      || !Number.isFinite(data.actorClockBefore)
      || Math.abs(Number(data.actorClockBefore)-before.clock) > 0.06
      || Math.abs(before.clock-previous.clock) > 10000
      || Math.abs(after.clock-before.clock) > 0.06
      || !sameNativeItemValue(nativeHeroBuffTickStableState(previous.state),nativeHeroBuffTickStableState(before.state))
      || !sameNativeItemValue(
          nativeHeroBuffTickStableState(before.state, data.buffClass===NATIVE_WAND_CHARGER ? String(data.wandItemId || "") : ""),
          nativeHeroBuffTickStableState(after.state, data.buffClass===NATIVE_WAND_CHARGER ? String(data.wandItemId || "") : ""))
      || Number(previous.state.hp) !== Number(before.state.hp)
      || Number(previous.state.ht) !== Number(before.state.ht)
      || Number(previous.state.pos) !== Number(before.state.pos)
      || Number(previous.state.shielding) !== Number(before.state.shielding)
      || Number(before.state.ht) < 1 || !Number.isInteger(before.state.hp)
      || before.state.hp <= 0 || before.state.hp > before.state.ht
      || !Number.isInteger(after.state.hp) || after.state.hp <= 0 || after.state.hp > after.state.ht
      || Number(after.state.ht) !== Number(before.state.ht) || Number(after.state.pos) !== Number(before.state.pos)
      || !Number.isInteger(after.state.shielding) || after.state.shielding < 0 || after.state.shielding > 100000
      || previous.state.gold !== before.state.gold || previous.state.alchemyEnergy !== before.state.alchemyEnergy
      || before.state.gold !== after.state.gold || before.state.alchemyEnergy !== after.state.alchemyEnergy
      || (data.buffClass!==NATIVE_WAND_CHARGER && (before.state.inventoryBundle !== after.state.inventoryBundle
        || before.state.inventoryItemsJson !== after.state.inventoryItemsJson
        || before.state.quickslotsJson !== after.state.quickslotsJson))
      || before.state.ankhCount !== after.state.ankhCount
      || before.state.blessedAnkhCount !== after.state.blessedAnkhCount) return false;

  // Between native actor turns the scheduler clock may advance, but serialized native
  // Buff bundles remain identical until that Buff itself acts. Only already-expired simple
  // flavour timers may disappear before the current tick.
  const oldRows = nativeHeroBuffTickRowsByKey(previous.rows), preRows = nativeHeroBuffTickRowsByKey(before.rows);
  const afterRows = nativeHeroBuffTickRowsByKey(after.rows);
  const expirable = new Set([
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Chill",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Cripple",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Slow",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Speed",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Weakness",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Recharging",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Adrenaline",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bless",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Daze",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.FrostImbue",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Foresight",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invulnerability",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Charm",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Terror",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Stamina",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Vertigo",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.BlobImmunity",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.HeroDisguise",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hex",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Sleep",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Vulnerable"
  ]);
  for (const [key,row] of oldRows) {
    const current = preRows.get(key);
    if (!current) {
      if (!expirable.has(row.className) || row.time > before.clock + 0.06) return false;
      continue;
    }
    if (row.bundle !== current.bundle) return false;
  }
  for (const [key] of preRows) if (!oldRows.has(key)) return false;

  const buffClass = data.buffClass, buffId = Number(data.buffId), key = buffClass+"#"+buffId;
  const source = preRows.get(key), prior = oldRows.get(key), result = afterRows.get(key);
  const hpBefore = Number(before.state.hp), hpAfter = Number(after.state.hp);
  const ht = Number(before.state.ht);
  const shieldBefore = Number(before.state.shielding), shieldAfter = Number(after.state.shielding);
  const damageTickClass = new Set([
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison"
  ]);
  const damageSideEffectRemovals = new Set([
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Frost",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.MagicalSleep"
  ]);
  // A LifeLink row is removed by the native Char.damage() callback only when its linked
  // target died. The caller supplies these Actor IDs only from already-validated Mob death
  // evidence; corroborate them against the same accepted LifeLink damage event window here.
  const nativePoisonClass = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison";
  const nativeLifeLinkDeathActors = new Set<number>();
  const nativeDetachedLifeLinkActors = new Set<number>();
  const linkedLifeLinkActors = new Set(before.rows
    .filter(row=>row.className===NATIVE_LIFE_LINK)
    .map(row=>Number(row.data?.object)));
  const sequenceBaseline = Number(data.sequenceBefore);
  const provedDeathActors = new Set<number>();
  if (buffClass===nativePoisonClass && Array.isArray(acceptedMobDamageEventsValue)
      && acceptedMobDamageEventsValue.length<=512 && Number.isSafeInteger(sequenceBaseline)
      && sequenceBaseline>=0) {
    for (const event of acceptedMobDamageEventsValue) {
      if (String(event?.event_type || "")!=="CHAR_DAMAGED"
          || !Number.isSafeInteger(Number(event?.sequence))
          || Number(event.sequence)<=sequenceBaseline) continue;
      let body:any;
      try { body=typeof event.payload==="string"?JSON.parse(event.payload):event.payload; }
      catch (_) { continue; }
      const actorId=Number(body?.nativeActorId);
      if (body?.sourceType==="ENVIRONMENT"
          && body?.sourceClass===NATIVE_LIFE_LINK
          && body?.targetType==="MOB"
          && Number(body?.targetHp)===0
          && Number.isInteger(actorId) && actorId>0) provedDeathActors.add(actorId);
    }
  }
  if (buffClass===nativePoisonClass && deadLifeLinkMobActorIdsValue !== undefined) {
    if (!Array.isArray(deadLifeLinkMobActorIdsValue) || deadLifeLinkMobActorIdsValue.length>512) return false;
    for (const value of deadLifeLinkMobActorIdsValue) {
      const actorId=Number(value);
      if (!Number.isInteger(actorId) || actorId<1 || nativeLifeLinkDeathActors.has(actorId)
          || !linkedLifeLinkActors.has(actorId) || !provedDeathActors.has(actorId)) return false;
      nativeLifeLinkDeathActors.add(actorId);
    }
  } else if (deadLifeLinkMobActorIdsValue !== undefined
      && (!Array.isArray(deadLifeLinkMobActorIdsValue) || deadLifeLinkMobActorIdsValue.length>0)) {
    return false;
  }
  const beforeOtherRows = new Map(before.rows
    .filter(row=>row.className+"#"+row.id!==key)
    .map(row=>[row.className+"#"+row.id,row]));
  const afterOtherRows = new Map(after.rows
    .filter(row=>row.className+"#"+row.id!==key)
    .map(row=>[row.className+"#"+row.id,row]));
  const warriorShieldRows = Array.from(beforeOtherRows.values())
    .filter(row=>row.className===NATIVE_WARRIOR_SHIELD);
  const warriorShieldBefore = warriorShieldRows.length===1 ? warriorShieldRows[0] : undefined;
  const warriorShieldAfter = warriorShieldBefore
    ? afterOtherRows.get(warriorShieldBefore.className+"#"+warriorShieldBefore.id) : undefined;
  const nativeWarriorShieldActivation = buffClass==="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison"
    && !!warriorShieldBefore && !!warriorShieldAfter
    && (warriorShieldBefore.bundle!==warriorShieldAfter.bundle
      || warriorShieldBefore.cooldown!==warriorShieldAfter.cooldown)
    && isValidNativeWarriorShieldDamageActivation(before.state,after.state,
      warriorShieldBefore,warriorShieldAfter);
  const allowDamageSideEffectRemoval = damageTickClass.has(buffClass)
    && (hpAfter < hpBefore || shieldAfter < shieldBefore || nativeWarriorShieldActivation);
  if (!source || !prior || source.bundle !== prior.bundle
      || (buffClass!==NATIVE_WAND_CHARGER && before.state.inventoryBundle !== after.state.inventoryBundle)) return false;
  // Char.damage() natively recovers Terror/Dread/Charm and removes Frost/MagicalSleep
  // before resolving resistance and shields. Admit only their exact callback transitions
  // during a damage-producing Hunger/Poison tick; all other effects stay immutable.
  const drowsyTick = buffClass === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Drowsy";
  const magicalSleepClass = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.MagicalSleep";
  for (const [otherKey,row] of beforeOtherRows) {
    const next = afterOtherRows.get(otherKey);
    if (next) {
      if (row.bundle !== next.bundle || row.cooldown !== next.cooldown) {
        if (row.className===NATIVE_WARRIOR_SHIELD && nativeWarriorShieldActivation) continue;
        if (!allowDamageSideEffectRemoval
            || !isValidNativeDamageRecoveryBuffTransition(row,next)) return false;
      }
    } else if (buffClass===NATIVE_BLOCK_BUFF && row.className===NATIVE_HOLD_FAST
        && Number(row.data.pos)!==Number(before.state.pos)) {
      continue;
    } else if (buffClass===nativePoisonClass && row.className===NATIVE_LIFE_LINK) {
      const actorId=Number(row.data?.object);
      if (!nativeLifeLinkDeathActors.has(actorId) || nativeDetachedLifeLinkActors.has(actorId)) return false;
      nativeDetachedLifeLinkActors.add(actorId);
      continue;
    } else if (allowDamageSideEffectRemoval
        && isValidNativeDamageRecoveryBuffTransition(row,undefined)) {
      continue;
    } else if (!allowDamageSideEffectRemoval || !damageSideEffectRemovals.has(row.className)) {
      return false;
    }
  }
  if (nativeDetachedLifeLinkActors.size!==nativeLifeLinkDeathActors.size
      || Array.from(nativeLifeLinkDeathActors).some(actorId=>!nativeDetachedLifeLinkActors.has(actorId))) return false;
  for (const [otherKey,row] of afterOtherRows) {
    if (!beforeOtherRows.has(otherKey) && (!drowsyTick || row.className !== magicalSleepClass)) return false;
  }

  // Poison may invoke Char.damage() on LifeLink targets. The caller must supply
  // exactly the Mob identities resolved from this trusted Hero pre-state and level snapshot.
  const poisonLifeLinks = buffClass === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison"
    ? before.rows.filter(row=>row.className===NATIVE_LIFE_LINK) : [];
  if (poisonLifeLinks.length > 0) {
    const resolvedLifeLinkMobEntityIds = nativeHeroBuffLifeLinkMobEntityIds(
      beforeValue,levelValue,acceptedMobDamageEventsValue);
    if (!Array.isArray(lifeLinkMobEntityIdsValue) || resolvedLifeLinkMobEntityIds === null
        || !sameNativeItemValue(lifeLinkMobEntityIdsValue,resolvedLifeLinkMobEntityIds)) return false;
  }
  if (buffClass===NATIVE_WAND_CHARGER) {
    return isValidNativeWandChargerTick(before,after,source,result,data,level);
  }
  if (buffClass===NATIVE_BLOCK_BUFF) {
    const validation = isValidNativeBlockBuffTick(before,after,source,result);
    if (!validation.valid) return false;
    if (validation.allowHoldFastRemoval) {
      const holdFastBefore = before.rows.filter(row=>row.className===NATIVE_HOLD_FAST);
      const holdFastAfter = after.rows.filter(row=>row.className===NATIVE_HOLD_FAST);
      if (holdFastBefore.length!==1 || holdFastAfter.length!==0
          || Number(holdFastBefore[0].data.pos)===Number(before.state.pos)) return false;
    }
    return true;
  }
  if (buffClass===NATIVE_WARRIOR_SHIELD) {
    return isValidNativeWarriorShieldTick(before,after,source,result,level);
  }
  if (buffClass===NATIVE_BERSERK_BUFF) {
    return isValidNativeBerserkTick(before,after,source,result,level);
  }
  if (drowsyTick) {
    const sourceDue = source.time <= before.clock + 0.06;
    const existingMagicalSleep = beforeOtherRows.size > 0
      && Array.from(beforeOtherRows.values()).some(row=>row.className === magicalSleepClass);
    if (result || !sourceDue || existingMagicalSleep
        || hpAfter !== hpBefore || shieldAfter !== shieldBefore) return false;
    const additions = Array.from(afterOtherRows.entries())
      .filter(([otherKey])=>!beforeOtherRows.has(otherKey))
      .map(([,row])=>row);
    if (hpBefore < ht) {
      if (additions.length !== 1) return false;
      const sleep = additions[0], sleepData = sleep.data;
      const sleepKeys = Object.keys(sleepData).sort();
      if (sleep.className !== magicalSleepClass
          || sleepKeys.join(",") !== "__className,id,time"
          || !Number.isInteger(sleep.id) || sleep.id < 0
          || !Number.isFinite(Number(sleepData.time))
          || Math.abs(Number(sleepData.time) - before.clock) > 0.06
          || !Number.isFinite(Number(sleep.cooldown)) || Math.abs(Number(sleep.cooldown)) > 0.06) return false;
      return true;
    }
    // MagicalSleep.attachTo() immediately detaches itself when a Hero is already at full HP.
    return hpBefore === ht && additions.length === 0;
  }
  const simpleExpiry = new Set([
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Chill",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Cripple",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Slow",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Speed",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Weakness",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Recharging",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Adrenaline",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bless",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Daze",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.FrostImbue",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invulnerability",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Foresight",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Charm",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Terror",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Stamina",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Vertigo",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.BlobImmunity",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.HeroDisguise",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hex",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Sleep",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Vulnerable"
  ]);
  if (simpleExpiry.has(buffClass)) {
    return !result && source.time <= before.clock + 0.06
      && Number(after.state.hp) === Number(before.state.hp)
      && Number(after.state.shielding) === Number(before.state.shielding);
  }
  if (![
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.WellFed",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Dread"
  ].includes(buffClass)) return false;
  const oldData = source.data, newData = result?.data;
  const className = buffClass;
  const timeDelta = result ? result.time-source.time : null;
  const isSameTimeTick = (min:number,max:number) => result != null && timeDelta! >= min && timeDelta! <= max;
  if (buffClass === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Dread") {
    const left = Number(oldData.left), object = Number(oldData.object);
    if (!Number.isInteger(left) || left < 1 || left > 100000
        || !Number.isInteger(object) || object < 0
        || !Number.isFinite(Number(source.time)) || source.time > before.clock + 0.06
        || hpAfter !== hpBefore || shieldAfter !== shieldBefore) return false;
    if (left === 1) return !result;
    if (!result || !isSameTimeTick(0.9,1.1)
        || Number(newData.left) !== left-1 || Number(newData.object) !== object) return false;
    const oldFields={...oldData}, newFields={...newData};
    for (const fields of [oldFields,newFields]) {
      delete fields.__className;
      delete fields.id;
      delete fields.time;
      delete fields.left;
    }
    return sameNativeItemValue(oldFields,newFields);
  }
  const hasWellFed = before.rows.some(row=>row.className==="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.WellFed");
  const near = (a:number,b:number,tolerance=0.03) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)<=tolerance;

  if (className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.WellFed") {
    const left = Number(oldData.left);
    if (!Number.isInteger(left) || left < 0 || left > 450) return false;
    if (left === 0) {
      return !result && shieldAfter === shieldBefore && hpAfter === hpBefore;
    }
    const expectedLeft = left-1;
    if (!result || Number(newData.left)!==expectedLeft || !isSameTimeTick(0.2,3)
        || shieldAfter !== shieldBefore) return false;
    const expectedHeal = expectedLeft%18===0 && hpBefore<ht ? 1 : 0;
    return hpAfter === Math.min(ht,hpBefore+expectedHeal);
  }

  if (className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger") {
    if (!result || !isSameTimeTick(0.9,1.1)
        || !Number.isFinite(Number(oldData.level)) || !Number.isFinite(Number(newData.level))
        || !Number.isFinite(Number(oldData.partialDamage)) || !Number.isFinite(Number(newData.partialDamage))
        || Number(oldData.level)<0 || Number(oldData.level)>450
        || Number(newData.level)<0 || Number(newData.level)>450
        || Number(oldData.partialDamage)<0 || Number(oldData.partialDamage)>1.5
        || Number(newData.partialDamage)<0 || Number(newData.partialDamage)>1.5) return false;
    if (hasWellFed || level?.locked === true) return Number(newData.level)===Number(oldData.level)
      && Number(newData.partialDamage)===Number(oldData.partialDamage)
      && hpAfter===hpBefore && shieldAfter===shieldBefore;
    if (Number(oldData.level)<450) {
      const expectedLevel = Math.min(450,Number(oldData.level)+2);
      if (Number(newData.level)<Number(oldData.level)-0.01
          || Number(newData.level)>expectedLevel+0.01
          || !near(Number(newData.partialDamage),Number(oldData.partialDamage))) return false;
      if (Number(newData.level)>=450 && Number(oldData.level)<450) {
        return hpAfter===hpBefore-1 && shieldAfter===shieldBefore;
      }
      return hpAfter===hpBefore && shieldAfter===shieldBefore;
    }
    if (Number(newData.level)!==450) return false;
    const raw = Number(oldData.partialDamage)+ht/1000;
    const expectedDamage = raw>1 ? Math.floor(raw) : 0;
    const expectedPartial = raw>1 ? raw-expectedDamage : raw;
    return near(Number(newData.partialDamage),expectedPartial,0.06)
      && hpAfter===hpBefore-expectedDamage && shieldAfter===shieldBefore;
  }

  if (className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing") {
    const left = Number(oldData.left), percent = Number(oldData.percent), flat = Number(oldData.flat);
    if (!Number.isInteger(left) || left < 1 || left > 100000
        || !Number.isFinite(percent) || percent < 0 || percent > 1
        || !Number.isInteger(flat) || flat < 0 || flat > 100000
        || typeof oldData.healing_limited !== "boolean") return false;
    const computed = Math.max(1,Math.min(left,Math.round(left*percent)+flat));
    const vialCap = oldData.healing_limited ? nativeVialOfBloodMaxHealPerTurn(before.state) : ht;
    if (vialCap === null) return false;
    const maximumTick = Math.min(computed,vialCap);
    const tick = result ? left-Number(newData.left) : left;
    if (!Number.isInteger(tick) || tick < 1 || tick > maximumTick
        || (result && (!isSameTimeTick(0.9,1.1)
          || Number(newData.left)!==left-tick
          || Number(newData.percent)!==percent || Number(newData.flat)!==flat
          || newData.healing_limited!==oldData.healing_limited))
        || (!result && left-tick>0) || shieldAfter!==shieldBefore) return false;
    return hpAfter===Math.min(ht,hpBefore+tick);
  }

  if (className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison") {
    const left = Number(oldData.left);
    if (!Number.isFinite(left) || left <= 0 || left > 100000) return false;
    const expectedLeft = left-1;
    if (result) {
      if (!isSameTimeTick(0.9,1.1) || !near(Number(newData.left),expectedLeft)) return false;
    } else if (expectedLeft>0) return false;
    // Char.damage() may activate WarriorShield immediately before ShieldBuff.processDamage().
    // That newly-created shield is available to absorb this same Poison hit, so include the
    // validated initial_shield in the conservation equation rather than treating it as healing.
    const activatedShield = nativeWarriorShieldActivation
      ? Number(warriorShieldAfter?.data.initial_shield) : 0;
    const effective = hpBefore+shieldBefore+activatedShield-hpAfter-shieldAfter;
    const maxDamage = Math.floor(left/3)+1;
    return Number.isInteger(effective) && effective>=0 && effective<=maxDamage;
  }

  if (className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier") {
    const oldShield = Number(oldData.shielding), oldPartial = Number(oldData.partialLostShield);
    if (!Number.isInteger(oldShield) || oldShield < 1 || oldShield > 100000
        || !Number.isFinite(oldPartial) || oldPartial < 0 || oldPartial >= 1.1) return false;
    if (result) {
      if (!isSameTimeTick(0.9,1.1)
          || !Number.isInteger(newData.shielding) || newData.shielding < 0
          || newData.shielding > oldShield || oldShield-newData.shielding > 1
          || !Number.isFinite(Number(newData.partialLostShield))) return false;
      if (oldShield-newData.shielding===1) {
        if (!near(Number(newData.partialLostShield),0)) return false;
      } else if (Number(newData.partialLostShield)<oldPartial
          || Number(newData.partialLostShield)>=1) return false;
    } else if (oldShield>1 || shieldAfter!==shieldBefore-oldShield) return false;
    if (hpAfter!==hpBefore) return false;
    return shieldAfter===shieldBefore-(oldShield-(result?Number(newData.shielding):0));
  }
  return false;
}

/** Canonical flattened native buff state, independent of process-local buff iteration order. */
export function isValidNativeUnchangedBuffState(previousValue: unknown, nextValue: unknown): boolean {
  let previous: any, next: any;
  try { previous=JSON.parse(String(previousValue||"")); next=JSON.parse(String(nextValue||"")); }
  catch (_) { return false; }
  const before=nativeUseItemBuffMap(previous), after=nativeUseItemBuffMap(next);
  if (!before || !after) return false;
  const normalize=(value:Map<string,any[]>)=>Array.from(value.entries())
    .sort((a:any,b:any)=>String(a[0]).localeCompare(String(b[0])))
    .map(([className,rows]:[string,any[]])=>({
      className,
      rows:rows.map(row=>({serializedBundle:row.serializedBundle,cooldown:row.cooldown}))
        .sort((a,b)=>String(a.serializedBundle).localeCompare(String(b.serializedBundle))||a.cooldown-b.cooldown)
    }));
  return sameNativeItemValue(normalize(before),normalize(after));
}

/** Native MINE may change only Hunger when breaking a normal wall or WellFed's remaining time. */
export function isValidNativeMineBuffMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown): boolean {
  let previous:any, next:any;
  try { previous=JSON.parse(String(previousValue||"")); next=JSON.parse(String(nextValue||"")); }
  catch (_) { return false; }
  const terrain=Number((detailsValue as any)?.sourceTerrain);
  if (![4,12,35,36].includes(terrain)
      || previous.hp!==next.hp || previous.ht!==next.ht || previous.shielding!==next.shielding
      || previous.gold!==next.gold || previous.alchemyEnergy!==next.alchemyEnergy) return false;
  let oldCombat:any,newCombat:any;
  try { oldCombat=JSON.parse(String(previous.combatBundle||"")); newCombat=JSON.parse(String(next.combatBundle||"")); }
  catch (_) { return false; }
  const withoutItemAndBuffCollections=(value:any)=>{
    const copy={...value}; delete copy.items; delete copy.buffs; return copy;
  };
  if (!sameNativeItemValue(withoutItemAndBuffCollections(oldCombat),withoutItemAndBuffCollections(newCombat))) return false;
  const before=nativeUseItemBuffMap(previous), after=nativeUseItemBuffMap(next);
  if (!before||!after) return false;
  const hungerClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger";
  const wellFedClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.WellFed";
  if (terrain!==4) return isValidNativeUnchangedBuffState(previousValue,nextValue);
  const oldWellFed=before.get(wellFedClass)||[], newWellFed=after.get(wellFedClass)||[];
  const oldHunger=before.get(hungerClass)||[], newHunger=after.get(hungerClass)||[];
  const sameExcept=(ignore:string[])=>{
    const normalize=(value:Map<string,any[]>)=>Array.from(value.entries())
      .filter(([name])=>!ignore.includes(String(name)))
      .sort((a:any,b:any)=>String(a[0]).localeCompare(String(b[0])))
      .map(([className,rows]:[string,any[]])=>({
        className,
        rows:rows.map(row=>({serializedBundle:row.serializedBundle,cooldown:row.cooldown}))
          .sort((a,b)=>String(a.serializedBundle).localeCompare(String(b.serializedBundle))||a.cooldown-b.cooldown)
      }));
    return sameNativeItemValue(normalize(before),normalize(after));
  };
  if (oldWellFed.length>0) {
    if (oldWellFed.length!==1 || newWellFed.length!==1 || oldHunger.length!==newHunger.length
        || !sameExcept([wellFedClass])) return false;
    const old=oldWellFed[0], current=newWellFed[0];
    if (!Number.isFinite(Number(old.data.left)) || Number(old.data.left)<0
        || Number(current.data.left)!==Number(old.data.left)-3) return false;
    const withoutLeft=(value:any)=>{const copy={...value};delete copy.left;return copy;};
    return old.cooldown===current.cooldown
      && sameNativeItemValue(withoutLeft(old.data),withoutLeft(current.data));
  }
  if (oldHunger.length!==1 || newHunger.length!==1 || !sameExcept([hungerClass])) return false;
  const old=oldHunger[0], current=newHunger[0], oldLevel=Number(old.data.level);
  // Near-starvation may produce fractional damage as well as a Hunger change. Keep that
  // corner fail-closed until the exact native damage transition is modelled.
  if (!Number.isInteger(oldLevel) || oldLevel<0 || oldLevel+3>450
      || Number(current.data.level)!==oldLevel+3
      || Number(current.data.partialDamage)!==Number(old.data.partialDamage)) return false;
  const withoutLevel=(value:any)=>{const copy={...value};delete copy.level;return copy;};
  return old.cooldown===current.cooldown
    && sameNativeItemValue(withoutLevel(old.data),withoutLevel(current.data));
}

/** Generic NPC interaction is not a payment, pickup, sale or item-use protocol.
 * It may update native NPC/quest/notes state, but must not mutate Hero inventory or currency. */
export function isValidNativeInteractInventoryMutation(previousValue: unknown, nextValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); }
  catch (_) { return false; }
  const beforeItems = parseNativeInventoryIndex(previous), afterItems = parseNativeInventoryIndex(next);
  const beforeEconomy = parseNativeItemEconomyIndex(previous), afterEconomy = parseNativeItemEconomyIndex(next);
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  const beforeBuffs = nativeUseItemBuffMap(previous), afterBuffs = nativeUseItemBuffMap(next);
  if (!beforeItems || !afterItems || !beforeEconomy || !afterEconomy || !beforeSlots || !afterSlots
      || !beforeBuffs || !afterBuffs) return false;
  const normalizeBuffs = (value: Map<string, any[]>) => Array.from(value.entries())
    .sort((a: any,b: any) => String(a[0]).localeCompare(String(b[0])))
    .map(([className, rows]: [string, any[]]) => ({
      className,
      rows: rows.map(row => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown}))
        .sort((a,b) => String(a.serializedBundle).localeCompare(String(b.serializedBundle)) || a.cooldown-b.cooldown)
    }));
  if (!sameNativeItemValue(beforeItems, afterItems)
      || !sameNativeItemValue(beforeEconomy, afterEconomy)
      || !sameNativeItemValue(beforeSlots, afterSlots)
      || !sameNativeItemValue(normalizeBuffs(beforeBuffs), normalizeBuffs(afterBuffs))) return false;
  for (const field of ["inventoryBundle", "inventoryItemsJson", "nativeItemEconomyJson", "quickslotsJson",
    "combatBundle", "gold", "alchemyEnergy", "hp", "ht", "shielding",
    "ironKeyCount", "crystalKeyCount", "wornKeyCount", "goldenKeyCount"]) {
    if (previous[field] !== next[field]) return false;
  }
  return true;
}

/** Binds the server-accepted world-time cost to the same native Hero cooldown delta used by the publisher. */
