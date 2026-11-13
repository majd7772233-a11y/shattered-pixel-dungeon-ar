import { parseNativeBundleObject } from "./abilities";
import { nativeHeroBuffLifeLinkMobActorIds } from "./hero-buffs";
import { sameNativeItemValue } from "./inventory-economy";

export type PublisherRebaseHeroState = {
  playerId: string;
  heroStateJson: string;
};

function validActorId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
}

function nativeHeroActorIds(heroStateJson: string): number[] | null {
  let state: any;
  try { state = JSON.parse(heroStateJson); } catch (_) { return null; }
  const combat = parseNativeBundleObject(state?.combatBundle);
  if (!combat || !validActorId(Number(combat.id))
      || !Number.isInteger(state?.buffCount) || state.buffCount < 0 || state.buffCount > 256) return null;
  const ids = [Number(combat.id)];
  for (let i = 0; i < state.buffCount; i++) {
    const bundle = parseNativeBundleObject(state["buff_" + i]);
    const buff = bundle?.buff;
    if (!validActorId(Number(buff?.id))) return null;
    ids.push(Number(buff.id));
  }
  return new Set(ids).size === ids.length ? ids : null;
}

/** Accepts only a lossless native world re-serialization and a refreshed process-local Actor registry. */
export function isValidNativePublisherRebase(
  previousValue: unknown,
  nextValue: unknown,
  publisherId: string,
  trustedPublisherHeroStateJson: unknown,
  connectedHeroStates: PublisherRebaseHeroState[],
  emptyRemoteHeroCount = 0
): boolean {
  const previous: any = previousValue, next: any = nextValue;
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object"
      || Array.isArray(previous) || Array.isArray(next) || !publisherId
      || typeof trustedPublisherHeroStateJson !== "string"
      || typeof next.heroStateJson !== "string"
      || !Array.isArray(next.nativeRemoteHeroActorIds)
      || next.nativeRemoteHeroActorIds.length > 1024
      || !Array.isArray(previous.mobs) || !Array.isArray(next.mobs)
      || !Array.isArray(connectedHeroStates) || connectedHeroStates.length < 1
      || connectedHeroStates.length > 16
      || !Number.isInteger(emptyRemoteHeroCount) || emptyRemoteHeroCount < 0 || emptyRemoteHeroCount > 15
      || connectedHeroStates.length + emptyRemoteHeroCount > 16) return false;

  let trustedHero: any, submittedHero: any;
  try {
    trustedHero = JSON.parse(String(trustedPublisherHeroStateJson));
    submittedHero = JSON.parse(next.heroStateJson);
  } catch (_) { return false; }
  if (!sameNativeItemValue(trustedHero, submittedHero)) return false;

  const stripLocalFields = (value: any) => {
    const copy = { ...value };
    delete copy.heroStateJson;
    delete copy.nativeRemoteHeroActorIds;
    delete copy.publisherRebase;
    delete copy.publisherRebaseTerm;
    // The last accepted shared-Actor marker describes the previous turn, not world state.
    // The accepted counter is intentionally retained and must still match exactly.
    for (const key of ["nativeWorldTick", "nativeActorClock", "nativeWorldActorId",
      "nativeWorldActorClass", "nativeWorldActorKind", "nativeWorldActorEntityId",
      "nativeMobActorId", "nativeMobEntityId"]) delete copy[key];
    return copy;
  };
  if (!sameNativeItemValue(stripLocalFields(previous), stripLocalFields(next))) return false;

  const oldMobs = new Map<string, any>();
  const mobActorIds = new Set<number>();
  for (const mob of previous.mobs) {
    const entityId = String(mob?.entityId || "");
    const actorId = Number(mob?.mobId);
    if (entityId.length < 8 || entityId.length > 80 || !validActorId(actorId)
        || oldMobs.has(entityId) || mobActorIds.has(actorId)) return false;
    oldMobs.set(entityId, mob);
    mobActorIds.add(actorId);
  }
  const nextActorIds = new Set<number>();
  for (const mob of next.mobs) {
    const entityId = String(mob?.entityId || "");
    const actorId = Number(mob?.mobId);
    const old = oldMobs.get(entityId);
    if (!old || !validActorId(actorId) || nextActorIds.has(actorId)
        || actorId !== Number(old.mobId)
        || String(mob?.serializedBundle || "") !== String(old.serializedBundle || "")
        || !sameNativeItemValue(mob?.buffs, old?.buffs)) return false;
    nextActorIds.add(actorId);
  }
  if (nextActorIds.size !== mobActorIds.size) return false;

  const expectedRemoteActorIds: number[] = [];
  const allHeroActorIds = new Set<number>();
  const localHeroActorIds = new Set<number>();
  let foundPublisher = false;
  for (const row of connectedHeroStates) {
    if (!row || typeof row.playerId !== "string" || typeof row.heroStateJson !== "string") return false;
    const actorIds = nativeHeroActorIds(row.heroStateJson);
    const lifeLinkIds = nativeHeroBuffLifeLinkMobActorIds(row.heroStateJson);
    if (!actorIds || !lifeLinkIds) return false;
    if (row.playerId === publisherId) foundPublisher = true;
    for (const actorId of actorIds) {
      if (allHeroActorIds.has(actorId) || mobActorIds.has(actorId)) return false;
      allHeroActorIds.add(actorId);
      if (row.playerId === publisherId) localHeroActorIds.add(actorId);
      else expectedRemoteActorIds.push(actorId);
    }
    // LifeLink.object is an Actor ID local to the process that created the Hero. A
    // RemoteHero's value belongs to another device and must never be resolved against this
    // publisher's Mob registry, even if the integers happen to collide.
    if (row.playerId !== publisherId && lifeLinkIds.length > 0) return false;
    for (const actorId of lifeLinkIds) {
      if (!mobActorIds.has(actorId)) return false;
    }
  }
  if (!foundPublisher) return false;

  const submittedRemoteSet = new Set<number>();
  for (const value of next.nativeRemoteHeroActorIds) {
    const actorId = Number(value);
    if (!validActorId(actorId) || submittedRemoteSet.has(actorId)
        || mobActorIds.has(actorId) || localHeroActorIds.has(actorId)) return false;
    submittedRemoteSet.add(actorId);
  }
  const expectedRemoteSet = new Set(expectedRemoteActorIds);
  return expectedRemoteSet.size === expectedRemoteActorIds.length
    && submittedRemoteSet.size === expectedRemoteSet.size + emptyRemoteHeroCount
    && Array.from(expectedRemoteSet).every(actorId => submittedRemoteSet.has(actorId));
}
