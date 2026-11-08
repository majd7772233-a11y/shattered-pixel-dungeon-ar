import { parseNativeBundleObject } from "./abilities";
import { nativeEquipmentBundleItem, nativeEquipmentPayloadMatchesRow } from "./equipment";

export function isValidStableMultiplayerId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,80}$/.test(value);
}

/** Complete native floor snapshots may not omit or duplicate heap/item identities. */
export function isValidNativeFloorItemIdentitySet(heapsValue: unknown): boolean {
  if (!Array.isArray(heapsValue) || heapsValue.length > 10000) return false;
  const heapIds = new Set<string>(), itemIds = new Set<string>();
  let totalItems = 0;
  for (const heap of heapsValue) {
    if (!heap || typeof heap !== "object" || !isValidStableMultiplayerId(heap.heapId)
        || heapIds.has(heap.heapId) || !Array.isArray(heap.items) || heap.items.length > 512) return false;
    heapIds.add(heap.heapId);
    for (const item of heap.items) {
      if (!item || typeof item !== "object" || ++totalItems > 8192
          || !isValidStableMultiplayerId(item.itemId) || itemIds.has(item.itemId)
          || typeof item.className !== "string" || item.className.length < 1 || item.className.length > 256
          || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100000
          || !Number.isInteger(item.level) || item.level < -100 || item.level > 10000
          || typeof item.cursed !== "boolean" || typeof item.cursedKnown !== "boolean"
          || typeof item.stackable !== "boolean"
          || typeof item.serializedBundle !== "string" || item.serializedBundle.length < 1
          || item.serializedBundle.length > 200000 || !item.serializedBundle.includes(item.itemId)) return false;
      itemIds.add(item.itemId);
    }
  }
  return true;
}

/** Claim identity excludes cell position and includes room (the Durable Object), depth and branch. */
export function nativeLootClaimScopeKey(depthValue: unknown, branchValue: unknown,
  heapIdValue: unknown, itemIdValue: unknown): string | null {
  if (typeof depthValue !== "number" || !Number.isInteger(depthValue) || depthValue < 1 || depthValue > 100
      || typeof branchValue !== "number" || !Number.isInteger(branchValue) || branchValue < 0 || branchValue > 32
      || !isValidStableMultiplayerId(heapIdValue) || !isValidStableMultiplayerId(itemIdValue)) return null;
  return JSON.stringify([depthValue, branchValue, heapIdValue, itemIdValue]);
}

