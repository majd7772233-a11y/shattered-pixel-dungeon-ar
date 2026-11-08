import { parseNativeBundleObject } from "./abilities";
import { isValidNativeLootSnapshot } from "./combat-state";
import { parseNativeQuickslotIndex, nativeEquipmentBundleItem, nativeEquipmentTalentPoints } from "./equipment";
import { isValidStableMultiplayerId, isValidNativeFloorItemIdentitySet, NATIVE_MULTIPLAYER_BAG_CLASSES, nativeBagCanHoldItemClass, parseNativeInventoryIndex } from "./inventory-claims";
import { itemValueWithout, sameNativeItemValue } from "./inventory-economy";

export function isValidNativeDropIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, heroValue: unknown): boolean {
  const data: any = dataValue, depth = Number(depthValue);
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !String(playerIdValue || "") || String(player.state) !== "ALIVE"
      || !Number.isInteger(player.pos) || typeof heroValue !== "string") return false;
  const pos = Number(player.pos), heapId = String(data.heapId || ""), itemId = String(data.itemId || "");
  const resultId = String(data.resultItemId || ""), cls = String(data.itemClass || "");
  const quantity = Number(data.expectedQuantity), sourceQuantity = Number(data.sourceQuantityBefore);
  if (data.from !== pos || data.to !== pos || data.targetPos !== pos || Number(data.depth) !== depth
      || data.branch !== 0 || heapId.length < 8 || heapId.length > 80
      || itemId.length < 8 || itemId.length > 80 || resultId.length < 8 || resultId.length > 80
      || cls.length < 1 || cls.length > 256 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000
      || !Number.isInteger(sourceQuantity) || sourceQuantity < quantity || sourceQuantity > 100000
      || (quantity < sourceQuantity && data.stackable !== true)
      || typeof data.stackable !== "boolean" || !Number.isFinite(data.engineActionCost)
      || data.engineActionCost < 0 || data.engineActionCost > 10) return false;
  let hero: any;
  try { hero = JSON.parse(heroValue); } catch (_) { return false; }
  if (Number(hero?.pos) !== pos || !Number.isInteger(hero?.hp) || hero.hp <= 0) return false;
  const inventory = parseNativeInventoryIndex(hero);
  if (!inventory) return false;
  const source = inventory.filter((item: any) => String(item.itemId) === itemId);
  if (source.length !== 1 || String(source[0].className) !== cls || source[0].quantity !== sourceQuantity
      || source[0].stackable !== data.stackable) return false;

  const heapsAtCell = level.heaps.filter((heap: any) => Number(heap?.pos) === pos);
  if (heapsAtCell.length > 1) return false;
  const targetHeap = heapsAtCell[0] || null;
  if (targetHeap && (String(targetHeap.heapId || "") !== heapId
      || String(targetHeap.type) !== "HEAP" || !Array.isArray(targetHeap.items))) return false;
  if (!targetHeap && level.heaps.some((heap: any) => String(heap?.heapId || "") === heapId)) return false;
  const resultAlreadyElsewhere = level.heaps.some((heap: any) =>
    (!targetHeap || String(heap?.heapId || "") !== heapId)
      && (Array.isArray(heap?.items) ? heap.items : []).some((item: any) => String(item?.itemId || "") === resultId));
  if (resultAlreadyElsewhere) return false;

  const targetItems: any[] = targetHeap ? targetHeap.items : [];
  const resultMatches = targetItems.filter((item: any) => String(item?.itemId || "") === resultId);
  if (resultMatches.length > 1) return false;
  if (resultMatches.length === 1) {
    if (resultId === itemId || data.stackable !== true || resultMatches[0].stackable !== true
        || String(resultMatches[0].className || "") !== cls
        || !Number.isInteger(resultMatches[0].quantity) || resultMatches[0].quantity < 1) return false;
  } else if (quantity === sourceQuantity ? resultId !== itemId : resultId === itemId) {
    return false;
  }
  return true;
}
/** A drop removes its exact quantity while preserving unrelated inventory rows and quickslots. */
export function isValidNativeDropInventoryMutation(beforeValue: unknown, afterValue: unknown, detailsValue: unknown): boolean {
  let beforeHero: any, afterHero: any;
  try { beforeHero = JSON.parse(String(beforeValue || "")); afterHero = JSON.parse(String(afterValue || "")); }
  catch (_) { return false; }
  const details: any = detailsValue, before = parseNativeInventoryIndex(beforeHero), after = parseNativeInventoryIndex(afterHero);
  if (!details || !before || !after || beforeHero.gold !== afterHero.gold) return false;
  const id = String(details.itemId || ""), cls = String(details.itemClass || "");
  const dropped = Number(details.expectedQuantity), sourceQuantity = Number(details.sourceQuantityBefore);
  if (!Number.isInteger(dropped) || dropped < 1 || !Number.isInteger(sourceQuantity) || sourceQuantity < dropped
      || (dropped < sourceQuantity && details.stackable !== true)) return false;
  const oldRows = before.filter((item: any) => String(item.itemId) === id);
  const newRows = after.filter((item: any) => String(item.itemId) === id);
  if (oldRows.length !== 1 || String(oldRows[0].className) !== cls
      || oldRows[0].quantity !== sourceQuantity || oldRows[0].stackable !== details.stackable) return false;
  const remainder = sourceQuantity - dropped;
  if (remainder === 0) {
    if (newRows.length !== 0) return false;
  } else if (newRows.length !== 1 || newRows[0].quantity !== remainder
      || !sameNativeItemValue(itemValueWithout(oldRows[0], ["quantity", "serializedBundle"]),
        itemValueWithout(newRows[0], ["quantity", "serializedBundle"]))) {
    return false;
  }
  if (!sameNativeItemValue(before.filter((item: any) => String(item.itemId) !== id),
      after.filter((item: any) => String(item.itemId) !== id))) return false;

  const beforeSlots = parseNativeQuickslotIndex(beforeHero), afterSlots = parseNativeQuickslotIndex(afterHero);
  if (!beforeSlots || !afterSlots) return false;
  const oldSourceSlots = beforeSlots.filter((slot: any) => String(slot.itemId) === id);
  const newSourceSlots = afterSlots.filter((slot: any) => String(slot.itemId) === id);
  if (remainder > 0) {
    if (newSourceSlots.length !== oldSourceSlots.length) return false;
    for (const oldSlot of oldSourceSlots) {
      const newSlot = newSourceSlots.find((slot: any) => Number(slot.slot) === Number(oldSlot.slot));
      if (!newSlot || Number(newSlot.quantity) !== remainder || String(newSlot.className) !== cls
          || String(newSlot.serializedBundle) !== String(newRows[0].serializedBundle)
          || !sameNativeItemValue(itemValueWithout(oldSlot, ["quantity", "serializedBundle"]),
            itemValueWithout(newSlot, ["quantity", "serializedBundle"]))) return false;
    }
  } else {
    if (newSourceSlots.length > oldSourceSlots.length) return false;
    for (const slot of newSourceSlots) {
      const oldSlot = oldSourceSlots.find((old: any) => Number(old.slot) === Number(slot.slot));
      if (!oldSlot || Number(slot.quantity) !== 0 || String(slot.className) !== cls
          || !sameNativeItemValue(itemValueWithout(oldSlot, ["quantity", "serializedBundle"]),
            itemValueWithout(slot, ["quantity", "serializedBundle"]))) return false;
    }
  }
  const unrelatedSlots = (slots: any[]) => slots.filter((slot: any) => String(slot.itemId) !== id)
    .slice().sort((a: any,b: any) => Number(a.slot)-Number(b.slot));
  return sameNativeItemValue(unrelatedSlots(beforeSlots), unrelatedSlots(afterSlots));
}
/** The destination heap may gain one identified item or increase one compatible stack by exactly the dropped quantity. */
/** The destination heap must change only by the exact native drop or one proven-compatible merge. */
export function isValidNativeDropHeapMutation(before: any[], after: any[], targetValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  const details: any = detailsValue, accepted: any = acceptedValue, target = Number(targetValue);
  if (!Array.isArray(before) || !Array.isArray(after)
      || !isValidNativeFloorItemIdentitySet(before) || !isValidNativeFloorItemIdentitySet(after)
      || !details || !accepted || !Number.isInteger(target) || target < 0
      || accepted.actionType !== "DROP" || accepted.from !== target || accepted.targetPos !== target
      || accepted.heapId !== details.heapId || accepted.itemId !== details.itemId
      || accepted.resultItemId !== details.resultItemId || accepted.itemClass !== details.itemClass
      || accepted.expectedQuantity !== details.expectedQuantity || accepted.sourceQuantityBefore !== details.sourceQuantityBefore
      || accepted.stackable !== details.stackable) return false;
  const heapId = String(details.heapId || ""), resultId = String(details.resultItemId || "");
  const sourceId = String(details.itemId || ""), cls = String(details.itemClass || "");
  const qty = Number(details.expectedQuantity), sourceQuantity = Number(details.sourceQuantityBefore);
  if (!isValidStableMultiplayerId(heapId) || !isValidStableMultiplayerId(sourceId)
      || !isValidStableMultiplayerId(resultId) || cls.length < 1 || cls.length > 256
      || !Number.isInteger(qty) || qty < 1 || qty > 100000
      || !Number.isInteger(sourceQuantity) || sourceQuantity < qty || sourceQuantity > 100000
      || typeof details.stackable !== "boolean" || (qty < sourceQuantity && details.stackable !== true)) return false;
  const oldAt = before.filter((h: any) => Number(h?.pos) === target);
  const newAt = after.filter((h: any) => Number(h?.pos) === target);
  if (oldAt.length > 1 || newAt.length !== 1 || String(newAt[0].heapId || "") !== heapId
      || !Array.isArray(newAt[0].items) || newAt[0].items.length === 0) return false;
  const oldHeap = oldAt[0] || null, newHeap = newAt[0];
  if (oldHeap) {
    if (String(oldHeap.heapId || "") !== heapId || oldHeap.type !== newHeap.type
        || oldHeap.seen !== newHeap.seen || oldHeap.haunted !== newHeap.haunted
        || oldHeap.autoExplored !== newHeap.autoExplored
        || !(oldHeap.hidden === newHeap.hidden || newHeap.hidden === false)
        || !Array.isArray(oldHeap.items)) return false;
  } else if (newHeap.type !== "HEAP") return false;
  for (const old of before) {
    if (oldHeap && String(old.heapId || "") === heapId) continue;
    const matching = after.filter((h: any) => String(h?.heapId || "") === String(old?.heapId || ""));
    if (matching.length !== 1 || !sameNativeItemValue(old, matching[0])) return false;
  }
  for (const current of after) {
    if (String(current?.heapId || "") === heapId) continue;
    if (before.filter((h: any) => String(h?.heapId || "") === String(current?.heapId || "")).length !== 1) return false;
  }
  const oldItems: any[] = oldHeap ? oldHeap.items : [];
  const newItems: any[] = newHeap.items;
  const results = newItems.filter((i: any) => String(i?.itemId || "") === resultId);
  if (results.length !== 1) return false;
  const result = results[0], oldResult = oldItems.filter((i: any) => String(i?.itemId || "") === resultId);
  if (String(result.className || "") !== cls || result.stackable !== details.stackable
      || !Number.isInteger(result.quantity) || result.quantity < 1
      || typeof result.serializedBundle !== "string" || !result.serializedBundle.includes(resultId)) return false;
  if (!sameNativeItemValue(oldItems.filter((i: any) => String(i?.itemId || "") !== resultId),
      newItems.filter((i: any) => String(i?.itemId || "") !== resultId))) return false;
  if (oldResult.length === 0) {
    return result.quantity === qty
      && (qty === sourceQuantity ? resultId === sourceId : resultId !== sourceId);
  }
  if (oldResult.length !== 1 || resultId === sourceId || details.stackable !== true
      || oldResult[0].stackable !== true || String(oldResult[0].className || "") !== cls) return false;
  const sameBundleFields = sameNativeItemValue(
    itemValueWithout(oldResult[0], ["quantity", "serializedBundle"]),
    itemValueWithout(result, ["quantity", "serializedBundle"]));
  if (!sameBundleFields) return false;
  const oldQuantity = Number(oldResult[0].quantity);
  const exactMerge = result.quantity === oldQuantity + qty;
  const nativeMissileMerge = cls.includes(".items.weapon.missiles.")
    && result.quantity >= Math.max(1, oldQuantity - qty)
    && result.quantity <= oldQuantity + qty
    && result.serializedBundle !== oldResult[0].serializedBundle;
  return exactMerge || nativeMissileMerge;
}

