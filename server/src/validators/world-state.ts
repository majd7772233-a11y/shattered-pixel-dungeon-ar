import { parseNativeBundleObject, isValidNativeAbilityMutation } from "./abilities";
import { isValidNativeHeroStateJson } from "./combat-state";
import { isValidNativeEquipmentMutation, isValidNativeChestHeapMutation } from "./equipment";
import { isValidNativeUnchangedBuffState, isValidNativeMineBuffMutation, isValidNativeInteractInventoryMutation } from "./hero-buffs";
import { isValidNativeItemEconomyIndexMutation } from "./inventory-claims";
import { sameNativeItemValue, isValidNativeMineInventoryMutation, isValidNativeMineHeapMutation } from "./inventory-economy";
import { isValidNativeBuybackInventoryMutation, isValidNativeBuybackShopkeeperMutation, isValidNativeUseItemMutation } from "./item-state";
import { isValidNativeBuyInventoryMutation, isValidNativeBuyHeapMutation, isValidNativeSellInventoryMutation, isValidNativeSellShopkeeperMutation } from "./shop";
import { isValidNativeMovementHeapMutation } from "./world-actions";
import { isValidNativeDropInventoryMutation, isValidNativeDropHeapMutation, isValidNativePickupInventoryMutation, isValidNativePickupHeapMutation, isValidNativeThrowInventoryMutation, isValidNativeThrowHeapMutation, isValidNativeAlchemyInventoryMutation, isValidNativeAlchemyHeapMutation } from "./world-items";

export function isValidNativeMutationActionCost(previousHeroValue: unknown, nextHeroValue: unknown,
  acceptedActionCostValue: unknown): boolean {
  let previous: any, next: any;
  try {
    previous = JSON.parse(String(previousHeroValue || ""));
    next = JSON.parse(String(nextHeroValue || ""));
  } catch (_) { return false; }
  const beforeCooldown = Number(previous?.cooldown);
  const afterCooldown = Number(next?.cooldown);
  const acceptedCost = Number(acceptedActionCostValue);
  if (!previous || typeof previous !== "object" || Array.isArray(previous)
      || !next || typeof next !== "object" || Array.isArray(next)
      || !Number.isFinite(beforeCooldown) || !Number.isFinite(afterCooldown)
      || !Number.isFinite(acceptedCost) || acceptedCost < 0 || acceptedCost > 10) return false;
  const nativeCost = Math.max(0, Math.min(10, afterCooldown - beforeCooldown));
  return Math.abs(nativeCost - acceptedCost) <= 0.06;
}

