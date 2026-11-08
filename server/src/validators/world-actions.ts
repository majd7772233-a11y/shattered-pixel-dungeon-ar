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
