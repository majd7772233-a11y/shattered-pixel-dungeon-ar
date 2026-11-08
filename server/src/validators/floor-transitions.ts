import { isValidNativeHeroStateJson } from "./combat-state";

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