/** A whole map is accepted only as a narrowly scoped delta for a previously accepted native action. */
export function isValidNativeWorldMutation(previous: any, next: any, actionValue: unknown,
  fromValue: unknown, targetValue: unknown, trustedHeroStateValue?: unknown, acceptedPickupIntentValue?: unknown): boolean {
  const action = String(actionValue || "");
  if (!["MOVE", "UNLOCK", "MINE", "INTERACT", "OPEN_CHEST", "PICKUP", "DROP", "EQUIP", "UNEQUIP", "BUY", "BUYBACK", "SELL", "USE_ITEM", "THROW", "ALCHEMY", "USE_ABILITY"].includes(action)
      || !hasCompleteNativeLevelSnapshot(previous) || !hasCompleteNativeLevelSnapshot(next)
      || next.nativeWorldMutation !== true || next.nativeWorldTick === true
      || Object.prototype.hasOwnProperty.call(next, "nativeWorldTurnCounter")
      || previous.depth !== next.depth || previous.branch !== 0 || next.branch !== 0
      || previous.width !== next.width || previous.height !== next.height || previous.seed !== next.seed
      || previous.entrancePos !== next.entrancePos || previous.exitPos !== next.exitPos
      || previous.locked !== next.locked || previous.feeling !== next.feeling
      || previous.nativeLevelMetadataBundle !== next.nativeLevelMetadataBundle
      || !Array.isArray(previous.transitions) || !Array.isArray(next.transitions)
      || !Array.isArray(previous.tiles) || !Array.isArray(next.tiles)) return false;
  const from = fromValue, target = targetValue;
  const width = Number(previous.width), height = Number(previous.height), size = width * height;
  if (!Number.isInteger(from) || Number(from) < 0 || Number(from) >= size
      || !Number.isInteger(target) || Number(target) < 0 || Number(target) >= size) return false;
  const expectedHeroPos = action === "MOVE" ? Number(target) : Number(from);
  let beforeHero: any = null, afterHero: any = null;
  try {
    beforeHero = JSON.parse(String(trustedHeroStateValue ?? previous.heroStateJson ?? ""));
    afterHero = JSON.parse(String(next.heroStateJson || ""));
  } catch (_) { return false; }
  if (!beforeHero || !afterHero || afterHero.pos !== expectedHeroPos
      || !isValidNativeHeroStateJson(next.heroStateJson, {
        hp: afterHero.hp, ht: afterHero.ht, pos: expectedHeroPos, shielding: afterHero.shielding
      })) return false;
  const oldTargetTerrain = Number(previous.tiles.find((tile: any) => tile?.pos === Number(target))?.terrain);
  const newTargetTerrain = Number(next.tiles.find((tile: any) => tile?.pos === Number(target))?.terrain);
  const consumedNativeWell = action === "MOVE" && oldTargetTerrain === 24 && newTargetTerrain === 3;
  if (action === "MOVE" && (afterHero.ht !== beforeHero.ht
      || (afterHero.hp > beforeHero.hp && !consumedNativeWell)
      || (afterHero.shielding > beforeHero.shielding && !consumedNativeWell))) return false;
  const canonical = (value: any): any => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      const result: any = {};
      for (const key of Object.keys(value).sort()) result[key] = canonical(value[key]);
      return result;
    }
    return value;
  };
  const same = (a: any, b: any) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  if (action === "INTERACT" && !isValidNativeInteractInventoryMutation(
      trustedHeroStateValue || previous.heroStateJson, next.heroStateJson)) return false;
  if (action === "MINE" && !isValidNativeMineBuffMutation(
      trustedHeroStateValue || previous.heroStateJson, next.heroStateJson, next.nativeMutationDetails)) return false;
  if (["UNLOCK","OPEN_CHEST","PICKUP","DROP","EQUIP","UNEQUIP","BUY","BUYBACK","SELL","INTERACT"].includes(action)
      && !isValidNativeUnchangedBuffState(trustedHeroStateValue || previous.heroStateJson, next.heroStateJson)) return false;
  if (action === "SELL" && (!isValidNativeSellInventoryMutation(trustedHeroStateValue || previous.heroStateJson,
      next.heroStateJson, next.nativeMutationDetails, acceptedPickupIntentValue)
      || !isValidNativeSellShopkeeperMutation(previous.mobs || [], next.mobs || [],
        next.nativeMutationDetails, acceptedPickupIntentValue)
      || !same(previous.heaps, next.heaps))) return false;
  if (action === "BUYBACK" && (!isValidNativeBuybackInventoryMutation(trustedHeroStateValue || previous.heroStateJson,
      next.heroStateJson, next.nativeMutationDetails, acceptedPickupIntentValue)
      || !isValidNativeBuybackShopkeeperMutation(previous.mobs || [], next.mobs || [],
        next.nativeMutationDetails, acceptedPickupIntentValue)
      || !same(previous.heaps, next.heaps))) return false;
  if (!same(previous.transitions, next.transitions)) return false;

  // Mob.id() is local to an SPD process; compare the authoritative server entity identity instead.
  // An NPC's native serialization may change only when the accepted action interacted with that
  // exact NPC. HP, position, AI, scheduler, buffs and stable identity remain server-controlled.
  const stableEntityId = (mob: any) => typeof mob?.entityId === "string" ? mob.entityId : "";
  const oldMobs = new Map<string, any>((previous.mobs || []).map((m: any) => [stableEntityId(m), m]));
  const newMobs = new Map<string, any>((next.mobs || []).map((m: any) => [stableEntityId(m), m]));
  if (oldMobs.size !== newMobs.size || oldMobs.has("") || newMobs.has("")
      || oldMobs.size !== (previous.mobs || []).length || newMobs.size !== (next.mobs || []).length) return false;
  for (const [entityId, oldMob] of oldMobs) {
    const newMob = newMobs.get(entityId);
    if (!newMob) return false;
    for (const key of ["name", "pos", "hp", "ht", "shielding", "state", "defenseSkill",
      "baseSpeed", "effectiveSpeed", "cooldown", "targetCell", "targetType", "targetEntityId",
      "enemySeen", "alerted", "buffs"]) if (!same(oldMob[key], newMob[key])) return false;
    if (!same(oldMob.serializedBundle, newMob.serializedBundle)
        && !(action === "INTERACT" && Number(oldMob.pos) === Number(target))
        && !(action === "SELL" && String(oldMob.entityId || "") === String(next.nativeMutationDetails?.shopEntityId || ""))
        && !(action === "BUYBACK" && String(oldMob.entityId || "") === String(next.nativeMutationDetails?.shopEntityId || ""))) return false;
  }

  const dist = (a: number, b: number) => Math.max(Math.abs((a % width) - (b % width)),
    Math.abs(Math.floor(a / width) - Math.floor(b / width)));
  const oldTiles = new Map<number, any>((previous.tiles || []).map((t: any) => [Number(t.pos), t]));
  const newTiles = new Map<number, any>((next.tiles || []).map((t: any) => [Number(t.pos), t]));
  if (oldTiles.size !== size || newTiles.size !== size) return false;
  // Mirrors every static flag in native Terrain.flags: passable, solid, pit,
  // losBlocking, flammable, secret, avoid and water. Unknown terrain is rejected on change.
  const terrainFlags: Record<number, [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean]> = {
    0:[false,false,true,false,false,false,true,false], 1:[true,false,false,false,false,false,false,false],
    2:[true,false,false,false,true,false,false,false], 3:[true,false,false,false,false,false,false,false],
    4:[false,true,false,true,false,false,false,false], 5:[true,true,false,true,true,false,false,false],
    6:[true,false,false,false,true,false,false,false], 7:[true,false,false,false,false,false,false,false],
    8:[true,false,false,false,false,false,false,false], 9:[true,false,false,false,false,false,false,false],
    10:[false,true,false,true,false,false,false,false], 11:[true,false,false,false,false,false,false,false],
    12:[false,true,false,true,false,false,false,false], 13:[false,true,false,true,true,false,false,false],
    14:[true,false,false,false,false,false,false,false], 15:[true,false,false,true,true,false,false,false],
    16:[false,true,false,true,false,true,false,false], 17:[true,false,false,false,false,true,false,false],
    18:[false,false,false,false,false,false,true,false], 19:[true,false,false,false,false,false,false,false],
    20:[true,false,false,false,false,false,false,false], 21:[false,true,false,false,false,false,false,false],
    22:[true,false,false,false,false,false,false,false], 23:[false,true,false,false,false,false,false,false],
    24:[false,false,false,false,false,false,true,false], 25:[false,true,false,false,false,false,false,false],
    26:[false,true,false,false,false,false,false,false], 27:[false,true,false,true,true,false,false,false],
    28:[false,true,false,false,false,false,false,false], 29:[true,false,false,false,false,false,false,true],
    30:[true,false,false,true,true,false,false,false], 31:[false,true,false,false,false,false,false,false],
    32:[true,false,false,false,false,false,false,false], 33:[false,true,false,false,false,false,false,false],
    34:[false,true,false,false,false,false,false,false], 35:[false,true,false,false,false,false,false,false],
    36:[false,true,false,false,false,false,false,false], 37:[true,false,false,false,false,false,false,false],
    38:[false,true,false,true,false,false,false,false]
  };
  const allowedTerrain = (pos: number, a: number, b: number): boolean => {
    if (a === b) return true;
    if (action === "MOVE") return (pos === Number(from) && a === 6 && b === 5)
      || (pos === Number(target) && a === 24 && b === 3)
      || (pos === Number(target) && ((a === 5 && b === 6)
        || ([2, 15, 30, 9].includes(a) && [2, 9, 15, 30].includes(b))
        || (a === 16 && b === 5) || (a === 17 && [18, 19, 1].includes(b))
        || (a === 18 && [19, 1].includes(b))))
      || (dist(pos, Number(target)) <= 12 && ((a === 16 && b === 5) || (a === 17 && [18, 19].includes(b))));
    if (action === "UNLOCK" && pos === Number(target)) return (a === 10 && b === 5)
      || (a === 38 && b === 5) || (a === 31 && b === 1) || (a === 21 && b === 22);
    if (action === "MINE" && dist(pos, Number(target)) <= 1) return ([4, 12].includes(a) && b === 20)
      || (a === 35 && b === 1) || (a === 36 && b === 20);
    if (action === "INTERACT" && dist(pos, Number(target)) <= 1) return (a === 13 && [1, 20, 2, 9].includes(b))
      || (a === 27 && [1, 20].includes(b)) || (a === 16 && b === 5) || (a === 17 && b === 18);
    return false;
  };
  for (let pos = 0; pos < size; pos++) {
    const a = oldTiles.get(pos), b = newTiles.get(pos);
    if (!a || !b) return false;
    const terrainChanged = Number(a.terrain) !== Number(b.terrain);
    if (terrainChanged && (dist(pos, Number(target)) > (action === "MOVE" ? 12 : action === "MINE" || action === "INTERACT" ? 1 : 0)
        || !allowedTerrain(pos, Number(a.terrain), Number(b.terrain)))) return false;
    if (terrainChanged) {
      const expected = terrainFlags[Number(b.terrain)];
      if (!expected) return false;
      const fields = ["passable", "solid", "pit", "losBlocking", "flammable", "secret", "avoid", "water"];
      for (let i = 0; i < fields.length; i++) {
        if (b[fields[i]] !== expected[i]) return false;
      }
    }
    for (const field of ["passable", "solid", "pit", "losBlocking", "flammable", "secret", "avoid", "water"]) {
      if (!same(a[field], b[field]) && !terrainChanged) return false;
    }
    for (const field of ["discoverable", "openSpace"]) {
      if (!same(a[field], b[field]) && dist(pos, expectedHeroPos) > 12
          && !(action === "MINE" && dist(pos, Number(target)) <= 1)) return false;
    }
    if (!same(a.secret, b.secret) && !terrainChanged) return false;
  }
  const growthLocal = (before: any[], after: any[]) => {
    const oldSet = new Set<number>(before || []), newSet = new Set<number>(after || []);
    for (const p of oldSet) if (!newSet.has(p)) return false;
    for (const p of newSet) if (!oldSet.has(p) && dist(p, expectedHeroPos) > 12) return false;
    return true;
  };
  if (!growthLocal(previous.visitedPositions || [], next.visitedPositions || [])
      || !growthLocal(previous.mappedPositions || [], next.mappedPositions || [])) return false;
  if (action === "MOVE" && !isValidNativeMovementHeapMutation(previous, next, target)) return false;
  if (action === "MINE" && (
      !isValidNativeMineInventoryMutation(trustedHeroStateValue || previous.heroStateJson,
        next.heroStateJson, next.nativeMutationDetails, acceptedPickupIntentValue)
      || Number(previous.tiles.find((tile: any) => tile?.pos === Number(target))?.terrain)
        !== Number(next.nativeMutationDetails?.sourceTerrain)
      || !isValidNativeMineHeapMutation(previous.heaps, next.heaps, from, target,
        next.nativeMutationDetails, acceptedPickupIntentValue))) return false;
  if (action === "MINE" && Number(next.nativeMutationDetails?.sourceTerrain) === 12) {
    const inventoryChanged = beforeHero.inventoryBundle !== afterHero.inventoryBundle
      || beforeHero.inventoryItemsJson !== afterHero.inventoryItemsJson
      || beforeHero.nativeItemEconomyJson !== afterHero.nativeItemEconomyJson
      || beforeHero.quickslotsJson !== afterHero.quickslotsJson;
    const floorChanged = !same(previous.heaps, next.heaps);
    // Native DarkGold is either collected into inventory or left on the floor, never both/neither.
    if (inventoryChanged === floorChanged) return false;
  }
  if (action === "PICKUP" && (!isValidNativePickupHeapMutation(previous.heaps, next.heaps, target,
      next.nativeMutationDetails, acceptedPickupIntentValue)
      || !isValidNativePickupInventoryMutation(trustedHeroStateValue || previous.heroStateJson,
        next.heroStateJson, acceptedPickupIntentValue))) return false;
  if (action === "DROP" && (!isValidNativeDropInventoryMutation(trustedHeroStateValue || previous.heroStateJson,
      next.heroStateJson, next.nativeMutationDetails)
      || !isValidNativeDropHeapMutation(previous.heaps, next.heaps, target,
        next.nativeMutationDetails, acceptedPickupIntentValue))) return false;
  if (action === "BUY" && (!isValidNativeBuyInventoryMutation(trustedHeroStateValue || previous.heroStateJson,
      next.heroStateJson, next.nativeMutationDetails, acceptedPickupIntentValue)
      || !isValidNativeBuyHeapMutation(previous.heaps, next.heaps, target,
        next.nativeMutationDetails, acceptedPickupIntentValue))) return false;
  if (action === "USE_ITEM" && !isValidNativeUseItemMutation(
      trustedHeroStateValue || previous.heroStateJson, next.heroStateJson,
      next.nativeMutationDetails, acceptedPickupIntentValue)) return false;
  if (action === "THROW" && (!isValidNativeThrowInventoryMutation(
      trustedHeroStateValue || previous.heroStateJson, next.heroStateJson, next.nativeMutationDetails)
      || !isValidNativeThrowHeapMutation(previous.heaps, next.heaps, target,
        next.nativeMutationDetails, acceptedPickupIntentValue)
      || !same(previous.tiles, next.tiles) || !same(previous.traps, next.traps)
      || !same(previous.plants, next.plants) || !same(previous.blobs, next.blobs)
      || !same(previous.transitions, next.transitions)
      || !same(previous.visitedPositions, next.visitedPositions)
      || !same(previous.mappedPositions, next.mappedPositions))) return false;
  if (action === "ALCHEMY" && (!isValidNativeAlchemyInventoryMutation(
      trustedHeroStateValue || previous.heroStateJson, next.heroStateJson, next.nativeMutationDetails, acceptedPickupIntentValue)
      || !isValidNativeAlchemyHeapMutation(previous.heaps, next.heaps, target,
        next.nativeMutationDetails, acceptedPickupIntentValue)
      || !same(previous.tiles, next.tiles) || !same(previous.traps, next.traps)
      || !same(previous.plants, next.plants) || !same(previous.blobs, next.blobs)
      || !same(previous.transitions, next.transitions)
      || !same(previous.visitedPositions, next.visitedPositions)
      || !same(previous.mappedPositions, next.mappedPositions))) return false;
  if (action === "USE_ABILITY" && (!isValidNativeAbilityMutation(
      trustedHeroStateValue || previous.heroStateJson, next.heroStateJson, next.nativeMutationDetails, acceptedPickupIntentValue)
      || !same(previous.heaps,next.heaps) || !same(previous.tiles,next.tiles)
      || !same(previous.traps,next.traps) || !same(previous.plants,next.plants)
      || !same(previous.blobs,next.blobs) || !same(previous.transitions,next.transitions)
      || !same(previous.visitedPositions,next.visitedPositions)
      || !same(previous.mappedPositions,next.mappedPositions))) return false;
  if ((action === "EQUIP" || action === "UNEQUIP") && !isValidNativeEquipmentMutation(
      trustedHeroStateValue || previous.heroStateJson, next.heroStateJson, action,
      next.nativeMutationDetails, acceptedPickupIntentValue)) return false;
  if (action === "OPEN_CHEST" && !isValidNativeChestHeapMutation(previous.heaps, next.heaps, target,
      next.nativeMutationDetails, acceptedPickupIntentValue,
      trustedHeroStateValue || previous.heroStateJson, next.heroStateJson)) return false;
  if (action !== "OPEN_CHEST" && action !== "MINE" && action !== "MOVE" && action !== "PICKUP"
      && action !== "DROP" && action !== "BUY" && action !== "THROW" && action !== "ALCHEMY"
      && !same(previous.heaps, next.heaps)) return false;
  if (action === "OPEN_CHEST") {
    const before = new Map<number, any>((previous.heaps || []).map((h: any) => [Number(h.pos), h]));
    const after = new Map<number, any>((next.heaps || []).map((h: any) => [Number(h.pos), h]));
    const oldHeap = before.get(Number(target));
    if (!oldHeap || !["CHEST", "LOCKED_CHEST", "CRYSTAL_CHEST"].includes(String(oldHeap.type))) return false;
    for (const pos of new Set<number>([...before.keys(), ...after.keys()])) {
      if (!same(before.get(pos), after.get(pos)) && pos !== Number(target)) return false;
    }
  }
  const localRowsUnchangedOutside = (beforeRows: any[], afterRows: any[], radius: number): boolean => {
    if (!Array.isArray(beforeRows) || !Array.isArray(afterRows)) return false;
    const index = (rows: any[]) => {
      const result = new Map<number, any>();
      for (const row of rows) {
        const pos = Number(row?.pos);
        if (!Number.isInteger(pos) || pos < 0 || pos >= size || result.has(pos)) return null;
        result.set(pos, row);
      }
      return result;
    };
    const before = index(beforeRows), after = index(afterRows);
    if (!before || !after) return false;
    for (const pos of new Set<number>([...before.keys(), ...after.keys()])) {
      if (!same(before.get(pos), after.get(pos)) && dist(pos, expectedHeroPos) > radius) return false;
    }
    return true;
  };
  if (action === "MOVE") {
    // A step/search can trigger nearby traps and plants but cannot change distant world objects.
    if (!localRowsUnchangedOutside(previous.traps, next.traps, 3)
        || !localRowsUnchangedOutside(previous.plants, next.plants, 1)) return false;
  } else if (!same(previous.traps, next.traps) || !same(previous.plants, next.plants)) return false;
  if (action === "MOVE" && !same(previous.blobs, next.blobs)) {
    const old = new Map<string, any>((previous.blobs || []).map((b: any) => [String(b.className), b]));
    const curr = new Map<string, any>((next.blobs || []).map((b: any) => [String(b.className), b]));
    const oldTrapRows = new Map<number, any>((previous.traps || []).map((t: any) => [Number(t.pos), t]));
    const newTrapRows = new Map<number, any>((next.traps || []).map((t: any) => [Number(t.pos), t]));
    const activatedNearTarget = [...new Set<number>([...oldTrapRows.keys(), ...newTrapRows.keys()])].some(pos => {
      const oldTrap = oldTrapRows.get(pos), newTrap = newTrapRows.get(pos);
      return dist(pos, Number(target)) <= 3 && !!oldTrap && oldTrap.active === true
        && (!newTrap || newTrap.active === false);
    });
    const trapSpawnedBlobTypes = new Set([
      "Fire", "ToxicGas", "ParalyticGas", "ConfusionGas", "CorrosiveGas", "StenchGas",
      "PoisonGas", "Electricity", "Freezing", "Foliage", "SmokeScreen"
    ]);
    for (const name of new Set<string>([...old.keys(), ...curr.keys()])) {
      if (same(old.get(name), curr.get(name))) continue;
      if (name.endsWith(".Web") && old.has(name) && curr.has(name)) continue;
      const leaf = name.substring(name.lastIndexOf(".") + 1);
      if (!activatedNearTarget || !name.includes(".actors.blobs.") || !trapSpawnedBlobTypes.has(leaf)) return false;
    }
  }

  const keyFields = ["ironKeyCount", "crystalKeyCount", "wornKeyCount", "goldenKeyCount"];
  for (const field of keyFields) if (!Number.isInteger(beforeHero[field]) || beforeHero[field] < 0
      || !Number.isInteger(afterHero[field]) || afterHero[field] < 0) return false;
  if (typeof beforeHero.inventoryBundle !== "string" || typeof afterHero.inventoryBundle !== "string") return false;
  if (action !== "INTERACT" && action !== "MINE" && action !== "PICKUP" && action !== "DROP"
      && action !== "EQUIP" && action !== "UNEQUIP" && action !== "BUY" && action !== "SELL"
      && beforeHero.inventoryBundle !== afterHero.inventoryBundle) return false;
  if (action === "PICKUP" && beforeHero.inventoryBundle === afterHero.inventoryBundle
      && beforeHero.notesBundle === afterHero.notesBundle && beforeHero.questStateBundle === afterHero.questStateBundle
      && beforeHero.ironKeyCount === afterHero.ironKeyCount && beforeHero.crystalKeyCount === afterHero.crystalKeyCount
      && beforeHero.wornKeyCount === afterHero.wornKeyCount && beforeHero.goldenKeyCount === afterHero.goldenKeyCount) return false;
  const targetTerrain = Number(oldTiles.get(Number(target))?.terrain);
  const oldHeap = (previous.heaps || []).find((h: any) => Number(h.pos) === Number(target));
  const requiredKey = action === "UNLOCK"
    ? targetTerrain === 10 ? "ironKeyCount" : targetTerrain === 31 ? "crystalKeyCount" : targetTerrain === 21 ? "wornKeyCount" : null
    : action === "OPEN_CHEST" ? oldHeap?.type === "LOCKED_CHEST" ? "goldenKeyCount"
      : oldHeap?.type === "CRYSTAL_CHEST" ? "crystalKeyCount" : null : null;
  if (requiredKey) {
    for (const field of keyFields) if (afterHero[field] !== beforeHero[field] - (field === requiredKey ? 1 : 0)) return false;
    if (typeof beforeHero.notesBundle !== "string" || typeof afterHero.notesBundle !== "string"
        || beforeHero.notesBundle === afterHero.notesBundle) return false;
  } else if (action !== "INTERACT" && action !== "MINE" && action !== "PICKUP") {
    for (const field of keyFields) if (beforeHero[field] !== afterHero[field]) return false;
    if (beforeHero.notesBundle !== afterHero.notesBundle) return false;
  }
  if (action !== "INTERACT" && action !== "PICKUP" && beforeHero.questStateBundle !== afterHero.questStateBundle) return false;
  if (!isValidNativeItemEconomyIndexMutation(trustedHeroStateValue || previous.heroStateJson,
      next.heroStateJson, action, next.nativeMutationDetails, previous.heaps, next.heaps)) return false;
  return true;
}
/** Rejects partial/legacy level payloads before any room state is replaced. */
export function hasCompleteNativeLevelSnapshot(level: any): boolean {
  if (!level || typeof level !== "object"
    || level.schemaVersion !== 1 || level.branch !== 0
    || !Number.isInteger(level.depth) || level.depth < 1 || level.depth > 100
    || !Number.isInteger(level.width) || !Number.isInteger(level.height)
    || level.width < 8 || level.height < 8 || level.width > 100 || level.height > 100
    || !Number.isFinite(level.seed)
    || !Number.isInteger(level.entrancePos) || !Number.isInteger(level.exitPos)) return false;
  const size = level.width * level.height;
  if (level.entrancePos < 0 || level.entrancePos >= size
    || level.exitPos < 0 || level.exitPos >= size) return false;
  // RemoteHero actors are process-local scheduler members, but their IDs still arrive in every
  // modern native snapshot. Keep the field optional for legacy non-tick snapshots; when present,
  // reject malformed, zero, duplicated or oversized Actor identity lists before persistence.
  if (level.nativeRemoteHeroActorIds !== undefined) {
    if (!Array.isArray(level.nativeRemoteHeroActorIds) || level.nativeRemoteHeroActorIds.length > 8192) return false;
    const remoteActorIds = new Set<number>();
    for (const value of level.nativeRemoteHeroActorIds) {
      if (!Number.isInteger(value) || value < 1 || remoteActorIds.has(value)) return false;
      remoteActorIds.add(value);
    }
  }
  const arrays = ["tiles", "transitions", "heaps", "traps", "blobs", "plants", "mobs", "visitedPositions", "mappedPositions"];
  if (arrays.some((key) => !Array.isArray(level[key]))) return false;
  if (level.tiles.length !== size || level.transitions.length > 128 || level.heaps.length > size
    || level.traps.length > size || level.plants.length > size || level.blobs.length > 128
    || level.mobs.length > 512 || level.visitedPositions.length > size || level.mappedPositions.length > size
    || typeof level.locked !== "boolean"
    || !["NONE", "CHASM", "WATER", "GRASS", "DARK", "LARGE", "TRAPS", "SECRETS"].includes(String(level.feeling))
    || typeof level.heroStateJson !== "string" || level.heroStateJson.length > 200000
    || typeof level.nativeLevelMetadataBundle !== "string"
    || level.nativeLevelMetadataBundle.length === 0 || level.nativeLevelMetadataBundle.length > 200000) return false;

  const bundle = (value: any) => typeof value === "string" && value.length > 0 && value.length <= 200000;
  const inBounds = (value: any) => Number.isInteger(value) && value >= 0 && value < size;
  const uniquePositionRows = (rows: any[]) => {
    const seen = new Set<number>();
    for (const row of rows) {
      const pos = row?.pos;
      if (!inBounds(pos) || seen.has(pos)) return false;
      seen.add(pos);
    }
    return true;
  };
  const uniqueCells = (cells: any[]) => {
    const seen = new Set<number>();
    for (const pos of cells) {
      if (!inBounds(pos) || seen.has(pos)) return false;
      seen.add(pos);
    }
    return true;
  };

  // Reject repeated cells before a snapshot can be persisted. Its length alone does not prove
  // that the tile array covers the full level: a repeated tile may conceal a missing cell.
  const tileFlags = ["passable", "solid", "pit", "losBlocking", "flammable", "secret",
    "avoid", "water", "discoverable", "openSpace"];
  const tilePositions = new Set<number>();
  for (const tile of level.tiles) {
    if (!inBounds(tile?.pos) || tilePositions.has(tile.pos)
      || !Number.isInteger(tile?.terrain) || tile.terrain < 0 || tile.terrain > 255
      || tileFlags.some((flag) => typeof tile?.[flag] !== "boolean")) return false;
    tilePositions.add(tile.pos);
  }
  if (tilePositions.size !== size
    || !uniqueCells(level.visitedPositions)
    || !uniqueCells(level.mappedPositions)) return false;

  const transitionTypes = ["SURFACE", "REGULAR_ENTRANCE", "REGULAR_EXIT", "BRANCH_ENTRANCE", "BRANCH_EXIT"];
  for (const transition of level.transitions) {
    const type = String(transition?.type ?? "");
    const targetType = String(transition?.targetType ?? "");
    const targetDepth = transition?.targetDepth;
    const targetBranch = transition?.targetBranch;
    if (!inBounds(transition?.pos) || !transitionTypes.includes(type)
      || (targetType !== "" && !transitionTypes.includes(targetType))
      || !Number.isInteger(targetDepth) || targetDepth < (type === "SURFACE" ? 0 : 1) || targetDepth > 100
      || !Number.isInteger(targetBranch) || targetBranch < 0 || targetBranch > 32) return false;
  }

  // These are single-valued native maps. Duplicate positions produce snapshots that Android
  // rejects during preflight, so the server must reject them before any SQL replacement.
  if (!uniquePositionRows(level.heaps) || !uniquePositionRows(level.traps) || !uniquePositionRows(level.plants)) return false;
  const heapTypes = ["HEAP", "FOR_SALE", "CHEST", "LOCKED_CHEST", "CRYSTAL_CHEST", "TOMB", "SKELETON", "REMAINS"];
  const stableHeapIds = new Set<string>();
  const stableItemIds = new Set<string>();
  for (const heap of level.heaps) {
    const heapId = String(heap?.heapId || "");
    if (heapId && (heapId.length < 8 || heapId.length > 80 || stableHeapIds.has(heapId))) return false;
    if (heapId) stableHeapIds.add(heapId);
    if (!heapTypes.includes(String(heap?.type)) || !Array.isArray(heap?.items) || heap.items.length > 512
      || typeof heap?.seen !== "boolean" || typeof heap?.haunted !== "boolean"
      || typeof heap?.hidden !== "boolean" || typeof heap?.autoExplored !== "boolean") return false;
    for (const item of heap.items) {
      const itemId = String(item?.itemId || "");
      if (itemId && (itemId.length < 8 || itemId.length > 80 || stableItemIds.has(itemId)
          || typeof item?.stackable !== "boolean" || !bundle(item?.serializedBundle)
          || !String(item.serializedBundle).includes(itemId))) return false;
      if (heapId && !itemId) return false;
      if (itemId) stableItemIds.add(itemId);
      if (!bundle(item?.serializedBundle) || !Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > 100000
        || !Number.isInteger(item?.level) || item.level < -100 || item.level > 10000
        || typeof item?.cursed !== "boolean" || typeof item?.cursedKnown !== "boolean"
        || (item.shopPrice !== undefined && (!Number.isInteger(item.shopPrice) || item.shopPrice < -1 || item.shopPrice > 10000000))
        || (String(heap.type) === "FOR_SALE" && (!Number.isInteger(item.shopPrice) || item.shopPrice < 0))) return false;
    }
  }
  for (const trap of level.traps) {
    if (!bundle(trap?.serializedBundle) || typeof trap?.active !== "boolean"
      || typeof trap?.visible !== "boolean" || typeof trap?.reclaimed !== "boolean"
      || !Number.isInteger(trap?.color) || !Number.isInteger(trap?.shape)) return false;
  }
  for (const plant of level.plants) {
    if (!bundle(plant?.serializedBundle) || typeof plant?.className !== "string" || plant.className.length === 0) return false;
  }

  const blobTypes = new Set<string>();
  for (const blob of level.blobs) {
    const className = String(blob?.className ?? "");
    if (className.length === 0 || blobTypes.has(className) || !bundle(blob?.serializedBundle)
      || !Number.isFinite(blob?.cooldown) || blob.cooldown < 0 || blob.cooldown > 100000) return false;
    blobTypes.add(className);
  }

  // All fields consumed by native Mob reconciliation are part of the full v1 snapshot, not
  // optional fields that may be omitted on non-Actor-turn publications.
  const mobIds = new Set<number>();
  const mobPositions = new Set<number>();
  const entityIds = new Set<string>();
  for (const mob of level.mobs) {
    const entityId = mob?.entityId;
    if (!Number.isInteger(mob?.mobId) || mob.mobId < 1 || mobIds.has(mob.mobId)
      || !inBounds(mob?.pos) || mobPositions.has(mob.pos)
      || !Number.isInteger(mob?.hp) || mob.hp < 0
      || !Number.isInteger(mob?.ht) || mob.ht < 1 || mob.hp > mob.ht
      || typeof mob?.name !== "string" || mob.name.length === 0
      || typeof mob?.entityId !== "string" || entityId.length > 80
      || (entityId.length > 0 && (entityId.length < 8 || entityIds.has(entityId)))
      || !Number.isInteger(mob?.shielding) || mob.shielding < 0 || mob.shielding > 100000
      || typeof mob?.state !== "string" || mob.state.length > 80
      || !Number.isInteger(mob?.defenseSkill)
      || !Number.isFinite(mob?.baseSpeed) || mob.baseSpeed <= 0 || mob.baseSpeed > 100
      || !Number.isFinite(mob?.effectiveSpeed) || mob.effectiveSpeed <= 0 || mob.effectiveSpeed > 1000
      || !Number.isFinite(mob?.cooldown) || mob.cooldown < 0 || mob.cooldown > 100000
      || !Number.isInteger(mob?.targetCell) || mob.targetCell < -1 || mob.targetCell >= size
      || !["NONE", "MOB", "PLAYER"].includes(String(mob?.targetType))
      || typeof mob?.targetEntityId !== "string" || mob.targetEntityId.length > 128
      || ((mob.targetType === "MOB" || mob.targetType === "PLAYER") && mob.targetEntityId.length < 8)
      || typeof mob?.enemySeen !== "boolean" || typeof mob?.alerted !== "boolean"
      || !bundle(mob?.serializedBundle) || !Array.isArray(mob?.buffs) || mob.buffs.length > 256
      || mob.buffs.some((buff: any) => !bundle(buff?.serializedBundle)
        || !Number.isFinite(buff?.cooldown) || buff.cooldown < 0 || buff.cooldown > 100000)) return false;
    mobIds.add(mob.mobId);
    mobPositions.add(mob.pos);
    if (entityId.length > 0) entityIds.add(entityId);
  }

  if (level.nativeWorldTick === true) {
    if (!Number.isSafeInteger(level.nativeWorldTurnCounter) || level.nativeWorldTurnCounter < 1
      || !Number.isFinite(level.nativeActorClock) || level.nativeActorClock < 0 || level.nativeActorClock > 1e9
      || !Number.isInteger(level.nativeWorldActorId) || level.nativeWorldActorId < 1
      || typeof level.nativeWorldActorClass !== "string" || level.nativeWorldActorClass.length < 1
      || level.nativeWorldActorClass.length > 240
      || !["MOB", "MOB_BUFF", "BLOB", "RESPAWNER"].includes(String(level.nativeWorldActorKind))
      || typeof level.nativeWorldActorEntityId !== "string" || level.nativeWorldActorEntityId.length > 80
      || typeof level.nativeMobEntityId !== "string" || level.nativeMobEntityId.length > 80
      || !Number.isInteger(level.nativeMobActorId) || level.nativeMobActorId < -1) return false;
    if ((level.nativeWorldActorKind === "MOB" || level.nativeWorldActorKind === "MOB_BUFF")
      && (level.nativeWorldActorEntityId.length < 8 || level.nativeMobEntityId !== level.nativeWorldActorEntityId
        || level.nativeMobActorId < 1)) return false;
  }
  return true;
}

