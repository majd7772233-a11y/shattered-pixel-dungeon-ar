import { parseNativeBundleObject } from "./abilities";
import { sameNativeItemValue } from "./inventory-economy";
import { hasCompleteNativeLevelSnapshot, isValidNativeMobBuffExpiryTurn } from "./world-state";

export function isValidNativeWorldTurnSnapshot(
  previous: any,
  next: any,
  lastAcceptedTurn: unknown,
  expectedDepth: number,
  trustedHeroStateValue?: unknown
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
    if (!isValidNativeMobBuffExpiryTurn(previous,next,trustedHeroStateValue)) return false;
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

/** Stable reward identity prevents the same native Mob death paying out under a new request ID. */
export function nativeMobKillRewardIds(depthValue: unknown, targetEntityIdValue: unknown,
  targetHpValue: unknown, secondaryDeltasValue: unknown): string[] | null {
  const depth = Number(depthValue), targetHp = Number(targetHpValue);
  if (!Number.isInteger(depth) || depth < 1 || depth > 100
      || !Number.isInteger(targetHp) || targetHp < 0
      || !Array.isArray(secondaryDeltasValue) || secondaryDeltasValue.length > 512) return null;
  const ids: string[] = [];
  const add = (entityIdValue: unknown) => {
    const entityId = String(entityIdValue || "");
    if (!/^[A-Za-z0-9._:-]{8,80}$/.test(entityId) || ids.includes(entityId)) return false;
    ids.push(entityId);
    return true;
  };
  if (targetHp === 0 && !add(targetEntityIdValue)) return null;
  for (const delta of secondaryDeltasValue) {
    if (Number(delta?.hpAfter) === 0 && !add(delta?.entityId)) return null;
  }
  return ids.map(entityId => "mob-kill:" + depth + ":" + entityId);
}

export function areNativeMobRewardClaimsAvailable(rewardIdsValue: unknown, existingRewardIdsValue: unknown): boolean {
  if (!Array.isArray(rewardIdsValue) || !Array.isArray(existingRewardIdsValue)) return false;
  const requested = new Set<string>();
  for (const rewardIdValue of rewardIdsValue) {
    const rewardId = String(rewardIdValue || "");
    if (rewardId.length < 1 || rewardId.length > 128 || requested.has(rewardId)) return false;
    requested.add(rewardId);
  }
  const existing = new Set<string>(existingRewardIdsValue.map(value => String(value)));
  return [...requested].every(rewardId => !existing.has(rewardId));
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
      && (state?.runProgressBundle === undefined
        || (typeof state.runProgressBundle === "string" && state.runProgressBundle.length > 0
          && state.runProgressBundle.length <= 200000))
      && ["potionStatusBundle", "scrollStatusBundle"].every((key) =>
        state?.[key] === undefined || (typeof state[key] === "string" && state[key].length <= 200000))
      && ["notesBundle", "questStateBundle"].every((key) =>
        state?.[key] === undefined || (typeof state[key] === "string"
          && state[key].length > 0 && state[key].length <= 200000))
      && ["ironKeyCount", "crystalKeyCount", "wornKeyCount", "goldenKeyCount"].every((key) =>
        state?.[key] === undefined || (Number.isInteger(state[key]) && state[key] >= 0 && state[key] <= 100000))
      && Number.isInteger(state?.buffCount) && state.buffCount >= 0 && state.buffCount <= 256;
  } catch (_) { return false; }
}