export function isNativeLootClaimSchemaCurrent(columnsValue: unknown): boolean {
  if (!Array.isArray(columnsValue)) return false;
  const columns: any[] = columnsValue.filter((value: any) => value && typeof value === "object");
  const branch = columns.find((column: any) => String(column.name) === "branch");
  if (!branch || Number(branch.notnull) !== 1 || String(branch.dflt_value).replace(/['"]/g, "") !== "0") return false;
  const primaryKey = columns.filter((column: any) => Number(column.pk) > 0)
    .sort((a: any, b: any) => Number(a.pk) - Number(b.pk))
    .map((column: any) => String(column.name));
  return JSON.stringify(primaryKey) === JSON.stringify(["depth", "branch", "heap_id", "item_id"]);
}

export interface NativeLootClaimSql {
  exec(query: string, ...bindings: any[]): any;
}
export interface NativeLootClaimTransactionHost {
  transactionSync<T>(callback: () => T): T;
}

/** Atomically reserves one stable item instance. Only the same owner/request retry is idempotent. */
export function reserveNativeLootClaim(storage: NativeLootClaimTransactionHost, sql: NativeLootClaimSql,
  depthValue: unknown, branchValue: unknown, heapIdValue: unknown, itemIdValue: unknown,
  playerIdValue: unknown, requestIdValue: unknown): boolean {
  const scope = nativeLootClaimScopeKey(depthValue, branchValue, heapIdValue, itemIdValue);
  const playerId = typeof playerIdValue === "string" ? playerIdValue : "";
  const requestId = typeof requestIdValue === "string" ? requestIdValue : "";
  if (scope == null || isNativeLootClaimConflict(null, playerId, requestId)) return false;
  const depth = depthValue as number, branch = branchValue as number;
  const heapId = heapIdValue as string, itemId = itemIdValue as string;
  return storage.transactionSync(() => {
    sql.exec("INSERT OR IGNORE INTO claimed_item_instances (depth,branch,heap_id,item_id,claimed_by,request_id) VALUES (?,?,?,?,?,?)",
      depth, branch, heapId, itemId, playerId, requestId);
    const rows = sql.exec("SELECT claimed_by,request_id FROM claimed_item_instances WHERE depth = ? AND branch = ? AND heap_id = ? AND item_id = ?",
      depth, branch, heapId, itemId).toArray();
    return rows.length === 1 && !isNativeLootClaimConflict(rows[0], playerId, requestId);
  });
}

/** A reserved item can be retried only by the exact same player and request ID. */
export function isNativeLootClaimConflict(claimValue: unknown, playerIdValue: unknown, requestIdValue: unknown): boolean {
  const playerId = typeof playerIdValue === "string" ? playerIdValue : "";
  const requestId = typeof requestIdValue === "string" ? requestIdValue : "";
  if (!playerId || playerId.length > 80 || !/^[A-Za-z0-9._:-]+$/.test(playerId)
      || !requestId || requestId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) return true;
  if (claimValue == null) return false;
  if (typeof claimValue !== "object") return true;
  const claim: any = claimValue;
  return String(claim.claimed_by || "") !== playerId || String(claim.request_id || "") !== requestId;
}

export type NativeMutationLockStatus = "FREE" | "OWNED" | "PENDING" | "STALE";

/** Native inventory/economy writes cannot overlap before the previous post-state commits. */
export function requiresNativeMutationSnapshot(actionValue: unknown): boolean {
  return ["UNLOCK", "MINE", "OPEN_CHEST", "PICKUP", "DROP", "EQUIP", "UNEQUIP",
    "BUY", "BUYBACK", "SELL", "USE_ITEM", "THROW", "ALCHEMY", "USE_ABILITY"].includes(String(actionValue || ""));
}

/** Checks exact lock ownership without expiry, for safe cleanup of the matching request only. */
export function isNativeMutationLockForRequest(lockValue: unknown, playerIdValue: unknown,
  requestIdValue: unknown, actionValue: unknown): boolean {
  let lock: any = lockValue;
  if (typeof lockValue === "string") {
    try { lock = JSON.parse(lockValue); } catch (_) { return false; }
  }
  return !!lock && typeof lock === "object" && !Array.isArray(lock)
    && String(lock.playerId || "") === String(playerIdValue || "")
    && String(lock.requestId || "") === String(requestIdValue || "")
    && String(lock.actionType || "") === String(actionValue || "")
    && requiresNativeMutationSnapshot(lock.actionType)
    && Number.isInteger(lock.depth) && Number(lock.depth) >= 1 && Number(lock.depth) <= 100
    && Number.isFinite(Number(lock.createdAt)) && Number(lock.createdAt) > 0;
}

/** Classifies a per-player mutation lock; malformed or expired locks require resync. */
export function classifyNativeMutationLock(lockValue: unknown, playerIdValue: unknown,
  requestIdValue: unknown, actionValue: unknown, nowValue: unknown = Date.now(),
  staleAfterValue: unknown = 30000): NativeMutationLockStatus {
  if (lockValue == null || lockValue === "") return "FREE";
  let lock: any = lockValue;
  if (typeof lockValue === "string") {
    try { lock = JSON.parse(lockValue); } catch (_) { return "STALE"; }
  }
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) return "STALE";
  const playerId = String(playerIdValue || ""), requestId = String(requestIdValue || "");
  const action = String(actionValue || ""), now = Number(nowValue), staleAfter = Number(staleAfterValue);
  const createdAt = Number(lock.createdAt);
  if (!playerId || !requestId || requestId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(requestId)
      || !requiresNativeMutationSnapshot(lock.actionType)
      || String(lock.playerId || "") !== playerId
      || !Number.isInteger(lock.depth) || lock.depth < 1 || lock.depth > 100
      || !Number.isFinite(createdAt) || createdAt <= 0
      || !Number.isFinite(now) || now < createdAt
      || !Number.isFinite(staleAfter) || staleAfter < 1000 || staleAfter > 300000
      || now - createdAt > staleAfter) return "STALE";
  return String(lock.requestId || "") === requestId && String(lock.actionType) === action ? "OWNED" : "PENDING";
}

export const NATIVE_MULTIPLAYER_BAG_CLASSES = new Set([
  "com.shatteredpixel.shatteredpixeldungeon.items.bags.ScrollHolder",
  "com.shatteredpixel.shatteredpixeldungeon.items.bags.PotionBandolier",
  "com.shatteredpixel.shatteredpixeldungeon.items.bags.VelvetPouch",
  "com.shatteredpixel.shatteredpixeldungeon.items.bags.MagicalHolster"
]);

export function nativeBagCanHoldItemClass(bagClassValue: unknown, itemClassValue: unknown): boolean {
  const bagClass = String(bagClassValue || ""), itemClass = String(itemClassValue || "");
  if (bagClass.endsWith(".ScrollHolder")) {
    return itemClass.includes(".items.scrolls.") || itemClass.includes(".items.spells.")
      || itemClass.endsWith(".ArcaneResin") || itemClass.endsWith(".Stylus");
  }
  if (bagClass.endsWith(".PotionBandolier")) {
    return itemClass.includes(".items.potions.") || itemClass.endsWith(".LiquidMetal")
      || itemClass.endsWith(".Waterskin");
  }
  if (bagClass.endsWith(".VelvetPouch")) {
    return itemClass.includes(".plants.") && itemClass.endsWith("$Seed")
      || itemClass.endsWith(".Runestone") || itemClass.endsWith(".GooBlob") || itemClass.endsWith(".MetalShard");
  }
  if (bagClass.endsWith(".MagicalHolster")) {
    return itemClass.includes(".items.wands.") || itemClass.includes(".items.weapon.missiles.")
      || itemClass.includes(".items.bombs.");
  }
  return false;
}

/** Validates the flattened inventory index against the exact native Belongings/Bag bundle tree. */
export function isValidNativeInventoryBundleIndex(heroValue: any, rowsValue: unknown): boolean {
  if (!heroValue || typeof heroValue !== "object" || !Array.isArray(rowsValue) || rowsValue.length > 1024) return false;
  const root = parseNativeBundleObject(heroValue.inventoryBundle);
  if (!root || !Array.isArray(root.inventory) || root.inventory.length > 1024) return false;
  const rows: any[] = rowsValue;
  const byId = new Map<string, any>();
  for (const row of rows) {
    const id = String(row?.itemId || "");
    if (!id || byId.has(id) || typeof row?.containerId !== "string"
        || row.containerId.length < 1 || row.containerId.length > 80) return false;
    byId.set(id, row);
  }
  const seen = new Set<string>();
  const visit = (payload: any, containerId: string, depth: number, equippedSlot: boolean): boolean => {
    if (depth > 8 || seen.size >= 1024) return false;
    const item = nativeEquipmentBundleItem(payload);
    const id = String(item?.multiplayer_item_id || ""), className = String(item?.__className || "");
    const row = byId.get(id);
    if (!item || !row || !id || seen.has(id) || className !== String(row.className)
        || String(row.containerId) !== containerId || row.equipped !== equippedSlot
        || !nativeEquipmentPayloadMatchesRow(item, row)) return false;
    const bagClass = className.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.bags.");
    if (bagClass) {
      if (item.inventory !== undefined && !Array.isArray(item.inventory)) return false;
      const children = Array.isArray(item.inventory) ? item.inventory : [];
      if (children.length > 20) return false;
      seen.add(id);
      for (const child of children) if (!visit(child, id, depth + 1, false)) return false;
    } else {
      if (Array.isArray(item.inventory) && item.inventory.length > 0) return false;
      seen.add(id);
    }
    return true;
  };
  for (const payload of root.inventory) if (!visit(payload, "BACKPACK", 0, false)) return false;
  const equipmentSlots: Array<[string,string]> = [
    ["weapon","WEAPON"],["armor","ARMOR"],["artifact","ARTIFACT"],
    ["misc","MISC"],["ring","RING"],["second_wep","SECOND_WEP"]
  ];
  for (const [field,containerId] of equipmentSlots) {
    if (root[field] != null && !visit(root[field], containerId, 0, true)) return false;
  }
  return seen.size === rows.length;
}

export function parseNativeInventoryIndex(heroValue: any): any[] | null {
  if (!heroValue || typeof heroValue !== "object" || typeof heroValue.inventoryItemsJson !== "string"
      || heroValue.inventoryItemsJson.length < 2 || heroValue.inventoryItemsJson.length > 200000) return null;
  try {
    const rows = JSON.parse(heroValue.inventoryItemsJson), ids = new Set<string>();
    if (!Array.isArray(rows) || rows.length > 1024) return null;
    for (const item of rows) {
      const id = String(item?.itemId || ""), cls = String(item?.className || "");
      if (id.length < 8 || id.length > 80 || ids.has(id) || cls.length < 1 || cls.length > 256
          || !Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > 100000
          || !Number.isInteger(item?.level) || item.level < -1000 || item.level > 10000
          || typeof item?.stackable !== "boolean" || typeof item?.cursed !== "boolean"
          || typeof item?.cursedKnown !== "boolean" || typeof item?.equipped !== "boolean"
          || typeof item?.serializedBundle !== "string" || item.serializedBundle.length < 1
          || item.serializedBundle.length > 200000 || !item.serializedBundle.includes(id)) return null;
      ids.add(id);
    }
    if (Object.prototype.hasOwnProperty.call(heroValue, "nativeInventoryTreeVersion")) {
      if (heroValue.nativeInventoryTreeVersion !== 1 || rows.some((row:any) =>
          !Object.prototype.hasOwnProperty.call(row, "containerId"))
          || !isValidNativeInventoryBundleIndex(heroValue, rows)) return null;
    } else if (rows.some((row:any) => Object.prototype.hasOwnProperty.call(row, "containerId"))) {
      return null;
    }
    return rows;
  } catch (_) { return null; }
}
export function parseNativeItemEconomyIndex(heroValue: any): any[] | null {
  const inventory = parseNativeInventoryIndex(heroValue);
  if (!inventory || typeof heroValue?.nativeItemEconomyJson !== "string"
      || heroValue.nativeItemEconomyJson.length < 2 || heroValue.nativeItemEconomyJson.length > 200000) return null;
  try {
    const rows = JSON.parse(heroValue.nativeItemEconomyJson);
    if (!Array.isArray(rows) || rows.length !== inventory.length || rows.length > 1024) return null;
    const inventoryById = new Map<string, any>(inventory.map((row: any) => [String(row.itemId), row]));
    const ids = new Set<string>();
    for (const row of rows) {
      const id = String(row?.itemId || ""), cls = String(row?.className || "");
      const nativeValue = Number(row?.nativeValue), unitValue = Number(row?.nativeUnitValue);
      const item = inventoryById.get(id);
      if (!item || ids.has(id) || cls !== String(item.className) || row.quantity !== item.quantity
          || !Number.isInteger(nativeValue) || nativeValue < 0 || nativeValue > 10000000
          || !Number.isInteger(unitValue) || unitValue < -1 || unitValue > 10000000
          || typeof row.nativeSellable !== "boolean"
          || (unitValue >= 0 && unitValue * row.quantity !== nativeValue)
          || (row.quantity === 1 && unitValue !== nativeValue)
          || (row.nativeSellable && (nativeValue <= 0 || item.equipped === true))) return null;
      ids.add(id);
    }
    return rows;
  } catch (_) { return null; }
}

/**
 * Keeps the sell-value index bound to accepted native inventory deltas. This sidecar is never
 * permitted to re-price an unchanged item as a side effect of an unrelated action.
 */
export function isValidNativeItemEconomyIndexMutation(previousHeroValue: unknown, nextHeroValue: unknown,
  actionValue: unknown, detailsValue: unknown, previousHeapsValue: unknown, nextHeapsValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousHeroValue || "")); next = JSON.parse(String(nextHeroValue || "")); }
  catch (_) { return false; }
  const action = String(actionValue || ""), details: any = detailsValue;
  const hasBefore = Object.prototype.hasOwnProperty.call(previous || {}, "nativeItemEconomyJson");
  const hasAfter = Object.prototype.hasOwnProperty.call(next || {}, "nativeItemEconomyJson");
  // Preserve backward compatibility for a pre-economy snapshot, but never accept a one-sided index.
  if (!hasBefore && !hasAfter) return true;
  if (!hasBefore || !hasAfter) return false;

  const beforeInventory = parseNativeInventoryIndex(previous), afterInventory = parseNativeInventoryIndex(next);
  const beforeEconomy = parseNativeItemEconomyIndex(previous), afterEconomy = parseNativeItemEconomyIndex(next);
  if (!beforeInventory || !afterInventory || !beforeEconomy || !afterEconomy) return false;
  const beforeItems = new Map<string, any>(beforeInventory.map((row: any) => [String(row.itemId), row]));
  const afterItems = new Map<string, any>(afterInventory.map((row: any) => [String(row.itemId), row]));
  const beforeValues = new Map<string, any>(beforeEconomy.map((row: any) => [String(row.itemId), row]));
  const afterValues = new Map<string, any>(afterEconomy.map((row: any) => [String(row.itemId), row]));
  const findFloorItems = (heapsValue: unknown, itemId: string): any[] => {
    if (!Array.isArray(heapsValue)) return [];
    return heapsValue.flatMap((heap: any) => Array.isArray(heap?.items) ? heap.items : [])
      .filter((row: any) => String(row?.itemId || "") === itemId);
  };
  const sourceFloorId = String(details?.itemId || "");
  const sourceFloorBefore = sourceFloorId ? findFloorItems(previousHeapsValue, sourceFloorId) : [];
  const isPickupOrBuy = action === "PICKUP" || action === "BUY";
  const isBuyback = action === "BUYBACK";

  for (const [id, current] of afterItems) {
    const old = beforeItems.get(id), value = afterValues.get(id);
    if (!value) return false;
    if (!old) {
      // New inventory instances must originate in the identified floor item, or the accepted native
      // alchemy result. INTERACT/MINE and other ambiguous inventory grants fail closed.
      if (isPickupOrBuy) {
        if (sourceFloorBefore.length !== 1) return false;
        const floorItem = sourceFloorBefore[0];
        if (id !== sourceFloorId || String(current.className) !== String(floorItem.className)
            || Number(current.quantity) !== Number(floorItem.quantity)
            || value.nativeValue !== Number(floorItem.nativeValue)
            || value.nativeUnitValue !== Number(floorItem.nativeUnitValue)) return false;
      } else if (isBuyback) {
        if (id !== String(details?.buybackItemId || "") || id !== String(details?.resultItemId || "")
            || String(current.className) !== String(details?.buybackItemClass || "")
            || Number(current.quantity) !== Number(details?.buybackQuantity)
            || value.nativeValue !== Number(details?.nativeValue)
            || value.nativeUnitValue !== Number(details?.nativeUnitValue)
            || value.nativeSellable !== true) return false;
      } else if (action === "ALCHEMY" && details?.resultLocation === "INVENTORY") {
        if (id !== String(details.resultItemId || "") || String(current.className) !== String(details.resultItemClass || "")
            || Number(current.quantity) !== Number(details.resultQuantity)
            || current.stackable !== details.resultStackable
            || value.nativeValue !== Number(details.resultNativeValue)
            || value.nativeUnitValue !== Number(details.resultNativeUnitValue)) return false;
      } else if (action === "MINE" && Number(details?.sourceTerrain) === 12) {
        if (!String(current.className || "").endsWith(".items.quest.DarkGold")
            || Number(current.quantity) !== 1 || current.stackable !== true || current.equipped === true
            || value.nativeValue !== 0 || value.nativeUnitValue !== 0 || value.nativeSellable !== false) return false;
      } else {
        return false;
      }
      continue;
    }

    const oldValue = beforeValues.get(id);
    if (!oldValue || String(old.className) !== String(current.className)) return false;
    if (Number(old.quantity) === Number(current.quantity)) {
      if (oldValue.nativeValue !== value.nativeValue
          || oldValue.nativeUnitValue !== value.nativeUnitValue) return false;
      if (action === "ALCHEMY" && id === String(details?.resultItemId || "")
          && (value.nativeValue !== details.resultNativeValue
            || value.nativeUnitValue !== details.resultNativeUnitValue)) return false;
      if (oldValue.nativeSellable !== value.nativeSellable) {
        const equipmentTransition = (action === "EQUIP" || action === "UNEQUIP")
          && old.equipped !== current.equipped;
        if (!equipmentTransition
            || (current.equipped === true && value.nativeSellable !== false)
            || (current.equipped === false && oldValue.nativeSellable !== false)) return false;
      }
      continue;
    }

    if (action === "MINE"
        && (Number(details?.sourceTerrain) !== 12
          || !String(current.className || "").endsWith(".items.quest.DarkGold")
          || !String(old.className || "").endsWith(".items.quest.DarkGold")
          || !old.stackable || !current.stackable
          || Number(current.quantity) !== Number(old.quantity) + 1
          || oldValue.nativeValue !== 0 || value.nativeValue !== 0
          || oldValue.nativeUnitValue !== 0 || value.nativeUnitValue !== 0
          || oldValue.nativeSellable !== false || value.nativeSellable !== false)) return false;
    if (oldValue.nativeUnitValue < 0
        || value.nativeUnitValue !== oldValue.nativeUnitValue
        || value.nativeValue !== value.nativeUnitValue * Number(current.quantity)
        || value.nativeSellable !== oldValue.nativeSellable) return false;
    if (action === "ALCHEMY" && id === String(details?.resultItemId || "")
        && (value.nativeValue !== details.resultNativeValue
          || value.nativeUnitValue !== details.resultNativeUnitValue)) return false;

    if (isPickupOrBuy && Number(current.quantity) > Number(old.quantity)) {
      if (sourceFloorBefore.length !== 1) return false;
      const floorItem = sourceFloorBefore[0];
      const incomingQuantity = Number(floorItem.quantity);
      if (!Number.isInteger(incomingQuantity) || incomingQuantity < 1
          || Number(current.quantity) !== Number(old.quantity) + incomingQuantity
          || Number(floorItem.nativeUnitValue) !== oldValue.nativeUnitValue
          || Number(floorItem.nativeValue) !== incomingQuantity * oldValue.nativeUnitValue
          || value.nativeValue !== oldValue.nativeValue + Number(floorItem.nativeValue)) return false;
    }
  }

  // A stable item removed from the inventory is already covered by the action-specific delta.
  // DROP/THROW also conserve the stored native value between inventory remainder and floor delta.
  if (action === "DROP" || action === "THROW") {
    const detailsItemId = String(details?.itemId || ""), resultId = String(details?.resultItemId || "");
    const oldSourceRows = beforeValues.get(detailsItemId);
    const oldSourceItem = beforeItems.get(detailsItemId);
    const newSourceRows = afterValues.get(detailsItemId);
    const newSourceItem = afterItems.get(detailsItemId);
    if (!oldSourceRows || !oldSourceItem || !resultId) return false;
    const oldSourceValue = Number(oldSourceRows.nativeValue);
    const remainderValue = newSourceRows && newSourceItem ? Number(newSourceRows.nativeValue) : 0;
    const droppedValue = oldSourceValue - remainderValue;
    if (!Number.isInteger(droppedValue) || droppedValue < 0) return false;
    const oldResultRows = findFloorItems(previousHeapsValue, resultId);
    const newResultRows = findFloorItems(nextHeapsValue, resultId);
    if (oldResultRows.length > 1 || newResultRows.length !== 1
        || !Number.isInteger(newResultRows[0].nativeValue) || newResultRows[0].nativeValue < 0) return false;
    const oldFloorValue = oldResultRows.length === 1 ? Number(oldResultRows[0].nativeValue) : 0;
    if (!Number.isInteger(oldFloorValue)
        || Number(newResultRows[0].nativeValue) - oldFloorValue !== droppedValue) return false;
  }
  return true;
}