type NativeMobBuffRow = {className:string,id:number,time:number,cooldown:number,bundle:string,data:any};
type NativeMobBuffSnapshotMob = {data:any,buffs:Map<string,NativeMobBuffRow>};

const NATIVE_MOB_SAFE_FLAVOUR_EXPIRY = new Set([
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bless",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Foresight",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invulnerability",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Charm",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Daze",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Terror",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Weakness",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.BlobImmunity",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hex",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Sleep",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Vulnerable",
  "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.FrostImbue"
]);

function nativeMobBuffSnapshotMob(mob: any, actorClock: number, checkClock = true): NativeMobBuffSnapshotMob | null {
  if (!mob || typeof mob !== "object" || !Array.isArray(mob.buffs) || mob.buffs.length > 256) return null;
  const root = parseNativeBundleObject(mob.serializedBundle);
  const data = root && root.mob;
  const className = String(data?.__className || "");
  const actorId = Number(data?.id), time = Number(data?.time);
  const nestedBuffs = data?.buffs;
  if (!data || !className.startsWith("com.shatteredpixel.shatteredpixeldungeon.actors.mobs.")
      || !Number.isInteger(actorId) || actorId < 1 || !Number.isInteger(mob.mobId) || mob.mobId < 1 || actorId !== Number(mob.mobId)
      || !Number.isFinite(time) || time < 0
      || Number(data.pos) !== Number(mob.pos)
      || Number(data.HP) !== Number(mob.hp) || Number(data.HT) !== Number(mob.ht)
      || typeof data.seen !== "boolean" || data.seen !== (mob.enemySeen === true)
      || !({
        SLEEPING:"Sleeping", WANDERING:"Wandering", INVESTIGATING:"Investigating",
        HUNTING:"Hunting", FLEEING:"Fleeing", PASSIVE:"Passive"
      } as Record<string,string>)[String(data.state || "")]
      || ({
        SLEEPING:"Sleeping", WANDERING:"Wandering", INVESTIGATING:"Investigating",
        HUNTING:"Hunting", FLEEING:"Fleeing", PASSIVE:"Passive"
      } as Record<string,string>)[String(data.state || "")] !== String(mob.state || "")
      || !Array.isArray(nestedBuffs) || nestedBuffs.length !== mob.buffs.length
      || !Number.isFinite(Number(mob.cooldown)) || Number(mob.cooldown) < 0
      || (checkClock && Math.abs(Number(mob.cooldown)-Math.max(0,time-actorClock)) > 0.06)) return null;
  const nestedByKey = new Map<string,any>();
  for (const entry of nestedBuffs) {
    const buffClass = String(entry?.__className || ""), id = Number(entry?.id), buffTime = Number(entry?.time);
    const key = buffClass+"#"+id;
    if (!buffClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.")
        || !Number.isInteger(id) || id < 1 || !Number.isFinite(buffTime)
        || nestedByKey.has(key)) return null;
    nestedByKey.set(key,entry);
  }
  const buffs = new Map<string,NativeMobBuffRow>();
  for (const row of mob.buffs) {
    const bundle = String(row?.serializedBundle || "");
    const buffRoot = parseNativeBundleObject(bundle), buff = buffRoot && buffRoot.buff;
    const buffClass = String(buff?.__className || ""), id = Number(buff?.id), buffTime = Number(buff?.time);
    const cooldown = Number(row?.cooldown), key = buffClass+"#"+id;
    if (!buff || !bundle || !buffClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.")
        || !Number.isInteger(id) || id < 0 || !Number.isFinite(buffTime)
        || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > 100000
        || (checkClock && Math.abs(cooldown-Math.max(0,buffTime-actorClock)) > 0.06)
        || buffs.has(key) || !nestedByKey.has(key)
        || !sameNativeItemValue(nestedByKey.get(key),buff)) return null;
    buffs.set(key,{className:buffClass,id,time:buffTime,cooldown,bundle,data:buff});
  }
  if (nestedByKey.size !== buffs.size) return null;
  return {data,buffs};
}

