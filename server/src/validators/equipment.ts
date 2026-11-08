import { parseNativeBundleObject } from "./abilities";
import { parseNativeInventoryIndex } from "./inventory-claims";
import { itemValueWithout, sameNativeItemValue } from "./inventory-economy";

export function parseNativeQuickslotIndex(heroValue: any): any[] | null {
  if (!heroValue || typeof heroValue !== "object") return null;
  if (heroValue.quickslotsJson === undefined) return [];
  if (typeof heroValue.quickslotsJson !== "string" || heroValue.quickslotsJson.length > 200000) return null;
  const inventory = parseNativeInventoryIndex(heroValue);
  if (!inventory) return null;
  let slots: any;
  try { slots = JSON.parse(heroValue.quickslotsJson); } catch (_) { return null; }
  if (!Array.isArray(slots) || slots.length > 6) return null;
  const usedSlots = new Set<number>(), usedIds = new Set<string>();
  const inventoryById = new Map<string, any>(inventory.map((item: any) => [String(item.itemId), item]));
  for (const entry of slots) {
    const slot = entry?.slot, id = String(entry?.itemId || ""), cls = String(entry?.className || "");
    const quantity = entry?.quantity, bundle = entry?.serializedBundle;
    if (!Number.isInteger(slot) || slot < 0 || slot >= 6 || usedSlots.has(slot)
        || id.length < 8 || id.length > 80 || usedIds.has(id)
        || cls.length < 1 || cls.length > 256 || !Number.isInteger(quantity) || quantity < 0 || quantity > 100000
        || typeof bundle !== "string" || bundle.length < 1 || bundle.length > 200000 || !bundle.includes(id)) return null;
    const inventoryItem = inventoryById.get(id);
    if (quantity > 0 && (!inventoryItem || String(inventoryItem.className) !== cls
        || Number(inventoryItem.quantity) !== quantity || String(inventoryItem.serializedBundle) !== bundle)) return null;
    if (quantity === 0 && inventoryItem) return null;
    usedSlots.add(slot);
    usedIds.add(id);
  }
  return slots;
}

/** Equipment intents must identify the exact owned item and the authenticated hero's current cell. */
export function nativeEquipmentBundleItem(value: any): any | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.item && typeof value.item === "object" && !Array.isArray(value.item)) return value.item;
  return value;
}

function nativeEquipmentRowItem(row: any): any | null {
  if (!row || typeof row.serializedBundle !== "string") return null;
  let root: any;
  try { root = JSON.parse(row.serializedBundle); } catch (_) { return null; }
  const item = nativeEquipmentBundleItem(root);
  if (!item || String(item.__className || "") !== String(row.className || "")
      || String(item.multiplayer_item_id || "") !== String(row.itemId || "")) return null;
  if (typeof item.cursedKnown !== "boolean" || item.cursedKnown !== (row.cursedKnown === true)) return null;
  return item;
}

function nativeEquipmentPayloadId(value: any): string {
  const item = nativeEquipmentBundleItem(value);
  return item ? String(item.multiplayer_item_id || "") : "";
}

function nativeEquipmentComparableItem(value: any): any {
  const item = nativeEquipmentBundleItem(value);
  if (!item) return null;
  const copy: any = {...item};
  delete copy.quickslotpos;
  delete copy.cursedKnown;
  return copy;
}

export function nativeEquipmentPayloadMatchesRow(payload: any, row: any): boolean {
  const item = nativeEquipmentBundleItem(payload), expected = nativeEquipmentRowItem(row);
  return !!item && !!expected && String(item.multiplayer_item_id || "") === String(row.itemId)
    && String(item.__className || "") === String(row.className)
    && sameNativeItemValue(nativeEquipmentComparableItem(item), nativeEquipmentComparableItem(expected))
    && item.cursedKnown === (row.cursedKnown === true);
}

export function nativeEquipmentRowBundleTransitionMatches(before: any, after: any, allowCurseKnowledge: boolean): boolean {
  const oldItem = nativeEquipmentRowItem(before), newItem = nativeEquipmentRowItem(after);
  if (!oldItem || !newItem || String(before.itemId) !== String(after.itemId)
      || String(before.className) !== String(after.className)
      || String(oldItem.multiplayer_item_id) !== String(newItem.multiplayer_item_id)
      || (before.cursedKnown === true && after.cursedKnown !== true)
      || (!allowCurseKnowledge && before.cursedKnown !== after.cursedKnown)) return false;
  return sameNativeItemValue(nativeEquipmentComparableItem(oldItem), nativeEquipmentComparableItem(newItem));
}

