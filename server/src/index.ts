export interface Env {
  MATCH_ROOM: DurableObjectNamespace;
}

export interface NetworkMessage {
  protocolVersion: string;
  messageType: string;
  requestId?: string;
  sequence?: number;
  senderId?: string;
  payloadJson: string;
}

export interface SessionData {
  playerId: string;
  sessionToken: string;
}

/** Assign stable room identities while keeping local SPD Actor.id() as a runtime-only key. */
export function assignStableEntityIds(
  mobs: any[],
  previousMobs: any[],
  createId: () => string = () => crypto.randomUUID()
): any[] {
  const previousByNativeId = new Map<number, any>();
  const previousByClassAndPosition = new Map<string, any>();
  for (const previous of previousMobs || []) {
    if (Number.isInteger(Number(previous?.mobId)) && typeof previous?.entityId === "string") {
      previousByNativeId.set(Number(previous.mobId), previous);
    }
    if (typeof previous?.name === "string" && Number.isInteger(Number(previous?.pos))
      && typeof previous?.entityId === "string") {
      previousByClassAndPosition.set(`${String(previous.name)}:${Number(previous.pos)}`, previous);
    }
  }
  const assigned = new Set<string>();
  for (const mob of mobs || []) {
    const supplied = typeof mob?.entityId === "string" && mob.entityId.length >= 8 && mob.entityId.length <= 80
      ? mob.entityId : "";
    const previousById = previousByNativeId.get(Number(mob?.mobId));
    const previousByPosition = previousByClassAndPosition.get(`${String(mob?.name)}:${Number(mob?.pos)}`);
    let entityId = supplied
      || (previousById && String(previousById.name) === String(mob?.name) ? String(previousById.entityId) : "")
      || (previousByPosition ? String(previousByPosition.entityId) : "");
    if (!entityId || assigned.has(entityId)) entityId = createId();
    while (!entityId || assigned.has(entityId)) entityId = createId();
    assigned.add(entityId);
    mob.entityId = entityId;
  }
  return mobs;
}

/** Resolves a stable room entity ID to the publisher-local mob row key. */
export function resolveServerMobIdByEntityId(levelSnapshot: any, entityId: unknown): number | null {
  if (typeof entityId !== "string" || entityId.length < 8 || entityId.length > 80
    || !levelSnapshot || !Array.isArray(levelSnapshot.mobs)) return null;
  const mob = levelSnapshot.mobs.find((candidate: any) => String(candidate?.entityId || "") === entityId);
  if (!mob || !Number.isInteger(Number(mob.mobId)) || Number(mob.mobId) < 0) return null;
  return Number(mob.mobId);
}


/** Validates one native SPD movement step against the trusted source cell, terrain and occupancy. */
/** Validates one native SPD movement step against the complete trusted terrain and occupancy. */
export function isValidNativeMoveIntent(
  fromValue: unknown, toValue: unknown, widthValue: unknown, heightValue: unknown,
  tilesValue: unknown, occupiedPositionsValue: unknown = []
): boolean {
  if (typeof fromValue !== "number" || !Number.isInteger(fromValue)
    || typeof toValue !== "number" || !Number.isInteger(toValue)
    || typeof widthValue !== "number" || !Number.isInteger(widthValue) || widthValue < 8 || widthValue > 100
    || typeof heightValue !== "number" || !Number.isInteger(heightValue) || heightValue < 8 || heightValue > 100
    || !Array.isArray(tilesValue) || !Array.isArray(occupiedPositionsValue)) return false;
  const width = widthValue, height = heightValue, size = width * height;
  const from = fromValue, to = toValue;
  if (from < 0 || from >= size || to < 0 || to >= size || from === to || tilesValue.length !== size) return false;
  const tileByPos = new Map<number, any>();
  for (const tile of tilesValue as any[]) {
    if (!Number.isInteger(tile?.pos) || tile.pos < 0 || tile.pos >= size || tileByPos.has(tile.pos)
      || typeof tile?.passable !== "boolean" || typeof tile?.solid !== "boolean"
      || typeof tile?.pit !== "boolean" || (tile?.avoid !== undefined && typeof tile.avoid !== "boolean")) return false;
    tileByPos.set(tile.pos, tile);
  }
  // Do not infer missing cells as floor: each native position must occur exactly once.
  if (tileByPos.size !== size) return false;
  const walkable = (pos: number) => {
    const tile = tileByPos.get(pos);
    // SPD's Hero.getCloser() allows passable OR avoid terrain. Closed doors are passable
    // despite their solid flag; pits are handled by the native fall transition, not a normal move.
    return !!tile && tile.pit === false && (tile.passable === true || tile.avoid === true);
  };
  if (!walkable(from) || !walkable(to)) return false;
  const dx = (to % width) - (from % width);
  const dy = Math.floor(to / width) - Math.floor(from / width);
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
  // Keep SPD's native diagonal rule: checking the destination is enough; do not add
  // a separate two-side corner rule which the original Hero.getCloser() does not use.
  return !(occupiedPositionsValue as any[]).some(pos =>
    typeof pos === "number" && Number.isInteger(pos) && pos === to);
}

/** Resolves only a matching, unlocked, branch-zero regular transition from the trusted source snapshot. */
export function resolveNativeTransitionIntent(levelSnapshot: any, currentDepth: unknown,
  currentPos: unknown, data: any): {
    fromDepth: number; depth: number; transitionPos: number; transitionType: string;
    targetType: string; targetBranch: number; pitPos?: number
  } | null {
  if (!levelSnapshot || typeof currentDepth !== "number" || !Number.isInteger(currentDepth)
    || typeof currentPos !== "number" || !Number.isInteger(currentPos)
    || levelSnapshot.depth !== currentDepth || levelSnapshot.branch !== 0 || levelSnapshot.locked !== false
    || data?.depth !== currentDepth || data?.from !== currentPos
    || data?.to !== currentPos || data?.stairsPos !== currentPos
    || !Array.isArray(levelSnapshot.transitions)) return null;

  // Native SPD handles pits before moving the Hero into the cell: Chasm.heroFall() runs while
  // the Hero stays at currentPos. Model that as a separate floor transition, not a stair edge.
  if (data?.transitionKind === "FALL") {
    if (!Array.isArray(levelSnapshot.tiles)
      || !Number.isInteger(levelSnapshot.width) || levelSnapshot.width < 8 || levelSnapshot.width > 100
      || !Number.isInteger(levelSnapshot.height) || levelSnapshot.height < 8 || levelSnapshot.height > 100) return null;
    const pitPos = data.pitPos;
    const width = Number(levelSnapshot.width), height = Number(levelSnapshot.height);
    const size = width * height;
    if (currentDepth < 1 || currentDepth >= 100 || data?.branch !== 0
      || !Number.isInteger(pitPos) || pitPos < 0 || pitPos >= size || pitPos === currentPos) return null;
    const sourceTiles = levelSnapshot.tiles.filter((tile: any) => tile?.pos === currentPos);
    const pitTiles = levelSnapshot.tiles.filter((tile: any) => tile?.pos === pitPos);
    const dx = Math.abs((pitPos % width) - (currentPos % width));
    const dy = Math.abs(Math.floor(pitPos / width) - Math.floor(currentPos / width));
    if (sourceTiles.length !== 1 || sourceTiles[0].pit === true || sourceTiles[0].solid === true
      || pitTiles.length !== 1 || pitTiles[0].pit !== true || pitTiles[0].solid !== false
      || dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return null;
    return { fromDepth: currentDepth, depth: currentDepth + 1, transitionPos: currentPos,
      transitionType: "FALL", targetType: "FALL", targetBranch: 0, pitPos };
  }
  if (data?.transitionKind !== undefined && data.transitionKind !== "STAIRS") return null;

  const matchingTransitions = levelSnapshot.transitions.filter((item: any) => item?.pos === currentPos);
  if (matchingTransitions.length !== 1) return null;
  const transition = matchingTransitions[0];
  if (!transition || !["REGULAR_EXIT", "REGULAR_ENTRANCE"].includes(String(transition.type))) return null;
  const targetDepth = transition.targetDepth;
  const targetBranch = transition.targetBranch;
  const targetType = String(transition.targetType || "");
  if (typeof targetDepth !== "number" || !Number.isInteger(targetDepth) || targetDepth < 1 || targetDepth > 100
    || targetBranch !== 0
    || (transition.type === "REGULAR_EXIT" && (targetDepth !== currentDepth + 1 || targetType !== "REGULAR_ENTRANCE"))
    || (transition.type === "REGULAR_ENTRANCE" && (targetDepth !== currentDepth - 1 || targetType !== "REGULAR_EXIT"))
    || !["REGULAR_ENTRANCE", "REGULAR_EXIT"].includes(targetType)) return null;
  return { fromDepth: currentDepth, depth: targetDepth, transitionPos: currentPos,
    transitionType: String(transition.type), targetType, targetBranch: 0 };
}


/** Validates a safe native fall landing cell on a full branch-zero snapshot. */
export function isValidNativeFallLanding(levelSnapshot: any, posValue: unknown): boolean {
  if (!levelSnapshot || levelSnapshot.branch !== 0
    || !Number.isInteger(levelSnapshot.width) || levelSnapshot.width < 8 || levelSnapshot.width > 100
    || !Number.isInteger(levelSnapshot.height) || levelSnapshot.height < 8 || levelSnapshot.height > 100
    || typeof posValue !== "number" || !Number.isInteger(posValue)
    || !Array.isArray(levelSnapshot.tiles) || !Array.isArray(levelSnapshot.traps)
    || !Array.isArray(levelSnapshot.mobs)) return false;
  const size = Number(levelSnapshot.width) * Number(levelSnapshot.height);
  if (levelSnapshot.tiles.length !== size || posValue < 0 || posValue >= size) return false;
  const candidates = levelSnapshot.tiles.filter((tile: any) => tile?.pos === posValue);
  if (candidates.length !== 1) return false;
  const tile = candidates[0];
  if (tile.passable !== true || tile.solid !== false || tile.pit !== false) return false;
  // Native Level.fallCell() excludes traps and Mobs regardless of a trap's active flag.
  if (levelSnapshot.traps.some((trap: any) => Number(trap?.pos) === posValue)
    || levelSnapshot.mobs.some((mob: any) => Number(mob?.pos) === posValue)) return false;
  return true;
}

/** The publisher's destination snapshot must carry a valid native Hero landing state. */
export function isValidNativeFallDestinationSnapshot(levelSnapshot: any): boolean {
  if (!levelSnapshot || !Number.isInteger(levelSnapshot.depth) || levelSnapshot.depth < 1
    || levelSnapshot.branch !== 0 || typeof levelSnapshot.heroStateJson !== "string") return false;
  try {
    const hero = JSON.parse(levelSnapshot.heroStateJson);
    return !!hero && isValidNativeHeroStateJson(levelSnapshot.heroStateJson, {
      hp: hero.hp, ht: hero.ht, pos: hero.pos, shielding: hero.shielding
    }) && isValidNativeFallLanding(levelSnapshot, hero.pos);
  } catch (_) {
    return false;
  }
}

/**
 * Only the elected publisher may submit the matching destination floor while a regular stair
 * or native FALL barrier is pending. The room remains on fromDepth until every living peer is ready.
 */
export function isPendingNativeFloorDestinationSnapshot(currentDepth: unknown, pending: any,
  submittedDepth: unknown, submittedBranch: unknown, senderId: unknown): boolean {
  return Number.isInteger(currentDepth) && Number.isInteger(submittedDepth) && submittedBranch === 0
    && !!pending && pending.fromDepth === currentDepth && pending.depth === submittedDepth
    && pending.depth !== currentDepth && Math.abs(Number(pending.depth) - Number(pending.fromDepth)) === 1
    && pending.targetBranch === 0 && pending.publisherId === senderId
    && pending.snapshotReady !== true;
}

/** Prevents concurrent or unauthorized floor transitions from opening a second barrier. */
export function canStartNativeFloorTransition(
  transitionAlreadyPending: unknown, playerState: unknown, publisherConnected: unknown
): boolean {
  return transitionAlreadyPending === false && playerState === "ALIVE" && publisherConnected === true;
}

/** A timed-out regular floor transition may be aborted only while the room is still on its source depth. */
export function canAbortNativeFloorTransition(currentDepth: unknown, pending: any): boolean {
  return Number.isInteger(currentDepth) && !!pending && pending.fromDepth === currentDepth
    && Number.isInteger(pending.depth) && pending.depth !== currentDepth
    && Math.abs(Number(pending.depth) - Number(currentDepth)) === 1
    && pending.targetBranch === 0 && Number.isFinite(Number(pending.startedAt));
}

/** Fail closed until the matching destination snapshot and all connected living-player states exist. */
export function canFinalizeNativeFloorTransition(currentDepth: unknown, pending: any,
  destinationSnapshotReady: unknown, destinationValid: unknown,
  readyPlayerCount: unknown, connectedLivingPlayerCount: unknown): boolean {
  return Number.isInteger(currentDepth) && !!pending && pending.fromDepth === currentDepth
    && Number.isInteger(pending.depth) && pending.depth !== currentDepth
    && Math.abs(Number(pending.depth) - Number(currentDepth)) === 1 && pending.targetBranch === 0
    && pending.snapshotReady === true && destinationSnapshotReady === true && destinationValid === true
    && Number.isInteger(readyPlayerCount) && Number(readyPlayerCount) > 0
    && Number.isInteger(connectedLivingPlayerCount)
    && Number(readyPlayerCount) === Number(connectedLivingPlayerCount);
}

/** Distinguishes unsupported branch exits from stale/invalid stair requests. */
export function classifyNativeTransitionRejection(levelSnapshot: any, currentDepth: unknown,
  currentPos: unknown, data: any): "UNSUPPORTED_BRANCH_TRANSITION" | "FLOOR_LOCKED" | "INVALID_TRANSITION" {
  if (levelSnapshot && (levelSnapshot.branch !== 0
      || (data?.branch !== undefined && data.branch !== 0))) return "UNSUPPORTED_BRANCH_TRANSITION";
  if (levelSnapshot?.locked === true) return "FLOOR_LOCKED";
  const pos = typeof currentPos === "number" ? currentPos : data?.from;
  const transition = Array.isArray(levelSnapshot?.transitions)
    ? levelSnapshot.transitions.find((row: any) => row?.pos === pos) : null;
  if (transition && (String(transition.type).startsWith("BRANCH_") || Number(transition.targetBranch) !== 0)) {
    return "UNSUPPORTED_BRANCH_TRANSITION";
  }
  return "INVALID_TRANSITION";
}


/** Validates quickslot links against native inventory IDs; only zero-quantity placeholders may be unowned. */
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
function nativeEquipmentBundleItem(value: any): any | null {
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


function nativeEquipmentTalentPoints(combat: any, talent: string): number {
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




function nativeUseItemBuffMap(hero: any): Map<string, any[]> | null {
  if (!hero || !Number.isInteger(hero.buffCount) || hero.buffCount < 0 || hero.buffCount > 256) return null;
  const result = new Map<string, any[]>();
  for (let i = 0; i < hero.buffCount; i++) {
    const serializedBundle = hero["buff_" + i], cooldown = Number(hero["buffCooldown_" + i]);
    if (typeof serializedBundle !== "string" || serializedBundle.length < 2 || serializedBundle.length > 200000
        || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > 100000) return null;
    let root: any;
    try { root = JSON.parse(serializedBundle); } catch (_) { return null; }
    const buff = root && root.buff;
    const className = String(buff && buff.__className || "");
    if (!className || className.length > 256 || !buff || typeof buff !== "object") return null;
    const rows = result.get(className) || [];
    rows.push({serializedBundle, cooldown, data:buff});
    result.set(className, rows);
  }
  for (const rows of result.values()) rows.sort((a: any, b: any) =>
    String(a.serializedBundle).localeCompare(String(b.serializedBundle)) || a.cooldown - b.cooldown);
  return result;
}

function nativeUseItemCombatBundleMatches(previousHero: any, nextHero: any, itemClass: string): boolean {
  let previous: any, next: any;
  try {
    previous = JSON.parse(String(previousHero?.combatBundle || ""));
    next = JSON.parse(String(nextHero?.combatBundle || ""));
  } catch (_) { return false; }
  if (!previous || typeof previous !== "object" || !next || typeof next !== "object") return false;
  // Actor.storeInBundle includes Hero.time. A native consumable advances this clock inside
  // the original engine, so permit that field only when it advances by the same amount as
  // the separately reported Hero cooldown. This avoids rejecting real drinks/eating while
  // preventing an item transaction from smuggling an unrelated combat-clock mutation.
  const previousHasTime = Object.prototype.hasOwnProperty.call(previous, "time");
  const nextHasTime = Object.prototype.hasOwnProperty.call(next, "time");
  if (previousHasTime !== nextHasTime) return false;
  if (previousHasTime) {
    const beforeTime = Number(previous.time), afterTime = Number(next.time);
    const beforeCooldown = Number(previousHero?.cooldown), afterCooldown = Number(nextHero?.cooldown);
    if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime)
        || !Number.isFinite(beforeCooldown) || !Number.isFinite(afterCooldown)
        || afterTime < beforeTime - 0.06 || afterCooldown < beforeCooldown - 0.06
        || Math.abs((afterTime - beforeTime) - (afterCooldown - beforeCooldown)) > 0.06) return false;
  }
  const strip = (value: any, keys: string[]) => {
    const copy: any = {...value};
    for (const key of keys) delete copy[key];
    return copy;
  };
  // Hero.storeInBundle writes the backpack and native Buff collection into its root bundle.
  // Both are independently validated below from exact item rows and flattened buff snapshots.
  const inventoryKeys = ["inventory", "items", "buffs", "time"];
  const strengthPotion = itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength";
  if (strengthPotion) {
    if (!Number.isInteger(previous.STR) || !Number.isInteger(next.STR) || next.STR !== previous.STR + 1) return false;
    return sameNativeItemValue(strip(previous, [...inventoryKeys, "STR"]), strip(next, [...inventoryKeys, "STR"]));
  }
  return sameNativeItemValue(strip(previous, inventoryKeys), strip(next, inventoryKeys));
}

/** Allows only the exact native buff classes that the whitelisted consumable can touch. */
function isValidNativeUseItemBuffMutation(previous: any, next: any, action: string, itemClass: string): boolean {
  const before = nativeUseItemBuffMap(previous), after = nativeUseItemBuffMap(next);
  if (!before || !after) return false;
  const base = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.";
  let allowed: Set<string>;
  const simpleFoodClasses = new Set([
    "com.shatteredpixel.shatteredpixeldungeon.items.food.Food",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.SmallRation",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.StewedMeat",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.ChargrilledMeat"
  ]);
  const meatPieClass = "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie";
  if (action === "EAT" && simpleFoodClasses.has(itemClass)) {
    allowed = new Set([base + "Hunger"]);
  } else if (action === "EAT" && itemClass === meatPieClass) {
    allowed = new Set([base + "Hunger", base + "WellFed"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing") {
    allowed = new Set([base + "Healing", base + "Poison", base + "Cripple", base + "Weakness",
      base + "Vulnerable", base + "Bleeding", base + "Blindness", base + "Drowsy", base + "Slow", base + "Vertigo"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste") {
    allowed = new Set([base + "Haste"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility") {
    allowed = new Set([base + "Invisibility"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation") {
    allowed = new Set([base + "Levitation"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength") {
    allowed = new Set();
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding") {
    allowed = new Set([base + "Barrier", base + "Poison"]);
  } else if (action === "READ"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging") {
    allowed = new Set([base + "Recharging"]);
  } else return false;

  const allClasses = new Set<string>([...before.keys(), ...after.keys()]);
  for (const name of allClasses) {
    const oldRows = before.get(name) || [], newRows = after.get(name) || [];
    if (allowed.has(name)) continue;
    if (!sameNativeItemValue(oldRows.map((row: any) => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown})),
      newRows.map((row: any) => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown})))) return false;
  }

  const rechargingScrollRead = action === "READ"
    && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging";
  const timedPotionBuff: Record<string, string> = {
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste": base + "Haste",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility": base + "Invisibility",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation": base + "Levitation"
  };
  const timedBuffName = timedPotionBuff[itemClass] || (rechargingScrollRead ? base + "Recharging" : "");
  if ((action === "DRINK" && !!timedPotionBuff[itemClass]) || rechargingScrollRead) {
    const oldRows = before.get(timedBuffName) || [], newRows = after.get(timedBuffName) || [];
    if (oldRows.length > 1 || newRows.length !== 1) return false;
    const nextRow = newRows[0], nextData = nextRow.data;
    const allowedFields = new Set(["__className", "time", "id", "mnemonic_extended"]);
    if (Object.keys(nextData).some((key: string) => !allowedFields.has(key))
        || !Number.isFinite(Number(nextData.time)) || !Number.isInteger(nextData.id) || Number(nextData.id) < 0
        || (nextData.mnemonic_extended !== undefined && typeof nextData.mnemonic_extended !== "boolean")) return false;
    const nextCooldown = Number(nextRow.cooldown), oldCooldown = Number(oldRows[0]?.cooldown || 0);
    const nativeHeroBundle = parseNativeBundleObject(next.combatBundle);
    const heroTime = Number(nativeHeroBundle?.time), heroCooldown = Number(next.cooldown);
    const actorClock = heroTime - heroCooldown;
    const expectedCooldown = Math.max(0, Number(nextData.time) - actorClock);
    const maximumCooldown = rechargingScrollRead ? oldCooldown + 30 : Math.max(oldCooldown, 20);
    if (!Number.isFinite(nextCooldown) || nextCooldown < 0
        || nextCooldown > maximumCooldown + 0.05
        || !Number.isFinite(heroTime) || !Number.isFinite(heroCooldown) || heroCooldown < 0
        || !Number.isFinite(expectedCooldown) || Math.abs(nextCooldown - expectedCooldown) > 0.06) return false;
    if (rechargingScrollRead && Math.abs(nextCooldown - (oldRows.length === 1 ? oldCooldown + 30 : 30)) > 0.06) return false;
    if (oldRows.length === 1) {
      const oldData = oldRows[0].data;
      if (Number(nextData.id) !== Number(oldData.id)) return false;
      const stripTime = (value: any) => {
        const result: any = {...value};
        delete result.time;
        return result;
      };
      if (!sameNativeItemValue(stripTime(oldData), stripTime(nextData))) return false;
      if (rechargingScrollRead && Math.abs(Number(nextData.time) - Number(oldData.time) - 30) > 0.06) return false;
    } else if (rechargingScrollRead && Math.abs(Number(nextData.time) - actorClock - 30) > 0.06) return false;
  }

  if (action === "EAT") {
    const name = base + "Hunger", oldRows = before.get(name) || [], newRows = after.get(name) || [];
    if (newRows.length > 1 || (oldRows.length === 0 && newRows.length !== 1)) return false;
    if (oldRows.length === 1 && newRows.length === 1) {
      const oldData = oldRows[0].data, newData = newRows[0].data;
      const maxFoodEnergy = itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.food.Food" ? 300
        : itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie" ? 900 : 150;
      if (!Number.isFinite(Number(oldData.level)) || Number(oldData.level) < 0 || Number(oldData.level) > 450
          || !Number.isFinite(Number(newData.level)) || Number(newData.level) < 0
          || Number(newData.level) > Number(oldData.level)
          || Number(oldData.level) - Number(newData.level) > maxFoodEnergy + 0.01
          || !Number.isFinite(Number(oldData.partialDamage)) || !Number.isFinite(Number(newData.partialDamage))
          || Number(newData.partialDamage) > Number(oldData.partialDamage)
          || Number(newData.partialDamage) !== Number(oldData.partialDamage)) return false;
    } else if (newRows.length === 1) {
      const data = newRows[0].data;
      if (!Number.isFinite(Number(data.level)) || Number(data.level) < 0 || Number(data.level) > 100
          || !Number.isFinite(Number(data.partialDamage)) || Number(data.partialDamage) < 0 || Number(data.partialDamage) > 1) return false;
    }
  }

  if (action === "EAT" && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie") {
    const name = base + "WellFed", oldRows = before.get(name) || [], newRows = after.get(name) || [];
    if (oldRows.length > 1 || newRows.length !== 1) return false;
    const oldRow = oldRows[0] || null, newRow = newRows[0], data = newRow.data;
    const allowedFields = new Set(["__className", "time", "id", "left", "mnemonic_extended"]);
    if (Object.keys(data).some((key: string) => !allowedFields.has(key))
        || !Number.isInteger(data.id) || data.id < 0 || !Number.isFinite(Number(data.time))
        || Number(data.time) < 0 || Number(data.time) > 20
        || !Number.isInteger(data.left) || ![150, 450].includes(Number(data.left))
        || (data.mnemonic_extended !== undefined && typeof data.mnemonic_extended !== "boolean")) return false;
    const oldCooldown = Number(oldRow?.cooldown || 0), nextCooldown = Number(newRow.cooldown);
    if (!Number.isFinite(nextCooldown) || nextCooldown < 0 || nextCooldown > Math.max(oldCooldown, 20) + 0.05) return false;
    if (oldRow) {
      if (Number(data.id) !== Number(oldRow.data.id)) return false;
      const withoutLeft = (value: any) => { const copy = {...value}; delete copy.left; return copy; };
      if (!sameNativeItemValue(withoutLeft(oldRow.data), withoutLeft(data))) return false;
    }
  }

  if (itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing" && action === "DRINK") {
    const removed = [base + "Cripple", base + "Weakness", base + "Vulnerable", base + "Bleeding",
      base + "Blindness", base + "Drowsy", base + "Slow", base + "Vertigo"];
    for (const name of removed) if ((after.get(name) || []).length !== 0) return false;
    const healing = after.get(base + "Healing") || [];
    if (healing.length > 1) return false;
    if (healing.length === 1) {
      const current = healing[0].data;
      const old = (before.get(base + "Healing") || [])[0]?.data;
      const maxLeft = Math.max(Number(old?.left || 0), Math.floor(0.8 * Number(previous.ht) + 14));
      const maxPercent = Math.max(Number(old?.percent || 0), 0.25);
      const maxFlat = Math.max(Number(old?.flat || 0), 0);
      if (!Number.isFinite(Number(current.left)) || Number(current.left) < 0 || Number(current.left) > maxLeft
          || !Number.isFinite(Number(current.percent)) || Number(current.percent) < 0 || Number(current.percent) > maxPercent
          || !Number.isFinite(Number(current.flat)) || Number(current.flat) < 0 || Number(current.flat) > maxFlat
          || typeof current.healing_limited !== "boolean") return false;
    }
  }

  if (itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding"
      && action === "DRINK") {
    const name = base + "Barrier", barriers = after.get(name) || [], oldBarriers = before.get(name) || [];
    const poisonName = base + "Poison", poisons = after.get(poisonName) || [], oldPoisons = before.get(poisonName) || [];
    if (barriers.length > 1 || poisons.length > 1) return false;
    const oldShielding = Number(oldBarriers[0]?.data?.shielding || 0);
    const nextShielding = Number(barriers[0]?.data?.shielding || 0);
    const expected = Math.floor(0.6 * Number(previous.ht) + 10);
    if (barriers.length === 1) {
      if (!Number.isInteger(nextShielding) || nextShielding < 0
          || nextShielding > Math.max(oldShielding, expected)
          || Number(next.shielding) !== Number(previous.shielding) + nextShielding - oldShielding) return false;
    } else if (Number(next.shielding) !== Number(previous.shielding)) return false;
    const barrierChanged = !sameNativeItemValue(
      (oldBarriers).map((row: any) => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown})),
      barriers.map((row: any) => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown})));
    const poisonChanged = !sameNativeItemValue(
      oldPoisons.map((row: any) => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown})),
      poisons.map((row: any) => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown})));
    if (barrierChanged && poisonChanged) return false;
  }

  if (action === "DRINK" && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing"
      || action === "DRINK" && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding") {
    const poison = after.get(base + "Poison") || [], oldPoison = before.get(base + "Poison") || [];
    if (poison.length > 1) return false;
    if (poison.length === 1) {
      const left = Number(poison[0].data.left), oldLeft = Number(oldPoison[0]?.data?.left || 0);
      if (!Number.isFinite(left) || left < 0 || left > Math.max(oldLeft, 30)) return false;
    }
  }
  return true;
}

/** The native food callback has bounded Hunger/WellFed-only effects only without these talents. */
function isNativeFoodUseSafe(hero: any): boolean {
  const combat = parseNativeBundleObject(hero && hero.combatBundle);
  if (!combat) return false;
  const sideEffectTalents = new Set([
    "HEARTY_MEAL", "IRON_STOMACH", "EMPOWERING_MEAL", "ENERGIZING_MEAL", "MYSTICAL_MEAL",
    "INVIGORATING_MEAL", "STRENGTHENING_MEAL", "FOCUSED_MEAL", "SATIATED_SPELLS", "ENLIGHTENING_MEAL"
  ]);
  for (let tierNumber = 1; tierNumber <= 4; tierNumber++) {
    const tier = combat["talents_tier_" + tierNumber];
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) return false;
    for (const talent of sideEffectTalents) if (Number(tier[talent] || 0) > 0) return false;
  }
  const replacements = combat.replacements;
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)) return false;
  for (const [from, to] of Object.entries(replacements)) {
    if (sideEffectTalents.has(String(from)) || sideEffectTalents.has(String(to))) return false;
  }
  return true;
}

/** The first supported native READ is ScrollOfRecharging, and only when it has no unmodelled side effects. */
function isNativeRechargingScrollReadSafe(hero: any): boolean {
  const combat = parseNativeBundleObject(hero && hero.combatBundle);
  if (!combat) return false;
  const prohibitedTalents = new Set(["INSCRIBED_POWER", "INSCRIBED_STEALTH", "RECALL_INSCRIPTION"]);
  for (let tierNumber = 1; tierNumber <= 4; tierNumber++) {
    const tier = combat["talents_tier_" + tierNumber];
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) return false;
    for (const talent of prohibitedTalents) if (Number(tier[talent] || 0) > 0) return false;
  }
  const replacements = combat.replacements;
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)) return false;
  for (const [from, to] of Object.entries(replacements)) {
    if (prohibitedTalents.has(String(from)) || prohibitedTalents.has(String(to))) return false;
  }
  const buffs = nativeUseItemBuffMap(hero);
  if (!buffs) return false;
  const dispelledBuffSuffixes = [
    ".Invisibility", "CloakOfShadows$cloakStealth", "TimekeepersHourglass$timeFreeze",
    "Invisibility$Preparation", "Swiftthistle$TimeBubble", "RoundShield$GuardTracker"
  ];
  for (const className of buffs.keys()) {
    if (dispelledBuffSuffixes.some(suffix => className.endsWith(suffix))) return false;
  }
  return true;
}

/** The whitelisted native drink callback has no unmodelled talent proc only without these talents. */
function isNativePotionUseSafe(hero: any, itemClass: string): boolean {
  const combat = parseNativeBundleObject(hero && hero.combatBundle);
  if (!combat) return false;
  const sideEffectTalents = new Set(["LIQUID_WILLPOWER", "LIQUID_NATURE", "LIQUID_AGILITY"]);
  if (itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility") {
    // Invisibility.attachTo() may add this extra native tracker independently of onPotionUsed().
    sideEffectTalents.add("PROTECTIVE_SHADOWS");
  }
  for (let tierNumber = 1; tierNumber <= 4; tierNumber++) {
    const tier = combat["talents_tier_" + tierNumber];
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) return false;
    for (const talent of sideEffectTalents) {
      const value = tier[talent] === undefined ? 0 : Number(tier[talent]);
      if (!Number.isFinite(value) || value < 0 || value > 2) return false;
      if (value > 0) return false;
    }
  }
  const replacements = combat.replacements;
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)) return false;
  for (const [from, to] of Object.entries(replacements)) {
    if (sideEffectTalents.has(String(from)) || sideEffectTalents.has(String(to))) return false;
  }
  return true;
}

/** Validates purchase of one exact native item from an adjacent Shopkeeper buyback list. */
export function isValidNativeBuybackIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, heroStateValue: unknown): boolean {
  const data:any = dataValue, depth = Number(depthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps) || !Array.isArray(level.mobs)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof heroStateValue !== "string") return false;
  const pos = Number(player.pos), shopId = String(data.shopEntityId || "");
  const itemId = String(data.buybackItemId || ""), cls = String(data.buybackItemClass || "");
  const resultId = String(data.resultItemId || ""), bundle = String(data.resultItemBundle || "");
  const price = Number(data.price), quantity = Number(data.buybackQuantity);
  if (data.from !== pos || data.to !== pos || data.targetPos !== pos || Number(data.depth) !== depth
      || data.branch !== 0 || !isValidStableMultiplayerId(shopId) || !isValidStableMultiplayerId(itemId)
      || resultId !== itemId || cls.length < 1 || cls.length > 256 || data.itemClass !== cls
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000
      || !Number.isInteger(price) || price < 1 || price > 10000000
      || !Number.isFinite(data.engineActionCost) || Math.abs(data.engineActionCost - 1) > 0.06
      || !Number.isInteger(data.itemLevel) || data.itemLevel < -100 || data.itemLevel > 10000
      || typeof data.cursed !== "boolean" || typeof data.cursedKnown !== "boolean"
      || typeof data.stackable !== "boolean" || !Number.isInteger(data.nativeValue) || data.nativeValue !== price
      || !Number.isInteger(data.nativeUnitValue) || data.nativeUnitValue < -1 || data.nativeUnitValue > 10000000
      || (data.nativeUnitValue >= 0 && data.nativeUnitValue * quantity !== price)
      || typeof bundle !== "string" || bundle.length < 1 || bundle.length > 200000 || !bundle.includes(itemId)) return false;
  const shops = level.mobs.filter((mob:any) => String(mob?.entityId || "") === shopId);
  const width = Number(level.width);
  if (!Number.isInteger(width) || width < 1 || shops.length !== 1
      || String(shops[0].name || "") !== "Shopkeeper" || !Array.isArray(shops[0].buybackItems)
      || shops[0].buybackItems.length < 1 || shops[0].buybackItems.length > 3
      || !Number.isInteger(shops[0].shopkeeperTurnsSinceHarmed)
      || shops[0].shopkeeperTurnsSinceHarmed < -1 || shops[0].shopkeeperTurnsSinceHarmed > 100000
      || Math.max(Math.abs((Number(shops[0].pos)%width)-(pos%width)),
        Math.abs(Math.floor(Number(shops[0].pos)/width)-Math.floor(pos/width))) > 1
      || shops[0].buybackItems.some((row:any) => !isValidNativeSellBuybackRow(row))) return false;
  const matches = shops[0].buybackItems.filter((row:any) => String(row.itemId) === itemId);
  if (matches.length !== 1) return false;
  const row = matches[0];
  if (String(row.className) !== cls || row.quantity !== quantity || row.level !== data.itemLevel
      || row.cursed !== data.cursed || row.cursedKnown !== data.cursedKnown || row.stackable !== data.stackable
      || row.shopPrice !== -1 || row.nativeValue !== price || row.nativeUnitValue !== data.nativeUnitValue
      || row.serializedBundle !== bundle) return false;
  let hero:any;
  try { hero = JSON.parse(heroStateValue); } catch (_) { return false; }
  if (Number(hero?.pos) !== pos || !Number.isInteger(hero?.hp) || hero.hp <= 0
      || !Number.isInteger(hero.gold) || hero.gold < price) return false;
  const inventory = parseNativeInventoryIndex(hero), economy = parseNativeItemEconomyIndex(hero);
  if (!inventory || !economy || !parseNativeQuickslotIndex(hero)
      || (cls.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.rings.")
        && (() => {
          const combat = parseNativeBundleObject(hero?.combatBundle);
          if (!combat) return true;
          for (let tier = 1; tier <= 4; tier++) {
            const values = combat["talents_tier_" + tier];
            if (!values || typeof values !== "object" || Array.isArray(values)) return true;
            if (Number(values.THIEFS_INTUITION || 0) >= 2) return true;
          }
          const replacements = combat.replacements;
          return !replacements || typeof replacements !== "object" || Array.isArray(replacements)
            || Object.entries(replacements).some(([from,to]) => String(from) === "THIEFS_INTUITION" || String(to) === "THIEFS_INTUITION");
        })())
      || inventory.some((item:any) => String(item.itemId) === itemId)
      || level.heaps.some((heap:any) => (Array.isArray(heap.items)?heap.items:[])
        .some((item:any) => String(item?.itemId || "") === itemId))
      || level.mobs.some((mob:any) => (Array.isArray(mob.buybackItems)?mob.buybackItems:[])
        .some((item:any) => String(item?.itemId || "") === itemId && String(mob.entityId || "") !== shopId))) return false;
  // The native Item.collect() path merges same-class stackable items; this protocol action is
  // scoped to a separately-identifiable instance so it can be replay-protected exactly once.
  if (data.stackable && inventory.some((item:any) => String(item.className) === cls)) return false;
  return true;
}

/** Validates the exact gold debit and exactly one new inventory item with no other Hero edits. */
export function isValidNativeBuybackInventoryMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous:any, next:any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); }
  catch (_) { return false; }
  const details:any = detailsValue, accepted:any = acceptedValue;
  const id = String(details?.buybackItemId || ""), cls = String(details?.buybackItemClass || "");
  const price = Number(details?.price);
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  const beforeEconomy = parseNativeItemEconomyIndex(previous), afterEconomy = parseNativeItemEconomyIndex(next);
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!details || !accepted || accepted.actionType !== "BUYBACK" || !before || !after
      || !beforeEconomy || !afterEconomy || !beforeSlots || !afterSlots
      || accepted.shopEntityId !== details.shopEntityId || accepted.buybackItemId !== id
      || accepted.buybackItemClass !== cls || accepted.buybackQuantity !== details.buybackQuantity
      || accepted.price !== price || accepted.resultItemId !== id || accepted.itemClass !== cls
      || accepted.itemLevel !== details.itemLevel || accepted.cursed !== details.cursed
      || accepted.cursedKnown !== details.cursedKnown || accepted.stackable !== details.stackable
      || accepted.nativeValue !== details.nativeValue || accepted.nativeUnitValue !== details.nativeUnitValue
      || accepted.resultItemBundle !== details.resultItemBundle
      || previous.inventoryBundle === next.inventoryBundle
      || !Number.isInteger(previous.gold) || !Number.isInteger(next.gold) || next.gold !== previous.gold-price
      || next.gold < 0 || previous.hp !== next.hp || previous.ht !== next.ht || previous.pos !== next.pos
      || previous.shielding !== next.shielding
      || !Number.isFinite(Number(previous.cooldown)) || !Number.isFinite(Number(next.cooldown))
      || Math.abs((Number(next.cooldown) - Number(previous.cooldown)) - 1) > 0.06
      || previous.alchemyEnergy !== next.alchemyEnergy || previous.notesBundle !== next.notesBundle
      || previous.questStateBundle !== next.questStateBundle
      || previous.ironKeyCount !== next.ironKeyCount || previous.crystalKeyCount !== next.crystalKeyCount
      || previous.wornKeyCount !== next.wornKeyCount || previous.goldenKeyCount !== next.goldenKeyCount) return false;
  const stripCombatInventory = (hero:any) => {
    const combat = parseNativeBundleObject(hero?.combatBundle);
    if (!combat) return null;
    delete combat.inventory;
    delete combat.items;
    return combat;
  };
  if (!sameNativeItemValue(stripCombatInventory(previous),stripCombatInventory(next))) return false;
  const oldRows=before.filter((row:any)=>String(row.itemId)===id), newRows=after.filter((row:any)=>String(row.itemId)===id);
  const oldValues=beforeEconomy.filter((row:any)=>String(row.itemId)===id), newValues=afterEconomy.filter((row:any)=>String(row.itemId)===id);
  if (oldRows.length!==0 || oldValues.length!==0 || newRows.length!==1 || newValues.length!==1) return false;
  const item=newRows[0], value=newValues[0];
  if (String(item.className)!==cls || Number(item.quantity)!==Number(details.buybackQuantity)
      || Number(item.level)!==Number(details.itemLevel) || item.cursed!==details.cursed
      || item.cursedKnown!==details.cursedKnown || item.stackable!==details.stackable || item.equipped!==false
      || String(item.serializedBundle)!==String(details.resultItemBundle)
      || String(value.className)!==cls || Number(value.quantity)!==Number(item.quantity)
      || Number(value.nativeValue)!==Number(details.nativeValue)
      || Number(value.nativeUnitValue)!==Number(details.nativeUnitValue) || value.nativeSellable!==true) return false;
  if (!sameNativeItemValue(before.filter((row:any)=>String(row.itemId)!==id),
      after.filter((row:any)=>String(row.itemId)!==id))) return false;
  if (!sameNativeItemValue(beforeEconomy.filter((row:any)=>String(row.itemId)!==id),
      afterEconomy.filter((row:any)=>String(row.itemId)!==id))) return false;
  const oldSlot=beforeSlots.filter((slot:any)=>String(slot.itemId)===id);
  const newSlot=afterSlots.filter((slot:any)=>String(slot.itemId)===id);
  if (oldSlot.length>1 || newSlot.length>1) return false;
  if (oldSlot.length===0) {
    if (newSlot.length!==0) return false;
  } else if (Number(oldSlot[0].quantity)!==0 || newSlot.length!==1
      || Number(newSlot[0].slot)!==Number(oldSlot[0].slot)
      || String(newSlot[0].className)!==cls || Number(newSlot[0].quantity)!==Number(details.buybackQuantity)
      || String(newSlot[0].serializedBundle)!==String(details.resultItemBundle)) return false;
  const slotsWithout = (slots:any[]) => slots.filter((slot:any)=>String(slot.itemId)!==id)
    .slice().sort((a:any,b:any)=>Number(a.slot)-Number(b.slot));
  return sameNativeItemValue(slotsWithout(beforeSlots),slotsWithout(afterSlots));
}

/** Removes exactly one ID from the exact Shopkeeper buyback array; no other Mob state may change. */
export function isValidNativeBuybackShopkeeperMutation(previousMobs:any[], nextMobs:any[],
  detailsValue:unknown, acceptedValue:unknown):boolean {
  const details:any=detailsValue, accepted:any=acceptedValue;
  if (!Array.isArray(previousMobs) || !Array.isArray(nextMobs) || !details || !accepted
      || accepted.actionType!=="BUYBACK" || accepted.shopEntityId!==details.shopEntityId
      || accepted.buybackItemId!==details.buybackItemId
      || accepted.buybackItemClass!==details.buybackItemClass || accepted.buybackQuantity!==details.buybackQuantity
      || accepted.price!==details.price || accepted.resultItemId!==details.resultItemId
      || accepted.itemClass!==details.itemClass || accepted.itemLevel!==details.itemLevel
      || accepted.cursed!==details.cursed || accepted.cursedKnown!==details.cursedKnown
      || accepted.stackable!==details.stackable || accepted.nativeValue!==details.nativeValue
      || accepted.nativeUnitValue!==details.nativeUnitValue || accepted.resultItemBundle!==details.resultItemBundle) return false;
  const index=(rows:any[])=>{
    const map=new Map<string,any>();
    for (const row of rows) {
      const id=String(row?.entityId||"");
      if(!isValidStableMultiplayerId(id)||map.has(id)) return null;
      map.set(id,row);
    }
    return map;
  };
  const before=index(previousMobs), after=index(nextMobs), shopId=String(details.shopEntityId||"");
  if(!before||!after||before.size!==after.size) return false;
  const oldShop=before.get(shopId), newShop=after.get(shopId);
  if(!oldShop||!newShop||String(oldShop.name||"")!=="Shopkeeper"||String(newShop.name||"")!=="Shopkeeper"
      || oldShop.serializedBundle===newShop.serializedBundle
      || !Array.isArray(oldShop.buybackItems)||!Array.isArray(newShop.buybackItems)
      || oldShop.buybackItems.length<1||oldShop.buybackItems.length>3
      || newShop.buybackItems.length!==oldShop.buybackItems.length-1
      || oldShop.shopkeeperTurnsSinceHarmed!==newShop.shopkeeperTurnsSinceHarmed
      || !Number.isInteger(oldShop.shopkeeperTurnsSinceHarmed)
      || oldShop.shopkeeperTurnsSinceHarmed < -1 || oldShop.shopkeeperTurnsSinceHarmed > 100000) return false;
  for (const row of oldShop.buybackItems) if(!isValidNativeSellBuybackRow(row)) return false;
  const found=oldShop.buybackItems.filter((row:any)=>String(row.itemId)===String(details.buybackItemId));
  if(found.length!==1 || String(found[0].className)!==String(details.buybackItemClass)
      || Number(found[0].quantity)!==Number(details.buybackQuantity)
      || Number(found[0].nativeValue)!==Number(details.price)
      || String(found[0].serializedBundle)!==String(details.resultItemBundle)) return false;
  const expected=oldShop.buybackItems.filter((row:any)=>String(row.itemId)!==String(details.buybackItemId));
  if(!sameNativeItemValue(expected,newShop.buybackItems)) return false;
  for (const [id,oldMob] of before) {
    const current=after.get(id);
    if(!current) return false;
    if(id!==shopId) {
      if(!sameNativeItemValue(itemValueWithout(oldMob,["mobId"]),itemValueWithout(current,["mobId"]))) return false;
    } else if(!sameNativeItemValue(itemValueWithout(oldShop,["mobId","serializedBundle","buybackItems"]),
        itemValueWithout(newShop,["mobId","serializedBundle","buybackItems"]))) return false;
  }
  return true;
}

/** A consume intent must identify one item already owned by the authenticated hero. */
export function isValidNativeUseItemIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, heroStateValue: unknown): boolean {
  const data: any = dataValue, depth = Number(depthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof heroStateValue !== "string") return false;
  const pos = Number(player.pos), id = String(data.itemId || ""), cls = String(data.itemClass || "");
  const itemAction = String(data.itemAction || "");
  if (data.from !== pos || data.to !== pos || data.targetPos !== pos || Number(data.depth) !== depth
      || data.branch !== 0 || id.length < 8 || id.length > 80 || cls.length < 1 || cls.length > 256
      || !["DRINK", "EAT", "READ"].includes(itemAction) || data.expectedQuantity !== 1
      || !Number.isInteger(data.sourceQuantityBefore) || data.sourceQuantityBefore < 1 || data.sourceQuantityBefore > 100000
      || typeof data.stackable !== "boolean" || !Number.isFinite(data.engineActionCost)
      || data.engineActionCost < 0 || data.engineActionCost > 10) return false;
  const supportedDrink = itemAction === "DRINK" && [
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding"
  ].includes(cls);
  const supportedFood = itemAction === "EAT" && [
    "com.shatteredpixel.shatteredpixeldungeon.items.food.Food",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.SmallRation",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.StewedMeat",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.ChargrilledMeat",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie"
  ].includes(cls);
  const supportedScroll = itemAction === "READ"
    && cls === "com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging";
  if (!supportedDrink && !supportedFood && !supportedScroll) return false;
  let hero: any;
  try { hero = JSON.parse(heroStateValue); } catch (_) { return false; }
  if (Number(hero?.pos) !== pos || !Number.isInteger(hero?.hp) || hero.hp <= 0) return false;
  if (supportedScroll && !isNativeRechargingScrollReadSafe(hero)) return false;
  if (supportedFood && !isNativeFoodUseSafe(hero)) return false;
  if (supportedDrink && !isNativePotionUseSafe(hero, cls)) return false;
  if (cls === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility") {
    let combat: any;
    try { combat = JSON.parse(String(hero.combatBundle || "")); } catch (_) { return false; }
    if (String(combat?.subClass || "") === "ASSASSIN") return false;
  }
  if (cls === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation") {
    const buffs = nativeUseItemBuffMap(hero);
    if (!buffs || buffs.has("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Roots")) return false;
  }
  const inventory = parseNativeInventoryIndex(hero);
  if (!inventory || !parseNativeQuickslotIndex(hero)) return false;
  const source = inventory.filter((item: any) => String(item.itemId) === id);
  return source.length === 1 && String(source[0].className) === cls
    && Number(source[0].quantity) === Number(data.sourceQuantityBefore)
    && source[0].stackable === data.stackable;
}

/** A validated consume removes one source unit and cannot rewrite unrelated inventory or quickslots. */
export function isValidNativeUseItemMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); } catch (_) { return false; }
  const details: any = detailsValue, accepted: any = acceptedValue;
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  if (!details || !accepted || accepted.actionType !== "USE_ITEM" || !before || !after
      || accepted.itemId !== details.itemId || accepted.itemClass !== details.itemClass
      || accepted.itemAction !== details.itemAction || accepted.expectedQuantity !== details.expectedQuantity
      || accepted.sourceQuantityBefore !== details.sourceQuantityBefore || accepted.stackable !== details.stackable
      || !["DRINK", "EAT", "READ"].includes(String(details.itemAction)) || details.expectedQuantity !== 1
      || !Number.isInteger(details.sourceQuantityBefore) || details.sourceQuantityBefore < 1
      || previous.gold !== next.gold || previous.inventoryBundle === next.inventoryBundle
      || !nativeUseItemCombatBundleMatches(previous, next, String(details.itemClass || ""))
      || !isValidNativeUseItemBuffMutation(previous, next, String(details.itemAction), String(details.itemClass || ""))) return false;
  const id = String(details.itemId || ""), cls = String(details.itemClass || "");
  const oldSource = before.filter((item: any) => String(item.itemId) === id);
  const newSource = after.filter((item: any) => String(item.itemId) === id);
  if (oldSource.length !== 1 || String(oldSource[0].className) !== cls
      || oldSource[0].quantity !== Number(details.sourceQuantityBefore) || oldSource[0].stackable !== details.stackable) return false;
  if (oldSource[0].quantity === 1) {
    if (newSource.length !== 0) return false;
  } else {
    if (newSource.length !== 1 || newSource[0].quantity !== oldSource[0].quantity - 1
        || !sameNativeItemValue(itemValueWithout(oldSource[0], ["quantity", "serializedBundle", "cursedKnown"]),
          itemValueWithout(newSource[0], ["quantity", "serializedBundle", "cursedKnown"]))
        || (oldSource[0].cursedKnown && !newSource[0].cursedKnown)) return false;
  }
  if (!sameNativeItemValue(before.filter((item: any) => String(item.itemId) !== id),
      after.filter((item: any) => String(item.itemId) !== id))) return false;
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!beforeSlots || !afterSlots) return false;
  const unrelatedSlots = (slots: any[]) => slots.filter((slot: any) => String(slot.itemId) !== id)
    .map((slot: any) => ({slot:slot.slot,itemId:slot.itemId,className:slot.className,
      quantity:slot.quantity,serializedBundle:slot.serializedBundle}))
    .sort((a: any,b: any) => Number(a.slot)-Number(b.slot));
  return sameNativeItemValue(unrelatedSlots(beforeSlots), unrelatedSlots(afterSlots));
}


const NATIVE_ENDURE_ABILITY = "com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.warrior.Endure";
const NATIVE_NATURES_POWER_ABILITY = "com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.huntress.NaturesPower";
const NATIVE_CLASS_ARMOR_PREFIX = "com.shatteredpixel.shatteredpixeldungeon.items.armor.";
const NATIVE_ENDURE_TRACKER = NATIVE_ENDURE_ABILITY + "$EndureTracker";
const NATIVE_NATURES_TRACKER = NATIVE_NATURES_POWER_ABILITY + "$naturesPowerTracker";

function parseNativeBundleObject(value: unknown): any | null {
  if (typeof value !== "string" || value.length < 2 || value.length > 200000) return null;
  try {
    const root = JSON.parse(value);
    return root && typeof root === "object" && !Array.isArray(root) ? root : null;
  } catch (_) { return null; }
}

function nativeHeroicEnergyPoints(hero: any): number | null {
  const combat = parseNativeBundleObject(hero && hero.combatBundle);
  if (!combat || !combat.talents_tier_4 || typeof combat.talents_tier_4 !== "object") return null;
  const points = combat.talents_tier_4.HEROIC_ENERGY === undefined ? 0 : Number(combat.talents_tier_4.HEROIC_ENERGY);
  return Number.isInteger(points) && points >= 0 && points <= 4 ? points : null;
}

function nativeAbilityChargeUse(abilityClass: string, points: number): number {
  const base = abilityClass === NATIVE_ENDURE_ABILITY ? 50
    : abilityClass === NATIVE_NATURES_POWER_ABILITY ? 35 : -1;
  const factor = [1,0.88,0.77,0.68,0.6][points];
  return base > 0 && factor !== undefined ? base * factor : -1;
}

function nativeItemBundleData(row: any): any | null {
  const root = parseNativeBundleObject(row && row.serializedBundle);
  const item = root && root.item;
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  return {root,item};
}

function nativeClassArmorCharge(row: any): number | null {
  const decoded = nativeItemBundleData(row);
  const simpleClass = String(row && row.className || "").split(".").pop() || "";
  if (!decoded || String(decoded.item.__className || "") !== String(row.className || "")
      || !/^(Warrior|Rogue|Mage|Huntress|Duelist|Cleric)Armor$/.test(simpleClass)) return null;
  const charge = Number(decoded.item.charge);
  return Number.isFinite(charge) && charge >= 0 && charge <= 100 ? charge : null;
}

function nativeSameClassArmorBundleExceptCharge(oldRow: any, nextRow: any): boolean {
  const before = nativeItemBundleData(oldRow), after = nativeItemBundleData(nextRow);
  if (!before || !after || String(before.item.__className || "") !== String(after.item.__className || "")
      || String(before.item.__className || "") !== String(oldRow.className || "")
      || String(after.item.__className || "") !== String(nextRow.className || "")) return false;
  delete before.item.charge;
  delete after.item.charge;
  return sameNativeItemValue(before.root,after.root);
}

function nativeAbilityBuffEntries(hero: any): Array<{className:string,serializedBundle:string,cooldown:number,data:any}> | null {
  if (!hero || !Number.isInteger(hero.buffCount) || hero.buffCount < 0 || hero.buffCount > 256) return null;
  const entries: Array<{className:string,serializedBundle:string,cooldown:number,data:any}> = [];
  for (let i = 0; i < hero.buffCount; i++) {
    const serializedBundle = hero["buff_" + i], cooldown = Number(hero["buffCooldown_" + i]);
    const root = parseNativeBundleObject(serializedBundle), data = root && root.buff;
    const className = data && typeof data === "object" ? String(data.__className || "") : "";
    if (typeof serializedBundle !== "string" || !className || !Number.isFinite(cooldown)
        || cooldown < 0 || cooldown > 100000) return null;
    entries.push({className,serializedBundle,cooldown,data});
  }
  return entries;
}

function isValidNativeAbilityBuffDelta(previous: any, next: any, abilityClass: string): boolean {
  const before = nativeAbilityBuffEntries(previous), after = nativeAbilityBuffEntries(next);
  if (!before || !after) return false;
  const permitted = abilityClass === NATIVE_ENDURE_ABILITY ? NATIVE_ENDURE_TRACKER
    : abilityClass === NATIVE_NATURES_POWER_ABILITY ? NATIVE_NATURES_TRACKER : "";
  if (!permitted) return false;
  const stable = (rows: typeof before) => rows.filter(row => row.className !== permitted)
    .map(row => ({className:row.className,serializedBundle:row.serializedBundle,cooldown:row.cooldown}))
    .sort((a,b) => (a.className + a.serializedBundle + a.cooldown).localeCompare(b.className + b.serializedBundle + b.cooldown));
  if (!sameNativeItemValue(stable(before),stable(after))) return false;
  if (before.filter(row => row.className === permitted).length > 1) return false;
  const afterAbilityBuffs = after.filter(row => row.className === permitted);
  if (afterAbilityBuffs.length !== 1) return false;
  const tracker = afterAbilityBuffs[0];
  if (abilityClass === NATIVE_ENDURE_ABILITY) {
    return tracker.cooldown <= 12.1 && tracker.data.enduring === true
      && Number(tracker.data.damage_bonus) === 0 && Number(tracker.data.hits_left) === 0;
  }
  return tracker.cooldown <= 8.1
    && (tracker.data.extensionsLeft === undefined || Number(tracker.data.extensionsLeft) === 2);
}

function sameNativeAbilityCombatBundleExceptArmorCharge(previousValue: unknown, nextValue: unknown,
  armorClassValue: unknown, chargeBeforeValue: unknown, chargeAfterValue: unknown): boolean {
  const before = parseNativeBundleObject(previousValue), after = parseNativeBundleObject(nextValue);
  const armorClass = String(armorClassValue || ""), chargeBefore = Number(chargeBeforeValue), chargeAfter = Number(chargeAfterValue);
  if (!before || !after || !before.armor || !after.armor
      || String(before.armor.__className || "") !== armorClass || String(after.armor.__className || "") !== armorClass
      || Math.abs(Number(before.armor.charge) - chargeBefore) > 0.05
      || Math.abs(Number(after.armor.charge) - chargeAfter) > 0.05) return false;
  delete before.armor.charge;
  delete after.armor.charge;
  return sameNativeItemValue(before,after);
}

/** Admits only two non-targeted self-buff armor abilities with exact native source and charge cost. */
export function isValidNativeAbilityIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, trustedHeroStateValue: unknown): boolean {
  const data: any = dataValue, depth = Number(depthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof trustedHeroStateValue !== "string") return false;
  const abilityClass = String(data.abilityClass || ""), pos = Number(player.pos);
  if (![NATIVE_ENDURE_ABILITY,NATIVE_NATURES_POWER_ABILITY].includes(abilityClass)
      || data.from !== pos || data.to !== pos || data.targetPos !== pos
      || Number(data.depth) !== depth || data.branch !== 0
      || !Number.isFinite(data.engineActionCost) || data.engineActionCost < 0.5 || data.engineActionCost > 4
      || typeof data.armorItemId !== "string" || data.armorItemId.length < 8 || data.armorItemId.length > 80
      || typeof data.armorClass !== "string" || !data.armorClass.startsWith(NATIVE_CLASS_ARMOR_PREFIX)
      || !Number.isFinite(data.armorChargeBefore) || !Number.isFinite(data.armorChargeAfter)
      || !Number.isFinite(data.armorChargeUse) || data.armorChargeBefore < 0 || data.armorChargeBefore > 100
      || data.armorChargeAfter < 0 || data.armorChargeAfter > 100 || data.armorChargeUse <= 0 || data.armorChargeUse > 100
      || Math.abs((data.armorChargeBefore - data.armorChargeAfter) - data.armorChargeUse) > 0.05) return false;
  const expectedArmor = abilityClass === NATIVE_ENDURE_ABILITY ? "WarriorArmor" : "HuntressArmor";
  const expectedClass = NATIVE_CLASS_ARMOR_PREFIX + expectedArmor;
  const expectedCost = abilityClass === NATIVE_ENDURE_ABILITY ? 3 : 1;
  if (data.armorClass !== expectedClass || Math.abs(Number(data.engineActionCost) - expectedCost) > 0.05) return false;

  let hero: any;
  try { hero = JSON.parse(trustedHeroStateValue); } catch (_) { return false; }
  if (Number(hero.pos) !== pos || !Number.isInteger(hero.hp) || hero.hp <= 0
      || !isValidNativeHeroStateJson(trustedHeroStateValue,{hp:Number(hero.hp),ht:Number(hero.ht),pos,shielding:Number(hero.shielding)})) return false;
  const combat = parseNativeBundleObject(hero.combatBundle);
  if (!combat || String(combat.armorAbility && combat.armorAbility.__className || "") !== abilityClass
      || (abilityClass === NATIVE_ENDURE_ABILITY && String(combat.class || "") !== "WARRIOR")
      || (abilityClass === NATIVE_NATURES_POWER_ABILITY && String(combat.class || "") !== "HUNTRESS")) return false;
  const points = nativeHeroicEnergyPoints(hero);
  if (points == null || Math.abs(nativeAbilityChargeUse(abilityClass,points) - Number(data.armorChargeUse)) > 0.05) return false;
  const buffs = nativeAbilityBuffEntries(hero);
  if (!buffs || buffs.some(row => row.className.endsWith(".Invisibility")
      || (abilityClass === NATIVE_ENDURE_ABILITY
        && row.className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Combo"))) return false;
  const inventory = parseNativeInventoryIndex(hero);
  if (!inventory || !parseNativeQuickslotIndex(hero)) return false;
  const source = inventory.filter((item: any) => String(item.itemId) === data.armorItemId);
  if (source.length !== 1 || String(source[0].className) !== data.armorClass
      || source[0].equipped !== true || source[0].quantity !== 1 || source[0].stackable !== false) return false;
  const bundleCharge = nativeClassArmorCharge(source[0]);
  return bundleCharge != null && Math.abs(bundleCharge - Number(data.armorChargeBefore)) <= 0.05
    && data.armorChargeBefore >= data.armorChargeUse;
}

/** Commits only one class-armor charge decrement and its explicitly permitted native tracker buff. */
export function isValidNativeAbilityMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); } catch (_) { return false; }
  const details: any = detailsValue, accepted: any = acceptedValue;
  const abilityClass = String(details && details.abilityClass || "");
  const expectedCost = abilityClass === NATIVE_ENDURE_ABILITY ? 3 : 1;
  if (!details || !accepted || accepted.actionType !== "USE_ABILITY"
      || ![NATIVE_ENDURE_ABILITY,NATIVE_NATURES_POWER_ABILITY].includes(abilityClass)
      || accepted.abilityClass !== details.abilityClass || accepted.armorItemId !== details.armorItemId
      || accepted.armorClass !== details.armorClass || accepted.armorChargeBefore !== details.armorChargeBefore
      || accepted.armorChargeAfter !== details.armorChargeAfter || accepted.armorChargeUse !== details.armorChargeUse
      || !Number.isFinite(accepted.engineActionCost) || Math.abs(Number(accepted.engineActionCost)-expectedCost)>0.05
      || !Number.isFinite(previous.cooldown) || !Number.isFinite(next.cooldown)
      || Math.abs((Number(next.cooldown)-Number(previous.cooldown))-Number(accepted.engineActionCost))>0.05
      || previous.hp !== next.hp || previous.ht !== next.ht || previous.pos !== next.pos
      || previous.shielding !== next.shielding || previous.gold !== next.gold
      || previous.alchemyEnergy !== next.alchemyEnergy || previous.inventoryBundle === next.inventoryBundle
      || !sameNativeItemValue(previous.quickslotsJson,next.quickslotsJson)
      || !sameNativeAbilityCombatBundleExceptArmorCharge(previous.combatBundle,next.combatBundle,
        details.armorClass,details.armorChargeBefore,details.armorChargeAfter)
      || !isValidNativeAbilityBuffDelta(previous,next,abilityClass)) return false;
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  if (!before || !after || before.length !== after.length) return false;
  const beforeById = new Map<string,any>(), afterById = new Map<string,any>();
  for (const row of before) { const id=String(row.itemId); if (beforeById.has(id)) return false; beforeById.set(id,row); }
  for (const row of after) { const id=String(row.itemId); if (afterById.has(id)) return false; afterById.set(id,row); }
  if (beforeById.size !== afterById.size) return false;
  let changedArmorRows=0;
  for (const [id,oldRow] of beforeById) {
    const nextRow=afterById.get(id);
    if (!nextRow || !sameNativeItemValue(itemValueWithout(oldRow,["serializedBundle"]),
        itemValueWithout(nextRow,["serializedBundle"]))) return false;
    if (id === String(details.armorItemId)) {
      changedArmorRows++;
      if (String(oldRow.className)!==String(details.armorClass) || oldRow.equipped!==true || nextRow.equipped!==true
          || !nativeSameClassArmorBundleExceptCharge(oldRow,nextRow)) return false;
      const oldCharge=nativeClassArmorCharge(oldRow), newCharge=nativeClassArmorCharge(nextRow);
      if (oldCharge==null || newCharge==null || Math.abs(oldCharge-Number(details.armorChargeBefore))>0.05
          || Math.abs(newCharge-Number(details.armorChargeAfter))>0.05
          || Math.abs((oldCharge-newCharge)-Number(details.armorChargeUse))>0.05) return false;
    } else if (!sameNativeItemValue(oldRow,nextRow)) return false;
  }
  return changedArmorRows===1;
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
      || typeof item?.serializedBundle !== "string" || !item.serializedBundle.includes(itemId)) return false;
  if (data.acquiredByInventory && resultHeapId !== "") return false;
  if (!data.acquiredByInventory && (resultHeapId.length < 8 || resultHeapId.length > 80 || resultItemId !== itemId)) return false;
  let hero: any;
  try { hero = JSON.parse(heroStateValue); } catch (_) { return false; }
  return Number(hero?.pos) === pos && Number.isInteger(hero?.gold) && hero.gold >= price
    && Number.isInteger(hero?.hp) && hero.hp > 0
    && !!parseNativeInventoryIndex(hero) && !!parseNativeQuickslotIndex(hero);
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
  const slotShape = (entries: any[], mutableId: string) => entries
    .map((entry: any) => ({ slot: entry.slot, itemId: entry.itemId, className: entry.className,
      quantity: String(entry.itemId) === mutableId ? 0 : entry.quantity,
      serializedBundle: String(entry.itemId) === mutableId ? "" : entry.serializedBundle }))
    .sort((a: any, b: any) => a.slot - b.slot);
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
  return sameNativeItemValue(slotShape(beforeSlots, merged ? resultId : ""), slotShape(afterSlots, merged ? resultId : ""));
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
function isValidNativeSellBuybackRow(row: any): boolean {
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

export function isValidNativeWorldActionIntent(actionValue: unknown, data: any, levelSnapshot: any,
  currentDepth: unknown, currentPos: unknown): boolean {
  const action = String(actionValue || "");
  if (!["UNLOCK", "MINE", "INTERACT", "OPEN_CHEST"].includes(action)
      || !levelSnapshot || levelSnapshot.branch !== 0 || levelSnapshot.depth !== currentDepth
      || levelSnapshot.locked === true || data?.depth !== currentDepth || data?.from !== currentPos
      || typeof currentPos !== "number" || !Number.isInteger(currentPos) || !Number.isInteger(data?.targetPos)
      || !Array.isArray(levelSnapshot.tiles) || !Array.isArray(levelSnapshot.heaps)
      || !Array.isArray(levelSnapshot.mobs)) return false;
  const width = Number(levelSnapshot.width), height = Number(levelSnapshot.height), target = Number(data.targetPos);
  const size = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || target < 0 || target >= size
      || currentPos < 0 || currentPos >= size
      || Math.max(Math.abs((target % width) - (currentPos % width)),
          Math.abs(Math.floor(target / width) - Math.floor(currentPos / width))) !== 1) return false;
  const tile = levelSnapshot.tiles.find((row: any) => row?.pos === target);
  if (!tile || !Number.isFinite(data?.engineActionCost)
      || data.engineActionCost < 0 || data.engineActionCost > 10) return false;
  const terrain = Number(tile.terrain);
  if (action === "UNLOCK") return [10, 21, 31, 38].includes(terrain);
  if (action === "MINE") return Number.isInteger(data?.sourceTerrain)
    && Number(data.sourceTerrain) === terrain && [4, 12, 35, 36].includes(terrain);
  if (action === "OPEN_CHEST") {
    const heaps = levelSnapshot.heaps.filter((row: any) => row?.pos === target);
    return heaps.length === 1 && ["CHEST", "LOCKED_CHEST", "CRYSTAL_CHEST"].includes(String(heaps[0].type))
      && typeof data?.heapId === "string" && data.heapId === String(heaps[0].heapId || "")
      && typeof data?.heapType === "string" && data.heapType === String(heaps[0].type)
      && Number.isFinite(data.engineActionCost) && data.engineActionCost >= 0 && data.engineActionCost <= 10;
  }
  return levelSnapshot.mobs.some((mob: any) =>
    Number(mob?.pos) === target && Number(mob?.hp) > 0 && typeof mob?.entityId === "string");
}

/**
 * A movement may reveal nearby heaps, trample high grass and produce native seed/stone/dew/berry
 * drops, uproot a plant with seed preservation, or destroy nearby heaps when a trap activates.
 * Keep those exceptions local and item-specific; an arbitrary inventory/loot insertion is rejected.
 */
export function isValidNativeMovementHeapMutation(previous: any, next: any, targetValue: unknown): boolean {
  const width = Number(previous?.width), height = Number(previous?.height), size = width * height;
  const target = Number(targetValue);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
      || !Number.isInteger(target) || target < 0 || target >= size
      || !Array.isArray(previous?.heaps) || !Array.isArray(next?.heaps)
      || !Array.isArray(previous?.tiles) || !Array.isArray(next?.tiles)
      || !Array.isArray(previous?.traps) || !Array.isArray(next?.traps)
      || !Array.isArray(previous?.plants) || !Array.isArray(next?.plants)) return false;
  const canonical = (value: any): any => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      const out: any = {};
      for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
      return out;
    }
    return value;
  };
  const same = (a: any, b: any) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const distance = (a: number, b: number) => Math.max(
    Math.abs((a % width) - (b % width)),
    Math.abs(Math.floor(a / width) - Math.floor(b / width))
  );
  const indexRows = (rows: any[]) => {
    const result = new Map<number, any>();
    for (const row of rows) {
      const pos = row?.pos;
      if (!Number.isInteger(pos) || pos < 0 || pos >= size || result.has(pos)) return null;
      result.set(pos, row);
    }
    return result;
  };
  const before = indexRows(previous.heaps), after = indexRows(next.heaps);
  const oldTraps = indexRows(previous.traps), newTraps = indexRows(next.traps);
  const oldPlants = indexRows(previous.plants), newPlants = indexRows(next.plants);
  if (!before || !after || !oldTraps || !newTraps || !oldPlants || !newPlants) return false;
  const trapActivatedNearTarget = [...new Set<number>([...oldTraps.keys(), ...newTraps.keys()])].some(pos => {
    const oldTrap = oldTraps.get(pos), newTrap = newTraps.get(pos);
    return distance(pos, target) <= 3 && !!oldTrap && oldTrap.active === true
      && (!newTrap || newTrap.active === false);
  });
  const sourceTerrain = Number(previous.tiles.find((tile: any) => tile?.pos === target)?.terrain);
  const destinationTerrain = Number(next.tiles.find((tile: any) => tile?.pos === target)?.terrain);
  const grassTrampled = [15, 30].includes(sourceTerrain) && [2, 30].includes(destinationTerrain);
  const plantRemoved = oldPlants.has(target) && !newPlants.has(target);
  const seedClass = (name: string) => name.includes(".plants.")
    && (name.endsWith("$Seed") || name.endsWith(".Seed"));
  const allowedDrop = (item: any): boolean => {
    const name = String(item?.className || "");
    if (grassTrampled) return name.endsWith(".Dewdrop") || name.endsWith(".Berry")
      || seedClass(name) || name.includes(".items.stones.");
    return plantRemoved && seedClass(name);
  };
  const itemKind = (item: any) => JSON.stringify([
    String(item?.className || ""), Number(item?.level), item?.cursed === true, item?.cursedKnown === true
  ]);
  const itemCounts = (heap: any) => {
    const counts = new Map<string, number>();
    for (const item of Array.isArray(heap?.items) ? heap.items : []) {
      const key = itemKind(item);
      counts.set(key, (counts.get(key) || 0) + Number(item.quantity || 0));
    }
    return counts;
  };
  for (const pos of new Set<number>([...before.keys(), ...after.keys()])) {
    const oldHeap = before.get(pos), newHeap = after.get(pos);
    if (same(oldHeap, newHeap)) continue;
    if (distance(pos, target) > 12) return false;
    if (!oldHeap || !newHeap) {
      if (oldHeap && !newHeap) {
        if (!(trapActivatedNearTarget && distance(pos, target) <= 3)) return false;
        continue;
      }
      if (!newHeap || pos !== target || !Array.isArray(newHeap.items) || newHeap.type !== "HEAP"
          || newHeap.haunted !== false || newHeap.hidden !== false || newHeap.autoExplored !== false
          || newHeap.items.length === 0 || newHeap.items.length > 3
          || !newHeap.items.every((item: any) => allowedDrop(item) && Number(item.quantity) >= 1)) return false;
      continue;
    }
    // Seeing a nearby heap may update its visibility flags, but must not change heap identity/type.
    if (oldHeap.type !== newHeap.type || oldHeap.haunted !== newHeap.haunted) return false;
    const oldItems = Array.isArray(oldHeap.items) ? oldHeap.items : null;
    const newItems = Array.isArray(newHeap.items) ? newHeap.items : null;
    if (!oldItems || !newItems) return false;
    const oldCounts = itemCounts(oldHeap), newCounts = itemCounts(newHeap);
    let addedUnits = 0, removedUnits = 0;
    for (const key of new Set<string>([...oldCounts.keys(), ...newCounts.keys()])) {
      const delta = (newCounts.get(key) || 0) - (oldCounts.get(key) || 0);
      if (delta > 0) addedUnits += delta; else removedUnits -= delta;
    }
    if (addedUnits > 0) {
      if (pos !== target || addedUnits > 3
          || !newItems.every((item: any) => {
            const oldCount = oldCounts.get(itemKind(item)) || 0;
            const newCount = newCounts.get(itemKind(item)) || 0;
            return newCount <= oldCount || allowedDrop(item);
          })) return false;
    }
    if (removedUnits > 0 && !(trapActivatedNearTarget && distance(pos, target) <= 3)) return false;
    // Existing item bundles may only be rewritten as part of stacking an explicitly allowed drop.
    const oldBundles = oldItems.map((item: any) => String(item?.serializedBundle || ""));
    const newBundles = newItems.map((item: any) => String(item?.serializedBundle || ""));
    if (removedUnits === 0 && addedUnits === 0 && !same(oldBundles.slice().sort(), newBundles.slice().sort())) return false;
    if (addedUnits === 0 && removedUnits > 0) {
      const remaining = [...newBundles];
      for (const bundle of oldBundles) {
        const idx = remaining.indexOf(bundle);
        if (idx >= 0) remaining.splice(idx, 1);
        else if (!trapActivatedNearTarget || distance(pos, target) > 3) return false;
      }
    }
  }
  return true;
}



/** Stable identifiers use the same bounded alphabet as native Item/Heap IDs. */
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

const NATIVE_MULTIPLAYER_BAG_CLASSES = new Set([
  "com.shatteredpixel.shatteredpixeldungeon.items.bags.ScrollHolder",
  "com.shatteredpixel.shatteredpixeldungeon.items.bags.PotionBandolier",
  "com.shatteredpixel.shatteredpixeldungeon.items.bags.VelvetPouch",
  "com.shatteredpixel.shatteredpixeldungeon.items.bags.MagicalHolster"
]);

function nativeBagCanHoldItemClass(bagClassValue: unknown, itemClassValue: unknown): boolean {
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

function parseNativeInventoryIndex(heroValue: any): any[] | null {
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

function itemValueWithout(value: any, ignored: string[]): any {
  const result: any = {};
  for (const key of Object.keys(value || {})) if (!ignored.includes(key)) result[key] = value[key];
  return result;
}
function sameNativeItemValue(a: any, b: any): boolean {
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
  playerIdValue: unknown, player: any): boolean {
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


type NativeHeroBuffTickRow = {className:string,id:number,time:number,cooldown:number,bundle:string,data:any};

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
    if (typeof bundle !== "string" || bundle.length < 1 || bundle.length > 200000
        || !className.startsWith("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.")
        || !Number.isInteger(id) || id < 0 || !Number.isFinite(time)
        || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > 100000
        || Math.abs(cooldown - Math.max(0,time-clock)) > 0.06) return null;
    const key = className+"#"+id;
    if (keys.has(key)) return null;
    keys.add(key);
    rows.push({className,id,time,cooldown,bundle,data});
  }
  return {state,clock,rows};
}

function nativeHeroBuffTickStableState(stateValue: any): any | null {
  const state = {...stateValue};
  // These values may change only through the per-buff rules below. Comparing them here
  // would reject legitimate WellFed/Healing HP gains and Barrier/Poison shield/damage ticks
  // before their class-specific bounds can be checked.
  delete state.hp;
  delete state.shielding;
  delete state.cooldown;
  delete state.buffCount;
  for (const key of Object.keys(state)) if (/^buff_\d+$/.test(key) || /^buffCooldown_\d+$/.test(key)) delete state[key];
  const combat = parseNativeBundleObject(state.combatBundle);
  if (!combat) return null;
  // Actor buffs are validated separately. Keep the native hero clock, equipment, class,
  // talents, and every other combat field intact.
  delete combat.buffs;
  state.combatBundle = combat;
  return state;
}

function nativeHeroBuffTickRowsByKey(rows: NativeHeroBuffTickRow[]): Map<string,NativeHeroBuffTickRow> {
  return new Map(rows.map(row=>[row.className+"#"+row.id,row]));
}

/** A single native Hero Buff.act() may update only its own trusted actor and its bounded native effect. */
export function isValidNativeHeroBuffTick(previousValue: unknown, beforeValue: unknown,
  afterValue: unknown, dataValue: unknown): boolean {
  const previous = nativeHeroBuffTickState(previousValue);
  const before = nativeHeroBuffTickState(beforeValue);
  const after = nativeHeroBuffTickState(afterValue);
  const data:any = dataValue;
  if (!previous || !before || !after || !data || typeof data !== "object"
      || typeof data.buffClass !== "string" || !Number.isInteger(data.buffId) || data.buffId < 0
      || !Number.isFinite(data.actorClockBefore)
      || Math.abs(Number(data.actorClockBefore)-before.clock) > 0.06
      || Math.abs(before.clock-previous.clock) > 10000
      || Math.abs(after.clock-before.clock) > 0.06
      || !sameNativeItemValue(nativeHeroBuffTickStableState(previous.state),nativeHeroBuffTickStableState(before.state))
      || !sameNativeItemValue(nativeHeroBuffTickStableState(before.state),nativeHeroBuffTickStableState(after.state))
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
      || before.state.inventoryBundle !== after.state.inventoryBundle
      || before.state.inventoryItemsJson !== after.state.inventoryItemsJson
      || before.state.quickslotsJson !== after.state.quickslotsJson
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
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Levitation"
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
  if (!source || !prior || source.bundle !== prior.bundle
      || before.state.inventoryBundle !== after.state.inventoryBundle
      || !sameNativeItemValue(
        before.rows.filter(row=>row.className+"#"+row.id!==key).map(row=>({key:row.className+"#"+row.id,bundle:row.bundle,cooldown:row.cooldown})).sort((a,b)=>a.key.localeCompare(b.key)),
        after.rows.filter(row=>row.className+"#"+row.id!==key).map(row=>({key:row.className+"#"+row.id,bundle:row.bundle,cooldown:row.cooldown})).sort((a,b)=>a.key.localeCompare(b.key)))) return false;
  const simpleExpiry = new Set([
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste",
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility"
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
    "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier"
  ].includes(buffClass)) return false;
  const hpBefore = Number(before.state.hp), hpAfter = Number(after.state.hp), ht = Number(before.state.ht);
  const shieldBefore = Number(before.state.shielding), shieldAfter = Number(after.state.shielding);
  const oldData = source.data, newData = result?.data;
  const className = buffClass;
  const timeDelta = result ? result.time-source.time : null;
  const isSameTimeTick = (min:number,max:number) => result != null && timeDelta! >= min && timeDelta! <= max;
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
    if (hasWellFed) return Number(newData.level)===Number(oldData.level)
      && near(Number(newData.partialDamage),Number(oldData.partialDamage))
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
    const tick = result ? left-Number(newData.left) : left;
    if (!Number.isInteger(tick) || tick < 1 || tick > computed
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
    const effective = hpBefore+shieldBefore-hpAfter-shieldAfter;
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
    if (!Number.isInteger(mob?.mobId) || mob.mobId < 0 || mobIds.has(mob.mobId)
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
      || !Number.isInteger(level.nativeWorldActorId) || level.nativeWorldActorId < 0
      || typeof level.nativeWorldActorClass !== "string" || level.nativeWorldActorClass.length < 1
      || level.nativeWorldActorClass.length > 240
      || !["MOB", "MOB_BUFF", "BLOB", "RESPAWNER"].includes(String(level.nativeWorldActorKind))
      || typeof level.nativeWorldActorEntityId !== "string" || level.nativeWorldActorEntityId.length > 80
      || typeof level.nativeMobEntityId !== "string" || level.nativeMobEntityId.length > 80
      || !Number.isInteger(level.nativeMobActorId) || level.nativeMobActorId < -1) return false;
    if ((level.nativeWorldActorKind === "MOB" || level.nativeWorldActorKind === "MOB_BUFF")
      && (level.nativeWorldActorEntityId.length < 8 || level.nativeMobEntityId !== level.nativeWorldActorEntityId
        || level.nativeMobActorId < 0)) return false;
  }
  return true;
}
/**
 * Accepts only a fresh full snapshot emitted by the native Java Actor scheduler, after validating
 * that its actor existed in the previous authoritative world. TypeScript deliberately does not
 * reconstruct Mob AI moves or damage; it only sequences the already-resolved native state.
 */
export function isValidNativeWorldTurnSnapshot(
  previous: any,
  next: any,
  lastAcceptedTurn: unknown,
  expectedDepth: number
): boolean {
  const last = Number(lastAcceptedTurn);
  if (!previous || !Array.isArray(previous.mobs) || !Array.isArray(previous.blobs)
    || !hasCompleteNativeLevelSnapshot(next) || next.nativeWorldTick !== true
    || !Number.isSafeInteger(last) || last < 0
    || !Number.isSafeInteger(next.nativeWorldTurnCounter) || next.nativeWorldTurnCounter !== last + 1
    || Number(next.depth) !== expectedDepth || Number(previous.depth) !== expectedDepth
    || Number(previous.width) !== Number(next.width) || Number(previous.height) !== Number(next.height)
    || Number(previous.branch) !== Number(next.branch) || Number(previous.seed) !== Number(next.seed)) return false;

  const actorKind = String(next.nativeWorldActorKind);
  const actorClass = String(next.nativeWorldActorClass);
  const actorEntityId = String(next.nativeWorldActorEntityId || "");
  const mobEntityId = String(next.nativeMobEntityId || "");
  const previousMobs = previous.mobs as any[];

  if (actorKind === "MOB") {
    const matches = previousMobs.filter(m => String(m?.entityId || "") === actorEntityId);
    if (matches.length !== 1 || Number(matches[0].mobId) !== Number(next.nativeWorldActorId)
      || Number(next.nativeMobActorId) !== Number(matches[0].mobId)
      || mobEntityId !== actorEntityId
      || !(actorClass.endsWith("." + String(matches[0].name)) || actorClass.endsWith("$" + String(matches[0].name)))) return false;
  } else if (actorKind === "MOB_BUFF") {
    const matches = previousMobs.filter(m => String(m?.entityId || "") === mobEntityId);
    if (matches.length !== 1 || Number(matches[0].mobId) !== Number(next.nativeMobActorId)
      || actorEntityId !== mobEntityId || !actorClass.includes(".actors.buffs.")) return false;
  } else if (actorKind === "BLOB") {
    const existed = previous.blobs.some((blob: any) => String(blob?.className || "") === actorClass);
    if (!existed || actorEntityId.length !== 0) return false;
  } else if (actorKind === "RESPAWNER") {
    if (!actorClass.includes("MobSpawner") || actorEntityId.length !== 0
      || typeof previous.nativeLevelMetadataBundle !== "string" || previous.nativeLevelMetadataBundle.length === 0) return false;
  } else {
    return false;
  }

  // The full snapshot is authoritative only when all surviving entities retain unique stable IDs.
  const entityIds = new Set<string>();
  for (const mob of next.mobs) {
    const id = String(mob?.entityId || "");
    // Newly spawned native mobs have not received a server ID yet. They are assigned one
    // after validation and included in the ACK, so the publisher can bind it for the next turn.
    if (id.length === 0) continue;
    if (id.length < 8 || id.length > 80 || entityIds.has(id)) return false;
    entityIds.add(id);
  }
  return true;
}

/** Validates a client-resolved result against the authoritative room pre-state. This does not
 * pretend that a TypeScript Worker can reproduce SPD's Java RNG and native proc pipeline. */
export function isValidNativeHpTransition(previousHp: number, targetHp: number, reportedDamage: number): boolean {
  return Number.isInteger(previousHp) && previousHp >= 0
    && Number.isInteger(targetHp) && targetHp >= 0 && targetHp <= previousHp
    && Number.isFinite(reportedDamage) && reportedDamage >= 0
    && reportedDamage === previousHp - targetHp;
}

/** Checks the actual native effective-damage accounting, including shield absorption.
 * Hunger is intentionally handled separately because Hero.damage excludes shielding
 * from its damage metric for that native source. */
export function isValidNativeDamageAccounting(
  hpBefore: unknown,
  shieldBefore: unknown,
  hpAfter: unknown,
  shieldAfter: unknown,
  effectiveDamage: unknown,
  ignoresShield: boolean = false
): boolean {
  if (!Number.isInteger(hpBefore) || Number(hpBefore) < 0
    || !Number.isInteger(shieldBefore) || Number(shieldBefore) < 0 || Number(shieldBefore) > 100000
    || !Number.isInteger(hpAfter) || Number(hpAfter) < 0 || Number(hpAfter) > Number(hpBefore)
    || !Number.isInteger(shieldAfter) || Number(shieldAfter) < 0 || Number(shieldAfter) > Number(shieldBefore)
    || !Number.isInteger(effectiveDamage) || Number(effectiveDamage) < 0) return false;
  const expected = ignoresShield
    ? Number(hpBefore) - Number(hpAfter)
    : Number(hpBefore) + Number(shieldBefore) - Number(hpAfter) - Number(shieldAfter);
  return expected >= 0 && Number(effectiveDamage) === expected;
}

export function isValidNativeCombatRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,80}$/.test(value);
}

export function classifyRequestReplay(existing: any, playerId: string): "NEW" | "REPLAY" | "CONFLICT" {
  if (!existing) return "NEW";
  return String(existing.player_id) === playerId ? "REPLAY" : "CONFLICT";
}

export function isValidNativeAttackIntent(data: any): boolean {
  if (!data || !["EQUIPPED", "THROWN", "ABILITY", "UNARMED"].includes(String(data.attackWeaponMode))
    || typeof data.attackWeaponBundle !== "string" || data.attackWeaponBundle.length > 200000
    || typeof data.damageMultiplier !== "number" || !Number.isFinite(data.damageMultiplier)
    || data.damageMultiplier < 0 || data.damageMultiplier > 10
    || typeof data.damageBonus !== "number" || !Number.isFinite(data.damageBonus)
    || data.damageBonus < -10000 || data.damageBonus > 100000
    || typeof data.accuracyMultiplier !== "number" || !Number.isFinite(data.accuracyMultiplier)
    || data.accuracyMultiplier < 0 || data.accuracyMultiplier > 100) return false;
  if ((data.attackWeaponMode === "THROWN" || data.attackWeaponMode === "ABILITY")
    && data.attackWeaponBundle.length === 0) return false;
  if (data.attackWeaponMode === "UNARMED" && data.attackWeaponBundle.length !== 0) return false;
  return true;
}

export function hasMatchingNativeAttackIntent(reported: any, expected: any): boolean {
  const projectileMatches = expected?.projectileMutation == null
    ? reported?.projectileMutation == null
    : reported?.projectileMutation != null
      && sameNativeItemValue(reported.projectileMutation, expected.projectileMutation);
  return isValidNativeAttackIntent(reported) && expected != null && projectileMatches
    && reported.attackWeaponMode === expected.attackWeaponMode
    && reported.attackWeaponBundle === expected.attackWeaponBundle
    && reported.damageMultiplier === expected.damageMultiplier
    && reported.damageBonus === expected.damageBonus
    && reported.accuracyMultiplier === expected.accuracyMultiplier;
}

export function hasStrictNativeCombatFields(data: any): boolean {
  return data != null && isValidNativeAttackIntent(data) && data.combatSchemaVersion === 1
    && Number.isInteger(data.combatDepth)
    && typeof data.attackerId === "string" && data.attackerId.length > 0 && data.attackerId.length <= 80
    && Number.isInteger(data.attackerPos) && Number.isInteger(data.targetPos) && Number.isInteger(data.targetPosAfter)
    && Number.isInteger(data.targetHpBefore) && Number.isInteger(data.targetHtBefore)
    && Number.isInteger(data.targetHp) && Number.isInteger(data.targetHt) && Number.isInteger(data.damage)
    && Number.isInteger(data.targetShieldBefore) && Number.isInteger(data.targetShieldAfter)
    && typeof data.engineResult === "boolean" && data.engineResult === true
    && typeof data.engineHit === "boolean" && typeof data.engineRanged === "boolean"
    && data.attackKind === (data.engineRanged ? "RANGED" : "MELEE")
    && typeof data.engineDistance === "number" && Number.isFinite(data.engineDistance)
    && typeof data.engineActionCost === "number" && Number.isFinite(data.engineActionCost)
    && typeof data.targetBuffs === "string"
    && typeof data.targetBuffsBefore === "string"
    && typeof data.secondaryMobDeltas === "string";
}

export function hasStrictNativeSourceMobState(data: any): boolean {
  return data != null
    && Number.isInteger(data.sourceMobHpBefore) && Number.isInteger(data.sourceMobHtBefore)
    && Number.isInteger(data.sourceMobShieldBefore) && data.sourceMobShieldBefore >= 0 && data.sourceMobShieldBefore <= 100000
    && Number.isInteger(data.sourceMobPosBefore) && Number.isInteger(data.sourceMobHpAfter)
    && Number.isInteger(data.sourceMobHtAfter)
    && Number.isInteger(data.sourceMobShieldAfter) && data.sourceMobShieldAfter >= 0 && data.sourceMobShieldAfter <= 100000
    && Number.isInteger(data.sourceMobPosAfter)
    && Number.isInteger(data.sourceMobDamage) && typeof data.sourceMobBuffsBefore === "string"
    && typeof data.sourceMobBuffs === "string" && isValidNativeMobBundle(data.sourceMobBundleAfter);
}

export function isValidNativeEnvironmentDamage(data: any, authoritative: any): boolean {
  if (!data || data.sourceType !== "ENVIRONMENT" || typeof data.sourceClass !== "string"
    || data.sourceClass.length < 1 || data.sourceClass.length > 256 || data.engineDamageResult !== true
    || !authoritative || String(authoritative.state) !== "ALIVE") return false;
  const hpBefore = Number(authoritative.hp), htBefore = Number(authoritative.ht);
  const posBefore = Number(authoritative.pos), shieldBefore = Number(authoritative.shielding);
  const hp = Number(data.targetHp), ht = Number(data.targetHt), posAfter = Number(data.targetPosAfter);
  const shieldAfter = Number(data.targetShieldAfter), damage = Number(data.damage);
  const width = Number(authoritative.levelWidth);
  const moveDistance = Number.isInteger(width) && width > 0
    ? Math.max(Math.abs((posAfter % width) - (posBefore % width)),
        Math.abs(Math.floor(posAfter / width) - Math.floor(posBefore / width)))
    : Number.POSITIVE_INFINITY;
  const buffsBefore = data.targetBuffsBefore, buffsAfter = data.targetBuffs;
  return Number.isInteger(data.targetHpBefore) && data.targetHpBefore === hpBefore
    && Number.isInteger(data.targetHtBefore) && data.targetHtBefore === htBefore
    && Number.isInteger(data.targetPosBefore) && data.targetPosBefore === posBefore
    && Number.isInteger(data.targetPosAfter) && Number.isInteger(authoritative.levelSize)
    && posAfter >= 0 && posAfter < authoritative.levelSize && moveDistance <= 8
    && Number.isInteger(data.targetShieldBefore) && shieldBefore >= 0 && shieldBefore <= 100000
    && data.targetShieldBefore === shieldBefore
    && Number.isInteger(data.targetShieldAfter) && shieldAfter >= 0 && shieldAfter <= shieldBefore
    && Number.isInteger(data.targetHt) && ht === htBefore
    && Number.isInteger(data.targetHp) && hp >= 0 && hp <= hpBefore
    && Number.isInteger(data.damage) && isValidNativeHpTransition(hpBefore, hp, damage)
    && isValidNativeDamageAccounting(hpBefore, shieldBefore, hp, shieldAfter, data.effectiveDamage,
      data.sourceClass === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger")
    && data.targetState === (hp > 0 ? "ALIVE" : "DEAD")
    && hasMatchingNativeHeroBuffSnapshot(buffsBefore, authoritative.heroState)
    && isValidNativeCombatBuffs(buffsAfter)
    && (damage > 0 || shieldAfter < shieldBefore
      || comparableBuffs(JSON.parse(String(buffsBefore))) !== comparableBuffs(JSON.parse(String(buffsAfter)))
      || posAfter !== posBefore);
}

export function resolveAuthorizedNativeMobDamageTarget(
  senderId: unknown, publisherId: unknown, reportedTargetId: unknown
): string | null {
  if (!isAuthorizedNativeMobOwner(senderId, publisherId)) return null;
  if (typeof reportedTargetId !== "string" || reportedTargetId.length < 1 || reportedTargetId.length > 80) return null;
  return reportedTargetId;
}

export function isValidNativeMobNoEffectOutcome(data: any, previous: {
  hp: number; ht: number; pos: number; shielding: number;
}): boolean {
  if (!data || !previous || typeof data.engineHit !== "boolean" || data.engineDamageResult !== true) return false;
  let targetBuffsBefore: any, targetBuffsAfter: any, sourceBuffsBefore: any, sourceBuffsAfter: any;
  try {
    targetBuffsBefore = JSON.parse(String(data.targetBuffsBefore));
    targetBuffsAfter = JSON.parse(String(data.targetBuffs));
    sourceBuffsBefore = JSON.parse(String(data.sourceMobBuffsBefore));
    sourceBuffsAfter = JSON.parse(String(data.sourceMobBuffs));
  } catch (_) { return false; }
  return Number(data.targetHpBefore) === previous.hp && Number(data.targetHp) === previous.hp
    && Number(data.targetHtBefore) === previous.ht && Number(data.targetHt) === previous.ht
    && Number(data.targetPosBefore) === previous.pos && Number(data.targetPosAfter) === previous.pos
    && Number(data.targetShieldBefore) === previous.shielding && Number(data.targetShieldAfter) === previous.shielding
    && Number(data.damage) === 0 && Number(data.effectiveDamage) === 0
    && comparableBuffs(targetBuffsBefore) === comparableBuffs(targetBuffsAfter)
    && Number(data.sourceMobHpBefore) === Number(data.sourceMobHpAfter)
    && Number(data.sourceMobHtBefore) === Number(data.sourceMobHtAfter)
    && Number(data.sourceMobShieldBefore) === Number(data.sourceMobShieldAfter)
    && Number(data.sourceMobPosBefore) === Number(data.sourceMobPosAfter)
    && Number(data.sourceMobDamage) === 0
    && comparableBuffs(sourceBuffsBefore) === comparableBuffs(sourceBuffsAfter);
}

export function hasStrictNativeDamageFields(data: any): boolean {
  return data != null && data.combatSchemaVersion === 1 && Number.isInteger(data.combatDepth)
    && data.targetType === "PLAYER" && data.sourceType === "MOB"
    && typeof data.targetPlayerId === "string" && data.targetPlayerId.length > 0 && data.targetPlayerId.length <= 80
    && typeof data.engineHit === "boolean"
    && typeof data.sourceEntityId === "string" && data.sourceEntityId.length >= 8 && data.sourceEntityId.length <= 128
    && Number.isInteger(data.sourcePos) && ["MELEE", "RANGED"].includes(data.sourceAttackKind)
    && typeof data.sourceActionCost === "number" && Number.isFinite(data.sourceActionCost)
    && data.sourceActionCost > 0 && data.sourceActionCost <= 10
    && Number.isInteger(data.targetHpBefore) && Number.isInteger(data.targetHtBefore)
    && Number.isInteger(data.targetHp) && Number.isInteger(data.targetHt) && Number.isInteger(data.damage)
    && Number.isInteger(data.effectiveDamage) && data.effectiveDamage >= 0
    && Number.isInteger(data.targetPosBefore) && Number.isInteger(data.targetPosAfter)
    && Number.isInteger(data.targetShieldBefore) && Number.isInteger(data.targetShieldAfter)
    && typeof data.engineDamageResult === "boolean" && data.engineDamageResult === true
    && typeof data.targetBuffs === "string"
    && typeof data.targetBuffsBefore === "string";
}

export function isValidNativeHeroStateJson(value: unknown, expected: {
  hp: number; ht: number; pos: number; shielding: number;
}): boolean {
  if (typeof value !== "string" || value.length < 1 || value.length > 200000) return false;
  try {
    const state = JSON.parse(value);
    return Number.isInteger(state?.hp) && state.hp === expected.hp
      && Number.isInteger(state?.ht) && state.ht === expected.ht
      && Number.isInteger(state?.pos) && state.pos === expected.pos
      && Number.isInteger(state?.shielding) && state.shielding === expected.shielding
      && typeof state?.combatBundle === "string" && state.combatBundle.length > 0
      && typeof state?.inventoryBundle === "string" && state.inventoryBundle.length > 0
      && (state?.alchemyEnergy === undefined || (Number.isInteger(state.alchemyEnergy)
        && state.alchemyEnergy >= 0 && state.alchemyEnergy <= 1000000))
      && Number.isInteger(state?.buffCount) && state.buffCount >= 0 && state.buffCount <= 256;
  } catch (_) { return false; }
}

export function mergeNativeHeroState(previousValue: unknown, reportedValue: unknown, expected: {
  hp: number; ht: number; pos: number; shielding: number;
}, targetBuffsValue: unknown, allowBlessedAnkhConsumption = false, preserveCooldown = true,
preserveInventory = true): string | null {
  if (typeof previousValue !== "string" || typeof reportedValue !== "string"
    || typeof targetBuffsValue !== "string") return null;
  let previous: any, reported: any, buffs: any;
  try {
    previous = JSON.parse(previousValue);
    reported = JSON.parse(reportedValue);
    buffs = JSON.parse(targetBuffsValue);
  } catch (_) { return null; }
  if (!isValidNativeHeroStateJson(previousValue, {
    hp: Number(previous?.hp), ht: Number(previous?.ht), pos: Number(previous?.pos), shielding: Number(previous?.shielding)
  }) || !isValidNativeHeroStateJson(reportedValue, expected)
    || !Array.isArray(buffs) || buffs.length > 256 || reported.buffCount !== buffs.length) return null;
  for (let i = 0; i < buffs.length; i++) {
    if (reported[`buff_${i}`] !== buffs[i]?.serializedBundle
      || Number(reported[`buffCooldown_${i}`]) !== Number(buffs[i]?.cooldown)) return null;
  }
  const blessedAnkhConsumed = allowBlessedAnkhConsumption && hasValidBlessedAnkhConsumption(previous, reported);
  const merged: any = {
    ...previous,
    inventoryBundle: (blessedAnkhConsumed || !preserveInventory) ? reported.inventoryBundle : previous.inventoryBundle,
    ...(blessedAnkhConsumed ? {
      ankhCount: reported.ankhCount,
      blessedAnkhCount: reported.blessedAnkhCount
    } : {}),
    hp: expected.hp,
    ht: expected.ht,
    pos: expected.pos,
    shielding: expected.shielding,
    // The attacker does not own the defender's scheduler state; preserve the last trusted cooldown.
    cooldown: preserveCooldown
      ? (Number.isFinite(Number(previous.cooldown)) ? Math.max(0, Math.min(100000, Number(previous.cooldown))) : 0)
      : (Number.isFinite(Number(reported.cooldown)) ? Math.max(0, Math.min(100000, Number(reported.cooldown))) : 0),
    buffCount: buffs.length
  };
  for (const key of Object.keys(merged)) {
    if (/^buff_\d+$/.test(key) || /^buffCooldown_\d+$/.test(key)) delete merged[key];
  }
  for (let i = 0; i < buffs.length; i++) {
    merged[`buff_${i}`] = reported[`buff_${i}`];
    merged[`buffCooldown_${i}`] = Number(reported[`buffCooldown_${i}`]);
  }
  return JSON.stringify(merged);
}

/**
 * Accepts the designated native combat authority's post-attack state for the attacking
 * player only when its supplied pre-state exactly matches the last trusted player snapshot.
 * This captures real native retaliation, life-steal, consumed throwing weapons, buffs and
 * cooldowns that occur inside Hero.attack(), instead of silently discarding them because
 * they changed the attacker's HP during the same action.
 */
export function mergeNativeCombatAttackerState(
  trustedValue: unknown,
  beforeValue: unknown,
  afterValue: unknown,
  playerRow: any,
  allowNativeMaxHpIncrease: boolean = false
): string | null {
  if (typeof trustedValue !== "string" || typeof beforeValue !== "string"
    || typeof afterValue !== "string" || !playerRow || String(playerRow.state) !== "ALIVE") return null;
  let trusted: any, before: any, after: any;
  try {
    trusted = JSON.parse(trustedValue);
    before = JSON.parse(beforeValue);
    after = JSON.parse(afterValue);
  } catch (_) { return null; }
  if (!hasMatchingNativeHeroStateSnapshot(beforeValue, trustedValue)
    || !Number.isInteger(playerRow.hp) || !Number.isInteger(playerRow.ht) || !Number.isInteger(playerRow.pos)
    || !Number.isInteger(before.hp) || !Number.isInteger(before.ht) || !Number.isInteger(before.pos)
    || Number(before.hp) !== Number(playerRow.hp)
    || Number(before.ht) !== Number(playerRow.ht)
    || Number(before.pos) !== Number(playerRow.pos)
    || !Number.isInteger(after.hp) || !Number.isInteger(after.ht) || !Number.isInteger(after.pos)
    || !Number.isInteger(after.shielding)
    || Number(after.hp) < 0 || Number(after.ht) < 1
    // Native kills/secondary deaths can award XP and raise HT. Restrict increases to those
    // outcomes and cap a one-action change; small decreases may occur when temporary HT expires.
    || (Number(after.ht) > Number(before.ht)
      && (!allowNativeMaxHpIncrease || Number(after.ht) - Number(before.ht) > 150))
    || Number(before.ht) - Number(after.ht) > 150
    || Number(after.hp) > Number(after.ht)
    || Number(after.pos) !== Number(playerRow.pos)
    || after.shielding < 0 || after.shielding > 100000) return null;
  const buffs = nativeBuffSnapshotFromHeroState(afterValue);
  if (buffs == null) return null;
  return mergeNativeHeroState(trustedValue, afterValue, {
    hp: Number(after.hp), ht: Number(after.ht), pos: Number(after.pos), shielding: Number(after.shielding)
  }, buffs, hasValidBlessedAnkhConsumption(trusted, after), false, false);
}

export function isValidNativeCombatBuffs(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 200000) return false;
  let buffs: any;
  try { buffs = JSON.parse(value); } catch (_) { return false; }
  if (!Array.isArray(buffs) || buffs.length > 256) return false;
  return buffs.every((buff: any) => typeof buff?.serializedBundle === "string"
    && buff.serializedBundle.length > 0 && buff.serializedBundle.length <= 200000
    && Number.isFinite(Number(buff.cooldown)) && Number(buff.cooldown) >= 0
    && Number(buff.cooldown) <= 100000);
}

function comparableBuffs(value: any): string {
  if (!Array.isArray(value)) return "";
  return JSON.stringify(value.map((buff: any) => ({
    serializedBundle: String(buff?.serializedBundle || ""),
    cooldown: Number(buff?.cooldown) || 0
  })).sort((a: any, b: any) => a.serializedBundle.localeCompare(b.serializedBundle)
    || a.cooldown - b.cooldown));
}

export function isValidNativeMissTransition(hit: unknown, hpBefore: unknown, hpAfter: unknown,
  damage: unknown, shieldBefore: unknown, shieldAfter: unknown, buffsBefore: unknown,
  buffsAfter: unknown, posBefore: unknown, posAfter: unknown): boolean {
  if (hit !== false) return true;
  return Number.isInteger(hpBefore) && Number.isInteger(hpAfter) && hpBefore === hpAfter
    && damage === 0
    && Number.isInteger(shieldBefore) && Number.isInteger(shieldAfter) && shieldBefore === shieldAfter
    && Number.isInteger(posBefore) && Number.isInteger(posAfter) && posBefore === posAfter
    && hasMatchingNativeBuffSnapshot(buffsBefore, buffsAfter);
}

export function hasMatchingNativeMobShieldSnapshot(reportedBefore: unknown, reportedAfter: unknown, authoritativeBefore: unknown): boolean {
  return Number.isInteger(reportedBefore) && Number(reportedBefore) >= 0 && Number(reportedBefore) <= 100000
    && Number.isInteger(reportedAfter) && Number(reportedAfter) >= 0 && Number(reportedAfter) <= 100000
    && Number.isInteger(authoritativeBefore) && Number(authoritativeBefore) >= 0
    && Number(authoritativeBefore) <= 100000
    && Number(reportedBefore) === Number(authoritativeBefore);
}

export function hasValidBlessedAnkhConsumption(previousValue: unknown, reportedValue: unknown): boolean {
  let previous: any = previousValue, reported: any = reportedValue;
  try {
    if (typeof previous === "string") previous = JSON.parse(previous);
    if (typeof reported === "string") reported = JSON.parse(reported);
  } catch (_) { return false; }
  if (!previous || typeof previous !== "object" || !reported || typeof reported !== "object") return false;
  return Number.isInteger(previous.ankhCount) && previous.ankhCount > 0
    && Number.isInteger(previous.blessedAnkhCount) && previous.blessedAnkhCount > 0
    && Number.isInteger(reported.ankhCount) && reported.ankhCount === previous.ankhCount - 1
    && Number.isInteger(reported.blessedAnkhCount)
    && reported.blessedAnkhCount === previous.blessedAnkhCount - 1
    && Number.isInteger(reported.ht) && reported.ht === previous.ht && reported.ht > 0
    && Number.isInteger(reported.hp) && reported.hp > 0 && reported.hp === Math.floor(reported.ht / 4)
    && typeof previous.inventoryBundle === "string" && previous.inventoryBundle.length > 0
    && typeof reported.inventoryBundle === "string" && reported.inventoryBundle.length > 0
    && reported.inventoryBundle !== previous.inventoryBundle;
}

/** Validates exact consumption of one unblessed Ankh by the native RESURRECT flow. */
export function hasValidUnblessedAnkhConsumption(previousValue: unknown, reportedValue: unknown): boolean {
  let previous: any = previousValue, reported: any = reportedValue;
  try {
    if (typeof previous === "string") previous = JSON.parse(previous);
    if (typeof reported === "string") reported = JSON.parse(reported);
  } catch (_) { return false; }
  if (!previous || typeof previous !== "object" || !reported || typeof reported !== "object") return false;
  return Number.isInteger(previous.hp) && previous.hp === 0
    && Number.isInteger(previous.ht) && previous.ht > 0
    && Number.isInteger(previous.ankhCount) && Number.isInteger(previous.blessedAnkhCount)
    && previous.ankhCount - previous.blessedAnkhCount > 0
    && Number.isInteger(reported.ankhCount) && reported.ankhCount === previous.ankhCount - 1
    && Number.isInteger(reported.blessedAnkhCount)
    && reported.blessedAnkhCount === previous.blessedAnkhCount
    && Number.isInteger(reported.ht) && reported.ht === previous.ht
    && Number.isInteger(reported.hp) && reported.hp === reported.ht && reported.hp > 0
    && typeof previous.inventoryBundle === "string" && previous.inventoryBundle.length > 0
    && typeof reported.inventoryBundle === "string" && reported.inventoryBundle.length > 0
    && reported.inventoryBundle !== previous.inventoryBundle;
}

export function hasMatchingNativeHeroStateSnapshot(reportedValue: unknown, authoritativeValue: unknown): boolean {
  let reported: any = reportedValue, authoritative: any = authoritativeValue;
  try {
    if (typeof reported === "string") reported = JSON.parse(reported);
    if (typeof authoritative === "string") authoritative = JSON.parse(authoritative);
  } catch (_) { return false; }
  if (!reported || typeof reported !== "object" || !authoritative || typeof authoritative !== "object") return false;
  for (const key of ["hp", "ht", "pos", "shielding", "buffCount"]) {
    if (Number(reported[key]) !== Number(authoritative[key])) return false;
  }
  if (!hasMatchingNativeHeroEquipmentState(JSON.stringify(reported), authoritative)) return false;
  if ((reported.alchemyEnergy !== undefined || authoritative.alchemyEnergy !== undefined)
      && (!Number.isInteger(reported.alchemyEnergy) || reported.alchemyEnergy !== authoritative.alchemyEnergy)) return false;
  if (!Number.isFinite(Number(reported.cooldown)) || Number(reported.cooldown) !== Number(authoritative.cooldown)) return false;
  for (let i = 0; i < Number(authoritative.buffCount); i++) {
    if (reported[`buff_${i}`] !== authoritative[`buff_${i}`]
      || Number(reported[`buffCooldown_${i}`]) !== Number(authoritative[`buffCooldown_${i}`])) return false;
  }
  return true;
}

export function nativeBuffSnapshotFromHeroState(value: unknown): string | null {
  let state: any = value;
  try { if (typeof state === "string") state = JSON.parse(state); } catch (_) { return null; }
  if (!state || typeof state !== "object" || !Number.isInteger(state.buffCount)
    || state.buffCount < 0 || state.buffCount > 256) return null;
  const buffs: Array<{ serializedBundle: string; cooldown: number }> = [];
  for (let i = 0; i < state.buffCount; i++) {
    const serializedBundle = state[`buff_${i}`], cooldown = Number(state[`buffCooldown_${i}`]);
    if (typeof serializedBundle !== "string" || serializedBundle.length < 1 || serializedBundle.length > 200000
      || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > 100000) return null;
    buffs.push({ serializedBundle, cooldown });
  }
  return JSON.stringify(buffs);
}

export function hasMatchingNativeHeroBuffSnapshot(reported: unknown, authoritativeHeroState: unknown): boolean {
  let state: any = authoritativeHeroState;
  try {
    if (typeof state === "string") state = JSON.parse(state);
  } catch (_) {
    return false;
  }
  if (!state || typeof state !== "object" || !Number.isInteger(state.buffCount)
    || state.buffCount < 0 || state.buffCount > 512) return false;
  const authoritative: Array<{ serializedBundle: string; cooldown: number }> = [];
  for (let i = 0; i < state.buffCount; i++) {
    const serializedBundle = state[`buff_${i}`];
    const cooldown = state[`buffCooldown_${i}`];
    if (typeof serializedBundle !== "string" || !Number.isFinite(cooldown) || cooldown < 0) return false;
    authoritative.push({ serializedBundle, cooldown });
  }
  return hasMatchingNativeBuffSnapshot(reported, authoritative);
}

export function hasMatchingNativeBuffSnapshot(reported: unknown, authoritative: unknown): boolean {
  let reportedValue: any = reported;
  let authoritativeValue: any = authoritative;
  try {
    if (typeof reportedValue === "string") reportedValue = JSON.parse(reportedValue);
    if (typeof authoritativeValue === "string") authoritativeValue = JSON.parse(authoritativeValue);
  } catch (_) {
    return false;
  }
  if (!Array.isArray(reportedValue) || !Array.isArray(authoritativeValue)) return false;
  if (!isValidNativeCombatBuffs(JSON.stringify(reportedValue))
    || !isValidNativeCombatBuffs(JSON.stringify(authoritativeValue))) return false;
  return comparableBuffs(reportedValue) === comparableBuffs(authoritativeValue);
}

function comparableHeap(heap: any): string {
  return JSON.stringify({
    pos: Number(heap?.pos), type: heap?.type, seen: heap?.seen, haunted: heap?.haunted,
    hidden: heap?.hidden, autoExplored: heap?.autoExplored,
    items: (Array.isArray(heap?.items) ? heap.items : []).map((item: any) => ({
      className: item?.className, quantity: item?.quantity, level: item?.level,
      cursed: item?.cursed, cursedKnown: item?.cursedKnown, serializedBundle: item?.serializedBundle
    }))
  });
}

/** A kill may change loot only at the dead mob's cell; all other heaps must remain byte-for-byte equivalent. */
/** Resurrection must add the native LostBackpack at the death cell and not fabricate or replace other items. */
export function hasOnlyNativeLostBackpackAdded(
  nextHeapsValue: unknown, previousHeapsValue: unknown, deathPos: number
): boolean {
  if (!Array.isArray(nextHeapsValue) || !Array.isArray(previousHeapsValue)
    || !Number.isInteger(deathPos) || deathPos < 0) return false;
  const beforeHeap = previousHeapsValue.find((heap: any) => Number(heap?.pos) === deathPos);
  const afterHeap = nextHeapsValue.find((heap: any) => Number(heap?.pos) === deathPos);
  if (!afterHeap || !Array.isArray(afterHeap.items)) return false;
  const isLostBackpack = (item: any) => typeof item?.className === "string"
    && (item.className === "com.shatteredpixel.shatteredpixeldungeon.items.LostBackpack"
      || item.className === "LostBackpack");
  const beforeItems = beforeHeap && Array.isArray(beforeHeap.items) ? beforeHeap.items : [];
  const afterItems = afterHeap.items;
  const beforeLost = beforeItems.filter(isLostBackpack);
  const afterLost = afterItems.filter(isLostBackpack);
  if (afterLost.length !== beforeLost.length + 1) return false;
  if (!afterLost.every((item: any) => typeof item?.serializedBundle === "string"
    && item.serializedBundle.length > 0 && item.serializedBundle.length <= 200000
    && Number(item.quantity) === 1)) return false;
  const signature = (item: any) => JSON.stringify({
    className: item?.className, quantity: item?.quantity, level: item?.level,
    cursed: item?.cursed, cursedKnown: item?.cursedKnown, serializedBundle: item?.serializedBundle
  });
  const sortedNonBackpacks = (items: any[]) => items.filter(item => !isLostBackpack(item)).map(signature).sort();
  return JSON.stringify(sortedNonBackpacks(beforeItems)) === JSON.stringify(sortedNonBackpacks(afterItems));
}

export function isValidNativeLootSnapshot(value: unknown, previousHeaps: unknown, targetPos: number | number[], levelSize: number): boolean {
  const allowedPositions = new Set<number>(Array.isArray(targetPos) ? targetPos : [targetPos]);
  if (!Array.isArray(value) || value.length > 1024 || !Array.isArray(previousHeaps)
    || allowedPositions.size < 1 || [...allowedPositions].some(pos => !Number.isInteger(pos) || pos < 0 || pos >= levelSize)) return false;
  const allowedTypes = new Set(["HEAP", "FOR_SALE", "CHEST", "LOCKED_CHEST", "CRYSTAL_CHEST", "TOMB", "SKELETON", "REMAINS"]);
  const nextByPos = new Map<number, any>();
  for (const heap of value) {
    const pos = Number(heap?.pos);
    if (!Number.isInteger(pos) || pos < 0 || pos >= levelSize || nextByPos.has(pos)
      || !allowedTypes.has(String(heap?.type))
      || typeof heap?.seen !== "boolean" || typeof heap?.haunted !== "boolean"
      || typeof heap?.hidden !== "boolean" || typeof heap?.autoExplored !== "boolean"
      || !Array.isArray(heap?.items) || heap.items.length > 512) return false;
    for (const item of heap.items) {
      if (typeof item?.className !== "string" || item.className.length < 1 || item.className.length > 256
        || typeof item?.serializedBundle !== "string" || item.serializedBundle.length < 1 || item.serializedBundle.length > 200000
        || !Number.isInteger(Number(item?.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 100000
        || !Number.isInteger(Number(item?.level))
        || typeof item?.cursed !== "boolean" || typeof item?.cursedKnown !== "boolean") return false;
    }
    nextByPos.set(pos, heap);
  }
  const previousByPos = new Map<number, any>();
  for (const heap of previousHeaps) {
    const pos = Number(heap?.pos);
    if (!Number.isInteger(pos) || pos < 0 || pos >= levelSize || previousByPos.has(pos)) return false;
    previousByPos.set(pos, heap);
  }
  const otherPositions = new Set<number>([...previousByPos.keys(), ...nextByPos.keys()]);
  for (const pos of allowedPositions) otherPositions.delete(pos);
  for (const pos of otherPositions) {
    const before = previousByPos.get(pos), after = nextByPos.get(pos);
    if (!before || !after || comparableHeap(before) !== comparableHeap(after)) return false;
  }
  return true;
}

export function hasMatchingNativeHeroEquipmentState(reported: unknown, trusted: unknown): boolean {
  try {
    const next = typeof reported === "string" ? JSON.parse(reported) : reported as any;
    const saved = typeof trusted === "string" ? JSON.parse(trusted) : trusted as any;
    return !!next && !!saved
      && typeof next.combatBundle === "string" && next.combatBundle.length > 0
      && next.combatBundle === saved.combatBundle
      && typeof next.inventoryBundle === "string" && next.inventoryBundle.length > 0
      && next.inventoryBundle === saved.inventoryBundle;
  } catch (_) { return false; }
}

export function isValidNativeMobBundle(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200000;
}

export function isAuthorizedNativeMobOwner(senderId: unknown, publisherId: unknown): boolean {
  return typeof senderId === "string" && senderId.length > 0
    && typeof publisherId === "string" && publisherId.length > 0
    && senderId === publisherId;
}

export interface NativeSecondaryMobDeltaPayload {
  complete: boolean;
  deltas: Array<{
    entityId: string;
    hpBefore: number; htBefore: number; posBefore: number; shieldBefore: number; buffsBefore: string;
    hpAfter: number; htAfter: number; posAfter: number; shieldAfter: number; buffsAfter: string;
    serializedBundleAfter: string;
  }>;
  heaps?: unknown;
}

/** Validates every secondary native mob mutation against the last server-held level snapshot. */
export function parseAndValidateNativeSecondaryMobDeltas(
  value: unknown, savedMobs: unknown, levelSize: number, width: number, authoritativeOwner = false,
  excludedEntityId?: string
): NativeSecondaryMobDeltaPayload | null {
  let payload: any = value;
  if (typeof payload === "string" && payload.length > 200000) return null;
  try { if (typeof payload === "string") payload = JSON.parse(payload); } catch (_) { return null; }
  if (!payload || payload.complete !== true || !Array.isArray(payload.deltas)
    || payload.deltas.length > 512 || !Array.isArray(savedMobs)
    || !Number.isInteger(levelSize) || levelSize < 1 || !Number.isInteger(width) || width < 1) return null;
  const byId = new Map<string, any>();
  for (const mob of savedMobs) {
    if (typeof mob?.entityId !== "string" || mob.entityId.length < 8 || byId.has(mob.entityId)) return null;
    byId.set(mob.entityId, mob);
  }
  const seen = new Set<string>();
  const deathPositions = new Set<number>();
  for (const delta of payload.deltas) {
    if (!delta || typeof delta.entityId !== "string" || delta.entityId.length < 8
      || delta.entityId.length > 80 || delta.entityId === excludedEntityId || seen.has(delta.entityId)) return null;
    seen.add(delta.entityId);
    const saved = byId.get(delta.entityId);
    if (!saved) return null;
    const integers = [delta.hpBefore, delta.htBefore, delta.posBefore, delta.shieldBefore,
      delta.hpAfter, delta.htAfter, delta.posAfter, delta.shieldAfter];
    if (!integers.every(Number.isInteger) || delta.hpBefore < 0 || delta.htBefore < 1
      || delta.posBefore < 0 || delta.posBefore >= levelSize
      || delta.shieldBefore < 0 || delta.shieldBefore > 100000
      || delta.hpAfter < 0 || delta.hpAfter > delta.htBefore
      || (!authoritativeOwner && delta.hpAfter > delta.hpBefore)
      || delta.htAfter !== delta.htBefore || delta.htBefore !== Number(saved.ht)
      || delta.hpBefore !== Number(saved.hp) || delta.posBefore !== Number(saved.pos)
      || delta.shieldBefore !== Number(saved.shielding)
      || delta.posAfter < 0 || delta.posAfter >= levelSize
      || delta.shieldAfter < 0 || delta.shieldAfter > (authoritativeOwner ? 100000 : delta.shieldBefore)
      || typeof delta.buffsBefore !== "string" || typeof delta.buffsAfter !== "string"
      || typeof delta.serializedBundleAfter !== "string" || delta.serializedBundleAfter.length < 1
      || delta.serializedBundleAfter.length > 200000
      || !hasMatchingNativeBuffSnapshot(delta.buffsBefore, saved.buffs)
      || !isValidNativeCombatBuffs(delta.buffsAfter)) return null;
    const moveDistance = Math.max(
      Math.abs((delta.posAfter % width) - (delta.posBefore % width)),
      Math.abs(Math.floor(delta.posAfter / width) - Math.floor(delta.posBefore / width))
    );
    if (moveDistance > 8) return null;
    const changed = delta.hpAfter !== delta.hpBefore || delta.posAfter !== delta.posBefore
      || delta.shieldAfter !== delta.shieldBefore
      || comparableBuffs(JSON.parse(delta.buffsAfter)) !== comparableBuffs(JSON.parse(delta.buffsBefore))
      || delta.serializedBundleAfter !== String(saved.serializedBundle || "");
    if (!changed) return null;
    if (delta.hpAfter === 0) deathPositions.add(delta.posAfter);
  }
  if (deathPositions.size > 0) {
    if (!Array.isArray(payload.heaps)) return null;
  } else if (payload.heaps !== undefined) return null;
  return { complete: true, deltas: payload.deltas, ...(deathPositions.size ? { heaps: payload.heaps } : {}) };
}

/**
 * Removes validated native deaths from a stored level snapshot without running local reward logic.
 * Validate the full ID list first so malformed input cannot partially mutate the snapshot.
 */
export function removeDeadNativeMobsFromSnapshot(levelSnapshot: any, entityIds: unknown): number[] | null {
  if (!levelSnapshot || !Array.isArray(levelSnapshot.mobs)
    || !Array.isArray(entityIds) || entityIds.length > 512) return null;
  const seen = new Set<string>();
  const removals: Array<{ index: number; mobId: number }> = [];
  for (const value of entityIds) {
    if (typeof value !== "string" || value.length < 8 || value.length > 80 || seen.has(value)) return null;
    seen.add(value);
    const matches: number[] = [];
    for (let i = 0; i < levelSnapshot.mobs.length; i++) {
      if (String(levelSnapshot.mobs[i]?.entityId || "") === value) matches.push(i);
    }
    if (matches.length !== 1) return null;
    const index = matches[0], mob = levelSnapshot.mobs[index], mobId = Number(mob?.mobId);
    if (Number(mob?.hp) !== 0 || !Number.isInteger(mobId) || mobId < 0) return null;
    removals.push({ index, mobId });
  }
  removals.sort((a, b) => b.index - a.index);
  for (const removal of removals) levelSnapshot.mobs.splice(removal.index, 1);
  return removals.map(removal => removal.mobId);
}

export function isValidNativeCombatEvent(event: any): boolean {
  const previousHp = Number(event?.previousHp);
  const previousHt = Number(event?.previousHt);
  const targetHpBefore = Number(event?.targetHpBefore);
  const targetHtBefore = Number(event?.targetHtBefore);
  const targetHp = Number(event?.targetHp);
  const targetHt = Number(event?.targetHt);
  const damage = Number(event?.damage);
  const distance = Number(event?.distance);
  const authoritativeDistance = Number(event?.authoritativeDistance);
  const actionCost = Number(event?.actionCost);
  const targetPosAfter = Number(event?.targetPosAfter);
  const levelSize = Number(event?.levelSize);
  const targetMoveDistance = Number(event?.targetMoveDistance);
  if (typeof event?.ranged !== "boolean" || typeof event?.hit !== "boolean") return false;
  const ranged = event.ranged;
  if (event?.schemaVersion !== 1 || !Number.isInteger(event?.depth) || event.depth !== event.currentDepth) return false;
  if (typeof event?.sessionPlayerId !== "string" || event?.attackerId !== event.sessionPlayerId) return false;
  if (!Number.isInteger(event?.attackerPos) || event.attackerPos !== event.authoritativeAttackerPos) return false;
  if (!Number.isInteger(event?.targetPos) || event.targetPos !== event.authoritativeTargetPos) return false;
  if (!Number.isInteger(targetPosAfter) || !Number.isInteger(levelSize) || levelSize < 1
    || targetPosAfter < 0 || targetPosAfter >= levelSize
    || !Number.isFinite(targetMoveDistance) || targetMoveDistance < 0 || targetMoveDistance > 8) return false;
  if (event?.targetType === "MOB") {
    if (typeof event?.targetEntityId !== "string" || event.targetEntityId.length < 8
      || event.targetEntityId !== event.expectedTargetEntityId) return false;
  } else if (event?.targetType === "PLAYER") {
    if (event?.targetEntityId != null) return false;
  } else {
    return false;
  }
  if (event?.targetAlive !== true) return false;
  if (!Number.isInteger(event?.previousHp) || !Number.isInteger(event?.previousHt)
    || !Number.isInteger(event?.targetHpBefore) || !Number.isInteger(event?.targetHtBefore)
    || !Number.isInteger(event?.targetHp) || !Number.isInteger(event?.targetHt) || !Number.isInteger(event?.damage)) return false;
  if (!Number.isInteger(previousHt) || previousHt < 1 || !Number.isInteger(previousHp)
    || previousHp < 0 || previousHp > previousHt) return false;
  if (targetHpBefore !== previousHp || targetHtBefore !== previousHt || targetHt !== previousHt) return false;
  if (!isValidNativeHpTransition(previousHp, targetHp, damage)) return false;
  if (event?.hit !== true && (targetHp !== previousHp || damage !== 0)) return false;
  if (event?.attackKind !== (ranged ? "RANGED" : "MELEE")) return false;
  if (!Number.isFinite(distance) || distance !== authoritativeDistance
    || distance < 0 || distance > (ranged ? 8 : 1)) return false;
  if (!Number.isFinite(actionCost) || actionCost <= 0 || actionCost > 10) return false;
  return true;
}

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed % 2147483647;
    if (this.state <= 0) this.state += 2147483646;
  }

  public nextFloat(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }

  public nextInt(max: number): number {
    return Math.floor(this.nextFloat() * max);
  }

  public intRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }
}

export class MatchRoom {
  state: DurableObjectState;
  sql: SqlStorage;
  currentSequence: number = 0;
  matchSeed: number = 123456789;
  currentDepth: number = 1;
  worldTime: number = 0.0;
  gameMode: "COOP_DUNGEON" | "PVP_ARENA" | "DEATHMATCH" | "SURVIVAL" = "COOP_DUNGEON";
  gameStatus: "LOBBY" | "PLAYING" | "ENDED" = "LOBBY";

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.sql = state.storage.sql;
    this.initDatabase();
  }

  /** Durable Object alarm prevents a missing destination snapshot from locking the room forever. */
  async alarm(): Promise<void> {
    const row = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
    if (!row || typeof row.value !== "string") {
      await this.state.storage.deleteAlarm();
      return;
    }
    let pending: any = null;
    try { pending = JSON.parse(String(row.value)); } catch (_) {}
    if (!pending || !Number.isFinite(Number(pending.startedAt))) {
      await this.state.storage.deleteAlarm();
      return;
    }
    const deadline = Number(pending.startedAt) + 30000;
    if (Date.now() < deadline) {
      await this.state.storage.setAlarm(deadline);
      return;
    }
    this.abortPendingLevelTransition(pending, "DESTINATION_NOT_READY");
    await this.state.storage.deleteAlarm();
  }

  private abortPendingLevelTransition(pending: any, reasonCode: string): boolean {
    const currentRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
    let currentPending: any = null;
    try { currentPending = currentRow && typeof currentRow.value === "string"
      ? JSON.parse(String(currentRow.value)) : null; } catch (_) {}
    if (!canAbortNativeFloorTransition(this.currentDepth, pending) || !currentPending
        || currentPending.startedAt !== pending.startedAt
        || currentPending.fromDepth !== this.currentDepth) return false;

    const payload = {
      playerId: String(pending.initiatorId || ""),
      fromDepth: Number(pending.fromDepth),
      depth: Number(pending.depth),
      transitionPos: Number(pending.transitionPos),
      targetBranch: 0,
      reasonCode
    };
    this.sql.exec("DELETE FROM room_meta WHERE key = 'transitionPending'");
    this.sql.exec("DELETE FROM room_meta WHERE key LIKE 'transitionReady:%'");
    this.currentSequence++;
    this.sql.exec("INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
      this.currentSequence, "server", "LEVEL_TRANSITION_ABORTED", JSON.stringify(payload));
    const eventBatch = [{
      sequence: this.currentSequence,
      sender_id: "server",
      event_type: "LEVEL_TRANSITION_ABORTED",
      payload: JSON.stringify(payload)
    }];
    const message = JSON.stringify({
      protocolVersion: "1.0.0",
      messageType: "EVENT_BATCH",
      senderId: "server",
      sequence: this.currentSequence,
      payloadJson: JSON.stringify(eventBatch)
    });
    for (const peer of this.state.getWebSockets()) {
      try { peer.send(message); } catch (_) {}
    }
    return true;
  }

  private reconcileCombatAttackerState(
    pending: any,
    authorityStateAfter: unknown,
    allowNativeMaxHpIncrease: boolean = false
  ): string | null {
    if (!pending || typeof pending.attackerId !== "string" || typeof pending.attackerStateBefore !== "string") return null;
    const playerId = pending.attackerId;
    const stateRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + playerId).toArray()[0];
    const trustedState = stateRow && typeof stateRow.value === "string" ? String(stateRow.value) : "";
    const playerRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", playerId).toArray()[0];
    if (!trustedState || !playerRow) return null;
    // Use the same exact pre-state checks and bounded native transition rules for delegated
    // results and attacks published directly by this player's own client.
    return mergeNativeCombatAttackerState(
      trustedState,
      pending.attackerStateBefore,
      authorityStateAfter,
      playerRow,
      allowNativeMaxHpIncrease
    );
  }

  private clearPendingCombat(pending: any) {
    if (!pending || typeof pending !== "object") return;
    if (typeof pending.requestId === "string") {
      this.sql.exec("DELETE FROM room_meta WHERE key = ?", "pendingCombat:" + pending.requestId);
    }
    if (typeof pending.attackerId === "string") {
      this.sql.exec("DELETE FROM room_meta WHERE key = ?", "pendingCombatAttacker:" + pending.attackerId);
    }
    if (typeof pending.targetLockKey === "string") {
      this.sql.exec("DELETE FROM room_meta WHERE key = ?", "pendingCombatTarget:" + pending.targetLockKey);
    }
  }

  /** Reserve one native combat per attacker and target; stale reservations expire after 15 seconds. */
  private reservePendingCombat(pending: any): boolean {
    if (!pending || typeof pending.requestId !== "string" || typeof pending.attackerId !== "string") return false;
    const now = Date.now();
    const lockKeys = ["pendingCombatAttacker:" + pending.attackerId];
    if (typeof pending.targetLockKey === "string" && pending.targetLockKey.length > 0) {
      lockKeys.push("pendingCombatTarget:" + pending.targetLockKey);
    }
    for (const key of lockKeys) {
      const lock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", key).toArray()[0];
      if (!lock || typeof lock.value !== "string") continue;
      const previousRequestId = String(lock.value);
      const row = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombat:" + previousRequestId).toArray()[0];
      let previous: any = null;
      try { previous = row && typeof row.value === "string" ? JSON.parse(String(row.value)) : null; } catch (_) {}
      if (previous && Number.isFinite(Number(previous.createdAt)) && now - Number(previous.createdAt) <= 15000) return false;
      if (previous) this.clearPendingCombat(previous);
      else this.sql.exec("DELETE FROM room_meta WHERE key = ?", key);
    }
    pending.createdAt = now;
    this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      "pendingCombat:" + pending.requestId, JSON.stringify(pending));
    for (const key of lockKeys) {
      this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        key, pending.requestId);
    }
    return true;
  }

  private migrateClaimedItemInstances(): void {
    const inspect = () => this.sql.exec("PRAGMA table_info(claimed_item_instances)").toArray();
    if (isNativeLootClaimSchemaCurrent(inspect())) return;
    this.state.storage.transactionSync(() => {
      const columns: any[] = inspect();
      if (isNativeLootClaimSchemaCurrent(columns)) return;
      const hasBranch = columns.some((column: any) => String(column.name) === "branch");
      this.sql.exec("ALTER TABLE claimed_item_instances RENAME TO claimed_item_instances_legacy");
      this.sql.exec(`CREATE TABLE claimed_item_instances (
        depth INTEGER NOT NULL,
        branch INTEGER NOT NULL DEFAULT 0,
        heap_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        claimed_by TEXT NOT NULL,
        request_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (depth, branch, heap_id, item_id)
      )`);
      const branchExpression = hasBranch ? "branch" : "0";
      this.sql.exec(`INSERT OR IGNORE INTO claimed_item_instances
        (depth,branch,heap_id,item_id,claimed_by,request_id,created_at)
        SELECT depth,${branchExpression},heap_id,item_id,claimed_by,request_id,created_at
        FROM claimed_item_instances_legacy`);
      this.sql.exec("DROP TABLE claimed_item_instances_legacy");
    });
  }

  private initDatabase() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        session_token TEXT,
        class_name TEXT DEFAULT 'WARRIOR',
        pos INTEGER DEFAULT 0,
        hp INTEGER DEFAULT 20,
        ht INTEGER DEFAULT 20,
        str INTEGER DEFAULT 10,
        weapon_dmg_max INTEGER DEFAULT 8,
        armor_val INTEGER DEFAULT 2,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        next_act_at REAL DEFAULT 0.0,
        ready INTEGER DEFAULT 0,
        state TEXT DEFAULT 'ALIVE',
        connected INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS levels (
        depth INTEGER PRIMARY KEY,
        width INTEGER DEFAULT 32,
        height INTEGER DEFAULT 32,
        entrance_pos INTEGER,
        exit_pos INTEGER,
        seed INTEGER
      );
      CREATE TABLE IF NOT EXISTS level_tiles (
        depth INTEGER,
        pos INTEGER,
        terrain TEXT,
        passable INTEGER DEFAULT 1,
        solid INTEGER DEFAULT 0,
        pit INTEGER DEFAULT 0,
        los_blocking INTEGER DEFAULT 0,
        PRIMARY KEY (depth, pos)
      );
      CREATE TABLE IF NOT EXISTS mobs (
        mob_id INTEGER PRIMARY KEY,
        depth INTEGER DEFAULT 1,
        name TEXT,
        pos INTEGER DEFAULT 0,
        hp INTEGER DEFAULT 10,
        ht INTEGER DEFAULT 10,
        str INTEGER DEFAULT 8,
        dmg_max INTEGER DEFAULT 6,
        next_act_at REAL DEFAULT 0.0,
        state TEXT DEFAULT 'HUNTING'
      );
      CREATE TABLE IF NOT EXISTS claimed_item_instances (
        depth INTEGER NOT NULL,
        branch INTEGER NOT NULL DEFAULT 0,
        heap_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        claimed_by TEXT NOT NULL,
        request_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (depth, branch, heap_id, item_id)
      );
      CREATE TABLE IF NOT EXISTS claimed_chest_instances (
        depth INTEGER NOT NULL,
        heap_id TEXT NOT NULL,
        claimed_by TEXT NOT NULL,
        request_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (depth, heap_id)
      );
      CREATE TABLE IF NOT EXISTS level_transitions (
        transition_id TEXT PRIMARY KEY,
        depth INTEGER,
        pos INTEGER,
        type TEXT,
        target_depth INTEGER
      );
      CREATE TABLE IF NOT EXISTS processed_actions (
        request_id TEXT PRIMARY KEY,
        player_id TEXT,
        sequence INTEGER,
        result_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY,
        sender_id TEXT,
        event_type TEXT,
        payload TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.migrateClaimedItemInstances();

    const timeRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'worldTime'`).toArray();
    this.worldTime = timeRow.length > 0 ? Number(timeRow[0].value) || 0 : 0;

    const seqRow = this.sql.exec(`SELECT MAX(sequence) as max_seq FROM events`).toArray();
    if (seqRow.length > 0 && seqRow[0].max_seq !== null) {
      this.currentSequence = Number(seqRow[0].max_seq);
    }

    const modeRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'gameMode'`).toArray();
    if (modeRow.length > 0) {
      this.gameMode = String(modeRow[0].value) as any;
    } else {
      this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('gameMode', 'COOP_DUNGEON')`);
    }

    const metaRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'seed'`).toArray();
    if (metaRow.length > 0) {
      this.matchSeed = Number(metaRow[0].value);
    } else {
      this.matchSeed = Math.floor(Math.random() * 1000000000);
      this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('seed', ?)`, this.matchSeed.toString());
    }

    const depthRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'depth'`).toArray();
    if (depthRow.length > 0) {
      this.currentDepth = Number(depthRow[0].value);
    } else {
      this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('depth', '1')`);
    }

    this.ensureLevelGenerated(this.currentDepth);
  }

  private ensureLevelGenerated(depth: number) {
    const existingLevel = this.sql.exec(`SELECT depth FROM levels WHERE depth = ?`, depth).toArray();
    if (existingLevel.length === 0) {
      const levelSeed = this.matchSeed + depth * 10007;
      const width = 32;
      const height = 32;
      const entrancePos = 100;
      const exitPos = 920;

      this.sql.exec(
        `INSERT INTO levels (depth, width, height, entrance_pos, exit_pos, seed) VALUES (?, ?, ?, ?, ?, ?)`,
        depth, width, height, entrancePos, exitPos, levelSeed
      );

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pos = y * width + x;
          const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
          const isWall = isBorder;
          const terrain = isWall ? "WALL" : "EMPTY";
          const passable = isWall ? 0 : 1;
          const solid = isWall ? 1 : 0;
          const losBlocking = isWall ? 1 : 0;

          this.sql.exec(
            `INSERT INTO level_tiles (depth, pos, terrain, passable, solid, pit, los_blocking) VALUES (?, ?, ?, ?, ?, 0, ?)`,
            depth, pos, terrain, passable, solid, losBlocking
          );
        }
      }

      this.sql.exec(
        `INSERT INTO level_transitions (transition_id, depth, pos, type, target_depth) VALUES (?, ?, ?, 'ENTRANCE', ?)`,
        `trans_up_${depth}`, depth, entrancePos, depth > 1 ? depth - 1 : 1
      );
      this.sql.exec(
        `INSERT INTO level_transitions (transition_id, depth, pos, type, target_depth) VALUES (?, ?, ?, 'EXIT', ?)`,
        `trans_down_${depth}`, depth, exitPos, depth + 1
      );

      const mobNames = depth === 1 ? ['Rat', 'Gnoll'] : ['Skeleton', 'Thief'];
      this.sql.exec(
        `INSERT INTO mobs (depth, name, pos, hp, ht, str, dmg_max, next_act_at) VALUES (?, ?, 105, 12, 12, 10, 6, 0.0)`,
        depth, mobNames[0]
      );
      this.sql.exec(
        `INSERT INTO mobs (depth, name, pos, hp, ht, str, dmg_max, next_act_at) VALUES (?, ?, 200, 18, 18, 12, 8, 0.0)`,
        depth, mobNames[1]
      );
    }
  }

  private isMeleeAdjacent(fromPos: number, toPos: number, depth: number): boolean {
    const row = this.sql.exec(`SELECT width,height FROM levels WHERE depth = ?`, depth).toArray()[0];
    if (!row) return false;
    const width = Number(row.width), height = Number(row.height);
    if (!Number.isInteger(fromPos) || !Number.isInteger(toPos) || fromPos < 0 || toPos < 0
      || fromPos >= width * height || toPos >= width * height || fromPos === toPos) return false;
    const dx = Math.abs((fromPos % width) - (toPos % width));
    const dy = Math.abs(Math.floor(fromPos / width) - Math.floor(toPos / width));
    if (dx > 1 || dy > 1) return false;
    if (dx === 1 && dy === 1) {
      const sideA = Math.floor(fromPos / width) * width + (toPos % width);
      const sideB = Math.floor(toPos / width) * width + (fromPos % width);
      const sides = this.sql.exec(`SELECT passable,solid FROM level_tiles WHERE depth = ? AND pos IN (?,?)`, depth, sideA, sideB).toArray();
      if (sides.length !== 2 || sides.some((t: any) => Number(t.passable) !== 1 || Number(t.solid) === 1)) return false;
    }
    return true;
  }

  private isCombatDestinationFree(pos: number, depth: number, targetType: string, targetId: string | number): boolean {
    if (targetType === "MOB") {
      const mobRows = this.sql.exec(`SELECT mob_id FROM mobs WHERE depth = ? AND hp > 0 AND pos = ? AND mob_id != ?`,
        depth, pos, Number(targetId)).toArray();
      const playerRows = this.sql.exec(`SELECT player_id FROM players WHERE state = 'ALIVE' AND pos = ?`, pos).toArray();
      return mobRows.length === 0 && playerRows.length === 0;
    }
    const playerRows = this.sql.exec(`SELECT player_id FROM players WHERE state = 'ALIVE' AND pos = ? AND player_id != ?`,
      pos, String(targetId)).toArray();
    const mobRows = this.sql.exec(`SELECT mob_id FROM mobs WHERE depth = ? AND hp > 0 AND pos = ?`, depth, pos).toArray();
    return playerRows.length === 0 && mobRows.length === 0;
  }

  private isValidCombatTargetPosition(pos: number, depth: number): boolean {
    const level = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, depth).toArray()[0];
    if (!level) return false;
    const width = Number(level.width), height = Number(level.height);
    if (!Number.isInteger(pos) || pos < 0 || pos >= width * height) return false;
    const tile = this.sql.exec(`SELECT passable, solid FROM level_tiles WHERE depth = ? AND pos = ?`, depth, pos).toArray()[0];
    return !!tile && Number(tile.solid) !== 1 && Number(tile.passable) === 1;
  }

  public hasLineOfSight(fromPos: number, toPos: number, depth: number): boolean {
    const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, depth).toArray();
    const width = levelRow.length > 0 ? Number(levelRow[0].width) : 32;
    const height = levelRow.length > 0 ? Number(levelRow[0].height) : 32;
    if (fromPos < 0 || toPos < 0 || fromPos >= width * height || toPos >= width * height) return false;
    let x0 = fromPos % width;
    let y0 = Math.floor(fromPos / width);
    const x1 = toPos % width;
    const y1 = Math.floor(toPos / width);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (x0 !== x1 || y0 !== y1) {
      const currentCell = y0 * width + x0;
      if (currentCell !== fromPos && currentCell !== toPos) {
        const tile = this.sql.exec(`SELECT solid, los_blocking FROM level_tiles WHERE depth = ? AND pos = ?`, depth, currentCell).toArray();
        if (tile.length > 0 && (Number(tile[0].solid) === 1 || Number(tile[0].los_blocking) === 1)) {
          return false;
        }
      }

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/websocket")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const playerId = url.searchParams.get("playerId") || crypto.randomUUID();
      const sessionToken = crypto.randomUUID();
      const sessionData: SessionData = { playerId, sessionToken };

      this.state.acceptWebSocket(server);
      server.serializeAttachment(sessionData);

      const entranceRow = this.sql.exec(`SELECT entrance_pos FROM levels WHERE depth = ?`, this.currentDepth).toArray();
      const spawnPos = entranceRow.length > 0 ? Number(entranceRow[0].entrance_pos) : 100;

      this.sql.exec(
        `INSERT INTO players (player_id, session_token, pos, connected) VALUES (?, ?, ?, 1)
         ON CONFLICT(player_id) DO UPDATE SET session_token=excluded.session_token, connected=1`,
        playerId, sessionToken, spawnPos
      );
      if (this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray().length === 0) {
        this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('levelPublisher', ?)`, playerId);
      }

      const welcome: NetworkMessage = {
        protocolVersion: "1.0.0",
        messageType: "SESSION",
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({
          playerId,
          sessionToken,
          sequence: this.currentSequence,
          seed: this.matchSeed,
          depth: this.currentDepth,
          gameMode: this.gameMode,
          isLevelPublisher: String(this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray()[0]?.value || "") === playerId,
          pos: spawnPos
        })
      };
      server.send(JSON.stringify(welcome));

      this.broadcast({
        protocolVersion: "1.0.0",
        messageType: "PLAYER_JOINED",
        senderId: playerId,
        payloadJson: JSON.stringify({ playerId, pos: spawnPos })
      }, server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("MatchRoom Durable Object Active", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    try {
      const msg: NetworkMessage = JSON.parse(message);
      const session = ws.deserializeAttachment() as SessionData | null;
      if (!session) return;

      msg.senderId = session.playerId;

      if (msg.messageType === "RECONNECT") {
        try {
          const payload = typeof msg.payloadJson === "string" ? JSON.parse(msg.payloadJson) : msg.payloadJson;
          const token = payload.sessionToken;
          const lastSeq = payload.lastSequence !== undefined ? Number(payload.lastSequence) : 0;

          const playerRow = this.sql.exec(`SELECT player_id FROM players WHERE session_token = ?`, token).toArray();
          if (playerRow.length > 0) {
            this.sql.exec(`UPDATE players SET connected = 1 WHERE player_id = ?`, session.playerId);
            const gap = this.currentSequence - lastSeq;

            if (gap > 0 && gap <= 50) {
              const missingEvents = this.sql.exec(`SELECT sequence, sender_id, event_type, payload FROM events WHERE sequence > ? ORDER BY sequence ASC`, lastSeq).toArray();
              if (missingEvents.length === gap) {
                ws.send(JSON.stringify({
                  protocolVersion: "1.0.0",
                  messageType: "EVENT_BATCH",
                  sequence: this.currentSequence,
                  payloadJson: JSON.stringify(missingEvents)
                }));
                return;
              }
            }

            const players = this.sql.exec(`SELECT player_id, class_name, pos, hp, ht, ready, state FROM players`).toArray().map((player: any) => {
              const savedHero = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `heroState:${player.player_id}`).toArray()[0];
              return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
            });
            const mobs = this.sql.exec(`SELECT mob_id, name, pos, hp, ht FROM mobs WHERE depth = ?`, this.currentDepth).toArray();

            ws.send(JSON.stringify({
              protocolVersion: "1.0.0",
              messageType: "SNAPSHOT",
              sequence: this.currentSequence,
              payloadJson: JSON.stringify({
                sequence: this.currentSequence,
                seed: this.matchSeed,
                depth: this.currentDepth,
                gameMode: this.gameMode,
                players,
                mobs,
                worldTime: this.worldTime,
                level: this.getCurrentLevelSnapshot()
              })
            }));
            return;
          }
        } catch (_) {}
      }

      if (msg.messageType === "LEVEL_DATA") {
        const level = JSON.parse(msg.payloadJson || "{}");
        const isNativeWorldMutation = level.nativeWorldMutation === true;
        const authority = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray();
        const isLevelPublisher = authority.length > 0 && String(authority[0].value) === session.playerId;
        if (!isLevelPublisher && !isNativeWorldMutation) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "LEVEL_PUBLISHER_ONLY" }) }));
          return;
        }
        const width = Number(level.width), height = Number(level.height), depth = Number(level.depth);
        const pendingAtLevelDataRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
        let pendingAtLevelData: any = null;
        try { pendingAtLevelData = pendingAtLevelDataRow ? JSON.parse(String(pendingAtLevelDataRow.value)) : null; } catch (_) {}
        const isTransitionDestinationSnapshot = isPendingNativeFloorDestinationSnapshot(
          this.currentDepth, pendingAtLevelData, depth, level.branch, session.playerId);
        const tiles = level.tiles, transitions = level.transitions;
        const heaps = level.heaps, traps = level.traps, blobs = level.blobs, plants = level.plants;
        let mobs = level.mobs;
        const visitedPositions = level.visitedPositions, mappedPositions = level.mappedPositions;
        const size = width * height;
        const validBundle = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 200000;
        const boundedArray = (value: unknown, max: number) => Array.isArray(value) && value.length <= max;
        const validPos = (p: number) => Number.isInteger(p) && p >= 0 && p < size;
        if (!hasCompleteNativeLevelSnapshot(level) || Number(level.schemaVersion) !== 1 || Number(level.branch) !== 0 || depth < 1 || depth > 100
          || (depth !== this.currentDepth && !isTransitionDestinationSnapshot)
          || !Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
          || width > 100 || height > 100 || !Array.isArray(tiles) || tiles.length !== size
          || !boundedArray(transitions, 128) || !boundedArray(heaps, size)
          || !boundedArray(traps, size) || !boundedArray(blobs, 128)
          || !boundedArray(plants, size) || !boundedArray(mobs, 512)
          || !boundedArray(visitedPositions, size) || !boundedArray(mappedPositions, size)
          || typeof level.locked !== "boolean" || !["NONE","CHASM","WATER","GRASS","DARK","LARGE","TRAPS","SECRETS"].includes(String(level.feeling))
          || !validPos(Number(level.entrancePos)) || !validPos(Number(level.exitPos))
          || !Number.isFinite(Number(level.seed))
          || (typeof level.heroStateJson !== "string" || level.heroStateJson.length > 200000)) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_LEVEL_SNAPSHOT" }) }));
          return;
        }
        const visitedSet = new Set<number>(), mappedSet = new Set<number>();
        for (const pos of visitedPositions) { if (!validPos(Number(pos)) || visitedSet.has(Number(pos))) { ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId, sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_EXPLORATION" }) })); return; } visitedSet.add(Number(pos)); }
        for (const pos of mappedPositions) { if (!validPos(Number(pos)) || mappedSet.has(Number(pos))) { ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId, sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_EXPLORATION" }) })); return; } mappedSet.add(Number(pos)); }
        const positions = new Set<number>();
        for (const tile of tiles) {
          const pos = Number(tile?.pos);
          if (!validPos(pos) || positions.has(pos) || !Number.isInteger(Number(tile?.terrain))
            || typeof tile?.passable !== "boolean" || typeof tile?.solid !== "boolean"
            || typeof tile?.pit !== "boolean" || typeof tile?.losBlocking !== "boolean"
            || typeof tile?.flammable !== "boolean" || typeof tile?.secret !== "boolean"
            || typeof tile?.avoid !== "boolean" || typeof tile?.water !== "boolean"
            || typeof tile?.discoverable !== "boolean" || typeof tile?.openSpace !== "boolean") {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_LEVEL_TILES" }) }));
            return;
          }
          positions.add(pos);
        }
        for (const t of transitions) {
          if (!validPos(Number(t?.pos)) || !Number.isInteger(Number(t?.targetDepth))
            || !["SURFACE", "REGULAR_ENTRANCE", "REGULAR_EXIT", "BRANCH_ENTRANCE", "BRANCH_EXIT"].includes(String(t?.type))) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_TRANSITIONS" }) }));
            return;
          }
        }
        const mobIds = new Set<number>();
        const entityIds = new Set<string>();
        for (const mob of mobs) {
          const id = Number(mob?.mobId), hp = Number(mob?.hp), ht = Number(mob?.ht);
          if (!validPos(Number(mob?.pos)) || !Number.isInteger(id) || id < 0 || mobIds.has(id)
            || !Number.isInteger(hp) || !Number.isInteger(ht) || hp < 0 || ht < 1 || hp > ht
            || !Number.isInteger(mob?.shielding) || Number(mob.shielding) < 0 || Number(mob.shielding) > 100000
            || typeof mob?.name !== "string" || !validBundle(mob?.serializedBundle)
            || (level.nativeWorldTick === true && (!Number.isFinite(Number(mob?.baseSpeed)) || Number(mob.baseSpeed) <= 0
              || Number(mob.baseSpeed) > 1000 || !Number.isFinite(Number(mob?.effectiveSpeed))
              || Number(mob.effectiveSpeed) <= 0 || Number(mob.effectiveSpeed) > 1000
              || !Number.isFinite(Number(mob?.cooldown ?? 0)) || Number(mob.cooldown ?? 0) < 0
              || Number(mob.cooldown ?? 0) > 100000))
            || !Array.isArray(mob?.buffs) || mob.buffs.length > 256
            || mob.buffs.some((buff: any) => !validBundle(buff?.serializedBundle)
              || !Number.isFinite(Number(buff?.cooldown)) || Number(buff.cooldown) < 0 || Number(buff.cooldown) > 100000)) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_MOBS" }) }));
            return;
          }
          mobIds.add(id);
          if (mob?.entityId != null && String(mob.entityId).length > 0) {
            const entityId = String(mob.entityId);
            if (entityId.length < 8 || entityId.length > 80 || entityIds.has(entityId)) {
              ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
                sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_ENTITY_IDS" }) }));
              return;
            }
            entityIds.add(entityId);
          }
        }
        const invalidObjects =
          !isValidNativeFloorItemIdentitySet(heaps)
          || heaps.some((heap: any) => !validPos(Number(heap?.pos)) || !["HEAP","FOR_SALE","CHEST","LOCKED_CHEST","CRYSTAL_CHEST","TOMB","SKELETON","REMAINS"].includes(String(heap?.type))
            || !Array.isArray(heap?.items) || heap.items.length > 512
            || heap.items.some((item: any) => !validBundle(item?.serializedBundle) || !Number.isInteger(Number(item?.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 100000))
          || traps.some((trap: any) => !validPos(Number(trap?.pos)) || !validBundle(trap?.serializedBundle))
          || plants.some((plant: any) => !validPos(Number(plant?.pos)) || !validBundle(plant?.serializedBundle))
          || blobs.some((blob: any) => typeof blob?.className !== "string" || !validBundle(blob?.serializedBundle)
            || !Number.isFinite(Number(blob?.cooldown)) || Number(blob.cooldown) < 0 || Number(blob.cooldown) > 100000);
        if (invalidObjects) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_LEVEL_ENTITIES" }) }));
          return;
        }
        // Assign stable server identities before replacing the previous snapshot. Preserve an
        // existing identity supplied by the publisher; otherwise reuse a previous identity only
        // when the same native actor key/class can be matched, then fall back to a unique ID.
        const previousSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
          `levelSnapshot:${depth}`).toArray()[0];
        let previousSnapshot: any = {};
        try {
          previousSnapshot = previousSnapshotRow && typeof previousSnapshotRow.value === "string"
            ? JSON.parse(String(previousSnapshotRow.value)) : {};
        } catch (_) { previousSnapshot = {}; }
        const storedTurnRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "nativeWorldTurnCounter").toArray()[0];
        const storedTurnCounter = Math.max(0,
          Number.isSafeInteger(Number(storedTurnRow?.value)) ? Number(storedTurnRow.value) : 0,
          Number.isSafeInteger(Number(previousSnapshot.nativeWorldTurnCounter))
            ? Number(previousSnapshot.nativeWorldTurnCounter) : 0);
        let verifiedMutationHeroStateJson: string | null = null;
        let verifiedMutationAction = "";
        let verifiedMutationFrom = -1;
        let verifiedMutationTargetPos = -1;
        let verifiedMutationDetails: any = null;
        let verifiedMutationRequestId = "";
        if (isNativeWorldMutation) {
          const mutationAction = String(level.nativeMutationAction || "");
          const mutationRequestId = String(level.nativeMutationRequestId || "");
          const mutationFrom = level.nativeMutationFrom;
          const mutationTarget = level.nativeMutationTargetPos;
          const transitionAlreadyPending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
          const acceptedRow = mutationRequestId.length > 0
            ? this.sql.exec("SELECT player_id,result_json FROM processed_actions WHERE request_id = ?", mutationRequestId).toArray()[0] : null;
          let accepted: any = null;
          try { accepted = acceptedRow ? JSON.parse(String(acceptedRow.result_json)) : null; } catch (_) {}
          const expectedEvent = mutationAction === "MOVE" ? "MOVE_INTENT_ACCEPTED"
            : mutationAction === "PICKUP" ? "ITEM_PICKUP_INTENT_ACCEPTED" : "WORLD_ACTION_RESOLVED";
          const acceptedPayload = accepted?.action;
          const mutationDetails = level.nativeMutationDetails || null;
          const mutationLockKey = "nativeMutationPending:" + session.playerId;
          const mutationLockRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", mutationLockKey).toArray()[0];
          const mutationLockMatches = !requiresNativeMutationSnapshot(mutationAction)
            || classifyNativeMutationLock(mutationLockRow?.value, session.playerId, mutationRequestId, mutationAction) === "OWNED";
          const hasItemClaim = mutationAction === "PICKUP" || mutationAction === "BUY" || mutationAction === "BUYBACK";
          const claimHeapId = mutationAction === "BUYBACK" ? mutationDetails?.shopEntityId : mutationDetails?.heapId;
          const claimItemId = mutationAction === "BUYBACK" ? mutationDetails?.buybackItemId : mutationDetails?.itemId;
          const pickupClaim = hasItemClaim && mutationDetails
            ? this.sql.exec("SELECT claimed_by,request_id FROM claimed_item_instances WHERE depth = ? AND branch = ? AND heap_id = ? AND item_id = ?",
                depth, Number(level.branch), String(claimHeapId || ""), String(claimItemId || "")).toArray()[0] : null;
          const chestClaim = mutationAction === "OPEN_CHEST" && mutationDetails
            ? this.sql.exec("SELECT claimed_by,request_id FROM claimed_chest_instances WHERE depth = ? AND heap_id = ?",
                depth, String(mutationDetails.heapId || "")).toArray()[0] : null;
          const playerRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
          const trustedHeroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
          let reportedHero: any = null;
          try { reportedHero = JSON.parse(String(level.heroStateJson || "")); } catch (_) {}
          const actionWasAccepted = !!acceptedRow && String(acceptedRow.player_id) === session.playerId
            && accepted?.status === "ACCEPTED" && accepted?.eventType === expectedEvent
            && (mutationAction === "MOVE"
              ? acceptedPayload?.playerId === session.playerId && acceptedPayload?.from === mutationFrom
                && acceptedPayload?.pos === mutationTarget
              : acceptedPayload?.playerId === session.playerId && acceptedPayload?.actionType === mutationAction
                && acceptedPayload?.from === mutationFrom && acceptedPayload?.targetPos === mutationTarget
                && (mutationAction !== "PICKUP" || mutationDetails != null && pickupClaim
                  && acceptedPayload?.branch === Number(level.branch)
                  && String(pickupClaim.claimed_by) === session.playerId
                  && String(pickupClaim.request_id) === mutationRequestId
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.stackable === mutationDetails.stackable)
                && (mutationAction !== "OPEN_CHEST" || mutationDetails != null && chestClaim
                  && String(chestClaim.claimed_by) === session.playerId
                  && String(chestClaim.request_id) === mutationRequestId
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.heapType === mutationDetails.heapType)
                && ((mutationAction !== "EQUIP" && mutationAction !== "UNEQUIP") || mutationDetails != null
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.expectedEquipped === mutationDetails.expectedEquipped)
                && (mutationAction !== "BUY" || mutationDetails != null && pickupClaim
                  && acceptedPayload?.branch === Number(level.branch)
                  && String(pickupClaim.claimed_by) === session.playerId
                  && String(pickupClaim.request_id) === mutationRequestId
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.price === mutationDetails.price
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.resultHeapId === mutationDetails.resultHeapId
                  && acceptedPayload?.acquiredByInventory === mutationDetails.acquiredByInventory)
                && (mutationAction !== "BUYBACK" || mutationDetails != null && pickupClaim
                  && String(pickupClaim.claimed_by) === session.playerId
                  && String(pickupClaim.request_id) === mutationRequestId
                  && acceptedPayload?.shopEntityId === mutationDetails.shopEntityId
                  && acceptedPayload?.buybackItemId === mutationDetails.buybackItemId
                  && acceptedPayload?.buybackItemClass === mutationDetails.buybackItemClass
                  && acceptedPayload?.buybackQuantity === mutationDetails.buybackQuantity
                  && acceptedPayload?.price === mutationDetails.price
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.itemLevel === mutationDetails.itemLevel
                  && acceptedPayload?.cursed === mutationDetails.cursed
                  && acceptedPayload?.cursedKnown === mutationDetails.cursedKnown
                  && acceptedPayload?.stackable === mutationDetails.stackable
                  && acceptedPayload?.nativeValue === mutationDetails.nativeValue
                  && acceptedPayload?.nativeUnitValue === mutationDetails.nativeUnitValue
                  && acceptedPayload?.resultItemBundle === mutationDetails.resultItemBundle)
                && (mutationAction !== "SELL" || mutationDetails != null
                  && acceptedPayload?.shopEntityId === mutationDetails.shopEntityId
                  && acceptedPayload?.sourceItemLevel === mutationDetails.sourceItemLevel
                  && acceptedPayload?.sourceCursed === mutationDetails.sourceCursed
                  && acceptedPayload?.sourceCursedKnown === mutationDetails.sourceCursedKnown
                  && acceptedPayload?.sourceItemId === mutationDetails.sourceItemId
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.sourceQuantityBefore === mutationDetails.sourceQuantityBefore
                  && acceptedPayload?.soldQuantity === mutationDetails.soldQuantity
                  && acceptedPayload?.sourceNativeValue === mutationDetails.sourceNativeValue
                  && acceptedPayload?.sourceNativeUnitValue === mutationDetails.sourceNativeUnitValue
                  && acceptedPayload?.price === mutationDetails.price
                  && acceptedPayload?.stackable === mutationDetails.stackable
                  && acceptedPayload?.resultItemBundle === mutationDetails.resultItemBundle
                  && acceptedPayload?.resultItemLevel === mutationDetails.resultItemLevel
                  && acceptedPayload?.resultCursed === mutationDetails.resultCursed
                  && acceptedPayload?.resultCursedKnown === mutationDetails.resultCursedKnown
                  && acceptedPayload?.resultNativeValue === mutationDetails.resultNativeValue
                  && acceptedPayload?.resultNativeUnitValue === mutationDetails.resultNativeUnitValue)
                && (mutationAction !== "DROP" || mutationDetails != null
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.sourceQuantityBefore === mutationDetails.sourceQuantityBefore
                  && acceptedPayload?.stackable === mutationDetails.stackable)
                && (mutationAction !== "USE_ITEM" || mutationDetails != null
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.itemAction === mutationDetails.itemAction
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.sourceQuantityBefore === mutationDetails.sourceQuantityBefore
                  && acceptedPayload?.stackable === mutationDetails.stackable)
                && (mutationAction !== "THROW" || mutationDetails != null
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.sourceQuantityBefore === mutationDetails.sourceQuantityBefore
                  && acceptedPayload?.stackable === mutationDetails.stackable)
                && (mutationAction !== "ALCHEMY" || mutationDetails != null
                  && acceptedPayload?.resultNativeValue === mutationDetails.resultNativeValue
                  && acceptedPayload?.resultNativeUnitValue === mutationDetails.resultNativeUnitValue
                  && sameNativeItemValue(acceptedPayload?.ingredients, mutationDetails.ingredients)
                  && acceptedPayload?.alchemyEnergyBefore === mutationDetails.alchemyEnergyBefore
                  && acceptedPayload?.alchemyEnergyAfter === mutationDetails.alchemyEnergyAfter
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.resultItemClass === mutationDetails.resultItemClass
                  && acceptedPayload?.resultQuantity === mutationDetails.resultQuantity
                  && acceptedPayload?.resultStackable === mutationDetails.resultStackable
                  && acceptedPayload?.resultLocation === mutationDetails.resultLocation
                  && acceptedPayload?.resultHeapId === mutationDetails.resultHeapId)
                && (mutationAction !== "USE_ABILITY" || mutationDetails != null
                  && acceptedPayload?.abilityClass === mutationDetails.abilityClass
                  && acceptedPayload?.armorItemId === mutationDetails.armorItemId
                  && acceptedPayload?.armorClass === mutationDetails.armorClass
                  && acceptedPayload?.armorChargeBefore === mutationDetails.armorChargeBefore
                  && acceptedPayload?.armorChargeAfter === mutationDetails.armorChargeAfter
                  && acceptedPayload?.armorChargeUse === mutationDetails.armorChargeUse
                  && Math.abs(Number(acceptedPayload?.engineActionCost)
                    - (String(mutationDetails.abilityClass) === NATIVE_ENDURE_ABILITY ? 3 : 1)) <= 0.05));
          const previousMutationHero: any = (() => {
            try { return JSON.parse(String(trustedHeroRow?.value || "")); } catch (_) { return null; }
          })();
          const mutationExpectedPos = mutationAction === "MOVE" ? Number(mutationTarget) : Number(playerRow?.pos);
          const previousTargetTerrain = Number(previousSnapshot?.tiles?.find((tile: any) => tile?.pos === Number(mutationTarget))?.terrain);
          const submittedTargetTerrain = Number(level.tiles?.find((tile: any) => tile?.pos === Number(mutationTarget))?.terrain);
          const consumedNativeWell = mutationAction === "MOVE" && previousTargetTerrain === 24 && submittedTargetTerrain === 3;
          const pickupDewdrop = mutationAction === "PICKUP"
            && String(mutationDetails?.itemClass || "").endsWith(".Dewdrop");
          const maxDewEffect = pickupDewdrop ? Math.round(Number(playerRow?.ht) * 0.05) : 0;
          const useItemDetails: any = mutationAction === "USE_ITEM" ? mutationDetails : null;
          const useItemStrength = !!useItemDetails && useItemDetails.itemAction === "DRINK"
            && String(useItemDetails.itemClass || "") === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength";
          const heroHpValid = mutationAction === "MOVE" || mutationAction === "PICKUP"
            ? Number.isInteger(reportedHero?.hp) && (reportedHero.hp <= Number(playerRow?.hp)
              || (pickupDewdrop && reportedHero.hp <= Number(playerRow?.hp) + maxDewEffect
                && reportedHero.hp <= Number(reportedHero.ht))
              || (mutationAction === "MOVE" && consumedNativeWell && reportedHero.hp <= Number(reportedHero.ht)))
            : Number(reportedHero?.hp) === Number(playerRow?.hp);
          const heroStateValid = !!playerRow && String(playerRow.state) === "ALIVE" && !!reportedHero
            && Number(reportedHero.pos) === mutationExpectedPos && heroHpValid
            && Number(reportedHero.ht) === Number(playerRow.ht)
            && ((mutationAction === "MOVE" || mutationAction === "PICKUP") ? !!previousMutationHero
              && (reportedHero.shielding <= Number(previousMutationHero.shielding)
                || (mutationAction === "MOVE" && consumedNativeWell)
                || (pickupDewdrop && reportedHero.shielding <= Number(previousMutationHero.shielding) + maxDewEffect))
              : mutationAction === "USE_ITEM" && useItemDetails
                ? Number.isInteger(reportedHero.shielding) && reportedHero.shielding >= 0
                  && reportedHero.shielding <= Number(previousMutationHero?.shielding || 0)
                    + (String(useItemDetails.itemClass || "") === "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding"
                      ? Math.floor(0.6 * Number(reportedHero.ht) + 10) : 0)
                : !!previousMutationHero && reportedHero.shielding === Number(previousMutationHero.shielding))
            && isValidNativeHeroStateJson(String(level.heroStateJson || ""), {
              hp: Number(reportedHero.hp), ht: Number(reportedHero.ht), pos: mutationExpectedPos,
              shielding: Number(reportedHero.shielding)
            });
          if (depth !== this.currentDepth || transitionAlreadyPending || !actionWasAccepted || !trustedHeroRow
              || !mutationLockMatches || !heroStateValid
              || (requiresNativeMutationSnapshot(mutationAction)
                && !isValidNativeMutationActionCost(trustedHeroRow.value, level.heroStateJson, accepted?.actionCost))
              || !isValidNativeWorldMutation(previousSnapshot, level, mutationAction,
                mutationFrom, mutationTarget, trustedHeroRow.value, acceptedPayload)) {
            if ((mutationAction === "PICKUP" || mutationAction === "BUY" || mutationAction === "BUYBACK") && mutationDetails) this.sql.exec(
              "DELETE FROM claimed_item_instances WHERE depth = ? AND branch = ? AND heap_id = ? AND item_id = ? AND claimed_by = ? AND request_id = ?",
              depth, Number(level.branch),
              String((mutationAction === "BUYBACK" ? mutationDetails.shopEntityId : mutationDetails.heapId) || ""),
              String((mutationAction === "BUYBACK" ? mutationDetails.buybackItemId : mutationDetails.itemId) || ""),
              session.playerId, mutationRequestId);
            if (mutationAction === "OPEN_CHEST" && mutationDetails) this.sql.exec(
              "DELETE FROM claimed_chest_instances WHERE depth = ? AND heap_id = ? AND claimed_by = ? AND request_id = ?",
              depth, String(mutationDetails.heapId || ""), session.playerId, mutationRequestId);
            const activeMutationLock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", mutationLockKey).toArray()[0];
            if (isNativeMutationLockForRequest(activeMutationLock?.value, session.playerId, mutationRequestId, mutationAction)) {
              this.sql.exec("DELETE FROM room_meta WHERE key = ?", mutationLockKey);
            }
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_NATIVE_WORLD_MUTATION" }) }));
            return;
          }
          const merged = mergeNativeHeroState(String(trustedHeroRow.value), String(level.heroStateJson), {
            hp: Number(reportedHero.hp), ht: Number(playerRow.ht), pos: mutationExpectedPos,
            shielding: Number(reportedHero.shielding)
          }, nativeBuffSnapshotFromHeroState(String(level.heroStateJson)), false, false, mutationAction !== "PICKUP" && mutationAction !== "DROP" && mutationAction !== "BUY" && mutationAction !== "BUYBACK" && mutationAction !== "SELL" && mutationAction !== "USE_ITEM" && mutationAction !== "THROW" && mutationAction !== "ALCHEMY" && mutationAction !== "USE_ABILITY");
          if (merged == null) {
            if ((mutationAction === "PICKUP" || mutationAction === "BUY" || mutationAction === "BUYBACK") && mutationDetails) this.sql.exec(
              "DELETE FROM claimed_item_instances WHERE depth = ? AND branch = ? AND heap_id = ? AND item_id = ? AND claimed_by = ? AND request_id = ?",
              depth, Number(level.branch),
              String((mutationAction === "BUYBACK" ? mutationDetails.shopEntityId : mutationDetails.heapId) || ""),
              String((mutationAction === "BUYBACK" ? mutationDetails.buybackItemId : mutationDetails.itemId) || ""),
              session.playerId, mutationRequestId);
            if (mutationAction === "OPEN_CHEST" && mutationDetails) this.sql.exec(
              "DELETE FROM claimed_chest_instances WHERE depth = ? AND heap_id = ? AND claimed_by = ? AND request_id = ?",
              depth, String(mutationDetails.heapId || ""), session.playerId, mutationRequestId);
            const activeMutationLock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", mutationLockKey).toArray()[0];
            if (isNativeMutationLockForRequest(activeMutationLock?.value, session.playerId, mutationRequestId, mutationAction)) {
              this.sql.exec("DELETE FROM room_meta WHERE key = ?", mutationLockKey);
            }
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_NATIVE_HERO_MUTATION" }) }));
            return;
          }
          const mergedHero: any = JSON.parse(merged);
          mergedHero.cooldown = reportedHero.cooldown;
          if (mutationAction === "UNLOCK" || mutationAction === "OPEN_CHEST" || mutationAction === "INTERACT" || mutationAction === "PICKUP") {
            for (const field of ["notesBundle", "ironKeyCount", "crystalKeyCount", "wornKeyCount", "goldenKeyCount"]) {
              mergedHero[field] = reportedHero[field];
            }
          }
          if (mutationAction === "INTERACT" || mutationAction === "PICKUP") mergedHero.questStateBundle = reportedHero.questStateBundle;
          if (mutationAction === "INTERACT" || mutationAction === "MINE" || mutationAction === "PICKUP"
              || mutationAction === "DROP" || mutationAction === "EQUIP" || mutationAction === "UNEQUIP"
              || mutationAction === "BUY" || mutationAction === "BUYBACK" || mutationAction === "SELL" || mutationAction === "USE_ITEM" || mutationAction === "THROW" || mutationAction === "ALCHEMY" || mutationAction === "USE_ABILITY") {
            mergedHero.inventoryBundle = reportedHero.inventoryBundle;
            mergedHero.inventoryItemsJson = reportedHero.inventoryItemsJson;
            mergedHero.nativeItemEconomyJson = reportedHero.nativeItemEconomyJson;
            mergedHero.gold = reportedHero.gold;
            if (mutationAction === "ALCHEMY"
                || (mutationAction === "PICKUP" && String(mutationDetails?.itemClass || "").endsWith(".EnergyCrystal"))) {
              mergedHero.alchemyEnergy = reportedHero.alchemyEnergy;
            }
            if (mutationAction === "USE_ABILITY"
                || (mutationAction === "USE_ITEM" && useItemStrength)) {
              mergedHero.combatBundle = reportedHero.combatBundle;
            }
            if (typeof reportedHero.quickslotsJson === "string" && parseNativeQuickslotIndex(reportedHero) != null) {
              mergedHero.quickslotsJson = reportedHero.quickslotsJson;
            }
          }
          verifiedMutationHeroStateJson = JSON.stringify(mergedHero);
          verifiedMutationAction = mutationAction;
          verifiedMutationFrom = Number(mutationFrom);
          verifiedMutationTargetPos = Number(mutationTarget);
          verifiedMutationDetails = mutationDetails;
          verifiedMutationRequestId = mutationRequestId;
          const submittedMobs = Array.isArray(level.mobs) ? level.mobs : [];
          mobs = Array.isArray(previousSnapshot.mobs) ? previousSnapshot.mobs.map((previousMob: any) => {
            if (mutationAction === "INTERACT" && Number(previousMob?.pos) === Number(mutationTarget)) {
              const submittedMob = submittedMobs.find((candidate: any) =>
                String(candidate?.entityId || "") === String(previousMob?.entityId || ""));
              if (submittedMob && typeof submittedMob.serializedBundle === "string") {
                return { ...previousMob, serializedBundle: submittedMob.serializedBundle };
              }
            }
            if ((mutationAction === "SELL" || mutationAction === "BUYBACK")
                && String(previousMob?.entityId || "") === String(mutationDetails?.shopEntityId || "")) {
              const submittedMob = submittedMobs.find((candidate: any) =>
                String(candidate?.entityId || "") === String(previousMob?.entityId || ""));
              if (submittedMob && typeof submittedMob.serializedBundle === "string"
                  && Array.isArray(submittedMob.buybackItems)) {
                return { ...previousMob, serializedBundle: submittedMob.serializedBundle,
                  buybackItems: submittedMob.buybackItems,
                  shopkeeperTurnsSinceHarmed: submittedMob.shopkeeperTurnsSinceHarmed };
              }
            }
            return previousMob;
          }) : [];
          level.mobs = mobs;
          // Hero state is player-specific; never overwrite shared floor metadata with a guest copy.
          level.heroStateJson = String(previousSnapshot.heroStateJson || "");
          delete level.nativeWorldMutation;
          delete level.nativeMutationAction;
          delete level.nativeMutationRequestId;
          delete level.nativeMutationFrom;
          delete level.nativeMutationTargetPos;
          delete level.nativeMutationDetails;
        }
        const isNativeWorldTurn = level.nativeWorldTick === true;
        if (this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0
            && (isNativeWorldTurn || isNativeWorldMutation)) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "TRANSITION_PENDING" }) }));
          return;
        }
        if (isNativeWorldTurn && !isValidNativeWorldTurnSnapshot(previousSnapshot, level, storedTurnCounter, this.currentDepth)) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_OR_REPLAYED_NATIVE_WORLD_TURN" }) }));
          return;
        }
        if (!isNativeWorldTurn && level.nativeWorldTurnCounter !== undefined) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "UNMARKED_NATIVE_WORLD_TURN" }) }));
          return;
        }
        const transitionPendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
        let transitionPending: any = null;
        if (transitionPendingRow) {
          try { transitionPending = JSON.parse(String(transitionPendingRow.value)); } catch (_) {}
          const validFallDestination = transitionPending?.transitionType === "FALL"
            && isValidNativeFallDestinationSnapshot(level);
          const validStairDestination = transitionPending?.transitionType !== "FALL"
            && Array.isArray(transitions)
            && transitions.filter((transition: any) => String(transition?.type) === String(transitionPending.targetType)
              && Number.isInteger(transition?.pos)).length === 1;
          if (!transitionPending || transitionPending.fromDepth !== this.currentDepth
              || transitionPending.depth !== depth || transitionPending.snapshotReady === true
              || !isTransitionDestinationSnapshot || (!validFallDestination && !validStairDestination)) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_TRANSITION_DESTINATION_SNAPSHOT" }) }));
            return;
          }
        }
        assignStableEntityIds(mobs, Array.isArray(previousSnapshot.mobs) ? previousSnapshot.mobs : []);
        level.mobs = mobs;

        this.sql.exec(`DELETE FROM level_tiles WHERE depth = ?`, depth);
        this.sql.exec(`DELETE FROM level_transitions WHERE depth = ?`, depth);
        this.sql.exec(`DELETE FROM mobs WHERE depth = ?`, depth);
        this.sql.exec(`INSERT INTO levels (depth,width,height,entrance_pos,exit_pos,seed) VALUES (?,?,?,?,?,?)
          ON CONFLICT(depth) DO UPDATE SET width=excluded.width,height=excluded.height,
          entrance_pos=excluded.entrance_pos,exit_pos=excluded.exit_pos,seed=excluded.seed`,
          depth,width,height,Number(level.entrancePos),Number(level.exitPos),Number(level.seed)||this.matchSeed);
        this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
          `levelSnapshot:${depth}`, JSON.stringify(level));
        const heroStateToStore = verifiedMutationHeroStateJson || level.heroStateJson;
        if (typeof heroStateToStore === "string" && heroStateToStore.length <= 200000) {
          this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            `heroState:${session.playerId}`, heroStateToStore);
          let storedHero: any = null;
          try { storedHero = JSON.parse(heroStateToStore); } catch (_) {}
          if (storedHero && Number.isInteger(storedHero.hp) && Number.isInteger(storedHero.ht)
              && Number.isInteger(storedHero.pos)) {
            this.sql.exec("UPDATE players SET hp = ?, ht = ?, pos = ? WHERE player_id = ?",
              storedHero.hp, storedHero.ht, storedHero.pos, session.playerId);
          }
        }
        for (const t of tiles) {
          this.sql.exec(`INSERT INTO level_tiles (depth,pos,terrain,passable,solid,pit,los_blocking) VALUES (?,?,?,?,?,?,?)`,
            depth,Number(t.pos),String(Number(t.terrain)),t.passable?1:0,t.solid?1:0,t.pit?1:0,t.losBlocking?1:0);
        }
        for (const t of transitions) {
          const type = String(t.type).endsWith("EXIT") ? "EXIT" : "ENTRANCE";
          this.sql.exec(`INSERT INTO level_transitions (transition_id,depth,pos,type,target_depth) VALUES (?,?,?,?,?)`,
            `spd_${depth}_${Number(t.pos)}_${String(t.type)}`,depth,Number(t.pos),type,Number(t.targetDepth));
        }
        for (const m of mobs) {
          const initialCooldown = Math.max(0, Math.min(100000, Number(m.cooldown) || 0));
          const nativeState = String(m.state || "WANDERING").slice(0, 40);
          this.sql.exec(`INSERT OR REPLACE INTO mobs (mob_id,depth,name,pos,hp,ht,str,dmg_max,next_act_at,state)
            VALUES (?,?,?,?,?,?,8,6,?,?)`,
            Number(m.mobId),depth,String(m.name).slice(0,80),Number(m.pos),Number(m.hp),Math.max(1,Number(m.ht)),
            this.worldTime + initialCooldown, nativeState);
        }
        if (isNativeWorldMutation) {
          const committedMutationLock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "nativeMutationPending:" + session.playerId).toArray()[0];
          if (isNativeMutationLockForRequest(committedMutationLock?.value, session.playerId,
              verifiedMutationRequestId, verifiedMutationAction)) {
            this.sql.exec("DELETE FROM room_meta WHERE key = ?", "nativeMutationPending:" + session.playerId);
          }
          if ((verifiedMutationAction === "PICKUP" || verifiedMutationAction === "BUY" || verifiedMutationAction === "BUYBACK") && verifiedMutationDetails) this.sql.exec(
            "DELETE FROM claimed_item_instances WHERE depth = ? AND branch = ? AND heap_id = ? AND item_id = ? AND claimed_by = ? AND request_id = ?",
            depth, Number(level.branch),
            String((verifiedMutationAction === "BUYBACK" ? verifiedMutationDetails.shopEntityId : verifiedMutationDetails.heapId) || ""),
            String((verifiedMutationAction === "BUYBACK" ? verifiedMutationDetails.buybackItemId : verifiedMutationDetails.itemId) || ""),
            session.playerId, verifiedMutationRequestId);
          if (verifiedMutationAction === "OPEN_CHEST" && verifiedMutationDetails) this.sql.exec(
            "DELETE FROM claimed_chest_instances WHERE depth = ? AND heap_id = ? AND claimed_by = ? AND request_id = ?",
            depth, String(verifiedMutationDetails.heapId || ""), session.playerId, verifiedMutationRequestId);
          this.currentSequence++;
          const mutationEvent = { action: verifiedMutationAction || "WORLD",
            playerId: session.playerId, depth, from: verifiedMutationFrom,
            targetPos: verifiedMutationTargetPos };
          this.sql.exec("INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
            this.currentSequence, session.playerId, "NATIVE_WORLD_MUTATION", JSON.stringify(mutationEvent));
        }
        if (isNativeWorldTurn) {
          this.currentSequence++;
          const actorEvent = {
            turnCounter: Number(level.nativeWorldTurnCounter),
            actorKind: String(level.nativeWorldActorKind),
            actorClass: String(level.nativeWorldActorClass),
            actorEntityId: String(level.nativeWorldActorEntityId || ""),
            mobEntityId: String(level.nativeMobEntityId || ""),
            actorClock: Number(level.nativeActorClock),
            depth
          };
          this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            "nativeWorldTurnCounter", String(level.nativeWorldTurnCounter));
          this.sql.exec("INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
            this.currentSequence, session.playerId, "NATIVE_WORLD_TURN", JSON.stringify(actorEvent));
        }
        const transitionPendingNow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
        if (transitionPendingNow && !isNativeWorldTurn) {
          let pending: any = null;
          try { pending = JSON.parse(String(transitionPendingNow.value)); } catch (_) {}
          if (pending && pending.depth === depth && pending.snapshotReady !== true) {
            pending.snapshotReady = true;
            this.sql.exec("UPDATE room_meta SET value = ? WHERE key = 'transitionPending'", JSON.stringify(pending));
          }
        }

        const ackTurnRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "nativeWorldTurnCounter").toArray()[0];
        const ackTurnCounter = Math.max(0, Number(ackTurnRow?.value) || Number(level.nativeWorldTurnCounter) || 0);
        ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ACK", requestId: msg.requestId,
          sequence: this.currentSequence, payloadJson: JSON.stringify({ accepted: true, source: "SPD_JAVA_GENERATOR",
            depth,width,height,tileCount: tiles.length,transitionCount: transitions.length,mobCount: mobs.length,
            nativeWorldTurnCounter: ackTurnCounter,
            entities: mobs.map((mob: any) => ({ mobId: Number(mob.mobId), entityId: String(mob.entityId) })) }) }));
        if (isNativeWorldTurn || isNativeWorldMutation) {
          // Broadcast the complete server-committed world to peers, not a guessed delta.
          const events = this.sql.exec("SELECT sequence,sender_id,event_type,payload FROM events ORDER BY sequence ASC").toArray();
          const players = this.sql.exec("SELECT player_id,class_name,pos,hp,ht,ready,state FROM players").toArray().map((player: any) => {
            const savedHero = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + String(player.player_id)).toArray()[0];
            return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
          });
          const liveMobs = this.sql.exec("SELECT mob_id,name,pos,hp,ht FROM mobs WHERE depth = ?", this.currentDepth).toArray();
          const snapshotPayload = {
            sequence: this.currentSequence, seed: this.matchSeed, depth: this.currentDepth, gameMode: this.gameMode,
            players, mobs: liveMobs, events, worldTime: this.worldTime, level: this.getCurrentLevelSnapshot()
          };
          const message = JSON.stringify({ protocolVersion: "1.0.0", messageType: "SNAPSHOT",
            senderId: session.playerId, sequence: this.currentSequence, payloadJson: JSON.stringify(snapshotPayload) });
          for (const peer of this.state.getWebSockets()) {
            if (peer === ws) continue;
            const peerSession = peer.deserializeAttachment() as SessionData | null;
            if (!peerSession || peerSession.playerId === session.playerId) continue;
            peer.send(message);
          }
        }
        if (transitionPendingNow && !isNativeWorldTurn) this.tryFinalizeLevelTransition();
        return;
      }

      if (msg.messageType === "LEVEL_READY") {
        const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
        if (!pendingRow) return;
        try {
          const pending = JSON.parse(String(pendingRow.value));
          const ready = JSON.parse(msg.payloadJson || "{}");
          const heroStateJson = ready.heroStateJson;
          const hero = typeof heroStateJson === "string" ? JSON.parse(heroStateJson) : null;
          if (!pending || ready.depth !== pending.depth || ready.branch !== 0
              || typeof ready.seed !== "number" || !Number.isFinite(ready.seed)
              || !hero || !Number.isInteger(hero.hp) || hero.hp < 0
              || !Number.isInteger(hero.ht) || hero.ht < 1 || hero.hp > hero.ht
              || !Number.isInteger(hero.pos) || !Number.isInteger(hero.shielding) || hero.shielding < 0
              || !isValidNativeHeroStateJson(heroStateJson, {
                hp: hero.hp, ht: hero.ht, pos: hero.pos, shielding: hero.shielding
              })) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_LEVEL_READY" }) }));
            return;
          }
          this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            `transitionReady:${session.playerId}`,
            JSON.stringify({ depth: ready.depth, branch: ready.branch, seed: ready.seed, heroStateJson }));
          this.tryFinalizeLevelTransition();
        } catch (_) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_LEVEL_READY" }) }));
        }
        return;
      }

      if (msg.messageType === "ACTION") {
        if (this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "TRANSITION_PENDING" }) }));
          return;
        }
        if (this.gameStatus === "ENDED") {
          ws.send(JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ERROR",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify({ error: "MATCH_ALREADY_ENDED" })
          }));
          return;
        }

        // Persistent Deduplication Check
        if (msg.requestId) {
          const dupRow = this.sql.exec(`SELECT player_id, sequence, result_json FROM processed_actions WHERE request_id = ?`, msg.requestId).toArray();
          if (dupRow.length > 0) {
            if (classifyRequestReplay(dupRow[0], session.playerId) === "CONFLICT") {
              ws.send(JSON.stringify({
                protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
                sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "REQUEST_ID_CONFLICT" })
              }));
              return;
            }
            const origSeq = Number(dupRow[0].sequence);
            const origResult = String(dupRow[0].result_json);
            ws.send(JSON.stringify({
              protocolVersion: "1.0.0",
              messageType: "ACTION_ACCEPTED",
              requestId: msg.requestId,
              sequence: origSeq,
              payloadJson: origResult
            }));
            return;
          }
        }

        let eventType = "PLAYER_MOVED";
        let actionResultPayload: any = {};
        let actionValid = false;
        let actionErrorCode = "INVALID_ACTION";
        let actionCost = 1.0;
        let actionOwnerId = session.playerId;
        let pendingCombatForCleanup: any = null;
        let actionStrForLock = "";

        try {
          const payload = typeof msg.payloadJson === "string" ? JSON.parse(msg.payloadJson) : msg.payloadJson;
          let targetPos = -1;

          if (payload.data) {
            if (payload.data.to !== undefined) targetPos = Number(payload.data.to);
            else if (payload.data.targetPos !== undefined) targetPos = Number(payload.data.targetPos);
            else if (payload.data.pos !== undefined) targetPos = Number(payload.data.pos);
          } else {
            if (payload.to !== undefined) targetPos = Number(payload.to);
            else if (payload.targetPos !== undefined) targetPos = Number(payload.targetPos);
            else if (payload.pos !== undefined) targetPos = Number(payload.pos);
          }

          const actionStr = payload.action || payload.data?.action;
          actionStrForLock = String(actionStr || "");
          let authorityPending: any = null;
          const nativeMutationLockKey = "nativeMutationPending:" + session.playerId;
          const nativeMutationLockRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", nativeMutationLockKey).toArray()[0];
          const currentLockStatus = classifyNativeMutationLock(nativeMutationLockRow?.value,
            session.playerId, String(msg.requestId || ""), String(actionStr || ""));
          if (currentLockStatus === "STALE") {
            this.sql.exec("DELETE FROM room_meta WHERE key = ?", nativeMutationLockKey);
            actionErrorCode = "NATIVE_MUTATION_RESYNC_REQUIRED";
          } else if (currentLockStatus === "PENDING") {
            actionErrorCode = "NATIVE_MUTATION_PENDING";
          }

          if (actionErrorCode === "NATIVE_MUTATION_PENDING" || actionErrorCode === "NATIVE_MUTATION_RESYNC_REQUIRED") {
            // Fail closed until the previous stateful mutation receives its authoritative native post-state.
          } else if (actionStr === "SYNC_PLAYER_COMBAT" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data || {};
            const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombat:" + String(data.combatRequestId || msg.requestId || "")).toArray()[0];
            let pending: any = null;
            try { pending = pendingRow && typeof pendingRow.value === "string" ? JSON.parse(String(pendingRow.value)) : null; } catch (_) {}
            pendingCombatForCleanup = pending;
            if (pending && typeof pending.attackerId === "string") actionOwnerId = pending.attackerId;
            const defenderId = String(pending?.targetId || "");
            const attackerId = String(pending?.attackerId || "");
            const defenderRow = defenderId ? this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", defenderId).toArray() : [];
            const attackerRow = attackerId ? this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", attackerId).toArray() : [];
            const trustedRow = defenderId ? this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + defenderId).toArray()[0] : null;
            const trustedState = trustedRow && typeof trustedRow.value === "string" ? String(trustedRow.value) : "";
            const attackerStateRow = attackerId ? this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + attackerId).toArray()[0] : null;
            const trustedAttackerState = attackerStateRow && typeof attackerStateRow.value === "string" ? String(attackerStateRow.value) : "";
            let trusted: any = null;
            try { trusted = JSON.parse(trustedState); } catch (_) {}
            const hpBefore = Number(data.targetHpBefore), htBefore = Number(data.targetHtBefore);
            const hpAfter = Number(data.targetHp), htAfter = Number(data.targetHt), damage = Number(data.damage);
            const posBefore = Number(data.targetPos), posAfter = Number(data.targetPosAfter);
            const shieldBefore = Number(data.targetShieldBefore), shieldAfter = Number(data.targetShieldAfter);
            const widthRow = this.sql.exec("SELECT width,height FROM levels WHERE depth = ?", this.currentDepth).toArray()[0];
            const width = Number(widthRow?.width || 0), levelSize = width * Number(widthRow?.height || 0);
            const attackerPos = Number(attackerRow[0]?.pos), defenderPos = Number(defenderRow[0]?.pos);
            const nativeCost = Number(data.engineActionCost), distance = Number(data.engineDistance), ranged = data.engineRanged === true;
            const targetBuffsValid = hasMatchingNativeHeroBuffSnapshot(data.targetBuffsBefore, trustedState);
            const hpDeltaValid = isValidNativeHpTransition(hpBefore, hpAfter, damage)
              || (hpAfter > hpBefore && hasValidBlessedAnkhConsumption(trustedState, data.targetHeroStateJson));
            const mergedState = mergeNativeHeroState(trustedState, String(data.targetHeroStateJson || ""), {
              hp: hpAfter, ht: htAfter, pos: posAfter, shielding: shieldAfter
            }, String(data.targetBuffs || ""), true);
            // The defender-authority client also simulates the attacker's native Hero instance.
            // Persist its post-attack state (cooldowns, procs, inventory and reactive damage) so
            // the attacker cannot keep its separate optimistic RNG result.
            const mergedAttackerState = this.reconcileCombatAttackerState(pending, payload.heroStateJson);
            const levelPublisherRow = this.sql.exec(
              "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
            const secondaryMobAuthority = String(levelPublisherRow?.value || "") === session.playerId;
            const combatLevelRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let combatLevel: any = null;
            try {
              combatLevel = combatLevelRow && typeof combatLevelRow.value === "string"
                ? JSON.parse(String(combatLevelRow.value)) : null;
            } catch (_) { combatLevel = null; }
            // The authority owner is not necessarily the shared-level publisher. Validate the
            // complete secondary result in either case; only the publisher may commit shared mobs.
            const secondaryMobPayload = parseAndValidateNativeSecondaryMobDeltas(
              data.secondaryMobDeltas, combatLevel?.mobs, levelSize, width, true);
            const secondaryDeathPositions = (secondaryMobPayload?.deltas || [])
              .filter((delta: any) => Number(delta.hpAfter) === 0)
              .map((delta: any) => Number(delta.posAfter));
            const secondaryHasDeaths = secondaryDeathPositions.length > 0;
            const pvpProjectileTarget = Number(data.projectileMutation?.targetPos);
            const secondaryLootPositions = data.projectileOutcome === "HEAP"
              ? [...secondaryDeathPositions, ...(Number.isInteger(pvpProjectileTarget) ? [pvpProjectileTarget] : [])]
              : secondaryDeathPositions;
            const secondaryLootValid = secondaryMobPayload != null
              && (secondaryDeathPositions.length === 0
                ? secondaryMobPayload.heaps === undefined
                : isValidNativeLootSnapshot(secondaryMobPayload.heaps, combatLevel?.heaps,
                    secondaryLootPositions, levelSize)
                  && (data.projectileMutation == null || sameNativeItemValue(data.heaps, secondaryMobPayload.heaps)));
            const validProjectileResult = isValidNativeProjectileCombatResult(
              combatLevel?.heaps, data, posBefore, secondaryDeathPositions, levelSize);
            // An incomplete secondary side-effect must not cancel an otherwise valid player
            // attack. It is deliberately not committed and instead forces a full publisher snapshot.
            const secondaryMobResyncRequired = secondaryMobPayload == null || !secondaryLootValid
              || secondaryMobPayload.deltas.length > 0;
            const authorityValid = !!pending && pending.targetType === "PLAYER"
              && String(pending.requestId) === String(data.combatRequestId)
              && Number.isFinite(Number(pending.createdAt)) && Date.now() - Number(pending.createdAt) <= 15000
              && String(pending.authorityId) === session.playerId && defenderId === session.playerId
              && String(pending.attackerId) === String(data.attackerId) && attackerId !== defenderId
              && hasMatchingNativeAttackIntent(data, pending)
              && validProjectileResult
              && !(data.projectileMutation != null && secondaryHasDeaths && !secondaryMobAuthority)
              && String(data.targetType) === "PLAYER" && String(data.targetId) === defenderId
              && Number(pending.depth) === this.currentDepth && defenderRow.length > 0 && attackerRow.length > 0
              && String(defenderRow[0].state) === "ALIVE" && String(attackerRow[0].state) === "ALIVE"
              && Number(pending.attackerPos) === attackerPos && Number(data.attackerPos) === attackerPos
              && hasMatchingNativeHeroStateSnapshot(pending.attackerStateBefore, trustedAttackerState)
              && hasMatchingNativeHeroStateSnapshot(data.targetHeroStateBefore, trusted)
              && hpBefore === Number(defenderRow[0].hp) && htBefore === Number(defenderRow[0].ht)
              && posBefore === defenderPos && Number(pending.targetPos) === defenderPos
              && shieldBefore === Number(trusted?.shielding) && targetBuffsValid
              && isValidNativeCombatBuffs(data.targetBuffs)
              && isValidNativeHeroStateJson(String(data.targetHeroStateJson || ""), { hp: hpAfter, ht: htAfter, pos: posAfter, shielding: shieldAfter })
              && mergedState !== null && mergedAttackerState !== null && hpDeltaValid
              && Number.isInteger(hpAfter) && hpAfter >= 0 && Number.isInteger(htAfter) && htAfter >= 1 && hpAfter <= htAfter
              && Number.isInteger(posAfter) && posAfter >= 0 && posAfter < levelSize
              && Number.isInteger(shieldAfter) && shieldAfter >= 0 && shieldAfter <= 100000
              && Number.isFinite(nativeCost) && nativeCost > 0 && nativeCost <= 10
              && Number.isFinite(distance) && data.engineResult === true
              && distance === Math.max(Math.abs((attackerPos % width) - (defenderPos % width)),
                Math.abs(Math.floor(attackerPos / width) - Math.floor(defenderPos / width)))
              && (ranged ? this.hasLineOfSight(attackerPos, defenderPos, this.currentDepth) : this.isMeleeAdjacent(attackerPos, defenderPos, this.currentDepth))
              && (posAfter === posBefore || (this.isValidCombatTargetPosition(posAfter, this.currentDepth)
                && Math.max(Math.abs((posAfter % width) - (posBefore % width)),
                  Math.abs(Math.floor(posAfter / width) - Math.floor(posBefore / width))) <= 2));
            if (authorityValid) {
              const newStatus = hpAfter > 0 ? "ALIVE"
                : this.gameMode === "DEATHMATCH" ? "ALIVE"
                  : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
              this.sql.exec("UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?",
                hpAfter, htAfter, posAfter, newStatus, defenderId);
              if (hpAfter <= 0) {
                this.sql.exec("UPDATE players SET kills = kills + 1, score = score + 1 WHERE player_id = ?", attackerId);
                this.sql.exec("UPDATE players SET deaths = deaths + 1 WHERE player_id = ?", defenderId);
              }
              this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                "heroState:" + defenderId, mergedState);
              const mergedAttacker = JSON.parse(mergedAttackerState as string);
              const attackerStatus = Number(mergedAttacker.hp) > 0 ? "ALIVE"
                : this.gameMode === "DEATHMATCH" ? "ALIVE"
                  : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
              this.sql.exec("UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?",
                Number(mergedAttacker.hp), Number(mergedAttacker.ht), Number(mergedAttacker.pos),
                attackerStatus, attackerId);
              this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                "heroState:" + attackerId, mergedAttackerState as string);
              if (String(attackerRow[0].state) === "ALIVE" && (attackerStatus === "DEAD" || attackerStatus === "SPECTATOR")) {
                this.sql.exec("UPDATE players SET deaths = deaths + 1 WHERE player_id = ?", attackerId);
              }
              // A PvP combat may trigger secondary mob effects (for example LifeLink).
              // Commit those shared-world mutations only if the defender is the designated
              // level publisher; otherwise retain server-owned mob state and force all peers
              // to resynchronize to the publisher's version.
              if (secondaryMobAuthority && secondaryMobPayload != null
                  && secondaryLootValid && secondaryMobPayload.deltas.length > 0) {
                for (const delta of secondaryMobPayload.deltas) {
                  const mobIndex = (combatLevel.mobs as any[]).findIndex(
                    (mob: any) => String(mob?.entityId || "") === delta.entityId);
                  if (mobIndex < 0) throw new Error("Secondary PvP combat mob missing from snapshot");
                  const savedSecondary = combatLevel.mobs[mobIndex];
                  const secondaryMobId = Number(savedSecondary.mobId);
                  savedSecondary.hp = Number(delta.hpAfter);
                  savedSecondary.ht = Number(delta.htAfter);
                  savedSecondary.pos = Number(delta.posAfter);
                  savedSecondary.shielding = Number(delta.shieldAfter);
                  savedSecondary.buffs = JSON.parse(String(delta.buffsAfter));
                  savedSecondary.serializedBundle = String(delta.serializedBundleAfter);
                  this.sql.exec("UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?",
                    Number(delta.hpAfter), Number(delta.htAfter), Number(delta.posAfter), secondaryMobId, this.currentDepth);
                  if (Number(delta.hpAfter) <= 0) {
                    combatLevel.mobs.splice(mobIndex, 1);
                    this.sql.exec("DELETE FROM mobs WHERE mob_id = ? AND depth = ?",
                      secondaryMobId, this.currentDepth);
                  }
                }
                if (secondaryDeathPositions.length > 0) {
                  combatLevel.heaps = secondaryMobPayload.heaps;
                }
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  `levelSnapshot:${this.currentDepth}`, JSON.stringify(combatLevel));
              } else if (!secondaryMobAuthority && secondaryMobPayload != null && secondaryLootValid
                  && data.projectileOutcome === "HEAP" && !secondaryHasDeaths) {
                // Only the exact projectile heap delta is accepted from a non-publisher authority.
                combatLevel.heaps = data.projectileHeaps;
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  `levelSnapshot:${this.currentDepth}`, JSON.stringify(combatLevel));
              }
              this.clearPendingCombat(pending);
              eventType = "PLAYER_ATTACKED";
              actionResultPayload = {
                attackerId, attackerType: "PLAYER", targetId: defenderId, targetType: "PLAYER",
                targetPos: posBefore, targetPosAfter: posAfter, targetHpBefore: hpBefore, targetHtBefore: htBefore,
                targetHp: hpAfter, targetHt: htAfter, targetShieldBefore: shieldBefore, targetShieldAfter: shieldAfter,
                targetBuffsBefore: data.targetBuffsBefore, targetBuffs: data.targetBuffs,
                targetHeroStateJson: mergedState, targetState: newStatus,
                attackerStateJson: mergedAttackerState, attackerState: attackerStatus,
                damage, hit: data.engineHit === true, attackKind: data.attackKind,
                engineDistance: distance, engineActionCost: nativeCost,
                secondaryMobDeltas: secondaryMobPayload,
                secondaryMobResyncRequired: secondaryMobResyncRequired || (data.projectileOutcome === "HEAP" && !secondaryMobAuthority),
                projectileOutcome: data.projectileOutcome,
                projectileResultItemId: data.projectileMutation?.resultItemId,
                engineResolved: true
              };
              actionValid = true; actionCost = nativeCost;
            }
          } else if (actionStr === "SYNC_MOB_STATE" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data || {};
            if (typeof data.combatRequestId === "string" || typeof data.targetEntityId === "string") {
              const combatRequestKey = String(data.combatRequestId || msg.requestId || "");
              const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombat:" + combatRequestKey).toArray()[0];
              try { authorityPending = pendingRow && typeof pendingRow.value === "string" ? JSON.parse(String(pendingRow.value)) : null; } catch (_) { authorityPending = null; }
              pendingCombatForCleanup = authorityPending;
              if (authorityPending && typeof authorityPending.attackerId === "string") actionOwnerId = authorityPending.attackerId;
              const publisherRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
              const levelRow = this.sql.exec("SELECT width,height FROM levels WHERE depth = ?", this.currentDepth).toArray()[0];
              const width = Number(levelRow?.width || 0), height = Number(levelRow?.height || 0), levelSize = width * height;
              const levelSnapshotRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:" + this.currentDepth).toArray()[0];
              let levelSnapshot: any = null;
              try { levelSnapshot = levelSnapshotRow && typeof levelSnapshotRow.value === "string" ? JSON.parse(String(levelSnapshotRow.value)) : null; } catch (_) { levelSnapshot = null; }
              const attackerId = String(authorityPending?.attackerId || "");
              const mobId = resolveServerMobIdByEntityId(levelSnapshot, data.targetEntityId);
              const savedMob = mobId == null ? null : (Array.isArray(levelSnapshot?.mobs) ? levelSnapshot.mobs : []).find((mob: any) => Number(mob?.mobId) === mobId);
              const mobRow = mobId == null ? [] : this.sql.exec("SELECT hp,ht,pos FROM mobs WHERE mob_id = ? AND depth = ?", mobId, this.currentDepth).toArray();
              const attackerRow = attackerId ? this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", attackerId).toArray() : [];
              const attackerPos = Number(attackerRow[0]?.pos), targetPos = Number(mobRow[0]?.pos);
              const targetPosAfter = Number(data.targetPosAfter), targetHp = Number(data.targetHp), targetHt = Number(data.targetHt), damage = Number(data.damage);
              const nativeCost = Number(data.engineActionCost), distance = Number(data.engineDistance), ranged = data.engineRanged === true;
              const secondaryMobPayload = parseAndValidateNativeSecondaryMobDeltas(
                data.secondaryMobDeltas, levelSnapshot?.mobs, levelSize, width, false, String(data.targetEntityId));
              const secondaryDeaths = (secondaryMobPayload?.deltas || []).filter((delta: any) => Number(delta.hpAfter) === 0).map((delta: any) => Number(delta.posAfter));
              const allDeaths = [...(targetHp <= 0 ? [targetPosAfter] : []), ...secondaryDeaths];
              const lootSnapshot = targetHp <= 0 ? data.heaps : secondaryDeaths.length > 0 ? secondaryMobPayload?.heaps : undefined;
              const projectileTargetCell = Number(data.projectileMutation?.targetPos);
              const lootAllowedPositions = data.projectileOutcome === "HEAP"
                ? [...allDeaths, ...(Number.isInteger(projectileTargetCell) ? [projectileTargetCell] : [])]
                : allDeaths;
              const validLoot = secondaryMobPayload != null && (allDeaths.length === 0
                ? data.heaps === undefined && secondaryMobPayload.heaps === undefined
                : isValidNativeLootSnapshot(lootSnapshot, levelSnapshot?.heaps, lootAllowedPositions, levelSize)
                  && (secondaryDeaths.length === 0 || sameNativeItemValue(data.heaps, secondaryMobPayload.heaps)));
              const validProjectileResult = isValidNativeProjectileCombatResult(
                levelSnapshot?.heaps, data, targetPos, allDeaths, levelSize);
              const mergedAttackerState = this.reconcileCombatAttackerState(
                authorityPending, payload.heroStateJson, allDeaths.length > 0);
              const targetBuffPreStateMatches = !!savedMob && hasMatchingNativeBuffSnapshot(data.targetBuffsBefore, savedMob.buffs);
              const targetShieldPreStateMatches = !!savedMob && hasMatchingNativeMobShieldSnapshot(data.targetShieldBefore, data.targetShieldAfter, savedMob.shielding);
              const targetMobBundleValid = targetHp <= 0 || isValidNativeMobBundle(data.targetMobBundleAfter);
              const authorityValid = !!authorityPending && String(authorityPending.requestId) === String(data.combatRequestId)
                && String(authorityPending.authorityId) === session.playerId && String(publisherRow?.value || "") === session.playerId
                && mergedAttackerState !== null
                && authorityPending.targetType === "MOB" && Number(authorityPending.depth) === this.currentDepth
                && attackerId === String(data.attackerId) && String(authorityPending.targetEntityId) === String(data.targetEntityId)
                && Number(authorityPending.attackerPos) === attackerPos && Number(authorityPending.targetPos) === targetPos
                && hasMatchingNativeAttackIntent(data, authorityPending)
                && attackerRow.length > 0 && String(attackerRow[0].state) === "ALIVE"
                && mobRow.length > 0 && Number(mobRow[0].hp) > 0 && !!savedMob
                && Number(data.targetPos) === targetPos && Number(data.targetHpBefore) === Number(mobRow[0].hp)
                && Number(data.targetHtBefore) === Number(mobRow[0].ht) && targetBuffPreStateMatches && targetShieldPreStateMatches
                && hasStrictNativeCombatFields(data) && data.engineResult === true && targetMobBundleValid
                && Number.isFinite(nativeCost) && nativeCost > 0 && nativeCost <= 10 && Number.isFinite(distance)
                && (ranged ? this.hasLineOfSight(attackerPos, targetPos, this.currentDepth) : this.isMeleeAdjacent(attackerPos, targetPos, this.currentDepth))
                && (targetPosAfter === targetPos || (this.isValidCombatTargetPosition(targetPosAfter, this.currentDepth)
                  && this.isCombatDestinationFree(targetPosAfter, this.currentDepth, "MOB", Number(mobId))))
                && isValidNativeMissTransition(data.engineHit, data.targetHpBefore, targetHp, damage, data.targetShieldBefore,
                  data.targetShieldAfter, data.targetBuffsBefore, data.targetBuffs, targetPos, targetPosAfter)
                && validProjectileResult
                && isValidNativeCombatEvent({
                  schemaVersion: data.combatSchemaVersion, depth: data.combatDepth, currentDepth: this.currentDepth,
                  sessionPlayerId: attackerId, attackerId: data.attackerId, attackerPos: data.attackerPos,
                  authoritativeAttackerPos: attackerPos, targetType: "MOB", targetEntityId: data.targetEntityId,
                  expectedTargetEntityId: String(savedMob?.entityId || ""), targetAlive: Number(mobRow[0].hp) > 0,
                  targetPos: data.targetPos, authoritativeTargetPos: targetPos, targetPosAfter, levelSize,
                  targetMoveDistance: Math.max(Math.abs((targetPosAfter % width) - (targetPos % width)), Math.abs(Math.floor(targetPosAfter / width) - Math.floor(targetPos / width))),
                  previousHp: Number(mobRow[0].hp), previousHt: Number(mobRow[0].ht),
                  targetHpBefore: data.targetHpBefore, targetHtBefore: data.targetHtBefore, targetHp, targetHt, damage,
                  hit: data.engineHit, ranged, attackKind: data.attackKind, distance,
                  authoritativeDistance: Math.max(Math.abs((attackerPos % width) - (targetPos % width)), Math.abs(Math.floor(attackerPos / width) - Math.floor(targetPos / width))),
                  actionCost: nativeCost
                }) && validLoot;
              if (authorityValid && Number.isFinite(Number(authorityPending?.createdAt))
                  && Date.now() - Number(authorityPending.createdAt) <= 15000) {
                savedMob.hp = targetHp; savedMob.ht = targetHt; savedMob.pos = targetPosAfter;
                savedMob.shielding = Number(data.targetShieldAfter); savedMob.buffs = JSON.parse(String(data.targetBuffs));
                if (targetHp > 0) savedMob.serializedBundle = String(data.targetMobBundleAfter);
                if (allDeaths.length > 0) levelSnapshot.heaps = lootSnapshot;
                else if (data.projectileOutcome === "HEAP") levelSnapshot.heaps = data.projectileHeaps;
                this.sql.exec("UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?", targetHp, targetHt, targetPosAfter, mobId, this.currentDepth);
                for (const delta of secondaryMobPayload.deltas) {
                  const secondaryId = resolveServerMobIdByEntityId(levelSnapshot, delta.entityId);
                  const secondary = levelSnapshot.mobs.find((mob: any) => Number(mob.mobId) === Number(secondaryId));
                  if (secondaryId == null || !secondary) throw new Error("Validated secondary mob disappeared");
                  secondary.hp = delta.hpAfter; secondary.ht = delta.htAfter; secondary.pos = delta.posAfter;
                  secondary.shielding = delta.shieldAfter; secondary.buffs = JSON.parse(delta.buffsAfter);
                  secondary.serializedBundle = delta.serializedBundleAfter;
                  this.sql.exec("UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?", delta.hpAfter, delta.htAfter, delta.posAfter, secondaryId, this.currentDepth);
                }
                const deadMobEntityIds = [
                  ...(targetHp === 0 ? [String(data.targetEntityId)] : []),
                  ...secondaryMobPayload.deltas.filter((delta: any) => Number(delta.hpAfter) === 0)
                    .map((delta: any) => String(delta.entityId))
                ];
                const deletedMobIds = removeDeadNativeMobsFromSnapshot(levelSnapshot, deadMobEntityIds);
                if (deletedMobIds == null) throw new Error("Validated dead native mob identity disappeared");
                for (const deadMobId of deletedMobIds) {
                  this.sql.exec("DELETE FROM mobs WHERE mob_id = ? AND depth = ?", deadMobId, this.currentDepth);
                }
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  "levelSnapshot:" + this.currentDepth, JSON.stringify(levelSnapshot));
                const attackerAfter = JSON.parse(mergedAttackerState as string);
                const attackerStatus = Number(attackerAfter.hp) > 0 ? "ALIVE"
                  : this.gameMode === "DEATHMATCH" ? "ALIVE"
                    : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
                this.sql.exec("UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?",
                  Number(attackerAfter.hp), Number(attackerAfter.ht), Number(attackerAfter.pos), attackerStatus, String(authorityPending.attackerId));
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  "heroState:" + String(authorityPending.attackerId), mergedAttackerState as string);
                this.clearPendingCombat(authorityPending);
                eventType = "PLAYER_ATTACKED";
                actionResultPayload = {
                  attackerId, attackerType: "PLAYER", targetId: data.targetEntityId, targetType: "MOB",
                  sourceType: "PLAYER", sourceEntityId: attackerId, sourcePos: attackerPos, sourceAttackKind: data.attackKind,
                  attackerPos, targetPos, targetPosAfter, targetHpBefore: Number(data.targetHpBefore), targetHtBefore: Number(data.targetHtBefore),
                  targetShieldBefore: Number(data.targetShieldBefore), targetShieldAfter: Number(data.targetShieldAfter), targetHeroStateJson: null,
                  targetBuffsBefore: data.targetBuffsBefore,
                  targetMobBundleAfter: targetHp > 0 ? String(data.targetMobBundleAfter) : null,
                  hit: data.engineHit === true, damage, targetHp, targetHt,
                  attackKind: data.attackKind, engineDistance: distance, engineActionCost: nativeCost, targetBuffs: data.targetBuffs,
                  attackerStateJson: mergedAttackerState, attackerState: attackerStatus,
                  secondaryMobDeltas: secondaryMobPayload,
                  projectileOutcome: data.projectileOutcome,
                  projectileResultItemId: data.projectileMutation?.resultItemId,
                  engineResolved: true
                };
                actionValid = true; actionCost = nativeCost;
              }
            } else {
            const publisherRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray()[0];
            const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0];
            const levelSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try {
              levelSnapshot = levelSnapshotRow && typeof levelSnapshotRow.value === "string"
                ? JSON.parse(String(levelSnapshotRow.value)) : null;
            } catch (_) { levelSnapshot = null; }
            const width = Number(levelRow?.width || 0), height = Number(levelRow?.height || 0);
            const levelSize = width * height;
            const mobId = resolveServerMobIdByEntityId(levelSnapshot, data.entityId);
            const savedMob = mobId == null ? null
              : (Array.isArray(levelSnapshot?.mobs) ? levelSnapshot.mobs : [])
                  .find((mob: any) => Number(mob?.mobId) === mobId);
            const mobRow = mobId == null ? [] : this.sql.exec(
              `SELECT hp, ht, pos FROM mobs WHERE mob_id = ? AND depth = ?`, mobId, this.currentDepth
            ).toArray();
            const delta = {
              entityId: data.entityId,
              hpBefore: data.hpBefore, htBefore: data.htBefore, posBefore: data.posBefore,
              shieldBefore: data.shieldBefore, buffsBefore: data.buffsBefore,
              hpAfter: data.hpAfter, htAfter: data.htAfter, posAfter: data.posAfter,
              shieldAfter: data.shieldAfter, buffsAfter: data.buffsAfter,
              serializedBundleAfter: data.serializedBundleAfter
            };
            const ownerPayload = parseAndValidateNativeSecondaryMobDeltas({
              complete: true, deltas: [delta], ...(data.heaps === undefined ? {} : { heaps: data.heaps })
            }, levelSnapshot?.mobs, levelSize, width, true);
            const isOwner = isAuthorizedNativeMobOwner(session.playerId, publisherRow?.value);
            const nativeEnvelopeValid = data.combatSchemaVersion === 1
              && Number(data.combatDepth) === this.currentDepth
              && typeof data.sourceClass === "string" && data.sourceClass.length > 0 && data.sourceClass.length <= 256
              && data.engineDamageResult === true && ownerPayload != null
              && isValidNativeMobBundle(data.serializedBundleAfter)
              && !!savedMob && mobRow.length > 0
              && Number(mobRow[0].hp) === Number(data.hpBefore)
              && Number(mobRow[0].ht) === Number(data.htBefore)
              && Number(mobRow[0].pos) === Number(data.posBefore);
            const deadPositions = Number(data.hpAfter) === 0 ? [Number(data.posAfter)] : [];
            const validLoot = deadPositions.length > 0
              ? isValidNativeLootSnapshot(data.heaps, levelSnapshot?.heaps, deadPositions, levelSize)
              : data.heaps === undefined;
            if (isOwner && nativeEnvelopeValid && validLoot) {
              savedMob.hp = Number(data.hpAfter);
              savedMob.ht = Number(data.htAfter);
              savedMob.pos = Number(data.posAfter);
              savedMob.shielding = Number(data.shieldAfter);
              savedMob.buffs = JSON.parse(String(data.buffsAfter));
              if (Number(data.hpAfter) > 0) savedMob.serializedBundle = String(data.serializedBundleAfter);
              if (deadPositions.length > 0) levelSnapshot.heaps = data.heaps;
              if (Number(data.hpAfter) === 0) {
                const deletedMobIds = removeDeadNativeMobsFromSnapshot(levelSnapshot, [String(data.entityId)]);
                if (deletedMobIds == null) throw new Error("Validated dead native mob identity disappeared");
                for (const deadMobId of deletedMobIds) {
                  this.sql.exec(`DELETE FROM mobs WHERE mob_id = ? AND depth = ?`, deadMobId, this.currentDepth);
                }
              } else {
                this.sql.exec(`UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                  savedMob.hp, savedMob.ht, savedMob.pos, mobId, this.currentDepth);
              }
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `levelSnapshot:${this.currentDepth}`, JSON.stringify(levelSnapshot));
              eventType = "CHAR_DAMAGED";
              actionResultPayload = {
                targetId: data.entityId, targetType: "MOB",
                targetHpBefore: Number(data.hpBefore), targetHtBefore: Number(data.htBefore),
                targetHp: Number(data.hpAfter), targetHt: Number(data.htAfter),
                targetPosBefore: Number(data.posBefore), targetPosAfter: Number(data.posAfter),
                targetShieldBefore: Number(data.shieldBefore), targetShieldAfter: Number(data.shieldAfter),
                targetBuffsBefore: data.buffsBefore, targetBuffs: data.buffsAfter,
                targetMobBundleAfter: Number(data.hpAfter) > 0 ? String(data.serializedBundleAfter) : null,
                sourceType: "ENVIRONMENT", sourceClass: data.sourceClass,
                engineResolved: true, ...(deadPositions.length > 0 ? { heaps: data.heaps } : {})
              };
              actionValid = true;
              actionCost = 0;
            }
            }
          } else if (actionStr === "SYNC_HERO_STATE" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data;
            if (data?.sourceType === "BUFF_TICK") {
              const playerRow = this.sql.exec(
                "SELECT pos,hp,ht,state FROM players WHERE player_id = ?", session.playerId
              ).toArray()[0];
              const previousHeroRow = this.sql.exec(
                "SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId
              ).toArray()[0];
              const savedLevelRow = this.sql.exec(
                "SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:" + this.currentDepth
              ).toArray()[0];
              let previousHeroState: any = null, beforeHeroState: any = null;
              let afterHeroState: any = null, levelSnapshot: any = null;
              try {
                previousHeroState = previousHeroRow && typeof previousHeroRow.value === "string"
                  ? JSON.parse(String(previousHeroRow.value)) : null;
                beforeHeroState = typeof data.heroStateBeforeJson === "string"
                  ? JSON.parse(data.heroStateBeforeJson) : null;
                afterHeroState = typeof payload.heroStateJson === "string"
                  ? JSON.parse(payload.heroStateJson) : null;
                levelSnapshot = savedLevelRow && typeof savedLevelRow.value === "string"
                  ? JSON.parse(String(savedLevelRow.value)) : null;
              } catch (_) {
                previousHeroState = null;
                beforeHeroState = null;
                afterHeroState = null;
                levelSnapshot = null;
              }
              const validHeroBuffTick = !!playerRow && !!previousHeroState && !!beforeHeroState && !!afterHeroState
                && String(playerRow.state) === "ALIVE"
                && Number(previousHeroState.hp) === Number(playerRow.hp)
                && Number(previousHeroState.ht) === Number(playerRow.ht)
                && Number(previousHeroState.pos) === Number(playerRow.pos)
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && Number(levelSnapshot.depth) === this.currentDepth
                && Number(levelSnapshot.branch) === 0 && levelSnapshot.locked === false
                && isValidNativeHeroStateJson(payload.heroStateJson, {
                  hp: Number(afterHeroState.hp), ht: Number(playerRow.ht),
                  pos: Number(playerRow.pos), shielding: Number(afterHeroState.shielding)
                })
                && isValidNativeHeroBuffTick(previousHeroRow.value, data.heroStateBeforeJson,
                  payload.heroStateJson, data);
              if (validHeroBuffTick) {
                const storedHeroState = String(payload.heroStateJson);
                this.sql.exec("UPDATE players SET hp = ? WHERE player_id = ?",
                  Number(afterHeroState.hp), session.playerId);
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  "heroState:" + session.playerId, storedHeroState);
                eventType = "HERO_BUFF_TICKED";
                actionResultPayload = {
                  playerId: session.playerId, sourceType: "BUFF_TICK",
                  buffClass: String(data.buffClass), buffId: Number(data.buffId),
                  targetHp: Number(afterHeroState.hp), targetShielding: Number(afterHeroState.shielding),
                  targetHeroStateJson: storedHeroState
                };
                actionValid = true;
                actionCost = 0;
              }
            } else if (data?.sourceType === "ENVIRONMENT") {
              const playerRow = this.sql.exec(
                `SELECT pos, hp, ht, state FROM players WHERE player_id = ?`, session.playerId
              ).toArray()[0];
              const previousHeroRow = this.sql.exec(
                `SELECT value FROM room_meta WHERE key = ?`, `heroState:${session.playerId}`
              ).toArray()[0];
              let previousHeroState: any = null;
              try {
                previousHeroState = previousHeroRow && typeof previousHeroRow.value === "string"
                  ? JSON.parse(String(previousHeroRow.value)) : null;
              } catch (_) { previousHeroState = null; }
              const levelRow = this.sql.exec(
                `SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth
              ).toArray()[0];
              const levelSize = Number(levelRow?.width || 0) * Number(levelRow?.height || 0);
              const hp = Number(data?.targetHp), ht = Number(data?.targetHt);
              const pos = Number(data?.targetPosAfter), shield = Number(data?.targetShieldAfter);
              const mergedJson = mergeNativeHeroState(previousHeroRow?.value, payload.heroStateJson,
                { hp, ht, pos, shielding: shield }, data?.targetBuffs);
              const validEnvironmentDamage = !!playerRow && previousHeroState != null
                && isValidNativeEnvironmentDamage(data, {
                  ...playerRow, levelSize, levelWidth: Number(levelRow?.width || 0),
                  heroState: previousHeroState, shielding: previousHeroState.shielding
                })
                && Number(previousHeroState.hp) === Number(playerRow.hp)
                && Number(previousHeroState.ht) === Number(playerRow.ht)
                && Number(previousHeroState.pos) === Number(playerRow.pos)
                && Number(previousHeroState.shielding) === Number(data.targetShieldBefore)
                && isValidNativeHeroStateJson(payload.heroStateJson, { hp, ht, pos, shielding: shield })
                && isValidNativeCombatBuffs(data?.targetBuffs)
                && mergedJson != null
                && (pos === Number(playerRow.pos)
                  || (this.isValidCombatTargetPosition(pos, this.currentDepth)
                    && this.isCombatDestinationFree(pos, this.currentDepth, "PLAYER", session.playerId)));
              if (validEnvironmentDamage) {
                const oldState = String(playerRow.state);
                const newState = hp > 0 ? "ALIVE"
                  : this.gameMode === "DEATHMATCH" ? "ALIVE"
                    : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
                const mergedState = JSON.parse(mergedJson as string);
                const storedHeroState = JSON.stringify(mergedState);
                this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?`,
                  hp, ht, pos, newState, session.playerId);
                this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                  `heroState:${session.playerId}`, storedHeroState);
                if (oldState === "ALIVE" && newState === "DEAD") {
                  this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, session.playerId);
                }
                eventType = "PLAYER_DAMAGED";
                actionResultPayload = { playerId: session.playerId, targetId: session.playerId, targetType: "PLAYER",
                  sourceType: "ENVIRONMENT", sourceClass: data.sourceClass,
                  targetHpBefore: Number(data.targetHpBefore), targetHtBefore: Number(data.targetHtBefore),
                  targetHp: hp, targetHt: ht, targetPos: Number(data.targetPosBefore), targetPosAfter: pos,
                  targetShieldBefore: Number(data.targetShieldBefore), targetShieldAfter: shield,
                  targetBuffsBefore: data.targetBuffsBefore, targetBuffs: data.targetBuffs,
                  targetHeroStateJson: storedHeroState, targetState: newState, damage: Number(data.damage),
                  effectiveDamage: Number(data.effectiveDamage), engineResolved: true };
                actionValid = true;
                actionCost = 0;
              }
            } else {
            const hp = data?.targetHp;
            const ht = data?.targetHt;
            const damage = data?.damage;
            const targetPosBefore = data?.targetPosBefore;
            const targetPosAfter = data?.targetPosAfter;
            const targetShieldBefore = data?.targetShieldBefore;
            const targetShieldAfter = data?.targetShieldAfter;
            const damageTargetId = typeof data?.targetPlayerId === "string"
              && data.targetPlayerId.length > 0 && data.targetPlayerId.length <= 80 ? data.targetPlayerId : null;
            const playerRow = damageTargetId == null ? null : this.sql.exec(
              `SELECT pos, hp, ht, state FROM players WHERE player_id = ?`, damageTargetId).toArray()[0];
            const previousHeroRow = damageTargetId == null ? null : this.sql.exec(
              `SELECT value FROM room_meta WHERE key = ?`, `heroState:${damageTargetId}`).toArray()[0];
            let previousHeroState: any = null;
            try {
              previousHeroState = previousHeroRow && typeof previousHeroRow.value === "string"
                ? JSON.parse(String(previousHeroRow.value)) : null;
            } catch (_) { previousHeroState = null; }
            const sourceLevelRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let sourceLevel: any = null;
            try {
              sourceLevel = sourceLevelRow && typeof sourceLevelRow.value === "string"
                ? JSON.parse(String(sourceLevelRow.value)) : null;
            } catch (_) { sourceLevel = null; }
            const sourceMobId = resolveServerMobIdByEntityId(sourceLevel, data?.sourceEntityId);
            const sourceMob = sourceMobId == null ? [] : this.sql.exec(
              `SELECT pos, hp, ht FROM mobs WHERE mob_id = ? AND depth = ?`, sourceMobId, this.currentDepth
            ).toArray();
            const mobPublisherRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
            const sourceMobAuthority = isAuthorizedNativeMobOwner(session.playerId, String(mobPublisherRow?.value || ""));
            const authorizedDamageTarget = resolveAuthorizedNativeMobDamageTarget(
              session.playerId, String(mobPublisherRow?.value || ""), data?.targetPlayerId);
            const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0];
            const width = Number(levelRow?.width || 0), height = Number(levelRow?.height || 0);
            const levelSize = width * height;
            const sourcePos = Number(data?.sourcePos);
            const sourceDistance = playerRow && width > 0
              ? Math.max(Math.abs((sourcePos % width) - (Number(targetPosBefore) % width)),
                  Math.abs(Math.floor(sourcePos / width) - Math.floor(Number(targetPosBefore) / width)))
              : Number.POSITIVE_INFINITY;
            const targetMoveDistance = playerRow && width > 0
              ? Math.max(Math.abs((Number(targetPosAfter) % width) - (Number(targetPosBefore) % width)),
                  Math.abs(Math.floor(Number(targetPosAfter) / width) - Math.floor(Number(targetPosBefore) / width)))
              : Number.POSITIVE_INFINITY;
            const sourceMobHpBefore = Number(data?.sourceMobHpBefore);
            const sourceMobHtBefore = Number(data?.sourceMobHtBefore);
            const sourceMobHpAfter = Number(data?.sourceMobHpAfter);
            const sourceMobHtAfter = Number(data?.sourceMobHtAfter);
            const sourceMobShieldBefore = Number(data?.sourceMobShieldBefore);
            const sourceMobShieldAfter = Number(data?.sourceMobShieldAfter);
            const sourceMobPosBefore = Number(data?.sourceMobPosBefore);
            const sourceMobPosAfter = Number(data?.sourceMobPosAfter);
            const sourceMobMoveDistance = width > 0
              ? Math.max(Math.abs((sourceMobPosAfter % width) - (sourceMobPosBefore % width)),
                  Math.abs(Math.floor(sourceMobPosAfter / width) - Math.floor(sourceMobPosBefore / width)))
              : Number.POSITIVE_INFINITY;
            const sourceMobDestinationValid = Number.isInteger(sourceMobPosAfter) && sourceMobPosAfter >= 0
              && sourceMobPosAfter < levelSize && sourceMobMoveDistance <= 8
              && (sourceMobPosAfter === sourceMobPosBefore || (this.isValidCombatTargetPosition(sourceMobPosAfter, this.currentDepth)
                && this.isCombatDestinationFree(sourceMobPosAfter, this.currentDepth, "MOB", Number(sourceMobId))));
            let sourceMobBuffsBeforeParsed: any = null, sourceMobBuffsAfterParsed: any = null;
            try {
              sourceMobBuffsBeforeParsed = JSON.parse(String(data?.sourceMobBuffsBefore));
              sourceMobBuffsAfterParsed = JSON.parse(String(data?.sourceMobBuffs));
            } catch (_) { sourceMobBuffsBeforeParsed = null; sourceMobBuffsAfterParsed = null; }
            const sourceMobBuffsChanged = comparableBuffs(sourceMobBuffsBeforeParsed) !== comparableBuffs(sourceMobBuffsAfterParsed);
            let targetBuffsBeforeParsed: any = null, targetBuffsAfterParsed: any = null;
            try {
              targetBuffsBeforeParsed = JSON.parse(String(data?.targetBuffsBefore));
              targetBuffsAfterParsed = JSON.parse(String(data?.targetBuffs));
            } catch (_) { targetBuffsBeforeParsed = null; targetBuffsAfterParsed = null; }
            const targetBuffsChanged = comparableBuffs(targetBuffsBeforeParsed) !== comparableBuffs(targetBuffsAfterParsed);
            const targetHeroCombatChanged = Number(hp) !== Number(playerRow?.hp)
              || damage > 0 || targetShieldAfter < targetShieldBefore
              || Number(targetPosAfter) !== Number(targetPosBefore) || targetBuffsChanged;
            const sourceMobReportedChanged = sourceMobHpAfter !== sourceMobHpBefore
              || sourceMobShieldAfter !== sourceMobShieldBefore || sourceMobPosAfter !== sourceMobPosBefore
              || sourceMobBuffsChanged || sourceMobHpAfter <= 0;
            const savedSourceMobBefore = Array.isArray(sourceLevel?.mobs)
              ? sourceLevel.mobs.find((mob: any) => Number(mob?.mobId) === Number(sourceMobId)) : null;
            const sourceMobPreStateMatchesSnapshot = !!savedSourceMobBefore
              && Number(savedSourceMobBefore.hp) === sourceMobHpBefore
              && Number(savedSourceMobBefore.ht) === sourceMobHtBefore
              && hasMatchingNativeMobShieldSnapshot(data?.sourceMobShieldBefore,
                data?.sourceMobShieldAfter, savedSourceMobBefore.shielding)
              && Number(savedSourceMobBefore.pos) === sourceMobPosBefore
              && hasMatchingNativeBuffSnapshot(sourceMobBuffsBeforeParsed, savedSourceMobBefore.buffs);
            const sourceMobLootValid = sourceMobHpAfter > 0
              ? data?.heaps === undefined
              : isValidNativeLootSnapshot(data?.heaps, sourceLevel?.heaps, sourceMobPosAfter, levelSize);
            const sourceMobStateValid = hasStrictNativeSourceMobState(data)
              && isValidNativeCombatBuffs(data?.sourceMobBuffsBefore)
              && sourceMob.length > 0 && sourceMobHpBefore === Number(sourceMob[0].hp)
              && sourceMobHtBefore === Number(sourceMob[0].ht) && sourceMobPosBefore === sourcePos
              && sourceMobPreStateMatchesSnapshot
              && sourceMobHpAfter >= 0 && sourceMobHpAfter <= sourceMobHpBefore
              && sourceMobHtAfter === sourceMobHtBefore
              && isValidNativeHpTransition(sourceMobHpBefore, sourceMobHpAfter, Number(data.sourceMobDamage))
              && sourceMobDestinationValid && sourceMobLootValid
              && isValidNativeCombatBuffs(data.sourceMobBuffs)
              && isValidNativeMobBundle(data.sourceMobBundleAfter);
            const newHeroStateValid = isValidNativeHeroStateJson(payload.heroStateJson, {
              hp: Number(hp), ht: Number(ht), pos: Number(targetPosAfter), shielding: Number(targetShieldAfter)
            });
            const reportedDamagedHeroState = (() => {
              try { return typeof payload.heroStateJson === "string" ? JSON.parse(payload.heroStateJson) : null; }
              catch (_) { return null; }
            })();
            const ankhRescue = previousHeroState != null
              && hasValidBlessedAnkhConsumption(previousHeroRow?.value, payload.heroStateJson)
              && Number(data?.ankhCountBefore) === Number(previousHeroState.ankhCount)
              && Number(data?.ankhCountAfter) === Number(reportedDamagedHeroState?.ankhCount)
              && Number(data?.blessedAnkhCountBefore) === Number(previousHeroState.blessedAnkhCount)
              && Number(data?.blessedAnkhCountAfter) === Number(reportedDamagedHeroState?.blessedAnkhCount)
              && Number(hp) === Math.floor(Number(ht) / 4) && Number(hp) > 0
              && Number(data?.damage) === 0;
            const mergedDamagedHeroStateJson = mergeNativeHeroState(previousHeroRow?.value,
              payload.heroStateJson,
              { hp: Number(hp), ht: Number(ht), pos: Number(targetPosAfter), shielding: Number(targetShieldAfter) },
              data?.targetBuffs, ankhRescue);
            const geometryValid = data?.sourceAttackKind === (sourceDistance <= 1 ? "MELEE" : "RANGED")
              && (sourceDistance <= 1
                ? this.isMeleeAdjacent(sourcePos, Number(targetPosBefore), this.currentDepth)
                : sourceDistance <= 8 && this.hasLineOfSight(sourcePos, Number(targetPosBefore), this.currentDepth));
            const targetPosValid = Number.isInteger(targetPosAfter) && targetPosAfter >= 0 && targetPosAfter < levelSize
              && targetMoveDistance <= 8
              && (targetPosAfter === targetPosBefore || (this.isValidCombatTargetPosition(Number(targetPosAfter), this.currentDepth)
                && this.isCombatDestinationFree(Number(targetPosAfter), this.currentDepth, "PLAYER", damageTargetId)));
            const previousHp = Number(playerRow?.hp);
            const previousHt = Number(playerRow?.ht);
            const noEffectOutcomeValid = isValidNativeMobNoEffectOutcome(data, {
              hp: Number(playerRow?.hp), ht: Number(playerRow?.ht), pos: Number(playerRow?.pos),
              shielding: Number(previousHeroState?.shielding)
            });
            const validDamage = damageTargetId != null && authorizedDamageTarget === damageTargetId
              && !!playerRow && String(playerRow.state) === "ALIVE" && sourceMobAuthority
              && hasStrictNativeDamageFields(data) && data.targetPlayerId === damageTargetId
              && hasMatchingNativeHeroBuffSnapshot(data.targetBuffsBefore, previousHeroState)
              && data.combatDepth === this.currentDepth
              && Number.isInteger(hp) && Number.isInteger(ht) && Number.isInteger(damage)
              && Number.isInteger(targetPosBefore) && targetPosBefore === Number(playerRow.pos)
              && Number.isInteger(targetPosAfter) && Number.isInteger(targetShieldBefore) && Number.isInteger(targetShieldAfter)
              && (previousHeroState == null || !Number.isInteger(previousHeroState?.shielding)
                || targetShieldBefore === previousHeroState.shielding)
              && targetShieldBefore >= 0 && targetShieldBefore <= 100000
              && targetShieldAfter >= 0 && targetShieldAfter <= 100000
              && hp >= 0 && (ankhRescue || hp <= previousHp) && ht === previousHt
              && data.targetHpBefore === previousHp && data.targetHtBefore === previousHt
              && (ankhRescue
                ? hp > 0 && hp === Math.floor(ht / 4) && damage === 0
                : isValidNativeHpTransition(previousHp, hp, damage))
              && (ankhRescue || isValidNativeDamageAccounting(
                previousHp, targetShieldBefore, hp, targetShieldAfter, data.effectiveDamage))
              && (targetHeroCombatChanged || sourceMobReportedChanged || noEffectOutcomeValid)
              && newHeroStateValid && mergedDamagedHeroStateJson != null
              && isValidNativeCombatBuffs(data.targetBuffs)
              && sourceMob.length > 0 && Number(sourceMob[0].hp) > 0
              && Number(sourceMob[0].pos) === sourcePos && sourceMobPreStateMatchesSnapshot
              && geometryValid && targetPosValid
              && sourceMobAuthority && sourceMobStateValid;
            if (validDamage) {
              const oldState = String(playerRow.state);
              const newState = hp === 0
                ? (this.gameMode === "DEATHMATCH" ? "ALIVE" : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD")
                : "ALIVE";
              this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?`,
                hp, ht, targetPosAfter, newState, damageTargetId);
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `heroState:${damageTargetId}`, mergedDamagedHeroStateJson);
              const savedSourceMob = (Array.isArray(sourceLevel?.mobs) ? sourceLevel.mobs : [])
                .find((mob: any) => Number(mob?.mobId) === Number(sourceMobId));
              if (!savedSourceMob) throw new Error("Accepted source mob missing from native snapshot");
              const committedSourceMobHp = sourceMobAuthority ? sourceMobHpAfter : Number(savedSourceMob.hp);
              const committedSourceMobHt = sourceMobAuthority ? sourceMobHtAfter : Number(savedSourceMob.ht);
              const committedSourceMobShield = sourceMobAuthority ? Number(data.sourceMobShieldAfter) : Number(savedSourceMob.shielding);
              const committedSourceMobPos = sourceMobAuthority ? sourceMobPosAfter : Number(savedSourceMob.pos);
              const committedSourceMobBuffs = sourceMobAuthority ? data.sourceMobBuffs : JSON.stringify(savedSourceMob.buffs);
              if (sourceMobAuthority) {
                savedSourceMob.hp = committedSourceMobHp;
                savedSourceMob.ht = committedSourceMobHt;
                savedSourceMob.shielding = committedSourceMobShield;
                savedSourceMob.pos = committedSourceMobPos;
                savedSourceMob.buffs = JSON.parse(String(committedSourceMobBuffs));
                if (committedSourceMobHp > 0) {
                  savedSourceMob.serializedBundle = String(data.sourceMobBundleAfter);
                  this.sql.exec(`UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                    committedSourceMobHp, committedSourceMobHt, committedSourceMobPos, sourceMobId, this.currentDepth);
                } else {
                  sourceLevel.heaps = data.heaps;
                  const deletedMobIds = removeDeadNativeMobsFromSnapshot(sourceLevel, [String(data.sourceEntityId)]);
                  if (deletedMobIds == null) throw new Error("Validated dead source mob identity disappeared");
                  for (const deadMobId of deletedMobIds) {
                    this.sql.exec(`DELETE FROM mobs WHERE mob_id = ? AND depth = ?`, deadMobId, this.currentDepth);
                  }
                }
                this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                  `levelSnapshot:${this.currentDepth}`, JSON.stringify(sourceLevel));
              }
              if (oldState !== "DEAD" && oldState !== "SPECTATOR" && (newState === "DEAD" || newState === "SPECTATOR")) {
                this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, damageTargetId);
              }
              eventType = "PLAYER_DAMAGED";
              actionResultPayload = {
                attackerId: data.sourceEntityId, attackerType: "MOB", attackerPos: sourcePos,
                sourceType: "MOB", sourceEntityId: data.sourceEntityId, sourcePos,
                sourceAttackKind: data.sourceAttackKind, attackKind: data.sourceAttackKind,
                engineDistance: sourceDistance, engineActionCost: data.sourceActionCost,
                targetId: damageTargetId, targetPlayerId: damageTargetId, targetType: "PLAYER",
                targetHpBefore: previousHp, targetHtBefore: previousHt, targetHp: hp, targetHt: ht,
                targetPos: targetPosBefore, targetPosAfter, targetShieldBefore, targetShieldAfter,
                targetState: newState, hit: data.engineHit === true, engineHit: data.engineHit === true,
                ankhCountBefore: data.ankhCountBefore, ankhCountAfter: data.ankhCountAfter,
                blessedAnkhCountBefore: data.blessedAnkhCountBefore, blessedAnkhCountAfter: data.blessedAnkhCountAfter,
                damage, effectiveDamage: Number(data.effectiveDamage) || damage,
                targetBuffsBefore: data.targetBuffsBefore, targetBuffs: data.targetBuffs,
                targetHeroStateJson: mergedDamagedHeroStateJson,
                sourceMobHpBefore, sourceMobHtBefore, sourceMobShieldBefore: Number(data.sourceMobShieldBefore),
                sourceMobHpAfter: committedSourceMobHp, sourceMobHtAfter: committedSourceMobHt,
                sourceMobShieldAfter: committedSourceMobShield,
                sourceMobPosBefore, sourceMobPosAfter: committedSourceMobPos,
                sourceMobDamage: sourceMobAuthority ? Number(data.sourceMobDamage) : 0,
                sourceMobBuffsBefore: data.sourceMobBuffsBefore, sourceMobBuffs: committedSourceMobBuffs,
                sourceMobBundleAfter: sourceMobAuthority && committedSourceMobHp > 0 ? String(data.sourceMobBundleAfter) : null,
                sourceMobResyncRequired: !sourceMobAuthority && sourceMobReportedChanged,
                ...(sourceMobAuthority && committedSourceMobHp <= 0 ? { heaps: data.heaps } : {}),
                attackerStateJson: null, engineResolved: true
              };
              actionValid = true;
              actionCost = 0;
            }
            }
          } else if (actionStr === "REVIVE" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data || {};
            const playerRow = this.sql.exec(
              `SELECT pos, hp, ht, state FROM players WHERE player_id = ?`, session.playerId
            ).toArray()[0];
            const previousHeroRow = this.sql.exec(
              `SELECT value FROM room_meta WHERE key = ?`, `heroState:${session.playerId}`
            ).toArray()[0];
            let previousHeroState: any = null, reportedHeroState: any = null;
            try {
              previousHeroState = previousHeroRow && typeof previousHeroRow.value === "string"
                ? JSON.parse(String(previousHeroRow.value)) : null;
              reportedHeroState = typeof payload.heroStateJson === "string"
                ? JSON.parse(payload.heroStateJson) : null;
            } catch (_) { previousHeroState = null; reportedHeroState = null; }
            const hp = Number(data.targetHp), ht = Number(data.targetHt), pos = Number(data.targetPosAfter);
            const hpBefore = Number(data.targetHpBefore), htBefore = Number(data.targetHtBefore);
            const posBefore = Number(data.targetPosBefore);
            const shieldBefore = Number(data.targetShieldBefore), shieldAfter = Number(data.targetShieldAfter);
            const targetBuffs = data.targetBuffs;
            const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0];
            const levelSize = Number(levelRow?.width || 0) * Number(levelRow?.height || 0);
            const levelSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try {
              levelSnapshot = levelSnapshotRow && typeof levelSnapshotRow.value === "string"
                ? JSON.parse(String(levelSnapshotRow.value)) : null;
            } catch (_) { levelSnapshot = null; }

            const commonStateValid = !!playerRow && previousHeroState != null && reportedHeroState != null
              && Number(data.combatDepth) === this.currentDepth
              && Number.isInteger(hp) && hp > 0 && Number.isInteger(ht) && ht > 0
              && Number.isInteger(pos) && pos >= 0 && pos < levelSize
              && Number.isInteger(shieldBefore) && shieldBefore >= 0 && shieldBefore <= 100000
              && Number.isInteger(shieldAfter) && shieldAfter >= 0 && shieldAfter <= 100000
              && Number.isInteger(hpBefore) && Number.isInteger(htBefore) && Number.isInteger(posBefore)
              && htBefore === Number(playerRow.ht) && posBefore === Number(playerRow.pos)
              && Number(previousHeroState.ht) === Number(playerRow.ht)
              && Number(previousHeroState.pos) === Number(playerRow.pos)
              && Number(previousHeroState.shielding) === shieldBefore
              && hasMatchingNativeHeroBuffSnapshot(data.targetBuffsBefore, previousHeroState)
              && isValidNativeCombatBuffs(targetBuffs)
              && isValidNativeHeroStateJson(payload.heroStateJson, { hp, ht, pos, shielding: shieldAfter });

            const blessedRevival = commonStateValid && String(playerRow.state) === "ALIVE"
              && hpBefore === Number(playerRow.hp) && Number(previousHeroState.hp) === Number(playerRow.hp)
              && hp === Math.floor(ht / 4) && pos === Number(playerRow.pos)
              && hasValidBlessedAnkhConsumption(previousHeroRow?.value, payload.heroStateJson)
              && Number(data.ankhCountBefore) === Number(previousHeroState.ankhCount)
              && Number(data.ankhCountAfter) === Number(reportedHeroState?.ankhCount)
              && Number(data.blessedAnkhCountBefore) === Number(previousHeroState.blessedAnkhCount)
              && Number(data.blessedAnkhCountAfter) === Number(reportedHeroState?.blessedAnkhCount);

            const unblessedRevival = data.revivalKind === "UNBLESSED_ANKH"
              && data.levelWasLocked !== true
              && commonStateValid && String(playerRow.state) === "DEAD"
              && Number(playerRow.hp) === 0 && Number(previousHeroState.hp) === 0 && hpBefore === 0
              && hp === ht && Number(data.ankhCountBefore) === Number(previousHeroState.ankhCount)
              && Number(data.ankhCountAfter) === Number(reportedHeroState?.ankhCount)
              && Number(data.blessedAnkhCountBefore) === Number(previousHeroState.blessedAnkhCount)
              && Number(data.blessedAnkhCountAfter) === Number(reportedHeroState?.blessedAnkhCount)
              && hasValidUnblessedAnkhConsumption(previousHeroRow?.value, payload.heroStateJson)
              && this.isValidCombatTargetPosition(pos, this.currentDepth)
              && this.isCombatDestinationFree(pos, this.currentDepth, "PLAYER", session.playerId)
              && levelSnapshot != null && isValidNativeLootSnapshot(
                data.heaps, levelSnapshot.heaps, posBefore, levelSize
              ) && hasOnlyNativeLostBackpackAdded(data.heaps, levelSnapshot.heaps, posBefore);

            const mergedJson = (blessedRevival || unblessedRevival)
              ? mergeNativeHeroState(previousHeroRow?.value, payload.heroStateJson,
                { hp, ht, pos, shielding: shieldAfter }, targetBuffs, blessedRevival, false, false)
              : null;
            const validRevival = (blessedRevival || unblessedRevival) && mergedJson != null;
            if (validRevival) {
              const merged: any = JSON.parse(mergedJson as string);
              merged.inventoryBundle = reportedHeroState.inventoryBundle;
              merged.ankhCount = reportedHeroState.ankhCount;
              merged.blessedAnkhCount = reportedHeroState.blessedAnkhCount;
              merged.cooldown = reportedHeroState.cooldown;
              const storedHeroState = JSON.stringify(merged);
              this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = 'ALIVE' WHERE player_id = ?`,
                hp, ht, pos, session.playerId);
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `heroState:${session.playerId}`, storedHeroState);
              if (unblessedRevival) {
                levelSnapshot.heaps = data.heaps;
                this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                  `levelSnapshot:${this.currentDepth}`, JSON.stringify(levelSnapshot));
              }
              eventType = "PLAYER_REVIVED";
              actionResultPayload = {
                playerId: session.playerId, hp, ht, pos, shielding: shieldAfter,
                targetBuffs, heroStateJson: storedHeroState,
                ankhCount: reportedHeroState.ankhCount,
                blessedAnkhCount: reportedHeroState.blessedAnkhCount,
                revivalKind: unblessedRevival ? "UNBLESSED_ANKH" : "BLESSED_ANKH",
                ...(unblessedRevival ? { heaps: data.heaps } : {})
              };
              actionValid = true;
              actionCost = 0;
            }
          } else if (["UNLOCK", "MINE", "INTERACT", "OPEN_CHEST"].includes(String(actionStr))) {
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray();
            const data = payload.data || {};
            const saved = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
              "levelSnapshot:" + this.currentDepth).toArray()[0];
            let currentLevel: any = null;
            try { currentLevel = saved ? JSON.parse(String(saved.value)) : null; } catch (_) {}
            const pendingTransition = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            const playerPos = Number(playerRow[0]?.pos);
            const requestedCost = data.engineActionCost;
            if (!pendingTransition && playerRow.length > 0 && String(playerRow[0].state) === "ALIVE"
                && currentLevel?.branch === 0
                && isValidNativeWorldActionIntent(actionStr, data, currentLevel, this.currentDepth, playerPos)
                && typeof requestedCost === "number" && Number.isFinite(requestedCost)
                && requestedCost >= 0 && requestedCost <= 10) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId: session.playerId, actionType: String(actionStr),
                depth: this.currentDepth, from: playerPos, targetPos: Number(data.targetPos),
                targetTerrain: Number(currentLevel.tiles.find((tile: any) => tile.pos === Number(data.targetPos))?.terrain),
                ...(actionStr === "MINE" ? { sourceTerrain: Number(data.sourceTerrain) } : {}) };
              actionValid = true;
              actionCost = requestedCost;
            } else if (String(actionStr) === "MINE" && currentLevel && currentLevel.branch !== 0) {
              actionErrorCode = "UNSUPPORTED_BRANCH_TRANSITION";
            }
          } else if (actionStr === "MOVE" && targetPos >= 0) {
            const playerRow = this.sql.exec(`SELECT pos, state FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0 && String(playerRow[0].state) === "ALIVE") {
              const currentPos = Number(playerRow[0].pos);
              const data = payload.data || {};
              const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray();
              const mapWidth = Number(levelRow[0]?.width) || 0;
              const mapHeight = Number(levelRow[0]?.height) || 0;
              const levelSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                `levelSnapshot:${this.currentDepth}`).toArray()[0];
              let currentLevelSnapshot: any = null;
              try { currentLevelSnapshot = levelSnapshotRow ? JSON.parse(String(levelSnapshotRow.value)) : null; } catch (_) {}
              const tileRows = Array.isArray(currentLevelSnapshot?.tiles) ? currentLevelSnapshot.tiles.map((tile: any) => ({
                pos: Number(tile.pos), terrain: Number(tile.terrain), passable: tile.passable === true,
                solid: tile.solid === true, pit: tile.pit === true, avoid: tile.avoid === true
              })) : [];
              const occupiedPlayers = this.sql.exec(
                `SELECT pos FROM players WHERE player_id <> ? AND state = 'ALIVE'`, session.playerId
              ).toArray().map((row: any) => Number(row.pos));
              const occupiedMobs = this.sql.exec(
                `SELECT pos FROM mobs WHERE depth = ? AND hp > 0`, this.currentDepth
              ).toArray().map((row: any) => Number(row.pos));
              const trustedHeroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
              let trustedHero: any = null;
              try { trustedHero = trustedHeroRow && typeof trustedHeroRow.value === "string"
                ? JSON.parse(String(trustedHeroRow.value)) : null; } catch (_) {}
              let environmentStepConfirmed = false;
              if (currentPos === targetPos && data.from !== currentPos) {
                const lastDamage = this.sql.exec("SELECT payload FROM events WHERE sender_id = ? AND event_type = 'PLAYER_DAMAGED' ORDER BY sequence DESC LIMIT 1",
                  session.playerId).toArray()[0];
                let payloadBeforeMove: any = null;
                try { payloadBeforeMove = lastDamage ? JSON.parse(String(lastDamage.payload)) : null; } catch (_) {}
                environmentStepConfirmed = !!payloadBeforeMove
                  && Number(payloadBeforeMove.targetPos) === Number(data.from)
                  && Number(payloadBeforeMove.targetPosAfter) === Number(data.to);
              }
              const acceptedFrom = data.from === currentPos || environmentStepConfirmed;
              const requestedCost = data.engineActionCost;
              const rootBlocked = !!trustedHero
                && (trustedHero.rooted === true || Number(trustedHero.paralysed || 0) > 0);
              const validStep = currentLevelSnapshot && data.depth === this.currentDepth
                && Number.isInteger(data.from) && Number.isInteger(data.to)
                && isValidNativeMoveIntent(data.from, data.to, mapWidth, mapHeight, tileRows,
                  occupiedPlayers.concat(occupiedMobs));
              if (!this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length
                  && playerRow.length > 0 && String(playerRow[0].state) === "ALIVE" && !rootBlocked
                  && acceptedFrom && validStep && typeof requestedCost === "number"
                  && Number.isFinite(requestedCost) && requestedCost >= 0 && requestedCost <= 10) {
                  // This is only an accepted intent. Do not expose/commit the destination until the
                // native mutation snapshot has passed complete terrain, occupancy and Hero validation.
                eventType = "MOVE_INTENT_ACCEPTED";
                actionResultPayload = { playerId: session.playerId, pos: targetPos, from: data.from,
                  to: targetPos, depth: this.currentDepth, environmentStepConfirmed };
                actionValid = true;
                actionCost = requestedCost;
              }
            }
          } else if (actionStr === "LVL_TRANSITION") {
            const playerRow = this.sql.exec(`SELECT pos, state FROM players WHERE player_id = ?`, session.playerId).toArray();
            const pendingRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'transitionPending'`).toArray();
            const publisherRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray();
            const sourceSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let sourceSnapshot: any = null;
            try { sourceSnapshot = sourceSnapshotRow ? JSON.parse(String(sourceSnapshotRow.value)) : null; } catch (_) {}
            const activePublisher = publisherRow.length > 0
              && this.sql.exec(`SELECT player_id FROM players WHERE player_id = ? AND connected = 1`, String(publisherRow[0]?.value)).toArray().length > 0;
            const transitionData = payload.data || {};
            if (canStartNativeFloorTransition(pendingRow.length > 0, playerRow[0]?.state, activePublisher)) {
              const currentPos = Number(playerRow[0].pos);
              const transition = resolveNativeTransitionIntent(sourceSnapshot, this.currentDepth, currentPos, transitionData);
              if (transition) {
                const pending = { ...transition, initiatorId: session.playerId,
                  publisherId: String(publisherRow[0].value), snapshotReady: false, startedAt: Date.now() };
                this.sql.exec(`INSERT INTO room_meta (key,value) VALUES ('transitionPending',?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`, JSON.stringify(pending));
                this.sql.exec(`DELETE FROM room_meta WHERE key LIKE 'transitionReady:%'`);
                this.state.storage.setAlarm(Date.now() + 30000).catch(() => {});
                // Keep the room on its source depth while the transition barrier is pending.
                // The destination becomes authoritative only in tryFinalizeLevelTransition().
                eventType = "LEVEL_TRANSITION";
                actionResultPayload = { ...transition, playerId: session.playerId };
                actionValid = true;
                actionCost = 1.0;
              } else {
                actionErrorCode = classifyNativeTransitionRejection(sourceSnapshot, this.currentDepth, currentPos, transitionData);
              }
            } else {
              actionErrorCode = classifyNativeTransitionRejection(sourceSnapshot, this.currentDepth,
                Number(playerRow[0]?.pos), transitionData);
            }
          } else if (actionStr === "ATTACK" && isValidNativeCombatRequestId(msg.requestId)) {
            let targetId = payload.data?.targetId || payload.targetId;
            const targetType = payload.data?.targetType || payload.targetType || "MOB";
            if (!["MOB", "PLAYER"].includes(String(targetType)) || !isValidNativeAttackIntent(payload.data)) {
              ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                requestId: msg.requestId, sequence: this.currentSequence,
                payloadJson: JSON.stringify({ error: "INVALID_NATIVE_ATTACK_INTENT" }) }));
              return;
            }
            if (payload.data.attackWeaponMode === "THROWN" || payload.data.projectileMutation != null) {
              const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
              const trustedHeroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
                "heroState:" + session.playerId).toArray()[0];
              const levelRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
                "levelSnapshot:" + this.currentDepth).toArray()[0];
              let levelSnapshot: any = null;
              try { levelSnapshot = levelRow && typeof levelRow.value === "string" ? JSON.parse(String(levelRow.value)) : null; } catch (_) {}
              if (payload.data.attackWeaponMode !== "THROWN" || !payload.data.projectileMutation
                  || !playerRow || !trustedHeroRow || !hasCompleteNativeLevelSnapshot(levelSnapshot)
                  || !isValidNativeProjectileCombatIntent(levelSnapshot, payload.data.projectileMutation,
                    this.currentDepth, session.playerId, playerRow, String(trustedHeroRow.value),
                    payload.data.attackerPos, payload.data.targetPos)) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "INVALID_NATIVE_PROJECTILE_INTENT" }) }));
                return;
              }
            }
            if (targetType === "MOB") {
              const publisherRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray()[0];
              const publisherId = String(publisherRow?.value || "");
              if (!publisherId) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_AUTHORITY_UNAVAILABLE" }) }));
                return;
              }
              if (!isAuthorizedNativeMobOwner(session.playerId, publisherId)) {
                const attackerStateBefore = payload.data?.attackerStateBefore;
                const targetEntityId = payload.data?.targetEntityId;
                const attackerRow = this.sql.exec(
                  `SELECT pos,hp,ht,state FROM players WHERE player_id = ?`, session.playerId
                ).toArray()[0];
                const trustedHeroRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                  `heroState:${session.playerId}`).toArray()[0];
                let trustedHeroState: any = null;
                try {
                  trustedHeroState = trustedHeroRow && typeof trustedHeroRow.value === "string"
                    ? JSON.parse(String(trustedHeroRow.value)) : null;
                } catch (_) { trustedHeroState = null; }
                let reportedHeroState: any = null;
                try {
                  reportedHeroState = typeof attackerStateBefore === "string" ? JSON.parse(attackerStateBefore) : null;
                } catch (_) { reportedHeroState = null; }
                const preStateMatches = !!attackerRow && String(attackerRow.state) === "ALIVE"
                  && !!reportedHeroState && !!trustedHeroState
                  && Number(reportedHeroState.hp) === Number(attackerRow.hp)
                  && Number(reportedHeroState.ht) === Number(attackerRow.ht)
                  && Number(reportedHeroState.pos) === Number(attackerRow.pos)
                  && Number(reportedHeroState.shielding) === Number(trustedHeroState.shielding)
                  && hasMatchingNativeHeroStateSnapshot(attackerStateBefore, trustedHeroState);
                const levelSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                  `levelSnapshot:${this.currentDepth}`).toArray()[0];
                let savedLevel: any = null;
                try { savedLevel = levelSnapshotRow && typeof levelSnapshotRow.value === "string" ? JSON.parse(String(levelSnapshotRow.value)) : null; } catch (_) {}
                const resolvedMobId = resolveServerMobIdByEntityId(savedLevel, targetEntityId);
                const mobRow = resolvedMobId == null ? [] : this.sql.exec(
                  `SELECT hp,ht,pos FROM mobs WHERE mob_id = ? AND depth = ?`, resolvedMobId, this.currentDepth
                ).toArray();
                const targetMob = (Array.isArray(savedLevel?.mobs) ? savedLevel.mobs : [])
                  .find((mob: any) => Number(mob?.mobId) === Number(resolvedMobId));
                if (!preStateMatches || typeof targetEntityId !== "string" || mobRow.length === 0
                    || !targetMob || Number(mobRow[0].hp) <= 0) {
                  ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                    requestId: msg.requestId, sequence: this.currentSequence,
                    payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_PRESTATE_REJECTED" }) }));
                  return;
                }
                const pending = {
                  requestId: msg.requestId, attackerId: session.playerId, authorityId: publisherId,
                  targetType: "MOB", targetEntityId, targetId: resolvedMobId,
                  targetPos: Number(mobRow[0].pos), attackerPos: Number(attackerRow.pos),
                  targetLockKey: "MOB:" + targetEntityId, depth: this.currentDepth,
                  attackWeaponMode: payload.data.attackWeaponMode,
                  attackWeaponBundle: payload.data.attackWeaponBundle,
                  damageMultiplier: payload.data.damageMultiplier,
                  damageBonus: payload.data.damageBonus,
                  accuracyMultiplier: payload.data.accuracyMultiplier,
                  projectileMutation: payload.data.projectileMutation,
                  attackerStateBefore, attackerStateAfter: payload.heroStateJson
                };
                if (!this.reservePendingCombat(pending)) {
                  ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                    requestId: msg.requestId, sequence: this.currentSequence,
                    payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_ALREADY_PENDING" }) }));
                  return;
                }
                let authorityFound = false;
                for (const authorityWs of this.state.getWebSockets()) {
                  const authoritySession = authorityWs.deserializeAttachment() as SessionData | null;
                  if (!authoritySession || authoritySession.playerId !== publisherId) continue;
                  authorityFound = true;
                  authorityWs.send(JSON.stringify({
                    protocolVersion: "1.0.0", messageType: "COMBAT_REQUEST",
                    senderId: "SERVER", requestId: msg.requestId, sequence: this.currentSequence,
                    payloadJson: JSON.stringify({
                      requestId: msg.requestId, attackerId: session.playerId,
                      targetType: "MOB", targetEntityId,
                      attackerPos: Number(attackerRow.pos), targetPos: Number(mobRow[0].pos),
                      attackerStateBefore,
                      attackWeaponMode: payload.data.attackWeaponMode,
                      attackWeaponBundle: payload.data.attackWeaponBundle,
                      damageMultiplier: payload.data.damageMultiplier,
                      damageBonus: payload.data.damageBonus,
                      accuracyMultiplier: payload.data.accuracyMultiplier,
                      projectileMutation: payload.data.projectileMutation
                    })
                  }));
                }
                if (!authorityFound) {
                  this.clearPendingCombat(pending);
                  ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                    requestId: msg.requestId, sequence: this.currentSequence,
                    payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_AUTHORITY_UNAVAILABLE" }) }));
                }
                return;
              }
            }
            if (targetType === "PLAYER" && isValidNativeCombatRequestId(msg.requestId)
                && (this.gameMode === "PVP_ARENA" || this.gameMode === "DEATHMATCH")) {
              const defenderId = String(targetId || "");
              const attackerRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", session.playerId).toArray();
              const defenderRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", defenderId).toArray();
              const attackerStateRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
              const defenderStateRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + defenderId).toArray()[0];
              let trustedAttacker: any = null, trustedDefender: any = null, reportedAttacker: any = null, reportedDefender: any = null;
              try { trustedAttacker = attackerStateRow && typeof attackerStateRow.value === "string" ? JSON.parse(String(attackerStateRow.value)) : null; } catch (_) {}
              try { trustedDefender = defenderStateRow && typeof defenderStateRow.value === "string" ? JSON.parse(String(defenderStateRow.value)) : null; } catch (_) {}
              try { reportedAttacker = JSON.parse(String(payload.data?.attackerStateBefore || "")); } catch (_) {}
              try { reportedDefender = JSON.parse(String(payload.data?.targetHeroStateBefore || "")); } catch (_) {}
              const attackerStateBefore = payload.data?.attackerStateBefore;
              const defenderStateBefore = defenderStateRow && typeof defenderStateRow.value === "string"
                ? String(defenderStateRow.value) : "";
              const attackerPos = Number(attackerRow[0]?.pos), defenderPos = Number(defenderRow[0]?.pos);
              const preStatesMatch = !!defenderId && defenderId !== session.playerId
                && attackerRow.length > 0 && defenderRow.length > 0
                && String(attackerRow[0].state) === "ALIVE" && String(defenderRow[0].state) === "ALIVE"
                && hasMatchingNativeHeroStateSnapshot(attackerStateBefore, trustedAttacker)
                && hasMatchingNativeHeroStateSnapshot(defenderStateBefore, trustedDefender)
                && Number(attackerRow[0].hp) === Number(reportedAttacker?.hp)
                && Number(attackerRow[0].ht) === Number(reportedAttacker?.ht)
                && Number(attackerRow[0].pos) === Number(reportedAttacker?.pos)
                && Number(defenderRow[0].hp) === Number(reportedDefender?.hp)
                && Number(defenderRow[0].ht) === Number(reportedDefender?.ht)
                && Number(defenderRow[0].pos) === Number(reportedDefender?.pos);
              if (!preStatesMatch) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "NATIVE_PVP_PRESTATE_REJECTED" }) }));
                return;
              }
              const pending = { requestId: msg.requestId, attackerId: session.playerId, authorityId: defenderId,
                targetType: "PLAYER", targetId: defenderId, attackerPos, targetPos: defenderPos,
                targetLockKey: "PLAYER:" + defenderId, depth: this.currentDepth,
                attackWeaponMode: payload.data.attackWeaponMode,
                attackWeaponBundle: payload.data.attackWeaponBundle,
                damageMultiplier: payload.data.damageMultiplier,
                damageBonus: payload.data.damageBonus,
                accuracyMultiplier: payload.data.accuracyMultiplier,
                projectileMutation: payload.data.projectileMutation,
                attackerStateBefore, attackerStateAfter: payload.heroStateJson,
                targetHeroStateBefore: defenderStateBefore };
              if (!this.reservePendingCombat(pending)) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_ALREADY_PENDING" }) }));
                return;
              }
              let authorityFound = false;
              for (const authorityWs of this.state.getWebSockets()) {
                const authoritySession = authorityWs.deserializeAttachment() as SessionData | null;
                if (!authoritySession || authoritySession.playerId !== defenderId) continue;
                authorityFound = true;
                authorityWs.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "COMBAT_REQUEST",
                  senderId: "SERVER", requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ requestId: msg.requestId, attackerId: session.playerId,
                    targetType: "PLAYER", targetPlayerId: defenderId, attackerPos, targetPos: defenderPos,
                    attackerStateBefore, targetHeroStateBefore: defenderStateBefore,
                    attackWeaponMode: payload.data.attackWeaponMode,
                    attackWeaponBundle: payload.data.attackWeaponBundle,
                    damageMultiplier: payload.data.damageMultiplier,
                    damageBonus: payload.data.damageBonus,
                    accuracyMultiplier: payload.data.accuracyMultiplier,
                    projectileMutation: payload.data.projectileMutation }) }));
              }
              if (!authorityFound) {
                this.clearPendingCombat(pending);
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_AUTHORITY_UNAVAILABLE" }) }));
              }
              return;
            }
            let targetEntityId: string | null = null;
            if (targetType !== "PLAYER") {
              targetEntityId = typeof payload.data?.targetEntityId === "string" ? payload.data.targetEntityId : null;
              const savedLevelRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                `levelSnapshot:${this.currentDepth}`).toArray()[0];
              let savedLevel: any = null;
              try { savedLevel = savedLevelRow && typeof savedLevelRow.value === "string" ? JSON.parse(String(savedLevelRow.value)) : null; } catch (_) {}
              // Never treat a publisher-local Actor.id() as a network identity.
              targetId = resolveServerMobIdByEntityId(savedLevel, targetEntityId);
            }

            const attackerRow = this.sql.exec(`SELECT pos,hp,ht,state FROM players WHERE player_id = ?`, session.playerId).toArray();
            const attackerStateRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `heroState:${session.playerId}`).toArray()[0];
            const trustedAttackerStateJson = attackerStateRow && typeof attackerStateRow.value === "string"
              ? String(attackerStateRow.value) : "";
            const attackerStateBeforeJson = typeof payload.data?.attackerStateBefore === "string"
              ? payload.data.attackerStateBefore : "";
            if (attackerRow.length > 0) {
              const attackerPos = Number(attackerRow[0].pos);

              if (targetType === "PLAYER") {
                if (this.gameMode === "PVP_ARENA" || this.gameMode === "DEATHMATCH") {
                  const defenderRow = this.sql.exec(`SELECT pos, hp, ht, state FROM players WHERE player_id = ?`, String(targetId)).toArray();
                  const nativeResult = payload.data?.engineResult === true;
                  if (defenderRow.length > 0 && String(defenderRow[0].state) === "ALIVE" && nativeResult) {
                    const defPos = Number(defenderRow[0].pos);
                    const requestedPos = Number(payload.data?.targetPos ?? -1);
                    const distance = Number(payload.data?.engineDistance);
                    const nativeCost = Number(payload.data?.engineActionCost);
                    const ranged = payload.data?.engineRanged === true;
                    const targetHp = Number(payload.data?.targetHp);
                    const targetHt = Number(payload.data?.targetHt);
                    const reportedDamage = Number(payload.data?.damage);
                    const widthRow = this.sql.exec(`SELECT width FROM levels WHERE depth = ?`, this.currentDepth).toArray();
                    const width = Number(widthRow[0]?.width || 1);
                    const dx = Math.abs((attackerPos % width) - (defPos % width));
                    const dy = Math.abs(Math.floor(attackerPos / width) - Math.floor(defPos / width));
                    const authoritativeDistance = Math.max(dx, dy);
                    const targetPosAfter = Number(payload.data?.targetPosAfter ?? requestedPos);
                    const targetMoveDistance = Math.max(
                      Math.abs((targetPosAfter % width) - (defPos % width)),
                      Math.abs(Math.floor(targetPosAfter / width) - Math.floor(defPos / width))
                    );
                    const levelSize = Number(widthRow[0]?.width || 0) * Number(
                      this.sql.exec(`SELECT height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0]?.height || 0);
                    const defenderStateRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                      `heroState:${String(targetId)}`).toArray()[0];
                    let defenderHeroState: any = null;
                    try {
                      defenderHeroState = defenderStateRow && typeof defenderStateRow.value === "string"
                        ? JSON.parse(String(defenderStateRow.value)) : null;
                    } catch (_) { defenderHeroState = null; }
                    const targetShieldBefore = payload.data?.targetShieldBefore;
                    const targetShieldAfter = payload.data?.targetShieldAfter;
                    const mergedTargetHeroStateJson = mergeNativeHeroState(defenderStateRow?.value,
                      payload.data?.targetHeroStateJson,
                      { hp: targetHp, ht: targetHt, pos: targetPosAfter, shielding: Number(targetShieldAfter) },
                      payload.data?.targetBuffs);
                    const targetHeroStateValid = mergedTargetHeroStateJson != null
                      && Number.isInteger(defenderHeroState?.hp) && defenderHeroState.hp === Number(defenderRow[0].hp)
                      && Number.isInteger(defenderHeroState?.ht) && defenderHeroState.ht === Number(defenderRow[0].ht)
                      && Number.isInteger(defenderHeroState?.pos) && defenderHeroState.pos === defPos;
                    const nativeCostValid = Number.isFinite(nativeCost) && nativeCost > 0 && nativeCost <= 10;
                    const validNativeTarget = requestedPos === defPos && nativeCostValid
                      && hasStrictNativeCombatFields(payload.data)
                      && hasMatchingNativeHeroBuffSnapshot(payload.data?.targetBuffsBefore, defenderHeroState)
                      && typeof payload.heroStateJson === "string" && payload.heroStateJson.length > 0 && payload.heroStateJson.length <= 200000
                      && isValidNativeCombatBuffs(payload.data?.targetBuffs)
                      && Number.isInteger(targetShieldBefore) && targetShieldBefore >= 0 && targetShieldBefore <= 100000
                      && Number.isInteger(targetShieldAfter) && targetShieldAfter >= 0 && targetShieldAfter <= 100000
                      && (defenderHeroState == null || !Number.isInteger(defenderHeroState?.shielding)
                        || targetShieldBefore === defenderHeroState.shielding)
                      && targetHeroStateValid
                      && isValidNativeMissTransition(payload.data?.engineHit,
                        payload.data?.targetHpBefore, targetHp, reportedDamage,
                        payload.data?.targetShieldBefore, payload.data?.targetShieldAfter,
                        payload.data?.targetBuffsBefore, payload.data?.targetBuffs,
                        defPos, targetPosAfter)
                      && (ranged
                        ? this.hasLineOfSight(attackerPos, defPos, this.currentDepth)
                        : this.isMeleeAdjacent(attackerPos, defPos, this.currentDepth))
                      && (targetPosAfter === defPos || (this.isValidCombatTargetPosition(targetPosAfter, this.currentDepth)
                        && this.isCombatDestinationFree(targetPosAfter, this.currentDepth, "PLAYER", String(targetId))))
                      && isValidNativeCombatEvent({
                        schemaVersion: payload.data?.combatSchemaVersion,
                        depth: payload.data?.combatDepth, currentDepth: this.currentDepth,
                        sessionPlayerId: session.playerId, attackerId: payload.data?.attackerId,
                        attackerPos: payload.data?.attackerPos, authoritativeAttackerPos: attackerPos,
                        targetType: "PLAYER", targetEntityId: payload.data?.targetEntityId ?? null,
                        expectedTargetEntityId: null, targetAlive: String(defenderRow[0].state) === "ALIVE",
                        targetPos: requestedPos, authoritativeTargetPos: defPos,
                        targetPosAfter, levelSize, targetMoveDistance,
                        previousHp: Number(defenderRow[0].hp), previousHt: Number(defenderRow[0].ht),
                        targetHpBefore: payload.data?.targetHpBefore, targetHtBefore: payload.data?.targetHtBefore,
                        targetHp, targetHt, damage: reportedDamage,
                        hit: payload.data?.engineHit, ranged, attackKind: payload.data?.attackKind,
                        distance, authoritativeDistance, actionCost: nativeCost
                      });
                    if (validNativeTarget) {
                      const newHp = targetHp;
                      const newState = newHp === 0
                        ? (this.gameMode === "DEATHMATCH" ? "ALIVE" : "SPECTATOR")
                        : "ALIVE";
                      this.sql.exec(`UPDATE players SET hp = ?, ht = ?, state = ?, pos = ? WHERE player_id = ?`,
                        newHp, targetHt, newState, targetPosAfter, String(targetId));
                      this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                        ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                        `heroState:${String(targetId)}`, String(mergedTargetHeroStateJson));
                      if (newHp === 0) {
                        this.sql.exec(`UPDATE players SET kills = kills + 1, score = score + 1 WHERE player_id = ?`, session.playerId);
                        this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, String(targetId));
                      }
                      eventType = "PLAYER_ATTACKED";
                      actionResultPayload = {
                        attackerId: session.playerId, attackerType: "PLAYER", targetId: String(targetId), targetType: "PLAYER",
                        sourceType: "PLAYER", sourceEntityId: session.playerId, sourcePos: attackerPos,
                        sourceAttackKind: payload.data?.attackKind,
                        attackerPos, targetPos: defPos, targetPosAfter,
                        targetHpBefore: Number(payload.data?.targetHpBefore), targetHtBefore: Number(payload.data?.targetHtBefore),
                        targetShieldBefore, targetShieldAfter, targetHeroStateJson: mergedTargetHeroStateJson,
                        targetBuffsBefore: payload.data?.targetBuffsBefore,
                        hit: payload.data?.engineHit === true, damage: reportedDamage,
                        targetHp: newHp, targetHt, targetState: newState,
                        attackKind: payload.data?.attackKind, engineDistance: distance, engineActionCost: nativeCost,
                        targetBuffs: payload.data.targetBuffs, attackerStateJson: payload.heroStateJson,
                        engineResolved: true
                      };
                      actionValid = true;
                      actionCost = nativeCost;
                    }
                  }
                }
              } else {
                const mobRow = this.sql.exec(`SELECT mob_id, hp, ht, pos FROM mobs WHERE mob_id = ? AND depth = ?`, targetId, this.currentDepth).toArray();
                if (mobRow.length > 0) {
                  const mobPos = Number(mobRow[0].pos);
                  const nativeResult = payload.data?.engineResult === true;
                  const requestedPos = Number(payload.data?.targetPos ?? -1);

                  if (nativeResult) {
                    const distance = Number(payload.data?.engineDistance);
                    const nativeCost = Number(payload.data?.engineActionCost);
                    const ranged = payload.data?.engineRanged === true;
                    const targetHp = Number(payload.data?.targetHp);
                    const targetHt = Number(payload.data?.targetHt);
                    const reportedDamage = Number(payload.data?.damage);
                    const widthRow = this.sql.exec(`SELECT width FROM levels WHERE depth = ?`, this.currentDepth).toArray();
                    const width = Number(widthRow[0]?.width || 1);
                    const dx = Math.abs((attackerPos % width) - (mobPos % width));
                    const dy = Math.abs(Math.floor(attackerPos / width) - Math.floor(mobPos / width));
                    const authoritativeDistance = Math.max(dx, dy);
                    const targetPosAfter = Number(payload.data?.targetPosAfter ?? requestedPos);
                    const targetMoveDistance = Math.max(
                      Math.abs((targetPosAfter % width) - (mobPos % width)),
                      Math.abs(Math.floor(targetPosAfter / width) - Math.floor(mobPos / width))
                    );
                    const levelSize = Number(widthRow[0]?.width || 0) * Number(
                      this.sql.exec(`SELECT height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0]?.height || 0);
                    const nativeCostValid = Number.isFinite(nativeCost) && nativeCost > 0 && nativeCost <= 10;
                    const combatLevelRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                      `levelSnapshot:${this.currentDepth}`).toArray()[0];
                    let combatLevel: any = null;
                    try {
                      combatLevel = combatLevelRow && typeof combatLevelRow.value === "string"
                        ? JSON.parse(String(combatLevelRow.value)) : null;
                    } catch (_) { combatLevel = null; }
                    const savedTargetMob = (combatLevel && Array.isArray(combatLevel.mobs) ? combatLevel.mobs : [])
                      .find((mob: any) => Number(mob?.mobId) === Number(targetId));
                    const expectedEntityId = savedTargetMob?.entityId || "";
                    const targetBuffPreStateMatches = !!savedTargetMob
                      && hasMatchingNativeBuffSnapshot(payload.data?.targetBuffsBefore, savedTargetMob.buffs);
                    const targetShieldPreStateMatches = !!savedTargetMob
                      && hasMatchingNativeMobShieldSnapshot(payload.data?.targetShieldBefore,
                        payload.data?.targetShieldAfter, savedTargetMob.shielding);
                    const targetMobBundleValid = targetHp <= 0 || isValidNativeMobBundle(payload.data?.targetMobBundleAfter);
                    const secondaryMobPayload = parseAndValidateNativeSecondaryMobDeltas(
                      payload.data?.secondaryMobDeltas, combatLevel?.mobs, levelSize, width, false, String(targetEntityId));
                    const secondaryDeathPositions = (secondaryMobPayload?.deltas || [])
                      .filter((delta: any) => Number(delta.hpAfter) === 0)
                      .map((delta: any) => Number(delta.posAfter));
                    const allDeathPositions = [
                      ...(targetHp <= 0 ? [targetPosAfter] : []),
                      ...secondaryDeathPositions
                    ];
                    const mergedAttackerState = attackerRow.length > 0
                      ? mergeNativeCombatAttackerState(trustedAttackerStateJson, attackerStateBeforeJson,
                          payload.heroStateJson, attackerRow[0], allDeathPositions.length > 0)
                      : null;
                    const lootSnapshot = targetHp <= 0 ? payload.data?.heaps
                      : secondaryDeathPositions.length > 0 ? secondaryMobPayload?.heaps : undefined;
                    const projectileTargetCell = Number(payload.data?.projectileMutation?.targetPos);
                    const lootAllowedPositions = payload.data?.projectileOutcome === "HEAP"
                      ? [...allDeathPositions, ...(Number.isInteger(projectileTargetCell) ? [projectileTargetCell] : [])]
                      : allDeathPositions;
                    const validLootSnapshot = secondaryMobPayload != null
                      && (allDeathPositions.length === 0
                        ? payload.data?.heaps === undefined && secondaryMobPayload.heaps === undefined
                        : isValidNativeLootSnapshot(lootSnapshot, combatLevel?.heaps, lootAllowedPositions, levelSize)
                          && (secondaryDeathPositions.length === 0
                            || (payload.data?.projectileMutation == null || sameNativeItemValue(payload.data?.heaps, secondaryMobPayload.heaps))));
                    const validProjectileResult = isValidNativeProjectileCombatResult(
                      combatLevel?.heaps, payload.data, requestedPos, allDeathPositions, levelSize);
                    const validNativeTarget = requestedPos === mobPos && nativeCostValid
                      && hasStrictNativeCombatFields(payload.data)
                      && targetBuffPreStateMatches
                      && targetShieldPreStateMatches
                      && targetMobBundleValid
                      && isValidNativeMissTransition(payload.data?.engineHit,
                        payload.data?.targetHpBefore, targetHp, reportedDamage,
                        payload.data?.targetShieldBefore, payload.data?.targetShieldAfter,
                        payload.data?.targetBuffsBefore, payload.data?.targetBuffs,
                        mobPos, targetPosAfter)
                      && validLootSnapshot
                      && validProjectileResult
                      && mergedAttackerState != null
                      && typeof payload.heroStateJson === "string" && payload.heroStateJson.length > 0 && payload.heroStateJson.length <= 200000
                      && isValidNativeCombatBuffs(payload.data?.targetBuffs)
                      && (ranged
                        ? this.hasLineOfSight(attackerPos, mobPos, this.currentDepth)
                        : this.isMeleeAdjacent(attackerPos, mobPos, this.currentDepth))
                      && (targetPosAfter === mobPos || (this.isValidCombatTargetPosition(targetPosAfter, this.currentDepth)
                        && this.isCombatDestinationFree(targetPosAfter, this.currentDepth, "MOB", Number(targetId))))
                      && isValidNativeCombatEvent({
                        schemaVersion: payload.data?.combatSchemaVersion,
                        depth: payload.data?.combatDepth, currentDepth: this.currentDepth,
                        sessionPlayerId: session.playerId, attackerId: payload.data?.attackerId,
                        attackerPos: payload.data?.attackerPos, authoritativeAttackerPos: attackerPos,
                        targetType: "MOB", targetEntityId, expectedTargetEntityId: String(expectedEntityId),
                        targetAlive: Number(mobRow[0].hp) > 0,
                        targetPos: requestedPos, authoritativeTargetPos: mobPos,
                        targetPosAfter, levelSize, targetMoveDistance,
                        previousHp: Number(mobRow[0].hp), previousHt: Number(mobRow[0].ht),
                        targetHpBefore: payload.data?.targetHpBefore, targetHtBefore: payload.data?.targetHtBefore,
                        targetHp, targetHt, damage: reportedDamage,
                        hit: payload.data?.engineHit, ranged, attackKind: payload.data?.attackKind,
                        distance, authoritativeDistance, actionCost: nativeCost
                      });
                    if (validNativeTarget) {
                      const newHp = targetHp;
                      const rawDmg = reportedDamage;
                      this.sql.exec(`UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                        newHp, targetHt, targetPosAfter, targetId, this.currentDepth);
                      const savedMob = (Array.isArray(combatLevel?.mobs) ? combatLevel.mobs : [])
                        .find((mob: any) => Number(mob?.mobId) === Number(targetId));
                      if (!savedMob) throw new Error("Accepted combat target missing from native snapshot");
                      savedMob.hp = newHp;
                      savedMob.ht = targetHt;
                      savedMob.pos = targetPosAfter;
                      savedMob.buffs = JSON.parse(String(payload.data.targetBuffs));
                       if (newHp > 0) savedMob.serializedBundle = String(payload.data.targetMobBundleAfter);
                       savedMob.shielding = Number(payload.data.targetShieldAfter);
                      if (allDeathPositions.length > 0) combatLevel.heaps = lootSnapshot;
                      else if (payload.data?.projectileOutcome === "HEAP") combatLevel.heaps = payload.data.projectileHeaps;
                      for (const delta of secondaryMobPayload.deltas) {
                        const secondaryMobId = resolveServerMobIdByEntityId(combatLevel, delta.entityId);
                        if (secondaryMobId == null) throw new Error("Secondary combat mob identity disappeared after validation");
                        const secondaryMob = combatLevel.mobs.find((mob: any) => Number(mob.mobId) === secondaryMobId);
                        if (!secondaryMob) throw new Error("Secondary combat mob missing from authoritative snapshot");
                        secondaryMob.hp = delta.hpAfter;
                        secondaryMob.ht = delta.htAfter;
                        secondaryMob.pos = delta.posAfter;
                        secondaryMob.shielding = delta.shieldAfter;
                        secondaryMob.buffs = JSON.parse(delta.buffsAfter);
                         secondaryMob.serializedBundle = delta.serializedBundleAfter;
                        this.sql.exec(`UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                          delta.hpAfter, delta.htAfter, delta.posAfter, secondaryMobId, this.currentDepth);
                      }
                      const deadMobEntityIds = [
                        ...(newHp === 0 ? [String(targetEntityId)] : []),
                        ...secondaryMobPayload.deltas.filter((delta: any) => Number(delta.hpAfter) === 0)
                          .map((delta: any) => String(delta.entityId))
                      ];
                      const deletedMobIds = removeDeadNativeMobsFromSnapshot(combatLevel, deadMobEntityIds);
                      if (deletedMobIds == null) throw new Error("Validated dead native mob identity disappeared");
                      for (const deadMobId of deletedMobIds) {
                        this.sql.exec(`DELETE FROM mobs WHERE mob_id = ? AND depth = ?`, deadMobId, this.currentDepth);
                      }
                      this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                        ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                        `levelSnapshot:${this.currentDepth}`, JSON.stringify(combatLevel));
                      // A direct native attack can also damage/heal the attacker via thorns,
                      // life-link, weapon procs, or consume a thrown weapon. Persist that exact
                      // post-state in the same commit as the target's result; the generic action
                      // state refresh intentionally refuses changed HP and would otherwise drop it.
                      const attackerAfter = JSON.parse(String(mergedAttackerState));
                      const attackerHpAfter = Number(attackerAfter.hp);
                      const attackerHtAfter = Number(attackerAfter.ht);
                      const attackerStateAfter = attackerHpAfter > 0 ? "ALIVE"
                        : this.gameMode === "DEATHMATCH" ? "ALIVE"
                          : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
                      this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?`,
                        attackerHpAfter, attackerHtAfter, Number(attackerAfter.pos), attackerStateAfter, session.playerId);
                      this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        `heroState:${session.playerId}`, String(mergedAttackerState));
                      if (String(attackerRow[0].state) === "ALIVE" && attackerStateAfter !== "ALIVE") {
                        this.sql.exec("UPDATE players SET deaths = deaths + 1 WHERE player_id = ?", session.playerId);
                      }
                      eventType = "PLAYER_ATTACKED";
                      actionResultPayload = {
                        attackerId: session.playerId, attackerType: "PLAYER", targetId: targetEntityId, targetType: "MOB",
                        sourceType: "PLAYER", sourceEntityId: session.playerId, sourcePos: attackerPos,
                        sourceAttackKind: payload.data?.attackKind,
                        attackerPos, targetPos: mobPos, targetPosAfter,
                        targetHpBefore: Number(payload.data?.targetHpBefore), targetHtBefore: Number(payload.data?.targetHtBefore),
                        targetShieldBefore: Number(payload.data?.targetShieldBefore), targetShieldAfter: Number(payload.data?.targetShieldAfter),
                        targetHeroStateJson: null, targetBuffsBefore: payload.data?.targetBuffsBefore,
                        targetMobBundleAfter: newHp > 0 ? String(payload.data?.targetMobBundleAfter) : null,
                        hit: payload.data?.engineHit === true, damage: rawDmg, targetHp: newHp,
                        targetHt, attackKind: payload.data?.attackKind, engineDistance: distance, engineActionCost: nativeCost,
                        targetBuffs: payload.data.targetBuffs, attackerStateJson: String(mergedAttackerState),
                        secondaryMobDeltas: secondaryMobPayload,
                         projectileOutcome: payload.data?.projectileOutcome,
                         projectileResultItemId: payload.data?.projectileMutation?.resultItemId,
                        engineResolved: true
                      };
                      actionValid = true;
                      actionCost = nativeCost;
                    }
                  }
                }
              }
            }
          } else if (actionStr === "WAIT") {
            const playerRow = this.sql.exec(`SELECT state FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0 && String(playerRow[0].state) === "ALIVE") {
              eventType = "PLAYER_WAITED";
              actionResultPayload = { playerId: session.playerId };
              actionValid = true;
              actionCost = 1.0;
            }
          } else if (actionStr === "USE_ABILITY") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeAbilityIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"USE_ABILITY",
                from:Number(playerRow.pos), targetPos:Number(playerRow.pos), depth:this.currentDepth,
                abilityClass:String(data.abilityClass), armorItemId:String(data.armorItemId),
                armorClass:String(data.armorClass), armorChargeBefore:Number(data.armorChargeBefore),
                armorChargeAfter:Number(data.armorChargeAfter), armorChargeUse:Number(data.armorChargeUse),
                engineActionCost:Number(data.engineActionCost) };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "ALCHEMY") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeAlchemyIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"ALCHEMY",
                from:Number(playerRow.pos), targetPos:Number(playerRow.pos), depth:this.currentDepth,
                ingredients:data.ingredients, alchemyEnergyBefore:data.alchemyEnergyBefore, alchemyEnergyAfter:data.alchemyEnergyAfter,
                resultItemId:String(data.resultItemId), resultItemClass:String(data.resultItemClass),
                resultQuantity:Number(data.resultQuantity), resultStackable:data.resultStackable,
                resultLocation:String(data.resultLocation), resultHeapId:String(data.resultHeapId || ""),
                resultNativeValue:Number(data.resultNativeValue), resultNativeUnitValue:Number(data.resultNativeUnitValue) };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "THROW") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeThrowIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"THROW", from:Number(playerRow.pos),
                targetPos:Number(data.targetPos), depth:this.currentDepth, itemId:String(data.itemId),
                itemClass:String(data.itemClass), heapId:String(data.heapId), resultItemId:String(data.resultItemId),
                expectedQuantity:Number(data.expectedQuantity), sourceQuantityBefore:Number(data.sourceQuantityBefore),
                stackable:data.stackable };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "USE_ITEM") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeUseItemIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"USE_ITEM", from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, itemId:String(data.itemId),
                itemClass:String(data.itemClass), itemAction:String(data.itemAction),
                expectedQuantity:Number(data.expectedQuantity), sourceQuantityBefore:Number(data.sourceQuantityBefore),
                stackable:data.stackable };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "PICKUP") {
            const data = payload.data || {};
            const itemPos = Number(data.itemPos ?? targetPos);
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const transitionPending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            const pickupRequestId = String(msg.requestId || "");
            this.sql.exec("DELETE FROM claimed_item_instances WHERE created_at < datetime('now', '-2 minutes')");
            if (!transitionPending && pickupRequestId.length > 0 && pickupRequestId.length <= 128
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && isValidNativePickupIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow)
                && itemPos === Number(targetPos)) {
              const reserved = reserveNativeLootClaim(this.state.storage, this.sql, this.currentDepth,
                Number(data.branch), String(data.heapId), String(data.itemId), session.playerId, pickupRequestId);
              if (!reserved) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
                  sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "ITEM_ALREADY_CLAIMED", itemPos, heapId: data.heapId, itemId: data.itemId }) }));
                return;
              }
              eventType = "ITEM_PICKUP_INTENT_ACCEPTED";
              actionResultPayload = {
                playerId: session.playerId, actionType: "PICKUP", from: itemPos, targetPos: itemPos,
                itemPos, depth: this.currentDepth, branch: Number(data.branch),
                heapId: String(data.heapId), itemId: String(data.itemId),
                itemClass: String(data.itemClass), itemBundle: String(data.itemBundle || ""),
                expectedQuantity: Number(data.expectedQuantity), stackable: data.stackable
              };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "DROP") {
            const data = payload.data || {};
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && hasCompleteNativeLevelSnapshot(levelSnapshot) && playerRow && heroRow
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeDropIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"DROP", from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, heapId:String(data.heapId), itemId:String(data.itemId),
                resultItemId:String(data.resultItemId), itemClass:String(data.itemClass),
                expectedQuantity:Number(data.expectedQuantity), sourceQuantityBefore:Number(data.sourceQuantityBefore), stackable:data.stackable };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "BUY") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeBuyIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              this.sql.exec("DELETE FROM claimed_item_instances WHERE created_at < datetime('now', '-2 minutes')");
              const reserved = reserveNativeLootClaim(this.state.storage, this.sql, this.currentDepth,
                Number(data.branch), String(data.heapId), String(data.itemId), session.playerId, requestId);
              if (!reserved) {
                ws.send(JSON.stringify({ protocolVersion:"1.0.0", messageType:"ERROR", requestId:msg.requestId,
                  sequence:this.currentSequence, payloadJson:JSON.stringify({error:"ITEM_ALREADY_CLAIMED",heapId:data.heapId,itemId:data.itemId}) }));
                return;
              }
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"BUY", from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, branch:Number(data.branch),
                heapId:String(data.heapId), itemId:String(data.itemId),
                itemClass:String(data.itemClass), expectedQuantity:Number(data.expectedQuantity), sourceQuantityBefore:Number(data.sourceQuantityBefore),
                stackable:data.stackable, itemLevel:Number(data.itemLevel), cursed:data.cursed, cursedKnown:data.cursedKnown,
                itemBundle:String(data.itemBundle), price:Number(data.price), resultItemId:String(data.resultItemId),
                resultHeapId:String(data.resultHeapId || ""), acquiredByInventory:data.acquiredByInventory };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "BUYBACK") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeBuybackIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              this.sql.exec("DELETE FROM claimed_item_instances WHERE created_at < datetime('now', '-2 minutes')");
              const reserved = reserveNativeLootClaim(this.state.storage, this.sql, this.currentDepth, 0,
                String(data.shopEntityId), String(data.buybackItemId), session.playerId, requestId);
              if (!reserved) {
                ws.send(JSON.stringify({ protocolVersion:"1.0.0", messageType:"ERROR", requestId:msg.requestId,
                  sequence:this.currentSequence, payloadJson:JSON.stringify({error:"ITEM_ALREADY_CLAIMED",
                    shopEntityId:data.shopEntityId,buybackItemId:data.buybackItemId}) }));
                return;
              }
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = {
                playerId:session.playerId, actionType:"BUYBACK", from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, branch:0,
                shopEntityId:String(data.shopEntityId), buybackItemId:String(data.buybackItemId),
                buybackItemClass:String(data.buybackItemClass), buybackQuantity:Number(data.buybackQuantity),
                price:Number(data.price), resultItemId:String(data.resultItemId), itemClass:String(data.itemClass),
                itemLevel:Number(data.itemLevel), cursed:data.cursed, cursedKnown:data.cursedKnown,
                stackable:data.stackable, nativeValue:Number(data.nativeValue),
                nativeUnitValue:Number(data.nativeUnitValue), resultItemBundle:String(data.resultItemBundle)
              };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "SELL") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeSellIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = {
                playerId: session.playerId, actionType: "SELL", from: Number(playerRow.pos),
                targetPos: Number(playerRow.pos), depth: this.currentDepth, branch: 0,
                shopEntityId: String(data.shopEntityId), sourceItemId: String(data.sourceItemId),
                resultItemId: String(data.resultItemId), itemClass: String(data.itemClass),
                sourceQuantityBefore: Number(data.sourceQuantityBefore), soldQuantity: Number(data.soldQuantity),
                sourceItemLevel: Number(data.sourceItemLevel), sourceCursed: data.sourceCursed,
                sourceCursedKnown: data.sourceCursedKnown,
                sourceNativeValue: Number(data.sourceNativeValue), sourceNativeUnitValue: Number(data.sourceNativeUnitValue),
                price: Number(data.price), stackable: data.stackable, resultItemBundle: String(data.resultItemBundle),
                resultItemLevel: Number(data.resultItemLevel), resultCursed: data.resultCursed,
                resultCursedKnown: data.resultCursedKnown, resultNativeValue: Number(data.resultNativeValue),
                resultNativeUnitValue: Number(data.resultNativeUnitValue)
              };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "EQUIP" || actionStr === "UNEQUIP") {
            const data = payload.data || {};
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && playerRow && heroRow
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeEquipmentIntent(heroRow.value, data, actionStr, this.currentDepth, playerRow)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:actionStr, from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, itemId:String(data.itemId),
                itemClass:String(data.itemClass), expectedEquipped:data.expectedEquipped };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "OPEN_CHEST") {
            const data = payload.data || {};
            const itemPos = Number(data.targetPos ?? targetPos);
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            const validIntent = !pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
              && hasCompleteNativeLevelSnapshot(levelSnapshot)
              && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
              && isValidNativeWorldActionIntent("OPEN_CHEST", data, levelSnapshot, this.currentDepth, Number(playerRow.pos))
              && itemPos === Number(data.targetPos);
            if (validIntent) {
              this.sql.exec("DELETE FROM claimed_chest_instances WHERE created_at < datetime('now', '-2 minutes')");
              this.sql.exec("INSERT OR IGNORE INTO claimed_chest_instances (depth,heap_id,claimed_by,request_id) VALUES (?,?,?,?)",
                this.currentDepth, String(data.heapId), session.playerId, requestId);
              const claim = this.sql.exec(
                "SELECT claimed_by,request_id FROM claimed_chest_instances WHERE depth = ? AND heap_id = ?",
                this.currentDepth, String(data.heapId)).toArray()[0];
              if (!claim || String(claim.claimed_by) !== session.playerId || String(claim.request_id) !== requestId) {
                ws.send(JSON.stringify({ protocolVersion:"1.0.0", messageType:"ERROR", requestId:msg.requestId,
                  sequence:this.currentSequence, payloadJson:JSON.stringify({error:"CHEST_ALREADY_CLAIMED",heapId:data.heapId}) }));
                return;
              }
              const chest = levelSnapshot.heaps.find((heap: any) => Number(heap?.pos) === itemPos);
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"OPEN_CHEST",
                from:Number(playerRow.pos), targetPos:itemPos, depth:this.currentDepth,
                heapId:String(data.heapId), heapType:String(chest?.type || "") };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          }
          if (actionValid && typeof payload.heroStateJson === "string"
              && payload.heroStateJson.length > 0 && payload.heroStateJson.length <= 200000) {
            // Movement/WAIT advances native cooldowns and buffs. Refresh only from a well-formed
            // owner state whose HP/HT/position already match the server's accepted player row;
            // preserve the trusted inventory and combat equipment bundles.
            if (actionStr === "MOVE" || actionStr === "WAIT" || actionStr === "ATTACK") {
              const playerRow = this.sql.exec("SELECT hp,ht,pos FROM players WHERE player_id = ?", session.playerId).toArray()[0];
              const previousRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
              let reported: any = null;
              try { reported = JSON.parse(payload.heroStateJson); } catch (_) {}
              const buffs = nativeBuffSnapshotFromHeroState(payload.heroStateJson);
              if (playerRow && reported && buffs != null
                && Number(reported.hp) === Number(playerRow.hp)
                && Number(reported.ht) === Number(playerRow.ht)
                && Number(reported.pos) === Number(playerRow.pos)) {
                if (previousRow && typeof previousRow.value === "string") {
                  const merged = mergeNativeHeroState(String(previousRow.value), payload.heroStateJson, {
                    hp: Number(playerRow.hp), ht: Number(playerRow.ht), pos: Number(playerRow.pos),
                    shielding: Number(reported.shielding)
                  }, buffs, false, false);
                  if (merged != null) this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    "heroState:" + session.playerId, merged);
                } else if (isValidNativeHeroStateJson(payload.heroStateJson, {
                  hp: Number(playerRow.hp), ht: Number(playerRow.ht), pos: Number(playerRow.pos), shielding: Number(reported.shielding)
                })) {
                  this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    "heroState:" + session.playerId, payload.heroStateJson);
                }
              }
            } else if (actionStr !== "PICKUP") {
              // A pickup is only an intent; its submitted Hero state is not committed before the post-state validates.
              this.sql.exec(`INSERT OR IGNORE INTO room_meta (key,value) VALUES (?,?)`,
                `heroState:${session.playerId}`, payload.heroStateJson);
            }
          }
        } catch (_) {}

        if (actionValid && requiresNativeMutationSnapshot(actionStrForLock)) {
          const requestId = String(msg.requestId || "");
          const lockKey = "nativeMutationPending:" + session.playerId;
          if (!requestId || requestId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
            actionValid = false;
            actionErrorCode = "MISSING_NATIVE_MUTATION_REQUEST_ID";
          } else {
            const lockValue = JSON.stringify({
              playerId: session.playerId, requestId, actionType: actionStrForLock,
              depth: this.currentDepth, createdAt: Date.now()
            });
            this.sql.exec("INSERT OR IGNORE INTO room_meta (key,value) VALUES (?,?)", lockKey, lockValue);
            const storedLock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", lockKey).toArray()[0];
            if (classifyNativeMutationLock(storedLock?.value, session.playerId, requestId, actionStrForLock) !== "OWNED") {
              actionValid = false;
              actionErrorCode = "NATIVE_MUTATION_PENDING";
            }
          }
        }

        if (actionValid) {
          // Increment sequence ONLY after successful validation and commit.
          this.currentSequence++;
          if (eventType === "PLAYER_ATTACKED" || eventType === "PLAYER_DAMAGED") {
            actionResultPayload.combatSchemaVersion = 1;
            actionResultPayload.combatDepth = this.currentDepth;
            actionResultPayload.combatSequence = this.currentSequence;
            actionResultPayload.combatRequestId = String(msg.requestId || "");
            actionResultPayload.matchId = this.state.id.toString();
          }
          this.worldTime += actionCost;
          this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('worldTime', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, String(this.worldTime));

          const resultJson = JSON.stringify({
            status: "ACCEPTED",
            sequence: this.currentSequence,
            eventType,
            action: actionResultPayload,
            actionCost
          });

          if (msg.requestId) {
            this.sql.exec(
              `INSERT INTO processed_actions (request_id, player_id, sequence, result_json) VALUES (?, ?, ?, ?)`,
              msg.requestId, actionOwnerId, this.currentSequence, resultJson
            );
          }

          this.sql.exec(
            `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, ?, ?, ?)`,
            this.currentSequence, session.playerId, eventType, JSON.stringify(actionResultPayload)
          );

          ws.send(JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ACTION_ACCEPTED",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: resultJson
          }));

          this.broadcastWithFOV(session.playerId, eventType, actionResultPayload, ws);
          this.checkMatchEndCondition();
          // Mob turns are resolved exclusively by the original Java SPD Actor scheduler.
          // Running a TypeScript pathfinder here would race the publisher and overwrite native AI.
        } else {
          if (pendingCombatForCleanup && String(pendingCombatForCleanup.authorityId || "") === session.playerId) {
            this.clearPendingCombat(pendingCombatForCleanup);
          }
          const errorMessage = JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ERROR",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify({ error: actionErrorCode })
          });
          ws.send(errorMessage);
          if (pendingCombatForCleanup && actionOwnerId !== session.playerId) {
            for (const peer of this.state.getWebSockets()) {
              const peerSession = peer.deserializeAttachment() as SessionData | null;
              if (peerSession?.playerId === actionOwnerId) peer.send(errorMessage);
            }
          }
        }
      } else if (msg.messageType === "READY") {
        this.sql.exec(`UPDATE players SET ready = 1 WHERE player_id = ?`, session.playerId);
        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "READY",
          senderId: session.playerId,
          payloadJson: JSON.stringify({ playerId: session.playerId, ready: true })
        });
      } else if (msg.messageType === "RESYNC") {
        const events = this.sql.exec(`SELECT sequence, sender_id, event_type, payload FROM events ORDER BY sequence ASC`).toArray();
        const players = this.sql.exec(`SELECT player_id, class_name, pos, hp, ht, ready, state FROM players`).toArray().map((player: any) => {
              const savedHero = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `heroState:${player.player_id}`).toArray()[0];
              return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
            });
        const mobs = this.sql.exec(`SELECT mob_id, name, pos, hp, ht FROM mobs WHERE depth = ?`, this.currentDepth).toArray();

        ws.send(JSON.stringify({
          protocolVersion: "1.0.0",
          messageType: "SNAPSHOT",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify({
            sequence: this.currentSequence,
            seed: this.matchSeed,
            depth: this.currentDepth,
            gameMode: this.gameMode,
            players,
            mobs,
            events,
            worldTime: this.worldTime,
            level: this.getCurrentLevelSnapshot()
          })
        }));
      } else if (msg.messageType === "PING") {
        ws.send(JSON.stringify({
          protocolVersion: "1.0.0",
          messageType: "PING",
          payloadJson: JSON.stringify({ pong: true })
        }));
      } else if (msg.messageType === "CHAT") {
        this.broadcast(msg);
      }
    } catch (e) {
      ws.send(JSON.stringify({
        protocolVersion: "1.0.0",
        messageType: "ERROR",
        payloadJson: JSON.stringify({ error: (e as Error).message })
      }));
    }
  }


  private broadcastCurrentSnapshot(excludePlayerId: string | null = null) {
    const events = this.sql.exec("SELECT sequence,sender_id,event_type,payload FROM events ORDER BY sequence ASC").toArray();
    const players = this.sql.exec("SELECT player_id,class_name,pos,hp,ht,ready,state FROM players").toArray().map((player: any) => {
      const savedHero = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + String(player.player_id)).toArray()[0];
      return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
    });
    const liveMobs = this.sql.exec("SELECT mob_id,name,pos,hp,ht FROM mobs WHERE depth = ?", this.currentDepth).toArray();
    const snapshotPayload = {
      sequence: this.currentSequence, seed: this.matchSeed, depth: this.currentDepth, gameMode: this.gameMode,
      players, mobs: liveMobs, events, worldTime: this.worldTime, level: this.getCurrentLevelSnapshot()
    };
    const message = JSON.stringify({ protocolVersion: "1.0.0", messageType: "SNAPSHOT",
      sequence: this.currentSequence, payloadJson: JSON.stringify(snapshotPayload) });
    for (const peer of this.state.getWebSockets()) {
      const peerSession = peer.deserializeAttachment() as SessionData | null;
      if (!peerSession || (excludePlayerId != null && peerSession.playerId === excludePlayerId)) continue;
      peer.send(message);
    }
  }

  private tryFinalizeLevelTransition() {
    const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
    if (!pendingRow) return;
    let pending: any = null;
    try { pending = JSON.parse(String(pendingRow.value)); } catch (_) { return; }
    if (!pending || pending.snapshotReady !== true || pending.fromDepth !== this.currentDepth
        || pending.depth === this.currentDepth || Math.abs(pending.depth - this.currentDepth) !== 1
        || pending.targetBranch !== 0
        || (pending.transitionType === "FALL" && pending.depth !== pending.fromDepth + 1)) return;

    const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${pending.depth}`).toArray()[0];
    let level: any = null;
    try { level = savedRow ? JSON.parse(String(savedRow.value)) : null; } catch (_) { return; }
    if (!level || level.depth !== pending.depth || level.branch !== 0 || !Array.isArray(level.transitions)) return;

    const isFall = pending.transitionType === "FALL";
    let newPos = -1;
    let destinationValid = false;
    if (isFall) {
      if (!isValidNativeFallDestinationSnapshot(level)) return;
      try {
        const publisherHero = JSON.parse(String(level.heroStateJson));
        newPos = Number(publisherHero.pos);
      } catch (_) { return; }
      destinationValid = isValidNativeFallLanding(level, newPos);
    } else {
      const destination = level.transitions.filter((transition: any) =>
        String(transition?.type) === String(pending.targetType) && Number.isInteger(transition?.pos));
      if (destination.length !== 1) return;
      newPos = Number(destination[0].pos);
      const size = Number(level.width) * Number(level.height);
      const destinationTile = Array.isArray(level.tiles)
        ? level.tiles.find((tile: any) => tile?.pos === newPos) : null;
      destinationValid = newPos >= 0 && newPos < size && !!destinationTile
        && destinationTile.passable === true && destinationTile.solid === false && destinationTile.pit === false;
    }
    if (!destinationValid) return;

    const connected = this.sql.exec("SELECT player_id FROM players WHERE state = 'ALIVE' AND connected = 1").toArray();
    const readyStates: Array<{playerId: string; heroStateJson: string; hero: any}> = [];
    for (const player of connected) {
      const playerId = String(player.player_id);
      const readyRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `transitionReady:${playerId}`).toArray()[0];
      if (!readyRow || typeof readyRow.value !== "string") return;
      let ready: any = null;
      try { ready = JSON.parse(String(readyRow.value)); } catch (_) { return; }
      if (!ready || ready.depth !== pending.depth || ready.branch !== 0 || Number(ready.seed) !== Number(level.seed)
          || typeof ready.heroStateJson !== "string") return;
      let hero: any = null;
      try { hero = JSON.parse(ready.heroStateJson); } catch (_) { return; }
      if (!hero || hero.pos !== newPos || !Number.isInteger(hero.hp) || hero.hp < 0
          || !Number.isInteger(hero.ht) || hero.ht < 1 || hero.hp > hero.ht
          || !Number.isInteger(hero.shielding) || hero.shielding < 0
          || !isValidNativeHeroStateJson(ready.heroStateJson, {
            hp: hero.hp, ht: hero.ht, pos: hero.pos, shielding: hero.shielding
          })
          || (isFall && !isValidNativeFallLanding(level, hero.pos))) return;
      readyStates.push({ playerId, heroStateJson: ready.heroStateJson, hero });
    }

    // Keep the barrier closed until the shared destination and every connected living player's
    // native Hero state agree on branch, seed, landing cell and serialized progression.
    if (!canFinalizeNativeFloorTransition(this.currentDepth, pending, pending.snapshotReady,
        destinationValid, readyStates.length, connected.length)) return;

    // Commit room depth and all player states together only after the destination is proven ready.
    this.currentDepth = pending.depth;
    this.sql.exec("INSERT INTO room_meta (key,value) VALUES ('depth',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      String(this.currentDepth));
    for (const ready of readyStates) {
      this.sql.exec("UPDATE players SET pos = ?, hp = ?, ht = ?, state = ? WHERE player_id = ?",
        newPos, ready.hero.hp, ready.hero.ht, ready.hero.hp > 0 ? "ALIVE" : "DEAD", ready.playerId);
      this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        `heroState:${ready.playerId}`, ready.heroStateJson);
    }

    this.sql.exec("DELETE FROM room_meta WHERE key = 'transitionPending'");
    this.sql.exec("DELETE FROM room_meta WHERE key LIKE 'transitionReady:%'");
    this.state.storage.deleteAlarm().catch(() => {});
    this.broadcastCurrentSnapshot(null);
  }

  private getCurrentLevelSnapshot() {
    const level = this.sql.exec(`SELECT depth,width,height,entrance_pos,exit_pos,seed FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0];
    if (!level) return null;
    const saved = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `levelSnapshot:${this.currentDepth}`).toArray()[0];
    let original: any = {};
    if (saved && typeof saved.value === "string") {
      try { original = JSON.parse(String(saved.value)); } catch (_) { original = {}; }
    }
    // Hero inventory/buffs belong to an individual player, never to the shared level snapshot.
    const { heroStateJson: _sharedHeroState, ...originalWorld } = original;
    const originalMobs = new Map<number, any>(
      (Array.isArray(original.mobs) ? original.mobs : []).map((mob: any) => [Number(mob.mobId), mob])
    );
    const originalTiles = new Map<number, any>(
      (Array.isArray(original.tiles) ? original.tiles : []).map((tile: any) => [Number(tile.pos), tile])
    );
    const liveMobs = this.sql.exec(`SELECT mob_id,name,pos,hp,ht,str,dmg_max,next_act_at,state FROM mobs WHERE depth = ?`, this.currentDepth).toArray();
    const acceptedTurnRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, "nativeWorldTurnCounter").toArray()[0];
    const acceptedTurn = Math.max(0, Number.isSafeInteger(Number(acceptedTurnRow?.value))
      ? Number(acceptedTurnRow.value) : 0);
    return {
      ...originalWorld,
      nativeWorldTurnCounter: acceptedTurn,
      depth: Number(level.depth), width: Number(level.width), height: Number(level.height),
      entrancePos: Number(level.entrance_pos), exitPos: Number(level.exit_pos), seed: Number(level.seed),
      tiles: this.sql.exec(`SELECT pos,terrain,passable,solid,pit,los_blocking FROM level_tiles WHERE depth = ? ORDER BY pos`, this.currentDepth).toArray().map((tile: any) => {
        const savedTile = originalTiles.get(Number(tile.pos)) || {};
        return {
          ...savedTile, ...tile,
          pos: Number(tile.pos), terrain: Number(tile.terrain),
          passable: Number(tile.passable) !== 0, solid: Number(tile.solid) !== 0,
          pit: Number(tile.pit) !== 0, losBlocking: Number(tile.los_blocking) !== 0,
          flammable: Boolean(savedTile.flammable), secret: Boolean(savedTile.secret),
          avoid: Boolean(savedTile.avoid), water: Boolean(savedTile.water),
          discoverable: Boolean(savedTile.discoverable), openSpace: Boolean(savedTile.openSpace)
        };
      }),
      transitions: Array.isArray(original.transitions) ? original.transitions :
        this.sql.exec(`SELECT transition_id,pos,type,target_depth FROM level_transitions WHERE depth = ? ORDER BY pos`, this.currentDepth).toArray(),
      mobs: liveMobs.map((mob: any) => {
        const savedMob = originalMobs.get(Number(mob.mob_id)) || {};
        return {
          ...savedMob, ...mob,
          entityId: typeof savedMob.entityId === "string" ? savedMob.entityId : "",
          state: typeof savedMob.state === "string" ? savedMob.state : mob.state,
          defenseSkill: Number(savedMob.defenseSkill) || 0,
          baseSpeed: Number(savedMob.baseSpeed) || 1,
          cooldown: Number(savedMob.cooldown) || 0
        };
      }),
      // Keep every serialized dynamic-world collection in the authoritative resync payload.
      // Omitting these fields made plants and timed blobs disappear after a reconnect.
      heaps: Array.isArray(original.heaps) ? original.heaps : [],
      traps: Array.isArray(original.traps) ? original.traps : [],
      blobs: Array.isArray(original.blobs) ? original.blobs : [],
      plants: Array.isArray(original.plants) ? original.plants : []
    };
  }

  private checkMatchEndCondition() {
    if (this.gameStatus === "ENDED") return;
    if (this.gameMode === "DEATHMATCH") {
      const topKills = this.sql.exec(`SELECT player_id, kills FROM players ORDER BY kills DESC LIMIT 1`).toArray();
      if (topKills.length > 0 && Number(topKills[0].kills) >= 10) {
        this.gameStatus = "ENDED";
        const winnerId = String(topKills[0].player_id);

        this.currentSequence++;
        const matchEndPayload = {
          reason: "KILL_LIMIT_REACHED",
          winnerId,
          kills: Number(topKills[0].kills)
        };

        this.sql.exec(
          `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, 'SERVER', 'MATCH_END', ?)`,
          this.currentSequence, JSON.stringify(matchEndPayload)
        );

        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "EVENT_BATCH",
          senderId: "SERVER",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType: "MATCH_END", depth: this.currentDepth, action: matchEndPayload }])
        });
      }
    } else if (this.gameMode === "PVP_ARENA") {
      const playerCount = this.sql.exec(`SELECT COUNT(*) AS total FROM players`).toArray();
      const alivePlayers = this.sql.exec(`SELECT player_id FROM players WHERE state = 'ALIVE'`).toArray();
      if (Number(playerCount[0]?.total || 0) >= 2 && alivePlayers.length === 1) {
        this.gameStatus = "ENDED";
        const winnerId = String(alivePlayers[0].player_id);

        this.currentSequence++;
        const matchEndPayload = {
          reason: "LAST_PLAYER_STANDING",
          winnerId
        };

        this.sql.exec(
          `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, 'SERVER', 'MATCH_END', ?)`,
          this.currentSequence, JSON.stringify(matchEndPayload)
        );

        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "EVENT_BATCH",
          senderId: "SERVER",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType: "MATCH_END", depth: this.currentDepth, action: matchEndPayload }])
        });
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const session = ws.deserializeAttachment() as SessionData | null;
    if (session) {
      this.sql.exec(`UPDATE players SET connected = 0 WHERE player_id = ?`, session.playerId);
      this.broadcast({
        protocolVersion: "1.0.0",
        messageType: "PLAYER_LEFT",
        senderId: session.playerId,
        payloadJson: JSON.stringify({ playerId: session.playerId, code, reason })
      });
    }
  }

  private broadcastWithFOV(senderId: string, eventType: string, actionPayload: any, excludeWs?: WebSocket) {
    const senderRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, senderId).toArray();
    const senderPos = senderRow.length > 0 ? Number(senderRow[0].pos) : -1;
    const actionPos = actionPayload.pos !== undefined ? Number(actionPayload.pos)
      : actionPayload.toPos !== undefined ? Number(actionPayload.toPos)
      : actionPayload.targetPos !== undefined ? Number(actionPayload.targetPos)
      : senderPos;

    let targetPos = -1;
    const targetId = actionPayload.targetId || actionPayload.targetPlayerId;
    if (targetId !== undefined && targetId !== null) {
      const targetPlayer = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, String(targetId)).toArray();
      if (targetPlayer.length > 0) targetPos = Number(targetPlayer[0].pos);
      else {
        const targetMob = this.sql.exec(`SELECT pos FROM mobs WHERE mob_id = ? AND depth = ?`, Number(targetId), this.currentDepth).toArray();
        if (targetMob.length > 0) targetPos = Number(targetMob[0].pos);
      }
    }

    for (const ws of this.state.getWebSockets()) {
      if (ws === excludeWs) continue;
      const recipientSession = ws.deserializeAttachment() as SessionData | null;
      if (!recipientSession) continue;

      let sendToClient = true;
      if (this.gameMode === "PVP_ARENA" || this.gameMode === "DEATHMATCH") {
        const recipientRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, recipientSession.playerId).toArray();
        if (recipientRow.length > 0) {
          const recipientPos = Number(recipientRow[0].pos);
          if (actionPos >= 0) sendToClient = this.hasLineOfSight(recipientPos, actionPos, this.currentDepth);
          // Combat events that identify a target are only disclosed when that target is visible too.
          if (sendToClient && targetPos >= 0) {
            sendToClient = this.hasLineOfSight(recipientPos, targetPos, this.currentDepth);
          }
          if (sendToClient && senderPos >= 0 && actionPos < 0) {
            sendToClient = this.hasLineOfSight(recipientPos, senderPos, this.currentDepth);
          }
        }
      }

      if (sendToClient) {
        try {
          const eventMsg: NetworkMessage = {
            protocolVersion: "1.0.0",
            messageType: "EVENT_BATCH",
            senderId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType, depth: this.currentDepth, action: actionPayload }])
          };
          ws.send(JSON.stringify(eventMsg));
        } catch (_) {}
      }
    }
  }

  private broadcast(msg: NetworkMessage, excludeWs?: WebSocket) {
    const str = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws !== excludeWs) {
        try {
          ws.send(str);
        } catch (_) {}
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/room/")) {
      const parts = url.pathname.split("/");
      const roomCode = parts[2] || "DEFAULT_ROOM";
      const id = env.MATCH_ROOM.idFromName(roomCode);
      const stub = env.MATCH_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("SPD Multiplayer Server API. Access /room/{roomCode}/websocket to connect.", { status: 200 });
  }
};