function nativeMobBuffHeroStableState(value: unknown, actorClock: number, checkClock: boolean): any | null {
  let state:any;
  try { state = typeof value === "string" ? JSON.parse(value) : value; } catch (_) { return null; }
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const combat = parseNativeBundleObject(state.combatBundle);
  const heroTime = Number(combat?.time), heroCooldown = Number(state.cooldown);
  if (!combat || !Number.isFinite(heroTime) || !Number.isFinite(heroCooldown)
      || heroCooldown < 0 || heroCooldown > 100000
      || (checkClock && Math.abs(heroCooldown-Math.max(0,heroTime-actorClock)) > 0.06)
      || !Number.isInteger(state.buffCount) || state.buffCount < 0 || state.buffCount > 256
      || !Array.isArray(combat.buffs) || combat.buffs.length !== state.buffCount) return null;

  const rows:any[] = [];
  const seen = new Set<string>();
  for (let i=0;i<state.buffCount;i++) {
    const bundle = state["buff_"+i], cooldown = Number(state["buffCooldown_"+i]);
    const root = parseNativeBundleObject(bundle), data = root && root.buff;
    const className = String(data?.__className || ""), id = Number(data?.id), time = Number(data?.time);
    const key = className+"#"+id;
    if (typeof bundle !== "string" || !className || !Number.isInteger(id) || id < 1
        || !Number.isFinite(time) || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > 100000
        || (checkClock && Math.abs(cooldown-Math.max(0,time-actorClock)) > 0.06)
        || seen.has(key) || !sameNativeItemValue(combat.buffs[i],data)) return null;
    seen.add(key);
    rows.push(data);
  }
  const stable = {...state};
  delete stable.cooldown;
  for (const key of Object.keys(stable)) if (/^buffCooldown_\d+$/.test(key)) delete stable[key];
  stable.combatBundle = combat;
  return stable;
}