export function isValidNativePickupInventoryMutation(previousValue: unknown, nextValue: unknown,
  acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); }
  catch (_) { return false; }
  const accepted: any = acceptedValue, before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  if (!accepted || accepted.actionType !== "PICKUP" || !before || !after) return false;
  const id = String(accepted.itemId || ""), cls = String(accepted.itemClass || ""), amount = Number(accepted.expectedQuantity);
  if (id.length < 8 || id.length > 80 || cls.length < 1 || cls.length > 256 || !Number.isInteger(amount)
      || amount < 1 || amount > 100000 || !Number.isInteger(previous.gold) || !Number.isInteger(next.gold)) return false;
  const beforeMap = new Map<string, any>(before.map((item: any) => [String(item.itemId), item]));
  const afterMap = new Map<string, any>(after.map((item: any) => [String(item.itemId), item]));
  if (cls.endsWith(".Gold")) return next.gold === previous.gold + amount && sameNativeItemValue(before, after);
  if (previous.gold !== next.gold) return false;
  if (NATIVE_MULTIPLAYER_BAG_CLASSES.has(cls)) {
    const bundleText = String(accepted.itemBundle || "");
    const bundleRoot = parseNativeBundleObject(bundleText);
    const bagItem = nativeEquipmentBundleItem(bundleRoot);
    if (!bundleText || !bagItem || String(bagItem.__className || "") !== cls
        || !Array.isArray(bagItem.inventory) || bagItem.inventory.length !== 0
        || amount !== 1 || accepted.stackable !== false || typeof accepted.itemBundle !== "string") return false;
    const added = after.filter((row:any) => String(row.itemId) === id);
    if (added.length !== 1 || added[0].containerId !== "BACKPACK" || added[0].equipped !== false
        || String(added[0].className) !== cls || added[0].quantity !== 1
        || String(added[0].serializedBundle) !== bundleText || beforeMap.has(id)
        || after.length !== before.length + 1
        || !sameNativeItemValue(before, after.filter((row:any) => String(row.itemId) !== id))) return false;
    for (const existing of before) {
      if (existing.containerId === "BACKPACK" && nativeBagCanHoldItemClass(cls, existing.className)) return false;
    }
    const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
    if (!beforeSlots || !afterSlots) return false;
    const oldForBag = beforeSlots.filter((slot:any) => String(slot.itemId) === id);
    const newForBag = afterSlots.filter((slot:any) => String(slot.itemId) === id);
    if (oldForBag.length > 1 || newForBag.length > 1) return false;
    if (oldForBag.length === 0) {
      if (newForBag.length !== 0) return false;
    } else if (oldForBag[0].quantity !== 0 || newForBag.length !== 1
        || Number(newForBag[0].slot) !== Number(oldForBag[0].slot)
        || newForBag[0].className !== cls || newForBag[0].quantity !== 1
        || newForBag[0].serializedBundle !== bundleText) return false;
    const withoutBag = (slots:any[]) => slots.filter((slot:any) => String(slot.itemId) !== id)
      .slice().sort((a:any,b:any) => Number(a.slot)-Number(b.slot));
    return sameNativeItemValue(withoutBag(beforeSlots), withoutBag(afterSlots));
  }
  if (cls.endsWith(".EnergyCrystal")) {
    const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
    return previous.inventoryBundle === next.inventoryBundle
      && Number.isInteger(previous.alchemyEnergy) && previous.alchemyEnergy >= 0
      && Number.isInteger(next.alchemyEnergy)
      && next.alchemyEnergy === previous.alchemyEnergy + amount
      && next.alchemyEnergy <= 1000000
      && sameNativeItemValue(before, after)
      && beforeSlots != null && afterSlots != null
      && sameNativeItemValue(beforeSlots, afterSlots);
  }
  if (cls.includes(".items.keys.")) {
    const field = cls.endsWith("IronKey") ? "ironKeyCount" : cls.endsWith("CrystalKey") ? "crystalKeyCount"
      : cls.endsWith("WornKey") ? "wornKeyCount" : cls.endsWith("GoldenKey") ? "goldenKeyCount" : "";
    if (!field || !sameNativeItemValue(before, after)) return false;
    for (const key of ["ironKeyCount", "crystalKeyCount", "wornKeyCount", "goldenKeyCount"]) {
      const oldCount = Number(previous[key]), newCount = Number(next[key]);
      if (!Number.isInteger(oldCount) || !Number.isInteger(newCount)
          || newCount !== oldCount + (key === field ? 1 : 0)) return false;
    }
    return true;
  }
  if (cls.endsWith(".Guidebook")) return sameNativeItemValue(before, after);
  const carrierPattern = cls.endsWith(".Dewdrop") ? /\.Waterskin$/
    : cls.endsWith("TimekeepersHourglass$sandBag") ? /\.TimekeepersHourglass$/
      : cls.endsWith("DriedRose$Petal") ? /\.DriedRose$/ : null;
  if (carrierPattern) {
    if (sameNativeItemValue(before, after)) return true;
    if (before.length !== after.length) return false;
    let changed = 0;
    for (const old of before) {
      const current = afterMap.get(String(old.itemId));
      if (!current) return false;
      if (sameNativeItemValue(old, current)) continue;
      if (!carrierPattern.test(String(old.className))
          || !sameNativeItemValue(itemValueWithout(old, ["serializedBundle"]),
            itemValueWithout(current, ["serializedBundle"]))) return false;
      changed++;
    }
    return changed === 1;
  }
  if (beforeMap.has(id)) return false;
  const changedStacks = before.filter((old: any) => {
    const current = afterMap.get(String(old.itemId));
    return !!current && !sameNativeItemValue(old, current);
  });
  if (changedStacks.length === 1) {
    const old = changedStacks[0], current = afterMap.get(String(old.itemId));
    return old.stackable === true && accepted.stackable === true && String(old.className) === cls
      && current.quantity === old.quantity + amount && current.stackable === true
      && sameNativeItemValue(itemValueWithout(old, ["quantity", "serializedBundle"]),
        itemValueWithout(current, ["quantity", "serializedBundle"]))
      && before.length === after.length
      && sameNativeItemValue(before.filter((item: any) => String(item.itemId) !== String(old.itemId)),
        after.filter((item: any) => String(item.itemId) !== String(old.itemId)));
  }
  if (changedStacks.length > 0 || after.length !== before.length + 1) return false;
  const added = after.filter((item: any) => !beforeMap.has(String(item.itemId)));
  return added.length === 1 && String(added[0].itemId) === id && String(added[0].className) === cls
    && added[0].quantity === amount && added[0].stackable === accepted.stackable
    && sameNativeItemValue(before, after.filter((item: any) => String(item.itemId) !== id));
}