export function nativeEquipmentQuickslotPositionMatches(row: any, slots: any[]): boolean {
  const item = nativeEquipmentRowItem(row);
  if (!item) return false;
  const slot = slots.find((entry: any) => String(entry.itemId) === String(row.itemId));
  if (!slot) return !Object.prototype.hasOwnProperty.call(item, "quickslotpos");
  return Number(item.quickslotpos) === Number(slot.slot);
}

function nativeEquipmentQuickslotBundleMatchesRow(serializedBundle: unknown, row: any): boolean {
  if (typeof serializedBundle !== "string") return false;
  let payload: any;
  try { payload = JSON.parse(serializedBundle); } catch (_) { return false; }
  return nativeEquipmentPayloadMatchesRow(payload, row);
}


export function nativeEquipmentTalentPoints(combat: any, talent: string): number {
  if (!combat || typeof combat !== "object") return 0;
  let points = 0;
  for (let tier = 1; tier <= 4; tier++) {
    const values = combat["talents_tier_" + tier];
    if (values && typeof values === "object" && !Array.isArray(values)) {
      const value = values[talent];
      if (value !== undefined) points = Math.max(points, Number(value) || 0);
    }
  }
  return points;
}

/** Only the native equipment actions whose side effects are fully represented by the current protocol are admitted. */
function isSupportedNativeEquipmentIntent(hero: any, item: any, action: string): boolean {
  const className = String(item?.className || "");
  const combat = parseNativeBundleObject(hero?.combatBundle);
  const belongings = parseNativeBundleObject(hero?.inventoryBundle);
  const decoded = nativeEquipmentRowItem(item);
  if (!combat || !belongings || !decoded || !Array.isArray(belongings.inventory)) return false;
  const weapon = className.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.weapon.");
  const armor = className.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.armor.");
  if (!weapon && !armor) return false;
  if (weapon && (className.endsWith(".MagesStaff") || String(combat.subClass || "") === "CHAMPION"
      || (className.includes(".items.weapon.melee.") && String(combat.class || "") === "DUELIST"))) return false;
  if (armor && (/(Warrior|Rogue|Mage|Huntress|Duelist|Cleric)Armor$/.test(className)
      || decoded.seal != null)) return false;
  const heroInventory = parseNativeInventoryIndex(hero);
  if (!heroInventory) return false;
  if (weapon && String(combat.class || "") === "DUELIST"
      && heroInventory.some((candidate: any) => candidate.equipped === true
        && String(candidate.className || "").includes(".items.weapon.melee."))) return false;
  if (action === "EQUIP") {
    if (weapon && nativeEquipmentTalentPoints(combat, "SWIFT_EQUIP") > 0) return false;
    // onItemEquipped can mutate the equipped bundle even when identification is already
    // known (Shard of Oblivion switches it to setIDReady instead).
    if (weapon && nativeEquipmentTalentPoints(combat, "ADVENTURERS_INTUITION") === 2) return false;
    if (armor && nativeEquipmentTalentPoints(combat, "VETERANS_INTUITION") === 2) return false;
    if (String(combat.class || "") !== "CLERIC"
        && nativeEquipmentTalentPoints(combat, "HOLY_INTUITION") > 0
        && item.cursed === true && item.cursedKnown !== true) return false;
    if (armor) {
      const oldArmor = heroInventory.filter((candidate: any) => candidate.equipped === true
        && String(candidate.className || "").startsWith("com.shatteredpixel.shatteredpixeldungeon.items.armor."));
      if (oldArmor.length > 1) return false;
      if (oldArmor.length === 1) {
        const oldData = nativeEquipmentRowItem(oldArmor[0]);
        if (!oldData || oldData.seal != null) return false;
      }
    }
    // The standard equip code first detaches the selected item from the backpack. Restrict
    // this protocol to direct backpack entries so a nested-bag transfer cannot drop old gear.
    const id = String(item.itemId || "");
    const direct = belongings.inventory.filter((entry: any) => nativeEquipmentPayloadId(entry) === id);
    if (direct.length !== 1) return false;
  } else if (action === "UNEQUIP") {
    const backpack = belongings.inventory;
    const bagCount = backpack.filter((entry: any) =>
      nativeEquipmentPayloadId(entry) && String(nativeEquipmentBundleItem(entry)?.__className || "")
        .startsWith("com.shatteredpixel.shatteredpixeldungeon.items.bags.")).length;
    const capacity = Math.max(0, 20 + bagCount - (belongings.second_wep ? 1 : 0));
    if (backpack.length >= capacity) return false;
  }
  return true;
}