function nativeMobBuffHeroActorIds(value: unknown): Set<number> | null {
  let state:any;
  try { state = typeof value === "string" ? JSON.parse(value) : value; } catch (_) { return null; }
  const combat = parseNativeBundleObject(state?.combatBundle);
  if (!combat) return null;
  const ids = new Set<number>();
  const heroId = Number(combat.id);
  if (!Number.isInteger(heroId) || heroId < 1) return null;
  ids.add(heroId);
  if (!Number.isInteger(state.buffCount) || state.buffCount < 0 || state.buffCount > 256) return null;
  for (let i=0;i<state.buffCount;i++) {
    const root = parseNativeBundleObject(state["buff_"+i]), data = root && root.buff;
    const id = Number(data?.id);
    if (!data || !Number.isInteger(id) || id < 1 || ids.has(id)) return null;
    ids.add(id);
  }
  return ids;
}


function nativeMobBuffRemoteHeroActorIds(level: any): Set<number> | null {
  const values = level?.nativeRemoteHeroActorIds;
  if (!Array.isArray(values) || values.length > 8192) return null;
  const ids = new Set<number>();
  for (const value of values) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1 || ids.has(id)) return null;
    ids.add(id);
  }
  return ids;
}

function nativeMobBuffActorIds(mobs: Map<string,{row:any,snapshot:NativeMobBuffSnapshotMob}>,
  heroIds: Set<number>, remoteHeroIds: Set<number>, blobs: Map<string,any>, metadata: any | null): Set<number> | null {
  const ids = new Set<number>();
  const add = (value: unknown): boolean => {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1 || ids.has(id)) return false;
    ids.add(id);
    return true;
  };
  for (const value of mobs.values()) {
    if (!add(value.row.mobId)) return null;
    for (const buff of value.snapshot.buffs.values()) if (!add(buff.id)) return null;
  }
  for (const id of heroIds) if (!add(id)) return null;
  for (const id of remoteHeroIds) if (!add(id)) return null;
  for (const blob of blobs.values()) if (!add(blob.id)) return null;
  if (metadata && Object.prototype.hasOwnProperty.call(metadata,"respawner")
      && !add(metadata.respawner?.id)) return null;
  return ids;
}