/** Validates a pickup request against one exact stable heap and its current top item. */
export function isValidNativePickupIntent(level: any, dataValue: unknown, currentDepthValue: unknown,
  playerIdValue: unknown, player: any, trustedHeroStateValue?: unknown): boolean {
  const data: any = dataValue;
  const playerId = String(playerIdValue || "");
  const depth = Number(currentDepthValue);
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps)
      || !isValidNativeFloorItemIdentitySet(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || playerId.length === 0 || String(player.state) !== "ALIVE"
      || !Number.isInteger(player.pos)) return false;
  const pos = Number(data.itemPos), heapId = String(data.heapId || ""), itemId = String(data.itemId || "");
  const itemClass = String(data.itemClass || ""), quantity = data.expectedQuantity, stackable = data.stackable;
  const cost = data.engineActionCost;
  if (!Number.isInteger(pos) || pos !== Number(player.pos) || data.from !== pos || data.to !== pos
      || data.targetPos !== pos || data.depth !== depth || data.branch !== level.branch || data.branch !== 0
      || heapId.length < 8 || heapId.length > 80 || itemId.length < 8 || itemId.length > 80
      || itemClass.length === 0 || itemClass.length > 256
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000
      || typeof stackable !== "boolean" || !Number.isFinite(cost) || cost < 0 || cost > 10) return false;
  const matches = level.heaps.filter((heap: any) => String(heap?.heapId || "") === heapId);
  if (matches.length !== 1) return false;
  const heap = matches[0];
  if (Number(heap.pos) !== pos || String(heap.type) !== "HEAP" || !Array.isArray(heap.items) || heap.items.length === 0) return false;
  const top = heap.items[0];
  if (String(top?.itemId || "") !== itemId || String(top?.className || "") !== itemClass
      || Number(top?.quantity) !== quantity || top?.stackable !== stackable
      || typeof top?.serializedBundle !== "string" || !top.serializedBundle.includes(itemId)) return false;
  if (data.itemBundle !== undefined && (typeof data.itemBundle !== "string"
      || data.itemBundle !== top.serializedBundle)) return false;
  // Talent.onItemCollected() identifies Rings at Thief's Intuition tier 2. Ring status is
  // run-global but is not part of the multiplayer Hero snapshot, so reject that unsynced proc.
  if (itemClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.rings.")) {
    if (typeof trustedHeroStateValue !== "string") return false;
    let trustedHero: any;
    try { trustedHero = JSON.parse(trustedHeroStateValue); } catch (_) { return false; }
    const combat = parseNativeBundleObject(trustedHero?.combatBundle);
    if (!combat || nativeEquipmentTalentPoints(combat, "THIEFS_INTUITION") === 2) return false;
  }
  if (itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.LostBackpack") return false;
  const nativeDartPrefix = "com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.darts.";
  if (itemClass.startsWith(nativeDartPrefix) && !itemClass.endsWith(".Dart")) {
    if (typeof trustedHeroStateValue !== "string") return false;
    let trustedHero: any;
    try { trustedHero = JSON.parse(trustedHeroStateValue); } catch (_) { return false; }
    const inventory = parseNativeInventoryIndex(trustedHero);
    if (!inventory || inventory.some((row: any) => String(row.className) === itemClass)) return false;
  }
  if (itemClass.toLowerCase().includes("bag")) {
    const bundleRoot = parseNativeBundleObject(data.itemBundle);
    const bagItem = nativeEquipmentBundleItem(bundleRoot);
    if (!NATIVE_MULTIPLAYER_BAG_CLASSES.has(itemClass) || typeof data.itemBundle !== "string"
        || !bagItem || String(bagItem.__className || "") !== itemClass
        || !Array.isArray(bagItem.inventory) || bagItem.inventory.length !== 0
        || quantity !== 1 || stackable !== false) return false;
  }
  return true;
}

