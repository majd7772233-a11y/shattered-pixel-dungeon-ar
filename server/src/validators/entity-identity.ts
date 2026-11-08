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