function nativeMobBuffExpiryMetadata(value: unknown, actorClock: number, checkClock = true): any | null {
  const metadata = parseNativeBundleObject(value);
  if (!metadata) return null;
  const hasRespawner = Object.prototype.hasOwnProperty.call(metadata,"respawner");
  if (!hasRespawner) {
    if (Object.prototype.hasOwnProperty.call(metadata,"respawnerCooldown")) return null;
    return metadata;
  }
  const respawner = metadata.respawner;
  const time = Number(respawner?.time), cooldown = Number(metadata.respawnerCooldown);
  const respawnerClass = String(respawner?.__className || "");
  const respawnerId = Number(respawner?.id);
  if (!respawner || !(respawnerClass.endsWith(".MobSpawner") || respawnerClass.endsWith("$MobSpawner"))
      || !Number.isInteger(respawnerId) || respawnerId < 1
      || !Number.isFinite(time) || time < 0 || !Number.isFinite(cooldown) || cooldown < 0
      || (checkClock && Math.abs(cooldown-Math.max(0,time-actorClock)) > 0.06)) return null;
  const stable = {...metadata};
  delete stable.respawnerCooldown;
  return stable;
}

function nativeMobBuffExpiryBlobs(level: any, actorClock: number, checkClock = true): Map<string,any> | null {
  if (!level || !Array.isArray(level.blobs) || level.blobs.length > 128) return null;
  const blobs = new Map<string,any>();
  for (const row of level.blobs) {
    const className = String(row?.className || "");
    const root = parseNativeBundleObject(row?.serializedBundle), data = root && root.blob;
    const cooldown = Number(row?.cooldown), time = Number(data?.time), id = Number(data?.id);
    if (!className || !data || String(data.__className || "") !== className
        || !Number.isInteger(id) || id < 0
        || !Number.isFinite(time) || time < 0 || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > 100000
        || (checkClock && Math.abs(cooldown-Math.max(0,time-actorClock)) > 0.06)
        || blobs.has(className)) return null;
    blobs.set(className,{bundle:String(row.serializedBundle),data,id});
  }
  return blobs;
}

