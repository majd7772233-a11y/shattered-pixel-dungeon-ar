import { parseNativeQuickslotIndex } from "./equipment";
import { isValidStableMultiplayerId, parseNativeInventoryIndex, parseNativeItemEconomyIndex } from "./inventory-claims";

export function itemValueWithout(value: any, ignored: string[]): any {
  const result: any = {};
  for (const key of Object.keys(value || {})) if (!ignored.includes(key)) result[key] = value[key];
  return result;
}
export function sameNativeItemValue(a: any, b: any): boolean {
  const canonical = (v: any): any => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") {
      const out: any = {};
      for (const key of Object.keys(v).sort()) out[key] = canonical(v[key]);
      return out;
    }
    return v;
  };
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
/** Validates inventory deltas from native MINE; it never invents a TypeScript gameplay outcome. */
export function isValidNativeMineInventoryMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); }
  catch (_) { return false; }
  const details: any = detailsValue, accepted: any = acceptedValue;
  const terrain = Number(details?.sourceTerrain);
  const darkGoldClass = "com.shatteredpixel.shatteredpixeldungeon.items.quest.DarkGold";
  if (!details || !accepted || accepted.actionType !== "MINE" || ![4, 12, 35, 36].includes(terrain)
      || Number(accepted.sourceTerrain) !== terrain || Number(accepted.targetTerrain) !== terrain
      || !Number.isInteger(previous.pos) || previous.pos !== next.pos
      || previous.hp !== next.hp || previous.ht !== next.ht || previous.shielding !== next.shielding
      || previous.gold !== next.gold || previous.alchemyEnergy !== next.alchemyEnergy
      || previous.notesBundle !== next.notesBundle || previous.questStateBundle !== next.questStateBundle
      || previous.ironKeyCount !== next.ironKeyCount || previous.crystalKeyCount !== next.crystalKeyCount
      || previous.wornKeyCount !== next.wornKeyCount || previous.goldenKeyCount !== next.goldenKeyCount) return false;
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  const beforeValues = parseNativeItemEconomyIndex(previous), afterValues = parseNativeItemEconomyIndex(next);
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!before || !after || !beforeValues || !afterValues || !beforeSlots || !afterSlots) return false;
  const byId = (rows: any[]) => new Map<string, any>(rows.map((row: any) => [String(row.itemId), row]));
  const oldItems = byId(before), newItems = byId(after), oldValues = byId(beforeValues), newValues = byId(afterValues);
  const removed = before.filter((row: any) => !newItems.has(String(row.itemId)));
  const added = after.filter((row: any) => !oldItems.has(String(row.itemId)));
  const changed = before.filter((row: any) => newItems.has(String(row.itemId))
    && !sameNativeItemValue(row, newItems.get(String(row.itemId))));
  const sameWithout = (rows: any[], id: string) => rows.filter((row: any) => String(row.itemId) !== id)
    .slice().sort((a: any, b: any) => String(a.itemId).localeCompare(String(b.itemId)));
  const slotsWithout = (rows: any[], slotNo: number) => rows.filter((row: any) => Number(row.slot) !== slotNo)
    .slice().sort((a: any, b: any) => Number(a.slot) - Number(b.slot));
  const sameDarkGoldValue = (row: any, item: any) => !!row && !!item
    && String(row.className) === darkGoldClass && String(item.className) === darkGoldClass
    && row.quantity === item.quantity && row.nativeValue === 0 && row.nativeUnitValue === 0
    && row.nativeSellable === false;
  const noInventoryDelta = removed.length === 0 && added.length === 0 && changed.length === 0;
  if (terrain !== 12 || noInventoryDelta) {
    return noInventoryDelta && previous.inventoryBundle === next.inventoryBundle
      && sameNativeItemValue(beforeValues, afterValues) && sameNativeItemValue(beforeSlots, afterSlots);
  }
  if (previous.inventoryBundle === next.inventoryBundle || removed.length !== 0) return false;
  if (added.length === 1 && changed.length === 0) {
    const result = added[0], id = String(result.itemId), resultValue = newValues.get(id);
    if (String(result.className) !== darkGoldClass || result.quantity !== 1 || result.level !== 0
        || result.cursed !== false || result.cursedKnown !== false || result.stackable !== true
        || result.equipped !== false || typeof result.serializedBundle !== "string"
        || !result.serializedBundle.includes(id) || oldValues.has(id) || !sameDarkGoldValue(resultValue, result)
        || !sameNativeItemValue(sameWithout(before, id), sameWithout(after, id))
        || !sameNativeItemValue(sameWithout(beforeValues, id), sameWithout(afterValues, id))) return false;
    const changedSlots = new Set<number>([
      ...beforeSlots.filter((slot: any) => !sameNativeItemValue(slot,
        afterSlots.find((nextSlot: any) => Number(nextSlot.slot) === Number(slot.slot)))).map((slot: any) => Number(slot.slot)),
      ...afterSlots.filter((slot: any) => !sameNativeItemValue(slot,
        beforeSlots.find((oldSlot: any) => Number(oldSlot.slot) === Number(slot.slot)))).map((slot: any) => Number(slot.slot))
    ]);
    if (changedSlots.size === 0) return sameNativeItemValue(beforeSlots, afterSlots);
    if (changedSlots.size !== 1) return false;
    const slotNo = [...changedSlots][0];
    const oldSlot = beforeSlots.find((slot: any) => Number(slot.slot) === slotNo);
    const newSlot = afterSlots.find((slot: any) => Number(slot.slot) === slotNo);
    return !!oldSlot && !!newSlot && Number(oldSlot.quantity) === 0
      && String(oldSlot.className) === darkGoldClass && String(newSlot.itemId) === id
      && String(newSlot.className) === darkGoldClass && Number(newSlot.quantity) === 1
      && String(newSlot.serializedBundle) === String(result.serializedBundle)
      && sameNativeItemValue(slotsWithout(beforeSlots, slotNo), slotsWithout(afterSlots, slotNo));
  }
  if (added.length !== 0 || changed.length !== 1) return false;
  const source = changed[0], id = String(source.itemId), result = newItems.get(id);
  const oldValue = oldValues.get(id), nextEconomyValue = newValues.get(id);
  if (String(source.className) !== darkGoldClass || String(result?.className) !== darkGoldClass
      || Number(result?.quantity) !== Number(source.quantity) + 1 || !source.stackable || !result?.stackable
      || !sameNativeItemValue(itemValueWithout(source, ["quantity", "serializedBundle"]),
        itemValueWithout(result, ["quantity", "serializedBundle"]))
      || !sameDarkGoldValue(oldValue, source) || !sameDarkGoldValue(nextEconomyValue, result)
      || !sameNativeItemValue(sameWithout(before, id), sameWithout(after, id))
      || !sameNativeItemValue(sameWithout(beforeValues, id), sameWithout(afterValues, id))
      || !sameNativeItemValue(
        beforeSlots.filter((slot: any) => String(slot.itemId) !== id).slice().sort((a: any,b: any)=>Number(a.slot)-Number(b.slot)),
        afterSlots.filter((slot: any) => String(slot.itemId) !== id).slice().sort((a: any,b: any)=>Number(a.slot)-Number(b.slot)))) return false;
  const oldSourceSlots = beforeSlots.filter((slot: any) => String(slot.itemId) === id);
  const newSourceSlots = afterSlots.filter((slot: any) => String(slot.itemId) === id);
  if (oldSourceSlots.length !== newSourceSlots.length) return false;
  for (const oldSlot of oldSourceSlots) {
    const newSlot = newSourceSlots.find((slot: any) => Number(slot.slot) === Number(oldSlot.slot));
    if (!newSlot || Number(newSlot.quantity) !== Number(oldSlot.quantity) + 1
        || String(newSlot.className) !== darkGoldClass
        || String(newSlot.serializedBundle) !== String(result.serializedBundle)) return false;
  }
  return true;
}