export function isValidNativeEquipmentIntent(heroStateValue: unknown, dataValue: unknown, actionValue: unknown,
  currentDepthValue: unknown, player: any): boolean {
  const data: any = dataValue, action = String(actionValue || ""), depth = Number(currentDepthValue);
  if (!["EQUIP", "UNEQUIP"].includes(action) || typeof heroStateValue !== "string" || !data || !player
      || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || Number(data.depth) !== depth || data.from !== Number(player.pos) || data.to !== Number(player.pos)
      || data.targetPos !== Number(player.pos) || typeof data.itemId !== "string"
      || data.itemId.length < 8 || data.itemId.length > 80 || typeof data.itemClass !== "string"
      || data.itemClass.length < 1 || data.itemClass.length > 256
      || data.expectedEquipped !== (action === "EQUIP") || !Number.isFinite(data.engineActionCost)
      || data.engineActionCost < 0 || data.engineActionCost > 10) return false;
  let hero: any;
  try { hero = JSON.parse(heroStateValue); } catch (_) { return false; }
  if (Number(hero?.pos) !== Number(player.pos) || !Number.isInteger(hero?.hp) || hero.hp <= 0) return false;
  const inventory = parseNativeInventoryIndex(hero);
  if (!inventory || !parseNativeQuickslotIndex(hero)) return false;
  const target = inventory.filter((item: any) => String(item.itemId) === data.itemId);
  return target.length === 1 && String(target[0].className) === data.itemClass
    && target[0].equipped === (action !== "EQUIP")
    && isSupportedNativeEquipmentIntent(hero, target[0], action);
}

/** A native equipment snapshot may only move one exact item between its typed Hero slot and backpack. */
export function isValidNativeEquipmentBelongingsMutation(previous: any, next: any, before: any[], after: any[],
  action: string, itemId: string, itemClass: string): boolean {
  const oldBelongings = parseNativeBundleObject(previous?.inventoryBundle);
  const newBelongings = parseNativeBundleObject(next?.inventoryBundle);
  if (!oldBelongings || !newBelongings || !Array.isArray(oldBelongings.inventory)
      || !Array.isArray(newBelongings.inventory)) return false;
  const slot = itemClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.weapon.") ? "weapon"
    : itemClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.armor.") ? "armor" : "";
  if (!slot) return false;
  for (const field of ["weapon", "armor", "artifact", "misc", "ring", "second_wep"]) {
    if (field !== slot && !sameNativeItemValue(oldBelongings[field], newBelongings[field])) return false;
  }
  const oldTarget = before.find(row => String(row.itemId) === itemId);
  const newTarget = after.find(row => String(row.itemId) === itemId);
  if (!oldTarget || !newTarget) return false;
  const oldEquipped = before.filter(row => row.equipped === true && row.className.startsWith(
    "com.shatteredpixel.shatteredpixeldungeon.items." + (slot === "weapon" ? "weapon." : "armor.")));
  if (oldEquipped.length > 1) return false;
  const replaced = action === "EQUIP" ? oldEquipped.find(row => String(row.itemId) !== itemId) || null : null;
  const priorSlotId = nativeEquipmentPayloadId(oldBelongings[slot]);
  const nextSlotId = nativeEquipmentPayloadId(newBelongings[slot]);
  if (action === "EQUIP") {
    if (oldTarget.equipped !== false || newTarget.equipped !== true || nextSlotId !== itemId
        || priorSlotId !== (replaced ? String(replaced.itemId) : "")
        || (replaced
          ? !nativeEquipmentPayloadMatchesRow(oldBelongings[slot], replaced)
          : oldBelongings[slot] != null)
        || !nativeEquipmentPayloadMatchesRow(newBelongings[slot], newTarget)) return false;
  } else {
    if (oldTarget.equipped !== true || newTarget.equipped !== false || priorSlotId !== itemId
        || nextSlotId !== "" || !nativeEquipmentPayloadMatchesRow(oldBelongings[slot], oldTarget)
        || newBelongings[slot] != null) return false;
  }

  const oldRootItems = oldBelongings.inventory.map(nativeEquipmentBundleItem);
  const newRootItems = newBelongings.inventory.map(nativeEquipmentBundleItem);
  if (oldRootItems.some((item: any) => !item || !nativeEquipmentPayloadId(item))
      || newRootItems.some((item: any) => !item || !nativeEquipmentPayloadId(item))) return false;
  const oldIds = oldRootItems.map((item: any) => nativeEquipmentPayloadId(item));
  const newIds = newRootItems.map((item: any) => nativeEquipmentPayloadId(item));
  if (new Set(oldIds).size !== oldIds.length || new Set(newIds).size !== newIds.length) return false;
  const oldDirectTarget = oldIds.filter((id: string) => id === itemId).length;
  if (action === "EQUIP" ? oldDirectTarget !== 1 : oldDirectTarget !== 0) return false;

  const expected = oldRootItems.slice();
  if (action === "EQUIP") {
    expected.splice(expected.findIndex((item: any) => nativeEquipmentPayloadId(item) === itemId), 1);
    if (replaced) {
      const row = after.find(candidate => String(candidate.itemId) === String(replaced.itemId));
      const item = nativeEquipmentRowItem(row);
      if (!item || row.equipped !== false) return false;
      expected.push(item);
    }
  } else {
    const item = nativeEquipmentRowItem(newTarget);
    if (!item) return false;
    expected.push(item);
  }
  if (expected.length !== newRootItems.length) return false;
  const beforeById = new Map<string, any>(before.map(row => [String(row.itemId), row]));
  const afterById = new Map<string, any>(after.map(row => [String(row.itemId), row]));
  for (let index = 0; index < expected.length; index++) {
    const expectedId = nativeEquipmentPayloadId(expected[index]);
    const actualId = nativeEquipmentPayloadId(newRootItems[index]);
    if (expectedId !== actualId) return false;
    const row = afterById.get(actualId);
    if (!row || row.equipped !== false || !nativeEquipmentPayloadMatchesRow(newRootItems[index], row)) return false;
  }
  for (const payload of oldRootItems) {
    const id = nativeEquipmentPayloadId(payload), row = beforeById.get(id);
    if (!row || row.equipped !== false || !nativeEquipmentPayloadMatchesRow(payload, row)) return false;
  }
  return true;
}

