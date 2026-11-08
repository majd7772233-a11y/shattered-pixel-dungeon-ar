import { parseNativeBundleObject } from "./abilities";
import { parseNativeQuickslotIndex } from "./equipment";
import { isValidStableMultiplayerId, isValidNativeFloorItemIdentitySet, parseNativeInventoryIndex, parseNativeItemEconomyIndex } from "./inventory-claims";
import { itemValueWithout, sameNativeItemValue } from "./inventory-economy";
import { nativeUseItemBuffMap, nativeUseItemCombatBundleMatches } from "./item-state";

function nativeBuyItemBundle(value: unknown): any | null {
  const root = parseNativeBundleObject(value);
  return root && root.item && typeof root.item === "object" && !Array.isArray(root.item) ? root : null;
}

/** The only permitted bundle difference when collecting a new item is its quickslot index. */
function nativeBuyBundleMatchesIgnoringQuickslot(sourceValue: unknown, resultValue: unknown): boolean {
  const source = nativeBuyItemBundle(sourceValue), result = nativeBuyItemBundle(resultValue);
  if (!source || !result) return false;
  delete source.item.quickslotpos;
  delete result.item.quickslotpos;
  return sameNativeItemValue(source, result);
}

/** A merge is safe only when every serialized native property other than ID, quantity and quickslot agrees. */
function nativeBuyBundleMergeCompatible(sourceValue: unknown, targetValue: unknown): boolean {
  const source = nativeBuyItemBundle(sourceValue), target = nativeBuyItemBundle(targetValue);
  if (!source || !target) return false;
  for (const key of ["multiplayer_item_id", "quantity", "quickslotpos"]) {
    delete source.item[key];
    delete target.item[key];
  }
  return sameNativeItemValue(source, target);
}

/** Returns true when a talent is active, false when absent, or null for an incomplete talent bundle. */
function nativeHeroHasTalent(hero: any, talentName: string, minimumRank: number): boolean | null {
  const combat = parseNativeBundleObject(hero && hero.combatBundle);
  if (!combat) return null;
  for (let tierNumber = 1; tierNumber <= 4; tierNumber++) {
    const tier = combat["talents_tier_" + tierNumber];
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) return null;
    const points = tier[talentName] === undefined ? 0 : Number(tier[talentName]);
    if (!Number.isInteger(points) || points < 0 || points > 2) return null;
    if (points >= minimumRank) return true;
  }
  const replacements = combat.replacements;
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)) return null;
  if (Object.entries(replacements).some(([from, to]) =>
      String(from) === talentName || String(to) === talentName)) return true;
  return false;
}