export function mergeNativeHeroState(previousValue: unknown, reportedValue: unknown, expected: {
  hp: number; ht: number; pos: number; shielding: number;
}, targetBuffsValue: unknown, allowBlessedAnkhConsumption = false, preserveCooldown = true,
preserveInventory = true, preserveRunProgress = true): string | null {
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
  const inventoryAccepted = blessedAnkhConsumed || !preserveInventory;
  const runProgressAccepted = previous.runProgressBundle === undefined || !preserveRunProgress;
  const merged: any = {
    ...previous,
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
  if (inventoryAccepted) {
    for (const key of ["inventoryBundle", "nativeInventoryTreeVersion", "inventoryItemsJson",
      "nativeItemEconomyJson", "quickslotsJson", "gold", "alchemyEnergy"]) {
      if (reported[key] !== undefined) merged[key] = reported[key];
    }
  }
  if (blessedAnkhConsumed) {
    merged.ankhCount = reported.ankhCount;
    merged.blessedAnkhCount = reported.blessedAnkhCount;
  }
  if (runProgressAccepted) {
    for (const key of ["runProgressBundle", "potionStatusBundle", "scrollStatusBundle",
      "notesBundle", "questStateBundle", "ironKeyCount", "crystalKeyCount",
      "wornKeyCount", "goldenKeyCount"]) {
      if (reported[key] !== undefined) merged[key] = reported[key];
    }
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
  // Run-scoped rewards (statistics, catalog usage and generation counters) can change
  // after any accepted native attack, not only a lethal one. The authority's exact pre-state
  // is bound above; keep the separate max-HP increase gate tied only to kill outcomes.
  return mergeNativeHeroState(trustedValue, afterValue, {
    hp: Number(after.hp), ht: Number(after.ht), pos: Number(after.pos), shielding: Number(after.shielding)
  }, buffs, hasValidBlessedAnkhConsumption(trusted, after), false, false, false);
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

export function comparableBuffs(value: any): string {
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
  if (authoritative.runProgressBundle !== undefined
      && (typeof reported.runProgressBundle !== "string"
        || reported.runProgressBundle !== authoritative.runProgressBundle)) return false;
  if (authoritative.runProgressBundle === undefined && reported.runProgressBundle !== undefined
      && (typeof reported.runProgressBundle !== "string" || reported.runProgressBundle.length < 1
        || reported.runProgressBundle.length > 200000)) return false;
  // These fields are part of the trusted pre-action state. A mutation intent cannot rewrite
  // quest progress, journal discoveries, key counts or identification knowledge before its
  // action has been accepted and the authoritative post-state is validated.
  for (const key of ["potionStatusBundle", "scrollStatusBundle", "notesBundle", "questStateBundle",
    "ironKeyCount", "crystalKeyCount", "wornKeyCount", "goldenKeyCount"]) {
    if (reported[key] !== authoritative[key]) return false;
  }
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
    if (!next || !saved || typeof next.combatBundle !== "string" || next.combatBundle.length < 1
        || next.combatBundle !== saved.combatBundle || typeof next.inventoryBundle !== "string"
        || next.inventoryBundle.length < 1 || next.inventoryBundle !== saved.inventoryBundle) return false;
    // Potion/Scroll ItemStatusHandlers are per-player run knowledge. Bind the reported
    // pre-state to the server-held state so a client cannot invent a favorable "unknown" baseline.
    for (const field of ["potionStatusBundle", "scrollStatusBundle"]) {
      const hasNext = Object.prototype.hasOwnProperty.call(next, field);
      const hasSaved = Object.prototype.hasOwnProperty.call(saved, field);
      if (hasNext !== hasSaved) return false;
      if (hasNext && (typeof next[field] !== "string" || next[field].length < 2
          || next[field] !== saved[field])) return false;
    }
    return true;
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

/** Parses only LifeLink collateral damage: every changed entity must be one of the
 * Hero's exact native LifeLink.object Mob IDs, and the Mob must not move or heal during damage.
 */
export function parseAndValidateNativeLifeLinkMobDeltas(
  value: unknown, savedMobsValue: unknown, linkedEntityIdsValue: unknown,
  levelSize: number, width: number
): NativeSecondaryMobDeltaPayload | null {
  if (!Array.isArray(linkedEntityIdsValue) || linkedEntityIdsValue.length > 512
      || !Array.isArray(savedMobsValue)) return null;
  const linked = new Set<string>();
  for (const entityId of linkedEntityIdsValue) {
    if (typeof entityId !== "string" || !/^[A-Za-z0-9._:-]{8,80}$/.test(entityId) || linked.has(entityId)) return null;
    linked.add(entityId);
  }
  const payload = parseAndValidateNativeSecondaryMobDeltas(value, savedMobsValue, levelSize, width, false);
  if (!payload) return null;
  const savedById = new Map<string,any>((savedMobsValue as any[]).map(mob=>[String(mob?.entityId || ""),mob]));
  for (const delta of payload.deltas) {
    if (!linked.has(delta.entityId) || delta.posAfter !== delta.posBefore) return null;
    const saved = savedById.get(delta.entityId);
    const beforeRoot = parseNativeBundleObject(saved?.serializedBundle);
    const beforeMob = beforeRoot?.mob;
    const afterRoot = parseNativeBundleObject(delta.serializedBundleAfter);
    const afterMob = afterRoot?.mob;
    if (!beforeMob || Number(beforeMob.id)!==Number(saved.mobId)
        || String(beforeMob.__className || "") === ""
        || String(beforeMob.__className || "") !== String(afterMob?.__className || "")
        || Number(beforeMob.HP)!==Number(delta.hpBefore)
        || Number(beforeMob.HT)!==Number(delta.htBefore)
        || Number(beforeMob.pos)!==Number(delta.posBefore)) return null;

    if (delta.hpAfter === 0) {
      // NativeMobCombatDelta emits a tombstone containing the exact trusted pre-death Mob
      // bundle and an empty post-death Buff list; the authoritative heap snapshot carries loot.
      if (delta.serializedBundleAfter !== String(saved.serializedBundle || "")
          || delta.buffsAfter !== "[]" || delta.shieldAfter !== 0) return null;
      continue;
    }

    if (!afterMob || Number(afterMob.id)!==Number(saved.mobId)
        || Number(afterMob.HP)!==Number(delta.hpAfter)
        || Number(afterMob.HT)!==Number(delta.htAfter)
        || Number(afterMob.pos)!==Number(delta.posAfter)
        || !Array.isArray(afterMob.buffs)) return null;
    let afterBuffRows:any[];
    try { afterBuffRows = JSON.parse(delta.buffsAfter); } catch (_) { return null; }
    if (!Array.isArray(afterBuffRows) || afterBuffRows.length !== afterMob.buffs.length) return null;
    const nestedByKey = new Map<string,any>();
    for (const buff of afterMob.buffs) {
      const key = String(buff?.__className || "")+"#"+Number(buff?.id);
      if (!buff || nestedByKey.has(key)) return null;
      nestedByKey.set(key,buff);
    }
    const seenBuffs = new Set<string>();
    for (const row of afterBuffRows) {
      const root = parseNativeBundleObject(row?.serializedBundle);
      const buff = root?.buff;
      const key = String(buff?.__className || "")+"#"+Number(buff?.id);
      if (!buff || typeof row?.serializedBundle !== "string" || seenBuffs.has(key)
          || !sameNativeItemValue(buff,nestedByKey.get(key))) return null;
      seenBuffs.add(key);
    }
    if (seenBuffs.size !== nestedByKey.size) return null;
  }
  return payload;
}

/** Evidence-only LifeLink parser: the preceding SYNC_MOB_STATE already committed Mob state. */
export function parseAndValidateNativeLifeLinkMobDamageEvidence(
  value: unknown, currentMobsValue: unknown, linkedActorIdsValue: unknown,
  acceptedEventsValue: unknown, currentHeapsValue: unknown,
  levelSize: number, width: number, sequenceBeforeValue: unknown, expectedSenderId: unknown
): NativeSecondaryMobDeltaPayload | null {
  let payload: any = value;
  if (typeof payload === "string" && payload.length > 200000) return null;
  try { if (typeof payload === "string") payload = JSON.parse(payload); } catch (_) { return null; }
  const sequenceBefore = Number(sequenceBeforeValue);
  const senderId = String(expectedSenderId || "");
  if (!payload || payload.complete !== true || !Array.isArray(payload.deltas)
      || payload.deltas.length > 512 || !Array.isArray(currentMobsValue)
      || !Array.isArray(linkedActorIdsValue) || linkedActorIdsValue.length > 512
      || !Array.isArray(acceptedEventsValue) || acceptedEventsValue.length > 512
      || !Number.isSafeInteger(sequenceBefore) || sequenceBefore < 0
      || !senderId || senderId.length > 80
      || !Number.isInteger(levelSize) || levelSize < 1
      || !Number.isInteger(width) || width < 1 || width > levelSize) return null;
  const linked = new Set<number>();
  for (const value of linkedActorIdsValue) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1 || id > 2147483647 || linked.has(id)) return null;
    linked.add(id);
  }
  const currentByActor = new Map<number,any>(), currentByEntity = new Map<string,any>();
  for (const mob of currentMobsValue as any[]) {
    const actorId = Number(mob?.mobId), entityId = String(mob?.entityId || "");
    if (!Number.isInteger(actorId) || actorId < 1 || !/^[A-Za-z0-9._:-]{8,80}$/.test(entityId)
        || currentByActor.has(actorId) || currentByEntity.has(entityId)) return null;
    currentByActor.set(actorId,mob); currentByEntity.set(entityId,mob);
  }
  const eventsByActor = new Map<number,{sequence:number;body:any}>();
  for (const event of acceptedEventsValue as any[]) {
    const sequence=Number(event?.sequence);
    if (!Number.isSafeInteger(sequence) || sequence<=sequenceBefore
        || String(event?.sender_id || "")!==senderId
        || String(event?.event_type || "")!=="CHAR_DAMAGED") continue;
    let body:any;
    try { body=typeof event.payload==="string"?JSON.parse(event.payload):event.payload; }
    catch (_) { continue; }
    const actorId=Number(body?.nativeActorId);
    if (body?.sourceType!=="ENVIRONMENT"
        || body?.sourceClass!=="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison"
        || body?.targetType!=="MOB" || !linked.has(actorId)) continue;
    if (!Number.isInteger(actorId) || actorId<1 || eventsByActor.has(actorId)) return null;
    eventsByActor.set(actorId,{sequence,body});
  }
  const seenActors=new Set<number>(),seenEntities=new Set<string>();
  const deathEvents:Array<{sequence:number;heaps:any}>=[];
  for (const delta of payload.deltas as any[]) {
    const actorId=Number(delta?.actorId),entityId=String(delta?.entityId || "");
    if (!Number.isInteger(actorId) || actorId<1 || !linked.has(actorId) || seenActors.has(actorId)
        || !/^[A-Za-z0-9._:-]{8,80}$/.test(entityId) || seenEntities.has(entityId)) return null;
    seenActors.add(actorId); seenEntities.add(entityId);
    const match=eventsByActor.get(actorId);
    if (!match) return null;
    const event=match.body;
    if (String(event.targetId || "")!==entityId
        || Number(event.targetHpBefore)!==Number(delta.hpBefore)
        || Number(event.targetHtBefore)!==Number(delta.htBefore)
        || Number(event.targetPosBefore)!==Number(delta.posBefore)
        || Number(event.targetShieldBefore)!==Number(delta.shieldBefore)
        || Number(event.targetHp)!==Number(delta.hpAfter)
        || Number(event.targetHt)!==Number(delta.htAfter)
        || Number(event.targetPosAfter)!==Number(delta.posAfter)
        || Number(event.targetShieldAfter)!==Number(delta.shieldAfter)
        || String(event.targetBuffsBefore || "")!==String(delta.buffsBefore || "")
        || typeof delta.serializedBundleBefore!=="string" || delta.serializedBundleBefore.length<1
        || String(event.nativeMobBundleBefore || "")!==delta.serializedBundleBefore
        || typeof event.nativeMobBundleAfterEvidence!=="string"
        || event.nativeMobBundleAfterEvidence.length<1) return null;
    const beforeMob=parseNativeBundleObject(delta.serializedBundleBefore)?.mob;
    const evidenceMob=parseNativeBundleObject(event.nativeMobBundleAfterEvidence)?.mob;
    if (!beforeMob || !evidenceMob || Number(beforeMob.id)!==actorId || Number(evidenceMob.id)!==actorId
        || !String(beforeMob.__className || "")
        || String(beforeMob.__className)!==String(evidenceMob.__className)
        || Number(beforeMob.HP)!==Number(delta.hpBefore)
        || Number(beforeMob.HT)!==Number(delta.htBefore)
        || Number(beforeMob.pos)!==Number(delta.posBefore)
        || Number(evidenceMob.HP)!==Number(delta.hpAfter)
        || Number(evidenceMob.HT)!==Number(delta.htAfter)
        || Number(evidenceMob.pos)!==Number(delta.posAfter)
        || !Number.isInteger(delta.hpBefore) || delta.hpBefore<=0
        || !Number.isInteger(delta.htBefore) || delta.htBefore<1
        || !Number.isInteger(delta.posBefore) || delta.posBefore<0 || delta.posBefore>=levelSize
        || !Number.isInteger(delta.hpAfter) || delta.hpAfter<0 || delta.hpAfter>delta.hpBefore
        || delta.htAfter!==delta.htBefore || delta.posAfter!==delta.posBefore
        || !Number.isInteger(delta.shieldBefore) || delta.shieldBefore<0 || delta.shieldBefore>100000
        || !Number.isInteger(delta.shieldAfter) || delta.shieldAfter<0 || delta.shieldAfter>delta.shieldBefore
        || !Array.isArray(evidenceMob.buffs)) return null;
    let buffRows:any[];
    try { buffRows=JSON.parse(String(delta.buffsAfter)); } catch (_) { return null; }
    if (!Array.isArray(buffRows)) return null;
    const nested=new Map<string,any>();
    for (const buff of evidenceMob.buffs) {
      const key=String(buff?.__className || "")+"#"+Number(buff?.id);
      if (!buff || nested.has(key)) return null;
      nested.set(key,buff);
    }
    const seen=new Set<string>();
    for (const row of buffRows) {
      const buff=parseNativeBundleObject(row?.serializedBundle)?.buff;
      const key=String(buff?.__className || "")+"#"+Number(buff?.id);
      if (!buff || typeof row?.serializedBundle!=="string" || seen.has(key)
          || !sameNativeItemValue(buff,nested.get(key))) return null;
      seen.add(key);
    }
    if (seen.size!==nested.size) return null;
    if (delta.hpAfter===0) {
      if (delta.serializedBundleAfter!==delta.serializedBundleBefore || delta.buffsAfter!=="[]"
          || delta.shieldAfter!==0 || event.targetMobBundleAfter!==null
          || currentByActor.has(actorId) || currentByEntity.has(entityId)
          || !Array.isArray(event.heaps)) return null;
      deathEvents.push({sequence:match.sequence,heaps:event.heaps});
    } else {
      const current=currentByActor.get(actorId);
      if (!current || String(current.entityId || "")!==entityId
          || Number(current.hp)!==delta.hpAfter || Number(current.ht)!==delta.htAfter
          || Number(current.pos)!==delta.posAfter || Number(current.shielding)!==delta.shieldAfter
          || !sameNativeItemValue(current.buffs,buffRows)
          || String(current.serializedBundle || "")!==delta.serializedBundleAfter
          || String(event.targetBuffs || "")!==String(delta.buffsAfter || "")
          || String(event.targetMobBundleAfter || "")!==delta.serializedBundleAfter
          || String(event.nativeMobBundleAfterEvidence)!==delta.serializedBundleAfter) return null;
    }
  }
  if (eventsByActor.size!==seenActors.size) return null;
  let finalHeaps:any = payload.heaps;
  if (typeof finalHeaps === "string") {
    if (finalHeaps.length > 200000) return null;
    try { finalHeaps = JSON.parse(finalHeaps); } catch (_) { return null; }
  }
  if (deathEvents.length>0) {
    if (!Array.isArray(finalHeaps) || !Array.isArray(currentHeapsValue)
        || !sameNativeItemValue(finalHeaps,currentHeapsValue)) return null;
    const last=deathEvents.reduce((a,b)=>a.sequence>b.sequence?a:b);
    if (!sameNativeItemValue(last.heaps,finalHeaps)) return null;
  } else if (payload.heaps!==undefined) return null;
  return {complete:true,deltas:payload.deltas,...(deathEvents.length>0?{heaps:finalHeaps}:{})};
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