export function isValidNativeEquipmentCombatBundleMutation(previous: any, next: any): boolean {
  const beforeCombat = parseNativeBundleObject(previous?.combatBundle);
  const afterCombat = parseNativeBundleObject(next?.combatBundle);
  const beforeBelongings = parseNativeBundleObject(previous?.inventoryBundle);
  const afterBelongings = parseNativeBundleObject(next?.inventoryBundle);
  const beforeCooldown = Number(previous?.cooldown), afterCooldown = Number(next?.cooldown);
  const beforeTime = Number(beforeCombat?.time), afterTime = Number(afterCombat?.time);
  if (!beforeCombat || !afterCombat || !beforeBelongings || !afterBelongings
      || !Number.isFinite(beforeCooldown) || !Number.isFinite(afterCooldown)
      || !Number.isFinite(beforeTime) || !Number.isFinite(afterTime)
      || afterCooldown < beforeCooldown - 0.06 || afterTime < beforeTime - 0.06
      || Math.abs((afterTime - beforeTime) - (afterCooldown - beforeCooldown)) > 0.06) return false;
  const belongingsKeys = new Set<string>([...Object.keys(beforeBelongings), ...Object.keys(afterBelongings)]);
  const extract = (bundle: any) => {
    const result: any = {};
    for (const key of belongingsKeys) {
      if (Object.prototype.hasOwnProperty.call(bundle, key)) result[key] = bundle[key];
    }
    return result;
  };
  if (!sameNativeItemValue(extract(beforeCombat), beforeBelongings)
      || !sameNativeItemValue(extract(afterCombat), afterBelongings)) return false;
  const withoutBelongingsAndTime = (value: any) => {
    const copy: any = {...value};
    for (const key of belongingsKeys) delete copy[key];
    delete copy.time;
    return copy;
  };
  return sameNativeItemValue(withoutBelongingsAndTime(beforeCombat), withoutBelongingsAndTime(afterCombat));
}