/** The buy quote must match native pricing on the exact single-item FOR_SALE heap. */
export function isValidNativeBuyIntent(level: any, dataValue: unknown, currentDepthValue: unknown,
  playerIdValue: unknown, player: any, heroStateValue: unknown): boolean {
  const data: any = dataValue, depth = Number(currentDepthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps)
      || !isValidNativeFloorItemIdentitySet(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof heroStateValue !== "string") return false;
  const pos = Number(player.pos), heapId = String(data.heapId || ""), itemId = String(data.itemId || "");
  const itemClass = String(data.itemClass || ""), quantity = Number(data.expectedQuantity), price = Number(data.price);
  const resultItemId = String(data.resultItemId || ""), resultHeapId = String(data.resultHeapId || "");
  if (data.from !== pos || data.to !== pos || data.targetPos !== pos || data.depth !== depth || data.branch !== level.branch || data.branch !== 0
      || heapId.length < 8 || heapId.length > 80 || itemId.length < 8 || itemId.length > 80
      || resultItemId.length < 8 || resultItemId.length > 80 || itemClass.length < 1 || itemClass.length > 256
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000 || data.sourceQuantityBefore !== quantity
      || typeof data.stackable !== "boolean" || !Number.isInteger(price) || price < 0 || price > 10000000
      || !Number.isInteger(data.itemLevel) || data.itemLevel < -100 || data.itemLevel > 10000
      || typeof data.cursed !== "boolean" || typeof data.cursedKnown !== "boolean"
      || typeof data.itemBundle !== "string" || data.itemBundle.length < 1 || data.itemBundle.length > 200000
      || typeof data.acquiredByInventory !== "boolean" || !Number.isFinite(data.engineActionCost)
      || data.engineActionCost < 0 || data.engineActionCost > 10) return false;
  const matches = level.heaps.filter((heap: any) => String(heap?.heapId || "") === heapId);
  if (matches.length !== 1) return false;
  const heap = matches[0];
  if (Number(heap.pos) !== pos || String(heap.type) !== "FOR_SALE" || !Array.isArray(heap.items) || heap.items.length !== 1) return false;
  const item = heap.items[0];
  if (String(item?.itemId || "") !== itemId || String(item?.className || "") !== itemClass
      || Number(item?.quantity) !== quantity || item?.stackable !== data.stackable || item?.shopPrice !== price
      || Number(item?.level) !== data.itemLevel || item?.cursed !== data.cursed || item?.cursedKnown !== data.cursedKnown
      || typeof item?.serializedBundle !== "string" || item.serializedBundle !== data.itemBundle
      || !item.serializedBundle.includes(itemId)) return false;
  const sourceBundle = nativeBuyItemBundle(data.itemBundle);
  if (!sourceBundle || String(sourceBundle.item.__className || "") !== itemClass
      || String(sourceBundle.item.multiplayer_item_id || "") !== itemId
      || Number(sourceBundle.item.quantity) !== quantity) return false;
  // Bag/Wand collection performs nested ownership or charge mutations outside a BUY transaction.
  if (itemClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.bags.")
      || itemClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.wands.")) return false;
  if (data.acquiredByInventory && resultHeapId !== "") return false;
  if (!data.acquiredByInventory && (resultHeapId.length < 8 || resultHeapId.length > 80 || resultItemId !== itemId)) return false;
  let hero: any;
  try { hero = JSON.parse(heroStateValue); } catch (_) { return false; }
  if (Number(hero?.pos) !== pos || !Number.isInteger(hero?.gold) || hero.gold < price
      || !Number.isInteger(hero?.hp) || hero.hp <= 0
      || !parseNativeInventoryIndex(hero) || !parseNativeQuickslotIndex(hero)) return false;
  if (itemClass.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.rings.")) {
    const thiefIntuition = nativeHeroHasTalent(hero, "THIEFS_INTUITION", 2);
    if (thiefIntuition !== false) return false;
  }
  return true;
}

/** Deducts precisely the native sale price and adds/merges the exact bought item, or retains inventory if full. */
export function isValidNativeBuyInventoryMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); } catch (_) { return false; }
  const details: any = detailsValue, accepted: any = acceptedValue;
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  if (!details || !accepted || accepted.actionType !== "BUY" || !before || !after
      || accepted.heapId !== details.heapId || accepted.itemId !== details.itemId
      || accepted.itemClass !== details.itemClass || accepted.expectedQuantity !== details.expectedQuantity
      || accepted.price !== details.price || accepted.stackable !== details.stackable
      || accepted.resultItemId !== details.resultItemId || accepted.resultHeapId !== details.resultHeapId
      || accepted.acquiredByInventory !== details.acquiredByInventory
      || accepted.itemBundle !== details.itemBundle
      || typeof details.itemBundle !== "string" || details.itemBundle.length < 1 || details.itemBundle.length > 200000
      || !nativeBuyItemBundle(details.itemBundle)
      || !Number.isInteger(details.price) || details.price < 0 || !Number.isInteger(previous.gold)
      || !Number.isInteger(next.gold) || previous.gold - next.gold !== details.price || next.gold < 0
      || !nativeUseItemCombatBundleMatches(previous, next, "BUY")) return false;
  const beforeBuffs = nativeUseItemBuffMap(previous), afterBuffs = nativeUseItemBuffMap(next);
  if (!beforeBuffs || !afterBuffs) return false;
  const normalizeBuyBuffs = (value: Map<string, any[]>) => Array.from(value.entries())
    .sort((a: any,b: any) => String(a[0]).localeCompare(String(b[0])))
    .map(([className, rows]: [string, any[]]) => ({
      className, rows: rows.map(row => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown}))
        .sort((a,b) => String(a.serializedBundle).localeCompare(String(b.serializedBundle)) || a.cooldown-b.cooldown)
    }));
  if (!sameNativeItemValue(normalizeBuyBuffs(beforeBuffs), normalizeBuyBuffs(afterBuffs))) return false;
  const sourceId = String(details.itemId || ""), resultId = String(details.resultItemId || "");
  const itemClass = String(details.itemClass || ""), quantity = Number(details.expectedQuantity);
  if (sourceId.length < 8 || sourceId.length > 80 || resultId.length < 8 || resultId.length > 80
      || itemClass.length < 1 || itemClass.length > 256 || !Number.isInteger(quantity) || quantity < 1) return false;
  const beforeById = new Map<string, any>(before.map((item: any) => [String(item.itemId), item]));
  const afterById = new Map<string, any>(after.map((item: any) => [String(item.itemId), item]));
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!beforeSlots || !afterSlots) return false;

  if (!details.acquiredByInventory) {
    return previous.inventoryBundle === next.inventoryBundle && sameNativeItemValue(before, after)
      && previous.quickslotsJson === next.quickslotsJson && sameNativeItemValue(beforeSlots, afterSlots);
  }
  if (previous.inventoryBundle === next.inventoryBundle || beforeById.has(sourceId)) return false;
  let merged = false;
  if (resultId === sourceId) {
    const target = afterById.get(sourceId);
    if (!target || after.length !== before.length + 1 || String(target.className) !== itemClass
        || target.quantity !== quantity || target.stackable !== details.stackable
        || target.level !== details.itemLevel || target.cursed !== details.cursed
        || target.cursedKnown !== details.cursedKnown
        || !nativeBuyBundleMatchesIgnoringQuickslot(details.itemBundle, target.serializedBundle)
        || !sameNativeItemValue(before, after.filter((item: any) => String(item.itemId) !== sourceId))) return false;
  } else {
    const oldTarget = beforeById.get(resultId), target = afterById.get(resultId);
    if (!details.stackable || !oldTarget || !target || oldTarget.stackable !== true || target.stackable !== true
        || String(oldTarget.className) !== itemClass || String(target.className) !== itemClass
        || target.quantity !== oldTarget.quantity + quantity
        || !nativeBuyBundleMergeCompatible(details.itemBundle, oldTarget.serializedBundle)
        || !nativeBuyBundleMergeCompatible(details.itemBundle, target.serializedBundle)
        || !sameNativeItemValue(itemValueWithout(oldTarget, ["quantity", "serializedBundle"]),
          itemValueWithout(target, ["quantity", "serializedBundle"]))
        || before.length !== after.length
        || !sameNativeItemValue(before.filter((item: any) => String(item.itemId) !== resultId),
          after.filter((item: any) => String(item.itemId) !== resultId))) return false;
    merged = true;
  }
  const unrelatedSlots = (entries: any[]) => entries.filter((entry: any) => String(entry.itemId) !== resultId)
    .map((entry: any) => ({slot:entry.slot,itemId:entry.itemId,className:entry.className,
      quantity:entry.quantity,serializedBundle:entry.serializedBundle}))
    .sort((a: any,b: any) => Number(a.slot)-Number(b.slot));
  if (!sameNativeItemValue(unrelatedSlots(beforeSlots), unrelatedSlots(afterSlots))) return false;

  // A new purchase may fill one quickslot placeholder; a merge must preserve the existing target slot.
  const oldTargetSlots = beforeSlots.filter((entry: any) => String(entry.itemId) === resultId);
  const newTargetSlots = afterSlots.filter((entry: any) => String(entry.itemId) === resultId);
  if (oldTargetSlots.length > 1 || newTargetSlots.length > 1
      || (merged && (oldTargetSlots.length !== newTargetSlots.length
        || (oldTargetSlots.length === 1 && Number(oldTargetSlots[0].slot) !== Number(newTargetSlots[0].slot))))
      || (!merged && oldTargetSlots.length !== 0)) return false;
  const nativeResult = nativeBuyItemBundle(afterById.get(resultId)?.serializedBundle);
  if (!nativeResult) return false;
  if (newTargetSlots.length === 1) {
    if (Number(nativeResult.item.quickslotpos) !== Number(newTargetSlots[0].slot)) return false;
  } else if (Object.prototype.hasOwnProperty.call(nativeResult.item, "quickslotpos")) return false;
  return true;
}