/** Allows only removal of the accepted top item; other heaps and remaining item order stay unchanged. */
export function isValidNativePickupHeapMutation(previousHeaps: any, nextHeaps: any, targetValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  const details: any = detailsValue, accepted: any = acceptedValue, target = Number(targetValue);
  if (!Array.isArray(previousHeaps) || !Array.isArray(nextHeaps) || !details || !accepted
      || !isValidNativeFloorItemIdentitySet(previousHeaps) || !isValidNativeFloorItemIdentitySet(nextHeaps)
      || !Number.isInteger(target) || target < 0 || accepted.actionType !== "PICKUP"
      || accepted.branch !== 0 || accepted.targetPos !== target || accepted.from !== target
      || accepted.heapId !== details.heapId || accepted.itemId !== details.itemId
      || accepted.itemClass !== details.itemClass || accepted.expectedQuantity !== details.expectedQuantity
      || accepted.stackable !== details.stackable
      || (accepted.itemBundle !== undefined && accepted.itemBundle !== details.itemBundle)
      || !Number.isInteger(accepted.depth) || accepted.depth < 1) return false;
  const heapId = String(details.heapId || ""), itemId = String(details.itemId || "");
  if (heapId.length < 8 || heapId.length > 80 || itemId.length < 8 || itemId.length > 80) return false;
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
  const oldMatches = previousHeaps.filter((heap: any) => String(heap?.heapId || "") === heapId);
  const newMatches = nextHeaps.filter((heap: any) => String(heap?.heapId || "") === heapId);
  if (oldMatches.length !== 1 || newMatches.length > 1) return false;
  const oldHeap = oldMatches[0], newHeap = newMatches[0];
  if (Number(oldHeap.pos) !== target || !Array.isArray(oldHeap.items) || oldHeap.items.length === 0) return false;
  const top = oldHeap.items[0];
  if (String(top?.itemId || "") !== itemId || String(top?.className || "") !== String(details.itemClass || "")
      || Number(top?.quantity) !== Number(details.expectedQuantity) || top?.stackable !== details.stackable
      || typeof top?.serializedBundle !== "string" || !top.serializedBundle.includes(itemId)) return false;
  for (const heap of previousHeaps) {
    if (String(heap?.heapId || "") === heapId) continue;
    const next = nextHeaps.find((candidate: any) => String(candidate?.heapId || "") === String(heap?.heapId || ""));
    if (!next || !same(heap, next)) return false;
  }
  for (const heap of nextHeaps) {
    if (String(heap?.heapId || "") === heapId) continue;
    const old = previousHeaps.find((candidate: any) => String(candidate?.heapId || "") === String(heap?.heapId || ""));
    if (!old || !same(old, heap)) return false;
  }
  const remaining = oldHeap.items.slice(1);
  if (remaining.length === 0) return !newHeap && !nextHeaps.some((heap: any) => Number(heap?.pos) === target);
  return !!newHeap && Number(newHeap.pos) === target && String(newHeap.type) === String(oldHeap.type)
    && newHeap.seen === oldHeap.seen && newHeap.haunted === oldHeap.haunted
    && newHeap.hidden === oldHeap.hidden && newHeap.autoExplored === oldHeap.autoExplored
    && Array.isArray(newHeap.items) && same(newHeap.items, remaining);
}


/** The thrown projectile must be owned by this player and land at one valid cell on the same floor. */
/** Validates one owned projectile and its exact landing/impact cell. */
export function isValidNativeThrowIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, heroStateValue: unknown): boolean {
  const data: any = dataValue, depth = Number(depthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps) || !Array.isArray(level.tiles)
      || !isValidNativeFloorItemIdentitySet(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof heroStateValue !== "string") return false;
  const from = Number(player.pos), target = Number(data.targetPos);
  const itemId = String(data.itemId || ""), resultId = String(data.resultItemId || "");
  const projectileId = String(data.projectileItemId || "");
  const heapId = String(data.heapId || ""), cls = String(data.itemClass || "");
  const projectileImpact = data.projectileImpact === true;
  const width = Number(level.width), height = Number(level.height);
  if (data.from !== from || data.to !== target || Number(data.depth) !== depth || data.branch !== 0
      || !Number.isInteger(width) || !Number.isInteger(height) || target < 0 || target >= width * height
      || Math.max(Math.abs((target % width) - (from % width)),
        Math.abs(Math.floor(target / width) - Math.floor(from / width))) > 12
      || !isValidStableMultiplayerId(itemId) || !isValidStableMultiplayerId(resultId)
      || !isValidStableMultiplayerId(heapId) || !cls.includes(".items.weapon.missiles.")
      || data.expectedQuantity !== 1 || !Number.isInteger(data.sourceQuantityBefore)
      || data.sourceQuantityBefore < 1 || data.sourceQuantityBefore > 100000
      || typeof data.stackable !== "boolean" || data.stackable !== true
      || !Number.isFinite(data.engineActionCost) || data.engineActionCost < 0 || data.engineActionCost > 10
      || (data.projectileImpact !== undefined && data.projectileImpact !== true)
      || (projectileImpact && (!isValidStableMultiplayerId(projectileId)
        || (data.sourceQuantityBefore === 1 ? projectileId !== itemId : projectileId === itemId)))
      || (!projectileImpact && data.projectileItemId !== undefined)) return false;
  const tiles = level.tiles.filter((tile: any) => Number(tile?.pos) === target);
  if (tiles.length !== 1 || tiles[0].solid === true) return false;
  let hero: any;
  try { hero = JSON.parse(heroStateValue); } catch (_) { return false; }
  if (Number(hero?.pos) !== from || !Number.isInteger(hero?.hp) || hero.hp <= 0) return false;
  const inventory = parseNativeInventoryIndex(hero);
  if (!inventory || !parseNativeQuickslotIndex(hero)) return false;
  const source = inventory.filter((item: any) => String(item.itemId) === itemId);
  if (source.length !== 1 || String(source[0].className) !== cls
      || Number(source[0].quantity) !== Number(data.sourceQuantityBefore) || source[0].stackable !== data.stackable) return false;
  if (projectileImpact && inventory.some((item: any) =>
      String(item.itemId) === projectileId && String(item.itemId) !== itemId)) return false;
  if (projectileImpact && level.heaps.some((heap: any) => (Array.isArray(heap?.items) ? heap.items : [])
      .some((item: any) => String(item?.itemId || "") === projectileId))) return false;
  const atTarget = level.heaps.filter((heap: any) => Number(heap?.pos) === target);
  if (atTarget.length > 1) return false;
  const oldHeap = atTarget[0] || null;
  if (oldHeap) {
    if (String(oldHeap.heapId || "") !== heapId || String(oldHeap.type) !== "HEAP" || !Array.isArray(oldHeap.items)) return false;
    const oldResult = oldHeap.items.filter((item: any) => String(item?.itemId || "") === resultId);
    if (oldResult.length > 1 || (oldResult.length === 1 && (!data.stackable || oldResult[0].stackable !== true
        || String(oldResult[0].className || "") !== cls))) return false;
    if (oldResult.length === 0) {
      if ((data.sourceQuantityBefore === 1 && resultId !== itemId)
          || (data.sourceQuantityBefore > 1 && resultId === itemId)
          || level.heaps.some((heap: any) => (Array.isArray(heap?.items) ? heap.items : [])
            .some((item: any) => String(item?.itemId || "") === resultId))) return false;
    } else if (resultId === itemId) return false;
  } else {
    if (level.heaps.some((heap: any) => String(heap?.heapId || "") === heapId)
        || level.heaps.some((heap: any) => (Array.isArray(heap?.items) ? heap.items : [])
          .some((item: any) => String(item?.itemId || "") === resultId))
        || (data.sourceQuantityBefore === 1 && resultId !== itemId)
        || (data.sourceQuantityBefore > 1 && resultId === itemId)) return false;
  }
  return true;
}

/** Validates the combat envelope's projectile context against the trusted floor and pre-attack owner state. */
export function isValidNativeProjectileCombatIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, trustedHeroStateValue: unknown,
  attackerPosValue: unknown, combatTargetPosValue: unknown): boolean {
  const data: any = dataValue;
  if (!data || data.projectileImpact !== true
      || Number(data.from) !== Number(attackerPosValue)
      || Number(data.to) !== Number(combatTargetPosValue)
      || Number(data.targetPos) !== Number(combatTargetPosValue)) return false;
  return isValidNativeThrowIntent(level, data, depthValue, playerIdValue, player, trustedHeroStateValue);
}

