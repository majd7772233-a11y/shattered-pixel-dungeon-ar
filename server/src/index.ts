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

/** Rejects partial/legacy level payloads before any room state is replaced. */
export function hasCompleteNativeLevelSnapshot(level: any): boolean {
  if (!level || typeof level !== "object" || Number(level.schemaVersion) !== 1
    || Number(level.branch) !== 0 || !Number.isInteger(Number(level.depth))
    || Number(level.depth) < 1 || Number(level.depth) > 100
    || !Number.isInteger(Number(level.width)) || !Number.isInteger(Number(level.height))
    || Number(level.width) < 8 || Number(level.height) < 8
    || Number(level.width) > 100 || Number(level.height) > 100) return false;
  const size = Number(level.width) * Number(level.height);
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
  if (!level.mobs.every((mob: any) => bundle(mob?.serializedBundle)
    && Number.isInteger(mob?.shielding) && Number(mob.shielding) >= 0 && Number(mob.shielding) <= 100000
    && Array.isArray(mob?.buffs) && mob.buffs.length <= 256
    && mob.buffs.every((buff: any) => bundle(buff?.serializedBundle)))) return false;
  if (!level.heaps.every((heap: any) => Array.isArray(heap?.items) && heap.items.length <= 512
    && heap.items.every((item: any) => bundle(item?.serializedBundle)))) return false;
  if (!level.traps.every((trap: any) => bundle(trap?.serializedBundle))
    || !level.plants.every((plant: any) => bundle(plant?.serializedBundle))
    || !level.blobs.every((blob: any) => bundle(blob?.serializedBundle))) return false;
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

export function isValidNativeCombatRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,80}$/.test(value);
}

export function classifyRequestReplay(existing: any, playerId: string): "NEW" | "REPLAY" | "CONFLICT" {
  if (!existing) return "NEW";
  return String(existing.player_id) === playerId ? "REPLAY" : "CONFLICT";
}

export function hasStrictNativeCombatFields(data: any): boolean {
  return data != null && data.combatSchemaVersion === 1
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
    && typeof data.sourceMobBuffs === "string";
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
    && Number.isInteger(data.effectiveDamage) && data.effectiveDamage >= 0
    && data.targetState === (hp > 0 ? "ALIVE" : "DEAD")
    && hasMatchingNativeHeroBuffSnapshot(buffsBefore, authoritative.heroState)
    && isValidNativeCombatBuffs(buffsAfter)
    && (damage > 0 || shieldAfter < shieldBefore
      || comparableBuffs(JSON.parse(String(buffsBefore))) !== comparableBuffs(JSON.parse(String(buffsAfter)))
      || posAfter !== posBefore);
}

export function hasStrictNativeDamageFields(data: any): boolean {
  return data != null && data.combatSchemaVersion === 1 && Number.isInteger(data.combatDepth)
    && data.targetType === "PLAYER" && data.sourceType === "MOB"
    && typeof data.sourceEntityId === "string" && data.sourceEntityId.length >= 8 && data.sourceEntityId.length <= 128
    && Number.isInteger(data.sourcePos) && ["MELEE", "RANGED"].includes(data.sourceAttackKind)
    && typeof data.sourceActionCost === "number" && Number.isFinite(data.sourceActionCost)
    && data.sourceActionCost > 0 && data.sourceActionCost <= 10
    && Number.isInteger(data.targetHpBefore) && Number.isInteger(data.targetHtBefore)
    && Number.isInteger(data.targetHp) && Number.isInteger(data.targetHt) && Number.isInteger(data.damage)
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
      && Number.isInteger(state?.buffCount) && state.buffCount >= 0 && state.buffCount <= 256;
  } catch (_) { return false; }
}

export function mergeNativeHeroState(previousValue: unknown, reportedValue: unknown, expected: {
  hp: number; ht: number; pos: number; shielding: number;
}, targetBuffsValue: unknown, allowBlessedAnkhConsumption = false): string | null {
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
    ...(blessedAnkhConsumed ? {
      inventoryBundle: reported.inventoryBundle,
      ankhCount: reported.ankhCount,
      blessedAnkhCount: reported.blessedAnkhCount
    } : {}),
    hp: expected.hp,
    ht: expected.ht,
    pos: expected.pos,
    shielding: expected.shielding,
    // The attacker does not own the defender's scheduler state; preserve the last trusted cooldown.
    cooldown: Number.isFinite(Number(previous.cooldown)) ? Math.max(0, Math.min(100000, Number(previous.cooldown))) : 0,
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
  if (!Number.isFinite(Number(reported.cooldown)) || Number(reported.cooldown) !== Number(authoritative.cooldown)) return false;
  for (let i = 0; i < Number(authoritative.buffCount); i++) {
    if (reported[`buff_${i}`] !== authoritative[`buff_${i}`]
      || Number(reported[`buffCooldown_${i}`]) !== Number(authoritative[`buffCooldown_${i}`])) return false;
  }
  return true;
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
  }>;
  heaps?: unknown;
}