/** Only the exact sale heap can disappear; a full backpack may replace it with a heap holding the paid item. */
export function isValidNativeBuyHeapMutation(previousHeaps: any, nextHeaps: any, targetValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  const target = Number(targetValue), details: any = detailsValue, accepted: any = acceptedValue;
  if (!Array.isArray(previousHeaps) || !Array.isArray(nextHeaps) || !details || !accepted
      || !Number.isInteger(target) || accepted.actionType !== "BUY" || accepted.targetPos !== target
      || accepted.heapId !== details.heapId || accepted.itemId !== details.itemId
      || accepted.itemClass !== details.itemClass || accepted.expectedQuantity !== details.expectedQuantity
      || accepted.price !== details.price || accepted.resultItemId !== details.resultItemId
      || accepted.resultHeapId !== details.resultHeapId || accepted.acquiredByInventory !== details.acquiredByInventory
      || accepted.itemBundle !== details.itemBundle) return false;
  const heapId = String(details.heapId || ""), itemId = String(details.itemId || "");
  const oldAt = previousHeaps.filter((heap: any) => String(heap?.heapId || "") === heapId);
  if (heapId.length < 8 || oldAt.length !== 1 || Number(oldAt[0].pos) !== target || String(oldAt[0].type) !== "FOR_SALE"
      || !Array.isArray(oldAt[0].items) || oldAt[0].items.length !== 1) return false;
  const source = oldAt[0].items[0];
  if (String(source?.itemId || "") !== itemId || String(source?.className || "") !== String(details.itemClass || "")
      || Number(source?.quantity) !== Number(details.expectedQuantity) || source?.shopPrice !== details.price
      || source?.stackable !== details.stackable || Number(source?.level) !== Number(details.itemLevel)
      || source?.cursed !== details.cursed || source?.cursedKnown !== details.cursedKnown
      || source?.serializedBundle !== details.itemBundle) return false;
  const afterAt = nextHeaps.filter((heap: any) => Number(heap?.pos) === target);
  if (details.acquiredByInventory) {
    if (afterAt.length !== 0) return false;
  } else {
    const resultHeapId = String(details.resultHeapId || "");
    if (afterAt.length !== 1 || String(afterAt[0].heapId || "") !== resultHeapId
        || resultHeapId.length < 8 || resultHeapId.length > 80 || resultHeapId === heapId
        || String(afterAt[0].type) !== "HEAP" || !Array.isArray(afterAt[0].items) || afterAt[0].items.length !== 1) return false;
    const dropped = afterAt[0].items[0];
    if (String(dropped?.itemId || "") !== itemId || String(dropped?.className || "") !== String(details.itemClass || "")
        || Number(dropped?.quantity) !== Number(details.expectedQuantity) || dropped?.stackable !== details.stackable
        || dropped?.shopPrice !== -1 || typeof dropped?.serializedBundle !== "string"
        || !nativeBuyBundleMatchesIgnoringQuickslot(details.itemBundle, dropped.serializedBundle)
        || !dropped.serializedBundle.includes(itemId)) return false;
  }
  for (const old of previousHeaps) {
    if (String(old?.heapId || "") === heapId) continue;
    const matching = nextHeaps.filter((heap: any) => String(heap?.heapId || "") === String(old?.heapId || ""));
    if (matching.length !== 1 || !sameNativeItemValue(old, matching[0])) return false;
  }
  for (const current of nextHeaps) {
    if (!details.acquiredByInventory && String(current?.heapId || "") === String(details.resultHeapId || "")) continue;
    if (String(current?.heapId || "") === heapId
        || previousHeaps.filter((heap: any) => String(heap?.heapId || "") === String(current?.heapId || "")).length !== 1) return false;
  }
  return true;
}