/** A MOB_BUFF snapshot may only expire one proven FlavourBuff; its target and all other world state stay intact. */
export function isValidNativeMobBuffExpiryTurn(previous: any, next: any, trustedHeroStateValue: unknown): boolean {
  const clock = Number(next?.nativeActorClock);
  const actorClass = String(next?.nativeWorldActorClass || "");
  const actorId = Number(next?.nativeWorldActorId);
  const targetEntityId = String(next?.nativeMobEntityId || "");
  const targetActorId = Number(next?.nativeMobActorId);
  const sourceKey = actorClass+"#"+actorId;
  if (!previous || !next || !Array.isArray(previous.mobs) || !Array.isArray(next.mobs)
      || !Number.isFinite(clock) || clock < 0 || !Number.isInteger(actorId) || actorId < 1
      || !NATIVE_MOB_SAFE_FLAVOUR_EXPIRY.has(actorClass)
      || !/^[A-Za-z0-9._:-]{8,80}$/.test(targetEntityId)
      || !Number.isInteger(targetActorId) || targetActorId < 1
      || next.nativeWorldActorEntityId !== targetEntityId) return false;

  const previousMobs = new Map<string,{row:any,snapshot:NativeMobBuffSnapshotMob}>();
  const nextMobs = new Map<string,{row:any,snapshot:NativeMobBuffSnapshotMob}>();
  for (const row of previous.mobs) {
    const id = String(row?.entityId || "");
    const parsed = nativeMobBuffSnapshotMob(row,clock,false);
    if (!/^[A-Za-z0-9._:-]{8,80}$/.test(id) || previousMobs.has(id) || !parsed) return false;
    previousMobs.set(id,{row,snapshot:parsed});
  }
  for (const row of next.mobs) {
    const id = String(row?.entityId || "");
    const parsed = nativeMobBuffSnapshotMob(row,clock);
    if (!/^[A-Za-z0-9._:-]{8,80}$/.test(id) || nextMobs.has(id) || !parsed) return false;
    nextMobs.set(id,{row,snapshot:parsed});
  }
  if (previousMobs.size !== nextMobs.size || !previousMobs.has(targetEntityId)) return false;
  // Actor IDs are process-local but globally unique within one scheduler. Reject aliases across
  // serialized Mobs/Buffs, the local and remote Heroes, Blobs, and the level respawner before
  // binding the reported source to its one target.
  for (const collection of [previousMobs,nextMobs]) {
    const actorIds = new Set<number>();
    for (const value of collection.values()) {
      const mobId = Number(value.row.mobId);
      if (!Number.isInteger(mobId) || mobId < 0 || actorIds.has(mobId)) return false;
      actorIds.add(mobId);
      for (const buff of value.snapshot.buffs.values()) {
        if (actorIds.has(buff.id)) return false;
        actorIds.add(buff.id);
      }
    }
  }
  const targetBefore = previousMobs.get(targetEntityId)!;
  const targetAfter = nextMobs.get(targetEntityId)!;
  if (Number(targetBefore.row.mobId)!==targetActorId || Number(targetAfter.row.mobId)!==targetActorId) return false;
  const source = targetBefore.snapshot.buffs.get(sourceKey);
  if (!source || Math.abs(source.time-clock)>0.06 || targetAfter.snapshot.buffs.has(sourceKey)) return false;

  const isTerrorExpiry = actorClass === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Terror";
  let expectedTargetStateTag = String(targetBefore.snapshot.data.state || "");
  let expectedTargetStateName = String(targetBefore.row.state || "");
  if (isTerrorExpiry) {
    const hasDread = Array.from(targetBefore.snapshot.buffs.values())
      .some(row=>row.className==="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Dread");
    if (hasDread) {
      // Dread normally replaces Terror during attach; keep a defensive native no-transition branch.
      if (expectedTargetStateTag==="FLEEING") return false;
    } else if (expectedTargetStateTag==="FLEEING") {
      const enemySeen = targetBefore.snapshot.data.seen === true;
      expectedTargetStateTag = enemySeen ? "HUNTING" : "WANDERING";
      expectedTargetStateName = enemySeen ? "Hunting" : "Wandering";
    }
  }

  for (const [entityId,before] of previousMobs) {
    const after = nextMobs.get(entityId);
    if (!after) return false;
    const beforeRow = {...before.row}, afterRow = {...after.row};
    for (const row of [beforeRow,afterRow]) {
      delete row.cooldown;
      delete row.buffs;
      delete row.serializedBundle;
    }
    if (isTerrorExpiry && entityId===targetEntityId) {
      if (String(afterRow.state || "")!==expectedTargetStateName) return false;
      delete beforeRow.state;
      delete afterRow.state;
    }
    if (!sameNativeItemValue(beforeRow,afterRow)) return false;

    const beforeMobData = {...before.snapshot.data}, afterMobData = {...after.snapshot.data};
    delete beforeMobData.buffs;
    delete afterMobData.buffs;
    if (isTerrorExpiry && entityId===targetEntityId) {
      if (String(afterMobData.state || "")!==expectedTargetStateTag
          || afterMobData.seen!==beforeMobData.seen) return false;
      delete beforeMobData.state;
      delete afterMobData.state;
    }
    if (!sameNativeItemValue(beforeMobData,afterMobData)) return false;

    const beforeBuffs = before.snapshot.buffs, afterBuffs = after.snapshot.buffs;
    for (const [key,row] of beforeBuffs) {
      if (entityId===targetEntityId && key===sourceKey) continue;
      const nextRow = afterBuffs.get(key);
      if (!nextRow || row.bundle!==nextRow.bundle) return false;
    }
    if (afterBuffs.size !== beforeBuffs.size - (entityId===targetEntityId ? 1 : 0)) return false;
  }

  const beforeHero = nativeMobBuffHeroStableState(trustedHeroStateValue,clock,false);
  const afterHero = nativeMobBuffHeroStableState(next.heroStateJson,clock,true);
  if (!beforeHero || !afterHero || !sameNativeItemValue(beforeHero,afterHero)) return false;
  const beforeRemoteHeroIds = nativeMobBuffRemoteHeroActorIds(previous);
  const afterRemoteHeroIds = nativeMobBuffRemoteHeroActorIds(next);
  if (!beforeRemoteHeroIds || !afterRemoteHeroIds
      || !sameNativeItemValue([...beforeRemoteHeroIds].sort((a,b)=>a-b),
        [...afterRemoteHeroIds].sort((a,b)=>a-b))) return false;

  const beforeMetadata = nativeMobBuffExpiryMetadata(previous.nativeLevelMetadataBundle,clock,false);
  const afterMetadata = nativeMobBuffExpiryMetadata(next.nativeLevelMetadataBundle,clock);
  const beforeBlobs = nativeMobBuffExpiryBlobs(previous,clock,false);
  const afterBlobs = nativeMobBuffExpiryBlobs(next,clock);
  const beforeHeroIds = nativeMobBuffHeroActorIds(trustedHeroStateValue);
  const afterHeroIds = nativeMobBuffHeroActorIds(next.heroStateJson);
  if (!beforeMetadata || !afterMetadata || !beforeBlobs || !afterBlobs
      || !beforeHeroIds || !afterHeroIds) return false;
  const beforeActorIds = nativeMobBuffActorIds(
    previousMobs,beforeHeroIds,beforeRemoteHeroIds,beforeBlobs,beforeMetadata);
  const afterActorIds = nativeMobBuffActorIds(
    nextMobs,afterHeroIds,afterRemoteHeroIds,afterBlobs,afterMetadata);
  // The source must be present in the trusted pre-state and permanently absent after expiry.
  // Actor IDs are monotonic within one native scheduler; another surviving Actor cannot inherit
  // the just-detached Buff's ID in the same accepted turn.
  if (!beforeActorIds || !afterActorIds || !beforeActorIds.has(actorId) || afterActorIds.has(actorId)
      || !sameNativeItemValue([...beforeHeroIds].sort((a,b)=>a-b),[...afterHeroIds].sort((a,b)=>a-b))) return false;

  for (const key of ["schemaVersion","branch","depth","width","height","entrancePos","exitPos","seed",
    "locked","feeling","levelClass","tiles","transitions","heaps","traps","plants","visitedPositions","mappedPositions"]) {
    if (!sameNativeItemValue(previous[key],next[key])) return false;
  }
  if (!sameNativeItemValue(beforeMetadata,afterMetadata)
      || beforeBlobs.size!==afterBlobs.size) return false;
  for (const [className,row] of beforeBlobs) {
    const other = afterBlobs.get(className);
    if (!other || row.bundle!==other.bundle) return false;
  }
  return true;
}

/**
 * Accepts only a fresh full snapshot emitted by the native Java Actor scheduler, after validating
 * that its actor existed in the previous authoritative world. TypeScript deliberately does not
 * reconstruct Mob AI moves or damage; it only sequences the already-resolved native state.
 */