/** One source projectile unit must leave the inventory while unrelated items and quickslots remain unchanged. */
export function isValidNativeThrowInventoryMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); } catch (_) { return false; }
  const details: any = detailsValue, before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  if (!details || !before || !after || previous.gold !== next.gold || previous.inventoryBundle === next.inventoryBundle) return false;
  const id = String(details.itemId || ""), cls = String(details.itemClass || "");
  const oldSource = before.filter((item: any) => String(item.itemId) === id);
  const newSource = after.filter((item: any) => String(item.itemId) === id);
  if (!isValidStableMultiplayerId(id) || cls.length < 1 || cls.length > 256
      || !Number.isInteger(details.sourceQuantityBefore) || details.sourceQuantityBefore < 1
      || oldSource.length !== 1 || String(oldSource[0].className) !== cls
      || oldSource[0].quantity !== Number(details.sourceQuantityBefore) || oldSource[0].stackable !== details.stackable) return false;
  if (oldSource[0].quantity === 1) {
    if (newSource.length !== 0) return false;
  } else if (newSource.length !== 1 || newSource[0].quantity !== oldSource[0].quantity - 1
      || !sameNativeItemValue(itemValueWithout(oldSource[0], ["quantity", "serializedBundle", "cursedKnown"]),
        itemValueWithout(newSource[0], ["quantity", "serializedBundle", "cursedKnown"]))
      || (oldSource[0].cursedKnown && !newSource[0].cursedKnown)) return false;
  if (!sameNativeItemValue(before.filter((item: any) => String(item.itemId) !== id),
      after.filter((item: any) => String(item.itemId) !== id))) return false;
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!beforeSlots || !afterSlots) return false;
  const oldSourceSlots = beforeSlots.filter((slot: any) => String(slot.itemId) === id);
  const newSourceSlots = afterSlots.filter((slot: any) => String(slot.itemId) === id);
  if (oldSource[0].quantity > 1) {
    if (newSourceSlots.length !== oldSourceSlots.length) return false;
    for (const oldSlot of oldSourceSlots) {
      const current = newSourceSlots.find((slot: any) => Number(slot.slot) === Number(oldSlot.slot));
      if (!current || Number(current.quantity) !== Number(oldSlot.quantity) - 1
          || String(current.className) !== cls || String(current.serializedBundle) !== String(newSource[0].serializedBundle)
          || !sameNativeItemValue(itemValueWithout(oldSlot, ["quantity", "serializedBundle"]),
            itemValueWithout(current, ["quantity", "serializedBundle"]))) return false;
    }
  } else {
    if (newSourceSlots.length > oldSourceSlots.length) return false;
    for (const current of newSourceSlots) {
      const oldSlot = oldSourceSlots.find((slot: any) => Number(slot.slot) === Number(current.slot));
      if (!oldSlot || Number(current.quantity) !== 0 || String(current.className) !== cls
          || !sameNativeItemValue(itemValueWithout(oldSlot, ["quantity", "serializedBundle"]),
            itemValueWithout(current, ["quantity", "serializedBundle"]))) return false;
    }
  }
  const unrelated = (slots: any[]) => slots.filter((slot: any) => String(slot.itemId) !== id)
    .map((slot: any) => ({slot:slot.slot,itemId:slot.itemId,className:slot.className,
      quantity:slot.quantity,serializedBundle:slot.serializedBundle}))
    .sort((a: any,b: any) => Number(a.slot)-Number(b.slot));
  return sameNativeItemValue(unrelated(beforeSlots), unrelated(afterSlots));
}

/** A throw may alter only the destination heap, adding one item or merging one compatible missile. */
/** A throw may change only the target floor cell by landing one projectile or merging one compatible missile stack. */
export function isValidNativeThrowHeapMutation(previousHeaps: any[], nextHeaps: any[], targetValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  const details: any = detailsValue, accepted: any = acceptedValue, target = Number(targetValue);
  if (!Array.isArray(previousHeaps) || !Array.isArray(nextHeaps)
      || !isValidNativeFloorItemIdentitySet(previousHeaps) || !isValidNativeFloorItemIdentitySet(nextHeaps)
      || !details || !accepted || !Number.isInteger(target) || target < 0
      || accepted.actionType !== "THROW" || accepted.targetPos !== target
      || accepted.itemId !== details.itemId || accepted.itemClass !== details.itemClass
      || accepted.heapId !== details.heapId || accepted.resultItemId !== details.resultItemId
      || accepted.expectedQuantity !== details.expectedQuantity
      || accepted.sourceQuantityBefore !== details.sourceQuantityBefore || accepted.stackable !== details.stackable) return false;
  const heapId = String(details.heapId || ""), resultId = String(details.resultItemId || ""), cls = String(details.itemClass || "");
  if (!isValidStableMultiplayerId(heapId) || !isValidStableMultiplayerId(resultId)
      || !isValidStableMultiplayerId(String(details.itemId || ""))
      || !cls.includes(".items.weapon.missiles.") || details.expectedQuantity !== 1) return false;
  const oldAt = previousHeaps.filter((heap: any) => Number(heap?.pos) === target);
  const newAt = nextHeaps.filter((heap: any) => Number(heap?.pos) === target);
  if (oldAt.length > 1 || newAt.length !== 1 || String(newAt[0].heapId || "") !== heapId
      || String(newAt[0].type) !== "HEAP" || !Array.isArray(newAt[0].items) || newAt[0].items.length === 0) return false;
  const oldHeap = oldAt[0] || null, newHeap = newAt[0];
  if (oldHeap && (String(oldHeap.heapId || "") !== heapId || String(oldHeap.type) !== "HEAP"
      || oldHeap.seen !== newHeap.seen || oldHeap.haunted !== newHeap.haunted
      || oldHeap.autoExplored !== newHeap.autoExplored
      || !(oldHeap.hidden === newHeap.hidden || newHeap.hidden === false)
      || !Array.isArray(oldHeap.items))) return false;
  if (!oldHeap && previousHeaps.some((heap: any) => String(heap?.heapId || "") === heapId)) return false;
  for (const old of previousHeaps) {
    if (oldHeap && String(old.heapId || "") === heapId) continue;
    const matches = nextHeaps.filter((heap: any) => String(heap?.heapId || "") === String(old?.heapId || ""));
    if (matches.length !== 1 || !sameNativeItemValue(old, matches[0])) return false;
  }
  for (const current of nextHeaps) {
    if (String(current?.heapId || "") === heapId) continue;
    if (previousHeaps.filter((heap: any) => String(heap?.heapId || "") === String(current?.heapId || "")).length !== 1) return false;
  }
  const oldItems: any[] = oldHeap ? oldHeap.items : [];
  const newResult = newHeap.items.filter((item: any) => String(item?.itemId || "") === resultId);
  if (newResult.length !== 1) return false;
  const result = newResult[0];
  if (String(result.className || "") !== cls || result.stackable !== details.stackable
      || !Number.isInteger(result.quantity) || result.quantity < 1
      || typeof result.serializedBundle !== "string" || !result.serializedBundle.includes(resultId)) return false;
  const oldResult = oldItems.filter((item: any) => String(item?.itemId || "") === resultId);
  if (!sameNativeItemValue(oldItems.filter((item: any) => String(item?.itemId || "") !== resultId),
      newHeap.items.filter((item: any) => String(item?.itemId || "") !== resultId))) return false;
  if (oldResult.length === 0) {
    return result.quantity === 1
      && ((Number(details.sourceQuantityBefore) === 1 && resultId === String(details.itemId))
        || (Number(details.sourceQuantityBefore) > 1 && resultId !== String(details.itemId)));
  }
  if (oldResult.length !== 1 || details.stackable !== true || oldResult[0].stackable !== true
      || String(oldResult[0].className || "") !== cls || resultId === String(details.itemId)) return false;
  const oldQuantity = Number(oldResult[0].quantity);
  const sameFields = sameNativeItemValue(itemValueWithout(oldResult[0], ["quantity", "serializedBundle"]),
    itemValueWithout(result, ["quantity", "serializedBundle"]));
  if (!sameFields) return false;
  const exactMerge = result.quantity === oldQuantity + 1;
  const missileDurabilityMerge = result.quantity >= Math.max(1, oldQuantity - 1)
    && result.quantity <= oldQuantity + 1
    && result.serializedBundle !== oldResult[0].serializedBundle;
  return exactMerge || missileDurabilityMerge;
}