/** Only a DarkGold item from mining a gold wall may change a floor heap. */
export function isValidNativeMineHeapMutation(previousHeapsValue: unknown, nextHeapsValue: unknown,
  heroPosValue: unknown, targetPosValue: unknown, detailsValue: unknown, acceptedValue: unknown): boolean {
  const details: any = detailsValue, accepted: any = acceptedValue;
  const heroPos = Number(heroPosValue), targetPos = Number(targetPosValue), terrain = Number(details?.sourceTerrain);
  const darkGoldClass = "com.shatteredpixel.shatteredpixeldungeon.items.quest.DarkGold";
  if (!Array.isArray(previousHeapsValue) || !Array.isArray(nextHeapsValue) || !details || !accepted
      || accepted.actionType !== "MINE" || Number(accepted.sourceTerrain) !== terrain
      || Number(accepted.targetTerrain) !== terrain || ![4, 12, 35, 36].includes(terrain)
      || !Number.isInteger(heroPos) || heroPos < 0 || !Number.isInteger(targetPos) || targetPos < 0) return false;
  if (terrain !== 12) return sameNativeItemValue(previousHeapsValue, nextHeapsValue);
  if (heroPos === targetPos) return false;
  const before = previousHeapsValue as any[], after = nextHeapsValue as any[];
  const oldAt = before.filter((heap: any) => Number(heap?.pos) === heroPos);
  const newAt = after.filter((heap: any) => Number(heap?.pos) === heroPos);
  if (oldAt.length > 1 || newAt.length > 1) return false;
  const oldHeap = oldAt[0] || null, nextHeap = newAt[0] || null;
  for (const old of before) {
    if (oldHeap && String(old?.heapId || "") === String(oldHeap.heapId || "")) continue;
    const matches = after.filter((current: any) => String(current?.heapId || "") === String(old?.heapId || ""));
    if (matches.length !== 1 || !sameNativeItemValue(old, matches[0])) return false;
  }
  for (const current of after) {
    if (nextHeap && String(current?.heapId || "") === String(nextHeap.heapId || "")) continue;
    if (before.filter((old: any) => String(old?.heapId || "") === String(current?.heapId || "")).length !== 1) return false;
  }
  const newHeap = nextHeap;
  const validNewDarkGold = (item: any) => String(item?.className || "") === darkGoldClass
    && Number(item.quantity) === 1 && item.stackable === true && item.level === 0
    && item.cursed === false && item.cursedKnown === false
    && Number(item.nativeValue) === 0 && Number(item.nativeUnitValue) === 0
    && isValidStableMultiplayerId(item.itemId) && typeof item.serializedBundle === "string"
    && item.serializedBundle.includes(item.itemId);
  if (!oldHeap) {
    if (!newHeap) return true;
    return String(newHeap.type) === "HEAP" && Number(newHeap.pos) === heroPos
      && Array.isArray(newHeap.items) && newHeap.items.length === 1
      && isValidStableMultiplayerId(newHeap.heapId) && validNewDarkGold(newHeap.items[0])
      && !before.some((heap: any) => (Array.isArray(heap?.items) ? heap.items : [])
        .some((item: any) => String(item?.itemId || "") === String(newHeap.items[0].itemId)));
  }
  if (!newHeap || String(oldHeap.type) !== "HEAP" || String(newHeap.type) !== "HEAP"
      || String(oldHeap.heapId) !== String(newHeap.heapId) || Number(newHeap.pos) !== heroPos
      || oldHeap.seen !== newHeap.seen || oldHeap.haunted !== newHeap.haunted
      || oldHeap.autoExplored !== newHeap.autoExplored
      || !(oldHeap.hidden === newHeap.hidden || newHeap.hidden === false)
      || !Array.isArray(oldHeap.items) || !Array.isArray(newHeap.items)) return false;
  const oldItems = new Map<string, any>(oldHeap.items.map((item: any) => [String(item?.itemId || ""), item]));
  const newItems = new Map<string, any>(newHeap.items.map((item: any) => [String(item?.itemId || ""), item]));
  if (oldItems.size !== oldHeap.items.length || newItems.size !== newHeap.items.length) return false;
  const removed = oldHeap.items.filter((item: any) => !newItems.has(String(item.itemId)));
  const added = newHeap.items.filter((item: any) => !oldItems.has(String(item.itemId)));
  const changed = oldHeap.items.filter((item: any) => newItems.has(String(item.itemId))
    && !sameNativeItemValue(item, newItems.get(String(item.itemId))));
  if (removed.length !== 0) return false;
  const originalOrder = oldHeap.items.map((item: any) => String(item.itemId));
  const retainedOrder = newHeap.items.filter((item: any) => oldItems.has(String(item.itemId)))
    .map((item: any) => String(item.itemId));
  if (!sameNativeItemValue(originalOrder, retainedOrder)) return false;
  if (added.length === 0 && changed.length === 0) return sameNativeItemValue(oldHeap.items, newHeap.items);
  if (added.length === 1 && changed.length === 0) {
    const result = added[0];
    return validNewDarkGold(result) && !before.some((heap: any) => (Array.isArray(heap?.items) ? heap.items : [])
      .some((oldItem: any) => String(oldItem?.itemId || "") === String(result.itemId)));
  }
  if (added.length !== 0 || changed.length !== 1) return false;
  const old = changed[0], current = newItems.get(String(old.itemId));
  return String(old.className || "") === darkGoldClass && String(current.className || "") === darkGoldClass
    && old.stackable === true && current.stackable === true && Number(current.quantity) === Number(old.quantity) + 1
    && Number(old.nativeValue) === 0 && Number(current.nativeValue) === 0
    && Number(old.nativeUnitValue) === 0 && Number(current.nativeUnitValue) === 0
    && sameNativeItemValue(itemValueWithout(old, ["quantity", "serializedBundle"]),
      itemValueWithout(current, ["quantity", "serializedBundle"]));
}

/** The hero may drop an owned item quantity from the trusted inventory at its current cell. */