/** Checks native equip/unequip output without allowing any item, quantity, Gold, HP or shield forgery. */
export function isValidNativeEquipmentMutation(previousValue: unknown, nextValue: unknown, actionValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); } catch (_) { return false; }
  const action = String(actionValue || ""), details: any = detailsValue, accepted: any = acceptedValue;
  if (!["EQUIP", "UNEQUIP"].includes(action) || !details || !accepted
      || accepted.actionType !== action || accepted.itemId !== details.itemId || accepted.itemClass !== details.itemClass
      || accepted.expectedEquipped !== details.expectedEquipped || details.expectedEquipped !== (action === "EQUIP")
      || previous.hp !== next.hp || previous.ht !== next.ht || previous.pos !== next.pos
      || previous.shielding !== next.shielding || previous.gold !== next.gold
      || previous.alchemyEnergy !== next.alchemyEnergy || previous.ankhCount !== next.ankhCount
      || previous.blessedAnkhCount !== next.blessedAnkhCount
      || previous.ironKeyCount !== next.ironKeyCount || previous.crystalKeyCount !== next.crystalKeyCount
      || previous.wornKeyCount !== next.wornKeyCount || previous.goldenKeyCount !== next.goldenKeyCount
      || previous.notesBundle !== next.notesBundle || previous.questStateBundle !== next.questStateBundle
      || !isValidNativeEquipmentCombatBundleMutation(previous, next)) return false;
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!before || !after || !beforeSlots || !afterSlots || before.length !== after.length
      || beforeSlots.length !== afterSlots.length) return false;
  const beforeMap = new Map<string, any>(before.map((item: any) => [String(item.itemId), item]));
  const afterMap = new Map<string, any>(after.map((item: any) => [String(item.itemId), item]));
  if (beforeMap.size !== afterMap.size) return false;
  let targetFound = false, priorEquipmentUnequipped = 0, replacedItemId = "";
  for (const old of before) {
    const current = afterMap.get(String(old.itemId));
    if (!current) return false;
    const target = String(old.itemId) === String(details.itemId);
    if (target) {
      if (String(old.className) !== String(details.itemClass) || old.equipped !== (action !== "EQUIP")
          || current.equipped !== (action === "EQUIP")
          || !sameNativeItemValue(itemValueWithout(old, ["equipped", "cursedKnown", "serializedBundle"]),
            itemValueWithout(current, ["equipped", "cursedKnown", "serializedBundle"]))
          || old.cursed !== current.cursed
          || (old.cursedKnown && !current.cursedKnown)
          || !nativeEquipmentRowBundleTransitionMatches(old, current, true)) return false;
      targetFound = true;
    } else {
      if (!sameNativeItemValue(itemValueWithout(old, ["equipped", "serializedBundle"]),
            itemValueWithout(current, ["equipped", "serializedBundle"]))) return false;
      if (old.equipped !== current.equipped) {
        if (action !== "EQUIP" || old.equipped !== true || current.equipped !== false
            || old.className.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.weapon.")
              !== String(details.itemClass).startsWith("com.shatteredpixel.shatteredpixeldungeon.items.weapon.")
            || old.className.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.armor.")
              !== String(details.itemClass).startsWith("com.shatteredpixel.shatteredpixeldungeon.items.armor.")
            || !nativeEquipmentRowBundleTransitionMatches(old, current, false)) return false;
        priorEquipmentUnequipped++;
        replacedItemId = String(old.itemId);
      } else if (String(old.serializedBundle) !== String(current.serializedBundle)
          || old.cursedKnown !== current.cursedKnown) return false;
    }
  }
  if (!targetFound || priorEquipmentUnequipped > 1) return false;
  for (const row of before) if (!nativeEquipmentQuickslotPositionMatches(row, beforeSlots)) return false;
  for (const row of after) if (!nativeEquipmentQuickslotPositionMatches(row, afterSlots)) return false;

  const beforeSlotsByIndex = new Map<number, any>(beforeSlots.map((slot: any) => [Number(slot.slot), slot]));
  const afterSlotsByIndex = new Map<number, any>(afterSlots.map((slot: any) => [Number(slot.slot), slot]));
  if (beforeSlotsByIndex.size !== afterSlotsByIndex.size) return false;
  const targetHadSlot = beforeSlots.some((slot: any) => String(slot.itemId) === String(details.itemId));
  const transferredSlot = action === "EQUIP" && !targetHadSlot && replacedItemId
    ? beforeSlots.find((slot: any) => String(slot.itemId) === replacedItemId) || null : null;
  if (!targetHadSlot && action === "EQUIP" && replacedItemId
      && beforeSlots.some((slot: any) => String(slot.itemId) === replacedItemId) && !transferredSlot) return false;
  for (const [slotIndex, oldSlot] of beforeSlotsByIndex) {
    const current = afterSlotsByIndex.get(slotIndex);
    if (!current) return false;
    const expectedId = transferredSlot && Number(transferredSlot.slot) === slotIndex
      ? String(details.itemId) : String(oldSlot.itemId);
    if (String(current.itemId) !== expectedId) return false;
    const currentItem = afterMap.get(expectedId);
    const oldItem = beforeMap.get(String(oldSlot.itemId));
    if (!currentItem || !oldItem || String(current.className) !== String(currentItem.className)
        || Number(current.quantity) !== Number(currentItem.quantity)
        || !nativeEquipmentQuickslotBundleMatchesRow(current.serializedBundle, currentItem)) return false;
    if (expectedId === String(details.itemId)) {
      if (String(current.className) !== String(details.itemClass)) return false;
    } else if (String(current.className) !== String(oldSlot.className)
        || Number(current.quantity) !== Number(oldSlot.quantity)) return false;
  }
  return isValidNativeEquipmentBelongingsMutation(previous, next, before, after, action,
    String(details.itemId), String(details.itemClass));
}