/** Validates every secondary native mob mutation against the last server-held level snapshot. */
export function parseAndValidateNativeSecondaryMobDeltas(
  value: unknown, savedMobs: unknown, levelSize: number, width: number, authoritativeOwner = false
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
      || delta.entityId.length > 80 || seen.has(delta.entityId)) return null;
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
      || !hasMatchingNativeBuffSnapshot(delta.buffsBefore, saved.buffs)
      || !isValidNativeCombatBuffs(delta.buffsAfter)) return null;
    const moveDistance = Math.max(
      Math.abs((delta.posAfter % width) - (delta.posBefore % width)),
      Math.abs(Math.floor(delta.posAfter / width) - Math.floor(delta.posBefore / width))
    );
    if (moveDistance > 8) return null;
    const changed = delta.hpAfter !== delta.hpBefore || delta.posAfter !== delta.posBefore
      || delta.shieldAfter !== delta.shieldBefore
      || comparableBuffs(JSON.parse(delta.buffsAfter)) !== comparableBuffs(JSON.parse(delta.buffsBefore));
    if (!changed) return null;
    if (delta.hpAfter === 0) deathPositions.add(delta.posAfter);
  }
  if (deathPositions.size > 0) {
    if (!Array.isArray(payload.heaps)) return null;
  } else if (payload.heaps !== undefined) return null;
  return { complete: true, deltas: payload.deltas, ...(deathPositions.size ? { heaps: payload.heaps } : {}) };
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
      CREATE TABLE IF NOT EXISTS claimed_items (
        item_pos INTEGER PRIMARY KEY,
        depth INTEGER DEFAULT 1,
        claimed_by TEXT,
        claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            const claims = this.sql.exec(`SELECT item_pos, claimed_by FROM claimed_items WHERE depth = ?`, this.currentDepth).toArray();

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
                claims,
                worldTime: this.worldTime,
                level: this.getCurrentLevelSnapshot()
              })
            }));
            return;
          }
        } catch (_) {}
      }

      if (msg.messageType === "LEVEL_DATA") {
        const authority = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray();
        if (!authority.length || String(authority[0].value) !== session.playerId) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "LEVEL_PUBLISHER_ONLY" }) }));
          return;
        }
        const level = JSON.parse(msg.payloadJson || "{}");
        const width = Number(level.width), height = Number(level.height), depth = Number(level.depth);
        const tiles = level.tiles, transitions = level.transitions;
        const heaps = level.heaps, traps = level.traps, blobs = level.blobs, plants = level.plants;
        const mobs = level.mobs;
        const visitedPositions = level.visitedPositions, mappedPositions = level.mappedPositions;
        const size = width * height;
        const validBundle = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 200000;
        const boundedArray = (value: unknown, max: number) => Array.isArray(value) && value.length <= max;
        const validPos = (p: number) => Number.isInteger(p) && p >= 0 && p < size;
        if (!hasCompleteNativeLevelSnapshot(level) || Number(level.schemaVersion) !== 1 || Number(level.branch) !== 0 || depth < 1 || depth > 100
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
          heaps.some((heap: any) => !validPos(Number(heap?.pos)) || !["HEAP","FOR_SALE","CHEST","LOCKED_CHEST","CRYSTAL_CHEST","TOMB","SKELETON","REMAINS"].includes(String(heap?.type))
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
        if (typeof level.heroStateJson === "string" && level.heroStateJson.length <= 200000) {
          this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            `heroState:${session.playerId}`, level.heroStateJson);
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
          const initialCooldown = Math.max(0, Math.min(100, Number(m.cooldown) || 0));
          this.sql.exec(`INSERT OR REPLACE INTO mobs (mob_id,depth,name,pos,hp,ht,str,dmg_max,next_act_at,state)
            VALUES (?,?,?,?,?,?,8,6,?,'HUNTING')`,
            Number(m.mobId),depth,String(m.name).slice(0,80),Number(m.pos),Number(m.hp),Math.max(1,Number(m.ht)),this.worldTime + initialCooldown);
        }
        ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ACK", requestId: msg.requestId,
          sequence: this.currentSequence, payloadJson: JSON.stringify({ accepted: true, source: "SPD_JAVA_GENERATOR",
            depth,width,height,tileCount: tiles.length,transitionCount: transitions.length,mobCount: mobs.length,
            entities: mobs.map((mob: any) => ({ mobId: Number(mob.mobId), entityId: String(mob.entityId) })) }) }));
        return;
      }

      if (msg.messageType === "ACTION") {
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
        let actionCost = 1.0;

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
          let authorityPending: any = null;

          if (actionStr === "SYNC_PLAYER_COMBAT" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data || {};
            const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombat:" + String(data.combatRequestId || "")).toArray()[0];
            let pending: any = null;
            try { pending = pendingRow && typeof pendingRow.value === "string" ? JSON.parse(String(pendingRow.value)) : null; } catch (_) {}
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
            const authorityValid = !!pending && pending.targetType === "PLAYER"
              && String(pending.requestId) === String(data.combatRequestId)
              && String(pending.authorityId) === session.playerId && defenderId === session.playerId
              && String(pending.attackerId) === String(data.attackerId) && attackerId !== defenderId
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
              && mergedState !== null && hpDeltaValid
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
              const newStatus = hpAfter > 0 ? "ALIVE" : "DEAD";
              this.sql.exec("UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?",
                hpAfter, htAfter, posAfter, newStatus, defenderId);
              if (hpAfter <= 0) this.sql.exec("UPDATE players SET kills = kills + 1 WHERE player_id = ?", attackerId);
              this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                "heroState:" + defenderId, mergedState);
              this.sql.exec("DELETE FROM room_meta WHERE key = ?", "pendingCombat:" + String(data.combatRequestId));
              eventType = "PLAYER_ATTACKED";
              actionResultPayload = {
                attackerId, attackerType: "PLAYER", targetId: defenderId, targetType: "PLAYER",
                targetPos: posBefore, targetPosAfter: posAfter, targetHpBefore: hpBefore, targetHtBefore: htBefore,
                targetHp: hpAfter, targetHt: htAfter, targetShieldBefore: shieldBefore, targetShieldAfter: shieldAfter,
                targetBuffsBefore: data.targetBuffsBefore, targetBuffs: data.targetBuffs,
                targetHeroStateJson: mergedState, targetState: newStatus,
                damage, hit: data.engineHit === true, attackKind: data.attackKind,
                engineDistance: distance, engineActionCost: nativeCost, engineResolved: true
              };
              actionValid = true; actionCost = nativeCost;
            }
          } else if (actionStr === "SYNC_MOB_STATE" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data || {};
            if (typeof data.combatRequestId === "string") {
              const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombat:" + data.combatRequestId).toArray()[0];
              try { authorityPending = pendingRow && typeof pendingRow.value === "string" ? JSON.parse(String(pendingRow.value)) : null; } catch (_) { authorityPending = null; }
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
              const secondaryMobPayload = parseAndValidateNativeSecondaryMobDeltas(data.secondaryMobDeltas, levelSnapshot?.mobs, levelSize, width);
              const secondaryDeaths = (secondaryMobPayload?.deltas || []).filter((delta: any) => Number(delta.hpAfter) === 0).map((delta: any) => Number(delta.posAfter));
              const allDeaths = [...(targetHp <= 0 ? [targetPosAfter] : []), ...secondaryDeaths];
              const lootSnapshot = targetHp <= 0 ? data.heaps : secondaryDeaths.length > 0 ? secondaryMobPayload?.heaps : undefined;
              const validLoot = secondaryMobPayload != null && (allDeaths.length === 0
                ? data.heaps === undefined && secondaryMobPayload.heaps === undefined
                : isValidNativeLootSnapshot(lootSnapshot, levelSnapshot?.heaps, allDeaths, levelSize));
              const targetBuffPreStateMatches = !!savedMob && hasMatchingNativeBuffSnapshot(data.targetBuffsBefore, savedMob.buffs);
              const targetShieldPreStateMatches = !!savedMob && hasMatchingNativeMobShieldSnapshot(data.targetShieldBefore, data.targetShieldAfter, savedMob.shielding);
              const authorityValid = !!authorityPending && String(authorityPending.requestId) === String(data.combatRequestId)
                && String(authorityPending.authorityId) === session.playerId && String(publisherRow?.value || "") === session.playerId
                && authorityPending.targetType === "MOB" && Number(authorityPending.depth) === this.currentDepth
                && attackerId === String(data.attackerId) && String(authorityPending.targetEntityId) === String(data.targetEntityId)
                && Number(authorityPending.attackerPos) === attackerPos && Number(authorityPending.targetPos) === targetPos
                && attackerRow.length > 0 && String(attackerRow[0].state) === "ALIVE"
                && mobRow.length > 0 && Number(mobRow[0].hp) > 0 && !!savedMob
                && Number(data.targetPos) === targetPos && Number(data.targetHpBefore) === Number(mobRow[0].hp)
                && Number(data.targetHtBefore) === Number(mobRow[0].ht) && targetBuffPreStateMatches && targetShieldPreStateMatches
                && hasStrictNativeCombatFields(data) && data.engineResult === true
                && Number.isFinite(nativeCost) && nativeCost > 0 && nativeCost <= 10 && Number.isFinite(distance)
                && (ranged ? this.hasLineOfSight(attackerPos, targetPos, this.currentDepth) : this.isMeleeAdjacent(attackerPos, targetPos, this.currentDepth))
                && (targetPosAfter === targetPos || (this.isValidCombatTargetPosition(targetPosAfter, this.currentDepth)
                  && this.isCombatDestinationFree(targetPosAfter, this.currentDepth, "MOB", Number(mobId))))
                && isValidNativeMissTransition(data.engineHit, data.targetHpBefore, targetHp, damage, data.targetShieldBefore,
                  data.targetShieldAfter, data.targetBuffsBefore, data.targetBuffs, targetPos, targetPosAfter)
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
              if (authorityValid) {
                savedMob.hp = targetHp; savedMob.ht = targetHt; savedMob.pos = targetPosAfter;
                savedMob.shielding = Number(data.targetShieldAfter); savedMob.buffs = JSON.parse(String(data.targetBuffs));
                if (allDeaths.length > 0) levelSnapshot.heaps = lootSnapshot;
                this.sql.exec("UPDATE mobs SET hp = ?, pos = ? WHERE mob_id = ? AND depth = ?", targetHp, targetPosAfter, mobId, this.currentDepth);
                for (const delta of secondaryMobPayload.deltas) {
                  const secondaryId = resolveServerMobIdByEntityId(levelSnapshot, delta.entityId);
                  const secondary = levelSnapshot.mobs.find((mob: any) => Number(mob.mobId) === Number(secondaryId));
                  if (secondaryId == null || !secondary) throw new Error("Validated secondary mob disappeared");
                  secondary.hp = delta.hpAfter; secondary.ht = delta.htAfter; secondary.pos = delta.posAfter;
                  secondary.shielding = delta.shieldAfter; secondary.buffs = JSON.parse(delta.buffsAfter);
                  this.sql.exec("UPDATE mobs SET hp = ?, pos = ? WHERE mob_id = ? AND depth = ?", delta.hpAfter, delta.posAfter, secondaryId, this.currentDepth);
                }
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  "levelSnapshot:" + this.currentDepth, JSON.stringify(levelSnapshot));
                this.sql.exec("DELETE FROM room_meta WHERE key = ?", "pendingCombat:" + data.combatRequestId);
                if (allDeaths.length > 0) for (const heap of levelSnapshot.heaps) this.sql.exec(
                  "DELETE FROM claimed_items WHERE item_pos = ? AND depth = ?", Number(heap.pos), this.currentDepth);
                eventType = "PLAYER_ATTACKED";
                actionResultPayload = {
                  attackerId, attackerType: "PLAYER", targetId: data.targetEntityId, targetType: "MOB",
                  sourceType: "PLAYER", sourceEntityId: attackerId, sourcePos: attackerPos, sourceAttackKind: data.attackKind,
                  attackerPos, targetPos, targetPosAfter, targetHpBefore: Number(data.targetHpBefore), targetHtBefore: Number(data.targetHtBefore),
                  targetShieldBefore: Number(data.targetShieldBefore), targetShieldAfter: Number(data.targetShieldAfter), targetHeroStateJson: null,
                  targetBuffsBefore: data.targetBuffsBefore, hit: data.engineHit === true, damage, targetHp, targetHt,
                  attackKind: data.attackKind, engineDistance: distance, engineActionCost: nativeCost, targetBuffs: data.targetBuffs,
                  attackerStateJson: payload.heroStateJson, secondaryMobDeltas: secondaryMobPayload, engineResolved: true
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
              shieldAfter: data.shieldAfter, buffsAfter: data.buffsAfter
            };
            const ownerPayload = parseAndValidateNativeSecondaryMobDeltas({
              complete: true, deltas: [delta], ...(data.heaps === undefined ? {} : { heaps: data.heaps })
            }, levelSnapshot?.mobs, levelSize, width, true);
            const isOwner = isAuthorizedNativeMobOwner(session.playerId, publisherRow?.value);
            const nativeEnvelopeValid = data.combatSchemaVersion === 1
              && Number(data.combatDepth) === this.currentDepth
              && typeof data.sourceClass === "string" && data.sourceClass.length > 0 && data.sourceClass.length <= 256
              && data.engineDamageResult === true && ownerPayload != null
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
              if (deadPositions.length > 0) levelSnapshot.heaps = data.heaps;
              this.sql.exec(`UPDATE mobs SET hp = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                savedMob.hp, savedMob.pos, mobId, this.currentDepth);
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `levelSnapshot:${this.currentDepth}`, JSON.stringify(levelSnapshot));
              if (deadPositions.length > 0) {
                for (const heap of levelSnapshot.heaps) {
                  this.sql.exec(`DELETE FROM claimed_items WHERE item_pos = ? AND depth = ?`,
                    Number(heap.pos), this.currentDepth);
                }
              }
              eventType = "CHAR_DAMAGED";
              actionResultPayload = {
                targetId: data.entityId, targetType: "MOB",
                targetHpBefore: Number(data.hpBefore), targetHtBefore: Number(data.htBefore),
                targetHp: Number(data.hpAfter), targetHt: Number(data.htAfter),
                targetPosBefore: Number(data.posBefore), targetPosAfter: Number(data.posAfter),
                targetShieldBefore: Number(data.shieldBefore), targetShieldAfter: Number(data.shieldAfter),
                targetBuffsBefore: data.buffsBefore, targetBuffs: data.buffsAfter,
                sourceType: "ENVIRONMENT", sourceClass: data.sourceClass,
                engineResolved: true, ...(deadPositions.length > 0 ? { heaps: data.heaps } : {})
              };
              actionValid = true;
              actionCost = 0;
            }
            }
          } else if (actionStr === "SYNC_HERO_STATE" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data;
            if (data?.sourceType === "ENVIRONMENT") {
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
            const playerRow = this.sql.exec(`SELECT pos, hp, ht, state FROM players WHERE player_id = ?`, session.playerId).toArray()[0];
            const previousHeroRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `heroState:${session.playerId}`).toArray()[0];
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
              && isValidNativeCombatBuffs(data.sourceMobBuffs);
            const newHeroStateValid = isValidNativeHeroStateJson(payload.heroStateJson, {
              hp: Number(hp), ht: Number(ht), pos: Number(targetPosAfter), shielding: Number(targetShieldAfter)
            });
            const mergedDamagedHeroStateJson = mergeNativeHeroState(previousHeroRow?.value,
              payload.heroStateJson,
              { hp: Number(hp), ht: Number(ht), pos: Number(targetPosAfter), shielding: Number(targetShieldAfter) },
              data?.targetBuffs);
            const geometryValid = data?.sourceAttackKind === (sourceDistance <= 1 ? "MELEE" : "RANGED")
              && (sourceDistance <= 1
                ? this.isMeleeAdjacent(sourcePos, Number(targetPosBefore), this.currentDepth)
                : sourceDistance <= 8 && this.hasLineOfSight(sourcePos, Number(targetPosBefore), this.currentDepth));
            const targetPosValid = Number.isInteger(targetPosAfter) && targetPosAfter >= 0 && targetPosAfter < levelSize
              && targetMoveDistance <= 8
              && (targetPosAfter === targetPosBefore || (this.isValidCombatTargetPosition(Number(targetPosAfter), this.currentDepth)
                && this.isCombatDestinationFree(Number(targetPosAfter), this.currentDepth, "PLAYER", session.playerId)));
            const previousHp = Number(playerRow?.hp);
            const previousHt = Number(playerRow?.ht);
            const validDamage = !!playerRow && String(playerRow.state) === "ALIVE"
              && hasStrictNativeDamageFields(data)
              && hasMatchingNativeHeroBuffSnapshot(data.targetBuffsBefore, previousHeroState)
              && data.combatDepth === this.currentDepth
              && Number.isInteger(hp) && Number.isInteger(ht) && Number.isInteger(damage)
              && Number.isInteger(targetPosBefore) && targetPosBefore === Number(playerRow.pos)
              && Number.isInteger(targetPosAfter) && Number.isInteger(targetShieldBefore) && Number.isInteger(targetShieldAfter)
              && (previousHeroState == null || !Number.isInteger(previousHeroState?.shielding)
                || targetShieldBefore === previousHeroState.shielding)
              && targetShieldBefore >= 0 && targetShieldBefore <= 100000
              && targetShieldAfter >= 0 && targetShieldAfter <= 100000
              && hp >= 0 && hp <= previousHp && ht === previousHt
              && data.targetHpBefore === previousHp && data.targetHtBefore === previousHt
              && isValidNativeHpTransition(previousHp, hp, damage)
              && (damage > 0 || targetShieldAfter < targetShieldBefore || Number(data.sourceMobDamage) > 0
                || sourceMobPosAfter !== sourceMobPosBefore || sourceMobBuffsChanged)
              && newHeroStateValid && mergedDamagedHeroStateJson != null
              && isValidNativeCombatBuffs(data.targetBuffs)
              && sourceMob.length > 0 && Number(sourceMob[0].hp) > 0
              && Number(sourceMob[0].pos) === sourcePos && geometryValid && targetPosValid
              && sourceMobStateValid;
            if (validDamage) {
              const oldState = String(playerRow.state);
              const newState = hp === 0
                ? (this.gameMode === "DEATHMATCH" ? "ALIVE" : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD")
                : "ALIVE";
              this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?`,
                hp, ht, targetPosAfter, newState, session.playerId);
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `heroState:${session.playerId}`, mergedDamagedHeroStateJson);
              this.sql.exec(`UPDATE mobs SET hp = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                sourceMobHpAfter, sourceMobPosAfter, sourceMobId, this.currentDepth);
              const savedSourceMob = (Array.isArray(sourceLevel?.mobs) ? sourceLevel.mobs : [])
                .find((mob: any) => Number(mob?.mobId) === Number(sourceMobId));
              if (!savedSourceMob) throw new Error("Accepted source mob missing from native snapshot");
              savedSourceMob.hp = sourceMobHpAfter;
              savedSourceMob.ht = sourceMobHtAfter;
              savedSourceMob.shielding = Number(data.sourceMobShieldAfter);
              savedSourceMob.pos = sourceMobPosAfter;
              savedSourceMob.buffs = JSON.parse(String(data.sourceMobBuffs));
              if (sourceMobHpAfter <= 0) sourceLevel.heaps = data.heaps;
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `levelSnapshot:${this.currentDepth}`, JSON.stringify(sourceLevel));
              if (sourceMobHpAfter <= 0) {
                for (const heap of sourceLevel.heaps) {
                  this.sql.exec(`DELETE FROM claimed_items WHERE item_pos = ? AND depth = ?`, Number(heap.pos), this.currentDepth);
                }
              }
              if (oldState !== "DEAD" && oldState !== "SPECTATOR" && (newState === "DEAD" || newState === "SPECTATOR")) {
                this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, session.playerId);
              }
              eventType = "PLAYER_DAMAGED";
              actionResultPayload = {
                attackerId: data.sourceEntityId, attackerType: "MOB", attackerPos: sourcePos,
                sourceType: "MOB", sourceEntityId: data.sourceEntityId, sourcePos,
                sourceAttackKind: data.sourceAttackKind, attackKind: data.sourceAttackKind,
                engineDistance: sourceDistance, engineActionCost: data.sourceActionCost,
                targetId: session.playerId, targetType: "PLAYER",
                targetHpBefore: previousHp, targetHtBefore: previousHt, targetHp: hp, targetHt: ht,
                targetPos: targetPosBefore, targetPosAfter, targetShieldBefore, targetShieldAfter,
                targetState: newState, hit: true, damage, effectiveDamage: Number(data.effectiveDamage) || damage,
                targetBuffsBefore: data.targetBuffsBefore, targetBuffs: data.targetBuffs,
                targetHeroStateJson: payload.heroStateJson,
                sourceMobHpBefore, sourceMobHtBefore, sourceMobShieldBefore: Number(data.sourceMobShieldBefore),
                sourceMobHpAfter, sourceMobHtAfter, sourceMobShieldAfter: Number(data.sourceMobShieldAfter),
                sourceMobPosBefore, sourceMobPosAfter, sourceMobDamage: Number(data.sourceMobDamage),
                sourceMobBuffsBefore: data.sourceMobBuffsBefore, sourceMobBuffs: data.sourceMobBuffs,
                ...(sourceMobHpAfter <= 0 ? { heaps: data.heaps } : {}),
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
            const shieldBefore = Number(data.targetShieldBefore), shieldAfter = Number(data.targetShieldAfter);
            const targetBuffs = data.targetBuffs;
            const mergedJson = mergeNativeHeroState(previousHeroRow?.value, payload.heroStateJson,
              { hp, ht, pos, shielding: shieldAfter }, targetBuffs);
            const validRevival = !!playerRow && String(playerRow.state) === "ALIVE"
              && Number(data.targetHpBefore) === Number(playerRow.hp)
              && Number(data.targetHtBefore) === Number(playerRow.ht) && Number(data.targetPosBefore) === Number(playerRow.pos)
              && hp > 0 && Number.isInteger(hp) && Number.isInteger(ht) && ht === Number(playerRow.ht)
              && hp === Math.floor(ht / 4) && pos === Number(playerRow.pos)
              && Number.isInteger(shieldBefore) && shieldBefore >= 0 && shieldBefore <= 100000
              && Number.isInteger(shieldAfter) && shieldAfter >= 0 && shieldAfter <= 100000
              && previousHeroState != null && Number(previousHeroState.hp) === Number(playerRow.hp)
              && Number(previousHeroState.ht) === Number(playerRow.ht) && Number(previousHeroState.pos) === Number(playerRow.pos)
              && Number(previousHeroState.shielding) === shieldBefore
              && hasMatchingNativeHeroBuffSnapshot(data.targetBuffsBefore, previousHeroState)
              && isValidNativeCombatBuffs(targetBuffs)
              && isValidNativeHeroStateJson(payload.heroStateJson, { hp, ht, pos, shielding: shieldAfter })
              && hasValidBlessedAnkhConsumption(previousHeroRow?.value, payload.heroStateJson)
              && Number(data.ankhCountBefore) === Number(previousHeroState.ankhCount)
              && Number(data.ankhCountAfter) === Number(reportedHeroState?.ankhCount)
              && Number(data.blessedAnkhCountBefore) === Number(previousHeroState.blessedAnkhCount)
              && Number(data.blessedAnkhCountAfter) === Number(reportedHeroState?.blessedAnkhCount)
              && mergedJson != null;
            if (validRevival) {
              const merged: any = JSON.parse(mergedJson as string);
              merged.inventoryBundle = reportedHeroState.inventoryBundle;
              merged.ankhCount = reportedHeroState.ankhCount;
              merged.blessedAnkhCount = reportedHeroState.blessedAnkhCount;
              const storedHeroState = JSON.stringify(merged);
              this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = 'ALIVE' WHERE player_id = ?`,
                hp, ht, pos, session.playerId);
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `heroState:${session.playerId}`, storedHeroState);
              eventType = "PLAYER_REVIVED";
              actionResultPayload = { playerId: session.playerId, hp, ht, pos, shielding: shieldAfter,
                targetBuffs, heroStateJson: storedHeroState, ankhCount: reportedHeroState.ankhCount,
                blessedAnkhCount: reportedHeroState.blessedAnkhCount };
              actionValid = true;
              actionCost = 0;
            }
          } else if (actionStr === "MOVE" && targetPos >= 0) {
            const playerRow = this.sql.exec(`SELECT pos, state FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0 && String(playerRow[0].state) === "ALIVE") {
              const currentPos = Number(playerRow[0].pos);
              const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray();
              const mapWidth = levelRow.length > 0 ? Number(levelRow[0].width) : 32;
              const mapHeight = levelRow.length > 0 ? Number(levelRow[0].height) : 32;
              const dx = Math.abs((currentPos % mapWidth) - (targetPos % mapWidth));
              const dy = Math.abs(Math.floor(currentPos / mapWidth) - Math.floor(targetPos / mapWidth));
              const inBounds = targetPos < mapWidth * mapHeight;
              const adjacent = dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
              let cornerBlocked = false;
              if (dx === 1 && dy === 1) {
                const sideA = currentPos + (targetPos % mapWidth > currentPos % mapWidth ? 1 : -1);
                const sideB = currentPos + (Math.floor(targetPos / mapWidth) > Math.floor(currentPos / mapWidth) ? mapWidth : -mapWidth);
                const sideRows = this.sql.exec(`SELECT passable, solid FROM level_tiles WHERE depth = ? AND pos IN (?, ?)`, this.currentDepth, sideA, sideB).toArray();
                cornerBlocked = sideRows.length !== 2 || sideRows.some((tile: any) => Number(tile.passable) !== 1 || Number(tile.solid) === 1);
              }
              const tileRow = inBounds ? this.sql.exec(`SELECT passable, solid, pit FROM level_tiles WHERE depth = ? AND pos = ?`, this.currentDepth, targetPos).toArray() : [];
              if (adjacent && inBounds && !cornerBlocked && tileRow.length > 0
                  && Number(tileRow[0].passable) === 1 && Number(tileRow[0].solid) === 0
                  && Number(tileRow[0].pit) === 0) {
                this.sql.exec(`UPDATE players SET pos = ? WHERE player_id = ?`, targetPos, session.playerId);
                eventType = "PLAYER_MOVED";
                actionResultPayload = { playerId: session.playerId, pos: targetPos };
                actionValid = true;
                const nativeMoveCost = Number(payload.data?.engineActionCost);
                actionCost = Number.isFinite(nativeMoveCost) ? Math.max(0.05, Math.min(10, nativeMoveCost)) : 1.0;
              }
            }
          } else if (actionStr === "LVL_TRANSITION") {
            const playerRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0) {
              const currentPos = Number(playerRow[0].pos);
              const transRow = this.sql.exec(`SELECT target_depth FROM level_transitions WHERE depth = ? AND pos = ? AND type = 'EXIT'`, this.currentDepth, currentPos).toArray();
              if (transRow.length > 0) {
                const targetDepth = Number(transRow[0].target_depth);
                this.currentDepth = targetDepth;
                this.sql.exec(`UPDATE room_meta SET value = ? WHERE key = 'depth'`, this.currentDepth.toString());

                this.ensureLevelGenerated(this.currentDepth);

                const newEntranceRow = this.sql.exec(`SELECT entrance_pos FROM levels WHERE depth = ?`, this.currentDepth).toArray();
                const newPos = newEntranceRow.length > 0 ? Number(newEntranceRow[0].entrance_pos) : 100;
                if (this.gameMode === "COOP_DUNGEON" || this.gameMode === "SURVIVAL") {
                  this.sql.exec(`UPDATE players SET pos = ? WHERE state = 'ALIVE'`, newPos);
                } else {
                  this.sql.exec(`UPDATE players SET pos = ? WHERE player_id = ?`, newPos, session.playerId);
                }

                eventType = "LEVEL_TRANSITION";
                actionResultPayload = { depth: this.currentDepth, newPos };
                actionValid = true;
                actionCost = 1.0;
              }
            }
          } else if (actionStr === "ATTACK" && isValidNativeCombatRequestId(msg.requestId)) {
            let targetId = payload.data?.targetId || payload.targetId;
            const targetType = payload.data?.targetType || payload.targetType || "MOB";
            if (targetType === "MOB") {
              const publisherRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray()[0];
              const publisherId = String(publisherRow?.value || "");
              if (publisherId && publisherId !== session.playerId) {
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
                  && hasMatchingNativeHeroEquipmentState(attackerStateBefore, trustedHeroState);
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
                  depth: this.currentDepth, attackerStateBefore
                };
                this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                  `pendingCombat:${msg.requestId}`, JSON.stringify(pending));
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
                      attackerStateBefore
                    })
                  }));
                }
                if (!authorityFound) {
                  this.sql.exec(`DELETE FROM room_meta WHERE key = ?`, `pendingCombat:${msg.requestId}`);
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
                depth: this.currentDepth, attackerStateBefore, targetHeroStateBefore: defenderStateBefore };
              this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                "pendingCombat:" + msg.requestId, JSON.stringify(pending));
              let authorityFound = false;
              for (const authorityWs of this.state.getWebSockets()) {
                const authoritySession = authorityWs.deserializeAttachment() as SessionData | null;
                if (!authoritySession || authoritySession.playerId !== defenderId) continue;
                authorityFound = true;
                authorityWs.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "COMBAT_REQUEST",
                  senderId: "SERVER", requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ requestId: msg.requestId, attackerId: session.playerId,
                    targetType: "PLAYER", targetPlayerId: defenderId, attackerPos, targetPos: defenderPos,
                    attackerStateBefore, targetHeroStateBefore: defenderStateBefore }) }));
              }
              if (!authorityFound) {
                this.sql.exec("DELETE FROM room_meta WHERE key = ?", "pendingCombat:" + msg.requestId);
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

            const attackerRow = this.sql.exec(`SELECT pos FROM players WHERE player_id = ?`, session.playerId).toArray();
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
                    const secondaryMobPayload = parseAndValidateNativeSecondaryMobDeltas(
                      payload.data?.secondaryMobDeltas, combatLevel?.mobs, levelSize, width);
                    const secondaryDeathPositions = (secondaryMobPayload?.deltas || [])
                      .filter((delta: any) => Number(delta.hpAfter) === 0)
                      .map((delta: any) => Number(delta.posAfter));
                    const allDeathPositions = [
                      ...(targetHp <= 0 ? [targetPosAfter] : []),
                      ...secondaryDeathPositions
                    ];
                    const lootSnapshot = targetHp <= 0 ? payload.data?.heaps
                      : secondaryDeathPositions.length > 0 ? secondaryMobPayload?.heaps : undefined;
                    const validLootSnapshot = secondaryMobPayload != null
                      && (allDeathPositions.length === 0
                        ? payload.data?.heaps === undefined && secondaryMobPayload.heaps === undefined
                        : isValidNativeLootSnapshot(lootSnapshot, combatLevel?.heaps, allDeathPositions, levelSize));
                    const validNativeTarget = requestedPos === mobPos && nativeCostValid
                      && hasStrictNativeCombatFields(payload.data)
                      && targetBuffPreStateMatches
                      && targetShieldPreStateMatches
                      && isValidNativeMissTransition(payload.data?.engineHit,
                        payload.data?.targetHpBefore, targetHp, reportedDamage,
                        payload.data?.targetShieldBefore, payload.data?.targetShieldAfter,
                        payload.data?.targetBuffsBefore, payload.data?.targetBuffs,
                        mobPos, targetPosAfter)
                      && validLootSnapshot
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
                      this.sql.exec(`UPDATE mobs SET hp = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                        newHp, targetPosAfter, targetId, this.currentDepth);
                      const savedMob = (Array.isArray(combatLevel?.mobs) ? combatLevel.mobs : [])
                        .find((mob: any) => Number(mob?.mobId) === Number(targetId));
                      if (!savedMob) throw new Error("Accepted combat target missing from native snapshot");
                      savedMob.hp = newHp;
                      savedMob.ht = targetHt;
                      savedMob.pos = targetPosAfter;
                      savedMob.buffs = JSON.parse(String(payload.data.targetBuffs));
                       savedMob.shielding = Number(payload.data.targetShieldAfter);
                      if (allDeathPositions.length > 0) combatLevel.heaps = lootSnapshot;
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
                        this.sql.exec(`UPDATE mobs SET hp = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                          delta.hpAfter, delta.posAfter, secondaryMobId, this.currentDepth);
                      }
                      this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                        ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                        `levelSnapshot:${this.currentDepth}`, JSON.stringify(combatLevel));
                      if (allDeathPositions.length > 0) {
                        for (const heap of combatLevel.heaps) {
                          this.sql.exec(`DELETE FROM claimed_items WHERE item_pos = ? AND depth = ?`, Number(heap.pos), this.currentDepth);
                        }
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
                        hit: payload.data?.engineHit === true, damage: rawDmg, targetHp: newHp,
                        targetHt, attackKind: payload.data?.attackKind, engineDistance: distance, engineActionCost: nativeCost,
                        targetBuffs: payload.data.targetBuffs, attackerStateJson: payload.heroStateJson,
                        secondaryMobDeltas: secondaryMobPayload,
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
          } else if (actionStr === "PICKUP") {
            const itemPos = Number(payload.data?.itemPos ?? targetPos);
            const savedRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const heaps = levelSnapshot && Array.isArray(levelSnapshot.heaps) ? levelSnapshot.heaps : [];
            const heapIndex = heaps.findIndex((heap: any) => Number(heap.pos) === itemPos);
            const heap = heapIndex >= 0 ? heaps[heapIndex] : null;
            const items = heap && Array.isArray(heap.items) ? heap.items : [];
            const itemClass = String(payload.data?.itemClass || "");
            const itemIndex = items.findIndex((item: any) => String(item.className || "") === itemClass);
            if (heap && items.length > 0 && itemPos >= 0) {
              items.splice(itemIndex >= 0 ? itemIndex : 0, 1);
              const remainingItemCount = items.length;
              if (remainingItemCount === 0) {
                heaps.splice(heapIndex, 1);
                this.sql.exec(`INSERT OR REPLACE INTO claimed_items (item_pos, depth, claimed_by) VALUES (?, ?, ?)`,
                  itemPos, this.currentDepth, session.playerId);
              } else {
                this.sql.exec(`DELETE FROM claimed_items WHERE item_pos = ? AND depth = ?`, itemPos, this.currentDepth);
              }
              levelSnapshot.heaps = heaps;
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `levelSnapshot:${this.currentDepth}`, JSON.stringify(levelSnapshot));
              eventType = "ITEM_PICKED_UP";
              actionResultPayload = { itemPos, itemClass, remainingItemCount, claimedBy: session.playerId };
              actionValid = true;
              actionCost = 1.0;
            }
          } else if (actionStr === "OPEN_CHEST") {
            const itemPos = Number(payload.data?.itemPos ?? targetPos);
            const existingClaim = this.sql.exec(`SELECT claimed_by FROM claimed_items WHERE item_pos = ? AND depth = ?`, itemPos, this.currentDepth).toArray();
            if (existingClaim.length > 0) {
              ws.send(JSON.stringify({
                protocolVersion: "1.0.0",
                messageType: "ERROR",
                requestId: msg.requestId,
                sequence: this.currentSequence,
                payloadJson: JSON.stringify({ error: "ITEM_ALREADY_CLAIMED", itemPos })
              }));
              return;
            }
            this.sql.exec(`INSERT INTO claimed_items (item_pos, depth, claimed_by) VALUES (?, ?, ?)`, itemPos, this.currentDepth, session.playerId);
            eventType = "CHEST_OPENED";
            actionResultPayload = { itemPos, claimedBy: session.playerId };
            actionValid = true;
            actionCost = 1.0;
          }
          if (actionValid && typeof payload.heroStateJson === "string"
              && payload.heroStateJson.length > 0 && payload.heroStateJson.length <= 200000) {
            // An ordinary MOVE/ATTACK payload must never overwrite the server's trusted
            // class/equipment/talent baseline. Combat branches update state only after validation.
            this.sql.exec(`INSERT OR IGNORE INTO room_meta (key,value) VALUES (?,?)`,
              `heroState:${session.playerId}`, payload.heroStateJson);
          }
        } catch (_) {}

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
              msg.requestId, session.playerId, this.currentSequence, resultJson
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
          if (eventType !== "PLAYER_DAMAGED" && eventType !== "PLAYER_REVIVED" && eventType !== "CHAR_DAMAGED") this.processMobTurns();
        } else {
          ws.send(JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ERROR",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify({ error: "INVALID_ACTION" })
          }));
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
        const claims = this.sql.exec(`SELECT item_pos, claimed_by FROM claimed_items WHERE depth = ?`, this.currentDepth).toArray();

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
            claims,
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
    const liveMobs = this.sql.exec(`SELECT mob_id,name,pos,hp,ht,str,dmg_max,next_act_at,state FROM mobs WHERE depth = ?`, this.currentDepth).toArray();
    return {
      ...originalWorld,
      depth: Number(level.depth), width: Number(level.width), height: Number(level.height),
      entrancePos: Number(level.entrance_pos), exitPos: Number(level.exit_pos), seed: Number(level.seed),
      tiles: this.sql.exec(`SELECT pos,terrain,passable,solid,pit,los_blocking FROM level_tiles WHERE depth = ? ORDER BY pos`, this.currentDepth).toArray(),
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
      plants: Array.isArray(original.plants) ? original.plants : [],
      claims: this.sql.exec(`SELECT item_pos,claimed_by FROM claimed_items WHERE depth = ?`, this.currentDepth).toArray()
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

  /** Finds the shortest legal 8-way SPD-style step without cutting corners or overlapping actors. */
  private findNextMobStep(start: number, target: number, width: number, depth: number, mobId: number): number {
    const levelRows = this.sql.exec(
      `SELECT pos, passable, solid, pit FROM level_tiles WHERE depth = ?`, depth
    ).toArray();
    const tiles = new Map<number, { passable: number; solid: number; pit: number }>();
    for (const row of levelRows) {
      tiles.set(Number(row.pos), {
        passable: Number(row.passable), solid: Number(row.solid), pit: Number(row.pit)
      });
    }
    const mobRows = this.sql.exec(`SELECT pos FROM mobs WHERE depth = ? AND hp > 0 AND mob_id != ?`, depth, mobId).toArray();
    const occupied = new Set<number>(mobRows.map((row: any) => Number(row.pos)));
    const playerRows = this.sql.exec(`SELECT pos FROM players WHERE state = 'ALIVE'`).toArray();
    for (const row of playerRows) occupied.add(Number(row.pos));

    const height = levelRows.length / Math.max(1, width);
    const count = Math.floor(width * height);
    if (start < 0 || target < 0 || start >= count || target >= count || width < 1) return -1;
    const queue = new Int32Array(count);
    const previous = new Int32Array(count);
    const firstStep = new Int32Array(count);
    previous.fill(-2);
    previous[start] = -1;
    let head = 0, tail = 0;
    queue[tail++] = start;
    const targetX = target % width, targetY = Math.floor(target / width);
    let goal = -1;
    const dirs = [-1, 0, 1];

    while (head < tail) {
      const current = queue[head++];
      if (current !== start) {
        const cx = current % width, cy = Math.floor(current / width);
        if (Math.abs(cx - targetX) <= 1 && Math.abs(cy - targetY) <= 1
          && (cx !== targetX || cy !== targetY)) {
          goal = current;
          break;
        }
      }
      const x = current % width, y = Math.floor(current / width);
      for (const dy of dirs) for (const dx of dirs) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny * width + nx >= count) continue;
        const next = ny * width + nx;
        if (previous[next] !== -2 || occupied.has(next)) continue;
        const tile = tiles.get(next);
        if (!tile || tile.passable !== 1 || tile.solid === 1 || tile.pit === 1) continue;
        if (dx !== 0 && dy !== 0) {
          const sideA = tiles.get(y * width + nx);
          const sideB = tiles.get(ny * width + x);
          if (!sideA || !sideB || sideA.passable !== 1 || sideA.solid === 1 || sideA.pit === 1
            || sideB.passable !== 1 || sideB.solid === 1 || sideB.pit === 1) continue;
        }
        previous[next] = current;
        firstStep[next] = current === start ? next : firstStep[current];
        queue[tail++] = next;
      }
    }
    return goal < 0 ? -1 : firstStep[goal];
  }

  private getNativeMobTurnDelay(mobId: number): number {
    try {
      const row = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `levelSnapshot:${this.currentDepth}`).toArray()[0];
      if (row && typeof row.value === "string") {
        const snapshot = JSON.parse(String(row.value));
        const mobs = Array.isArray(snapshot.mobs) ? snapshot.mobs : [];
        const mob = mobs.find((entry: any) => Number(entry.mobId) === mobId);
        const speed = Number(mob?.baseSpeed);
        if (Number.isFinite(speed) && speed > 0) return Math.max(0.05, Math.min(10, 1 / speed));
      }
    } catch (_) {}
    return 1.0;
  }

  private processMobTurns() {
    if (this.gameStatus === "ENDED") return;
    const activeMobs = this.sql.exec(`SELECT mob_id, name, pos, hp, next_act_at FROM mobs WHERE depth = ? AND hp > 0 AND next_act_at <= ? ORDER BY next_act_at ASC, mob_id ASC`, this.currentDepth, this.worldTime).toArray();
    const activePlayers = this.sql.exec(`SELECT pos FROM players WHERE state = 'ALIVE'`).toArray();

    if (activeMobs.length === 0 || activePlayers.length === 0) return;

    const levelRow = this.sql.exec(`SELECT width FROM levels WHERE depth = ?`, this.currentDepth).toArray();
    const mapWidth = levelRow.length > 0 ? Number(levelRow[0].width) : 32;

    for (const mob of activeMobs) {
      const mobId = Number(mob.mob_id);
      const mobPos = Number(mob.pos);

      let closestPlayer: any = null;
      let minDistance = 999999;

      for (const player of activePlayers) {
        const playerPos = Number(player.pos);
        {
          const dx = Math.abs((mobPos % mapWidth) - (playerPos % mapWidth));
          const dy = Math.abs(Math.floor(mobPos / mapWidth) - Math.floor(playerPos / mapWidth));
          const dist = Math.max(dx, dy) + (this.hasLineOfSight(mobPos, playerPos, this.currentDepth) ? 0 : 2);
          if (dist < minDistance) {
            minDistance = dist;
            closestPlayer = player;
          }
        }
      }

      if (!closestPlayer) {
        this.sql.exec(`UPDATE mobs SET next_act_at = ? WHERE mob_id = ?`, this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);
        continue;
      }

      const targetPos = Number(closestPlayer.pos);

      const dx = Math.abs((mobPos % mapWidth) - (targetPos % mapWidth));
      const dy = Math.abs(Math.floor(mobPos / mapWidth) - Math.floor(targetPos / mapWidth));

      if (this.isMeleeAdjacent(mobPos, targetPos, this.currentDepth)) {
        // Do not approximate SPD hit chance, armor DR, buffs or damage with server-side RNG.
        // The original Java engine resolves the attack on the owning client and reports the
        // resulting HP through SYNC_HERO_STATE. The server only advances this mob's native turn.
        this.sql.exec(`UPDATE mobs SET next_act_at = ? WHERE mob_id = ?`,
          this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);
      } else if (Math.max(dx, dy) <= 8) {
        const nextPos = this.findNextMobStep(mobPos, targetPos, mapWidth, this.currentDepth, mobId);
        if (nextPos >= 0) {
          this.sql.exec(`UPDATE mobs SET pos = ?, next_act_at = ? WHERE mob_id = ?`, nextPos, this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);
          this.currentSequence++;
          const movePayload = { mobId, fromPos: mobPos, toPos: nextPos };
          this.sql.exec(
            `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, 'SERVER', 'MOB_MOVED', ?)`,
            this.currentSequence, JSON.stringify(movePayload)
          );
          this.broadcast({
            protocolVersion: "1.0.0",
            messageType: "EVENT_BATCH",
            senderId: "SERVER",
            sequence: this.currentSequence,
            payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType: "MOB_MOVED", depth: this.currentDepth, action: movePayload }])
          });
        } else {
          this.sql.exec(`UPDATE mobs SET next_act_at = ? WHERE mob_id = ?`, this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);
        }
      } else {
        // A mob that cannot currently reach a visible target still consumes its turn.
        this.sql.exec(`UPDATE mobs SET next_act_at = ? WHERE mob_id = ?`, this.worldTime + this.getNativeMobTurnDelay(mobId), mobId);
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