/** Validates the landed row when a missile impact and a monster death share the same snapshot. */
/** Validates the projectile's exact identity inside the resulting destination heap. */
export function isValidNativeProjectileHeapResult(previousHeaps: any[], nextHeaps: any[],
  targetValue: unknown, detailsValue: unknown, allowNativeDeathLootAtTarget = false): boolean {
  const details: any = detailsValue, target = Number(targetValue);
  if (!Array.isArray(previousHeaps) || !Array.isArray(nextHeaps)
      || !isValidNativeFloorItemIdentitySet(previousHeaps) || !isValidNativeFloorItemIdentitySet(nextHeaps)
      || !details || !Number.isInteger(target) || target < 0) return false;
  const heapId = String(details.heapId || ""), sourceId = String(details.itemId || "");
  const projectileId = String(details.projectileItemId || ""), resultId = String(details.resultItemId || "");
  const cls = String(details.itemClass || "");
  if (!isValidStableMultiplayerId(heapId) || !isValidStableMultiplayerId(sourceId)
      || !isValidStableMultiplayerId(projectileId) || !isValidStableMultiplayerId(resultId)
      || !cls.includes(".items.weapon.missiles.") || details.projectileImpact !== true
      || details.expectedQuantity !== 1 || !Number.isInteger(details.sourceQuantityBefore)
      || details.sourceQuantityBefore < 1 || details.stackable !== true) return false;
  const oldAt = previousHeaps.filter((heap: any) => Number(heap?.pos) === target);
  const nextAt = nextHeaps.filter((heap: any) => Number(heap?.pos) === target);
  if (oldAt.length > 1 || nextAt.length !== 1 || String(nextAt[0].heapId || "") !== heapId
      || String(nextAt[0].type) !== "HEAP" || !Array.isArray(nextAt[0].items)) return false;
  const oldHeap = oldAt[0] || null, nextHeap = nextAt[0];
  if (!oldHeap && previousHeaps.some((heap: any) => String(heap?.heapId || "") === heapId)) return false;
  if (!oldHeap && previousHeaps.some((heap: any) =>
      (Array.isArray(heap?.items) ? heap.items : []).some((item: any) =>
        [projectileId, resultId].includes(String(item?.itemId || ""))))) return false;
  if (oldHeap && (String(oldHeap.heapId || "") !== heapId || String(oldHeap.type) !== "HEAP"
      || oldHeap.seen !== nextHeap.seen || oldHeap.haunted !== nextHeap.haunted
      || oldHeap.autoExplored !== nextHeap.autoExplored
      || !(oldHeap.hidden === nextHeap.hidden || nextHeap.hidden === false))) return false;
  for (const old of previousHeaps) {
    if (oldHeap && String(old.heapId || "") === heapId) continue;
    const matches = nextHeaps.filter((heap: any) => String(heap?.heapId || "") === String(old?.heapId || ""));
    if (matches.length !== 1 || !sameNativeItemValue(old, matches[0])) return false;
  }
  for (const current of nextHeaps) {
    if (String(current?.heapId || "") === heapId) continue;
    if (previousHeaps.filter((heap: any) => String(heap?.heapId || "") === String(current?.heapId || "")).length !== 1) return false;
  }
  const oldItems: any[] = oldHeap ? oldHeap.items : [];
  const newItems: any[] = nextHeap.items;
  const oldResults = oldItems.filter((item: any) => String(item?.itemId || "") === resultId);
  const newResults = newItems.filter((item: any) => String(item?.itemId || "") === resultId);
  if (oldResults.length > 1 || newResults.length !== 1) return false;
  const result = newResults[0];
  if (String(result.className || "") !== cls || result.stackable !== true
      || !Number.isInteger(result.quantity) || result.quantity < 1
      || typeof result.serializedBundle !== "string" || !result.serializedBundle.includes(resultId)) return false;
  if (!allowNativeDeathLootAtTarget
      && !sameNativeItemValue(oldItems.filter((item: any) => String(item?.itemId || "") !== resultId),
        newItems.filter((item: any) => String(item?.itemId || "") !== resultId))) return false;
  if (oldResults.length === 0) {
    if (result.quantity !== 1 || resultId !== projectileId
        || (Number(details.sourceQuantityBefore) === 1 ? projectileId !== sourceId : projectileId === sourceId)) return false;
  } else {
    const old = oldResults[0], oldQuantity = Number(old.quantity);
    if (resultId === projectileId || old.stackable !== true || String(old.className || "") !== cls
        || !sameNativeItemValue(itemValueWithout(old, ["quantity", "serializedBundle"]),
          itemValueWithout(result, ["quantity", "serializedBundle"]))) return false;
    const exact = result.quantity === oldQuantity + 1;
    const durabilityMerge = result.quantity >= Math.max(1, oldQuantity - 1)
      && result.quantity <= oldQuantity + 1 && result.serializedBundle !== old.serializedBundle;
    if (!exact && !durabilityMerge) return false;
  }
  return true;
}

/** Validates missile landing, sticking or consumption as part of one native combat result. */
export function isValidNativeProjectileCombatResult(previousHeapsValue: unknown, dataValue: unknown,
  targetCellValue: unknown, deathPositionsValue: unknown, levelSizeValue: unknown): boolean {
  const previousHeaps: any = previousHeapsValue, data: any = dataValue;
  const targetCell = Number(targetCellValue), deathPositions: any = deathPositionsValue;
  const levelSize = Number(levelSizeValue);
  if (!Array.isArray(previousHeaps) || !data || typeof data !== "object"
      || !isValidNativeFloorItemIdentitySet(previousHeaps)
      || !Number.isInteger(targetCell) || targetCell < 0 || !Number.isInteger(levelSize)
      || levelSize < 1 || targetCell >= levelSize
      || !Array.isArray(deathPositions) || deathPositions.some((pos: any) =>
        !Number.isInteger(pos) || pos < 0 || pos >= levelSize)) return false;
  const details: any = data.projectileMutation;
  if (details == null) return data.projectileOutcome === undefined && data.projectileHeaps === undefined;
  if (details.projectileImpact !== true || Number(details.targetPos) !== targetCell
      || Number(details.to) !== targetCell || !isValidStableMultiplayerId(String(details.projectileItemId || ""))) return false;
  const outcome = String(data.projectileOutcome || "");
  if (!["HEAP", "PIN_CUSHION", "CONSUMED"].includes(outcome)) return false;
  const uniqueDeathPositions = [...new Set<number>(deathPositions.map((pos: number) => Number(pos)))];
  const hasDeaths = uniqueDeathPositions.length > 0;
  const extraLoot = data.heaps;
  const projectileHeaps = data.projectileHeaps;
  if (outcome === "HEAP") {
    if (!Array.isArray(projectileHeaps)
        || !isValidNativeProjectileHeapResult(previousHeaps, projectileHeaps, targetCell, details,
          uniqueDeathPositions.includes(targetCell))) return false;
    const accepted: any = {
      actionType: "THROW", from: targetCell, targetPos: targetCell,
      heapId: details.heapId, itemId: details.itemId, resultItemId: details.resultItemId,
      itemClass: details.itemClass, expectedQuantity: details.expectedQuantity,
      sourceQuantityBefore: details.sourceQuantityBefore, stackable: details.stackable
    };
    if (!hasDeaths && !isValidNativeThrowHeapMutation(previousHeaps, projectileHeaps, targetCell, details, accepted)) return false;
    if (hasDeaths) {
      const allowedPositions = uniqueDeathPositions.includes(targetCell)
        ? uniqueDeathPositions : [...uniqueDeathPositions, targetCell];
      return Array.isArray(extraLoot) && sameNativeItemValue(extraLoot, projectileHeaps)
        && isValidNativeLootSnapshot(extraLoot, previousHeaps, allowedPositions, levelSize);
    }
    return extraLoot === undefined;
  }
  if (projectileHeaps !== undefined) return false;
  if (!hasDeaths && extraLoot !== undefined) return false;
  if (hasDeaths && (!Array.isArray(extraLoot)
      || !isValidNativeLootSnapshot(extraLoot, previousHeaps, uniqueDeathPositions, levelSize))) return false;
  const finalHeaps = hasDeaths ? extraLoot : previousHeaps;
  if (!isValidNativeFloorItemIdentitySet(finalHeaps)
      || finalHeaps.some((heap: any) => (Array.isArray(heap?.items) ? heap.items : [])
        .some((item: any) => String(item?.itemId || "") === String(details.projectileItemId)))) return false;
  const buffs = String(data.targetBuffs || "");
  return outcome === "PIN_CUSHION"
    ? buffs.includes(String(details.projectileItemId))
    : !buffs.includes(String(details.projectileItemId));
}