/** Validates the intent against the authoritative floor, not the caller's claimed target alone. */
export function isValidNativeSellBuybackRow(row: any): boolean {
  return !!row && isValidStableMultiplayerId(row.itemId)
    && typeof row.className === "string" && row.className.length > 0 && row.className.length <= 256
    && Number.isInteger(row.quantity) && row.quantity >= 1 && row.quantity <= 100000
    && Number.isInteger(row.level) && row.level >= -100 && row.level <= 10000
    && typeof row.cursed === "boolean" && typeof row.cursedKnown === "boolean"
    && typeof row.stackable === "boolean" && row.shopPrice === -1
    && Number.isInteger(row.nativeValue) && row.nativeValue >= 0 && row.nativeValue <= 10000000
    && Number.isInteger(row.nativeUnitValue) && row.nativeUnitValue >= -1 && row.nativeUnitValue <= 10000000
    && (row.nativeUnitValue < 0 || row.nativeUnitValue * row.quantity === row.nativeValue)
    && (row.quantity !== 1 || row.nativeUnitValue === row.nativeValue)
    && typeof row.serializedBundle === "string" && row.serializedBundle.length > 0
    && row.serializedBundle.length <= 200000 && row.serializedBundle.includes(row.itemId);
}

/** Validates the native seller, source ownership/value and the exact expected full/one-unit sale. */
export function isValidNativeSellIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, heroStateValue: unknown): boolean {
  const data: any = dataValue, depth = Number(depthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps) || !Array.isArray(level.mobs)
      || !isValidNativeFloorItemIdentitySet(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof heroStateValue !== "string") return false;
  const pos = Number(player.pos), shopEntityId = String(data.shopEntityId || "");
  const sourceId = String(data.sourceItemId || ""), resultId = String(data.resultItemId || "");
  const cls = String(data.itemClass || ""), bundle = String(data.resultItemBundle || "");
  const sourceQuantity = Number(data.sourceQuantityBefore), soldQuantity = Number(data.soldQuantity);
  const sourceValue = Number(data.sourceNativeValue), sourceUnitValue = Number(data.sourceNativeUnitValue);
  const price = Number(data.price), resultValue = Number(data.resultNativeValue);
  const resultUnitValue = Number(data.resultNativeUnitValue);
  if (data.from !== pos || data.to !== pos || data.targetPos !== pos || data.depth !== depth || data.branch !== 0
      || !Number.isFinite(data.engineActionCost) || data.engineActionCost < 0 || data.engineActionCost > 10
      || !isValidStableMultiplayerId(shopEntityId) || !isValidStableMultiplayerId(sourceId)
      || !isValidStableMultiplayerId(resultId) || cls.length < 1 || cls.length > 256
      || !Number.isInteger(sourceQuantity) || sourceQuantity < 1 || sourceQuantity > 100000
      || !Number.isInteger(soldQuantity) || soldQuantity < 1 || soldQuantity > sourceQuantity
      || !Number.isInteger(sourceValue) || sourceValue < 1 || sourceValue > 10000000
      || !Number.isInteger(sourceUnitValue) || sourceUnitValue < -1 || sourceUnitValue > 10000000
      || !Number.isInteger(price) || price < 1 || price > 10000000
      || !Number.isInteger(resultValue) || resultValue < 1 || resultValue > 10000000
      || !Number.isInteger(resultUnitValue) || resultUnitValue < -1 || resultUnitValue > 10000000
      || typeof data.stackable !== "boolean" || typeof data.sourceCursed !== "boolean"
      || typeof data.sourceCursedKnown !== "boolean"
      || !Number.isInteger(data.sourceItemLevel) || data.sourceItemLevel < -100 || data.sourceItemLevel > 10000
      || typeof data.resultCursed !== "boolean" || typeof data.resultCursedKnown !== "boolean"
      || !Number.isInteger(data.resultItemLevel) || data.resultItemLevel < -100 || data.resultItemLevel > 10000
      || typeof bundle !== "string" || bundle.length < 1 || bundle.length > 200000 || !bundle.includes(resultId)) return false;
  const sellers = level.mobs.filter((mob: any) => String(mob?.entityId || "") === shopEntityId);
  if (sellers.length !== 1 || String(sellers[0].name || "") !== "Shopkeeper"
      || !Array.isArray(sellers[0].buybackItems) || sellers[0].buybackItems.length > 3
      || !Number.isInteger(sellers[0].shopkeeperTurnsSinceHarmed)
      || sellers[0].shopkeeperTurnsSinceHarmed < -1 || sellers[0].shopkeeperTurnsSinceHarmed > 100000
      || Math.max(Math.abs((Number(sellers[0].pos) % Number(level.width)) - (pos % Number(level.width))),
        Math.abs(Math.floor(Number(sellers[0].pos) / Number(level.width)) - Math.floor(pos / Number(level.width)))) > 1
      || sellers[0].buybackItems.some((row: any) => !isValidNativeSellBuybackRow(row))) return false;

  let hero: any;
  try { hero = JSON.parse(heroStateValue); } catch (_) { return false; }
  if (Number(hero?.pos) !== pos || !Number.isInteger(hero?.hp) || hero.hp <= 0
      || !Number.isInteger(hero?.gold) || hero.gold < 0) return false;
  const inventory = parseNativeInventoryIndex(hero), quickslots = parseNativeQuickslotIndex(hero);
  const economy = parseNativeItemEconomyIndex(hero);
  if (!inventory || !quickslots || !economy) return false;
  const sources = inventory.filter((row: any) => String(row.itemId) === sourceId);
  const source = sources[0];
  const sourceEconomyRows = economy.filter((row: any) => String(row.itemId) === sourceId);
  const sourceEconomy = sourceEconomyRows[0];
  if (sources.length !== 1 || sourceEconomyRows.length !== 1
      || String(source.className) !== cls || source.quantity !== sourceQuantity || source.stackable !== data.stackable
      || source.equipped !== false || source.level !== data.sourceItemLevel
      || source.cursed !== data.sourceCursed || source.cursedKnown !== data.sourceCursedKnown
      || data.resultItemLevel !== data.sourceItemLevel || data.resultCursed !== data.sourceCursed
      || data.resultCursedKnown !== data.sourceCursedKnown
      || sourceEconomy.nativeValue !== sourceValue || sourceEconomy.nativeUnitValue !== sourceUnitValue
      || sourceEconomy.nativeSellable !== true
      || (sourceUnitValue >= 0 && sourceValue !== sourceUnitValue * sourceQuantity)) return false;

  const isFullSale = soldQuantity === sourceQuantity;
  const isOneUnitPartial = soldQuantity === 1 && sourceQuantity > 1;
  if (!isFullSale && !isOneUnitPartial) return false;
  if (isFullSale) {
    if (resultId !== sourceId || price !== sourceValue || resultValue !== sourceValue
        || resultUnitValue !== sourceUnitValue || bundle !== source.serializedBundle) return false;
  } else {
    if (data.stackable !== true || sourceUnitValue <= 0 || resultId === sourceId
        || sourceValue !== sourceUnitValue * sourceQuantity || price !== sourceUnitValue
        || resultValue !== price || resultUnitValue !== price) return false;
    if (inventory.some((row: any) => String(row.itemId) === resultId)
        || level.heaps.some((heap: any) => (Array.isArray(heap.items) ? heap.items : [])
          .some((row: any) => String(row?.itemId || "") === resultId))) return false;
  }
  const preExistingBuybackIds = level.mobs.filter((mob: any) => String(mob?.name || "") === "Shopkeeper")
    .flatMap((mob: any) => Array.isArray(mob.buybackItems) ? mob.buybackItems.map((row: any) => String(row?.itemId || "")) : []);
  if (preExistingBuybackIds.includes(resultId)) return false;
  if (level.heaps.some((heap: any) => (Array.isArray(heap.items) ? heap.items : [])
      .some((row: any) => String(row?.itemId || "") === resultId))) return false;
  return true;
}

