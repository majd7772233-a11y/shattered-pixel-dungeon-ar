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


type NativeSnipersMarkReference = { actorId:number; serverEntityId:string };

function nativeHeroSnipersMarkReferences(heroStateJson:string): NativeSnipersMarkReference[] | null {
  let hero:any;
  try { hero=JSON.parse(heroStateJson); } catch (_) { return null; }
  if (!hero || !Number.isInteger(hero.buffCount) || hero.buffCount<0 || hero.buffCount>256) return null;
  const references:NativeSnipersMarkReference[]=[];
  for(let i=0;i<hero.buffCount;i++){
    const root=parseNativeBundleObject(hero["buff_"+i]);
    const buff=root?.buff;
    if(String(buff?.__className||"")!=="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.SnipersMark")continue;
    const actorId=Number(buff.object);
    const serverEntityId=String(buff.server_entity_id||"");
    if(!Number.isSafeInteger(actorId)||actorId<1||actorId>2147483647
        || !/^[A-Za-z0-9._:-]{8,80}$/.test(serverEntityId)
        || references.some(row=>row.actorId===actorId || row.serverEntityId===serverEntityId))return null;
    references.push({actorId,serverEntityId});
  }
  return references;
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

  const mobEntityByActorId = new Map<number,string>();
  for(const [entityId,mob] of oldMobs){
    mobEntityByActorId.set(Number(mob.mobId),entityId);
  }
  const expectedRemoteActorIds: number[] = [];
  const allHeroActorIds = new Set<number>();
  const localHeroActorIds = new Set<number>();
  let foundPublisher = false;
  for (const row of connectedHeroStates) {
    if (!row || typeof row.playerId !== "string" || typeof row.heroStateJson !== "string") return false;
    const actorIds = nativeHeroActorIds(row.heroStateJson);
    const lifeLinkIds = nativeHeroBuffLifeLinkMobActorIds(row.heroStateJson);
    const sniperMarks = nativeHeroSnipersMarkReferences(row.heroStateJson);
    if (!actorIds || !lifeLinkIds || !sniperMarks) return false;
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
    if (row.playerId !== publisherId && (lifeLinkIds.length > 0 || sniperMarks.length > 0)) return false;
    for (const actorId of lifeLinkIds) {
      if (!mobActorIds.has(actorId)) return false;
    }
    // SnipersMark.object is also a process-local Actor ID. Its stable server_entity_id
    // must resolve to the exact same Mob in the trusted pre-rebase snapshot.
    for(const mark of sniperMarks){
      if(mobEntityByActorId.get(mark.actorId)!==mark.serverEntityId)return false;
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