export function isValidNativeAlchemyIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, trustedHeroStateValue: unknown): boolean {
  const data: any = dataValue, depth = Number(depthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof trustedHeroStateValue !== "string") return false;
  const pos = Number(player.pos), beforeEnergy = Number(data.alchemyEnergyBefore), afterEnergy = Number(data.alchemyEnergyAfter);
  if (data.from !== pos || data.to !== pos || data.targetPos !== pos || Number(data.depth) !== depth || data.branch !== 0
      || !Number.isFinite(data.engineActionCost) || data.engineActionCost < 0 || data.engineActionCost > 10
      || !Number.isInteger(beforeEnergy) || beforeEnergy < 0 || beforeEnergy > 1000000
      || !Number.isInteger(afterEnergy) || afterEnergy < 0 || afterEnergy > beforeEnergy
      || !Array.isArray(data.ingredients) || data.ingredients.length < 1 || data.ingredients.length > 3
      || typeof data.resultItemId !== "string" || data.resultItemId.length < 8 || data.resultItemId.length > 80
      || typeof data.resultItemClass !== "string" || data.resultItemClass.length < 1 || data.resultItemClass.length > 256
      || !Number.isInteger(data.resultQuantity) || data.resultQuantity < 1 || data.resultQuantity > 100000
      || typeof data.resultStackable !== "boolean"
      || (data.resultNativeValue !== undefined && (!Number.isInteger(data.resultNativeValue)
        || data.resultNativeValue < 0 || data.resultNativeValue > 10000000))
      || (data.resultNativeUnitValue !== undefined && (!Number.isInteger(data.resultNativeUnitValue)
        || data.resultNativeUnitValue < -1 || data.resultNativeUnitValue > 10000000))
      || (data.resultNativeValue !== undefined && data.resultNativeUnitValue !== undefined
        && data.resultNativeUnitValue >= 0 && data.resultNativeValue !== data.resultNativeUnitValue * data.resultQuantity
        && data.resultNativeUnitValue !== -1)
      || !["INVENTORY", "HEAP"].includes(String(data.resultLocation))
      || typeof data.resultHeapId !== "string"
      || (data.resultLocation === "INVENTORY" && data.resultHeapId !== "")
      || (data.resultLocation === "HEAP" && (data.resultHeapId.length < 8 || data.resultHeapId.length > 80))) return false;
  let hero: any;
  try { hero = JSON.parse(trustedHeroStateValue); } catch (_) { return false; }
  if (Number(hero.pos) !== pos || !Number.isInteger(hero.hp) || hero.hp <= 0
      || !Number.isInteger(hero.alchemyEnergy) || hero.alchemyEnergy !== beforeEnergy) return false;
  const inventory = parseNativeInventoryIndex(hero);
  if (!inventory || !parseNativeQuickslotIndex(hero)) return false;
  const used = new Set<string>();
  for (const source of data.ingredients) {
    const id = String(source && source.itemId || ""), cls = String(source && source.itemClass || "");
    if (id.length < 8 || id.length > 80 || used.has(id) || cls.length < 1 || cls.length > 256
        || !Number.isInteger(source.sourceQuantityBefore) || source.sourceQuantityBefore < 1
        || source.sourceQuantityBefore > 100000 || !Number.isInteger(source.consumedQuantity)
        || source.consumedQuantity < 1 || source.consumedQuantity > source.sourceQuantityBefore
        || typeof source.stackable !== "boolean") return false;
    const old = inventory.filter((item: any) => String(item.itemId) === id);
    if (old.length !== 1 || String(old[0].className) !== cls
        || Number(old[0].quantity) !== source.sourceQuantityBefore || old[0].stackable !== source.stackable) return false;
    used.add(id);
  }
  if (!used.size) return false;
  if (data.resultLocation === "INVENTORY") {
    const match = inventory.filter((item: any) => String(item.itemId) === data.resultItemId);
    if (match.length > 1 || (match.length === 1 && (String(match[0].className) !== data.resultItemClass
        || match[0].stackable !== data.resultStackable))) return false;
    return !level.heaps.some((heap: any) => (Array.isArray(heap.items) ? heap.items : [])
      .some((item: any) => String(item.itemId || "") === data.resultItemId));
  }
  const at = level.heaps.filter((heap: any) => Number(heap.pos) === pos);
  if (at.length > 1 || (at.length === 1 && (String(at[0].heapId || "") !== data.resultHeapId
      || String(at[0].type) !== "HEAP" || !Array.isArray(at[0].items)))
      || (at.length === 0 && level.heaps.some((heap: any) => String(heap.heapId || "") === data.resultHeapId))) return false;
  const existing = at.length ? at[0].items.filter((item: any) => String(item.itemId || "") === data.resultItemId) : [];
  if (existing.length > 1 || (existing.length === 1 && (!data.resultStackable || existing[0].stackable !== true
      || String(existing[0].className || "") !== data.resultItemClass))) return false;
  return existing.length === 1 || !level.heaps.some((heap: any) => (Array.isArray(heap.items) ? heap.items : [])
    .some((item: any) => String(item.itemId || "") === data.resultItemId));
}

function nativeAlchemyBuffsEqual(previous: any, next: any): boolean {
  if (!Number.isInteger(previous?.buffCount) || previous.buffCount < 0 || previous.buffCount > 256
      || previous.buffCount !== next?.buffCount) return false;
  for (let i = 0; i < previous.buffCount; i++) {
    if (previous["buff_" + i] !== next["buff_" + i]
        || Number(previous["buffCooldown_" + i]) !== Number(next["buffCooldown_" + i])) return false;
  }
  return true;
}

export function isValidNativeAlchemyInventoryMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); } catch (_) { return false; }
  const details: any = detailsValue, accepted: any = acceptedValue;
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  if (!details || !accepted || accepted.actionType !== "ALCHEMY" || !before || !after
      || !Array.isArray(details.ingredients) || !Array.isArray(accepted.ingredients)
      || !sameNativeItemValue(accepted.ingredients, details.ingredients)
      || accepted.resultItemId !== details.resultItemId || accepted.resultItemClass !== details.resultItemClass
      || accepted.resultQuantity !== details.resultQuantity || accepted.resultStackable !== details.resultStackable
      || accepted.resultLocation !== details.resultLocation || accepted.resultHeapId !== details.resultHeapId
      || (details.resultNativeValue !== undefined && accepted.resultNativeValue !== details.resultNativeValue)
      || (details.resultNativeUnitValue !== undefined && accepted.resultNativeUnitValue !== details.resultNativeUnitValue)
      || accepted.alchemyEnergyBefore !== details.alchemyEnergyBefore || accepted.alchemyEnergyAfter !== details.alchemyEnergyAfter
      || !Number.isInteger(previous.alchemyEnergy) || previous.alchemyEnergy !== details.alchemyEnergyBefore
      || !Number.isInteger(next.alchemyEnergy) || next.alchemyEnergy !== details.alchemyEnergyAfter
      || next.alchemyEnergy < 0 || next.alchemyEnergy > previous.alchemyEnergy || previous.gold !== next.gold
      || previous.inventoryBundle === next.inventoryBundle || !nativeAlchemyBuffsEqual(previous, next)) return false;
  const beforeById = new Map<string, any>(), afterById = new Map<string, any>(), consumed = new Map<string, any>();
  for (const item of before) { const id = String(item.itemId || ""); if (beforeById.has(id)) return false; beforeById.set(id,item); }
  for (const item of after) { const id = String(item.itemId || ""); if (afterById.has(id)) return false; afterById.set(id,item); }
  for (const source of details.ingredients) {
    const id = String(source.itemId || ""), old = beforeById.get(id);
    if (consumed.has(id) || !old || String(old.className) !== String(source.itemClass)
        || old.quantity !== source.sourceQuantityBefore || old.stackable !== source.stackable
        || !Number.isInteger(source.consumedQuantity) || source.consumedQuantity < 1
        || source.consumedQuantity > old.quantity) return false;
    consumed.set(id, source);
  }
  if (!consumed.size) return false;
  const outputId = String(details.resultItemId), toInventory = details.resultLocation === "INVENTORY";
  const expected = new Set<string>();
  for (const old of before) {
    const id = String(old.itemId), spent = Number(consumed.get(id)?.consumedQuantity || 0);
    let quantity = Number(old.quantity) - spent;
    if (toInventory && id === outputId) {
      if (String(old.className) !== String(details.resultItemClass) || old.stackable !== details.resultStackable) return false;
      quantity += Number(details.resultQuantity);
    }
    const actual = afterById.get(id);
    if (quantity <= 0) { if (actual) return false; continue; }
    if (!actual || actual.quantity !== quantity
        || !sameNativeItemValue(itemValueWithout(old, ["quantity","serializedBundle"]),
          itemValueWithout(actual, ["quantity","serializedBundle"]))) return false;
    expected.add(id);
  }
  if (toInventory && !beforeById.has(outputId)) {
    const output = afterById.get(outputId);
    if (!output || String(output.className) !== String(details.resultItemClass)
        || output.quantity !== details.resultQuantity || output.stackable !== details.resultStackable) return false;
    expected.add(outputId);
  }
  if ((toInventory && !afterById.has(outputId)) || (!toInventory && afterById.has(outputId))
      || expected.size !== afterById.size) return false;
  for (const id of afterById.keys()) if (!expected.has(id)) return false;
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!beforeSlots || !afterSlots) return false;
  const allowed = new Set<string>([...consumed.keys(), outputId]);
  const stable = (slots: any[]) => slots.filter((slot: any) => !allowed.has(String(slot.itemId)))
    .map((slot: any) => ({slot:slot.slot,itemId:slot.itemId,className:slot.className,
      quantity:slot.quantity,serializedBundle:slot.serializedBundle})).sort((a: any,b: any) => Number(a.slot)-Number(b.slot));
  return sameNativeItemValue(stable(beforeSlots),stable(afterSlots));
}

export function isValidNativeAlchemyHeapMutation(previousHeaps: any[], nextHeaps: any[], targetValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  const details: any = detailsValue, accepted: any = acceptedValue, target = Number(targetValue);
  if (!Array.isArray(previousHeaps) || !Array.isArray(nextHeaps) || !details || !accepted
      || accepted.actionType !== "ALCHEMY" || accepted.resultLocation !== details.resultLocation
      || accepted.resultItemId !== details.resultItemId || accepted.resultItemClass !== details.resultItemClass
      || accepted.resultQuantity !== details.resultQuantity || accepted.resultStackable !== details.resultStackable
      || accepted.resultHeapId !== details.resultHeapId
      || (details.resultNativeValue !== undefined && accepted.resultNativeValue !== details.resultNativeValue)
      || (details.resultNativeUnitValue !== undefined && accepted.resultNativeUnitValue !== details.resultNativeUnitValue)) return false;
  if (details.resultLocation === "INVENTORY") return sameNativeItemValue(previousHeaps,nextHeaps);
  if (details.resultLocation !== "HEAP" || !Number.isInteger(target) || target < 0) return false;
  const oldAt = previousHeaps.filter((heap: any) => Number(heap.pos) === target);
  const newAt = nextHeaps.filter((heap: any) => Number(heap.pos) === target);
  if (oldAt.length > 1 || newAt.length !== 1 || String(newAt[0].heapId || "") !== String(details.resultHeapId)
      || String(newAt[0].type) !== "HEAP" || !Array.isArray(newAt[0].items)) return false;
  const oldHeap = oldAt[0] || null, newHeap = newAt[0];
  if (oldHeap && (String(oldHeap.heapId || "") !== String(details.resultHeapId) || String(oldHeap.type) !== "HEAP"
      || oldHeap.seen !== newHeap.seen || oldHeap.haunted !== newHeap.haunted
      || oldHeap.hidden !== newHeap.hidden || oldHeap.autoExplored !== newHeap.autoExplored || !Array.isArray(oldHeap.items))) return false;
  if (!oldHeap && previousHeaps.some((heap: any) => String(heap.heapId || "") === String(details.resultHeapId))) return false;
  for (const old of previousHeaps) {
    if (oldHeap && String(old.heapId || "") === String(details.resultHeapId)) continue;
    const found = nextHeaps.filter((heap: any) => String(heap.heapId || "") === String(old.heapId || ""));
    if (found.length !== 1 || !sameNativeItemValue(old,found[0])) return false;
  }
  for (const current of nextHeaps) {
    if (String(current.heapId || "") === String(details.resultHeapId)) continue;
    if (previousHeaps.filter((heap: any) => String(heap.heapId || "") === String(current.heapId || "")).length !== 1) return false;
  }
  const oldItems: any[] = oldHeap ? oldHeap.items : [];
  const oldOutput = oldItems.filter((item: any) => String(item.itemId || "") === String(details.resultItemId));
  const newOutput = newHeap.items.filter((item: any) => String(item.itemId || "") === String(details.resultItemId));
  if (newOutput.length !== 1) return false;
  const output = newOutput[0];
  if (String(output.className || "") !== String(details.resultItemClass) || output.stackable !== details.resultStackable
      || !Number.isInteger(output.quantity) || output.quantity < 1
      || typeof output.serializedBundle !== "string" || !output.serializedBundle.includes(String(details.resultItemId))
      || (details.resultNativeValue !== undefined && output.nativeValue !== details.resultNativeValue)
      || (details.resultNativeUnitValue !== undefined && output.nativeUnitValue !== details.resultNativeUnitValue)) return false;
  if (!sameNativeItemValue(oldItems.filter((item: any) => String(item.itemId || "") !== String(details.resultItemId)),
      newHeap.items.filter((item: any) => String(item.itemId || "") !== String(details.resultItemId)))) return false;
  if (!oldOutput.length) return output.quantity === Number(details.resultQuantity);
  return oldOutput.length === 1 && details.resultStackable === true && oldOutput[0].stackable === true
    && String(oldOutput[0].className || "") === String(details.resultItemClass)
    && output.quantity === Number(oldOutput[0].quantity) + Number(details.resultQuantity)
    && sameNativeItemValue(itemValueWithout(oldOutput[0], ["quantity","serializedBundle"]),
      itemValueWithout(output, ["quantity","serializedBundle"]));
}