/** Checks exact inventory removal/remainder, gold credit, native value ledger and quickslot state. */
export function isValidNativeSellInventoryMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); } catch (_) { return false; }
  const details: any = detailsValue, accepted: any = acceptedValue;
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  const beforeEconomy = parseNativeItemEconomyIndex(previous), afterEconomy = parseNativeItemEconomyIndex(next);
  if (!details || !accepted || accepted.actionType !== "SELL" || !before || !after
      || !beforeEconomy || !afterEconomy || accepted.shopEntityId !== details.shopEntityId
      || accepted.sourceItemId !== details.sourceItemId || accepted.resultItemId !== details.resultItemId
      || accepted.itemClass !== details.itemClass || accepted.sourceQuantityBefore !== details.sourceQuantityBefore
      || accepted.sourceItemLevel !== details.sourceItemLevel || accepted.sourceCursed !== details.sourceCursed
      || accepted.sourceCursedKnown !== details.sourceCursedKnown
      || accepted.soldQuantity !== details.soldQuantity || accepted.sourceNativeValue !== details.sourceNativeValue
      || accepted.sourceNativeUnitValue !== details.sourceNativeUnitValue || accepted.price !== details.price
      || accepted.stackable !== details.stackable || accepted.resultItemBundle !== details.resultItemBundle
      || accepted.resultNativeValue !== details.resultNativeValue
      || accepted.resultNativeUnitValue !== details.resultNativeUnitValue
      || accepted.resultItemLevel !== details.resultItemLevel || accepted.resultCursed !== details.resultCursed
      || accepted.resultCursedKnown !== details.resultCursedKnown
      || previous.inventoryBundle === next.inventoryBundle
      || previous.hp !== next.hp || previous.ht !== next.ht || previous.pos !== next.pos
      || previous.shielding !== next.shielding || previous.combatBundle !== next.combatBundle
      || previous.notesBundle !== next.notesBundle || previous.questStateBundle !== next.questStateBundle
      || previous.ironKeyCount !== next.ironKeyCount || previous.crystalKeyCount !== next.crystalKeyCount
      || previous.wornKeyCount !== next.wornKeyCount || previous.goldenKeyCount !== next.goldenKeyCount
      || previous.alchemyEnergy !== next.alchemyEnergy
      || !Number.isInteger(previous.gold) || !Number.isInteger(next.gold)
      || next.gold - previous.gold !== Number(details.price) || next.gold > 1000000000) return false;

  const sourceId = String(details.sourceItemId || ""), resultId = String(details.resultItemId || "");
  const cls = String(details.itemClass || ""), sourceQuantity = Number(details.sourceQuantityBefore);
  const soldQuantity = Number(details.soldQuantity), price = Number(details.price);
  const oldSourceRows = before.filter((row: any) => String(row.itemId) === sourceId);
  const newSourceRows = after.filter((row: any) => String(row.itemId) === sourceId);
  const oldSourceEconomy = beforeEconomy.filter((row: any) => String(row.itemId) === sourceId);
  const newSourceEconomy = afterEconomy.filter((row: any) => String(row.itemId) === sourceId);
  if (oldSourceRows.length !== 1 || oldSourceEconomy.length !== 1
      || String(oldSourceRows[0].className) !== cls || oldSourceRows[0].quantity !== sourceQuantity
      || oldSourceRows[0].equipped !== false || oldSourceRows[0].stackable !== details.stackable
      || oldSourceEconomy[0].nativeValue !== details.sourceNativeValue
      || oldSourceEconomy[0].nativeUnitValue !== details.sourceNativeUnitValue
      || oldSourceEconomy[0].nativeSellable !== true) return false;
  const isFullSale = soldQuantity === sourceQuantity;
  const isPartial = soldQuantity === 1 && sourceQuantity > 1 && details.stackable === true;
  if (!isFullSale && !isPartial) return false;
  const remainder = sourceQuantity - soldQuantity;
  if (remainder === 0) {
    if (newSourceRows.length !== 0 || newSourceEconomy.length !== 0 || resultId !== sourceId) return false;
  } else {
    if (newSourceRows.length !== 1 || newSourceEconomy.length !== 1 || resultId === sourceId
        || newSourceRows[0].quantity !== remainder
        || !sameNativeItemValue(itemValueWithout(oldSourceRows[0], ["quantity", "serializedBundle"]),
          itemValueWithout(newSourceRows[0], ["quantity", "serializedBundle"]))
        || oldSourceEconomy[0].nativeUnitValue <= 0
        || oldSourceEconomy[0].nativeValue !== oldSourceEconomy[0].nativeUnitValue * sourceQuantity
        || newSourceEconomy[0].nativeUnitValue !== oldSourceEconomy[0].nativeUnitValue
        || newSourceEconomy[0].nativeValue !== oldSourceEconomy[0].nativeUnitValue * remainder
        || newSourceEconomy[0].nativeSellable !== true) return false;
  }
  if (!sameNativeItemValue(before.filter((row: any) => String(row.itemId) !== sourceId),
      after.filter((row: any) => String(row.itemId) !== sourceId))) return false;
  const oldEconomyOthers = beforeEconomy.filter((row: any) => String(row.itemId) !== sourceId);
  const newEconomyOthers = afterEconomy.filter((row: any) => String(row.itemId) !== sourceId);
  if (!sameNativeItemValue(oldEconomyOthers, newEconomyOthers)) return false;

  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!beforeSlots || !afterSlots) return false;
  const oldSourceSlots = beforeSlots.filter((slot: any) => String(slot.itemId) === sourceId);
  const newSourceSlots = afterSlots.filter((slot: any) => String(slot.itemId) === sourceId);
  if (remainder === 0) {
    if (newSourceSlots.length !== 0) return false;
  } else {
    if (newSourceSlots.length !== oldSourceSlots.length) return false;
    for (const oldSlot of oldSourceSlots) {
      const current = newSourceSlots.find((slot: any) => Number(slot.slot) === Number(oldSlot.slot));
      if (!current || current.quantity !== remainder || String(current.className) !== cls
          || String(current.serializedBundle) !== String(newSourceRows[0].serializedBundle)
          || !sameNativeItemValue(itemValueWithout(oldSlot, ["quantity", "serializedBundle"]),
            itemValueWithout(current, ["quantity", "serializedBundle"]))) return false;
    }
  }
  const unrelated = (slots: any[]) => slots.filter((slot: any) => String(slot.itemId) !== sourceId)
    .slice().sort((a: any,b: any) => Number(a.slot)-Number(b.slot));
  return sameNativeItemValue(unrelated(beforeSlots), unrelated(afterSlots));
}