/** Chest opening must preserve the same heap/items and consume only the proper key counter. */
export function isValidNativeChestHeapMutation(previousHeaps: any, nextHeaps: any, targetValue: unknown,
  detailsValue: unknown, acceptedValue: unknown, previousHeroValue: unknown, nextHeroValue: unknown): boolean {
  const target = Number(targetValue), details: any = detailsValue, accepted: any = acceptedValue;
  let beforeHero: any, afterHero: any;
  try { beforeHero = JSON.parse(String(previousHeroValue || "")); afterHero = JSON.parse(String(nextHeroValue || "")); }
  catch (_) { return false; }
  if (!Array.isArray(previousHeaps) || !Array.isArray(nextHeaps) || !details || !accepted
      || accepted.actionType !== "OPEN_CHEST" || accepted.heapId !== details.heapId
      || accepted.heapType !== details.heapType || accepted.targetPos !== target
      || !["CHEST", "LOCKED_CHEST", "CRYSTAL_CHEST"].includes(String(details.heapType))
      || beforeHero.gold !== afterHero.gold
      || beforeHero.inventoryBundle !== afterHero.inventoryBundle
      || !sameNativeItemValue(parseNativeInventoryIndex(beforeHero), parseNativeInventoryIndex(afterHero))
      || beforeHero.quickslotsJson !== afterHero.quickslotsJson) return false;
  const oldAt = previousHeaps.filter((heap: any) => Number(heap?.pos) === target);
  const newAt = nextHeaps.filter((heap: any) => Number(heap?.pos) === target);
  if (oldAt.length !== 1 || newAt.length !== 1 || String(oldAt[0].heapId || "") !== String(details.heapId)
      || String(oldAt[0].type) !== String(details.heapType) || String(newAt[0].heapId || "") !== String(details.heapId)
      || String(newAt[0].type) !== "HEAP" || !Array.isArray(oldAt[0].items) || !Array.isArray(newAt[0].items)
      || !sameNativeItemValue(oldAt[0].items, newAt[0].items)
      || oldAt[0].seen !== newAt[0].seen || oldAt[0].haunted !== newAt[0].haunted
      || oldAt[0].autoExplored !== newAt[0].autoExplored
      || !(oldAt[0].hidden === newAt[0].hidden || newAt[0].hidden === false)) return false;
  for (const old of previousHeaps) {
    if (Number(old?.pos) === target) continue;
    const matches = nextHeaps.filter((heap: any) => String(heap?.heapId || "") === String(old?.heapId || ""));
    if (matches.length !== 1 || !sameNativeItemValue(old, matches[0])) return false;
  }
  for (const current of nextHeaps) {
    if (Number(current?.pos) === target) continue;
    if (previousHeaps.filter((heap: any) => String(heap?.heapId || "") === String(current?.heapId || "")).length !== 1) return false;
  }
  for (const field of ["ironKeyCount", "crystalKeyCount", "wornKeyCount", "goldenKeyCount"]) {
    const expected = details.heapType === "LOCKED_CHEST" && field === "goldenKeyCount" ? -1
      : details.heapType === "CRYSTAL_CHEST" && field === "crystalKeyCount" ? -1 : 0;
    if (!Number.isInteger(beforeHero[field]) || !Number.isInteger(afterHero[field])
        || afterHero[field] !== beforeHero[field] + expected) return false;
  }
  if (details.heapType === "CHEST") {
    if (beforeHero.notesBundle !== afterHero.notesBundle) return false;
  } else if (typeof beforeHero.notesBundle !== "string" || typeof afterHero.notesBundle !== "string"
      || beforeHero.notesBundle === afterHero.notesBundle) return false;
  return true;
}