/** Only the exact Shopkeeper's buyback list may change, by appending the sold native item. */
export function isValidNativeSellShopkeeperMutation(previousMobs: any[], nextMobs: any[],
  detailsValue: unknown, acceptedValue: unknown): boolean {
  const details: any = detailsValue, accepted: any = acceptedValue;
  if (!Array.isArray(previousMobs) || !Array.isArray(nextMobs) || !details || !accepted
      || accepted.actionType !== "SELL" || accepted.shopEntityId !== details.shopEntityId
      || accepted.resultItemId !== details.resultItemId || accepted.itemClass !== details.itemClass
      || accepted.soldQuantity !== details.soldQuantity || accepted.price !== details.price
      || accepted.resultItemBundle !== details.resultItemBundle
      || accepted.resultNativeValue !== details.resultNativeValue
      || accepted.resultNativeUnitValue !== details.resultNativeUnitValue) return false;
  const index = (rows: any[]) => {
    const map = new Map<string, any>();
    for (const row of rows) {
      const id = String(row?.entityId || "");
      if (!isValidStableMultiplayerId(id) || map.has(id)) return null;
      map.set(id, row);
    }
    return map;
  };
  const before = index(previousMobs), after = index(nextMobs);
  if (!before || !after || before.size !== after.size) return false;
  const shopId = String(details.shopEntityId || ""), oldShop = before.get(shopId), newShop = after.get(shopId);
  if (!oldShop || !newShop || String(oldShop.name || "") !== "Shopkeeper" || String(newShop.name || "") !== "Shopkeeper"
      || oldShop.serializedBundle === newShop.serializedBundle
      || !Array.isArray(oldShop.buybackItems) || oldShop.buybackItems.length > 3
      || !Array.isArray(newShop.buybackItems) || newShop.buybackItems.length > 3
      || oldShop.shopkeeperTurnsSinceHarmed !== newShop.shopkeeperTurnsSinceHarmed
      || !Number.isInteger(oldShop.shopkeeperTurnsSinceHarmed)
      || oldShop.shopkeeperTurnsSinceHarmed < -1 || oldShop.shopkeeperTurnsSinceHarmed > 100000) return false;
  for (const row of oldShop.buybackItems) if (!isValidNativeSellBuybackRow(row)) return false;
  for (const [id, oldMob] of before) {
    const newMob = after.get(id);
    if (!newMob) return false;
    if (id !== shopId) {
      if (!sameNativeItemValue(itemValueWithout(oldMob, ["mobId"]), itemValueWithout(newMob, ["mobId"]))) return false;
    } else {
      if (!sameNativeItemValue(itemValueWithout(oldShop, ["mobId", "serializedBundle", "buybackItems"]),
            itemValueWithout(newShop, ["mobId", "serializedBundle", "buybackItems"]))) return false;
    }
  }
  const sold: any = {
    itemId: String(details.resultItemId),
    className: String(details.itemClass),
    quantity: Number(details.soldQuantity),
    level: Number(details.resultItemLevel),
    cursed: details.resultCursed,
    cursedKnown: details.resultCursedKnown,
    stackable: details.stackable,
    shopPrice: -1,
    nativeValue: Number(details.resultNativeValue),
    nativeUnitValue: Number(details.resultNativeUnitValue),
    serializedBundle: String(details.resultItemBundle)
  };
  if (!isValidNativeSellBuybackRow(sold) || !sold.serializedBundle.includes(sold.itemId)
      || oldShop.buybackItems.some((row: any) => String(row.itemId) === sold.itemId)) return false;
  const expected = [...oldShop.buybackItems, sold].slice(-3);
  return sameNativeItemValue(expected, newShop.buybackItems);
}

