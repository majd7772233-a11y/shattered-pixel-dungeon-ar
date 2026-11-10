import { describe, it, expect } from 'vitest';
import { removeDeadNativeMobsFromSnapshot, hasMatchingNativeMobShieldSnapshot, parseAndValidateNativeSecondaryMobDeltas, isValidNativeMobBundle, isAuthorizedNativeMobOwner, isValidNativeMissTransition, NetworkMessage, SeededRNG, assignStableEntityIds, isValidNativeMoveIntent, resolveNativeTransitionIntent, isValidNativeFallLanding, isValidNativeFallDestinationSnapshot, canStartNativeFloorTransition, classifyNativeTransitionRejection, isPendingNativeFloorDestinationSnapshot, canAbortNativeFloorTransition, canFinalizeNativeFloorTransition, isValidNativeWorldActionIntent, isValidNativeMutationActionCost, isValidNativeInteractInventoryMutation, isValidNativeUnchangedBuffState, isValidNativeMineBuffMutation, isValidNativeMovementHeapMutation, isValidNativeWorldMutation, isValidNativePickupIntent, isValidNativePickupHeapMutation, isValidNativeInventoryBundleIndex, isValidNativeDropIntent, isValidNativeDropInventoryMutation, isValidNativeDropHeapMutation, isValidNativePickupInventoryMutation, isNativeLootClaimConflict, isValidStableMultiplayerId, isValidNativeFloorItemIdentitySet, nativeLootClaimScopeKey, isNativeLootClaimSchemaCurrent, reserveNativeLootClaim, isValidNativeThrowIntent, isValidNativeThrowInventoryMutation, isValidNativeThrowHeapMutation, isValidNativeProjectileCombatIntent, isValidNativeProjectileHeapResult, isValidNativeProjectileCombatResult,
  isValidNativeHeroBuffTick, nativeHeroBuffLifeLinkMobEntityIds, nativeHeroBuffLifeLinkMobActorIds,
  validateNativeLifeLinkDeathRewardTransition, validateNativeLifeLinkEnvironmentDeathRewardTransition,
  mergeNativeLifeLinkDeathExperienceBundle,
  parseAndValidateNativeLifeLinkMobDeltas, parseAndValidateNativeLifeLinkMobDamageEvidence,
  isValidNativeAbilityIntent, isValidNativeAbilityMutation,
  isValidNativeAlchemyIntent, isValidNativeAlchemyInventoryMutation, isValidNativeAlchemyHeapMutation,
  isValidNativeUseItemIntent, isValidNativeUseItemMutation, parseNativeItemStatusBundle, isValidNativeItemStatusMutation, mergeNativeItemStatusState, isValidNativeEquipmentBelongingsMutation, isValidNativeEquipmentCombatBundleMutation, nativeEquipmentPayloadMatchesRow, nativeEquipmentRowBundleTransitionMatches, nativeEquipmentQuickslotPositionMatches, isValidNativeBuyIntent, isValidNativeBuyInventoryMutation, isValidNativeBuyHeapMutation, isValidNativeEquipmentIntent, isValidNativeEquipmentMutation, isValidNativeChestHeapMutation, parseNativeItemEconomyIndex, isValidNativeItemEconomyIndexMutation, classifyNativeMutationLock, requiresNativeMutationSnapshot, isNativeMutationLockForRequest, isValidNativeMineInventoryMutation, isValidNativeMineHeapMutation, isValidNativeSellIntent, isValidNativeSellInventoryMutation, isValidNativeSellShopkeeperMutation, isValidNativeBuybackIntent, isValidNativeBuybackInventoryMutation, isValidNativeBuybackShopkeeperMutation, parseNativeQuickslotIndex, hasCompleteNativeLevelSnapshot, isValidNativeWorldTurnSnapshot, isValidNativeMobBuffExpiryTurn, isValidNativeHpTransition, isValidNativeDamageAccounting, hasMatchingNativeBuffSnapshot, hasMatchingNativeHeroBuffSnapshot, hasMatchingNativeHeroStateSnapshot, nativeBuffSnapshotFromHeroState, hasValidBlessedAnkhConsumption, hasValidUnblessedAnkhConsumption, hasOnlyNativeLostBackpackAdded, isValidNativeEnvironmentDamage, isValidNativeCombatEvent, isValidNativeAttackIntent, hasMatchingNativeAttackIntent, hasStrictNativeCombatFields, hasStrictNativeDamageFields, hasStrictNativeSourceMobState, isValidNativeHeroStateJson, mergeNativeHeroState, mergeNativeCombatAttackerState, isValidNativeCombatRequestId, classifyRequestReplay, isValidNativeCombatBuffs, isValidNativeLootSnapshot, resolveAuthorizedNativeMobDamageTarget, isValidNativeMobNoEffectOutcome, resolveServerMobIdByEntityId, nativeMobKillRewardIds, areNativeMobRewardClaimsAvailable } from './index';

describe('Server Network Message Parsing and Validation', () => {
  it('serializes and deserializes message correctly', () => {
    const msg: NetworkMessage = {
      protocolVersion: "1.0.0",
      messageType: "ACTION",
      requestId: "req-1",
      payloadJson: JSON.stringify({ type: "MOVE", pos: 100 })
    };

    const str = JSON.stringify(msg);
    const parsed: NetworkMessage = JSON.parse(str);

    expect(parsed.protocolVersion).toBe("1.0.0");
    expect(parsed.messageType).toBe("ACTION");
    expect(parsed.requestId).toBe("req-1");
  });

  it('validates protocol version compatibility', () => {
    const msg: NetworkMessage = {
      protocolVersion: "1.0.0",
      messageType: "PING",
      payloadJson: "{}"
    };

    expect(msg.protocolVersion).toBe("1.0.0");
  });

  it('handles MOVE payload parsing correctly', () => {
    const movePayload = JSON.stringify({ action: "MOVE", data: { from: 10, to: 11 } });
    const parsed = JSON.parse(movePayload);
    expect(parsed.data.from).toBe(10);
    expect(parsed.data.to).toBe(11);
  });

  it('evaluates FOV distance thresholds correctly for PvP filtering', () => {
    const mapWidth = 32;
    const playerAPos = 10;
    const playerBPosNear = 15;
    const playerBPosFar = 300;

    const dxNear = Math.abs((playerAPos % mapWidth) - (playerBPosNear % mapWidth));
    const dyNear = Math.abs(Math.floor(playerAPos / mapWidth) - Math.floor(playerBPosNear / mapWidth));
    expect(dxNear <= 8 && dyNear <= 8).toBe(true);

    const dxFar = Math.abs((playerAPos % mapWidth) - (playerBPosFar % mapWidth));
    const dyFar = Math.abs(Math.floor(playerAPos / mapWidth) - Math.floor(playerBPosFar / mapWidth));
    expect(dxFar <= 8 && dyFar <= 8).toBe(false);
  });

  it('handles sequence gap evaluation for reconnect resync', () => {
    const currentSeq = 100;
    const clientSeqSmallGap = 80;
    const clientSeqLargeGap = 30;

    const gapSmall = currentSeq - clientSeqSmallGap;
    const gapLarge = currentSeq - clientSeqLargeGap;

    expect(gapSmall <= 50).toBe(true);
    expect(gapLarge <= 50).toBe(false);
  });

  it('produces deterministic output using SeededRNG', () => {
    const rng1 = new SeededRNG(987654321);
    const rng2 = new SeededRNG(987654321);

    const val1 = rng1.intRange(1, 20);
    const val2 = rng2.intRange(1, 20);

    expect(val1).toBe(val2);
  });

  it('validates stairs transition cell matching', () => {
    const playerPosOnStairs = 920;
    const exitStairsPos = 920;
    const playerPosOffStairs = 100;

    expect(Number(playerPosOnStairs) === Number(exitStairsPos)).toBe(true);
    expect(Number(playerPosOffStairs) === Number(exitStairsPos)).toBe(false);
  });

  it('calculates armor damage mitigation correctly', () => {
    const rawDamage = 8;
    const armorVal = 3;
    const finalDamage = Math.max(0, rawDamage - armorVal);

    expect(finalDamage).toBe(5);
  });

  it('evaluates mob pathing step direction towards player', () => {
    const mapWidth = 32;
    const mobPos = 100;
    const playerPos = 105;

    let stepX = mobPos % mapWidth;
    let stepY = Math.floor(mobPos / mapWidth);

    if (playerPos % mapWidth > stepX) stepX++;
    else if (playerPos % mapWidth < stepX) stepX--;

    const nextPos = stepY * mapWidth + stepX;
    expect(nextPos).toBe(101);
  });

  it('evaluates Deathmatch kill limit match end condition', () => {
    const killLimit = 10;
    const topPlayerKills = 10;

    expect(topPlayerKills >= killLimit).toBe(true);
  });

  it('traces straight line cell coordinates for line-of-sight raycasting', () => {
    const width = 32;
    const fromPos = 100; // (4, 3)
    const toPos = 104; // (8, 3)

    const intermediateCells: number[] = [];
    for (let x = 101; x < 104; x++) {
      intermediateCells.push(x);
    }

    expect(intermediateCells.length).toBe(3);
    expect(intermediateCells).toEqual([101, 102, 103]);
  });
});

describe('Native combat HP transition validation', () => {
  it('accepts a native hit with a matching HP delta', () => {
    expect(isValidNativeHpTransition(12, 7, 5)).toBe(true);
  });

  it('accepts a native miss with no HP change and zero damage', () => {
    expect(isValidNativeHpTransition(12, 12, 0)).toBe(true);
  });

  it('rejects client-reported healing during an attack', () => {
    expect(isValidNativeHpTransition(12, 13, 0)).toBe(false);
  });

  it('rejects damage that does not match the reported HP delta', () => {
    expect(isValidNativeHpTransition(12, 7, 4)).toBe(false);
  });

  it('rejects negative, fractional, or non-finite combat values', () => {
    expect(isValidNativeHpTransition(-1, 0, 1)).toBe(false);
    expect(isValidNativeHpTransition(12, 11.5, 0.5)).toBe(false);
    expect(isValidNativeHpTransition(12, 7, Number.POSITIVE_INFINITY)).toBe(false);
  });
});


describe('Native level snapshot contract', () => {
  const completeSnapshot = () => ({
    schemaVersion: 1, branch: 0, depth: 1, width: 8, height: 8,
    entrancePos: 1, exitPos: 62, seed: 1234, locked: false, feeling: "NONE",
    heroStateJson: "", nativeLevelMetadataBundle: "native-metadata-bundle", tiles: Array.from({ length: 64 }, (_, pos) => ({
      pos, terrain: 1, passable: true, solid: false, pit: false, losBlocking: false,
      flammable: false, secret: false, avoid: false, water: false, discoverable: false, openSpace: false
    })),
    transitions: [], heaps: [], traps: [], blobs: [], plants: [], mobs: [],
    visitedPositions: [], mappedPositions: []
  });

  it('accepts an explicit full snapshot with empty authoritative collections', () => {
    expect(hasCompleteNativeLevelSnapshot(completeSnapshot())).toBe(true);
  });

  it("validates optional RemoteHero scheduler IDs before accepting any full snapshot",()=>{
    const valid:any = completeSnapshot();
    valid.nativeRemoteHeroActorIds = [7,9];
    expect(hasCompleteNativeLevelSnapshot(valid)).toBe(true);

    const duplicate:any = completeSnapshot();
    duplicate.nativeRemoteHeroActorIds = [7,7];
    expect(hasCompleteNativeLevelSnapshot(duplicate)).toBe(false);

    const zero:any = completeSnapshot();
    zero.nativeRemoteHeroActorIds = [0];
    expect(hasCompleteNativeLevelSnapshot(zero)).toBe(false);

    const malformed:any = completeSnapshot();
    malformed.nativeRemoteHeroActorIds = "7,9";
    expect(hasCompleteNativeLevelSnapshot(malformed)).toBe(false);

    const oversized:any = completeSnapshot();
    oversized.nativeRemoteHeroActorIds = Array.from({length:8193},(_,i)=>i+1);
    expect(hasCompleteNativeLevelSnapshot(oversized)).toBe(false);
  });

  it("rejects impossible zero native Actor IDs for Mob and shared world turns",()=>{
    const mobSnapshot:any = completeSnapshot();
    mobSnapshot.mobs = [{
      mobId:0,entityId:"stable-native-mob-0001",name:"Rat",pos:10,
      hp:10,ht:10,shielding:0,state:"Hunting",serializedBundle:"native-rat-bundle",
      defenseSkill:5,baseSpeed:1,effectiveSpeed:1,cooldown:0,targetCell:-1,
      targetType:"NONE",targetEntityId:"",enemySeen:false,alerted:false,buffs:[]
    }];
    expect(hasCompleteNativeLevelSnapshot(mobSnapshot)).toBe(false);

    const actorTick:any = completeSnapshot();
    actorTick.nativeWorldTick = true;
    actorTick.nativeWorldTurnCounter = 1;
    actorTick.nativeActorClock = 1;
    actorTick.nativeWorldActorKind = "BLOB";
    actorTick.nativeWorldActorId = 0;
    actorTick.nativeWorldActorClass = "com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Fire";
    actorTick.nativeWorldActorEntityId = "";
    actorTick.nativeMobActorId = -1;
    actorTick.nativeMobEntityId = "";
    expect(hasCompleteNativeLevelSnapshot(actorTick)).toBe(false);
  });


  it('accepts a narrowly scoped movement snapshot only when its native Hero result and action marker are valid', () => {
    const before: any = completeSnapshot();
    const heroState = (pos: number) => JSON.stringify({
      hp: 10, ht: 10, pos, shielding: 0, combatBundle: "native-hero-bundle",
      inventoryBundle: "native-inventory-bundle", buffCount: 0, cooldown: 0,
      notesBundle: "native-notes-bundle", questStateBundle: "native-quests-bundle",
      ironKeyCount: 0, crystalKeyCount: 0, wornKeyCount: 0, goldenKeyCount: 0
    });
    before.heroStateJson = heroState(9);
    const after: any = JSON.parse(JSON.stringify(before));
    after.heroStateJson = heroState(10);
    after.nativeWorldMutation = true;
    expect(isValidNativeWorldMutation(before, after, "MOVE", 9, 10, before.heroStateJson)).toBe(true);

    const unrelated = JSON.parse(JSON.stringify(after));
    unrelated.tiles[63].terrain = 4;
    unrelated.tiles[63].passable = false;
    unrelated.tiles[63].solid = true;
    expect(isValidNativeWorldMutation(before, unrelated, "MOVE", 9, 10, before.heroStateJson)).toBe(false);

    const unmarked = JSON.parse(JSON.stringify(after));
    delete unmarked.nativeWorldMutation;
    expect(isValidNativeWorldMutation(before, unmarked, "MOVE", 9, 10, before.heroStateJson)).toBe(false);
  });
  const previousNativeMobSnapshot = () => {
    const previous: any = completeSnapshot();
    previous.mobs = [{
      mobId: 11, entityId: "stable-native-mob-0001", name: "Rat", pos: 10,
      hp: 10, ht: 10, shielding: 0, serializedBundle: "native-rat-bundle", buffs: [],
      state: "Hunting", defenseSkill: 5, baseSpeed: 1, effectiveSpeed: 1, cooldown: 0,
      targetCell: -1, targetType: "NONE", targetEntityId: "", enemySeen: false, alerted: false
    }];
    return previous;
  };

  const nextNativeMobTurn = (overrides: any = {}) => {
    const previous: any = previousNativeMobSnapshot();
    return {
      ...previous,
      nativeWorldTick: true, nativeWorldTurnCounter: 1, nativeActorClock: 4.5,
      nativeWorldActorKind: "MOB", nativeWorldActorId: 11,
      nativeWorldActorClass: "com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat",
      nativeWorldActorEntityId: "stable-native-mob-0001",
      nativeMobActorId: 11, nativeMobEntityId: "stable-native-mob-0001",
      mobs: [{ ...previous.mobs[0], pos: 11, cooldown: 1 }],
      ...overrides
    };
  };

  it("accepts a fresh native Mob turn with a matching stable actor identity", () => {
    expect(isValidNativeWorldTurnSnapshot(previousNativeMobSnapshot(), nextNativeMobTurn(), 0, 1)).toBe(true);
  });


  const makeNativeMobBuffTurn = (buffClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Daze") => {
    const clockBefore = 4, clockAfter = 5, mobTime = 10;
    const mobClass = "com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat";
    const entityId = "stable-native-mob-0001";
    const targetMobId = 11, buffId = 55;
    const buffData = {__className:buffClass,id:buffId,time:clockAfter};
    const unaffectedData = {__className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Vulnerable",
      id:56,time:8};
    const buffRow = (data:any,clock:number) => ({
      serializedBundle:JSON.stringify({buff:data}),
      cooldown:Math.max(0,Number(data.time)-clock)
    });
    const mobRow = (clock:number,includeSource:boolean,stateName="Hunting",stateTag="HUNTING",enemySeen=false) => {
      const nested = includeSource ? [buffData,unaffectedData] : [unaffectedData];
      const buffs = includeSource ? [buffRow(buffData,clock),buffRow(unaffectedData,clock)]
        : [buffRow(unaffectedData,clock)];
      const mobBundle = {mob:{__className:mobClass,id:targetMobId,time:mobTime,
        state:stateTag,seen:enemySeen,pos:10,HP:10,HT:10,buffs:nested}};
      return {
        mobId:targetMobId,entityId,name:"Rat",pos:10,hp:10,ht:10,shielding:0,
        serializedBundle:JSON.stringify(mobBundle),buffs,
        state:stateName,defenseSkill:5,baseSpeed:1,effectiveSpeed:1,
        cooldown:Math.max(0,mobTime-clock),targetCell:-1,targetType:"NONE",
        targetEntityId:"",enemySeen,alerted:false
      };
    };
    const heroState = (clock:number) => JSON.stringify({
      hp:10,ht:20,pos:9,shielding:0,cooldown:Math.max(0,20-clock),
      combatBundle:JSON.stringify({id:21,time:20,buffs:[],STR:10}),
      inventoryBundle:JSON.stringify({inventory:[]}),inventoryItemsJson:"[]",quickslotsJson:"[]",
      notesBundle:"{}",questStateBundle:"{}",buffCount:0
    });
    const previous:any = completeSnapshot();
    previous.levelClass = "com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel";
    previous.nativeLevelMetadataBundle = "{}";
    previous.heroStateJson = heroState(clockBefore);
    previous.nativeActorClock = clockBefore;
    previous.nativeRemoteHeroActorIds = [];
    previous.mobs = [mobRow(clockBefore,true)];
    const next:any = JSON.parse(JSON.stringify(previous));
    next.nativeWorldTick = true;
    next.nativeWorldTurnCounter = 1;
    next.nativeActorClock = clockAfter;
    next.nativeWorldActorKind = "MOB_BUFF";
    next.nativeWorldActorId = buffId;
    next.nativeWorldActorClass = buffClass;
    next.nativeWorldActorEntityId = entityId;
    next.nativeMobActorId = targetMobId;
    next.nativeMobEntityId = entityId;
    next.heroStateJson = heroState(clockAfter);
    next.mobs = [mobRow(clockAfter,false)];
    return {previous,next,heroState:heroState(clockBefore),buffClass,buffData,unaffectedData,entityId};
  };


  it("accepts only inert native Foresight and Invulnerability Mob expirations and rejects Amok",()=>{
    for (const effect of ["Foresight","Invulnerability","FrostImbue"]) {
      const fixture=makeNativeMobBuffTurn("com.shatteredpixel.shatteredpixeldungeon.actors.buffs."+effect);
      expect(isValidNativeWorldTurnSnapshot(fixture.previous,fixture.next,0,1,
        fixture.heroState)).toBe(true);
    }
    const unsafe=makeNativeMobBuffTurn("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Amok");
    expect(isValidNativeWorldTurnSnapshot(unsafe.previous,unsafe.next,0,1,
      unsafe.heroState)).toBe(false);
  });

  it("accepts one due native Mob FlavourBuff expiry while preserving its Mob, Hero and other world state",()=>{
    const fixture = makeNativeMobBuffTurn();
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,fixture.next,0,1,fixture.heroState)).toBe(true);
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,fixture.next,1,1,fixture.heroState)).toBe(false);
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,
      {...fixture.next,nativeWorldTurnCounter:2},0,1,fixture.heroState)).toBe(false);

    const atExpiryBoundary = JSON.parse(JSON.stringify(fixture.next));
    atExpiryBoundary.nativeActorClock = 5.059;
    atExpiryBoundary.mobs[0].cooldown = 10 - 5.059;
    atExpiryBoundary.mobs[0].buffs[0].cooldown = 8 - 5.059;
    const boundaryHero = JSON.parse(atExpiryBoundary.heroStateJson);
    boundaryHero.cooldown = 20 - 5.059;
    atExpiryBoundary.heroStateJson = JSON.stringify(boundaryHero);
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,atExpiryBoundary,0,1,fixture.heroState)).toBe(true);

    const pastExpiryBoundary = JSON.parse(JSON.stringify(atExpiryBoundary));
    pastExpiryBoundary.nativeActorClock = 5.061;
    pastExpiryBoundary.mobs[0].cooldown = 10 - 5.061;
    pastExpiryBoundary.mobs[0].buffs[0].cooldown = 8 - 5.061;
    const pastBoundaryHero = JSON.parse(pastExpiryBoundary.heroStateJson);
    pastBoundaryHero.cooldown = 20 - 5.061;
    pastExpiryBoundary.heroStateJson = JSON.stringify(pastBoundaryHero);
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,pastExpiryBoundary,0,1,fixture.heroState)).toBe(false);

    const wrongClock = JSON.parse(JSON.stringify(fixture.next));
    wrongClock.nativeActorClock = 4.9;
    wrongClock.mobs[0].cooldown = 5.1;
    wrongClock.mobs[0].buffs[0].cooldown = 3.1;
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,wrongClock,0,1,fixture.heroState)).toBe(false);

    const forgedHero = JSON.parse(JSON.stringify(fixture.next));
    const hero = JSON.parse(forgedHero.heroStateJson);
    hero.hp = 9;
    forgedHero.heroStateJson = JSON.stringify(hero);
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,forgedHero,0,1,fixture.heroState)).toBe(false);

    const forgedMob = JSON.parse(JSON.stringify(fixture.next));
    forgedMob.mobs[0].hp = 9;
    const mobBundle = JSON.parse(forgedMob.mobs[0].serializedBundle);
    mobBundle.mob.HP = 9;
    forgedMob.mobs[0].serializedBundle = JSON.stringify(mobBundle);
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,forgedMob,0,1,fixture.heroState)).toBe(false);

    const forgedTerrain = JSON.parse(JSON.stringify(fixture.next));
    forgedTerrain.tiles[20].terrain = 4;
    forgedTerrain.tiles[20].solid = true;
    forgedTerrain.tiles[20].passable = false;
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,forgedTerrain,0,1,fixture.heroState)).toBe(false);

    const forgedSource = JSON.parse(JSON.stringify(fixture.next));
    forgedSource.nativeWorldActorId = 999;
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,forgedSource,0,1,fixture.heroState)).toBe(false);

    const forgedOtherBuff = JSON.parse(JSON.stringify(fixture.next));
    const otherBundle = JSON.parse(forgedOtherBuff.mobs[0].buffs[0].serializedBundle);
    otherBundle.buff.time = 9;
    forgedOtherBuff.mobs[0].buffs[0].serializedBundle = JSON.stringify(otherBundle);
    const nativeMob = JSON.parse(forgedOtherBuff.mobs[0].serializedBundle);
    nativeMob.mob.buffs[0].time = 9;
    forgedOtherBuff.mobs[0].serializedBundle = JSON.stringify(nativeMob);
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,forgedOtherBuff,0,1,fixture.heroState)).toBe(false);
  });


  it("rejects Mob Buff Actor ID collisions with the Hero, another Mob, Blobs or the level respawner",()=>{
    const mobCollision = makeNativeMobBuffTurn();
    const another:any = JSON.parse(JSON.stringify(mobCollision.previous.mobs[0]));
    another.mobId = 55;
    another.entityId = "stable-native-mob-0002";
    another.pos = 12;
    const mobBundle = JSON.parse(another.serializedBundle);
    mobBundle.mob.id = 55;
    mobBundle.mob.pos = 12;
    mobBundle.mob.buffs = [];
    another.buffs = [];
    another.serializedBundle = JSON.stringify(mobBundle);
    mobCollision.previous.mobs.push(another);
    mobCollision.next.mobs.push({...another,cooldown:5});
    expect(isValidNativeWorldTurnSnapshot(mobCollision.previous,mobCollision.next,0,1,mobCollision.heroState)).toBe(false);

    const heroCollision = makeNativeMobBuffTurn();
    const heroBefore = JSON.parse(heroCollision.previous.heroStateJson);
    const heroAfter = JSON.parse(heroCollision.next.heroStateJson);
    const duplicateHeroBuff = {__className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bless",
      id:55,time:9};
    heroBefore.buffCount = 1;
    heroBefore.buff_0 = JSON.stringify({buff:duplicateHeroBuff});
    heroBefore.buffCooldown_0 = 5;
    const combatBefore = JSON.parse(heroBefore.combatBundle);
    combatBefore.buffs = [duplicateHeroBuff];
    heroBefore.combatBundle = JSON.stringify(combatBefore);
    heroAfter.buffCount = 1;
    heroAfter.buff_0 = JSON.stringify({buff:duplicateHeroBuff});
    heroAfter.buffCooldown_0 = 4;
    const combatAfter = JSON.parse(heroAfter.combatBundle);
    combatAfter.buffs = [duplicateHeroBuff];
    heroAfter.combatBundle = JSON.stringify(combatAfter);
    heroCollision.previous.heroStateJson = JSON.stringify(heroBefore);
    heroCollision.next.heroStateJson = JSON.stringify(heroAfter);
    heroCollision.heroState = JSON.stringify(heroBefore);
    expect(isValidNativeWorldTurnSnapshot(heroCollision.previous,heroCollision.next,0,1,heroCollision.heroState)).toBe(false);

    const blobCollision = makeNativeMobBuffTurn();
    const blobClass = "com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Fire";
    const blobBundle = JSON.stringify({blob:{__className:blobClass,id:55,time:10}});
    blobCollision.previous.blobs = [{className:blobClass,serializedBundle:blobBundle,cooldown:6}];
    blobCollision.next.blobs = [{className:blobClass,serializedBundle:blobBundle,cooldown:5}];
    expect(isValidNativeWorldTurnSnapshot(blobCollision.previous,blobCollision.next,0,1,blobCollision.heroState)).toBe(false);

    const respawnerCollision = makeNativeMobBuffTurn();
    const respawnerClass = "com.shatteredpixel.shatteredpixeldungeon.levels.Level$MobSpawner";
    const respawnerBundle = {__className:respawnerClass,id:55,time:10};
    respawnerCollision.previous.nativeLevelMetadataBundle = JSON.stringify({
      respawner:respawnerBundle,respawnerCooldown:6
    });
    respawnerCollision.next.nativeLevelMetadataBundle = JSON.stringify({
      respawner:respawnerBundle,respawnerCooldown:5
    });
    expect(isValidNativeWorldTurnSnapshot(respawnerCollision.previous,respawnerCollision.next,0,1,respawnerCollision.heroState)).toBe(false);
  });



  it("does not let a surviving Mob inherit the just-expired Mob Buff Actor ID",()=>{
    const fixture = makeNativeMobBuffTurn();
    const mob = fixture.next.mobs[0];
    const mobBundle = JSON.parse(mob.serializedBundle);
    mob.mobId = fixture.next.nativeWorldActorId;
    mobBundle.mob.id = fixture.next.nativeWorldActorId;
    mob.serializedBundle = JSON.stringify(mobBundle);
    fixture.next.nativeMobActorId = fixture.next.nativeWorldActorId;
    expect(isValidNativeWorldTurnSnapshot(
      fixture.previous,fixture.next,0,1,fixture.heroState)).toBe(false);
  });

  it("keeps independent Hero buffs intact while a Mob FlavourBuff expires",()=>{
    const fixture = makeNativeMobBuffTurn();
    const heroBuff = {__className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bless",id:22,time:9};
    const makeHeroState = (clock:number) => {
      const state = JSON.parse(clock===4 ? fixture.heroState : fixture.next.heroStateJson);
      state.buffCount = 1;
      state.buff_0 = JSON.stringify({buff:heroBuff});
      state.buffCooldown_0 = Math.max(0,9-clock);
      const combat = JSON.parse(state.combatBundle);
      combat.buffs = [heroBuff];
      state.combatBundle = JSON.stringify(combat);
      return JSON.stringify(state);
    };
    fixture.previous.heroStateJson = makeHeroState(4);
    fixture.next.heroStateJson = makeHeroState(5);
    fixture.heroState = fixture.previous.heroStateJson;
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,fixture.next,0,1,fixture.heroState)).toBe(true);
  });

  it("accepts a valid private Level$MobSpawner metadata clock without treating its class as malformed",()=>{
    const fixture = makeNativeMobBuffTurn();
    const respawnerClass = "com.shatteredpixel.shatteredpixeldungeon.levels.Level$MobSpawner";
    const respawnerBundle = {__className:respawnerClass,id:70,time:10};
    fixture.previous.nativeLevelMetadataBundle = JSON.stringify({
      respawner:respawnerBundle,respawnerCooldown:6
    });
    fixture.next.nativeLevelMetadataBundle = JSON.stringify({
      respawner:respawnerBundle,respawnerCooldown:5
    });
    const blobClass = "com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Fire";
    const blobBundle = JSON.stringify({blob:{__className:blobClass,id:60,time:10}});
    fixture.previous.blobs = [{className:blobClass,serializedBundle:blobBundle,cooldown:6}];
    fixture.next.blobs = [{className:blobClass,serializedBundle:blobBundle,cooldown:5}];
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,fixture.next,0,1,fixture.heroState)).toBe(true);
  });


  it("includes stable RemoteHero actor identities in the global Mob Buff collision check",()=>{
    const fixture = makeNativeMobBuffTurn();
    fixture.previous.nativeRemoteHeroActorIds = [90,91];
    fixture.next.nativeRemoteHeroActorIds = [91,90];
    expect(isValidNativeWorldTurnSnapshot(fixture.previous,fixture.next,0,1,fixture.heroState)).toBe(true);

    const sourceCollision = makeNativeMobBuffTurn();
    sourceCollision.previous.nativeRemoteHeroActorIds = [55];
    sourceCollision.next.nativeRemoteHeroActorIds = [55];
    expect(isValidNativeWorldTurnSnapshot(sourceCollision.previous,sourceCollision.next,0,1,
      sourceCollision.heroState)).toBe(false);

    const otherBuffCollision = makeNativeMobBuffTurn();
    otherBuffCollision.previous.nativeRemoteHeroActorIds = [56];
    otherBuffCollision.next.nativeRemoteHeroActorIds = [56];
    expect(isValidNativeWorldTurnSnapshot(otherBuffCollision.previous,otherBuffCollision.next,0,1,
      otherBuffCollision.heroState)).toBe(false);

    const changedRemoteGraph = makeNativeMobBuffTurn();
    changedRemoteGraph.previous.nativeRemoteHeroActorIds = [90];
    changedRemoteGraph.next.nativeRemoteHeroActorIds = [92];
    expect(isValidNativeWorldTurnSnapshot(changedRemoteGraph.previous,changedRemoteGraph.next,0,1,
      changedRemoteGraph.heroState)).toBe(false);

    const malformedRemoteGraph = makeNativeMobBuffTurn();
    malformedRemoteGraph.previous.nativeRemoteHeroActorIds = [90,90];
    malformedRemoteGraph.next.nativeRemoteHeroActorIds = [90,90];
    expect(isValidNativeWorldTurnSnapshot(malformedRemoteGraph.previous,malformedRemoteGraph.next,0,1,
      malformedRemoteGraph.heroState)).toBe(false);
  });

  it("validates Mob Terror expiry and the exact FLEEING-to-HUNTING/WANDERING native callback",()=>{
    const terrorClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Terror";
    const mutateAi=(row:any,stateName:string,stateTag:string,enemySeen:boolean)=>{
      const root=JSON.parse(row.serializedBundle);
      root.mob.state=stateTag;
      root.mob.seen=enemySeen;
      row.serializedBundle=JSON.stringify(root);
      row.state=stateName;
      row.enemySeen=enemySeen;
    };

    for (const [enemySeen,expectedName,expectedTag] of [
      [true,"Hunting","HUNTING"],
      [false,"Wandering","WANDERING"]
    ] as Array<[boolean,string,string]>) {
      const fixture=makeNativeMobBuffTurn(terrorClass);
      mutateAi(fixture.previous.mobs[0],"Fleeing","FLEEING",enemySeen);
      mutateAi(fixture.next.mobs[0],expectedName,expectedTag,enemySeen);
      expect(isValidNativeWorldTurnSnapshot(fixture.previous,fixture.next,0,1,
        fixture.heroState)).toBe(true);

      const unrelatedState=JSON.parse(JSON.stringify(fixture.next));
      mutateAi(unrelatedState.mobs[0],enemySeen?"Wandering":"Hunting",
        enemySeen?"WANDERING":"HUNTING",enemySeen);
      expect(isValidNativeWorldTurnSnapshot(fixture.previous,unrelatedState,0,1,
        fixture.heroState)).toBe(false);

      const changedVisibility=JSON.parse(JSON.stringify(fixture.next));
      changedVisibility.mobs[0].enemySeen=!enemySeen;
      const changedBundle=JSON.parse(changedVisibility.mobs[0].serializedBundle);
      changedBundle.mob.seen=!enemySeen;
      changedVisibility.mobs[0].serializedBundle=JSON.stringify(changedBundle);
      expect(isValidNativeWorldTurnSnapshot(fixture.previous,changedVisibility,0,1,
        fixture.heroState)).toBe(false);
    }

    const hunting=makeNativeMobBuffTurn(terrorClass);
    mutateAi(hunting.previous.mobs[0],"Hunting","HUNTING",true);
    mutateAi(hunting.next.mobs[0],"Hunting","HUNTING",true);
    expect(isValidNativeWorldTurnSnapshot(hunting.previous,hunting.next,0,1,
      hunting.heroState)).toBe(true);

    const fleeingDread=makeNativeMobBuffTurn(terrorClass);
    const dreadClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Dread";
    const dreadBefore={__className:dreadClass,id:57,time:12,left:15,object:4};
    const dreadAfter={...dreadBefore};
    const addDread=(row:any,data:any,clock:number)=>{
      const mobRoot=JSON.parse(row.serializedBundle);
      mobRoot.mob.buffs.push(data);
      row.serializedBundle=JSON.stringify(mobRoot);
      row.buffs.push({serializedBundle:JSON.stringify({buff:data}),cooldown:Math.max(0,data.time-clock)});
    };
    addDread(fleeingDread.previous.mobs[0],dreadBefore,4);
    addDread(fleeingDread.next.mobs[0],dreadAfter,5);
    mutateAi(fleeingDread.previous.mobs[0],"Fleeing","FLEEING",true);
    mutateAi(fleeingDread.next.mobs[0],"Fleeing","FLEEING",true);
    expect(isValidNativeWorldTurnSnapshot(fleeingDread.previous,fleeingDread.next,0,1,
      fleeingDread.heroState)).toBe(false); // Native attach forbids simultaneous Dread + Terror.
  });

  it("rejects Mob Poison/LifeLink, early ticks, source retention and unrelated Mob changes",()=>{
    const poison = makeNativeMobBuffTurn("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison");
    expect(isValidNativeWorldTurnSnapshot(poison.previous,poison.next,0,1,poison.heroState)).toBe(false);

    const early = makeNativeMobBuffTurn();
    early.next.nativeActorClock = 4.5;
    early.next.mobs[0].cooldown = 5.5;
    early.next.mobs[0].buffs[0].cooldown = 3.5;
    expect(isValidNativeWorldTurnSnapshot(early.previous,early.next,0,1,early.heroState)).toBe(false);

    const retained = makeNativeMobBuffTurn();
    const retainedData = retained.buffData;
    retained.next.mobs[0].buffs.unshift({
      serializedBundle:JSON.stringify({buff:retainedData}),cooldown:0
    });
    const retainedMob = JSON.parse(retained.next.mobs[0].serializedBundle);
    retainedMob.mob.buffs.unshift(retainedData);
    retained.next.mobs[0].serializedBundle = JSON.stringify(retainedMob);
    expect(isValidNativeWorldTurnSnapshot(retained.previous,retained.next,0,1,retained.heroState)).toBe(false);

    const extraMob = makeNativeMobBuffTurn();
    const another:any = JSON.parse(JSON.stringify(extraMob.previous.mobs[0]));
    another.mobId = 12;
    another.entityId = "stable-native-mob-0002";
    another.pos = 12;
    another.buffs = [];
    const anotherBundle = JSON.parse(another.serializedBundle);
    anotherBundle.mob.id = 12;
    anotherBundle.mob.pos = 12;
    anotherBundle.mob.buffs = [];
    another.serializedBundle = JSON.stringify(anotherBundle);
    extraMob.previous.mobs.push(another);
    const anotherAtNextClock = {...another,cooldown:5,buffs:another.buffs.map((row:any)=>{
      const data=JSON.parse(row.serializedBundle).buff;
      return {...row,cooldown:Math.max(0,Number(data.time)-5)};
    })};
    extraMob.next.mobs.push(anotherAtNextClock);
    const tamperedOther = JSON.parse(JSON.stringify(extraMob.next));
    tamperedOther.mobs[1].state = "Fleeing";
    expect(isValidNativeWorldTurnSnapshot(extraMob.previous,tamperedOther,0,1,extraMob.heroState)).toBe(false);
  });

  it("rejects replayed and skipped counters, foreign actor IDs and mismatched stable identities", () => {
    const previous = previousNativeMobSnapshot();
    expect(isValidNativeWorldTurnSnapshot(previous, nextNativeMobTurn(), 1, 1)).toBe(false);
    expect(isValidNativeWorldTurnSnapshot(previous, nextNativeMobTurn({ nativeWorldTurnCounter: 2 }), 0, 1)).toBe(false);
    expect(isValidNativeWorldTurnSnapshot(previous, nextNativeMobTurn({ nativeWorldTurnCounter: 3 }), 2, 1)).toBe(true);
    expect(isValidNativeWorldTurnSnapshot(previous, nextNativeMobTurn({ nativeWorldActorId: 88 }), 0, 1)).toBe(false);
    expect(isValidNativeWorldTurnSnapshot(previous, nextNativeMobTurn({
      nativeWorldActorEntityId: "different-stable-mob-0002", nativeMobEntityId: "different-stable-mob-0002"
    }), 0, 1)).toBe(false);
    expect(isValidNativeWorldTurnSnapshot(previous, nextNativeMobTurn({ width: 9 }), 0, 1)).toBe(false);
    expect(isValidNativeWorldTurnSnapshot(previous, nextNativeMobTurn({ nativeActorClock: Number.NaN }), 0, 1)).toBe(false);
  });

  it("accepts a newly spawned native Mob without an ID so the server can assign it atomically", () => {
    const previous = previousNativeMobSnapshot();
    const next = nextNativeMobTurn();
    next.mobs.push({
      mobId: 27, entityId: "", name: "Skeleton", pos: 18, hp: 7, ht: 7, shielding: 0,
      state: "Wandering", defenseSkill: 5, serializedBundle: "native-skeleton-bundle", buffs: [],
      baseSpeed: 1, effectiveSpeed: 1, cooldown: 0, targetCell: -1, targetType: "NONE",
      targetEntityId: "", enemySeen: false, alerted: false
    });
    expect(isValidNativeWorldTurnSnapshot(previous, next, 0, 1)).toBe(true);
  });

  it("rejects malformed native timing and target fields before any room state is written", () => {
    const previous = previousNativeMobSnapshot();
    expect(hasCompleteNativeLevelSnapshot(nextNativeMobTurn({
      mobs: [{ ...previous.mobs[0], effectiveSpeed: 0 }]
    }))).toBe(false);
    expect(hasCompleteNativeLevelSnapshot(nextNativeMobTurn({
      mobs: [{ ...previous.mobs[0], cooldown: -1 }]
    }))).toBe(false);
    expect(hasCompleteNativeLevelSnapshot(nextNativeMobTurn({
      mobs: [{ ...previous.mobs[0], targetType: "PLAYER", targetEntityId: "" }]
    }))).toBe(false);
  });


  it('rejects duplicate tile, exploration, heap, trap and plant positions before persistence', () => {
    const duplicateTiles: any = completeSnapshot();
    duplicateTiles.tiles[1].pos = 0;
    expect(hasCompleteNativeLevelSnapshot(duplicateTiles)).toBe(false);

    const duplicateExploration: any = completeSnapshot();
    duplicateExploration.visitedPositions = [4, 4];
    expect(hasCompleteNativeLevelSnapshot(duplicateExploration)).toBe(false);

    const duplicateHeaps: any = completeSnapshot();
    const heap = { pos: 21, type: "HEAP", seen: false, haunted: false, hidden: false, autoExplored: false, items: [] };
    duplicateHeaps.heaps = [heap, { ...heap }];
    expect(hasCompleteNativeLevelSnapshot(duplicateHeaps)).toBe(false);

    const duplicateTraps: any = completeSnapshot();
    const trap = { pos: 22, active: true, visible: false, reclaimed: false, color: 0, shape: 0, serializedBundle: "native-trap-bundle" };
    duplicateTraps.traps = [trap, { ...trap }];
    expect(hasCompleteNativeLevelSnapshot(duplicateTraps)).toBe(false);

    const duplicatePlants: any = completeSnapshot();
    const plant = { pos: 23, className: "Firebloom", serializedBundle: "native-plant-bundle" };
    duplicatePlants.plants = [plant, { ...plant }];
    expect(hasCompleteNativeLevelSnapshot(duplicatePlants)).toBe(false);
  });

  it('rejects duplicate mob IDs, duplicate mob cells, duplicate stable IDs and duplicate blob classes', () => {
    const mob = (mobId: number, entityId: string, pos: number) => ({
      mobId, entityId, name: "Rat", pos, hp: 10, ht: 10, shielding: 0, state: "Wandering",
      defenseSkill: 5, baseSpeed: 1, effectiveSpeed: 1, cooldown: 0, targetCell: -1,
      targetType: "NONE", targetEntityId: "", enemySeen: false, alerted: false,
      serializedBundle: "native-rat-bundle", buffs: []
    });

    const duplicateMobCells: any = completeSnapshot();
    duplicateMobCells.mobs = [mob(1, "stable-mob-0001", 10), mob(2, "stable-mob-0002", 10)];
    expect(hasCompleteNativeLevelSnapshot(duplicateMobCells)).toBe(false);

    const duplicateMobIds: any = completeSnapshot();
    duplicateMobIds.mobs = [mob(1, "stable-mob-0001", 10), mob(1, "stable-mob-0002", 11)];
    expect(hasCompleteNativeLevelSnapshot(duplicateMobIds)).toBe(false);

    const duplicateEntityIds: any = completeSnapshot();
    duplicateEntityIds.mobs = [mob(1, "stable-mob-0001", 10), mob(2, "stable-mob-0001", 11)];
    expect(hasCompleteNativeLevelSnapshot(duplicateEntityIds)).toBe(false);

    const duplicateBlobClasses: any = completeSnapshot();
    duplicateBlobClasses.blobs = [
      { className: "com.example.Fire", cooldown: 0, serializedBundle: "native-fire-1" },
      { className: "com.example.Fire", cooldown: 1, serializedBundle: "native-fire-2" }
    ];
    expect(hasCompleteNativeLevelSnapshot(duplicateBlobClasses)).toBe(false);
  });

  it('rejects invalid native entrance/exit cells, missing seed, and coerced string coordinates', () => {
    const badEntrance: any = completeSnapshot();
    badEntrance.entrancePos = 64;
    expect(hasCompleteNativeLevelSnapshot(badEntrance)).toBe(false);

    const badExit: any = completeSnapshot();
    badExit.exitPos = -1;
    expect(hasCompleteNativeLevelSnapshot(badExit)).toBe(false);

    const missingSeed: any = completeSnapshot();
    delete missingSeed.seed;
    expect(hasCompleteNativeLevelSnapshot(missingSeed)).toBe(false);

    const coercedDimensions: any = completeSnapshot();
    coercedDimensions.width = "8";
    expect(hasCompleteNativeLevelSnapshot(coercedDimensions)).toBe(false);
  });

  it('rejects out-of-range native cells and incomplete native Mob scheduler state', () => {
    const badTile: any = completeSnapshot();
    badTile.tiles[0].terrain = 256;
    expect(hasCompleteNativeLevelSnapshot(badTile)).toBe(false);

    const incompleteMob: any = completeSnapshot();
    incompleteMob.mobs = [{
      mobId: 1, entityId: "stable-mob-0001", name: "Rat", pos: 10, hp: 10, ht: 10,
      shielding: 0, serializedBundle: "native-rat-bundle", buffs: []
    }];
    expect(hasCompleteNativeLevelSnapshot(incompleteMob)).toBe(false);
  });

  it('rejects missing collections rather than treating them as empty', () => {
    const snapshot: any = completeSnapshot();
    delete snapshot.heaps;
    expect(hasCompleteNativeLevelSnapshot(snapshot)).toBe(false);
  });

  it('rejects snapshots that omit the native custom-tile and respawner metadata bundle', () => {
    const snapshot: any = completeSnapshot();
    delete snapshot.nativeLevelMetadataBundle;
    expect(hasCompleteNativeLevelSnapshot(snapshot)).toBe(false);
  });

  it('rejects entities without native serialized bundles', () => {
    const snapshot: any = completeSnapshot();
    snapshot.mobs.push({ serializedBundle: "", buffs: [], shielding: 0 });
    expect(hasCompleteNativeLevelSnapshot(snapshot)).toBe(false);
  });

  it('preserves complete heaps containing multiple native item bundles', () => {
    const snapshot: any = completeSnapshot();
    snapshot.heaps.push({
      pos: 21, type: "HEAP", seen: false, haunted: false, hidden: false, autoExplored: false,
      items: [
        { className: "PotionOfHealing", quantity: 1, level: 0, cursed: false, cursedKnown: false, serializedBundle: "native-item-bundle-1" },
        { className: "ScrollOfUpgrade", quantity: 1, level: 0, cursed: false, cursedKnown: false, serializedBundle: "native-item-bundle-2" },
        { className: "Gold", quantity: 5, level: 0, cursed: false, cursedKnown: false, serializedBundle: "native-item-bundle-3" }
      ]
    });
    expect(hasCompleteNativeLevelSnapshot(snapshot)).toBe(true);
  });

  it('rejects mob snapshots that omit or corrupt native shield state', () => {
    const missing: any = completeSnapshot();
    missing.mobs.push({ mobId: 7, entityId: "server-entity-shield-0001", name: "Rat", pos: 12,
      hp: 10, ht: 10, serializedBundle: "native-mob-bundle", buffs: [] });
    expect(hasCompleteNativeLevelSnapshot(missing)).toBe(false);
    const invalid: any = completeSnapshot();
    invalid.mobs.push({ mobId: 7, entityId: "server-entity-shield-0001", name: "Rat", pos: 12,
      hp: 10, ht: 10, shielding: -1, serializedBundle: "native-mob-bundle", buffs: [] });
    expect(hasCompleteNativeLevelSnapshot(invalid)).toBe(false);
  });

  it('accepts a dead-mob tombstone in a complete native snapshot without dropping its identity', () => {
    const snapshot: any = completeSnapshot();
    snapshot.mobs.push({
      mobId: 42,
      entityId: "server-entity-dead-0001",
      name: "Rat",
      pos: 20,
      hp: 0,
      ht: 10,
      shielding: 0,
      state: "Wandering",
      defenseSkill: 5,
      baseSpeed: 1,
      effectiveSpeed: 1,
      cooldown: 0,
      targetCell: -1,
      targetType: "NONE",
      targetEntityId: "",
      enemySeen: false,
      alerted: false,
      serializedBundle: "native-dead-mob-bundle",
      buffs: []
    });
    expect(hasCompleteNativeLevelSnapshot(snapshot)).toBe(true);
    expect(snapshot.mobs[0].entityId).toBe("server-entity-dead-0001");
    expect(snapshot.mobs[0].hp).toBe(0);
  });

  it('rejects unsupported schema versions and oversized bundle payloads', () => {
    const unsupported: any = completeSnapshot();
    unsupported.schemaVersion = 2;
    expect(hasCompleteNativeLevelSnapshot(unsupported)).toBe(false);
    const oversized: any = completeSnapshot();
    oversized.traps.push({ serializedBundle: "x".repeat(200001) });
    expect(hasCompleteNativeLevelSnapshot(oversized)).toBe(false);
  });
});


describe('Stable native entity identity', () => {
  it('keeps an assigned server identity across a republished snapshot even when position changes', () => {
    const previous = [{ mobId: 17, entityId: 'server-entity-0001', name: 'Rat', pos: 10 }];
    const next: any[] = [{ mobId: 17, name: 'Rat', pos: 11 }];
    assignStableEntityIds(next, previous, () => 'server-entity-new-1');
    expect(next[0].entityId).toBe('server-entity-0001');
  });

  it('preserves identity by native class and position when local actor IDs changed', () => {
    const previous = [{ mobId: 17, entityId: 'server-entity-0002', name: 'Rat', pos: 10 }];
    const next: any[] = [{ mobId: 99, name: 'Rat', pos: 10 }];
    assignStableEntityIds(next, previous, () => 'server-entity-new-2');
    expect(next[0].entityId).toBe('server-entity-0002');
  });

  it('does not assign one server identity to two entities in the same snapshot', () => {
    const next = [
      { mobId: 1, entityId: 'server-entity-shared', name: 'Rat', pos: 10 },
      { mobId: 2, entityId: 'server-entity-shared', name: 'Rat', pos: 11 }
    ];
    let generated = 0;
    assignStableEntityIds(next, [], () => 'server-entity-generated-' + (++generated));
    expect(next[0].entityId).toBe('server-entity-shared');
    expect(next[1].entityId).toBe('server-entity-generated-1');
    expect(new Set(next.map((mob) => mob.entityId)).size).toBe(2);
  });

  it('does not reuse a previous ID for a different native mob class', () => {
    const previous = [{ mobId: 17, entityId: 'server-entity-rat', name: 'Rat', pos: 10 }];
    const next: any[] = [{ mobId: 17, name: 'Skeleton', pos: 10 }];
    assignStableEntityIds(next, previous, () => 'server-entity-skeleton');
    expect(next[0].entityId).toBe('server-entity-skeleton');
  });

  it('does not resurrect entities omitted from the next authoritative snapshot', () => {
    const previous = [
      { mobId: 17, entityId: 'server-entity-stays', name: 'Rat', pos: 10 },
      { mobId: 18, entityId: 'server-entity-removed', name: 'Skeleton', pos: 20 }
    ];
    const next: any[] = [{ mobId: 17, name: 'Rat', pos: 11 }];
    assignStableEntityIds(next, previous, () => 'unexpected-new-entity');
    expect(next.map((mob) => mob.entityId)).toEqual(['server-entity-stays']);
    expect(next.some((mob) => mob.entityId === 'server-entity-removed')).toBe(false);
  });
});

describe('Snapshot identity idempotency', () => {
  it('keeps the same entity IDs when the exact same snapshot is assigned repeatedly', () => {
    const first: any[] = [
      { mobId: 4, name: 'Rat', pos: 15 },
      { mobId: 8, name: 'Skeleton', pos: 22 }
    ];
    let id = 0;
    assignStableEntityIds(first, [], () => 'stable-generated-' + (++id));
    const before = first.map((mob) => mob.entityId);
    const repeated: any[] = first.map((mob) => ({ ...mob }));
    assignStableEntityIds(repeated, first, () => 'unexpected-generated-' + (++id));
    expect(repeated.map((mob) => mob.entityId)).toEqual(before);
  });
});

describe('Stable entity target resolution', () => {
  it('resolves a stable server ID to the current publisher-local row key', () => {
    const level = { mobs: [{ mobId: 99, entityId: 'server-entity-unique-1', name: 'Rat' }] };
    expect(resolveServerMobIdByEntityId(level, 'server-entity-unique-1')).toBe(99);
  });

  it('rejects local actor IDs, unknown IDs and malformed references', () => {
    const level = { mobs: [{ mobId: 99, entityId: 'server-entity-unique-1', name: 'Rat' }] };
    expect(resolveServerMobIdByEntityId(level, '99')).toBeNull();
    expect(resolveServerMobIdByEntityId(level, 'server-entity-missing')).toBeNull();
    expect(resolveServerMobIdByEntityId(level, null)).toBeNull();
    expect(resolveServerMobIdByEntityId({ mobs: [] }, 'server-entity-unique-1')).toBeNull();
  });
});


describe('Native combat event contract', () => {
  const validEvent = (overrides: any = {}) => ({
    schemaVersion: 1, depth: 3, currentDepth: 3,
    sessionPlayerId: 'player-a', attackerId: 'player-a',
    attackerPos: 40, authoritativeAttackerPos: 40,
    targetType: 'MOB', targetEntityId: 'stable-mob-0001', expectedTargetEntityId: 'stable-mob-0001',
    targetAlive: true, targetPos: 41, authoritativeTargetPos: 41,
    targetPosAfter: 41, levelSize: 1024, targetMoveDistance: 0,
    previousHp: 12, previousHt: 12, targetHpBefore: 12, targetHtBefore: 12,
    targetHp: 7, targetHt: 12, damage: 5, hit: true,
    ranged: false, attackKind: 'MELEE', distance: 1, authoritativeDistance: 1, actionCost: 1,
    ...overrides
  });

  it('accepts a consistent native melee hit with matching pre-state and post-state', () => {
    expect(isValidNativeCombatEvent(validEvent())).toBe(true);
  });

  it('accepts a consumed native miss only when HP and damage remain unchanged', () => {
    expect(isValidNativeCombatEvent(validEvent({ targetHp: 12, damage: 0, hit: false }))).toBe(true);
    expect(isValidNativeCombatEvent(validEvent({ targetHp: 11, damage: 1, hit: false }))).toBe(false);
  });

  it('rejects stale pre-state, changed max HP, and altered attacker position', () => {
    expect(isValidNativeCombatEvent(validEvent({ targetHpBefore: 10 }))).toBe(false);
    expect(isValidNativeCombatEvent(validEvent({ targetHt: 99 }))).toBe(false);
    expect(isValidNativeCombatEvent(validEvent({ attackerPos: 39 }))).toBe(false);
  });

  it('rejects changed depth, forged stable target, and dead target', () => {
    expect(isValidNativeCombatEvent(validEvent({ depth: 2 }))).toBe(false);
    expect(isValidNativeCombatEvent(validEvent({ targetEntityId: 'stable-mob-other' }))).toBe(false);
    expect(isValidNativeCombatEvent(validEvent({ targetAlive: false }))).toBe(false);
  });

  it('rejects illegal range, attack-kind mismatch, and impossible action cost', () => {
    expect(isValidNativeCombatEvent(validEvent({ distance: 2, authoritativeDistance: 2 }))).toBe(false);
    expect(isValidNativeCombatEvent(validEvent({ attackKind: 'RANGED' }))).toBe(false);
    expect(isValidNativeCombatEvent(validEvent({ actionCost: 0 }))).toBe(false);
    expect(isValidNativeCombatEvent(validEvent({ actionCost: 11 }))).toBe(false);
  });

  it('validates ranged attacks against the bounded native range', () => {
    expect(isValidNativeCombatEvent(validEvent({
      ranged: true, attackKind: 'RANGED', distance: 8, authoritativeDistance: 8
    }))).toBe(true);
    expect(isValidNativeCombatEvent(validEvent({
      ranged: true, attackKind: 'RANGED', distance: 9, authoritativeDistance: 9
    }))).toBe(false);
  });

  it('accepts native armor-reduced hits, invulnerability zero-damage hits and lethal hits', () => {
    expect(isValidNativeCombatEvent(validEvent({ targetHp: 10, damage: 2, hit: true }))).toBe(true);
    expect(isValidNativeCombatEvent(validEvent({ targetHp: 12, damage: 0, hit: true }))).toBe(true);
    expect(isValidNativeCombatEvent(validEvent({ targetHp: 0, damage: 12, hit: true }))).toBe(true);
  });

  it('rejects missing or mismatched stable target identity for mobs', () => {
    expect(isValidNativeCombatEvent(validEvent({ targetEntityId: null }))).toBe(false);
    expect(isValidNativeCombatEvent(validEvent({ expectedTargetEntityId: 'another-mob-0001' }))).toBe(false);
  });

  it('validates native knockback position bounds and displacement', () => {
    expect(isValidNativeCombatEvent(validEvent({ targetPosAfter: 45, targetMoveDistance: 4 }))).toBe(true);
    expect(isValidNativeCombatEvent(validEvent({ targetPosAfter: 1024, targetMoveDistance: 0 }))).toBe(false);
    expect(isValidNativeCombatEvent(validEvent({ targetMoveDistance: 9 }))).toBe(false);
  });

  it('rejects a client claiming an attacker identity it does not own', () => {
    expect(isValidNativeCombatEvent(validEvent({ attackerId: 'player-b' }))).toBe(false);
  });
});


describe('Native combat buff payload validation', () => {
  it('accepts bounded native buff bundles and an explicit empty buff list', () => {
    expect(isValidNativeCombatBuffs('[]')).toBe(true);
    expect(isValidNativeCombatBuffs(JSON.stringify([
      { serializedBundle: 'native-buff-bundle', cooldown: 2.5 }
    ]))).toBe(true);
  });

  it('rejects malformed, oversized, or invalid native buff payloads', () => {
    expect(isValidNativeCombatBuffs('{bad json')).toBe(false);
    expect(isValidNativeCombatBuffs('{"serializedBundle":"not-an-array"}')).toBe(false);
    expect(isValidNativeCombatBuffs(JSON.stringify([
      { serializedBundle: '', cooldown: 0 }
    ]))).toBe(false);
    expect(isValidNativeCombatBuffs(JSON.stringify([
      { serializedBundle: 'native-buff-bundle', cooldown: -1 }
    ]))).toBe(false);
    expect(isValidNativeCombatBuffs('x'.repeat(200001))).toBe(false);
  });
});


describe('Native kill loot snapshot validation', () => {
  const oldHeap = {
    pos: 10, type: 'HEAP', seen: true, haunted: false, hidden: false, autoExplored: false,
    items: [{ className: 'Gold', quantity: 5, level: 0, cursed: false, cursedKnown: false, serializedBundle: 'gold-native-bundle' }]
  };
  const droppedHeap = {
    pos: 20, type: 'HEAP', seen: true, haunted: false, hidden: false, autoExplored: false,
    items: [{ className: 'PotionOfHealing', quantity: 1, level: 0, cursed: false, cursedKnown: false, serializedBundle: 'potion-native-bundle' }]
  };

  it('accepts loot added at the dead mob cell while preserving unrelated heaps', () => {
    expect(isValidNativeLootSnapshot([oldHeap, droppedHeap], [oldHeap], 20, 64)).toBe(true);
  });

  it('rejects changes to unrelated heaps and malformed item bundles', () => {
    const changedElsewhere = { ...oldHeap, items: [{ ...oldHeap.items[0], quantity: 4 }] };
    expect(isValidNativeLootSnapshot([changedElsewhere, droppedHeap], [oldHeap], 20, 64)).toBe(false);
    const malformed = { ...droppedHeap, items: [{ ...droppedHeap.items[0], serializedBundle: '' }] };
    expect(isValidNativeLootSnapshot([oldHeap, malformed], [oldHeap], 20, 64)).toBe(false);
  });

  it('rejects duplicate heap positions and out-of-bounds loot', () => {
    expect(isValidNativeLootSnapshot([droppedHeap, droppedHeap], [], 20, 64)).toBe(false);
    expect(isValidNativeLootSnapshot([{ ...droppedHeap, pos: 64 }], [], 20, 64)).toBe(false);
  });
});


describe('Strict native combat wire fields', () => {
  const validPayload = () => ({
    combatSchemaVersion: 1, combatDepth: 2, attackerId: 'player-a',
    attackerPos: 10, targetPos: 11, targetPosAfter: 11,
    targetHpBefore: 12, targetHtBefore: 12, targetHp: 7, targetHt: 12, damage: 5,
    targetShieldBefore: 0, targetShieldAfter: 0,
    engineResult: true, engineHit: true, engineRanged: false, attackKind: 'MELEE',
    engineDistance: 1, engineActionCost: 1, targetBuffsBefore: '[]', targetBuffs: '[]', secondaryMobDeltas: JSON.stringify({ complete: true, deltas: [] }),
    attackWeaponMode: 'EQUIPPED', attackWeaponBundle: 'native-equipped-weapon',
    damageMultiplier: 1, damageBonus: 0, accuracyMultiplier: 1
  });

  it('accepts the complete typed native payload', () => {
    expect(hasStrictNativeCombatFields(validPayload())).toBe(true);
  });

  it('rejects string-coerced numbers, invalid outcome flags and mismatched attack kind', () => {
    expect(hasStrictNativeCombatFields({ ...validPayload(), targetHp: '7' })).toBe(false);
    expect(hasStrictNativeCombatFields({ ...validPayload(), engineHit: 'true' })).toBe(false);
    expect(hasStrictNativeCombatFields({ ...validPayload(), engineRanged: true })).toBe(false);
    expect(hasStrictNativeCombatFields({ ...validPayload(), engineActionCost: '1' })).toBe(false);
    expect(hasStrictNativeCombatFields({ ...validPayload(), targetBuffsBefore: undefined })).toBe(false);
    expect(hasStrictNativeCombatFields({ ...validPayload(), secondaryMobDeltas: undefined })).toBe(false);
  });
});


describe('Native hero state merge safety', () => {
  const previous = {
    combatBundle: 'trusted-class-equipment-talents',
    inventoryBundle: 'trusted-inventory',
    hp: 12, ht: 12, pos: 41, shielding: 3, cooldown: 0,
    buffCount: 1, buff_0: 'old-native-buff', buffCooldown_0: 1
  };

  it('preserves trusted class/equipment/talents while accepting validated HP and buff state', () => {
    const buffs = [{ serializedBundle: 'new-native-buff', cooldown: 2 }];
    const reported = {
      combatBundle: 'attacker-forged-class-equipment',
      inventoryBundle: 'attacker-forged-inventory',
      hp: 7, ht: 12, pos: 42, shielding: 0, cooldown: 0,
      buffCount: 1, buff_0: 'new-native-buff', buffCooldown_0: 2
    };
    const mergedJson = mergeNativeHeroState(JSON.stringify(previous), JSON.stringify(reported),
      { hp: 7, ht: 12, pos: 42, shielding: 0 }, JSON.stringify(buffs));
    expect(mergedJson).not.toBeNull();
    const merged = JSON.parse(String(mergedJson));
    expect(merged.combatBundle).toBe(previous.combatBundle);
    expect(merged.inventoryBundle).toBe(previous.inventoryBundle);
    expect(merged.hp).toBe(7);
    expect(merged.pos).toBe(42);
    expect(merged.buff_0).toBe('new-native-buff');
  });

  it('rejects target-state/buff mismatches and forged HP post-state', () => {
    const reported = { ...previous, hp: 0, buffCount: 0 };
    expect(mergeNativeHeroState(JSON.stringify(previous), JSON.stringify(reported),
      { hp: 0, ht: 12, pos: 41, shielding: 3 }, '[]')).not.toBeNull();
    expect(mergeNativeHeroState(JSON.stringify(previous), JSON.stringify({ ...reported, hp: 1 }),
      { hp: 0, ht: 12, pos: 41, shielding: 3 }, '[]')).toBeNull();
  });
});


describe('Native mob damage wire contract', () => {
  const validDamage = () => ({
    combatSchemaVersion: 1, combatDepth: 2, targetType: 'PLAYER', targetPlayerId: 'player-target', sourceType: 'MOB',
    sourceEntityId: 'stable-mob-0001', sourcePos: 10, sourceAttackKind: 'MELEE', sourceActionCost: 1,
    engineHit: true,
    sourceMobHpBefore: 10, sourceMobHtBefore: 10, sourceMobShieldBefore: 0, sourceMobPosBefore: 10,
    sourceMobHpAfter: 8, sourceMobHtAfter: 10, sourceMobShieldAfter: 0, sourceMobPosAfter: 10, sourceMobDamage: 2,
    sourceMobBuffsBefore: '[]', sourceMobBuffs: '[]', sourceMobBundleAfter: 'native-mob-state-after',
    targetHpBefore: 12, targetHtBefore: 12, targetHp: 8, targetHt: 12, damage: 4, effectiveDamage: 4,
    targetPosBefore: 11, targetPosAfter: 11, targetShieldBefore: 0, targetShieldAfter: 0,
    engineDamageResult: true, targetBuffsBefore: '[]', targetBuffs: '[]'
  });

  it('accepts well-typed native damage state and rejects spoofed fields', () => {
    expect(hasStrictNativeDamageFields(validDamage())).toBe(true);
    expect(hasStrictNativeSourceMobState(validDamage())).toBe(true);
    expect(hasStrictNativeSourceMobState({ ...validDamage(), sourceMobHpAfter: '0' })).toBe(false);
    expect(hasStrictNativeSourceMobState({ ...validDamage(), sourceMobShieldAfter: undefined })).toBe(false);
    expect(hasStrictNativeSourceMobState({ ...validDamage(), sourceMobShieldAfter: -1 })).toBe(false);
    expect(hasStrictNativeSourceMobState({ ...validDamage(), sourceMobBundleAfter: '' })).toBe(false);
    expect(hasStrictNativeSourceMobState({ ...validDamage(), sourceMobBundleAfter: 'x'.repeat(200001) })).toBe(false);
    expect(hasStrictNativeDamageFields({ ...validDamage(), targetHp: '0' })).toBe(false);
    expect(hasStrictNativeDamageFields({ ...validDamage(), sourceType: 'PLAYER' })).toBe(false);
    expect(hasStrictNativeDamageFields({ ...validDamage(), sourceEntityId: null })).toBe(false);
    expect(hasStrictNativeDamageFields({ ...validDamage(), targetBuffsBefore: undefined })).toBe(false);
  });

  it('validates hero state fields against the authoritative post-state', () => {
    const state = JSON.stringify({
      combatBundle: 'native-combat-bundle', inventoryBundle: 'native-inventory-bundle',
      hp: 8, ht: 12, pos: 11, shielding: 0, cooldown: 0, buffCount: 0
    });
    expect(isValidNativeHeroStateJson(state, { hp: 8, ht: 12, pos: 11, shielding: 0 })).toBe(true);
    expect(isValidNativeHeroStateJson(state, { hp: 0, ht: 12, pos: 11, shielding: 0 })).toBe(false);
  });
});


describe('Combat request idempotency contract', () => {
  it('requires a bounded request id and distinguishes replay from cross-player collision', () => {
    expect(isValidNativeCombatRequestId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isValidNativeCombatRequestId('short')).toBe(false);
    expect(isValidNativeCombatRequestId('bad id value')).toBe(false);
    expect(classifyRequestReplay(null, 'player-a')).toBe('NEW');
    expect(classifyRequestReplay({ player_id: 'player-a' }, 'player-a')).toBe('REPLAY');
    expect(classifyRequestReplay({ player_id: 'player-a' }, 'player-b')).toBe('CONFLICT');
  });
});


describe('Native combat pre-state binding', () => {
  const buff = (serializedBundle: string, cooldown = 0) => ({ serializedBundle, cooldown });

  it('requires reactive mob buff pre-state to match the last authoritative snapshot', () => {
    const authoritative = [buff('native-poison-buff', 2), buff('native-armor-buff', 1)];
    expect(hasMatchingNativeBuffSnapshot(JSON.stringify(authoritative), authoritative)).toBe(true);
    expect(hasMatchingNativeBuffSnapshot(JSON.stringify([buff('forged-buff', 2)]), authoritative)).toBe(false);
    expect(hasMatchingNativeBuffSnapshot(JSON.stringify([buff('native-poison-buff', 99), buff('native-armor-buff', 1)]), authoritative)).toBe(false);
  });

  it('rejects malformed or absent authoritative buff snapshots', () => {
    expect(hasMatchingNativeBuffSnapshot('{bad-json', [])).toBe(false);
    expect(hasMatchingNativeBuffSnapshot('[]', null)).toBe(false);
    expect(hasMatchingNativeBuffSnapshot('[]', 'not-json')).toBe(false);
  });

  it('treats buff ordering as irrelevant but preserves each native bundle and cooldown', () => {
    const first = [buff('native-a', 1), buff('native-b', 3)];
    const reordered = [buff('native-b', 3), buff('native-a', 1)];
    expect(hasMatchingNativeBuffSnapshot(first, reordered)).toBe(true);
  });
});


describe('Native mob shield pre-state validation', () => {
  it('accepts only a shield total matching the authoritative pre-attack snapshot', () => {
    expect(hasMatchingNativeMobShieldSnapshot(4, 2, 4)).toBe(true);
    expect(hasMatchingNativeMobShieldSnapshot(3, 2, 4)).toBe(false);
    expect(hasMatchingNativeMobShieldSnapshot(4, 2, undefined)).toBe(false);
  });

  it('rejects negative, fractional, non-finite and out-of-range shield values', () => {
    expect(hasMatchingNativeMobShieldSnapshot(-1, 0, -1)).toBe(false);
    expect(hasMatchingNativeMobShieldSnapshot(1.5, 0, 1.5)).toBe(false);
    expect(hasMatchingNativeMobShieldSnapshot(1, Number.POSITIVE_INFINITY, 1)).toBe(false);
    expect(hasMatchingNativeMobShieldSnapshot(100001, 0, 100001)).toBe(false);
  });
});


describe('Native hero buff pre-state validation', () => {
  it('matches the reported pre-damage buff bundles against the saved hero state', () => {
    const saved = {
      buffCount: 2,
      buff_0: 'native-poison',
      buffCooldown_0: 1.5,
      buff_1: 'native-shield',
      buffCooldown_1: 0
    };
    const matching = [
      { serializedBundle: 'native-poison', cooldown: 1.5 },
      { serializedBundle: 'native-shield', cooldown: 0 }
    ];
    expect(hasMatchingNativeHeroBuffSnapshot(JSON.stringify(matching), saved)).toBe(true);
    expect(hasMatchingNativeHeroBuffSnapshot(JSON.stringify([
      { serializedBundle: 'forged-buff', cooldown: 1.5 },
      { serializedBundle: 'native-shield', cooldown: 0 }
    ]), saved)).toBe(false);
    expect(hasMatchingNativeHeroBuffSnapshot('[]', { ...saved, buffCooldown_0: 999 })).toBe(false);
  });

  it('rejects absent, malformed and oversized authoritative buff state', () => {
    expect(hasMatchingNativeHeroBuffSnapshot('[]', null)).toBe(false);
    expect(hasMatchingNativeHeroBuffSnapshot('{broken', { buffCount: 0 })).toBe(false);
    expect(hasMatchingNativeHeroBuffSnapshot('[]', { buffCount: 513 })).toBe(false);
    expect(hasMatchingNativeHeroBuffSnapshot('[]', { buffCount: 1, buff_0: '', buffCooldown_0: -1 })).toBe(false);
  });
});


describe('Native combat miss immutability', () => {
  const buffs = JSON.stringify([{ serializedBundle: 'native-buff', cooldown: 1 }]);

  it('accepts a miss only when HP, shield, position and buffs remain unchanged', () => {
    expect(isValidNativeMissTransition(false, 12, 12, 0, 4, 4, buffs, buffs, 22, 22)).toBe(true);
    expect(isValidNativeMissTransition(true, 12, 8, 4, 4, 4, buffs, buffs, 22, 22)).toBe(true);
  });

  it('rejects a miss that forges damage, shield loss, movement, or buff changes', () => {
    expect(isValidNativeMissTransition(false, 12, 11, 1, 4, 4, buffs, buffs, 22, 22)).toBe(false);
    expect(isValidNativeMissTransition(false, 12, 12, 0, 4, 0, buffs, buffs, 22, 22)).toBe(false);
    expect(isValidNativeMissTransition(false, 12, 12, 0, 4, 4, buffs, buffs, 22, 23)).toBe(false);
    expect(isValidNativeMissTransition(false, 12, 12, 0, 4, 4, buffs,
      JSON.stringify([{ serializedBundle: 'forged', cooldown: 1 }]), 22, 22)).toBe(false);
  });
});


describe('Blessed-Ankh revival validation', () => {
  const previous = {
    hp: 12, ht: 20, pos: 41, shielding: 2,
    ankhCount: 2, blessedAnkhCount: 1, inventoryBundle: 'inventory-with-blessed-ankh'
  };

  it('accepts exactly one consumed blessed Ankh and native quarter-health revival', () => {
    const reported = {
      ...previous, hp: 5, ankhCount: 1, blessedAnkhCount: 0,
      inventoryBundle: 'inventory-after-ankh-consumption'
    };
    expect(hasValidBlessedAnkhConsumption(previous, reported)).toBe(true);
  });

  it('rejects revival without an Ankh, unconsumed Ankhs, forged health, or unchanged inventory', () => {
    const reported = {
      ...previous, hp: 5, ankhCount: 1, blessedAnkhCount: 0,
      inventoryBundle: 'inventory-after-ankh-consumption'
    };
    expect(hasValidBlessedAnkhConsumption({ ...previous, blessedAnkhCount: 0 }, reported)).toBe(false);
    expect(hasValidBlessedAnkhConsumption(previous, { ...reported, blessedAnkhCount: 1 })).toBe(false);
    expect(hasValidBlessedAnkhConsumption(previous, { ...reported, hp: 6 })).toBe(false);
    expect(hasValidBlessedAnkhConsumption(previous, { ...reported, inventoryBundle: previous.inventoryBundle })).toBe(false);
  });
});


describe('Native environmental and periodic damage validation', () => {
  const buffs = JSON.stringify([{ serializedBundle: 'native-dot-buff', cooldown: 2 }]);
  const authoritative = {
    state: 'ALIVE', hp: 12, ht: 20, pos: 41, shielding: 3, levelSize: 1000, levelWidth: 32,
    heroState: {
      hp: 12, ht: 20, pos: 41, shielding: 3, buffCount: 1,
      buff_0: JSON.parse(buffs)[0].serializedBundle, buffCooldown_0: 2
    }
  };
  const valid = () => ({
    sourceType: 'ENVIRONMENT', sourceClass: 'com.example.PeriodicDamage',
    targetHpBefore: 12, targetHtBefore: 20, targetHp: 10, targetHt: 20,
    targetPosBefore: 41, targetPosAfter: 41, targetShieldBefore: 3, targetShieldAfter: 1,
    targetBuffsBefore: buffs, targetBuffs: buffs, damage: 2, effectiveDamage: 4,
    targetState: 'ALIVE', engineDamageResult: true
  });

  it('accepts native periodic damage only when its pre-state matches server state', () => {
    expect(isValidNativeEnvironmentDamage(valid(), authoritative)).toBe(true);
    expect(isValidNativeEnvironmentDamage({ ...valid(), targetHpBefore: 11 }, authoritative)).toBe(false);
    expect(isValidNativeEnvironmentDamage({ ...valid(), targetShieldBefore: 2 }, authoritative)).toBe(false);
  });

  it('rejects environmental healing and forged shield gains', () => {
    expect(isValidNativeEnvironmentDamage({ ...valid(), targetHp: 13, damage: -1 }, authoritative)).toBe(false);
    expect(isValidNativeEnvironmentDamage({ ...valid(), targetShieldAfter: 4 }, authoritative)).toBe(false);
    expect(isValidNativeEnvironmentDamage({ ...valid(), targetPosAfter: 400 }, authoritative)).toBe(false);
  });

  it('checks native effective damage against both HP and shield deltas', () => {
    expect(isValidNativeDamageAccounting(12, 3, 10, 1, 4)).toBe(true);
    expect(isValidNativeDamageAccounting(12, 3, 12, 0, 3)).toBe(true);
    expect(isValidNativeDamageAccounting(12, 3, 12, 0, 999)).toBe(false);
    expect(isValidNativeDamageAccounting(12, 3, 10, 1, 2)).toBe(false);
    expect(isValidNativeDamageAccounting(12, 3, 10, 4, 1)).toBe(false);
  });

  it('preserves the native Hunger accounting exception without trusting arbitrary values', () => {
    expect(isValidNativeDamageAccounting(12, 3, 10, 1, 2, true)).toBe(true);
    expect(isValidNativeDamageAccounting(12, 3, 10, 1, 4, true)).toBe(false);
  });
});


describe('Native secondary mob combat deltas', () => {
  const entityId = 'native-entity-123456';
  const buffs = [{ serializedBundle: 'native-buff', cooldown: 1 }];
  const saved = [{ entityId, mobId: 7, hp: 10, ht: 10, pos: 10, shielding: 2,
    serializedBundle: 'native-mob-state-before', buffs }];
  const delta = () => ({
    entityId, hpBefore: 10, htBefore: 10, posBefore: 10, shieldBefore: 2,
    buffsBefore: JSON.stringify(buffs),
    hpAfter: 7, htAfter: 10, posAfter: 10, shieldAfter: 1,
    buffsAfter: JSON.stringify([{ serializedBundle: 'native-buff', cooldown: 0 }]),
    serializedBundleAfter: 'native-mob-state-after'
  });

  it('requires a bounded native mob bundle when a secondary combat state changes', () => {
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [{ ...delta(), serializedBundleAfter: '' }] }, saved, 1024, 32)).toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [{ ...delta(), serializedBundleAfter: 'x'.repeat(200001) }] }, saved, 1024, 32)).toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [delta()] }, saved, 1024, 32)?.deltas[0].serializedBundleAfter)
      .toBe('native-mob-state-after');
  });

  it('accepts a native secondary HP/shield/cooldown delta based on the exact saved pre-state', () => {
    const result = parseAndValidateNativeSecondaryMobDeltas(
      JSON.stringify({ complete: true, deltas: [delta()] }), saved, 1024, 32);
    expect(result?.deltas).toHaveLength(1);
  });

  it('rejects stale, unknown, duplicate, incomplete and forged secondary mob deltas', () => {
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [{ ...delta(), hpBefore: 9 }] }, saved, 1024, 32)).toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [{ ...delta(), entityId: 'unknown-entity-123' }] }, saved, 1024, 32)).toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [delta(), delta()] }, saved, 1024, 32)).toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: false, deltas: [delta()] }, saved, 1024, 32)).toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [{ ...delta(), hpAfter: 11 }] }, saved, 1024, 32)).toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [{ ...delta(), posAfter: 400 }] }, saved, 1024, 32)).toBeNull();
  });

  it('requires bounded loot snapshots for secondary deaths and rejects unrelated loot changes', () => {
    const death = { ...delta(), hpAfter: 0, shieldAfter: 0, buffsAfter: '[]' };
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [death] }, saved, 1024, 32)).toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [death], heaps: [] }, saved, 1024, 32)?.heaps).toEqual([]);
  });

  it('accepts bounded HP/shield gains only from the authoritative mob owner', () => {
    const defensiveProc = { ...delta(), hpAfter: 10, shieldAfter: 3 };
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [defensiveProc] }, saved, 1024, 32)).toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [defensiveProc] }, saved, 1024, 32, true)?.deltas).toHaveLength(1);
  });

  it('rejects a direct target repeated as a secondary delta before state mutation', () => {
    const primaryId = 'primary-target-0001';
    const savedPrimary = { ...saved[0], entityId: primaryId, mobId: 8 };
    const primaryOverlap = { ...delta(), entityId: primaryId };
    const snapshotMobs = [...saved, savedPrimary];
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [primaryOverlap] }, snapshotMobs, 1024, 32)).not.toBeNull();
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [primaryOverlap] }, snapshotMobs, 1024, 32, false, primaryId)).toBeNull();
  });

  it('accepts an empty complete delta and rejects an oversized/incomplete collection', () => {
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: [] }, saved, 1024, 32)?.deltas).toEqual([]);
    expect(parseAndValidateNativeSecondaryMobDeltas(
      { complete: true, deltas: Array(513).fill(delta()) }, saved, 1024, 32)).toBeNull();
  });
});


describe("Dead native mob snapshot reconciliation", () => {
  it("removes validated dead mobs by stable identity and returns database IDs", () => {
    const snapshot = { mobs: [
      { entityId: "dead-native-mob-0001", mobId: 7, hp: 0 },
      { entityId: "living-native-mob-0002", mobId: 8, hp: 4 },
      { entityId: "dead-native-mob-0003", mobId: 9, hp: 0 }
    ] };
    expect(removeDeadNativeMobsFromSnapshot(snapshot,
      ["dead-native-mob-0001", "dead-native-mob-0003"])).toEqual([9, 7]);
    expect(snapshot.mobs).toEqual([
      { entityId: "living-native-mob-0002", mobId: 8, hp: 4 }
    ]);
  });

  it("rejects unknown, duplicate, and living targets without partial mutation", () => {
    const original = { mobs: [
      { entityId: "dead-native-mob-0001", mobId: 7, hp: 0 },
      { entityId: "living-native-mob-0002", mobId: 8, hp: 4 }
    ] };
    for (const ids of [
      ["missing-native-mob-0003"],
      ["dead-native-mob-0001", "dead-native-mob-0001"],
      ["living-native-mob-0002"]
    ]) {
      const snapshot = JSON.parse(JSON.stringify(original));
      expect(removeDeadNativeMobsFromSnapshot(snapshot, ids)).toBeNull();
      expect(snapshot).toEqual(original);
    }
  });
});

describe('Native mob bundle validation', () => {
  it('accepts only non-empty bounded native bundles', () => {
    expect(isValidNativeMobBundle('native-mob-bundle')).toBe(true);
    expect(isValidNativeMobBundle('')).toBe(false);
    expect(isValidNativeMobBundle(null)).toBe(false);
    expect(isValidNativeMobBundle('x'.repeat(200001))).toBe(false);
  });
});

describe('Native mob damage owner authorization', () => {
  it('accepts only the exact authenticated level publisher identity', () => {
    expect(isAuthorizedNativeMobOwner('player-host', 'player-host')).toBe(true);
    expect(isAuthorizedNativeMobOwner('player-attacker', 'player-host')).toBe(false);
    expect(isAuthorizedNativeMobOwner('player-target', 'player-host')).toBe(false);
    expect(isAuthorizedNativeMobOwner('player-host', null)).toBe(false);
    expect(isAuthorizedNativeMobOwner('player-host', '')).toBe(false);
    expect(isAuthorizedNativeMobOwner('', 'player-host')).toBe(false);
  });

  it('does not authorize reactive mob HP, buff, position or loot writes from the damaged-player client', () => {
    const publisher = 'player-host';
    const damagedPlayer = 'player-target';
    expect(isAuthorizedNativeMobOwner(damagedPlayer, publisher)).toBe(false);
    expect(isAuthorizedNativeMobOwner(publisher, publisher)).toBe(true);
  });
});


describe('Authoritative native hero pre-state', () => {
  const heroState = () => ({
    hp: 20, ht: 20, pos: 12, shielding: 2, cooldown: 1, buffCount: 1,
    combatBundle: 'native-combat', inventoryBundle: 'native-inventory',
    ankhCount: 0, blessedAnkhCount: 0,
    buff_0: 'native-buff', buffCooldown_0: 2
  });
  it('merges real native attacker retaliation and inventory changes only from a matching pre-state', () => {
    const before = heroState();
    const after = { ...before, hp: 16, shielding: 0, cooldown: 2, inventoryBundle: 'native-inventory-after-throw' };
    const row = { hp: 20, ht: 20, pos: 12, state: 'ALIVE' };
    const merged = mergeNativeCombatAttackerState(JSON.stringify(before), JSON.stringify(before), JSON.stringify(after), row);
    expect(merged).not.toBeNull();
    const parsed = JSON.parse(String(merged));
    expect(parsed.hp).toBe(16);
    expect(parsed.shielding).toBe(0);
    expect(parsed.cooldown).toBe(2);
    expect(parsed.inventoryBundle).toBe('native-inventory-after-throw');

    expect(mergeNativeCombatAttackerState(JSON.stringify(before), JSON.stringify({ ...before, hp: 19 }),
      JSON.stringify(after), row)).toBeNull();
    expect(mergeNativeCombatAttackerState(JSON.stringify(before), JSON.stringify(before),
      JSON.stringify({ ...after, pos: 13 }), row)).toBeNull();
    expect(mergeNativeCombatAttackerState(JSON.stringify(before), JSON.stringify(before),
      JSON.stringify({ ...after, hp: 21 }), row)).toBeNull();
    const levelUp = { ...after, hp: 20, ht: 25 };
    expect(mergeNativeCombatAttackerState(JSON.stringify(before), JSON.stringify(before),
      JSON.stringify(levelUp), row)).toBeNull();
    const mergedLevelUp = mergeNativeCombatAttackerState(JSON.stringify(before), JSON.stringify(before),
      JSON.stringify(levelUp), row, true);
    expect(mergedLevelUp).not.toBeNull();
    expect(JSON.parse(String(mergedLevelUp)).ht).toBe(25);
    expect(mergeNativeCombatAttackerState(JSON.stringify(before), JSON.stringify(before),
      JSON.stringify({ ...levelUp, ht: 171 }), row, true)).toBeNull();
    expect(mergeNativeCombatAttackerState(JSON.stringify(before), JSON.stringify(before),
      JSON.stringify(after), { ...row, state: 'DEAD' })).toBeNull();
  });

  it('matches complete trusted hero state including equipment, shield, cooldown and native buffs', () => {
    const state = heroState();
    expect(hasMatchingNativeHeroStateSnapshot(state, state)).toBe(true);
    expect(hasMatchingNativeHeroStateSnapshot({ ...state, hp: 19 }, state)).toBe(false);
    expect(hasMatchingNativeHeroStateSnapshot({ ...state, inventoryBundle: 'forged-inventory' }, state)).toBe(false);
    expect(hasMatchingNativeHeroStateSnapshot({ ...state, buffCooldown_0: 99 }, state)).toBe(false);
    expect(hasMatchingNativeHeroStateSnapshot({ ...state, shielding: 100 }, state)).toBe(false);
    const identified = { ...state, potionStatusBundle:'{"PotionOfHaste_label":"AMBER","PotionOfHaste_known":false}',
      scrollStatusBundle:'{"ScrollOfRecharging_label":"KAUNAN","ScrollOfRecharging_known":false}' };
    expect(hasMatchingNativeHeroStateSnapshot(identified, identified)).toBe(true);
    expect(hasMatchingNativeHeroStateSnapshot({ ...identified,
      potionStatusBundle:'{"PotionOfHaste_label":"AMBER","PotionOfHaste_known":true}' }, identified)).toBe(false);
    expect(hasMatchingNativeHeroStateSnapshot({ ...identified,
      scrollStatusBundle:'{"ScrollOfRecharging_label":"FORGED","ScrollOfRecharging_known":false}' }, identified)).toBe(false);
    expect(hasMatchingNativeHeroStateSnapshot({ ...identified, potionStatusBundle:undefined }, identified)).toBe(false);
  });
  it('rejects malformed or absent hero snapshots', () => {
    expect(hasMatchingNativeHeroStateSnapshot('{bad-json', heroState())).toBe(false);
    expect(hasMatchingNativeHeroStateSnapshot(heroState(), null)).toBe(false);
  });
});


describe('Native hero buff snapshot and Ankh merge', () => {
  it('extracts a bounded, exact native buff list from a hero state bundle', () => {
    const state = {
      hp: 10, ht: 20, pos: 5, shielding: 1, cooldown: 2, buffCount: 1,
      combatBundle: 'trusted-combat', inventoryBundle: 'trusted-inventory',
      buff_0: 'native-buff-bundle', buffCooldown_0: 3
    };
    expect(nativeBuffSnapshotFromHeroState(state)).toBe(JSON.stringify([
      { serializedBundle: 'native-buff-bundle', cooldown: 3 }
    ]));
    expect(nativeBuffSnapshotFromHeroState({ ...state, buffCount: 257 })).toBeNull();
    expect(nativeBuffSnapshotFromHeroState({ ...state, buffCooldown_0: -1 })).toBeNull();
  });

  it('persists exactly one validated blessed Ankh consumption and keeps normal merges trusted', () => {
    const previous = {
      combatBundle: 'trusted-combat', inventoryBundle: 'before-ankh',
      hp: 2, ht: 20, pos: 5, shielding: 0, cooldown: 1,
      buffCount: 0, ankhCount: 1, blessedAnkhCount: 1
    };
    const revived = { ...previous, inventoryBundle: 'after-ankh', hp: 5,
      ankhCount: 0, blessedAnkhCount: 0, cooldown: 2 };
    const merged = mergeNativeHeroState(JSON.stringify(previous), JSON.stringify(revived),
      { hp: 5, ht: 20, pos: 5, shielding: 0 }, '[]', true, false);
    expect(merged).not.toBeNull();
    const parsed = JSON.parse(String(merged));
    expect(parsed.inventoryBundle).toBe('after-ankh');
    expect(parsed.ankhCount).toBe(0);
    expect(parsed.blessedAnkhCount).toBe(0);
    expect(parsed.cooldown).toBe(2);
    const forged = { ...revived, ankhCount: 1 };
    const rejected = mergeNativeHeroState(JSON.stringify(previous), JSON.stringify(forged),
      { hp: 5, ht: 20, pos: 5, shielding: 0 }, '[]', true, false);
    expect(rejected).not.toBeNull();
    expect(JSON.parse(String(rejected)).inventoryBundle).toBe('before-ankh');
  });

  it('accepts authority-resolved native attacker inventory changes without allowing Ankh counter forgery', () => {
    const previous = {
      combatBundle: 'trusted-combat', inventoryBundle: 'before-weapon-use',
      hp: 20, ht: 20, pos: 12, shielding: 0, cooldown: 1,
      buffCount: 0, ankhCount: 1, blessedAnkhCount: 0
    };
    const afterAttack = {
      ...previous, inventoryBundle: 'after-weapon-use', cooldown: 2,
      ankhCount: 99, blessedAnkhCount: 99
    };
    const authorityMerge = mergeNativeHeroState(JSON.stringify(previous), JSON.stringify(afterAttack),
      { hp: 20, ht: 20, pos: 12, shielding: 0 }, '[]', false, false, false);
    expect(authorityMerge).not.toBeNull();
    const parsed = JSON.parse(String(authorityMerge));
    expect(parsed.inventoryBundle).toBe('after-weapon-use');
    expect(parsed.cooldown).toBe(2);
    expect(parsed.ankhCount).toBe(1);
    expect(parsed.blessedAnkhCount).toBe(0);

    const defenderMerge = mergeNativeHeroState(JSON.stringify(previous), JSON.stringify(afterAttack),
      { hp: 20, ht: 20, pos: 12, shielding: 0 }, '[]', false, false);
    expect(defenderMerge).not.toBeNull();
    expect(JSON.parse(String(defenderMerge)).inventoryBundle).toBe('before-weapon-use');
  });
});


describe('Native attack intent contract', () => {
  const standard = {
    attackWeaponMode: 'EQUIPPED', attackWeaponBundle: 'native-equipped-weapon',
    damageMultiplier: 1, damageBonus: 0, accuracyMultiplier: 1
  };

  it('accepts explicit native modes and bounded attack parameters', () => {
    expect(isValidNativeAttackIntent(standard)).toBe(true);
    expect(isValidNativeAttackIntent({ ...standard, attackWeaponMode: 'UNARMED', attackWeaponBundle: '' })).toBe(true);
    expect(isValidNativeAttackIntent({ ...standard, attackWeaponMode: 'THROWN', attackWeaponBundle: 'native-missile' })).toBe(true);
    expect(isValidNativeAttackIntent({ ...standard, attackWeaponMode: 'ABILITY', attackWeaponBundle: 'native-ability' })).toBe(true);
  });

  it('rejects empty transient weapon bundles, invalid modes, and impossible modifiers', () => {
    expect(isValidNativeAttackIntent({ ...standard, attackWeaponMode: 'THROWN', attackWeaponBundle: '' })).toBe(false);
    expect(isValidNativeAttackIntent({ ...standard, attackWeaponMode: 'ABILITY', attackWeaponBundle: '' })).toBe(false);
    expect(isValidNativeAttackIntent({ ...standard, attackWeaponMode: 'INVALID' })).toBe(false);
    expect(isValidNativeAttackIntent({ ...standard, damageMultiplier: 11 })).toBe(false);
    expect(isValidNativeAttackIntent({ ...standard, damageBonus: 100001 })).toBe(false);
    expect(isValidNativeAttackIntent({ ...standard, accuracyMultiplier: -1 })).toBe(false);
    expect(isValidNativeAttackIntent({ ...standard, attackWeaponBundle: 'x'.repeat(200001) })).toBe(false);
  });

  it('binds an authority result to exactly the reserved native invocation', () => {
    expect(hasMatchingNativeAttackIntent(standard, standard)).toBe(true);
    expect(hasMatchingNativeAttackIntent({ ...standard, damageMultiplier: 0.5 }, standard)).toBe(false);
    expect(hasMatchingNativeAttackIntent({ ...standard, attackWeaponBundle: 'forged' }, standard)).toBe(false);
    expect(hasMatchingNativeAttackIntent(standard, null)).toBe(false);
  });
});


describe('Publisher-authoritative mob-to-player outcomes', () => {
  const noEffect = (overrides: any = {}) => ({
    targetType: 'PLAYER', targetPlayerId: 'player-target', sourceType: 'MOB',
    sourceEntityId: 'native-mob-123456', combatSchemaVersion: 1, combatDepth: 3,
    sourcePos: 41, sourceAttackKind: 'MELEE', sourceActionCost: 1,
    sourceMobHpBefore: 10, sourceMobHtBefore: 10, sourceMobShieldBefore: 0, sourceMobPosBefore: 41,
    sourceMobHpAfter: 10, sourceMobHtAfter: 10, sourceMobShieldAfter: 0, sourceMobPosAfter: 41,
    sourceMobDamage: 0, sourceMobBuffsBefore: '[]', sourceMobBuffs: '[]', sourceMobBundleAfter: 'native-mob-bundle',
    targetHpBefore: 12, targetHtBefore: 12, targetHp: 12, targetHt: 12,
    targetPosBefore: 42, targetPosAfter: 42, targetShieldBefore: 2, targetShieldAfter: 2,
    targetBuffsBefore: '[]', targetBuffs: '[]', targetState: 'ALIVE', damage: 0, effectiveDamage: 0,
    ankhCountBefore: 0, ankhCountAfter: 0, blessedAnkhCountBefore: 0, blessedAnkhCountAfter: 0,
    engineHit: false, engineDamageResult: true, ...overrides
  });

  it('routes player targets only when the sender is the designated native mob publisher', () => {
    expect(resolveAuthorizedNativeMobDamageTarget('host','host','target')).toBe('target');
    expect(resolveAuthorizedNativeMobDamageTarget('target','host','target')).toBeNull();
    expect(resolveAuthorizedNativeMobDamageTarget('host',null,'target')).toBeNull();
    expect(resolveAuthorizedNativeMobDamageTarget('host','host','')).toBeNull();
    expect(resolveAuthorizedNativeMobDamageTarget('host','host','x'.repeat(81))).toBeNull();
  });

  it('accepts a native miss or immune no-effect hit only if target and source state remain unchanged', () => {
    expect(isValidNativeMobNoEffectOutcome(noEffect(), { hp:12,ht:12,pos:42,shielding:2 })).toBe(true);
    expect(isValidNativeMobNoEffectOutcome(noEffect({ engineHit:true }), { hp:12,ht:12,pos:42,shielding:2 })).toBe(true);
    expect(isValidNativeMobNoEffectOutcome(noEffect({ targetHp:11 }), { hp:12,ht:12,pos:42,shielding:2 })).toBe(false);
    expect(isValidNativeMobNoEffectOutcome(noEffect({ sourceMobDamage:1 }), { hp:12,ht:12,pos:42,shielding:2 })).toBe(false);
  });

  it('requires a real single blessed-Ankh consumption for an HP-increasing rescue', () => {
    const previous = { hp:2,ht:20,pos:42,shielding:0,cooldown:1,buffCount:0,
      combatBundle:'trusted',inventoryBundle:'ankh-before',ankhCount:1,blessedAnkhCount:1 };
    const rescued = { ...previous,hp:5,inventoryBundle:'ankh-after',ankhCount:0,blessedAnkhCount:0 };
    expect(hasValidBlessedAnkhConsumption(previous,rescued)).toBe(true);
    expect(hasValidBlessedAnkhConsumption(previous,{ ...rescued,hp:6 })).toBe(false);
    expect(hasValidBlessedAnkhConsumption(previous,{ ...rescued,ankhCount:1 })).toBe(false);
  });
});


describe('Unblessed Ankh revival contract', () => {
  const previous = () => ({
    hp: 0, ht: 20, pos: 42, shielding: 0, cooldown: 0, buffCount: 0,
    combatBundle: 'trusted-hero-class-equipment', inventoryBundle: 'inventory-with-unblessed-ankh',
    ankhCount: 1, blessedAnkhCount: 0
  });
  const revived = (overrides: any = {}) => ({
    hp: 20, ht: 20, pos: 57, shielding: 0, cooldown: 0, buffCount: 1,
    combatBundle: 'trusted-hero-class-equipment', inventoryBundle: 'inventory-after-ankh-and-lost-backpack',
    ankhCount: 0, blessedAnkhCount: 0, buff_0: 'native-LostInventory-bundle', buffCooldown_0: 1,
    ...overrides
  });

  it('accepts consuming exactly one unblessed Ankh and restoring full native HP', () => {
    expect(hasValidUnblessedAnkhConsumption(previous(), revived())).toBe(true);
  });

  it('rejects a missing Ankh, blessed-Ankh substitution, and forged HP', () => {
    expect(hasValidUnblessedAnkhConsumption({ ...previous(), ankhCount: 0 }, revived())).toBe(false);
    expect(hasValidUnblessedAnkhConsumption(previous(), revived({ ankhCount: 1 }))).toBe(false);
    expect(hasValidUnblessedAnkhConsumption(previous(), revived({ blessedAnkhCount: 1 }))).toBe(false);
    expect(hasValidUnblessedAnkhConsumption(previous(), revived({ hp: 19 }))).toBe(false);
    expect(hasValidUnblessedAnkhConsumption(previous(), revived({ inventoryBundle: previous().inventoryBundle }))).toBe(false);
  });

  it('requires a dead pre-state and unchanged maximum HP', () => {
    expect(hasValidUnblessedAnkhConsumption({ ...previous(), hp: 1 }, revived())).toBe(false);
    expect(hasValidUnblessedAnkhConsumption(previous(), revived({ ht: 21, hp: 21 }))).toBe(false);
  });
});


describe('Unblessed Ankh native LostBackpack loot contract', () => {
  const oldHeap = {
    pos: 42, type: 'HEAP', seen: true, haunted: false, hidden: false, autoExplored: false,
    items: [{ className: 'com.shatteredpixel.shatteredpixeldungeon.items.PotionOfHealing',
      quantity: 1, level: 0, cursed: false, cursedKnown: false, serializedBundle: 'healing-potion-native-bundle' }]
  };
  const lostBackpack = {
    className: 'com.shatteredpixel.shatteredpixeldungeon.items.LostBackpack',
    quantity: 1, level: 0, cursed: false, cursedKnown: false, serializedBundle: 'native-lost-backpack-bundle'
  };
  const newHeap = { ...oldHeap, items: [...oldHeap.items, lostBackpack] };

  it('allows exactly one native LostBackpack at the death cell while retaining existing items', () => {
    expect(hasOnlyNativeLostBackpackAdded([newHeap], [oldHeap], 42)).toBe(true);
    expect(hasOnlyNativeLostBackpackAdded([{ ...newHeap, items: [...newHeap.items].reverse() }], [oldHeap], 42)).toBe(true);
  });

  it('rejects fabricated loot, replacement of prior items, and more than one backpack', () => {
    expect(hasOnlyNativeLostBackpackAdded([{ ...newHeap, items: [...newHeap.items, {
      className: 'com.shatteredpixel.shatteredpixeldungeon.items.Ankh', quantity: 1, level: 0,
      cursed: false, cursedKnown: false, serializedBundle: 'forged-ankh'
    }] }], [oldHeap], 42)).toBe(false);
    expect(hasOnlyNativeLostBackpackAdded([{ ...newHeap, items: [lostBackpack] }], [oldHeap], 42)).toBe(false);
    expect(hasOnlyNativeLostBackpackAdded([{ ...newHeap, items: [...newHeap.items, lostBackpack] }], [oldHeap], 42)).toBe(false);
    expect(hasOnlyNativeLostBackpackAdded([{ ...newHeap, items: [...newHeap.items, { ...lostBackpack, quantity: 2 }] }], [oldHeap], 42)).toBe(false);
  });

  it('rejects missing death-cell heap or malformed snapshots', () => {
    expect(hasOnlyNativeLostBackpackAdded([], [oldHeap], 42)).toBe(false);
    expect(hasOnlyNativeLostBackpackAdded([newHeap], null, 42)).toBe(false);
    expect(hasOnlyNativeLostBackpackAdded([newHeap], [oldHeap], -1)).toBe(false);
  });
});


describe('Authoritative native movement and floor transition validation', () => {
  const makeTiles = () => Array.from({ length: 64 }, (_, pos) => ({
    pos, terrain: 1, passable: true, solid: false, pit: false, avoid: false
  }));

  it('accepts adjacent cardinal, clear diagonal and native closed-door steps', () => {
    const tiles = makeTiles();
    expect(isValidNativeMoveIntent(9, 10, 8, 8, tiles, [])).toBe(true);
    expect(isValidNativeMoveIntent(9, 18, 8, 8, tiles, [])).toBe(true);
    tiles[10] = { ...tiles[10], terrain: 5, passable: true, solid: true, pit: false };
    expect(isValidNativeMoveIntent(9, 10, 8, 8, tiles, [])).toBe(true);
  });

  it('rejects stale, non-adjacent, occupied, blocked destinations and pits, matching native SPD diagonal rules', () => {
    const tiles = makeTiles();
    expect(isValidNativeMoveIntent(-1, 10, 8, 8, tiles, [])).toBe(false);
    expect(isValidNativeMoveIntent(9, 26, 8, 8, tiles, [])).toBe(false);
    expect(isValidNativeMoveIntent(9, 10, 8, 8, tiles, [10])).toBe(false);
    tiles[10].pit = true;
    expect(isValidNativeMoveIntent(9, 10, 8, 8, tiles, [])).toBe(false);
    tiles[10].pit = false;
    // The original Hero.getCloser() does not add an extra two-side diagonal-corner rule.
    tiles[10].solid = true;
    expect(isValidNativeMoveIntent(9, 18, 8, 8, tiles, [])).toBe(true);
    tiles[18].passable = false;
    expect(isValidNativeMoveIntent(9, 18, 8, 8, tiles, [])).toBe(false);
  });

  it('returns explicit reasons for locked floors and unsupported branch transitions', () => {
    const level: any = { depth: 4, branch: 0, locked: false, transitions: [
      { pos: 23, type: 'REGULAR_EXIT', targetDepth: 5, targetBranch: 0, targetType: 'REGULAR_ENTRANCE' },
      { pos: 32, type: 'BRANCH_ENTRANCE', targetDepth: 5, targetBranch: 1, targetType: 'BRANCH_EXIT' }
    ] };
    expect(classifyNativeTransitionRejection({ ...level, locked: true }, 4, 23, { from: 23 })).toBe("FLOOR_LOCKED");
    expect(classifyNativeTransitionRejection(level, 4, 32, { from: 32 })).toBe("UNSUPPORTED_BRANCH_TRANSITION");
    expect(classifyNativeTransitionRejection({ ...level, branch: 1 }, 4, 23, { from: 23 })).toBe("UNSUPPORTED_BRANCH_TRANSITION");
    expect(classifyNativeTransitionRejection(level, 4, 23, { from: 23 })).toBe("INVALID_TRANSITION");
  });

  it('validates adjacent door, chest and living native NPC world intents only', () => {
    const level: any = {
      branch: 0, depth: 4, width: 8, height: 8, locked: false,
      tiles: Array.from({ length: 64 }, (_, pos) => ({ pos, terrain: 1 })), heaps: [], mobs: []
    };
    level.tiles[10].terrain = 10;
    expect(isValidNativeWorldActionIntent("UNLOCK", { depth: 4, from: 9, targetPos: 10, engineActionCost: 1 }, level, 4, 9)).toBe(true);
    expect(isValidNativeWorldActionIntent("UNLOCK", { depth: 4, from: 9, targetPos: 11, engineActionCost: 1 }, level, 4, 9)).toBe(false);
    expect(isValidNativeWorldActionIntent("UNLOCK", { depth: 4, from: 9, targetPos: 10 }, level, 4, 9)).toBe(false);
    expect(isValidNativeWorldActionIntent("UNLOCK", { depth: 4, from: 9, targetPos: 10, engineActionCost: 11 }, level, 4, 9)).toBe(false);
    level.tiles[10].terrain = 1;
    level.heaps.push({ heapId: "stable-lock-chest-001", pos: 10, type: "LOCKED_CHEST", items: [] });
    expect(isValidNativeWorldActionIntent("OPEN_CHEST", {
      depth: 4, from: 9, targetPos: 10, heapId: "stable-lock-chest-001",
      heapType: "LOCKED_CHEST", engineActionCost: 1
    }, level, 4, 9)).toBe(true);
    expect(isValidNativeWorldActionIntent("OPEN_CHEST", {
      depth: 4, from: 9, targetPos: 10, heapId: "different-chest-001",
      heapType: "LOCKED_CHEST", engineActionCost: 1
    }, level, 4, 9)).toBe(false);
    level.heaps = [];
    level.mobs.push({ pos: 10, hp: 4, entityId: "stable-world-npc-0001" });
    expect(isValidNativeWorldActionIntent("INTERACT", { depth: 4, from: 9, targetPos: 10, engineActionCost: 1 }, level, 4, 9)).toBe(true);
    expect(isValidNativeWorldActionIntent("INTERACT", { depth: 4, from: 9, targetPos: 30, engineActionCost: 1 }, level, 4, 9)).toBe(false);
    expect(isValidNativeWorldActionIntent("UNLOCK", { depth: 4, from: 9, targetPos: 10 }, { ...level, locked: true }, 4, 9)).toBe(false);
  });

  it('blocks simultaneous or unauthorized floor-transition attempts before a second barrier can start', () => {
    expect(canStartNativeFloorTransition(false, 'ALIVE', true)).toBe(true);
    expect(canStartNativeFloorTransition(true, 'ALIVE', true)).toBe(false);
    expect(canStartNativeFloorTransition(false, 'DEAD', true)).toBe(false);
    expect(canStartNativeFloorTransition(false, 'ALIVE', false)).toBe(false);
    expect(canStartNativeFloorTransition(undefined, 'ALIVE', true)).toBe(false);
    expect(canStartNativeFloorTransition(false, 'ALIVE', undefined)).toBe(false);
  });

  it('only admits a destination-floor snapshot from the transition publisher and keeps source depth until commit', () => {
    const pending = { fromDepth: 4, depth: 5, targetBranch: 0, publisherId: 'publisher-123', snapshotReady: false };
    expect(isPendingNativeFloorDestinationSnapshot(4, pending, 5, 0, 'publisher-123')).toBe(true);
    expect(isPendingNativeFloorDestinationSnapshot(4, pending, 5, 1, 'publisher-123')).toBe(false);
    expect(isPendingNativeFloorDestinationSnapshot(4, pending, 6, 0, 'publisher-123')).toBe(false);
    expect(isPendingNativeFloorDestinationSnapshot(4, pending, 5, 0, 'guest-456')).toBe(false);
    expect(isPendingNativeFloorDestinationSnapshot(5, pending, 5, 0, 'publisher-123')).toBe(false);
    expect(canFinalizeNativeFloorTransition(4, pending, false, true, 2, 2)).toBe(false);
    expect(canFinalizeNativeFloorTransition(4, { ...pending, snapshotReady: true }, true, false, 2, 2)).toBe(false);
    expect(canFinalizeNativeFloorTransition(4, { ...pending, snapshotReady: true }, true, true, 1, 2)).toBe(false);
    expect(canFinalizeNativeFloorTransition(4, { ...pending, snapshotReady: true }, true, true, 2, 2)).toBe(true);
    expect(canFinalizeNativeFloorTransition(5, { ...pending, snapshotReady: true }, true, true, 2, 2)).toBe(false);
    expect(canAbortNativeFloorTransition(4, { ...pending, startedAt: 1234 })).toBe(true);
    expect(canAbortNativeFloorTransition(5, { ...pending, startedAt: 1234 })).toBe(false);
    expect(canAbortNativeFloorTransition(4, { ...pending, targetBranch: 1, startedAt: 1234 })).toBe(false);
    expect(canAbortNativeFloorTransition(4, { ...pending, startedAt: 'invalid' })).toBe(false);
  });

  it('validates native pit falls separately from regular stair transitions and uses a safe landing', () => {
    const sourceTiles = Array.from({ length: 64 }, (_, pos) => ({
      pos, terrain: 1, passable: true, solid: false, pit: false, avoid: false
    }));
    sourceTiles[10] = { ...sourceTiles[10], terrain: 0, passable: false, solid: false, pit: true, avoid: true };
    const sourceLevel: any = {
      depth: 4, branch: 0, width: 8, height: 8, locked: false,
      tiles: sourceTiles, transitions: []
    };
    const fallIntent = {
      transitionKind: 'FALL', depth: 4, branch: 0, from: 9, to: 9, stairsPos: 9, pitPos: 10
    };
    expect(resolveNativeTransitionIntent(sourceLevel, 4, 9, fallIntent)).toEqual({
      fromDepth: 4, depth: 5, transitionPos: 9, transitionType: 'FALL',
      targetType: 'FALL', targetBranch: 0, pitPos: 10
    });
    expect(resolveNativeTransitionIntent({ ...sourceLevel, locked: true }, 4, 9, fallIntent)).toBeNull();
    expect(resolveNativeTransitionIntent(sourceLevel, 4, 9, { ...fallIntent, pitPos: 26 })).toBeNull();
    expect(resolveNativeTransitionIntent(sourceLevel, 4, 9, { ...fallIntent, pitPos: 11 })).toBeNull();
    expect(resolveNativeTransitionIntent(sourceLevel, 4, 9, { ...fallIntent, branch: 1 })).toBeNull();
    expect(resolveNativeTransitionIntent(sourceLevel, 4, 8, fallIntent)).toBeNull();

    const landingTiles = Array.from({ length: 64 }, (_, pos) => ({
      pos, terrain: 1, passable: true, solid: false, pit: false
    }));
    landingTiles[10] = { ...landingTiles[10], terrain: 0, passable: false, solid: false, pit: true };
    const destination: any = {
      depth: 5, branch: 0, width: 8, height: 8, seed: 713,
      tiles: landingTiles, transitions: [], traps: [], mobs: [],
      heroStateJson: JSON.stringify({
        hp: 20, ht: 20, pos: 9, shielding: 0,
        combatBundle: 'native-hero-bundle', inventoryBundle: 'native-inventory-bundle', buffCount: 0
      })
    };
    expect(isValidNativeFallLanding(destination, 9)).toBe(true);
    expect(isValidNativeFallLanding(destination, 10)).toBe(false);
    expect(isValidNativeFallLanding({ ...destination, traps: [{ pos: 9 }] }, 9)).toBe(false);
    expect(isValidNativeFallLanding({ ...destination, mobs: [{ pos: 9, hp: 8 }] }, 9)).toBe(false);
    expect(isValidNativeFallDestinationSnapshot(destination)).toBe(true);
    expect(isValidNativeFallDestinationSnapshot({
      ...destination,
      heroStateJson: JSON.stringify({
        hp: 20, ht: 20, pos: 10, shielding: 0,
        combatBundle: 'native-hero-bundle', inventoryBundle: 'native-inventory-bundle', buffCount: 0
      })
    })).toBe(false);
  });

  it('resolves only the matching unlocked regular transition on the current floor', () => {
    const level = { depth: 4, branch: 0, locked: false, transitions: [
      { pos: 23, type: 'REGULAR_EXIT', targetDepth: 5, targetBranch: 0, targetType: 'REGULAR_ENTRANCE' }
    ]};
    const data = { depth: 4, from: 23, to: 23, stairsPos: 23 };
    expect(resolveNativeTransitionIntent(level, 4, 23, data)).toEqual({
      fromDepth: 4, depth: 5, transitionPos: 23, transitionType: 'REGULAR_EXIT',
      targetType: 'REGULAR_ENTRANCE', targetBranch: 0
    });
    expect(resolveNativeTransitionIntent({ ...level, locked: true }, 4, 23, data)).toBeNull();
    expect(resolveNativeTransitionIntent(level, 3, 23, data)).toBeNull();
    expect(resolveNativeTransitionIntent(level, 4, 22, data)).toBeNull();
    expect(resolveNativeTransitionIntent({ ...level, transitions: [
      { pos: 23, type: 'BRANCH_EXIT', targetDepth: 5, targetBranch: 1, targetType: 'BRANCH_ENTRANCE' }
    ]}, 4, 23, data)).toBeNull();
  });
});

describe('Native movement mutation snapshot admission', () => {
  const heroState = (pos: number, overrides: Record<string, any> = {}) => JSON.stringify({
    hp: 20, ht: 20, pos, shielding: 0,
    combatBundle: 'native-hero-bundle', inventoryBundle: 'native-inventory-bundle',
    buffCount: 0, ironKeyCount: 0, crystalKeyCount: 0, wornKeyCount: 0, goldenKeyCount: 0,
    notesBundle: 'native-notes-bundle', questStateBundle: 'native-quest-bundle',
    cooldown: 0, ...overrides
  });
  const level = (heroPos: number) => ({
    schemaVersion: 1, depth: 1, branch: 0, width: 8, height: 8, seed: 713,
    entrancePos: 9, exitPos: 54, locked: false, feeling: 'NONE',
    nativeLevelMetadataBundle: 'native-level-metadata',
    nativeWorldMutation: false,
    tiles: Array.from({ length: 64 }, (_, pos) => ({
      pos, terrain: 1, passable: true, solid: false, pit: false, losBlocking: false,
      flammable: false, secret: false, avoid: false, water: false,
      discoverable: false, openSpace: false
    })),
    transitions: [], heaps: [], traps: [], blobs: [], plants: [], mobs: [],
    visitedPositions: [9], mappedPositions: [9], heroStateJson: heroState(heroPos)
  });
  const admitMove = (before: any, after: any) => {
    after.nativeWorldMutation = true;
    return isValidNativeWorldMutation(before, after, 'MOVE', 9, 10, before.heroStateJson);
  };

  it('accepts the original engine opening a door during an adjacent move', () => {
    const before = level(9);
    const after = level(10);
    before.tiles[10] = { ...before.tiles[10], terrain: 5, passable: true, solid: true,
      pit: false, losBlocking: true, flammable: true, secret: false, avoid: false, water: false };
    after.tiles[10] = { ...after.tiles[10], terrain: 6, passable: true, solid: false,
      pit: false, losBlocking: false, flammable: true, secret: false, avoid: false, water: false };
    expect(admitMove(before, after)).toBe(true);
  });

  it('rejects remote terrain edits and forged inventory inside a full movement snapshot', () => {
    const before = level(9);
    const remoteEdit = level(10);
    remoteEdit.tiles[63] = {
      ...remoteEdit.tiles[63], terrain: 4, passable: false, solid: true, losBlocking: true
    };
    expect(admitMove(before, remoteEdit)).toBe(false);

    const forgedInventory = level(10);
    forgedInventory.heroStateJson = heroState(10, { inventoryBundle: 'invented-key-and-loot' });
    expect(admitMove(before, forgedInventory)).toBe(false);
  });

  it('accepts native high-grass loot and rejects invented loot during movement', () => {
    const before = level(9);
    before.tiles[10] = { ...before.tiles[10], terrain: 15, losBlocking: true, flammable: true };
    const nativeDrop: any = level(10);
    nativeDrop.tiles[10] = { ...nativeDrop.tiles[10], terrain: 2, flammable: true };
    nativeDrop.heaps.push({ pos: 10, type: 'HEAP', seen: true, haunted: false, hidden: false, autoExplored: false,
      items: [{ className: 'com.shatteredpixel.shatteredpixeldungeon.items.Dewdrop',
        quantity: 1, level: 0, cursed: false, cursedKnown: false, serializedBundle: 'native-dewdrop-bundle' }] });
    expect(isValidNativeMovementHeapMutation(before, nativeDrop, 10)).toBe(true);
    expect(admitMove(before, nativeDrop)).toBe(true);

    const forgedDrop = JSON.parse(JSON.stringify(nativeDrop));
    forgedDrop.heaps[0].items[0] = { className: 'com.shatteredpixel.shatteredpixeldungeon.items.Ankh',
      quantity: 1, level: 0, cursed: false, cursedKnown: false, serializedBundle: 'forged-ankh-bundle' };
    expect(isValidNativeMovementHeapMutation(before, forgedDrop, 10)).toBe(false);
    expect(admitMove(before, forgedDrop)).toBe(false);
  });

  it('rejects forged collision, sight, hazard and liquid flags alongside an otherwise allowed terrain change', () => {
    const before = level(9);
    before.tiles[10] = { ...before.tiles[10], terrain: 5, passable: true, solid: true,
      losBlocking: true, flammable: true };
    const forged = level(10);
    forged.tiles[10] = { ...forged.tiles[10], terrain: 6, passable: true, solid: false,
      losBlocking: false, flammable: false };
    expect(admitMove(before, forged)).toBe(false);
  });

  it('validates stable heap/item IDs in new snapshots and keeps legacy snapshots readable', () => {
    const legacy = level(9);
    expect(hasCompleteNativeLevelSnapshot(legacy)).toBe(true);

    const modern = level(9);
    (modern as any).heaps = [{
      heapId: 'stable-heap-0001', pos: 9, type: 'HEAP', seen: true, haunted: false,
      hidden: false, autoExplored: false,
      items: [{
        itemId: 'stable-item-0001',
        className: 'com.shatteredpixel.shatteredpixeldungeon.items.PotionOfHealing',
        quantity: 1, level: 0, cursed: false, cursedKnown: false, stackable: false,
        serializedBundle: 'native-bundle-stable-item-0001'
      }]
    }];
    expect(hasCompleteNativeLevelSnapshot(modern)).toBe(true);

    const duplicateHeap = JSON.parse(JSON.stringify(modern));
    duplicateHeap.heaps.push({ ...duplicateHeap.heaps[0], pos: 10 });
    expect(hasCompleteNativeLevelSnapshot(duplicateHeap)).toBe(false);

    const duplicateItem = JSON.parse(JSON.stringify(modern));
    duplicateItem.heaps.push({
      ...duplicateItem.heaps[0], heapId: 'stable-heap-0002', pos: 10,
      items: [{ ...duplicateItem.heaps[0].items[0] }]
    });
    expect(hasCompleteNativeLevelSnapshot(duplicateItem)).toBe(false);

    const mismatchedBundle = JSON.parse(JSON.stringify(modern));
    mismatchedBundle.heaps[0].items[0].serializedBundle = 'native-bundle-without-id';
    expect(hasCompleteNativeLevelSnapshot(mismatchedBundle)).toBe(false);

    const malformedStackFlag = JSON.parse(JSON.stringify(modern));
    malformedStackFlag.heaps[0].items[0].stackable = 'false';
    expect(hasCompleteNativeLevelSnapshot(malformedStackFlag)).toBe(false);
  });

  it('requires stable native map coverage and does not permit a teleporting Hero', () => {
    const before = level(9);
    const teleported = level(50);
    teleported.nativeWorldMutation = true;
    expect(isValidNativeWorldMutation(before, teleported, 'MOVE', 9, 10, before.heroStateJson)).toBe(false);
    const incomplete = level(10);
    incomplete.tiles = incomplete.tiles.slice(0, 63);
    incomplete.nativeWorldMutation = true;
    expect(isValidNativeWorldMutation(before, incomplete, 'MOVE', 9, 10, before.heroStateJson)).toBe(false);
  });
});



describe("Native item DROP ownership validation", () => {
  const cls = "com.shatteredpixel.shatteredpixeldungeon.items.PotionOfHealing";
  const item = (id:string, itemClass=cls) => ({itemId:id,className:itemClass,quantity:1,level:0,cursed:false,cursedKnown:false,
    stackable:false,equipped:false,serializedBundle:"stable-bundle-item-id:"+id});
  const hero = (items:any[]) => JSON.stringify({hp:10,ht:10,pos:9,shielding:0,gold:0,inventoryBundle:"inv",
    inventoryItemsJson:JSON.stringify(items)});
  const hItem = (id:string) => ({itemId:id,className:cls,quantity:1,level:0,cursed:false,cursedKnown:false,
    stackable:false,serializedBundle:"stable-bundle-item-id:"+id});
  const heap = (heapId:string,pos:number,items:any[]) => ({heapId,pos,type:"HEAP",seen:false,haunted:false,hidden:false,autoExplored:false,items});
  const details = (extra:Record<string,any>={}) => ({from:9,to:9,targetPos:9,depth:4,branch:0,engineActionCost:1,
    heapId:"stable-heap-001",itemId:"stable-item-001",resultItemId:"stable-item-001",itemClass:cls,
    expectedQuantity:1,sourceQuantityBefore:1,stackable:false,...extra});
  it("accepts only a trusted owned item at the correct depth and cell",()=>{
    const prior=hero([item("stable-item-001")]), level={depth:4,branch:0,locked:false,heaps:[]};
    expect(isValidNativeDropIntent(level,details(),4,"player-001",{pos:9,state:"ALIVE"},prior)).toBe(true);
    expect(isValidNativeDropIntent(level,details({itemId:"stable-forged-01"}),4,"player-001",{pos:9,state:"ALIVE"},prior)).toBe(false);
    expect(isValidNativeDropIntent(level,details({depth:5}),4,"player-001",{pos:9,state:"ALIVE"},prior)).toBe(false);
  });
  it("requires exact source removal plus the same stable instance in the floor heap",()=>{
    const prior=hero([item("stable-item-001"),item("stable-other-001","com.shatteredpixel.shatteredpixeldungeon.items.ScrollOfIdentify")]);
    const after=hero([item("stable-other-001","com.shatteredpixel.shatteredpixeldungeon.items.ScrollOfIdentify")]);
    const d=details(), accepted={...d,actionType:"DROP"};
    expect(isValidNativeDropInventoryMutation(prior,after,d)).toBe(true);
    expect(isValidNativeDropInventoryMutation(prior,prior,d)).toBe(false);
    expect(isValidNativeDropHeapMutation([], [heap("stable-heap-001",9,[hItem("stable-item-001")])],9,d,accepted)).toBe(true);
    expect(isValidNativeDropHeapMutation([], [heap("different-heap-001",9,[hItem("stable-item-001")])],9,d,accepted)).toBe(false);
    expect(isValidNativeDropHeapMutation([], [heap("stable-heap-001",9,[hItem("stable-forged-01")])],9,d,accepted)).toBe(false);
  });
});


describe("Native pickup inventory transaction validation", () => {
  const potion = "com.shatteredpixel.shatteredpixeldungeon.items.PotionOfHealing";
  const row = (id:string, cls=potion, quantity=1, stackable=false, bundle?:string) => ({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,stackable,equipped:false,
    serializedBundle:bundle || "bundle-item-id:"+id+"-quantity-"+quantity
  });
  const hero = (items:any[], extra:Record<string,any>={}) => ({
    hp:10,ht:10,pos:9,shielding:0,gold:0,ironKeyCount:0,crystalKeyCount:0,wornKeyCount:0,goldenKeyCount:0,
    inventoryItemsJson:JSON.stringify(items),...extra
  });
  const pickup = (id:string, cls=potion, quantity=1, stackable=false) => ({
    actionType:"PICKUP",itemId:id,itemClass:cls,expectedQuantity:quantity,stackable
  });
  it("accepts one new item but rejects unrelated additions and forged IDs",()=>{
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([])),
      JSON.stringify(hero([row("stable-potion-001")])),pickup("stable-potion-001"))).toBe(true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([])),
      JSON.stringify(hero([row("stable-potion-001"),row("stable-forged-001")])),pickup("stable-potion-001"))).toBe(false);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([])),
      JSON.stringify(hero([row("stable-other-001")])),pickup("stable-potion-001"))).toBe(false);
  });
  it("allows exactly the expected quantity increase to one existing stack",()=>{
    const old=row("stable-stack-001",potion,3,true,"old bundle stable-stack-001");
    const updated=row("stable-stack-001",potion,5,true,"new bundle stable-stack-001");
    const accepted=pickup("stable-picked-001",potion,2,true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([old])),JSON.stringify(hero([updated])),accepted)).toBe(true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([old])),
      JSON.stringify(hero([row("stable-stack-001",potion,6,true)])),accepted)).toBe(false);
  });
  it("checks exact Gold changes and a single matching key counter",()=>{
    const gold=pickup("stable-gold-001","com.shatteredpixel.shatteredpixeldungeon.items.Gold",3,true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([])),JSON.stringify(hero([],{gold:3})),gold)).toBe(true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([])),JSON.stringify(hero([],{gold:4})),gold)).toBe(false);
    const key=pickup("stable-key-001","com.shatteredpixel.shatteredpixeldungeon.items.keys.IronKey");
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([])),JSON.stringify(hero([],{ironKeyCount:1})),key)).toBe(true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([])),JSON.stringify(hero([],{ironKeyCount:1,goldenKeyCount:1})),key)).toBe(false);
  });
  it("commits EnergyCrystal pickup as an exact energy increase without adding a backpack item",()=>{
    const energyClass="com.shatteredpixel.shatteredpixeldungeon.items.EnergyCrystal";
    const before=JSON.stringify(hero([],{inventoryBundle:"same-native-inventory",alchemyEnergy:4,quickslotsJson:"[]"}));
    const after=JSON.stringify(hero([],{inventoryBundle:"same-native-inventory",alchemyEnergy:7,quickslotsJson:"[]"}));
    const energy=pickup("stable-energy-001",energyClass,3,true);
    expect(isValidNativePickupInventoryMutation(before,after,energy)).toBe(true);
    expect(isValidNativePickupInventoryMutation(before,JSON.stringify(
      hero([],{inventoryBundle:"same-native-inventory",alchemyEnergy:8,quickslotsJson:"[]"})),energy)).toBe(false);
    expect(isValidNativePickupInventoryMutation(before,JSON.stringify(
      hero([],{inventoryBundle:"same-native-inventory",alchemyEnergy:4,quickslotsJson:"[]"})),energy)).toBe(false);
    expect(isValidNativePickupInventoryMutation(before,JSON.stringify(
      hero([row("stable-energy-001",energyClass,3,true)],{inventoryBundle:"inventory-forged",alchemyEnergy:7,quickslotsJson:"[]"})),energy)).toBe(false);
    expect(isValidNativePickupInventoryMutation(before,JSON.stringify(
      hero([],{inventoryBundle:"inventory-forged",alchemyEnergy:7,quickslotsJson:"[]"})),energy)).toBe(false);
  });
  it("allows Dewdrop consumption or filling a Waterskin without unrelated inventory changes",()=>{
    const dew=pickup("stable-dew-001","com.shatteredpixel.shatteredpixeldungeon.items.Dewdrop",1,true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([])),JSON.stringify(hero([])),dew)).toBe(true);
    const oldSkin=row("stable-skin-001","com.shatteredpixel.shatteredpixeldungeon.items.Waterskin",1,false,"water=0 stable-skin-001");
    const newSkin=row("stable-skin-001","com.shatteredpixel.shatteredpixeldungeon.items.Waterskin",1,false,"water=1 stable-skin-001");
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([oldSkin])),JSON.stringify(hero([newSkin])),dew)).toBe(true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(hero([oldSkin])),JSON.stringify(hero([newSkin,row("stable-forged-001")])),dew)).toBe(false);
  });
});


describe("Native equipment, quickslot, and chest transactions", () => {
  const cls = "com.shatteredpixel.shatteredpixeldungeon.items.weapon.melee.Dagger";
  const nativeItem = (id:string,className=cls,opts:Record<string,any>={}) => {
    const item:any={__className:className,multiplayer_item_id:id,quantity:1,level:0,
      levelKnown:opts.levelKnown !== false,cursed:false,cursedKnown:opts.cursedKnown === true};
    if (opts.quickslotpos !== undefined) item.quickslotpos=opts.quickslotpos;
    if (opts.seal !== undefined) item.seal=opts.seal;
    return JSON.stringify({item});
  };
  const item = (itemId:string,className=cls,quantity=1,equipped=false,bundle?:string,cursedKnown=false) => ({
    itemId,className,quantity,level:0,cursed:false,cursedKnown,stackable:false,equipped,
    serializedBundle:bundle || nativeItem(itemId,className,{cursedKnown})
  });
  const hero = (items:any[], extra:Record<string,any>={}) => {
    const payload=(row:any)=>JSON.parse(row.serializedBundle).item;
    const belongings:any={inventory:items.filter(row=>!row.equipped).map(payload)};
    const weapon=items.find(row=>row.equipped && row.className.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.weapon."));
    const armor=items.find(row=>row.equipped && row.className.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.armor."));
    if (weapon) belongings.weapon=payload(weapon);
    if (armor) belongings.armor=payload(armor);
    const cooldown=Number(extra.cooldown || 0);
    const combat:any={...belongings,id:77,time:10+cooldown,class:"ROGUE",subClass:"NONE",STR:10,buffs:[],
      talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{}};
    return {
      hp:10,ht:10,pos:9,shielding:0,gold:0,alchemyEnergy:0,ankhCount:0,blessedAnkhCount:0,
      ironKeyCount:0,crystalKeyCount:0,wornKeyCount:0,goldenKeyCount:0,cooldown,
      inventoryBundle:JSON.stringify(belongings),combatBundle:extra.combatBundle || JSON.stringify(combat),
      inventoryItemsJson:JSON.stringify(items),quickslotsJson:extra.quickslotsJson || "[]",
      notesBundle:"native-notes",questStateBundle:"native-quests",...extra
    };
  };
  const quickslots=(slot:number,id:string,itemClass:string,quantity:number,bundle:string) =>
    JSON.stringify([{slot,itemId:id,className:itemClass,quantity,serializedBundle:bundle}]);
  it("validates quickslots against exact inventory rows and rejects duplicate slots or forged IDs",()=>{
    const itemRow=item("stable-dagger-001");
    const valid=hero([itemRow],{quickslotsJson:quickslots(0,itemRow.itemId,itemRow.className,itemRow.quantity,itemRow.serializedBundle)});
    expect(parseNativeQuickslotIndex(valid)).not.toBeNull();
    valid.quickslotsJson=JSON.stringify([
      {slot:0,itemId:itemRow.itemId,className:itemRow.className,quantity:1,serializedBundle:itemRow.serializedBundle},
      {slot:0,itemId:"stable-other-001",className:cls,quantity:1,serializedBundle:"native-bundle-item-id:stable-other-001"}
    ]);
    expect(parseNativeQuickslotIndex(valid)).toBeNull();
  });
  it("accepts native equip and unequip only with exact belongings, Hero clock, and item bundles",()=>{
    const id="stable-dagger-001";
    const before=hero([item(id,cls,1,false,nativeItem(id,cls))]);
    const after=hero([item(id,cls,1,true,nativeItem(id,cls,{cursedKnown:true}),true)],{cooldown:1});
    const detail={itemId:id,itemClass:cls,expectedEquipped:true};
    const accepted={...detail,actionType:"EQUIP"};
    const intent={...detail,depth:4,from:9,to:9,targetPos:9,engineActionCost:1};
    expect(isValidNativeEquipmentIntent(JSON.stringify(before),intent,"EQUIP",4,{pos:9,state:"ALIVE"})).toBe(true);
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify(after),"EQUIP",detail,accepted)).toBe(true);

    const unequipBefore=hero([item(id,cls,1,true,nativeItem(id,cls,{cursedKnown:true}),true)]);
    const unequipAfter=hero([item(id,cls,1,false,nativeItem(id,cls,{cursedKnown:true}),true)],{cooldown:1});
    const unequipDetail={itemId:id,itemClass:cls,expectedEquipped:false};
    expect(isValidNativeEquipmentMutation(JSON.stringify(unequipBefore),JSON.stringify(unequipAfter),
      "UNEQUIP",unequipDetail,{...unequipDetail,actionType:"UNEQUIP"})).toBe(true);

    const forgedCombat=JSON.parse(after.combatBundle);
    forgedCombat.STR++;
    const forgedHero={...after,combatBundle:JSON.stringify(forgedCombat)};
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify(forgedHero),"EQUIP",detail,accepted)).toBe(false);
    const forgedClock=JSON.parse(after.combatBundle);
    forgedClock.time+=4;
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify({...after,combatBundle:JSON.stringify(forgedClock)}),
      "EQUIP",detail,accepted)).toBe(false);
    const forgedItem=item(id,cls,1,true,nativeItem(id,cls,{cursedKnown:true,seal:{__className:"forged"}}),true);
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify(hero([forgedItem],{cooldown:1})),
      "EQUIP",detail,accepted)).toBe(false);
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify(hero([after.inventoryItemsJson && JSON.parse(after.inventoryItemsJson)[0],item("stable-forged-001","com.example.Forged")],{cooldown:1})),
      "EQUIP",detail,accepted)).toBe(false);
  });
  it("rejects nested-bag, identification, Duelist-buff, sealed-armor, and full-capacity equipment mutations before admission",()=>{
    const intentFor=(itemId:string,itemClass:string,action="EQUIP")=>({
      itemId,itemClass,expectedEquipped:action==="EQUIP",depth:4,from:9,to:9,targetPos:9,engineActionCost:1
    });
    const withTalent=(state:any,tier:number,talent:string,points:number,className?:string)=>{
      const combat=JSON.parse(state.combatBundle);
      combat["talents_tier_"+tier][talent]=points;
      if(className) combat.class=className;
      return {...state,combatBundle:JSON.stringify(combat)};
    };
    const talentWeapon=item("stable-adventurer-talent-001");
    const adventurer=withTalent(hero([talentWeapon]),2,"ADVENTURERS_INTUITION",2);
    expect(isValidNativeEquipmentIntent(JSON.stringify(adventurer),
      intentFor(talentWeapon.itemId,talentWeapon.className),"EQUIP",4,{pos:9,state:"ALIVE"})).toBe(false);

    const armorClass="com.shatteredpixel.shatteredpixeldungeon.items.armor.LeatherArmor";
    const veteranArmor=item("stable-veteran-talent-001",armorClass,1,false,nativeItem("stable-veteran-talent-001",armorClass));
    const veteran=withTalent(hero([veteranArmor]),2,"VETERANS_INTUITION",2);
    expect(isValidNativeEquipmentIntent(JSON.stringify(veteran),
      intentFor(veteranArmor.itemId,armorClass),"EQUIP",4,{pos:9,state:"ALIVE"})).toBe(false);

    const oldDuelist=item("stable-duelist-old-001",cls,1,true,nativeItem("stable-duelist-old-001",cls),true);
    const rangedClass="com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.Shuriken";
    const newRanged=item("stable-duelist-new-001",rangedClass);
    const duelist=withTalent(hero([oldDuelist,newRanged]),1,"SWIFT_EQUIP",0,"DUELIST");
    const duelistCombat=JSON.parse(duelist.combatBundle); duelistCombat.subClass="NONE";
    duelist.combatBundle=JSON.stringify(duelistCombat);
    expect(isValidNativeEquipmentIntent(JSON.stringify(duelist),
      intentFor(newRanged.itemId,rangedClass),"EQUIP",4,{pos:9,state:"ALIVE"})).toBe(false);

    const oldArmorClass="com.shatteredpixel.shatteredpixeldungeon.items.armor.LeatherArmor";
    const newArmorClass="com.shatteredpixel.shatteredpixeldungeon.items.armor.MailArmor";
    const oldArmor=item("stable-sealed-old-armor-001",oldArmorClass,1,true,
      nativeItem("stable-sealed-old-armor-001",oldArmorClass,{cursedKnown:true,seal:{__className:"BrokenSeal"}}),true);
    const newArmor=item("stable-sealed-new-armor-001",newArmorClass);
    const sealed=hero([oldArmor,newArmor]);
    expect(isValidNativeEquipmentIntent(JSON.stringify(sealed),
      intentFor(newArmor.itemId,newArmorClass),"EQUIP",4,{pos:9,state:"ALIVE"})).toBe(false);

    const fullInventory=Array.from({length:20},(_,i)=>item("stable-capacity-item-"+String(i).padStart(3,"0")));
    const equipped=item("stable-capacity-equipped-001",cls,1,true,nativeItem("stable-capacity-equipped-001",cls,{cursedKnown:true}),true);
    const full=hero([equipped,...fullInventory]);
    expect(isValidNativeEquipmentIntent(JSON.stringify(full),
      intentFor(equipped.itemId,cls,"UNEQUIP"),"UNEQUIP",4,{pos:9,state:"ALIVE"})).toBe(false);

    const nestedTarget=item("stable-nested-gear-001");
    const nested=hero([nestedTarget]);
    nested.inventoryBundle=JSON.stringify({inventory:[{
      __className:"com.shatteredpixel.shatteredpixeldungeon.items.bags.SeedPouch",
      multiplayer_item_id:"stable-nested-bag-001",items:[JSON.parse(nestedTarget.serializedBundle).item]
    }]});
    expect(isValidNativeEquipmentIntent(JSON.stringify(nested),
      intentFor(nestedTarget.itemId,cls),"EQUIP",4,{pos:9,state:"ALIVE"})).toBe(false);
  });
  it("moves the old equipment quickslot to the replacement only when the original engine keeps the same slot",()=>{
    const oldId="stable-old-dagger-001",newId="stable-new-dagger-001";
    const oldBefore=item(oldId,cls,1,true,nativeItem(oldId,cls,{cursedKnown:true,quickslotpos:0}),true);
    const newBefore=item(newId,cls,1,false,nativeItem(newId,cls));
    const oldAfter=item(oldId,cls,1,false,nativeItem(oldId,cls,{cursedKnown:true}),true);
    const newAfter=item(newId,cls,1,true,nativeItem(newId,cls,{cursedKnown:true,quickslotpos:0}),true);
    const before=hero([oldBefore,newBefore],{
      quickslotsJson:quickslots(0,oldId,cls,1,oldBefore.serializedBundle)
    });
    const after=hero([oldAfter,newAfter],{
      cooldown:1,quickslotsJson:quickslots(0,newId,cls,1,newAfter.serializedBundle)
    });
    const detail={itemId:newId,itemClass:cls,expectedEquipped:true};
    const intent={...detail,depth:4,from:9,to:9,targetPos:9,engineActionCost:1};
    expect(isValidNativeEquipmentIntent(JSON.stringify(before),intent,"EQUIP",4,{pos:9,state:"ALIVE"})).toBe(true);
    expect(isValidNativeEquipmentIntent(JSON.stringify(before),intent,"EQUIP",4,{pos:9,state:"ALIVE"})).toBe(true);
    const beforeRows=JSON.parse(String(before.inventoryItemsJson)), afterRows=JSON.parse(String(after.inventoryItemsJson));
    const beforeSlots=JSON.parse(before.quickslotsJson),afterSlots=JSON.parse(after.quickslotsJson);
    expect(isValidNativeEquipmentCombatBundleMutation(before,after)).toBe(true);
    expect(nativeEquipmentRowBundleTransitionMatches(beforeRows[0],afterRows[0],false)).toBe(true);
    expect(nativeEquipmentRowBundleTransitionMatches(beforeRows[1],afterRows[1],true)).toBe(true);
    expect(nativeEquipmentQuickslotPositionMatches(beforeRows[0],beforeSlots)).toBe(true);
    expect(nativeEquipmentQuickslotPositionMatches(beforeRows[1],beforeSlots)).toBe(true);
    expect(nativeEquipmentQuickslotPositionMatches(afterRows[0],afterSlots)).toBe(true);
    expect(nativeEquipmentQuickslotPositionMatches(afterRows[1],afterSlots)).toBe(true);
    expect(nativeEquipmentPayloadMatchesRow(JSON.parse(afterRows[0].serializedBundle),afterRows[0])).toBe(true);
    expect(isValidNativeEquipmentBelongingsMutation(before,after,beforeRows,afterRows,"EQUIP",newId,cls)).toBe(true);
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify(after),"EQUIP",detail,
      {...detail,actionType:"EQUIP"})).toBe(true);
    const wrongSlot={...after,quickslotsJson:quickslots(1,newId,cls,1,newAfter.serializedBundle)};
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify(wrongSlot),"EQUIP",detail,
      {...detail,actionType:"EQUIP"})).toBe(false);
  });
  it("opens one stable chest without losing or creating items and enforces exact key consumption",()=>{
    const contents=[{itemId:"stable-chest-loot-001",className:"com.shatteredpixel.shatteredpixeldungeon.items.PotionOfHealing",
      quantity:1,level:0,cursed:false,cursedKnown:false,stackable:false,
      serializedBundle:"native-bundle-item-id:stable-chest-loot-001"}];
    const oldHeap={heapId:"stable-chest-001",pos:10,type:"LOCKED_CHEST",seen:true,haunted:false,hidden:false,autoExplored:false,items:contents};
    const newHeap={...oldHeap,type:"HEAP"};
    const before=hero([],{goldenKeyCount:1});
    const after=hero([],{goldenKeyCount:0,notesBundle:"native-notes-after-key"});
    const details={heapId:"stable-chest-001",heapType:"LOCKED_CHEST"};
    const accepted={...details,actionType:"OPEN_CHEST",targetPos:10};
    expect(isValidNativeChestHeapMutation([oldHeap],[newHeap],10,details,accepted,JSON.stringify(before),JSON.stringify(after))).toBe(true);
    expect(isValidNativeChestHeapMutation([oldHeap],[{...newHeap,items:[]}],10,details,accepted,JSON.stringify(before),JSON.stringify(after))).toBe(false);
    expect(isValidNativeChestHeapMutation([oldHeap],[{...newHeap,heapId:"stable-forged-chest"}],10,details,accepted,JSON.stringify(before),JSON.stringify(after))).toBe(false);
    const unspent=hero([],{goldenKeyCount:1});
    expect(isValidNativeChestHeapMutation([oldHeap],[newHeap],10,details,accepted,JSON.stringify(before),JSON.stringify(unspent))).toBe(false);
  });
});


describe("Native inventory economic value index", () => {
  const cls = "com.shatteredpixel.shatteredpixeldungeon.items.ScrollOfIdentify";
  const row = (id:string,quantity:number,bundle?:string,equipped=false) => ({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:true,stackable:true,equipped,
    serializedBundle:bundle || ("native-item:"+id+":q="+quantity)
  });
  const economy = (id:string,quantity:number,value:number,unit:number,sellable=true) => ({
    itemId:id,className:cls,quantity,nativeValue:value,nativeUnitValue:unit,nativeSellable:sellable
  });
  const hero = (items:any[],rows:any[]) => JSON.stringify({
    hp:10,ht:10,pos:9,shielding:0,gold:0,inventoryBundle:"native-inventory",
    inventoryItemsJson:JSON.stringify(items),nativeItemEconomyJson:JSON.stringify(rows),quickslotsJson:"[]"
  });
  const heapItem = (id:string,quantity:number,value:number,unit:number) => ({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:true,stackable:true,
    nativeValue:value,nativeUnitValue:unit,serializedBundle:"native-item:"+id+":q="+quantity
  });
  const heap = (items:any[]) => [{heapId:"stable-floor-heap-001",pos:9,type:"HEAP",
    seen:false,haunted:false,hidden:false,autoExplored:false,items}];

  it("rejects re-pricing an unchanged inventory item during an unrelated movement",()=>{
    const id="stable-value-item-001", source=row(id,1);
    const before=hero([source],[economy(id,1,30,30)]);
    const forged=hero([source],[economy(id,1,900,900)]);
    expect(isValidNativeItemEconomyIndexMutation(before,forged,"MOVE",{},[],[])).toBe(false);
    expect(isValidNativeItemEconomyIndexMutation(before,before,"MOVE",{},[],[])).toBe(true);
  });

  it("conserves the native item value when a stack is partially or fully dropped",()=>{
    const id="stable-value-stack-001", remainder=row(id,2,"native-item:"+id+":q=2");
    const before=hero([row(id,3)],[economy(id,3,90,30)]);
    const after=hero([remainder],[economy(id,2,60,30)]);
    const d={itemId:id,resultItemId:"stable-value-floor-001"};
    expect(isValidNativeItemEconomyIndexMutation(before,after,"DROP",d,[],heap([
      heapItem("stable-value-floor-001",1,30,30)
    ]))).toBe(true);
    expect(isValidNativeItemEconomyIndexMutation(before,after,"DROP",d,[],heap([
      heapItem("stable-value-floor-001",1,31,31)
    ]))).toBe(false);

    const fullBefore=hero([row("stable-value-full-001",1)],[economy("stable-value-full-001",1,30,30)]);
    const fullDetails={itemId:"stable-value-full-001",resultItemId:"stable-value-full-001"};
    expect(isValidNativeItemEconomyIndexMutation(fullBefore,hero([],[]),"DROP",fullDetails,[],
      heap([heapItem("stable-value-full-001",1,30,30)]))).toBe(true);
  });

  it("only imports a newly picked-up item at the exact previously authoritative floor value",()=>{
    const id="stable-value-pickup-001", floor=heap([heapItem(id,1,30,30)]);
    const before=hero([],[]);
    const after=hero([row(id,1)],[economy(id,1,30,30)]);
    expect(isValidNativeItemEconomyIndexMutation(before,after,"PICKUP",{itemId:id},floor,[])).toBe(true);
    expect(isValidNativeItemEconomyIndexMutation(before,hero([row(id,1)],[economy(id,1,300,300)]),
      "PICKUP",{itemId:id},floor,[])).toBe(false);
  });

  it("allows a native equipment sellability change but not an economic value change",()=>{
    const id="stable-value-weapon-001";
    const before=hero([row(id,1,undefined,false)],[economy(id,1,40,40,true)]);
    const after=hero([row(id,1,undefined,true)],[economy(id,1,40,40,false)]);
    expect(isValidNativeItemEconomyIndexMutation(before,after,"EQUIP",{itemId:id},[],[])).toBe(true);
    const repriced=hero([row(id,1,undefined,true)],[economy(id,1,80,80,false)]);
    expect(isValidNativeItemEconomyIndexMutation(before,repriced,"EQUIP",{itemId:id},[],[])).toBe(false);
  });

  it("binds a newly crafted inventory result to the native value captured from the engine",()=>{
    const sourceId="stable-alchemy-ingredient-001", resultId="stable-alchemy-output-001";
    const beforeItem=row(sourceId,1);
    const afterItem=row(resultId,1,"native-item:"+resultId+":q=1");
    const before=hero([beforeItem],[economy(sourceId,1,20,20)]);
    const after=hero([afterItem],[economy(resultId,1,40,40)]);
    const details={resultLocation:"INVENTORY",resultItemId:resultId,resultItemClass:cls,resultQuantity:1,
      resultStackable:true,resultNativeValue:40,resultNativeUnitValue:40};
    expect(isValidNativeItemEconomyIndexMutation(before,after,"ALCHEMY",details,[],[])).toBe(true);
    expect(isValidNativeItemEconomyIndexMutation(before,hero([afterItem],[economy(resultId,1,400,400)]),
      "ALCHEMY",details,[],[])).toBe(false);
  });

  it("checks a crafted stack merged into an existing item against the full resulting native value",()=>{
    const ingredientId="stable-alchemy-ingredient-002", resultId="stable-alchemy-stack-001";
    const beforeIngredient=row(ingredientId,1);
    const beforeOutput=row(resultId,2,"native-item:"+resultId+":q=2");
    const afterOutput=row(resultId,3,"native-item:"+resultId+":q=3");
    const before=hero([beforeIngredient,beforeOutput],[economy(ingredientId,1,20,20),economy(resultId,2,60,30)]);
    const after=hero([afterOutput],[economy(resultId,3,90,30)]);
    const details={resultLocation:"INVENTORY",resultItemId:resultId,resultItemClass:cls,resultQuantity:1,
      resultStackable:true,resultNativeValue:90,resultNativeUnitValue:30};
    expect(isValidNativeItemEconomyIndexMutation(before,after,"ALCHEMY",details,[],[])).toBe(true);
    expect(isValidNativeItemEconomyIndexMutation(before,hero([afterOutput],[economy(resultId,3,91,30)]),
      "ALCHEMY",details,[],[])).toBe(false);
  });
});

describe("Native mine and non-effect action buff integrity", () => {
  const hunger="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger";
  const haste="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste";
  const hero=(buffs:any[],extra:Record<string,any>={})=>{
    const rows=buffs.map((buff:any)=>JSON.stringify({buff}));
    return JSON.stringify({
      hp:10,ht:10,pos:9,shielding:0,gold:0,alchemyEnergy:0,
      combatBundle:JSON.stringify({STR:10,items:[],buffs}),
      buffCount:rows.length,...Object.fromEntries(rows.flatMap((row,i)=>[["buff_"+i,row],["buffCooldown_"+i,0]])),
      ...extra
    });
  };
  const mine=(sourceTerrain:number)=>({sourceTerrain});
  it("rejects injected or removed buffs on actions that must not change buffs",()=>{
    const before=hero([{__className:haste,left:4}]);
    expect(isValidNativeUnchangedBuffState(before,before)).toBe(true);
    expect(isValidNativeUnchangedBuffState(before,hero([{__className:haste,left:4},{__className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility",left:5}]))).toBe(false);
    expect(isValidNativeUnchangedBuffState(before,hero([]))).toBe(false);
  });
  it("accepts only the native +3 Hunger level change when mining normal stone",()=>{
    const before=hero([{__className:hunger,level:100,partialDamage:0.25}]);
    const after=hero([{__className:hunger,level:103,partialDamage:0.25}]);
    expect(isValidNativeMineBuffMutation(before,after,mine(4))).toBe(true);
    expect(isValidNativeMineBuffMutation(before,hero([{__className:hunger,level:103,partialDamage:0.25},
      {__className:haste,left:9}]),mine(4))).toBe(false);
    expect(isValidNativeMineBuffMutation(before,hero([{__className:hunger,level:104,partialDamage:0.25}]),mine(4))).toBe(false);
    expect(isValidNativeMineBuffMutation(before,hero([{__className:hunger,level:100,partialDamage:0.25}]),mine(12))).toBe(true);
  });
  it("accounts for native WellFed energy before allowing a mine mutation",()=>{
    const wellFed="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.WellFed";
    const before=hero([{__className:hunger,level:100,partialDamage:0.25},{__className:wellFed,left:50}]);
    const after=hero([{__className:hunger,level:100,partialDamage:0.25},{__className:wellFed,left:47}]);
    expect(isValidNativeMineBuffMutation(before,after,mine(4))).toBe(true);
  });
});

describe("Generic native NPC interaction inventory boundary", () => {
  const itemClass="com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfIdentify";
  const row=(id:string,quantity=2)=>({itemId:id,className:itemClass,quantity,level:0,cursed:false,cursedKnown:false,
    stackable:true,equipped:false,serializedBundle:"native-scroll:"+id+":q="+quantity});
  const economy=(item:any)=>({itemId:item.itemId,className:item.className,quantity:item.quantity,
    nativeValue:item.quantity*10,nativeUnitValue:10,nativeSellable:true});
  const hero=(items:any[],extra:Record<string,any>={})=>({
    inventoryBundle:"inventory-snapshot",inventoryItemsJson:JSON.stringify(items),
    nativeItemEconomyJson:JSON.stringify(items.map(economy)),quickslotsJson:"[]",
    combatBundle:JSON.stringify({STR:10,items:"inventory-snapshot",buffs:[]}),
    buffCount:0,gold:50,alchemyEnergy:0,hp:10,ht:10,shielding:0,
    ironKeyCount:0,crystalKeyCount:0,wornKeyCount:0,goldenKeyCount:0,...extra
  });
  it("allows unrelated native NPC/quest interactions only when inventory and economy stay unchanged",()=>{
    const before=hero([row("native-interact-scroll-001")]);
    expect(isValidNativeInteractInventoryMutation(JSON.stringify(before),JSON.stringify({...before,
      notesBundle:"updated-notes",questStateBundle:"updated-quest"}))).toBe(true);
  });
  it("rejects inventory removal, quantity loss, quickslot changes and currency injection",()=>{
    const item=row("native-interact-scroll-001");
    const before=hero([item]);
    expect(isValidNativeInteractInventoryMutation(JSON.stringify(before),JSON.stringify(hero([])))).toBe(false);
    expect(isValidNativeInteractInventoryMutation(JSON.stringify(before),JSON.stringify(hero([row(item.itemId,1)])))).toBe(false);
    expect(isValidNativeInteractInventoryMutation(JSON.stringify(before),JSON.stringify(hero([item],{gold:5000})))).toBe(false);
    expect(isValidNativeInteractInventoryMutation(JSON.stringify(before),JSON.stringify(hero([item],{
      quickslotsJson:JSON.stringify([{slot:0,itemId:"forged-native-item-001",className:itemClass,quantity:1,
        serializedBundle:"forged-native-item-001"}])
    })))).toBe(false);
  });
  it("rejects forged combat-bundle changes that would add stats or buffs",()=>{
    const before=hero([row("native-interact-scroll-001")]);
    const forged=hero([row("native-interact-scroll-001")],{
      combatBundle:JSON.stringify({STR:99,items:"inventory-snapshot",buffs:[]})
    });
    expect(isValidNativeInteractInventoryMutation(JSON.stringify(before),JSON.stringify(forged))).toBe(false);
  });
});

describe("Native mining inventory and floor economy reconciliation", () => {
  const darkGoldClass = "com.shatteredpixel.shatteredpixeldungeon.items.quest.DarkGold";
  const ordinaryClass = "com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfIdentify";
  const item = (id:string, quantity=1, cls=darkGoldClass) => ({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,stackable:true,equipped:false,
    serializedBundle:"native-dark-gold:"+id+":q="+quantity
  });
  const economy = (row:any) => ({
    itemId:row.itemId,className:row.className,quantity:row.quantity,
    nativeValue:0,nativeUnitValue:0,nativeSellable:false
  });
  const hero = (items:any[], slots:any[]=[], extra:Record<string,any>={}) => JSON.stringify({
    hp:10,ht:10,pos:9,shielding:0,gold:0,alchemyEnergy:0,inventoryBundle:"inventory-before",
    inventoryItemsJson:JSON.stringify(items),nativeItemEconomyJson:JSON.stringify(items.map(economy)),
    quickslotsJson:JSON.stringify(slots),notesBundle:"notes",questStateBundle:"quests",
    ironKeyCount:0,crystalKeyCount:0,wornKeyCount:0,goldenKeyCount:0,...extra
  });
  const details = (sourceTerrain=12) => ({sourceTerrain});
  const accepted = (sourceTerrain=12) => ({actionType:"MINE",sourceTerrain,targetTerrain:sourceTerrain});
  const heap = (heapId:string,pos:number,items:any[]) => ({
    heapId,pos,type:"HEAP",seen:false,haunted:false,hidden:false,autoExplored:false,items
  });
  const floorGold = (id="stable-floor-darkgold-001", quantity=1) => ({
    ...item(id,quantity),nativeValue:0,nativeUnitValue:0,shopPrice:-1
  });

  it("accepts one native DarkGold result from a gold wall and rejects forged additions",()=>{
    const before=hero([]);
    const gold=item("stable-mined-darkgold-001");
    const after=hero([gold],[],{inventoryBundle:"inventory-after"});
    expect(isValidNativeMineInventoryMutation(before,after,details(12),accepted(12))).toBe(true);
    const forged=item("stable-mined-darkgold-002");
    expect(isValidNativeMineInventoryMutation(before,hero([gold,forged],[],{inventoryBundle:"inventory-after"}),
      details(12),accepted(12))).toBe(false);
    expect(isValidNativeMineInventoryMutation(before,after,details(4),accepted(12))).toBe(false);
    const wrongClass=item("stable-mined-forged-001",1,ordinaryClass);
    expect(isValidNativeMineInventoryMutation(before,hero([wrongClass],[],{inventoryBundle:"inventory-after"}),
      details(12),accepted(12))).toBe(false);
  });

  it("permits one-unit DarkGold stack merges but rejects quantity jumps and unrelated changes",()=>{
    const existing=item("stable-darkgold-stack-001",3);
    const merged=item(existing.itemId,4);
    const before=hero([existing]);
    const after=hero([merged],[],{inventoryBundle:"inventory-after"});
    expect(isValidNativeMineInventoryMutation(before,after,details(12),accepted(12))).toBe(true);
    expect(isValidNativeMineInventoryMutation(before,hero([item(existing.itemId,5)],[],{inventoryBundle:"inventory-after"}),
      details(12),accepted(12))).toBe(false);
    const unrelated=item("stable-scroll-sideeffect-001",1,ordinaryClass);
    expect(isValidNativeMineInventoryMutation(before,hero([merged,unrelated],[],{inventoryBundle:"inventory-after"}),
      details(12),accepted(12))).toBe(false);
  });

  it("keeps non-gold mining inventory fixed and replaces only a matching zero-quantity quickslot placeholder",()=>{
    const before=hero([]);
    expect(isValidNativeMineInventoryMutation(before,before,details(4),accepted(4))).toBe(true);
    expect(isValidNativeMineInventoryMutation(before,hero([item("stable-unexpected-gold-001")],[],{
      inventoryBundle:"inventory-after"}),details(4),accepted(4))).toBe(false);
    const placeholder={slot:0,itemId:"stable-darkgold-placeholder-001",className:darkGoldClass,
      quantity:0,serializedBundle:"placeholder-bundle:stable-darkgold-placeholder-001"};
    const result=item("stable-darkgold-quickslot-001");
    const replaced={slot:0,itemId:result.itemId,className:darkGoldClass,quantity:1,serializedBundle:result.serializedBundle};
    expect(isValidNativeMineInventoryMutation(hero([],[placeholder]),
      hero([result],[replaced],{inventoryBundle:"inventory-after"}),details(12),accepted(12))).toBe(true);
  });

  it("allows only one DarkGold floor unit when the native backpack refuses collection",()=>{
    const before:any[]=[];
    const gold=floorGold();
    const next=[heap("stable-mine-heap-001",9,[gold])];
    expect(isValidNativeMineHeapMutation(before,next,9,10,details(12),accepted(12))).toBe(true);
    expect(isValidNativeMineHeapMutation(before,[],9,10,details(12),accepted(12))).toBe(true);
    expect(isValidNativeMineHeapMutation(before,[heap("stable-mine-heap-001",9,[gold,
      floorGold("stable-forged-floor-item-001")])],9,10,details(12),accepted(12))).toBe(false);
    expect(isValidNativeMineHeapMutation(before,next,9,10,details(4),accepted(4))).toBe(false);
  });
});

describe("Native mutation lock admission", () => {
  const lock = (overrides:Record<string,any>={}) => ({
    playerId:"player-001",requestId:"req-sell-001",actionType:"SELL",depth:4,createdAt:10000,...overrides
  });
  it("blocks competing writes and permits only the exact request retry",()=>{
    const pending=JSON.stringify(lock());
    expect(classifyNativeMutationLock(pending,"player-001","req-sell-001","SELL",11000)).toBe("OWNED");
    expect(classifyNativeMutationLock(pending,"player-001","req-sell-002","SELL",11000)).toBe("PENDING");
    expect(classifyNativeMutationLock(pending,"player-001","req-sell-002","MOVE",11000)).toBe("PENDING");
    expect(classifyNativeMutationLock(pending,"player-001","req-sync-001","SYNC_HERO_STATE",11000)).toBe("PENDING");
    expect(isNativeMutationLockForRequest(pending,"player-001","req-sell-001","SELL")).toBe(true);
    expect(isNativeMutationLockForRequest(pending,"player-001","req-sell-002","SELL")).toBe(false);
    expect(requiresNativeMutationSnapshot("BUY")).toBe(true);
    expect(requiresNativeMutationSnapshot("USE_ITEM")).toBe(true);
    expect(requiresNativeMutationSnapshot("MOVE")).toBe(false);
    expect(requiresNativeMutationSnapshot("INTERACT")).toBe(false);
  });
  it("converts expired or malformed locks into a resync-required state",()=>{
    expect(classifyNativeMutationLock(JSON.stringify(lock()),"player-001","req-sell-002","SELL",50000)).toBe("STALE");
    expect(classifyNativeMutationLock("{bad-json","player-001","req-sell-002","SELL",11000)).toBe("STALE");
  });
});

describe("Unsupported native item actions remain fail-closed", () => {
  const potionClass="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
  const scrollClass="com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfIdentify";
  const wandClass="com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfMagicMissile";
  const row=(id:string,cls:string)=>({itemId:id,className:cls,quantity:1,level:0,cursed:false,cursedKnown:false,
    stackable:false,equipped:false,serializedBundle:"native-item-bundle:"+id});
  const hero=(item:any)=>JSON.stringify({hp:10,ht:10,pos:9,shielding:0,gold:0,inventoryBundle:"inventory",
    combatBundle:JSON.stringify({STR:10,inventory:"inventory",items:"inventory",buffs:[],
      talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
    potionStatusBundle:JSON.stringify({PotionOfHealing_label:"CRIMSON",PotionOfHealing_known:true}),
    scrollStatusBundle:JSON.stringify({ScrollOfIdentify_label:"SOWILO",ScrollOfIdentify_known:false}),
    inventoryItemsJson:JSON.stringify([item]),quickslotsJson:"[]"});
  const intent=(id:string,cls:string,itemAction:string)=>({from:9,to:9,targetPos:9,depth:4,branch:0,
    engineActionCost:1,itemId:id,itemClass:cls,itemAction,expectedQuantity:1,sourceQuantityBefore:1,stackable:false});
  const level={depth:4,branch:0,locked:false,heaps:[]};
  const player={pos:9,state:"ALIVE"};
  it("rejects eating when a native food talent would mutate state outside the bounded food transaction",()=>{
    const food="com.shatteredpixel.shatteredpixeldungeon.items.food.SmallRation";
    const level={depth:4,branch:0,locked:false,heaps:[]};
    const row=(id:string)=>({itemId:id,className:food,quantity:1,level:0,cursed:false,cursedKnown:false,
      stackable:true,equipped:false,serializedBundle:"native-item:"+id});
    const before=(id:string,talents:Record<string,any>={})=>JSON.stringify({
      pos:9,hp:10,ht:10,gold:0,inventoryBundle:"inventory-before",
      inventoryItemsJson:JSON.stringify([row(id)]),quickslotsJson:"[]",
      nativeItemEconomyJson:JSON.stringify([{itemId:id,className:food,quantity:1,nativeValue:10,
        nativeUnitValue:10,nativeSellable:true}]),
      potionStatusBundle:JSON.stringify({PotionOfHealing_label:"CRIMSON",PotionOfHealing_known:true}),
      scrollStatusBundle:JSON.stringify({ScrollOfIdentify_label:"SOWILO",ScrollOfIdentify_known:false}),
      combatBundle:JSON.stringify({time:10,inventory:"inventory-before",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{},...talents})
    });
    const intent=(id:string)=>({from:9,to:9,targetPos:9,depth:4,branch:0,engineActionCost:3,
      itemId:id,itemClass:food,itemAction:"EAT",expectedQuantity:1,sourceQuantityBefore:1,stackable:true});
    expect(isValidNativeUseItemIntent(level,intent("stable-food-safe-001"),4,"player-001",
      {pos:9,state:"ALIVE"},before("stable-food-safe-001"))).toBe(true);
    expect(isValidNativeUseItemIntent(level,intent("stable-food-hearty-001"),4,"player-001",
      {pos:9,state:"ALIVE"},before("stable-food-hearty-001",{talents_tier_1:{HEARTY_MEAL:1}}))).toBe(false);
    expect(isValidNativeUseItemIntent(level,intent("stable-food-recharge-001"),4,"player-001",
      {pos:9,state:"ALIVE"},before("stable-food-recharge-001",{talents_tier_3:{ENERGIZING_MEAL:1}}))).toBe(false);
    expect(isValidNativeUseItemIntent(level,intent("stable-food-metamorph-001"),4,"player-001",
      {pos:9,state:"ALIVE"},before("stable-food-metamorph-001",{replacements:{HEARTY_MEAL:"HEROIC_ENERGY"}}))).toBe(false);
  });

  it("rejects READ and ZAP until their native effects have a validated shared result",()=>{
    const scroll=row("stable-unsupported-scroll-001",scrollClass);
    const wand=row("stable-unsupported-wand-001",wandClass);
    expect(isValidNativeUseItemIntent(level,intent(scroll.itemId,scrollClass,"READ"),4,
      "player-001",player,hero(scroll))).toBe(false);
    expect(isValidNativeUseItemIntent(level,intent(wand.itemId,wandClass,"ZAP"),4,
      "player-001",player,hero(wand))).toBe(false);
    const potion=row("stable-supported-potion-001",potionClass);
    expect(isValidNativeUseItemIntent(level,intent(potion.itemId,potionClass,"DRINK"),4,
      "player-001",player,hero(potion))).toBe(true);
  });
});

describe("Native shop SELL transactions", () => {
  const cls = "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
  const item = (id:string, quantity:number, nativeValue:number, unitValue:number, bundle?:string) => ({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:true,stackable:true,equipped:false,
    serializedBundle:bundle || ("native-item:"+id+":quantity="+quantity)
  });
  const economy = (id:string,quantity:number,nativeValue:number,unitValue:number) => ({
    itemId:id,className:cls,quantity,nativeValue,nativeUnitValue:unitValue,nativeSellable:true
  });
  const hero = (items:any[], money:number, slots:any[], extra:Record<string,any>={}) => ({
    hp:10,ht:10,pos:9,shielding:0,gold:money,alchemyEnergy:0,cooldown:0,
    inventoryBundle:"native-inventory-before",
    combatBundle:"native-combat-before",
    inventoryItemsJson:JSON.stringify(items),
    nativeItemEconomyJson:JSON.stringify(items.map((row:any)=>economy(row.itemId,row.quantity,
      row.quantity===3?90:row.quantity===2?60:row.quantity*30,row.quantity===3||row.quantity===2||row.quantity===1?30:-1))),
    quickslotsJson:JSON.stringify(slots),
    notesBundle:"native-notes",questStateBundle:"native-quests",
    ironKeyCount:0,crystalKeyCount:0,wornKeyCount:0,goldenKeyCount:0,
    ...extra
  });
  const source = (id="stable-sale-source-001", quantity=1, bundle?:string) =>
    item(id,quantity,quantity*30,30,bundle);
  const slot = (row:any) => ({slot:0,itemId:row.itemId,className:row.className,
    quantity:row.quantity,serializedBundle:row.serializedBundle});
  const shop = (buyback:any[]=[], bundle="native-shopkeeper-before") => ({
    entityId:"stable-shopkeeper-001",mobId:15,name:"Shopkeeper",pos:10,hp:20,ht:20,shielding:0,state:"Wandering",
    serializedBundle:bundle,defenseSkill:0,baseSpeed:1,effectiveSpeed:1,cooldown:0,targetCell:-1,
    targetType:"NONE",targetEntityId:"",enemySeen:false,alerted:false,buffs:[],
    shopkeeperTurnsSinceHarmed:-1,buybackItems:buyback
  });
  const baseLevel = (heaps:any[]=[], mobs:any[]=[shop()]) =>
    ({depth:4,branch:0,locked:false,width:8,height:8,heaps,mobs});
  const details = (overrides:Record<string,any>={}) => ({
    from:9,to:9,targetPos:9,depth:4,branch:0,engineActionCost:0,
    shopEntityId:"stable-shopkeeper-001",sourceItemId:"stable-sale-source-001",
    resultItemId:"stable-sale-source-001",itemClass:cls,sourceQuantityBefore:1,soldQuantity:1,
    sourceNativeValue:30,sourceNativeUnitValue:30,sourceItemLevel:0,sourceCursed:false,sourceCursedKnown:true,
    price:30,stackable:true,resultItemLevel:0,resultCursed:false,resultCursedKnown:true,resultNativeValue:30,
    resultNativeUnitValue:30,resultItemBundle:"native-item:stable-sale-source-001:quantity=1",...overrides
  });
  const soldRow = (id:string,quantity:number,value:number,unit:number,bundle:string) => ({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:true,stackable:true,shopPrice:-1,
    nativeValue:value,nativeUnitValue:unit,serializedBundle:bundle
  });
  const accepted = (d:any) => ({...d,playerId:"player-001",actionType:"SELL"});

  it("accepts a complete one-item sale only with exact native gold credit and a matching Shopkeeper buyback append",()=>{
    const priorItem=source(), before=hero([priorItem],30,[slot(priorItem)]);
    const after=hero([],60,[],{inventoryBundle:"native-inventory-after"});
    const d=details(), oldShop=shop(), newShop=shop([soldRow(d.resultItemId,1,30,30,d.resultItemBundle)],"native-shopkeeper-after");
    const level=baseLevel();
    expect(parseNativeItemEconomyIndex(before)).not.toBeNull();
    expect(isValidNativeSellIntent(level,d,4,"player-001",{pos:9,state:"ALIVE"},JSON.stringify(before))).toBe(true);
    expect(isValidNativeSellInventoryMutation(JSON.stringify(before),JSON.stringify(after),d,accepted(d))).toBe(true);
    expect(isValidNativeSellShopkeeperMutation([oldShop],[newShop],d,accepted(d))).toBe(true);
  });

  it("accepts exactly one unit from a linear stack and preserves the source remainder and quickslot",()=>{
    const priorItem=source("stable-sale-source-001",3);
    const remainder=item(priorItem.itemId,2,60,30,"native-item:"+priorItem.itemId+":quantity=2");
    const before=hero([priorItem],0,[slot(priorItem)]);
    const after=hero([remainder],30,[slot(remainder)],{inventoryBundle:"native-inventory-after"});
    const resultId="stable-sale-result-001", resultBundle="native-item:"+resultId+":quantity=1";
    const d=details({resultItemId:resultId,sourceQuantityBefore:3,soldQuantity:1,
      sourceNativeValue:90,sourceNativeUnitValue:30,price:30,
      resultNativeValue:30,resultNativeUnitValue:30,resultItemBundle:resultBundle});
    const buyback=[soldRow(resultId,1,30,30,resultBundle)];
    expect(isValidNativeSellIntent(baseLevel(),d,4,"player-001",{pos:9,state:"ALIVE"},JSON.stringify(before))).toBe(true);
    expect(isValidNativeSellInventoryMutation(JSON.stringify(before),JSON.stringify(after),d,accepted(d))).toBe(true);
    expect(isValidNativeSellShopkeeperMutation([shop()],[shop(buyback,"native-shopkeeper-after")],d,accepted(d))).toBe(true);
  });

  it("rejects forged prices, quantity loss, redirected sellers and inconsistent buyback state",()=>{
    const priorItem=source(), before=hero([priorItem],0,[slot(priorItem)]);
    const after=hero([],60,[],{inventoryBundle:"native-inventory-after"});
    const d=details(), level=baseLevel(), player={pos:9,state:"ALIVE"};
    expect(isValidNativeSellIntent(level,details({price:31}),4,"player-001",player,JSON.stringify(before))).toBe(false);
    expect(isValidNativeSellIntent({...level,mobs:[{...shop(),entityId:"stable-other-shop-001"}]},
      d,4,"player-001",player,JSON.stringify(before))).toBe(false);
    expect(isValidNativeSellInventoryMutation(JSON.stringify(before),JSON.stringify(hero([],61,[],{inventoryBundle:"native-inventory-after"})),
      d,accepted(d))).toBe(false);
    expect(isValidNativeSellInventoryMutation(JSON.stringify(before),JSON.stringify(hero([priorItem],60,[slot(priorItem)],
      {inventoryBundle:"native-inventory-after"})),d,accepted(d))).toBe(false);
    expect(isValidNativeSellShopkeeperMutation([shop()],[shop([soldRow(d.resultItemId,1,99,99,d.resultItemBundle)],"native-shopkeeper-after")],d,accepted(d))).toBe(false);
  });

  it("rejects non-linear partial stack values and any non-sellable source",()=>{
    const priorItem=source("stable-sale-source-001",3);
    const before=hero([priorItem],0,[slot(priorItem)]);
    const partial=details({sourceQuantityBefore:3,soldQuantity:1,sourceNativeValue:91,sourceNativeUnitValue:-1,price:30,
      resultItemId:"stable-sale-result-001",resultItemBundle:"native-item:stable-sale-result-001:quantity=1"});
    expect(isValidNativeSellIntent(baseLevel(),partial,4,"player-001",{pos:9,state:"ALIVE"},JSON.stringify(before))).toBe(false);
    const unsellable=hero([priorItem],0,[slot(priorItem)],{
      nativeItemEconomyJson:JSON.stringify([{...economy(priorItem.itemId,3,90,30),nativeSellable:false}])
    });
    expect(parseNativeItemEconomyIndex(unsellable)).not.toBeNull();
    expect(isValidNativeSellIntent(baseLevel(),details(),4,"player-001",{pos:9,state:"ALIVE"},JSON.stringify(unsellable))).toBe(false);
  });
});

describe("Native self-buff armor ability transactions", () => {
  const ability = "com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.warrior.Endure";
  const tracker = ability + "$EndureTracker";
  const armorClass = "com.shatteredpixel.shatteredpixeldungeon.items.armor.WarriorArmor";
  const armorBundle = (charge:number, itemId="native-class-armor-001") => JSON.stringify({item:{__className:armorClass,itemId,charge,armortier:4,
    level:0,cursed:false,cursedKnown:true}});
  const armor = (charge:number) => ({itemId:"native-class-armor-001",className:armorClass,quantity:1,level:0,
    cursed:false,cursedKnown:true,stackable:false,equipped:true,serializedBundle:armorBundle(charge)});
  const hero = (items:any[],extra:Record<string,any>={}) => ({
    hp:20,ht:20,pos:9,shielding:0,gold:0,cooldown:0,inventoryBundle:"hero-inventory-before",
    inventoryItemsJson:JSON.stringify(items),quickslotsJson:"[]",buffCount:0,
    combatBundle:JSON.stringify({class:"WARRIOR",armorAbility:{__className:ability},armor:JSON.parse(armorBundle(100)).item,
      talents_tier_4:{}}),...extra
  });
  const details = (extra:Record<string,any>={}) => ({
    from:9,to:9,targetPos:9,depth:4,branch:0,engineActionCost:3,
    abilityClass:ability,armorItemId:"native-class-armor-001",armorClass,
    armorChargeBefore:100,armorChargeAfter:50,armorChargeUse:50,...extra
  });
  const buffBundle = JSON.stringify({buff:{__className:tracker,enduring:true,damage_bonus:0,hits_left:0}});
  it("validates the real equipped armor, native ability class, hero class, and talent-derived charge cost",()=>{
    const before=JSON.stringify(hero([armor(100)]));
    const level={depth:4,branch:0,locked:false,heaps:[]};
    expect(isValidNativeAbilityIntent(level,details(),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
    expect(isValidNativeAbilityIntent(level,details({abilityClass:"com.example.ForgedAbility"}),4,
      "player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeAbilityIntent(level,details({armorChargeUse:1}),4,
      "player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeAbilityIntent(level,details({armorItemId:"native-forged-armor-001"}),4,
      "player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
  });
  it("accepts only the exact armor-charge decrease and expected native tracker",()=>{
    const before=hero([armor(100)]);
    const after=hero([armor(50)],{cooldown:3,inventoryBundle:"hero-inventory-after",
      combatBundle:JSON.stringify({class:"WARRIOR",armorAbility:{__className:ability},armor:JSON.parse(armorBundle(50)).item,
        talents_tier_4:{}}),buffCount:1,buff_0:buffBundle,buffCooldown_0:12});
    const accepted={...details(),actionType:"USE_ABILITY"};
    const nativeDetails={abilityClass:ability,armorItemId:"native-class-armor-001",armorClass,
      armorChargeBefore:100,armorChargeAfter:50,armorChargeUse:50};
    expect(isValidNativeAbilityMutation(JSON.stringify(before),JSON.stringify(after),nativeDetails,accepted)).toBe(true);
    const forgedCharge=hero([armor(49)],{cooldown:3,inventoryBundle:"hero-inventory-after",
      combatBundle:JSON.stringify({class:"WARRIOR",armorAbility:{__className:ability},armor:JSON.parse(armorBundle(49)).item,
        talents_tier_4:{}}),buffCount:1,buff_0:buffBundle,buffCooldown_0:12});
    expect(isValidNativeAbilityMutation(JSON.stringify(before),JSON.stringify(forgedCharge),nativeDetails,accepted)).toBe(false);
    const forgedBuff=hero([armor(50)],{cooldown:3,inventoryBundle:"hero-inventory-after",
      combatBundle:JSON.stringify({class:"WARRIOR",armorAbility:{__className:ability},armor:JSON.parse(armorBundle(50)).item,
        talents_tier_4:{}}),buffCount:1,
      buff_0:JSON.stringify({buff:{__className:tracker,enduring:true,damage_bonus:999,hits_left:9}}),buffCooldown_0:12});
    expect(isValidNativeAbilityMutation(JSON.stringify(before),JSON.stringify(forgedBuff),nativeDetails,accepted)).toBe(false);
    const forgedInventory=hero([armor(50),{itemId:"native-forged-001",className:"com.example.Forged",quantity:1,
      level:0,cursed:false,cursedKnown:false,stackable:false,equipped:false,serializedBundle:"bundle-native-forged-001"}],
      {cooldown:3,inventoryBundle:"hero-inventory-after",
      combatBundle:JSON.stringify({class:"WARRIOR",armorAbility:{__className:ability},armor:JSON.parse(armorBundle(50)).item,
        talents_tier_4:{}}),buffCount:1,buff_0:buffBundle,buffCooldown_0:12});
    expect(isValidNativeAbilityMutation(JSON.stringify(before),JSON.stringify(forgedInventory),nativeDetails,accepted)).toBe(false);
  });
  it("accepts Nature's Power only for the real Huntress ability and matching tracker",()=>{
    const nature="com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.huntress.NaturesPower";
    const natureArmor="com.shatteredpixel.shatteredpixeldungeon.items.armor.HuntressArmor";
    const armorBundleFor=(charge:number,itemId="native-huntress-armor-001")=>JSON.stringify({item:{__className:natureArmor,itemId,charge,armortier:4}});
    const source={...armor(65),className:natureArmor,itemId:"native-huntress-armor-001",serializedBundle:armorBundleFor(65)};
    const before=hero([source],{combatBundle:JSON.stringify({class:"HUNTRESS",
      armorAbility:{__className:nature},armor:JSON.parse(armorBundleFor(65)).item,talents_tier_4:{}})});
    const data={...details({abilityClass:nature,armorItemId:"native-huntress-armor-001",armorClass:natureArmor,
      armorChargeBefore:65,armorChargeAfter:30,armorChargeUse:35,engineActionCost:1})};
    const level={depth:4,branch:0,locked:false,heaps:[]};
    expect(isValidNativeAbilityIntent(level,data,4,"player-001",{pos:9,state:"ALIVE"},JSON.stringify(before))).toBe(true);
    const output={...source,serializedBundle:armorBundleFor(30)};
    const next=hero([output],{cooldown:1,inventoryBundle:"hero-inventory-after",
      combatBundle:JSON.stringify({class:"HUNTRESS",armorAbility:{__className:nature},
        armor:JSON.parse(armorBundleFor(30)).item,talents_tier_4:{}}),buffCount:1,
      buff_0:JSON.stringify({buff:{__className:nature+"$naturesPowerTracker"}}),buffCooldown_0:8});
    const accepted={...data,actionType:"USE_ABILITY"};
    const nativeDetails={abilityClass:nature,armorItemId:"native-huntress-armor-001",armorClass:natureArmor,
      armorChargeBefore:65,armorChargeAfter:30,armorChargeUse:35};
    expect(isValidNativeAbilityMutation(JSON.stringify(before),JSON.stringify(next),nativeDetails,accepted)).toBe(true);
  });
});


describe("Native Hero Buff tick reconciliation", () => {
  const buffs="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.";
  const hero=(extra:Record<string,any>={})=>({
    hp:10,ht:20,pos:9,shielding:0,gold:0,alchemyEnergy:5,
    inventoryBundle:"native-inventory",inventoryItemsJson:"[]",quickslotsJson:"[]",
    notesBundle:"notes",questStateBundle:"quests",ankhCount:0,blessedAnkhCount:0,
    cooldown:2,combatBundle:JSON.stringify({time:10,STR:10,items:"native-inventory",buffs:[]}),
    buffCount:1,
    buff_0:JSON.stringify({buff:{__className:buffs+"Hunger",id:12,time:9,level:200,partialDamage:0}}),
    buffCooldown_0:1,
    ...extra
  });
  const stateWithBuff=(buffClass:string,id:number,time:number,data:Record<string,any>,extra:Record<string,any>={})=>({
    hp:10,ht:20,pos:9,shielding:0,gold:0,alchemyEnergy:5,
    inventoryBundle:"native-inventory",inventoryItemsJson:"[]",quickslotsJson:"[]",
    notesBundle:"notes",questStateBundle:"quests",ankhCount:0,blessedAnkhCount:0,
    cooldown:1,combatBundle:JSON.stringify({time:10,STR:10,items:"native-inventory",buffs:[]}),
    buffCount:1,
    buff_0:JSON.stringify({buff:{__className:buffClass,id,time,...data}}),
    buffCooldown_0:Math.max(0,time-9),
    ...extra
  });
  const tick=(buffClass:string,buffId:number,actorClockBefore=9)=>({sourceType:"BUFF_TICK",buffClass,buffId,actorClockBefore});
  it("resolves LifeLink.object only to one stable Mob identity in the trusted level snapshot",()=>{
    const poison=buffs+"Poison", lifeLink=buffs+"LifeLink";
    const linkRow=JSON.stringify({buff:{__className:lifeLink,id:45,time:10,object:7}});
    const linkedHero=stateWithBuff(poison,44,9,{left:9},{
      cooldown:1,buffCooldown_0:0,buffCount:2,buff_1:linkRow,buffCooldown_1:1
    });
    const level={mobs:[{mobId:7,entityId:"linked-native-mob-0001"}]};
    expect(nativeHeroBuffLifeLinkMobEntityIds(JSON.stringify(linkedHero),level))
      .toEqual(["linked-native-mob-0001"]);
    expect(nativeHeroBuffLifeLinkMobEntityIds(JSON.stringify(stateWithBuff(poison,44,9,{left:9})),level))
      .toEqual([]);
    expect(nativeHeroBuffLifeLinkMobEntityIds(JSON.stringify(linkedHero),{
      mobs:[...level.mobs,{mobId:7,entityId:"second-linked-mob-0002"}]
    })).toBeNull();
    expect(nativeHeroBuffLifeLinkMobEntityIds(JSON.stringify(linkedHero),{
      mobs:[{mobId:7,entityId:""}]
    })).toBeNull();
    const missingActor={...linkedHero,buff_1:JSON.stringify({buff:{
      __className:lifeLink,id:45,time:10,object:88
    }})};
    expect(nativeHeroBuffLifeLinkMobEntityIds(JSON.stringify(missingActor),level)).toBeNull();
  });

  it("does not apply the LifeLink Mob-target gate to unrelated timed Hero Buff expiry",()=>{
    const haste=buffs+"Haste", lifeLink=buffs+"LifeLink";
    const linkRow=JSON.stringify({buff:{__className:lifeLink,id:45,time:20,object:7}});
    const previous=stateWithBuff(haste,101,9,{},{
      cooldown:2,buffCooldown_0:1,buffCount:2,buff_1:linkRow,buffCooldown_1:12
    });
    const before=stateWithBuff(haste,101,9,{},{
      cooldown:1,buffCooldown_0:0,buffCount:2,buff_1:linkRow,buffCooldown_1:11
    });
    const after:any={...before,buffCount:1,buff_0:linkRow,buffCooldown_0:11};
    delete after.buff_1;
    delete after.buffCooldown_1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(haste,101),{branch:0,locked:false},undefined)).toBe(true);
  });

  it("accepts Poison damage through a mapped LifeLink only when the caller supplies the resolved Mob set",()=>{
    const poison=buffs+"Poison", lifeLink=buffs+"LifeLink";
    const linkRow=JSON.stringify({buff:{__className:lifeLink,id:45,time:9,object:7}});
    const previous=stateWithBuff(poison,44,9,{left:9},{
      cooldown:2,buffCooldown_0:1,buffCount:2,buff_1:linkRow,buffCooldown_1:1,hp:10
    });
    const before=stateWithBuff(poison,44,9,{left:9},{
      cooldown:1,buffCooldown_0:0,buffCount:2,buff_1:linkRow,buffCooldown_1:0,hp:10
    });
    const after=stateWithBuff(poison,44,10,{left:8},{
      cooldown:1,buffCooldown_0:1,buffCount:2,buff_1:linkRow,buffCooldown_1:0,hp:8
    });
    const level={branch:0,locked:false,mobs:[{mobId:7,entityId:"linked-native-mob-0001"}]};
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44),level,undefined)).toBe(false);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44),level,["linked-native-mob-0001"])).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44),level,["other-native-mob-0002"])).toBe(false);
  });

  it("allows native LifeLink detach only when that exact linked Mob death is already accepted",()=>{
    const poison=buffs+"Poison", lifeLink=buffs+"LifeLink";
    const linkRow=JSON.stringify({buff:{__className:lifeLink,id:45,time:9,object:7}});
    const rewardCombatBundle=JSON.stringify({
      id:21,time:10,lvl:1,exp:0,STR:10,items:"native-inventory",buffs:[],
      class:"WARRIOR",subClass:"NONE",talents_tier_1:{},talents_tier_2:{},
      talents_tier_3:{},talents_tier_4:{}
    });
    const previous=stateWithBuff(poison,44,9,{left:9},{
      cooldown:2,buffCooldown_0:1,buffCount:2,buff_1:linkRow,buffCooldown_1:1,hp:10,
      combatBundle:rewardCombatBundle
    });
    const before=stateWithBuff(poison,44,9,{left:9},{
      cooldown:1,buffCooldown_0:0,buffCount:2,buff_1:linkRow,buffCooldown_1:0,hp:10,
      combatBundle:rewardCombatBundle
    });
    // Char.damage() detaches the Hero's LifeLink after the linked Mob dies.
    const after=stateWithBuff(poison,44,10,{left:8},{
      cooldown:1,buffCooldown_0:1,buffCount:1,hp:8,
      combatBundle:rewardCombatBundle
    });
    const eventBody={
      targetId:"dead-linked-mob-0001",targetType:"MOB",
      targetHpBefore:1,targetHtBefore:20,targetHp:0,targetHt:20,
      targetPosBefore:25,targetPosAfter:25,targetShieldBefore:0,targetShieldAfter:0,
      targetBuffsBefore:"[]",targetBuffs:"[]",targetMobBundleAfter:null,
      nativeActorId:7,
      nativeMobBundleBefore:JSON.stringify({mob:{
        __className:"com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat",
        id:7,HP:1,HT:20,pos:25,buffs:[]
      }}),
      nativeMobBundleAfterEvidence:JSON.stringify({mob:{
        __className:"com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat",
        id:7,HP:0,HT:20,pos:25,buffs:[]
      }}),
      nativeMobRewardClassName:"com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat",
      nativeMobRewardEligible:false,nativeMobRewardExp:0,nativeMobRewardMaxLevel:29,
      nativeMobRewardSpawningWeight:1,nativeMobRewardMonkEnergy:1,
      sourceType:"ENVIRONMENT",sourceClass:lifeLink,engineResolved:true,heaps:[]
    };
    const event={sequence:12,sender_id:"publisher",event_type:"CHAR_DAMAGED",payload:JSON.stringify(eventBody)};
    const level={branch:0,locked:false,mobs:[]};
    const tickData={...tick(poison,44),sequenceBefore:10};
    const resolved=nativeHeroBuffLifeLinkMobEntityIds(JSON.stringify(before),level,[event]);
    expect(resolved).toEqual(["dead-linked-mob-0001"]);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tickData,level,resolved,[event],[7])).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tickData,level,resolved,[event],[])).toBe(false);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tickData,level,resolved,[],[7])).toBe(false);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tickData,level,resolved,[event],[8])).toBe(false);
  });

  it("accepts only stable, non-moving LifeLink Mob damage bundles and exact death tombstones",()=>{
    const className="com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat";
    const entityId="linked-native-mob-0001";
    const mobBundle=(hp:number)=>JSON.stringify({mob:{
      __className:className,id:7,time:9,HP:hp,HT:20,pos:33,buffs:[]
    }});
    const saved=[{
      entityId,mobId:7,name:"Rat",pos:33,hp:20,ht:20,shielding:0,buffs:[],
      serializedBundle:mobBundle(20)
    }];
    const delta={
      entityId,hpBefore:20,htBefore:20,posBefore:33,shieldBefore:0,
      hpAfter:19,htAfter:20,posAfter:33,shieldAfter:0,
      buffsBefore:"[]",buffsAfter:"[]",serializedBundleAfter:mobBundle(19)
    };
    const result=parseAndValidateNativeLifeLinkMobDeltas(
      {complete:true,deltas:[delta]},saved,[entityId],1024,32);
    expect(result?.deltas).toHaveLength(1);
    expect(parseAndValidateNativeLifeLinkMobDeltas(
      {complete:true,deltas:[delta]},saved,["unlinked-native-mob-02"],1024,32)).toBeNull();
    expect(parseAndValidateNativeLifeLinkMobDeltas(
      {complete:true,deltas:[{...delta,posAfter:34,serializedBundleAfter:mobBundle(19)}]},
      saved,[entityId],1024,32)).toBeNull();
    expect(parseAndValidateNativeLifeLinkMobDeltas(
      {complete:true,deltas:[{...delta,hpAfter:21,serializedBundleAfter:mobBundle(21)}]},
      saved,[entityId],1024,32)).toBeNull();
    const death={...delta,hpAfter:0,shieldAfter:0,buffsAfter:"[]",serializedBundleAfter:saved[0].serializedBundle};
    expect(parseAndValidateNativeLifeLinkMobDeltas(
      {complete:true,deltas:[death],heaps:[]},saved,[entityId],1024,32)?.deltas[0].hpAfter).toBe(0);
    expect(parseAndValidateNativeLifeLinkMobDeltas(
      {complete:true,deltas:[{...death,serializedBundleAfter:mobBundle(0)}],heaps:[]},
      saved,[entityId],1024,32)).toBeNull();
  });

  it("accepts one native WellFed tick with its exact one-HP healing threshold",()=>{
    const cls=buffs+"WellFed";
    const previous=stateWithBuff(cls,22,9,{left:19},{cooldown:2,buffCooldown_0:1,hp:10});
    const before=stateWithBuff(cls,22,9,{left:19},{cooldown:1,buffCooldown_0:0,hp:10});
    const after=stateWithBuff(cls,22,10,{left:18},{cooldown:1,buffCooldown_0:1,hp:11});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),JSON.stringify(after),tick(cls,22))).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...after,hp:15}),tick(cls,22))).toBe(false);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...after,inventoryBundle:"forged-inventory"}),tick(cls,22))).toBe(false);
  });

  it("rejects a previously accepted Hero Buff tick when replayed against the committed pre-state",()=>{
    const wellFed=buffs+"WellFed";
    const previous=stateWithBuff(wellFed,22,9,{left:19},{
      cooldown:2,buffCooldown_0:1,hp:10
    });
    const before=stateWithBuff(wellFed,22,9,{left:19},{
      cooldown:1,buffCooldown_0:0,hp:10
    });
    const after=stateWithBuff(wellFed,22,10,{left:18},{
      cooldown:1,buffCooldown_0:1,hp:11
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(wellFed,22))).toBe(true);

    // A retry using the same old pre-state but a new request ID must still fail.
    // The committed Hero HP and Buff clock no longer match the claimed pre-state.
    expect(isValidNativeHeroBuffTick(JSON.stringify(after),JSON.stringify(before),
      JSON.stringify(after),tick(wellFed,22))).toBe(false);

    expect(classifyRequestReplay({
      player_id:"buff-player",sequence:41,result_json:JSON.stringify({status:"ACCEPTED",eventType:"HERO_BUFF_TICKED"})
    },"buff-player")).toBe("REPLAY");
    expect(classifyRequestReplay({
      player_id:"buff-player",sequence:41,result_json:"{}"
    },"another-player")).toBe("CONFLICT");
  });

  it("serializes two distinct native Hero Buff ticks without allowing the first effect to be replayed",()=>{
    const wellFed=buffs+"WellFed", hunger=buffs+"Hunger";
    const hungerRow=JSON.stringify({buff:{__className:hunger,id:12,time:9,level:200,partialDamage:0}});
    const previous=stateWithBuff(wellFed,22,9,{left:19},{
      cooldown:2,buffCooldown_0:1,buffCount:2,buff_1:hungerRow,buffCooldown_1:1,hp:10
    });
    const before=stateWithBuff(wellFed,22,9,{left:19},{
      cooldown:1,buffCooldown_0:0,buffCount:2,buff_1:hungerRow,buffCooldown_1:0,hp:10
    });
    const afterWellFed=stateWithBuff(wellFed,22,10,{left:18},{
      cooldown:1,buffCooldown_0:1,buffCount:2,buff_1:hungerRow,buffCooldown_1:0,hp:11
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(afterWellFed),tick(wellFed,22))).toBe(true);

    const nextHunger:any=JSON.parse(JSON.stringify(afterWellFed));
    // Native Hunger.act() spends one turn without changing level while WellFed is active.
    nextHunger.buff_1=JSON.stringify({buff:{
      __className:hunger,id:12,time:10,level:200,partialDamage:0
    }});
    nextHunger.buffCooldown_1=1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(afterWellFed),JSON.stringify(afterWellFed),
      JSON.stringify(nextHunger),tick(hunger,12))).toBe(true);

    // Reordering the stale first tick after the second state has committed is rejected.
    expect(isValidNativeHeroBuffTick(JSON.stringify(nextHunger),JSON.stringify(before),
      JSON.stringify(afterWellFed),tick(wellFed,22))).toBe(false);
  });


  it("serializes overlapping timed Hero expiries as separate due, replay-safe native actor events",()=>{
    const haste=buffs+"Haste", weakness=buffs+"Weakness";
    const weaknessRow=JSON.stringify({buff:{__className:weakness,id:102,time:10}});
    const previous=stateWithBuff(haste,101,9,{},{
      cooldown:2,buffCooldown_0:1,buffCount:2,
      buff_1:weaknessRow,buffCooldown_1:2,hp:10
    });
    const beforeHaste=stateWithBuff(haste,101,9,{},{
      cooldown:1,buffCooldown_0:0,buffCount:2,
      buff_1:weaknessRow,buffCooldown_1:1,hp:10
    });
    const afterHaste:any={...beforeHaste,buffCount:1,buff_0:weaknessRow,buffCooldown_0:1};
    delete afterHaste.buff_1;
    delete afterHaste.buffCooldown_1;

    // Haste is due at actor clock 9. Weakness has one full turn remaining and must survive.
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(beforeHaste),
      JSON.stringify(afterHaste),tick(haste,101,9))).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(afterHaste),JSON.stringify(afterHaste),
      JSON.stringify({...afterHaste,buffCount:0}),tick(weakness,102,9))).toBe(false);

    // The native scheduler advances to clock 10 before Weakness itself may expire.
    const beforeWeakness:any={...afterHaste,cooldown:0,buffCooldown_0:0};
    const afterWeakness:any={...beforeWeakness,buffCount:0};
    delete afterWeakness.buff_0;
    delete afterWeakness.buffCooldown_0;
    expect(isValidNativeHeroBuffTick(JSON.stringify(afterHaste),JSON.stringify(beforeWeakness),
      JSON.stringify(afterWeakness),tick(weakness,102,10))).toBe(true);

    // Once the second event is committed, neither an old first-tick payload nor a duplicate
    // of the second source can be replayed against the new trusted pre-state.
    expect(isValidNativeHeroBuffTick(JSON.stringify(afterWeakness),JSON.stringify(beforeHaste),
      JSON.stringify(afterHaste),tick(haste,101,9))).toBe(false);
    expect(isValidNativeHeroBuffTick(JSON.stringify(afterWeakness),JSON.stringify(beforeWeakness),
      JSON.stringify(afterWeakness),tick(weakness,102,10))).toBe(false);

    const earlyWeakness:any={...afterHaste,buffCount:0};
    delete earlyWeakness.buff_0;
    delete earlyWeakness.buffCooldown_0;
    expect(isValidNativeHeroBuffTick(JSON.stringify(afterHaste),JSON.stringify(afterHaste),
      JSON.stringify(earlyWeakness),tick(weakness,102,9))).toBe(false);
  });

  it("accepts Hunger advance within the native clock and rejects forged healing or item deltas",()=>{
    const cls=buffs+"Hunger";
    const previous=stateWithBuff(cls,12,9,{level:200,partialDamage:0},{cooldown:2,buffCooldown_0:1,hp:10});
    const before=stateWithBuff(cls,12,9,{level:200,partialDamage:0},{cooldown:1,buffCooldown_0:0,hp:10});
    const after=stateWithBuff(cls,12,10,{level:201,partialDamage:0},{cooldown:1,buffCooldown_0:1,hp:10});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),JSON.stringify(after),tick(cls,12))).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),JSON.stringify({...after,hp:11}),tick(cls,12))).toBe(false);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...after,inventoryItemsJson:"[forged]"}),tick(cls,12))).toBe(false);
  });

  it("keeps native Hunger level and partial damage unchanged while the boss level is locked",()=>{
    const cls=buffs+"Hunger";
    const previous=stateWithBuff(cls,75,9,{level:450,partialDamage:0.8},{
      cooldown:2,buffCooldown_0:1,hp:10
    });
    const before=stateWithBuff(cls,75,9,{level:450,partialDamage:0.8},{
      cooldown:1,buffCooldown_0:0,hp:10
    });
    const after=stateWithBuff(cls,75,10,{level:450,partialDamage:0.8},{
      cooldown:1,buffCooldown_0:1,hp:10
    });
    const lockedLevel={branch:0,locked:true,
      levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"};
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(cls,75),lockedLevel)).toBe(true);

    const forgedDamage=JSON.parse(JSON.stringify(after));
    forgedDamage.hp=9;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedDamage),tick(cls,75),lockedLevel)).toBe(false);

    const forgedHunger=JSON.parse(JSON.stringify(after));
    forgedHunger.buff_0=JSON.stringify({buff:{
      __className:cls,id:75,time:10,level:450,partialDamage:0.82
    }});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedHunger),tick(cls,75),lockedLevel)).toBe(false);
  });

  it("validates bounded Healing and Poison ticks and rejects unrelated buff injection",()=>{
    const healing=buffs+"Healing";
    const old=stateWithBuff(healing,31,9,{left:5,percent:0.2,flat:0,healing_limited:false},{cooldown:2,buffCooldown_0:1,hp:10});
    const before=stateWithBuff(healing,31,9,{left:5,percent:0.2,flat:0,healing_limited:false},{cooldown:1,buffCooldown_0:0,hp:10});
    const after=stateWithBuff(healing,31,10,{left:4,percent:0.2,flat:0,healing_limited:false},{cooldown:1,buffCooldown_0:1,hp:11});
    expect(isValidNativeHeroBuffTick(JSON.stringify(old),JSON.stringify(before),JSON.stringify(after),tick(healing,31))).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(old),JSON.stringify(before),JSON.stringify({...after,hp:20}),tick(healing,31))).toBe(false);
    const poison=buffs+"Poison";
    const pOld=stateWithBuff(poison,44,9,{left:9},{cooldown:2,buffCooldown_0:1,hp:10});
    const pBefore=stateWithBuff(poison,44,9,{left:9},{cooldown:1,buffCooldown_0:0,hp:10});
    const pAfter=stateWithBuff(poison,44,10,{left:8},{cooldown:1,buffCooldown_0:1,hp:9});
    expect(isValidNativeHeroBuffTick(JSON.stringify(pOld),JSON.stringify(pBefore),JSON.stringify(pAfter),tick(poison,44))).toBe(true);
    const forged={...after,buffCount:2,buff_1:JSON.stringify({buff:{__className:buffs+"Haste",id:87,time:13}}),buffCooldown_1:4};
    expect(isValidNativeHeroBuffTick(JSON.stringify(old),JSON.stringify(before),JSON.stringify(forged),tick(healing,31))).toBe(false);
  });


  it("accounts for exact Barrier absorption and detachment during a native Poison tick",()=>{
    const poison=buffs+"Poison", barrier=buffs+"Barrier";
    const barrierRow=(shielding:number,partial_lost_shield=0)=>JSON.stringify({buff:{
      __className:barrier,id:82,time:9,shielding,partial_lost_shield
    }});
    const previous=stateWithBuff(poison,44,9,{left:3},{
      cooldown:2,buffCooldown_0:1,hp:10,shielding:2,
      buffCount:2,buff_1:barrierRow(2),buffCooldown_1:1
    });
    const before=stateWithBuff(poison,44,9,{left:3},{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:2,
      buffCount:2,buff_1:barrierRow(2),buffCooldown_1:0
    });
    const consumed=stateWithBuff(poison,44,10,{left:2},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:0,buffCount:1
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(consumed),tick(poison,44))).toBe(true);

    const previousPartial=stateWithBuff(poison,45,9,{left:2},{
      cooldown:2,buffCooldown_0:1,hp:10,shielding:4,
      buffCount:2,buff_1:barrierRow(4,0.35),buffCooldown_1:1
    });
    const beforePartial=stateWithBuff(poison,45,9,{left:2},{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:4,
      buffCount:2,buff_1:barrierRow(4,0.35),buffCooldown_1:0
    });
    const partial=stateWithBuff(poison,45,10,{left:1},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:3,
      buffCount:2,buff_1:barrierRow(3,0.35),buffCooldown_1:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previousPartial),JSON.stringify(beforePartial),
      JSON.stringify(partial),tick(poison,45))).toBe(true);

    const forgedUnspentShield=stateWithBuff(poison,44,10,{left:2},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:2,buffCount:1
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedUnspentShield),tick(poison,44))).toBe(false);

    const forgedExtraLoss=stateWithBuff(poison,45,10,{left:1},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:1,
      buffCount:2,buff_1:barrierRow(3,0.35),buffCooldown_1:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previousPartial),JSON.stringify(beforePartial),
      JSON.stringify(forgedExtraLoss),tick(poison,45))).toBe(false);

    const wrongNativeKey = JSON.stringify({buff:{
      __className:barrier,id:86,time:9,shielding:4,partialLostShield:0.35
    }});
    const wrongKeyPrevious=stateWithBuff(poison,46,9,{left:2},{
      cooldown:2,buffCooldown_0:1,hp:10,shielding:4,buffCount:2,
      buff_1:wrongNativeKey,buffCooldown_1:1
    });
    const wrongKeyBefore=stateWithBuff(poison,46,9,{left:2},{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:4,buffCount:2,
      buff_1:wrongNativeKey,buffCooldown_1:0
    });
    const wrongKeyAfter=stateWithBuff(poison,46,10,{left:1},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:3,buffCount:2,
      buff_1:wrongNativeKey.replace('"shielding":4','"shielding":3'),buffCooldown_1:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(wrongKeyPrevious),JSON.stringify(wrongKeyBefore),
      JSON.stringify(wrongKeyAfter),tick(poison,46))).toBe(false);

    const forgedPartialRemainder=stateWithBuff(poison,45,10,{left:1},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:3,
      buffCount:2,buff_1:barrierRow(3,0.8),buffCooldown_1:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previousPartial),JSON.stringify(beforePartial),
      JSON.stringify(forgedPartialRemainder),tick(poison,45))).toBe(false);
  });

  it("validates Poison consumption across priority-ordered active ShieldBuff rows",()=>{
    const poison=buffs+"Poison";
    const warriorShield="com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal$WarriorShield";
    const blockBuff="com.shatteredpixel.shatteredpixeldungeon.items.weapon.enchantments.Blocking$BlockBuff";
    const barrier=buffs+"Barrier";
    const warriorRow=(shielding:number)=>JSON.stringify({buff:{
      __className:warriorShield,id:91,time:8,shielding,cooldown:150,
      turns_since_enemies:0,initial_shield:1
    }});
    const blockRow=(shielding:number,left=5)=>JSON.stringify({buff:{
      __className:blockBuff,id:92,time:8,shielding,left
    }});
    const barrierRow=(shielding:number,partial_lost_shield=0)=>JSON.stringify({buff:{
      __className:barrier,id:93,time:8,shielding,partial_lost_shield
    }});
    const previous=stateWithBuff(poison,44,9,{left:6},{
      cooldown:2,buffCooldown_0:1,hp:10,shielding:4,buffCount:4,
      buff_1:warriorRow(1),buffCooldown_1:0,
      buff_2:blockRow(1),buffCooldown_2:0,
      buff_3:barrierRow(2),buffCooldown_3:0
    });
    const before=stateWithBuff(poison,44,9,{left:6},{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:4,buffCount:4,
      buff_1:warriorRow(1),buffCooldown_1:0,
      buff_2:blockRow(1),buffCooldown_2:0,
      buff_3:barrierRow(2),buffCooldown_3:0
    });
    const after=stateWithBuff(poison,44,10,{left:5},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:1,buffCount:3,
      buff_1:warriorRow(0),buffCooldown_1:0,
      buff_2:barrierRow(1),buffCooldown_2:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44))).toBe(true);

    // ShieldBuff.processDamage() consumes every priority-2 shield before Barrier (priority 0).
    // This forged result spends WarriorShield + Barrier but leaves the equally high-priority
    // Blocking shield intact. Aggregate HP/shield conservation alone would not detect the ordering violation.
    const forgedHighPriorityBypass=stateWithBuff(poison,44,10,{left:5},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:1,buffCount:3,
      buff_1:warriorRow(0),buffCooldown_1:0,
      buff_2:blockRow(1),buffCooldown_2:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedHighPriorityBypass),tick(poison,44))).toBe(false);

    const ascendBuff="com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.cleric.AscendedForm$AscendBuff";
    const divineShield="com.shatteredpixel.shatteredpixeldungeon.actors.hero.spells.DivineIntervention$DivineShield";
    const ascendRow=(shielding:number)=>JSON.stringify({buff:{
      __className:ascendBuff,id:94,time:8,shielding,left:10,
      spell_casts:0,flash_casts:0,divine_intervention_cast:false
    }});
    const divineRow=(shielding:number)=>JSON.stringify({buff:{
      __className:divineShield,id:95,time:8,shielding
    }});
    const middlePrevious=stateWithBuff(poison,47,9,{left:6},{
      cooldown:2,buffCooldown_0:1,hp:10,shielding:6,buffCount:6,
      buff_1:warriorRow(1),buffCooldown_1:0,
      buff_2:blockRow(1),buffCooldown_2:0,
      buff_3:ascendRow(1),buffCooldown_3:0,
      buff_4:divineRow(1),buffCooldown_4:0,
      buff_5:barrierRow(2),buffCooldown_5:0
    });
    const middleBefore=stateWithBuff(poison,47,9,{left:6},{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:6,buffCount:6,
      buff_1:warriorRow(1),buffCooldown_1:0,
      buff_2:blockRow(1),buffCooldown_2:0,
      buff_3:ascendRow(1),buffCooldown_3:0,
      buff_4:divineRow(1),buffCooldown_4:0,
      buff_5:barrierRow(2),buffCooldown_5:0
    });
    // Two priority-2 points and two priority-1 points are consumed before priority-0 Barrier.
    // AscendBuff and WarriorShield remain attached at zero; BlockBuff and DivineShield detach.
    const middleValid=stateWithBuff(poison,47,10,{left:5},{
      // Poison left 6 deals three damage: two priority-2 points, then one priority-1 point.
      cooldown:1,buffCooldown_0:1,hp:10,shielding:3,buffCount:5,
      buff_1:warriorRow(0),buffCooldown_1:0,
      buff_2:ascendRow(0),buffCooldown_2:0,
      buff_3:divineRow(1),buffCooldown_3:0,
      buff_4:barrierRow(2),buffCooldown_4:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(middlePrevious),JSON.stringify(middleBefore),
      JSON.stringify(middleValid),tick(poison,47))).toBe(true);

    // Here priority 2 is depleted, but Barrier loses one point while both priority-1
    // Cleric shields remain. That contradicts the native descending-priority pipeline.
    const forgedMiddlePriorityBypass=stateWithBuff(poison,47,10,{left:5},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:3,buffCount:5,
      buff_1:warriorRow(0),buffCooldown_1:0,
      buff_2:ascendRow(1),buffCooldown_2:0,
      buff_3:divineRow(1),buffCooldown_3:0,
      buff_4:barrierRow(1),buffCooldown_4:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(middlePrevious),JSON.stringify(middleBefore),
      JSON.stringify(forgedMiddlePriorityBypass),tick(poison,47))).toBe(false);

    const forgedWarriorState=JSON.parse(JSON.stringify(after));
    forgedWarriorState.buff_1=warriorRow(0).replace('"cooldown":150','"cooldown":149');
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedWarriorState),tick(poison,44))).toBe(false);

    const forgedAggregate=JSON.parse(JSON.stringify(after));
    forgedAggregate.shielding=2;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedAggregate),tick(poison,44))).toBe(false);
  });

  it("validates a partial native Blocking.BlockBuff shield loss during Poison",()=>{
    const poison=buffs+"Poison";
    const blockBuff="com.shatteredpixel.shatteredpixeldungeon.items.weapon.enchantments.Blocking$BlockBuff";
    const blockRow=(shielding:number,left=5)=>JSON.stringify({buff:{
      __className:blockBuff,id:95,time:8,shielding,left
    }});
    const previous=stateWithBuff(poison,44,9,{left:3},{
      cooldown:2,buffCooldown_0:1,hp:10,shielding:3,buffCount:2,
      buff_1:blockRow(3),buffCooldown_1:0
    });
    const before=stateWithBuff(poison,44,9,{left:3},{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:3,buffCount:2,
      buff_1:blockRow(3),buffCooldown_1:0
    });
    const after=stateWithBuff(poison,44,10,{left:2},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:1,buffCount:2,
      buff_1:blockRow(1),buffCooldown_1:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44))).toBe(true);
    const forgedLeft=JSON.parse(JSON.stringify(after));
    forgedLeft.buff_1=blockRow(1,4);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedLeft),tick(poison,44))).toBe(false);
  });

  it("serializes concurrent native Healing and Barrier ticks without cross-effect mutation",()=>{
    const healing=buffs+"Healing", barrier=buffs+"Barrier";
    const barrierRow=JSON.stringify({buff:{
      __className:barrier,id:82,time:9,shielding:2,partial_lost_shield:0
    }});
    const previous=stateWithBuff(healing,31,9,{
      left:5,percent:0.2,flat:0,healing_limited:false
    },{
      cooldown:2,buffCooldown_0:1,hp:10,shielding:2,
      buffCount:2,buff_1:barrierRow,buffCooldown_1:1
    });
    const beforeHealing=stateWithBuff(healing,31,9,{
      left:5,percent:0.2,flat:0,healing_limited:false
    },{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:2,
      buffCount:2,buff_1:barrierRow,buffCooldown_1:0
    });
    const afterHealing=stateWithBuff(healing,31,10,{
      left:4,percent:0.2,flat:0,healing_limited:false
    },{
      cooldown:1,buffCooldown_0:1,hp:11,shielding:2,
      buffCount:2,buff_1:barrierRow,buffCooldown_1:0
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(beforeHealing),
      JSON.stringify(afterHealing),tick(healing,31))).toBe(true);

    const healingRow=JSON.stringify({buff:{
      __className:healing,id:31,time:10,left:4,percent:0.2,flat:0,healing_limited:false
    }});
    const afterBarrier=stateWithBuff(barrier,82,10,{
      shielding:2,partial_lost_shield:0.1
    },{
      cooldown:1,buffCooldown_0:1,hp:11,shielding:2,
      buffCount:2,buff_1:healingRow,buffCooldown_1:1
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(afterHealing),JSON.stringify(afterHealing),
      JSON.stringify(afterBarrier),tick(barrier,82))).toBe(true);

    const forgedHealing=stateWithBuff(barrier,82,10,{
      shielding:2,partial_lost_shield:0.1
    },{
      cooldown:1,buffCooldown_0:1,hp:12,shielding:2,
      buffCount:2,
      buff_1:JSON.stringify({buff:{
        __className:healing,id:31,time:10,left:3,percent:0.2,flat:0,healing_limited:false
      }}),
      buffCooldown_1:1
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(afterHealing),JSON.stringify(afterHealing),
      JSON.stringify(forgedHealing),tick(barrier,82))).toBe(false);

    const forgedBarrier=stateWithBuff(healing,31,10,{
      left:4,percent:0.2,flat:0,healing_limited:false
    },{
      cooldown:1,buffCooldown_0:1,hp:11,shielding:0,
      buffCount:2,
      buff_1:JSON.stringify({buff:{
        __className:barrier,id:82,time:10,shielding:0,partial_lost_shield:0
      }}),
      buffCooldown_1:1
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(beforeHealing),
      JSON.stringify(forgedBarrier),tick(healing,31))).toBe(false);
  });

  it("allows only inert native Foresight and Invulnerability to expire between Hero actor ticks",()=>{
    const hunger=buffs+"Hunger";
    for (const effect of ["Foresight","Invulnerability"]) {
      const effectClass=buffs+effect;
      const previous:any=stateWithBuff(hunger,12,9,{level:200,partialDamage:0},{
        cooldown:2,buffCooldown_0:1,hp:10
      });
      previous.buffCount=2;
      previous.buff_1=JSON.stringify({buff:{__className:effectClass,id:13,time:8}});
      previous.buffCooldown_1=0;
      const before=stateWithBuff(hunger,12,9,{level:200,partialDamage:0},{
        cooldown:1,buffCooldown_0:0,hp:10
      });
      const after=stateWithBuff(hunger,12,10,{level:201,partialDamage:0},{
        cooldown:1,buffCooldown_0:1,hp:10
      });
      expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
        JSON.stringify(after),tick(hunger,12))).toBe(true);
    }

    const unsafe:any=stateWithBuff(hunger,12,9,{level:200,partialDamage:0},{
      cooldown:2,buffCooldown_0:1,hp:10
    });
    unsafe.buffCount=2;
    unsafe.buff_1=JSON.stringify({buff:{__className:buffs+"Amok",id:14,time:8}});
    unsafe.buffCooldown_1=0;
    const unsafeBefore=stateWithBuff(hunger,12,9,{level:200,partialDamage:0},{
      cooldown:1,buffCooldown_0:0,hp:10
    });
    const unsafeAfter=stateWithBuff(hunger,12,10,{level:201,partialDamage:0},{
      cooldown:1,buffCooldown_0:1,hp:10
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(unsafe),JSON.stringify(unsafeBefore),
      JSON.stringify(unsafeAfter),tick(hunger,12))).toBe(false);
  });

  it("enforces VialOfBlood's native per-turn Healing cap and rejects excess healing",()=>{
    const healing=buffs+"Healing";
    const vial="com.shatteredpixel.shatteredpixeldungeon.items.trinkets.VialOfBlood";
    const vialId="native-vial-tick-001";
    const vialBundle=JSON.stringify({item:{__className:vial,multiplayer_item_id:vialId,
      quantity:1,level:0,cursed:false,cursedKnown:true}});
    const inventoryItemsJson=JSON.stringify([{itemId:vialId,className:vial,quantity:1,level:0,
      cursed:false,cursedKnown:true,stackable:false,equipped:false,serializedBundle:vialBundle}]);
    const previous=stateWithBuff(healing,91,9,{left:34,percent:0.25,flat:0,healing_limited:true},
      {cooldown:2,buffCooldown_0:1,hp:10,inventoryItemsJson});
    const before=stateWithBuff(healing,91,9,{left:34,percent:0.25,flat:0,healing_limited:true},
      {cooldown:1,buffCooldown_0:0,hp:10,inventoryItemsJson});
    const valid=stateWithBuff(healing,91,10,{left:27,percent:0.25,flat:0,healing_limited:true},
      {cooldown:1,buffCooldown_0:1,hp:17,inventoryItemsJson});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(valid),tick(healing,91))).toBe(true);
    const overCap=stateWithBuff(healing,91,10,{left:26,percent:0.25,flat:0,healing_limited:true},
      {cooldown:1,buffCooldown_0:1,hp:18,inventoryItemsJson});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(overCap),tick(healing,91))).toBe(false);
  });

  it("enforces VialOfBlood healing-per-turn caps at levels +1 through +3",()=>{
    const healing=buffs+"Healing";
    const vial="com.shatteredpixel.shatteredpixeldungeon.items.trinkets.VialOfBlood";
    for (const [level,cap] of [[1,5],[2,3],[3,2]] as Array<[number,number]>) {
      const vialId="native-vial-tick-level-"+level;
      const vialBundle=JSON.stringify({item:{__className:vial,multiplayer_item_id:vialId,
        quantity:1,level,cursed:false,cursedKnown:true}});
      const inventoryItemsJson=JSON.stringify([{itemId:vialId,className:vial,quantity:1,level,
        cursed:false,cursedKnown:true,stackable:false,equipped:false,serializedBundle:vialBundle}]);
      const previous=stateWithBuff(healing,200+level,9,{left:100,percent:0.25,flat:0,healing_limited:true},
        {cooldown:2,buffCooldown_0:1,hp:10,inventoryItemsJson});
      const before=stateWithBuff(healing,200+level,9,{left:100,percent:0.25,flat:0,healing_limited:true},
        {cooldown:1,buffCooldown_0:0,hp:10,inventoryItemsJson});
      const accepted=stateWithBuff(healing,200+level,10,{left:100-cap,percent:0.25,flat:0,healing_limited:true},
        {cooldown:1,buffCooldown_0:1,hp:10+cap,inventoryItemsJson});
      expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
        JSON.stringify(accepted),tick(healing,200+level))).toBe(true);
      const overCap=stateWithBuff(healing,200+level,10,{left:99-cap,percent:0.25,flat:0,healing_limited:true},
        {cooldown:1,buffCooldown_0:1,hp:11+cap,inventoryItemsJson});
      expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
        JSON.stringify(overCap),tick(healing,200+level))).toBe(false);
    }
  });
  it("turns an expiring Drowsy buff into native MagicalSleep when the Hero is not at full HP",()=>{
    const drowsy=buffs+"Drowsy", sleep=buffs+"MagicalSleep";
    const previous=stateWithBuff(drowsy,130,9,{}, {cooldown:2,buffCooldown_0:1,hp:10});
    const before=stateWithBuff(drowsy,130,9,{}, {cooldown:1,buffCooldown_0:0,hp:10});
    const sleeping={...before,buffCount:1,
      buff_0:JSON.stringify({buff:{__className:sleep,id:131,time:9}}),
      buffCooldown_0:0};
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(sleeping),tick(drowsy,130))).toBe(true);
    const forged={...sleeping,buff_0:JSON.stringify({buff:{
      __className:sleep,id:131,time:20,unexpected:true
    }})};
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forged),tick(drowsy,130))).toBe(false);
    const earlyPrevious=stateWithBuff(drowsy,130,10,{}, {cooldown:2,buffCooldown_0:1,hp:10});
    const earlyBefore=stateWithBuff(drowsy,130,10,{}, {cooldown:1,buffCooldown_0:1,hp:10});
    expect(isValidNativeHeroBuffTick(JSON.stringify(earlyPrevious),JSON.stringify(earlyBefore),
      JSON.stringify(sleeping),tick(drowsy,130))).toBe(false);
  });
  it("allows Drowsy to expire without MagicalSleep only when the Hero is already at full HP",()=>{
    const drowsy=buffs+"Drowsy";
    const previous=stateWithBuff(drowsy,132,9,{}, {cooldown:2,buffCooldown_0:1,hp:20});
    const before=stateWithBuff(drowsy,132,9,{}, {cooldown:1,buffCooldown_0:0,hp:20});
    const expired:any={...before,buffCount:0};
    delete expired.buff_0;
    delete expired.buffCooldown_0;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(expired),tick(drowsy,132))).toBe(true);
    const missingSleep=stateWithBuff(drowsy,132,9,{}, {cooldown:1,buffCooldown_0:0,hp:10});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(missingSleep),
      JSON.stringify(expired),tick(drowsy,132))).toBe(false);
  });
  it("validates Dread countdown ticks and its final one-turn expiry",()=>{
    const dread=buffs+"Dread";
    const previous=stateWithBuff(dread,140,9,{left:3,object:321},{
      cooldown:2,buffCooldown_0:1,hp:10
    });
    const before=stateWithBuff(dread,140,9,{left:3,object:321},{
      cooldown:1,buffCooldown_0:0,hp:10
    });
    const after=stateWithBuff(dread,140,10,{left:2,object:321},{
      cooldown:1,buffCooldown_0:1,hp:10
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(dread,140))).toBe(true);
    const forged=stateWithBuff(dread,140,10,{left:1,object:999},{
      cooldown:1,buffCooldown_0:1,hp:10
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forged),tick(dread,140))).toBe(false);

    const finalPrevious=stateWithBuff(dread,141,9,{left:1,object:321},{
      cooldown:2,buffCooldown_0:1,hp:10
    });
    const finalBefore=stateWithBuff(dread,141,9,{left:1,object:321},{
      cooldown:1,buffCooldown_0:0,hp:10
    });
    const expired:any={...finalBefore,buffCount:0};
    delete expired.buff_0;
    delete expired.buffCooldown_0;
    expect(isValidNativeHeroBuffTick(JSON.stringify(finalPrevious),JSON.stringify(finalBefore),
      JSON.stringify(expired),tick(dread,141))).toBe(true);
  });
  it("rejects Dread countdown ticks before their native actor deadline",()=>{
    const dread=buffs+"Dread";
    const previous=stateWithBuff(dread,142,10,{left:3,object:321},{
      cooldown:2,buffCooldown_0:1,hp:10
    });
    const before=stateWithBuff(dread,142,10,{left:3,object:321},{
      cooldown:1,buffCooldown_0:1,hp:10
    });
    const forged=stateWithBuff(dread,142,11,{left:2,object:321},{
      cooldown:1,buffCooldown_0:1,hp:10
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forged),tick(dread,142))).toBe(false);
  });
  it("accepts Haste expiration only when due and with no HP/shield side effects",()=>{
    const cls=buffs+"Haste";
    const previous=stateWithBuff(cls,70,9,{}, {cooldown:2,buffCooldown_0:1,hp:10});
    const before=stateWithBuff(cls,70,9,{}, {cooldown:1,buffCooldown_0:0,hp:10});
    const after:any={...before,buffCount:0};
    delete after.buff_0;
    delete after.buffCooldown_0;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),JSON.stringify(after),tick(cls,70))).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...after,hp:11}),tick(cls,70))).toBe(false);
  });
  it("accepts only native FlavourBuff timer expiry and rejects early or side-effecting removal",()=>{
    const safe=["Chill","Cripple","Slow","Speed","Weakness","Recharging",
      "Adrenaline","Bless","Daze","Foresight","Invulnerability","FrostImbue",
      "Amok","Charm","Terror","Stamina","Vertigo",
      "BlobImmunity","HeroDisguise","Hex","Sleep","Vulnerable"];
    for (const name of safe) {
      const cls=buffs+name;
      const previous=stateWithBuff(cls,120,9,{}, {cooldown:2,buffCooldown_0:1,hp:10});
      const before=stateWithBuff(cls,120,9,{}, {cooldown:1,buffCooldown_0:0,hp:10});
      const expired:any={...before,buffCount:0};
      delete expired.buff_0;
      delete expired.buffCooldown_0;
      expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),JSON.stringify(expired),tick(cls,120))).toBe(true);
      expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
        JSON.stringify({...expired,hp:9}),tick(cls,120))).toBe(false);
      const notDue=stateWithBuff(cls,120,10,{}, {cooldown:1,buffCooldown_0:1,hp:10});
      expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),JSON.stringify(notDue),tick(cls,120))).toBe(false);
    }
  });
  it("accepts only a due native Amok expiry on the Hero with no unrelated state changes",()=>{
    const cls=buffs+"Amok";
    const previous=stateWithBuff(cls,131,9,{}, {cooldown:2,buffCooldown_0:1,hp:10});
    const before=stateWithBuff(cls,131,9,{}, {cooldown:1,buffCooldown_0:0,hp:10});
    const after:any={...before,buffCount:0};
    delete after.buff_0;
    delete after.buffCooldown_0;

    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(cls,131))).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...after,hp:9}),tick(cls,131))).toBe(false);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...after,shielding:1}),tick(cls,131))).toBe(false);

    const notDue=stateWithBuff(cls,131,10,{}, {cooldown:1,buffCooldown_0:1,hp:10});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(notDue),tick(cls,131))).toBe(false);
  });
  it("accepts only a due native SnipersMark expiry on the Hero and never an incidental removal",()=>{
    const mark=buffs+"SnipersMark", haste=buffs+"Haste";
    const previous=stateWithBuff(mark,141,9,{object:77,bonus:0.35},
      {cooldown:2,buffCooldown_0:1,hp:10});
    const before=stateWithBuff(mark,141,9,{object:77,bonus:0.35},
      {cooldown:1,buffCooldown_0:0,hp:10});
    const expired:any={...before,buffCount:0};
    delete expired.buff_0;
    delete expired.buffCooldown_0;

    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(expired),tick(mark,141))).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...expired,hp:9}),tick(mark,141))).toBe(false);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...expired,shielding:1}),tick(mark,141))).toBe(false);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...expired,inventoryBundle:"forged-inventory"}),tick(mark,141))).toBe(false);

    const changedMark=stateWithBuff(mark,141,9,{object:78,bonus:0.35},
      {cooldown:1,buffCooldown_0:0,hp:10});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(changedMark),
      JSON.stringify(expired),tick(mark,141))).toBe(false);
    const notDue=stateWithBuff(mark,141,10,{object:77,bonus:0.35},
      {cooldown:1,buffCooldown_0:1,hp:10});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(notDue),tick(mark,141))).toBe(false);

    const otherPrevious=stateWithBuff(haste,142,9,{},{
      cooldown:2,buffCooldown_0:1,hp:10,buffCount:2,
      buff_1:JSON.stringify({buff:{__className:mark,id:143,time:9,object:77,bonus:0.35}}),
      buffCooldown_1:0
    });
    const otherBefore=stateWithBuff(haste,142,9,{},{
      cooldown:1,buffCooldown_0:0,hp:10
    });
    const otherAfter=stateWithBuff(haste,142,10,{},{
      cooldown:1,buffCooldown_0:1,hp:10
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(otherPrevious),JSON.stringify(otherBefore),
      JSON.stringify(otherAfter),tick(haste,142))).toBe(false);
  });

  it("validates Barrier decay only as one shield point or unchanged shielding",()=>{
    const cls=buffs+"Barrier";
    const previous=stateWithBuff(cls,50,9,{shielding:5,partial_lost_shield:0.7},{cooldown:2,buffCooldown_0:1,hp:10,shielding:5});
    const before=stateWithBuff(cls,50,9,{shielding:5,partial_lost_shield:0.7},{cooldown:1,buffCooldown_0:0,hp:10,shielding:5});
    const after=stateWithBuff(cls,50,10,{shielding:4,partial_lost_shield:0},{cooldown:1,buffCooldown_0:1,hp:10,shielding:4});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),JSON.stringify(after),tick(cls,50))).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),JSON.stringify({...after,shielding:2}),tick(cls,50))).toBe(false);
  });
  it("keeps native nested Hero Buff rows immutable while another supported timer expires",()=>{
    const haste=buffs+"Haste";
    const warriorShield="com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal$WarriorShield";
    const wandCharger="com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand$Charger";
    const warriorRow=JSON.stringify({buff:{__className:warriorShield,id:81,time:12,shielding:4}});
    const chargerRow=JSON.stringify({buff:{__className:wandCharger,id:82,time:14,scalingFactor:0.875}});
    const recharging="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Recharging";
    const rechargingRow=JSON.stringify({buff:{__className:recharging,id:89,time:9}});
    const previous=stateWithBuff(haste,70,9,{},{
      cooldown:2,buffCooldown_0:1,buffCount:4,
      buff_1:warriorRow,buffCooldown_1:4,buff_2:chargerRow,buffCooldown_2:6,
      buff_3:rechargingRow,buffCooldown_3:1
    });
    const before=stateWithBuff(haste,70,9,{},{
      cooldown:1,buffCooldown_0:0,buffCount:3,
      buff_1:warriorRow,buffCooldown_1:3,buff_2:chargerRow,buffCooldown_2:5
    });
    const expired:any={...before,buffCount:2,buff_0:warriorRow,buffCooldown_0:3,
      buff_1:chargerRow,buffCooldown_1:5};
    delete expired.buff_2;
    delete expired.buffCooldown_2;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(expired),tick(haste,70))).toBe(true);
    const forged={...expired,buff_0:JSON.stringify({buff:{
      __className:warriorShield,id:81,time:12,shielding:400
    }})};
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forged),tick(haste,70))).toBe(false);
  });
  it("allows only native Frost and MagicalSleep removal during a damaging Poison tick",()=>{
    const poison=buffs+"Poison", frost=buffs+"Frost", sleep=buffs+"MagicalSleep";
    const frostRow=JSON.stringify({buff:{__className:frost,id:83,time:12}});
    const sleepRow=JSON.stringify({buff:{__className:sleep,id:84,time:13}});
    const previous=stateWithBuff(poison,44,9,{left:9},{
      cooldown:2,buffCooldown_0:1,buffCount:3,
      buff_1:frostRow,buffCooldown_1:4,buff_2:sleepRow,buffCooldown_2:5
    });
    const before=stateWithBuff(poison,44,9,{left:9},{
      cooldown:1,buffCooldown_0:0,buffCount:3,
      buff_1:frostRow,buffCooldown_1:3,buff_2:sleepRow,buffCooldown_2:4
    });
    const after=stateWithBuff(poison,44,10,{left:8},{
      cooldown:1,buffCooldown_0:1,hp:9
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44))).toBe(true);
    const forged={...after,buffCount:2,
      buff_1:JSON.stringify({buff:{__className:buffs+"Haste",id:99,time:20}}),
      buffCooldown_1:11};
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forged),tick(poison,44))).toBe(false);
  });
  it("allows Hunger's native starvation damage to remove only Frost and MagicalSleep",()=>{
    const hunger=buffs+"Hunger", frost=buffs+"Frost", sleep=buffs+"MagicalSleep";
    const frostRow=JSON.stringify({buff:{__className:frost,id:85,time:12}});
    const sleepRow=JSON.stringify({buff:{__className:sleep,id:86,time:13}});
    const previous=stateWithBuff(hunger,12,9,{level:450,partialDamage:0.99},{
      cooldown:2,buffCooldown_0:1,buffCount:3,
      buff_1:frostRow,buffCooldown_1:4,buff_2:sleepRow,buffCooldown_2:5
    });
    const before=stateWithBuff(hunger,12,9,{level:450,partialDamage:0.99},{
      cooldown:1,buffCooldown_0:0,buffCount:3,
      buff_1:frostRow,buffCooldown_1:3,buff_2:sleepRow,buffCooldown_2:4
    });
    const after=stateWithBuff(hunger,12,10,{level:450,partialDamage:0.01},{
      cooldown:1,buffCooldown_0:1,hp:9
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(hunger,12))).toBe(true);
  });
  it("rejects Poison ticks with LifeLink until the linked target is included in the result",()=>{
    const poison=buffs+"Poison", lifeLink=buffs+"LifeLink";
    const lifeLinkRow=JSON.stringify({buff:{__className:lifeLink,id:87,time:14,object:321}});
    const previous=stateWithBuff(poison,44,9,{left:9},{
      cooldown:2,buffCooldown_0:1,buffCount:2,buff_1:lifeLinkRow,buffCooldown_1:6
    });
    const before=stateWithBuff(poison,44,9,{left:9},{
      cooldown:1,buffCooldown_0:0,buffCount:2,buff_1:lifeLinkRow,buffCooldown_1:5
    });
    const after=stateWithBuff(poison,44,10,{left:8},{
      cooldown:1,buffCooldown_0:1,hp:9,buffCount:2,buff_1:lifeLinkRow,buffCooldown_1:5
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44))).toBe(false);
  });



  it("keeps Hunger damage local even when the Hero has a native LifeLink",()=>{
    const hunger=buffs+"Hunger", lifeLink=buffs+"LifeLink";
    const linkRow=JSON.stringify({buff:{__className:lifeLink,id:88,time:14,object:321}});
    const previous=stateWithBuff(hunger,12,9,{level:450,partialDamage:0.99},{
      cooldown:2,buffCooldown_0:1,buffCount:2,buff_1:linkRow,buffCooldown_1:6
    });
    const before=stateWithBuff(hunger,12,9,{level:450,partialDamage:0.99},{
      cooldown:1,buffCooldown_0:0,buffCount:2,buff_1:linkRow,buffCooldown_1:5
    });
    const after=stateWithBuff(hunger,12,10,{level:450,partialDamage:0.01},{
      cooldown:1,buffCooldown_0:1,hp:9,buffCount:2,buff_1:linkRow,buffCooldown_1:5
    });
    // Char.damage() explicitly excludes Hunger from LifeLink fan-out.
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(hunger,12))).toBe(true);
  });


  it("validates BrokenSeal WarriorShield activation during a native Poison threshold crossing",()=>{
    const poison=buffs+"Poison", warriorShield="com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal$WarriorShield";
    const armorClass="com.shatteredpixel.shatteredpixeldungeon.items.armor.PlateArmor";
    const sealClass="com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal";
    const armorId="native-armor-item-0001", sealId="native-broken-seal-0001";
    const armorItem:any={__className:armorClass,multiplayer_item_id:armorId,
      quantity:1,level:0,cursed:false,cursedKnown:true,
      seal:{__className:sealClass,multiplayer_item_id:sealId,quantity:1,level:0}};
    const armorRow:any={itemId:armorId,className:armorClass,quantity:1,level:0,
      cursed:false,cursedKnown:true,stackable:false,equipped:true,containerId:"ARMOR",
      serializedBundle:JSON.stringify({item:armorItem})};
    const inventoryExtra:any={
      inventoryBundle:JSON.stringify({inventory:[],armor:armorItem}),
      inventoryItemsJson:JSON.stringify([armorRow]),
      nativeInventoryTreeVersion:1,
      combatBundle:JSON.stringify({time:10,STR:10,class:"WARRIOR",
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},buffs:[]})
    };
    const shieldBefore=JSON.stringify({buff:{__className:warriorShield,id:88,time:8,
      shielding:0,cooldown:0,turns_since_enemies:4.5,initial_shield:0}});
    const make=(hp:number,shield:number,shieldData:any)=>stateWithBuff(poison,44,9,{left:9},{
      hp,shielding:shield,buffCount:2,buff_1:JSON.stringify({buff:shieldData}),
      buffCooldown_1:0,...inventoryExtra
    });
    const previous=stateWithBuff(poison,44,9,{left:9},{
      cooldown:2,buffCooldown_0:1,hp:10,shielding:0,buffCount:2,
      buff_1:shieldBefore,buffCooldown_1:0,...inventoryExtra
    });
    const before=make(10,0,{__className:warriorShield,id:88,time:8,
      shielding:0,cooldown:0,turns_since_enemies:4.5,initial_shield:0});
    const activated={__className:warriorShield,id:88,time:8,
      shielding:9,cooldown:150,turns_since_enemies:0,initial_shield:13};
    const after=make(10,9,activated);
    after.buff_0=JSON.stringify({buff:{__className:poison,id:44,time:10,left:8}});
    after.buffCooldown_0=1;
    after.cooldown=1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44))).toBe(true);

    // The second native trigger condition is HP + existing shields - damage <= HT/2.
    const secondThresholdPrevious=JSON.parse(JSON.stringify(previous));
    const secondThresholdBefore=JSON.parse(JSON.stringify(before));
    secondThresholdPrevious.hp=12;
    secondThresholdBefore.hp=12;
    const secondThresholdAfter=JSON.parse(JSON.stringify(after));
    secondThresholdAfter.hp=12;
    expect(isValidNativeHeroBuffTick(JSON.stringify(secondThresholdPrevious),JSON.stringify(secondThresholdBefore),
      JSON.stringify(secondThresholdAfter),tick(poison,44))).toBe(true);

    const forgedShield=JSON.parse(JSON.stringify(after));
    const forgedRow=JSON.parse(forgedShield.buff_1);
    forgedRow.buff.initial_shield=12;
    forgedShield.buff_1=JSON.stringify(forgedRow);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedShield),tick(poison,44))).toBe(false);

    const forgedNonTrigger=JSON.parse(JSON.stringify(after));
    forgedNonTrigger.hp=15;
    const highHpPrevious=JSON.parse(JSON.stringify(previous));
    const highHpBefore=JSON.parse(JSON.stringify(before));
    highHpPrevious.hp=15;
    highHpBefore.hp=15;
    expect(isValidNativeHeroBuffTick(JSON.stringify(highHpPrevious),JSON.stringify(highHpBefore),
      JSON.stringify(forgedNonTrigger),tick(poison,44))).toBe(false);

    const zeroDamage=JSON.parse(JSON.stringify(after));
    zeroDamage.shielding=13;
    const zeroDamageRow=JSON.parse(zeroDamage.buff_1);
    zeroDamageRow.buff.shielding=13;
    zeroDamage.buff_1=JSON.stringify(zeroDamageRow);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(zeroDamage),tick(poison,44))).toBe(false);
  });

  it("validates native Charm and Dread callbacks during actual Poison damage",()=>{
    const poison=buffs+"Poison";
    const charm=buffs+"Charm", dread=buffs+"Dread";
    const charmBefore=JSON.stringify({buff:{__className:charm,id:89,time:20,object:321,ignore_allies:false}});
    const dreadBefore=JSON.stringify({buff:{__className:dread,id:91,time:20,left:8,object:321}});
    const previous=stateWithBuff(poison,44,9,{left:9},{
      cooldown:2,buffCooldown_0:1,hp:10,buffCount:3,
      buff_1:charmBefore,buffCooldown_1:12,
      buff_2:dreadBefore,buffCooldown_2:12
    });
    const before=stateWithBuff(poison,44,9,{left:9},{
      cooldown:1,buffCooldown_0:0,hp:10,buffCount:3,
      buff_1:charmBefore,buffCooldown_1:11,
      buff_2:dreadBefore,buffCooldown_2:11
    });
    const after=stateWithBuff(poison,44,10,{left:8},{
      cooldown:1,buffCooldown_0:1,hp:9,buffCount:3,
      buff_1:JSON.stringify({buff:{__className:charm,id:89,time:15,object:321,ignore_allies:false}}),
      buffCooldown_1:6,
      buff_2:JSON.stringify({buff:{__className:dread,id:91,time:20,left:3,object:321}}),
      buffCooldown_2:11
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44))).toBe(true);

    const forgedCharm=JSON.parse(JSON.stringify(after));
    forgedCharm.buff_1=JSON.stringify({buff:{__className:charm,id:89,time:14,object:321,ignore_allies:false}});
    forgedCharm.buffCooldown_1=5;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedCharm),tick(poison,44))).toBe(false);

    const forgedDread=JSON.parse(JSON.stringify(after));
    forgedDread.buff_2=JSON.stringify({buff:{__className:dread,id:91,time:20,left:3,object:999}});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedDread),tick(poison,44))).toBe(false);

    const noDamage=JSON.parse(JSON.stringify(after));
    noDamage.hp=10;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(noDamage),tick(poison,44))).toBe(false);
  });

  it("validates the independent native Terror.recover() callback during Poison damage",()=>{
    const poison=buffs+"Poison", terror=buffs+"Terror";
    const terrorBefore=JSON.stringify({buff:{__className:terror,id:90,time:20,object:321}});
    const previous=stateWithBuff(poison,44,9,{left:9},{
      cooldown:2,buffCooldown_0:1,hp:10,buffCount:2,
      buff_1:terrorBefore,buffCooldown_1:12
    });
    const before=stateWithBuff(poison,44,9,{left:9},{
      cooldown:1,buffCooldown_0:0,hp:10,buffCount:2,
      buff_1:terrorBefore,buffCooldown_1:11
    });
    const after=stateWithBuff(poison,44,10,{left:8},{
      cooldown:1,buffCooldown_0:1,hp:9,buffCount:2,
      buff_1:JSON.stringify({buff:{__className:terror,id:90,time:15,object:321}}),
      buffCooldown_1:6
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(poison,44))).toBe(true);
  });

  it("validates Wand.Charger against its exact owned Wand, native scale, and charge formula",()=>{
    const charger="com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand$Charger";
    const wandClass="com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfMagicMissile";
    const itemId="wand-charge-native-001";
    const level={branch:0,locked:false,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"};
    const make=(charges:number,partial:number,scale=0.875,containerId="BACKPACK",extra:Record<string,any>={})=>{
      const item={__className:wandClass,multiplayer_item_id:itemId,quantity:1,level:0,
        cursed:false,cursedKnown:true,curCharges:charges,maxCharges:2,partialCharge:partial,usesLeftToID:10,
        availableUsesToID:5,curChargeKnown:true};
      const itemBundle=JSON.stringify({item});
      const row={itemId,className:wandClass,quantity:1,level:0,cursed:false,cursedKnown:true,
        stackable:false,equipped:false,containerId,serializedBundle:itemBundle};
      const root=containerId==="BACKPACK"
        ? {inventory:[{item}]}
        : {inventory:[{item:{__className:"com.shatteredpixel.shatteredpixeldungeon.items.bags.MagicalHolster",
            multiplayer_item_id:containerId,quantity:1,level:0,cursed:false,cursedKnown:true,
            inventory:[item]}}]};
      const items=containerId==="BACKPACK" ? [row] : [
        {itemId:containerId,className:"com.shatteredpixel.shatteredpixeldungeon.items.bags.MagicalHolster",
          quantity:1,level:0,cursed:false,cursedKnown:true,stackable:false,equipped:false,
          containerId:"BACKPACK",serializedBundle:JSON.stringify({item:root.inventory[0].item})},
        row
      ];
      const state=stateWithBuff(charger,301,9,{
        multiplayer_wand_item_id:itemId,multiplayer_scale_factor:scale
      },{
        cooldown:1,buffCooldown_0:0,nativeInventoryTreeVersion:1,inventoryBundle:JSON.stringify(root),
        inventoryItemsJson:JSON.stringify(items),quickslotsJson:"[]",
        combatBundle:JSON.stringify({time:10,class:"ROGUE",STR:10,items:"native-inventory",buffs:[]}),
        ...extra
      });
      return state;
    };
    const previous=make(0,0);
    previous.cooldown=2;
    previous.buffCooldown_0=1;
    const before=make(0,0);
    const expected=Math.fround(Math.fround(1/Math.fround(10+40*Math.pow(0.875,2)))*1);
    const after=make(0,expected);
    after.buff_0=JSON.stringify({buff:{__className:charger,id:301,time:10,
      multiplayer_wand_item_id:itemId,multiplayer_scale_factor:0.875}});
    after.buffCooldown_0=1;
    const event={...tick(charger,301),wandItemId:itemId};
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),event,level)).toBe(true);

    const changedWrongWand=make(0,expected);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(changedWrongWand),{...event,wandItemId:"different-wand-001"},level)).toBe(false);
    const excessiveCharge=make(1,0);
    excessiveCharge.buff_0=after.buff_0;
    excessiveCharge.buffCooldown_0=1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(excessiveCharge),event,level)).toBe(false);
    const holsterId="magical-holster-native-01";
    const holsterBefore=make(0,0,0.85,holsterId);
    holsterBefore.cooldown=2;
    holsterBefore.buffCooldown_0=1;
    const holsterPre=make(0,0,0.85,holsterId);
    expect(isValidNativeInventoryBundleIndex(
      holsterPre,JSON.parse(holsterPre.inventoryItemsJson))).toBe(true);
    const holsterPartial=Math.fround(Math.fround(1/Math.fround(10+40*Math.pow(0.85,2)))*1);
    const validHolsterAfter=make(0,holsterPartial,0.85,holsterId);
    validHolsterAfter.buff_0=JSON.stringify({buff:{__className:charger,id:301,time:10,
      multiplayer_wand_item_id:itemId,multiplayer_scale_factor:0.85}});
    validHolsterAfter.buffCooldown_0=1;
    const holsterEvent={...event,wandItemId:itemId};
    expect(isValidNativeHeroBuffTick(JSON.stringify(holsterBefore),JSON.stringify(holsterPre),
      JSON.stringify(validHolsterAfter),holsterEvent,level)).toBe(true);

    const wrongHolsterAfter=make(0,holsterPartial,0.875,holsterId);
    wrongHolsterAfter.buff_0=JSON.stringify({buff:{__className:charger,id:301,time:10,
      multiplayer_wand_item_id:itemId,multiplayer_scale_factor:0.875}});
    wrongHolsterAfter.buffCooldown_0=1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(holsterBefore),JSON.stringify(holsterPre),
      JSON.stringify(wrongHolsterAfter),holsterEvent,level)).toBe(false);
  });


  it("uses the native equipped RingOfEnergy and EnhancedRings charge multiplier",()=>{
    const charger="com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand$Charger";
    const wandClass="com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfMagicMissile";
    const ringClass="com.shatteredpixel.shatteredpixeldungeon.items.rings.RingOfEnergy";
    const energyClass=ringClass+"$Energy";
    const enhancedClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.EnhancedRings";
    const wandId="wand-energy-charge-native-01", ringId="ring-energy-native-01";
    const level={branch:0,locked:false,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"};
    const make=(charges:number,partial:number)=>{
      const wand={__className:wandClass,multiplayer_item_id:wandId,quantity:1,level:0,
        cursed:false,cursedKnown:true,curCharges:charges,maxCharges:2,partialCharge:partial,
        usesLeftToID:10,availableUsesToID:5,curChargeKnown:true};
      const ring={__className:ringClass,multiplayer_item_id:ringId,quantity:1,level:0,
        cursed:false,cursedKnown:true};
      const root={inventory:[{item:wand}],ring:{item:ring}};
      const inventoryRows=[
        {itemId:wandId,className:wandClass,quantity:1,level:0,cursed:false,cursedKnown:true,
          stackable:false,equipped:false,containerId:"BACKPACK",serializedBundle:JSON.stringify({item:wand})},
        {itemId:ringId,className:ringClass,quantity:1,level:0,cursed:false,cursedKnown:true,
          stackable:false,equipped:true,containerId:"RING",serializedBundle:JSON.stringify({item:ring})}
      ];
      const state:any=stateWithBuff(charger,501,9,{
        multiplayer_wand_item_id:wandId,multiplayer_scale_factor:0.875
      },{
        cooldown:1,buffCooldown_0:0,nativeInventoryTreeVersion:1,
        inventoryBundle:JSON.stringify(root),inventoryItemsJson:JSON.stringify(inventoryRows),
        quickslotsJson:"[]",
        combatBundle:JSON.stringify({time:10,class:"ROGUE",STR:10,items:"native-inventory",buffs:[]})
      });
      const energy={__className:energyClass,id:502,time:10};
      const enhanced={__className:enhancedClass,id:503,time:10};
      state.buffCount=3;
      state.buff_1=JSON.stringify({buff:energy});
      state.buffCooldown_1=1;
      state.buff_2=JSON.stringify({buff:enhanced});
      state.buffCooldown_2=1;
      return state;
    };

    const previous=make(0,0);
    previous.cooldown=2;
    previous.buffCooldown_0=1;
    previous.buffCooldown_1=2;
    previous.buffCooldown_2=2;
    const before=make(0,0);
    const turnsToCharge=Math.fround(10+40*Math.pow(0.875,2));
    // Ring level 0 contributes +1; EnhancedRings raises its buffed level to +1,
    // so the native ring bonus is 2 and the multiplier is 1.175^2.
    const ringMultiplier=Math.fround(Math.pow(1.175,2));
    const expected=Math.fround(Math.fround(1/turnsToCharge)*ringMultiplier);
    const after=make(0,expected);
    after.buff_0=JSON.stringify({buff:{__className:charger,id:501,time:10,
      multiplayer_wand_item_id:wandId,multiplayer_scale_factor:0.875}});
    after.buffCooldown_0=1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),{...tick(charger,501),wandItemId:wandId},level)).toBe(true);

    const missingEnergyBuff=JSON.parse(JSON.stringify(before));
    missingEnergyBuff.buffCount=2;
    delete missingEnergyBuff.buff_1;
    delete missingEnergyBuff.buffCooldown_1;
    const withoutEnergy=JSON.parse(JSON.stringify(after));
    withoutEnergy.buffCount=2;
    delete withoutEnergy.buff_1;
    delete withoutEnergy.buffCooldown_1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(missingEnergyBuff),
      JSON.stringify(withoutEnergy),{...tick(charger,501),wandItemId:wandId},level)).toBe(false);

    const undercharged=make(0,Math.fround(Math.fround(1/turnsToCharge)*1));
    undercharged.buff_0=after.buff_0;
    undercharged.buffCooldown_0=1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(undercharged),{...tick(charger,501),wandItemId:wandId},level)).toBe(false);
  });

  it("applies Recharging and MagicImmune using the native Wand.Charger order",()=>{
    const charger="com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand$Charger";
    const recharging=buffs+"Recharging", magicImmune=buffs+"MagicImmune";
    const wandClass="com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfMagicMissile";
    const itemId="wand-charge-native-002";
    const make=(partial:number,includeMagic:boolean)=>{
      const item={__className:wandClass,multiplayer_item_id:itemId,quantity:1,level:0,
        cursed:false,cursedKnown:true,curCharges:0,maxCharges:2,partialCharge:partial};
      const row={itemId,className:wandClass,quantity:1,level:0,cursed:false,cursedKnown:true,
        stackable:false,equipped:false,containerId:"BACKPACK",serializedBundle:JSON.stringify({item})};
      const rows=[
        {buff:{__className:charger,id:302,time:9,multiplayer_wand_item_id:itemId,multiplayer_scale_factor:0.875}},
        {buff:{__className:recharging,id:303,time:10}}
      ];
      if(includeMagic) rows.push({buff:{__className:magicImmune,id:304,time:10}});
      const state:any={
        hp:10,ht:20,pos:9,shielding:0,gold:0,alchemyEnergy:5,
        inventoryBundle:JSON.stringify({inventory:[{item}]}),
        inventoryItemsJson:JSON.stringify([row]),quickslotsJson:"[]",
        cooldown:1,nativeInventoryTreeVersion:1,combatBundle:JSON.stringify({time:10,class:"ROGUE",STR:10,buffs:[]}),
        buffCount:rows.length,
        buff_0:JSON.stringify(rows[0]),buffCooldown_0:0,
        buff_1:JSON.stringify(rows[1]),buffCooldown_1:1,
        ... (includeMagic ? {buff_2:JSON.stringify(rows[2]),buffCooldown_2:1} : {})
      };
      return state;
    };
    const level={branch:0,locked:false,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"};
    const previous=make(0,false); previous.cooldown=2; previous.buffCooldown_0=1; previous.buffCooldown_1=2;
    const before=make(0,false);
    const after=make(Math.fround(0.25+Math.fround(Math.fround(1/Math.fround(10+40*Math.pow(0.875,2))))),false);
    after.buff_0=JSON.stringify({buff:{__className:charger,id:302,time:10,
      multiplayer_wand_item_id:itemId,multiplayer_scale_factor:0.875}});
    after.buffCooldown_0=1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),{...tick(charger,302),wandItemId:itemId},level)).toBe(true);

    const magicBefore=make(0.2,true); magicBefore.cooldown=2;
    magicBefore.buffCooldown_0=1; magicBefore.buffCooldown_1=2; magicBefore.buffCooldown_2=2;
    const magicPre=make(0.2,true);
    const magicAfter=make(0.2,true);
    magicAfter.buff_0=JSON.stringify({buff:{__className:charger,id:302,time:10,
      multiplayer_wand_item_id:itemId,multiplayer_scale_factor:0.875}});
    magicAfter.buffCooldown_0=1;
    expect(isValidNativeHeroBuffTick(JSON.stringify(magicBefore),JSON.stringify(magicPre),
      JSON.stringify(magicAfter),{...tick(charger,302),wandItemId:itemId},level)).toBe(true);
  });


  it("keeps Recharging remainder active while LockedFloor or VaultLevel stops normal Wand regeneration",()=>{
    const charger="com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand$Charger";
    const recharging=buffs+"Recharging", lockedFloor=buffs+"LockedFloor";
    const wandClass="com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfMagicMissile";
    const wandId="wand-regen-gates-native-01";
    const make=(chargerTime:number,partial:number,clock:number,withRecharging:boolean,lockedLeft:number|null)=>{
      const item={__className:wandClass,multiplayer_item_id:wandId,quantity:1,level:0,
        cursed:false,cursedKnown:true,curCharges:0,maxCharges:2,partialCharge:partial};
      const row={itemId:wandId,className:wandClass,quantity:1,level:0,cursed:false,cursedKnown:true,
        stackable:false,equipped:false,containerId:"BACKPACK",serializedBundle:JSON.stringify({item})};
      const extra:any={
        cooldown:10-clock,buffCooldown_0:Math.max(0,chargerTime-clock),
        nativeInventoryTreeVersion:1,inventoryBundle:JSON.stringify({inventory:[{item}]}),
        inventoryItemsJson:JSON.stringify([row]),quickslotsJson:"[]"
      };
      let index=1;
      if(withRecharging){
        const effect={__className:recharging,id:612,time:9.5};
        extra["buff_"+index]=JSON.stringify({buff:effect});
        extra["buffCooldown_"+index]=Math.max(0,9.5-clock);
        index++;
      }
      if(lockedLeft!==null){
        const effect={__className:lockedFloor,id:613,time:10,left:lockedLeft};
        extra["buff_"+index]=JSON.stringify({buff:effect});
        extra["buffCooldown_"+index]=Math.max(0,10-clock);
        index++;
      }
      extra.buffCount=index;
      return stateWithBuff(charger,611,chargerTime,{
        multiplayer_wand_item_id:wandId,multiplayer_scale_factor:0.875
      },extra);
    };
    const event={...tick(charger,611),wandItemId:wandId};
    const before=make(9,0,9,true,0.5);
    const previous=make(9,0,8,true,0.5);
    const lockedPartial=Math.fround(0.25*0.5);
    const lockedAfter=make(10,lockedPartial,9,true,0.5);
    lockedAfter.buff_0=JSON.stringify({buff:{__className:charger,id:611,time:10,
      multiplayer_wand_item_id:wandId,multiplayer_scale_factor:0.875}});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(lockedAfter),event,{
        branch:0,locked:false,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"
      })).toBe(true);

    const forgedLockedAfter=make(10,Math.fround(lockedPartial+
      Math.fround(1/Math.fround(10+40*Math.pow(0.875,2)))),9,true,0.5);
    forgedLockedAfter.buff_0=lockedAfter.buff_0;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(forgedLockedAfter),event,{
        branch:0,locked:false,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"
      })).toBe(false);

    // A sealed regular level with a still-active LockedFloor continues native wand regeneration.
    // Level.locked is not itself a Regeneration gate; LockedFloor.regenOn() is.
    const sealedBefore=make(9,0,9,false,1);
    const sealedPrevious=make(9,0,8,false,1);
    const sealedPartial=Math.fround(Math.fround(1/Math.fround(10+40*Math.pow(0.875,2)))*1);
    const sealedAfter=make(10,sealedPartial,9,false,1);
    sealedAfter.buff_0=JSON.stringify({buff:{__className:charger,id:611,time:10,
      multiplayer_wand_item_id:wandId,multiplayer_scale_factor:0.875}});
    expect(isValidNativeHeroBuffTick(JSON.stringify(sealedPrevious),JSON.stringify(sealedBefore),
      JSON.stringify(sealedAfter),event,{
        branch:0,locked:true,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"
      })).toBe(true);
    const pausedSealedBefore=make(9,0,9,false,0.5);
    const pausedSealedPrevious=make(9,0,8,false,0.5);
    const pausedSealedAfter=make(10,0,9,false,0.5);
    pausedSealedAfter.buff_0=sealedAfter.buff_0;
    expect(isValidNativeHeroBuffTick(JSON.stringify(pausedSealedPrevious),JSON.stringify(pausedSealedBefore),
      JSON.stringify(pausedSealedAfter),event,{
        branch:0,locked:true,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"
      })).toBe(true);

    const vaultBefore=make(9,0,9,false,null);
    const vaultPrevious=make(9,0,8,false,null);
    const vaultAfter=make(10,0,9,false,null);
    vaultAfter.buff_0=JSON.stringify({buff:{__className:charger,id:611,time:10,
      multiplayer_wand_item_id:wandId,multiplayer_scale_factor:0.875}});
    expect(isValidNativeHeroBuffTick(JSON.stringify(vaultPrevious),JSON.stringify(vaultBefore),
      JSON.stringify(vaultAfter),event,{
        branch:0,locked:false,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.VaultLevel"
      })).toBe(true);

    const forgedVaultAfter=make(10,Math.fround(1/Math.fround(10+40*Math.pow(0.875,2))),9,false,null);
    forgedVaultAfter.buff_0=vaultAfter.buff_0;
    expect(isValidNativeHeroBuffTick(JSON.stringify(vaultPrevious),JSON.stringify(vaultBefore),
      JSON.stringify(forgedVaultAfter),event,{
        branch:0,locked:false,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.VaultLevel"
      })).toBe(false);
  });

  it("validates Blocking shield decay, its exact expiry and HoldFast side-effect boundary",()=>{
    const cls="com.shatteredpixel.shatteredpixeldungeon.items.weapon.enchantments.Blocking$BlockBuff";
    const previous=stateWithBuff(cls,401,9,{left:1,shielding:4},{
      cooldown:2,buffCooldown_0:1,hp:10,shielding:4
    });
    const before=stateWithBuff(cls,401,9,{left:1,shielding:4},{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:4
    });
    const expired:any={...before,buffCount:0,shielding:0};
    delete expired.buff_0; delete expired.buffCooldown_0;
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(expired),tick(cls,401))).toBe(true);

    const notDue=stateWithBuff(cls,401,9,{left:2,shielding:4},{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:4
    });
    const oneTurnLater=stateWithBuff(cls,401,10,{left:1,shielding:4},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:4
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(notDue),JSON.stringify(notDue),
      JSON.stringify(oneTurnLater),tick(cls,401))).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify({...expired,hp:9}),tick(cls,401))).toBe(false);
  });

  it("validates only shieldless WarriorShield cooldown ticks with known regeneration state",()=>{
    const cls="com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal$WarriorShield";
    const level={branch:0,locked:false,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"};
    const make=(cooldown:number,time:number=9)=>stateWithBuff(cls,411,time,{
      cooldown,turns_since_enemies:2,initial_shield:4,shielding:0
    },{cooldown:time===9?1:1,buffCooldown_0:Math.max(0,time-9),hp:10,shielding:0});
    const previous=make(10); previous.cooldown=2; previous.buffCooldown_0=1;
    const before=make(10);
    const after=make(9,10);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(cls,411),level)).toBe(true);
    const vault={...level,levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.VaultLevel"};
    const noRegenAfter=make(10,10);
    expect(isValidNativeHeroBuffTick(JSON.stringify(before),JSON.stringify(before),
      JSON.stringify(noRegenAfter),tick(cls,411),vault)).toBe(true);
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(cls,411),vault)).toBe(false);
    const shielded=stateWithBuff(cls,411,9,{cooldown:10,turns_since_enemies:2,initial_shield:4,shielding:3},{
      cooldown:1,buffCooldown_0:0,hp:10,shielding:3
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(shielded),JSON.stringify(shielded),
      JSON.stringify({...after,shielding:0}),tick(cls,411),level)).toBe(false);
  });

  it("validates deterministic Berserk recovery but rejects random Berserk shield decay",()=>{
    const cls=buffs+"Berserk";
    const normal={state:"NORMAL",power:0.5,power_buffer:2,levelrecovery:0,turn_recovery:0,shielding:0};
    const previous=stateWithBuff(cls,421,9,normal,{cooldown:2,buffCooldown_0:1,hp:10});
    const before=stateWithBuff(cls,421,9,normal,{cooldown:1,buffCooldown_0:0,hp:10});
    const after=stateWithBuff(cls,421,10,{...normal,power_buffer:1},{cooldown:1,buffCooldown_0:1,hp:10});
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(cls,421),{branch:0,locked:false,
        levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"})).toBe(true);

    const decay={...normal,power_buffer:0};
    const decayBefore=stateWithBuff(cls,422,9,decay,{cooldown:1,buffCooldown_0:0,hp:10});
    const nextPower=Math.fround(0.5-Math.fround(0.5*0.05)*Math.pow(Math.fround(10/20),2));
    const decayAfter=stateWithBuff(cls,422,10,{...decay,power:nextPower},{cooldown:1,buffCooldown_0:1,hp:10});
    expect(isValidNativeHeroBuffTick(JSON.stringify(decayBefore),JSON.stringify(decayBefore),
      JSON.stringify(decayAfter),tick(cls,422),{branch:0,locked:false,
        levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"})).toBe(true);

    const berserking={...normal,state:"BERSERK",shielding:5};
    const dangerousBefore=stateWithBuff(cls,423,9,berserking,{cooldown:1,buffCooldown_0:0,hp:10,shielding:5});
    const dangerousAfter=stateWithBuff(cls,423,10,{...berserking,shielding:4},{
      cooldown:1,buffCooldown_0:1,hp:10,shielding:4
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(dangerousBefore),JSON.stringify(dangerousBefore),
      JSON.stringify(dangerousAfter),tick(cls,423),{branch:0,locked:false,
        levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"})).toBe(false);
  });

  it("rejects background Levitation expiry because native detach occupies the Hero cell",()=>{
    const hunger=buffs+"Hunger";
    const levitation=buffs+"Levitation";
    const levitationRow=JSON.stringify({buff:{__className:levitation,id:88,time:9}});
    const previous=stateWithBuff(hunger,12,9,{level:200,partialDamage:0},{
      cooldown:2,buffCooldown_0:1,buffCount:2,buff_1:levitationRow,buffCooldown_1:1
    });
    const before=stateWithBuff(hunger,12,9,{level:200,partialDamage:0},{
      cooldown:1,buffCooldown_0:0,buffCount:1
    });
    const after=stateWithBuff(hunger,12,10,{level:201,partialDamage:0},{
      cooldown:1,buffCooldown_0:1
    });
    expect(isValidNativeHeroBuffTick(JSON.stringify(previous),JSON.stringify(before),
      JSON.stringify(after),tick(hunger,12))).toBe(false);
  });

});

describe("Native alchemy transaction validation", () => {
  const sourceClass="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
  const outputClass="com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfIdentify";
  const row=(id:string,cls=sourceClass,quantity=1,stackable=false)=>({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,stackable,equipped:false,
    serializedBundle:"alchemy-item:"+id+":q="+quantity
  });
  const hero=(items:any[],energy=5,extra:Record<string,any>={})=>({
    hp:10,ht:10,pos:9,shielding:0,gold:0,alchemyEnergy:energy,inventoryBundle:"inventory-before",
    inventoryItemsJson:JSON.stringify(items),quickslotsJson:"[]",buffCount:0,...extra
  });
  const heapItem=(id:string,cls=outputClass,quantity=1,stackable=false)=>({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,stackable,
    serializedBundle:"alchemy-item:"+id+":q="+quantity
  });
  const heap=(id:string,pos:number,items:any[])=>({
    heapId:id,pos,type:"HEAP",seen:false,haunted:false,hidden:false,autoExplored:false,items
  });
  const details=(extra:Record<string,any>={})=>({
    from:9,to:9,targetPos:9,depth:4,branch:0,engineActionCost:0,
    alchemyEnergyBefore:5,alchemyEnergyAfter:3,
    ingredients:[{itemId:"alchemy-source-001",itemClass:sourceClass,sourceQuantityBefore:2,consumedQuantity:1,stackable:false}],
    resultItemId:"alchemy-result-001",resultItemClass:outputClass,resultQuantity:1,resultStackable:false,
    resultLocation:"INVENTORY",resultHeapId:"",...extra
  });
  it("checks ownership, depth and non-increasing energy",()=>{
    const before=JSON.stringify(hero([row("alchemy-source-001",sourceClass,2)]));
    const level={depth:4,branch:0,locked:false,heaps:[]};
    expect(isValidNativeAlchemyIntent(level,details(),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
    expect(isValidNativeAlchemyIntent(level,details({ingredients:[{itemId:"alchemy-forged-001",itemClass:sourceClass,sourceQuantityBefore:2,consumedQuantity:1,stackable:false}]}),
      4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeAlchemyIntent(level,details({alchemyEnergyAfter:6}),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
  });
  it("rejects unsupported branches, locked floors, and duplicate source identities",()=>{
    const before=JSON.stringify(hero([row("alchemy-source-001",sourceClass,2)]));
    const data=details();
    expect(isValidNativeAlchemyIntent({depth:4,branch:1,locked:false,heaps:[]},data,4,
      "player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeAlchemyIntent({depth:4,branch:0,locked:true,heaps:[]},data,4,
      "player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeAlchemyIntent({depth:4,branch:0,locked:false,heaps:[]},
      details({ingredients:[...data.ingredients,...data.ingredients]}),4,
      "player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
  });
  it("requires the exact ingredient decrement and one inventory output",()=>{
    const before=JSON.stringify(hero([row("alchemy-source-001",sourceClass,2)]));
    const after=JSON.stringify(hero([row("alchemy-source-001",sourceClass,1),row("alchemy-result-001",outputClass)],3,
      {inventoryBundle:"inventory-after"}));
    const data=details(),accepted={...data,actionType:"ALCHEMY"};
    expect(isValidNativeAlchemyInventoryMutation(before,after,data,accepted)).toBe(true);
    expect(isValidNativeAlchemyInventoryMutation(before,JSON.stringify(hero([
      row("alchemy-source-001",sourceClass,1),row("alchemy-result-001",outputClass),row("alchemy-forged-001")
    ],3,{inventoryBundle:"inventory-after"})),data,accepted)).toBe(false);
    expect(isValidNativeAlchemyInventoryMutation(before,JSON.stringify(hero([
      row("alchemy-source-001",sourceClass,0),row("alchemy-result-001",outputClass)
    ],3,{inventoryBundle:"inventory-after"})),data,accepted)).toBe(false);
  });
  it("allows output to land only on the exact player heap",()=>{
    const before=JSON.stringify(hero([row("alchemy-source-001",sourceClass,2)]));
    const after=JSON.stringify(hero([row("alchemy-source-001",sourceClass,1)],3,{inventoryBundle:"inventory-after"}));
    const data=details({resultLocation:"HEAP",resultHeapId:"alchemy-floor-001"}),accepted={...data,actionType:"ALCHEMY"};
    expect(isValidNativeAlchemyInventoryMutation(before,after,data,accepted)).toBe(true);
    expect(isValidNativeAlchemyHeapMutation([], [heap("alchemy-floor-001",9,[heapItem("alchemy-result-001")])],9,data,accepted)).toBe(true);
    expect(isValidNativeAlchemyHeapMutation([], [heap("other-floor-001",9,[heapItem("alchemy-result-001")])],9,data,accepted)).toBe(false);
  });
});



describe("Stable item-instance claim idempotency", () => {
  it("allows a retry only for the identical player and request",()=>{
    expect(isNativeLootClaimConflict(null,"player-a","request-1")).toBe(false);
    expect(isNativeLootClaimConflict(null,"","request-1")).toBe(true);
    expect(isNativeLootClaimConflict(null,"player-a","")).toBe(true);
    const claim={claimed_by:"player-a",request_id:"request-1"};
    expect(isNativeLootClaimConflict(claim,"player-a","request-1")).toBe(false);
    expect(isNativeLootClaimConflict(claim,"player-b","request-1")).toBe(true);
    expect(isNativeLootClaimConflict(claim,"player-a","request-2")).toBe(true);
    expect(isNativeLootClaimConflict(claim,"","request-1")).toBe(true);
    expect(isNativeLootClaimConflict(claim,"player-a","")).toBe(true);
  });
});



describe("Strict stable floor item and heap identities", () => {
  const item = (itemId:string, serializedBundle = "native-item-bundle:" + itemId) => ({
    itemId, className:"com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfIdentify",
    quantity:1, level:0, cursed:false, cursedKnown:false, stackable:true, serializedBundle
  });
  const heap = (heapId:string, pos:number, items:any[]) => ({
    heapId, pos, type:"HEAP", seen:false, haunted:false, hidden:false, autoExplored:false, items
  });
  it("accepts complete distinct IDs and rejects missing, malformed, or duplicate IDs", () => {
    expect(isValidStableMultiplayerId("stable-item-0001")).toBe(true);
    expect(isValidStableMultiplayerId("bad/id")).toBe(false);
    expect(isValidNativeFloorItemIdentitySet([heap("stable-heap-0001",9,[item("stable-item-0001")])])).toBe(true);
    expect(isValidNativeFloorItemIdentitySet([heap("",9,[item("stable-item-0001")])])).toBe(false);
    expect(isValidNativeFloorItemIdentitySet([heap("stable-heap-0001",9,[item("")])])).toBe(false);
    expect(isValidNativeFloorItemIdentitySet([
      heap("stable-heap-0001",9,[item("stable-item-0001")]),
      heap("stable-heap-0001",10,[item("stable-item-0002")])
    ])).toBe(false);
    expect(isValidNativeFloorItemIdentitySet([
      heap("stable-heap-0001",9,[item("stable-item-0001")]),
      heap("stable-heap-0002",10,[item("stable-item-0001")])
    ])).toBe(false);
    expect(isValidNativeFloorItemIdentitySet([
      heap("stable-heap-0001",9,[item("stable-item-0001","bundle-without-this-id")])
    ])).toBe(false);
  });
});

describe("Atomic stable item claims scoped by room, depth, branch, heap, and item", () => {
  class FakeClaimSql {
    rows = new Map<string,{claimed_by:string;request_id:string}>();
    exec(query:string,...bindings:any[]):any {
      const key=nativeLootClaimScopeKey(Number(bindings[0]),Number(bindings[1]),String(bindings[2]),String(bindings[3]));
      if(query.includes("INSERT OR IGNORE INTO claimed_item_instances")) {
        if(key && !this.rows.has(key)) this.rows.set(key,{claimed_by:String(bindings[4]),request_id:String(bindings[5])});
        return {toArray:()=>[]};
      }
      if(query.includes("SELECT claimed_by,request_id FROM claimed_item_instances")) {
        const row=key ? this.rows.get(key) : undefined;
        return {toArray:()=>row ? [{...row}] : []};
      }
      throw new Error("Unexpected SQL in claim test: "+query);
    }
  }
  const storage={transactionSync:<T>(callback:()=>T):T=>callback()};
  const reserve=(sql:FakeClaimSql,depth:number,branch:number,player:string,request:string)=>
    reserveNativeLootClaim(storage,sql,depth,branch,"stable-heap-0001","stable-item-0001",player,request);

  it("accepts only an exact owner/request retry and rejects competing claims",()=>{
    const sql=new FakeClaimSql();
    expect(reserve(sql,4,0,"player-a","request-1")).toBe(true);
    expect(reserve(sql,4,0,"player-a","request-1")).toBe(true);
    expect(reserve(sql,4,0,"player-b","request-1")).toBe(false);
    expect(reserve(sql,4,0,"player-a","request-2")).toBe(false);
  });
  it("does not collide across depth, branch, or separate room databases",()=>{
    const firstRoom=new FakeClaimSql(),secondRoom=new FakeClaimSql();
    expect(nativeLootClaimScopeKey(4,0,"stable-heap-0001","stable-item-0001"))
      .not.toBe(nativeLootClaimScopeKey(5,0,"stable-heap-0001","stable-item-0001"));
    expect(nativeLootClaimScopeKey(4,0,"stable-heap-0001","stable-item-0001"))
      .not.toBe(nativeLootClaimScopeKey(4,1,"stable-heap-0001","stable-item-0001"));
    expect(reserve(firstRoom,4,0,"player-a","request-1")).toBe(true);
    expect(reserve(firstRoom,5,0,"player-b","request-2")).toBe(true);
    expect(reserve(firstRoom,4,1,"player-b","request-3")).toBe(true);
    expect(reserve(secondRoom,4,0,"player-b","request-4")).toBe(true);
  });
  it("admits exactly one of two competing same-scope requests",async()=>{
    const sql=new FakeClaimSql();
    const results=await Promise.all([
      Promise.resolve().then(()=>reserve(sql,4,0,"player-a","request-1")),
      Promise.resolve().then(()=>reserve(sql,4,0,"player-b","request-2"))
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("detects legacy branch-blind claim schemas",()=>{
    const legacy=[{name:"depth",pk:1},{name:"heap_id",pk:2},{name:"item_id",pk:3},{name:"claimed_by",pk:0},{name:"request_id",pk:0}];
    const branchBlind=[{name:"depth",pk:1},{name:"branch",notnull:1,dflt_value:0,pk:0},{name:"heap_id",pk:2},{name:"item_id",pk:3}];
    const current=[{name:"depth",pk:1},{name:"branch",notnull:1,dflt_value:0,pk:2},{name:"heap_id",pk:3},{name:"item_id",pk:4}];
    expect(isNativeLootClaimSchemaCurrent(legacy)).toBe(false);
    expect(isNativeLootClaimSchemaCurrent(branchBlind)).toBe(false);
    expect(isNativeLootClaimSchemaCurrent(current)).toBe(true);
  });
});


describe("Partial stack DROP transactions", () => {
  const cls = "com.shatteredpixel.shatteredpixeldungeon.items.ScrollOfIdentify";
  const row = (id:string, quantity:number) => ({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,stackable:true,equipped:false,
    serializedBundle:"native-stack:"+id+":q="+quantity
  });
  const hero = (items:any[], slots:any[] = []) => JSON.stringify({
    hp:10,ht:10,pos:9,shielding:0,gold:0,inventoryBundle:"inventory-state",
    inventoryItemsJson:JSON.stringify(items),quickslotsJson:JSON.stringify(slots)
  });
  const heapItem = (id:string, quantity:number) => ({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,stackable:true,
    serializedBundle:"native-stack:"+id+":q="+quantity
  });
  const heap = (heapId:string,pos:number,items:any[]) => ({
    heapId,pos,type:"HEAP",seen:false,haunted:false,hidden:false,autoExplored:false,items
  });
  const details = (extra:Record<string,any> = {}) => ({
    from:9,to:9,targetPos:9,depth:4,branch:0,engineActionCost:1,
    heapId:"stable-heap-001",itemId:"stable-source-stack-001",resultItemId:"stable-floor-stack-001",
    itemClass:cls,expectedQuantity:2,sourceQuantityBefore:5,stackable:true,...extra
  });

  it("accepts only the exact partial quantity and preserves the source remainder and quickslot",()=>{
    const before = hero([row("stable-source-stack-001",5)], [{
      slot:0,itemId:"stable-source-stack-001",className:cls,quantity:5,
      serializedBundle:"native-stack:stable-source-stack-001:q=5"
    }]);
    const after = hero([row("stable-source-stack-001",3)], [{
      slot:0,itemId:"stable-source-stack-001",className:cls,quantity:3,
      serializedBundle:"native-stack:stable-source-stack-001:q=3"
    }]);
    const d=details(), accepted={...d,actionType:"DROP"};
    const level={depth:4,branch:0,locked:false,heaps:[]};
    expect(isValidNativeDropIntent(level,d,4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
    expect(isValidNativeDropInventoryMutation(before,after,d)).toBe(true);
    expect(isValidNativeDropInventoryMutation(before,hero([row("stable-source-stack-001",2)],[{
      slot:0,itemId:"stable-source-stack-001",className:cls,quantity:2,
      serializedBundle:"native-stack:stable-source-stack-001:q=2"
    }]),d)).toBe(false);
    expect(isValidNativeDropHeapMutation([],[
      heap("stable-heap-001",9,[heapItem("stable-floor-stack-001",2)])
    ],9,d,accepted)).toBe(true);
  });

  it("accepts a partial drop merged into exactly one compatible destination stack",()=>{
    const before=hero([row("stable-source-stack-001",5)]);
    const after=hero([row("stable-source-stack-001",3)]);
    const d=details({resultItemId:"stable-target-stack-001"});
    const prior=heap("stable-heap-001",9,[heapItem("stable-target-stack-001",4)]);
    const next=heap("stable-heap-001",9,[heapItem("stable-target-stack-001",6)]);
    const accepted={...d,actionType:"DROP"};
    expect(isValidNativeDropInventoryMutation(before,after,d)).toBe(true);
    expect(isValidNativeDropHeapMutation([prior],[next],9,d,accepted)).toBe(true);
    expect(isValidNativeDropHeapMutation([prior],[
      heap("stable-heap-001",9,[heapItem("stable-target-stack-001",7)])
    ],9,d,accepted)).toBe(false);
  });

  it("preserves the original item identity on a full-stack move and rejects unrelated heap changes",()=>{
    const sourceId="stable-source-whole-001";
    const before=hero([row(sourceId,5)]);
    const after=hero([]);
    const d=details({itemId:sourceId,resultItemId:sourceId,expectedQuantity:5,sourceQuantityBefore:5});
    const accepted={...d,actionType:"DROP"};
    const landed=heap("stable-heap-001",9,[heapItem(sourceId,5)]);
    expect(isValidNativeDropInventoryMutation(before,after,d)).toBe(true);
    expect(isValidNativeDropHeapMutation([],[landed],9,d,accepted)).toBe(true);
    const unrelated=heap("unrelated-heap-002",20,[heapItem("other-floor-item-002",1)]);
    expect(isValidNativeDropHeapMutation([],[landed,unrelated],9,d,accepted)).toBe(false);
  });

  it("rejects a replay against the reduced source and preserves other items in the same cell",()=>{
    const before=hero([row("stable-source-stack-001",5)]);
    const after=hero([row("stable-source-stack-001",3)]);
    const d=details({resultItemId:"stable-floor-stack-001"});
    const targetBefore=heap("stable-heap-001",9,[heapItem("stable-existing-item-003",4)]);
    const targetAfter=heap("stable-heap-001",9,[
      heapItem("stable-floor-stack-001",2),heapItem("stable-existing-item-003",4)
    ]);
    const accepted={...d,actionType:"DROP"};
    expect(isValidNativeDropIntent({depth:4,branch:0,locked:false,heaps:[targetBefore]},
      d,4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
    expect(isValidNativeDropIntent({depth:4,branch:0,locked:false,heaps:[targetBefore]},
      d,4,"player-001",{pos:9,state:"ALIVE"},after)).toBe(false);
    expect(isValidNativeDropIntent({depth:4,branch:0,locked:false,heaps:[
      targetBefore,heap("stable-second-heap-004",9,[heapItem("stable-second-item-005",1)])
    ]},d,4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeDropHeapMutation([targetBefore],[targetAfter],9,d,accepted)).toBe(true);
    expect(isValidNativeDropHeapMutation([targetBefore],[
      heap("stable-heap-001",9,[heapItem("stable-floor-stack-001",2)])
    ],9,d,accepted)).toBe(false);
  });
});

describe("Native missile throw transaction validation", () => {
  const cls="com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.Dart";
  const row=(id:string,quantity=1)=>({itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,
    stackable:true,equipped:false,serializedBundle:"native-missile-bundle:"+id+":q="+quantity});
  const hero=(items:any[],extra:Record<string,any>={})=>({
    hp:10,ht:10,pos:9,shielding:0,gold:0,inventoryBundle:"inventory-before",
    inventoryItemsJson:JSON.stringify(items),quickslotsJson:"[]",...extra
  });
  const heapItem=(id:string,quantity=1)=>({itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,
    stackable:true,serializedBundle:"native-missile-bundle:"+id+":q="+quantity});
  const heap=(id:string,pos:number,items:any[])=>({heapId:id,pos,type:"HEAP",seen:false,haunted:false,hidden:false,autoExplored:false,items});
  const intent=(extra:Record<string,any>={})=>({from:9,to:10,targetPos:10,depth:4,branch:0,engineActionCost:1,
    heapId:"stable-heap-001",itemId:"stable-source-001",resultItemId:"stable-source-001",itemClass:cls,
    expectedQuantity:1,sourceQuantityBefore:1,stackable:true,...extra});
  it("validates ownership, floor, range, and destination identity",()=>{
    const before=JSON.stringify(hero([row("stable-source-001")]));
    const level={depth:4,branch:0,locked:false,width:8,height:8,tiles:[{pos:10,solid:false}],heaps:[]};
    expect(isValidNativeThrowIntent(level,intent(),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
    expect(isValidNativeThrowIntent(level,intent({itemId:"stable-forged-001"}),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeThrowIntent(level,intent({targetPos:30,to:30}),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeThrowIntent(level,intent({
      itemClass:"com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing"
    }),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
  });
  it("commits a full missile only when the same instance leaves inventory and appears in the heap",()=>{
    const before=JSON.stringify(hero([row("stable-source-001"),row("stable-other-001")]));
    const after=JSON.stringify(hero([row("stable-other-001")],{inventoryBundle:"inventory-after"}));
    const d=intent(),accepted={...d,actionType:"THROW"};
    expect(isValidNativeThrowInventoryMutation(before,after,d)).toBe(true);
    expect(isValidNativeThrowInventoryMutation(before,before,d)).toBe(false);
    expect(isValidNativeThrowHeapMutation([], [heap("stable-heap-001",10,[heapItem("stable-source-001")])],10,d,accepted)).toBe(true);
    expect(isValidNativeThrowHeapMutation([], [heap("different-heap-001",10,[heapItem("stable-source-001")])],10,d,accepted)).toBe(false);
  });
  it("accepts a one-unit stack decrement and rejects a larger decrement",()=>{
    const before=JSON.stringify(hero([row("stable-source-001",4)]));
    const after=JSON.stringify(hero([row("stable-source-001",3)],{inventoryBundle:"inventory-after"}));
    const d=intent({sourceQuantityBefore:4,resultItemId:"stable-projectile-001"}),accepted={...d,actionType:"THROW"};
    expect(isValidNativeThrowInventoryMutation(before,after,d)).toBe(true);
    expect(isValidNativeThrowInventoryMutation(before,JSON.stringify(hero([row("stable-source-001",2)],{inventoryBundle:"inventory-after"})),d)).toBe(false);
    expect(isValidNativeThrowHeapMutation([], [heap("stable-heap-001",10,[heapItem("stable-projectile-001")])],10,d,accepted)).toBe(true);
  });

  it("keeps the quickslot bound to the exact remaining missile quantity",()=>{
    const priorSlot={slot:0,itemId:"stable-source-001",className:cls,quantity:4,
      serializedBundle:"native-missile-bundle:stable-source-001:q=4"};
    const nextSlot={...priorSlot,quantity:3,
      serializedBundle:"native-missile-bundle:stable-source-001:q=3"};
    const before=JSON.stringify(hero([row("stable-source-001",4)],{
      quickslotsJson:JSON.stringify([priorSlot])
    }));
    const after=JSON.stringify(hero([row("stable-source-001",3)],{
      inventoryBundle:"inventory-after",quickslotsJson:JSON.stringify([nextSlot])
    }));
    const d=intent({sourceQuantityBefore:4,resultItemId:"stable-projectile-001"});
    expect(isValidNativeThrowInventoryMutation(before,after,d)).toBe(true);
    expect(isValidNativeThrowInventoryMutation(before,JSON.stringify(hero([row("stable-source-001",3)],{
      inventoryBundle:"inventory-after",quickslotsJson:JSON.stringify([priorSlot])
    })),d)).toBe(false);
  });
});


describe("Thrown missile floor impact reconciliation", () => {
  const cls="com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.Dart";
  const item=(id:string,quantity=1,serializedBundle?:string)=>({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,stackable:true,equipped:false,
    serializedBundle:serializedBundle || "native-missile-bundle:"+id+":q="+quantity
  });
  const heap=(id:string,pos:number,items:any[])=>({
    heapId:id,pos,type:"HEAP",seen:false,haunted:false,hidden:false,autoExplored:false,items
  });
  const state=(items:any[])=>JSON.stringify({
    hp:10,ht:10,pos:9,shielding:0,gold:0,inventoryBundle:"inventory-before",
    inventoryItemsJson:JSON.stringify(items),quickslotsJson:"[]"
  });
  const details=(extra:Record<string,any>={})=>({
    from:9,to:10,targetPos:10,depth:4,branch:0,engineActionCost:1,projectileImpact:true,
    heapId:"stable-heap-001",itemId:"stable-source-001",projectileItemId:"stable-projectile-001",
    resultItemId:"stable-projectile-001",itemClass:cls,expectedQuantity:1,sourceQuantityBefore:4,stackable:true,
    ...extra
  });
  const level=(heaps:any[]=[])=>({
    depth:4,branch:0,locked:false,width:8,height:8,tiles:[{pos:10,solid:false}],heaps
  });

  it("validates the exact source item, split projectile identity, and intended target cell",()=>{
    const before=state([item("stable-source-001",4)]);
    const d=details();
    expect(isValidNativeProjectileCombatIntent(level(),d,4,"player-001",{pos:9,state:"ALIVE"},before,9,10)).toBe(true);
    expect(isValidNativeProjectileCombatIntent(level(),{...d,projectileItemId:"stable-source-001"},4,
      "player-001",{pos:9,state:"ALIVE"},before,9,10)).toBe(false);
    expect(isValidNativeProjectileCombatIntent(level(),d,4,"player-001",{pos:9,state:"ALIVE"},before,9,11)).toBe(false);
    expect(isValidNativeProjectileCombatIntent(level([heap("prior-heap-003",20,[item("stable-projectile-001")])]),
      d,4,"player-001",{pos:9,state:"ALIVE"},before,9,10)).toBe(false);
  });

  it("accepts a landed missile but rejects replayed or unrelated heap edits",()=>{
    const d=details(), accepted={...d,actionType:"THROW"};
    const landed=[heap("stable-heap-001",10,[item("stable-projectile-001",1)])];
    expect(isValidNativeProjectileHeapResult([],landed,10,d)).toBe(true);
    expect(isValidNativeThrowHeapMutation([],landed,10,d,accepted)).toBe(true);
    const targetBefore=[heap("stable-heap-001",10,[item("stable-existing-item-003",2)])];
    const targetAfter=[heap("stable-heap-001",10,[item("stable-projectile-001"),item("stable-existing-item-003",2)])];
    expect(isValidNativeProjectileHeapResult(targetBefore,targetAfter,10,d)).toBe(true);
    expect(isValidNativeProjectileCombatResult(targetBefore,{
      projectileMutation:d,projectileOutcome:"HEAP",projectileHeaps:targetAfter
    },10,[],64)).toBe(true);
    expect(isValidNativeProjectileCombatResult([],{
      projectileMutation:d,projectileOutcome:"HEAP",projectileHeaps:landed
    },10,[],64)).toBe(true);
    expect(isValidNativeProjectileCombatResult([],{
      projectileMutation:d,projectileOutcome:"HEAP",
      projectileHeaps:[heap("stable-heap-001",10,[item("stable-projectile-001"),item("unrelated-floor-item-002")])]
    },10,[],64)).toBe(false);
  });

  it("accepts a native missile durability merge only when the bundle changes",()=>{
    const d=details({resultItemId:"stable-target-stack-001"});
    const prior=[heap("stable-heap-001",10,[item("stable-target-stack-001",4)])];
    const sameQuantity=[heap("stable-heap-001",10,[item("stable-target-stack-001",4,
      "native-missile-bundle:stable-target-stack-001:durability=75")])];
    const reduced=[heap("stable-heap-001",10,[item("stable-target-stack-001",3,
      "native-missile-bundle:stable-target-stack-001:durability=75")])];
    const accepted={...d,actionType:"THROW"};
    expect(isValidNativeProjectileHeapResult(prior,sameQuantity,10,d)).toBe(true);
    expect(isValidNativeThrowHeapMutation(prior,reduced,10,d,accepted)).toBe(true);
    const unchangedBundle=[heap("stable-heap-001",10,[item("stable-target-stack-001",4)])];
    expect(isValidNativeProjectileHeapResult(prior,unchangedBundle,10,d)).toBe(false);
    expect(isValidNativeProjectileHeapResult(prior,[heap("stable-heap-001",10,[item("stable-target-stack-001",2,
      "native-missile-bundle:stable-target-stack-001:durability=75")])],10,d)).toBe(false);
  });

  it("distinguishes missiles that land, stick to PinCushion, or are consumed",()=>{
    const d=details();
    expect(isValidNativeProjectileCombatResult([],{
      projectileMutation:d,projectileOutcome:"PIN_CUSHION",targetBuffs:'{"stuck":"stable-projectile-001"}'
    },10,[],64)).toBe(true);
    expect(isValidNativeProjectileCombatResult([],{
      projectileMutation:d,projectileOutcome:"CONSUMED",targetBuffs:"[]"
    },10,[],64)).toBe(true);
    expect(isValidNativeProjectileCombatResult([],{
      projectileMutation:d,projectileOutcome:"CONSUMED",
      targetBuffs:'{"stuck":"stable-projectile-001"}'
    },10,[],64)).toBe(false);
  });
});

describe("Native mutation action-cost binding", () => {
  const state = (cooldown:number) => JSON.stringify({cooldown});

  it("requires the accepted world-time cost to equal the clamped native Hero cooldown delta", () => {
    expect(isValidNativeMutationActionCost(state(0), state(1), 1)).toBe(true);
    expect(isValidNativeMutationActionCost(state(2.25), state(2.5), 0.25)).toBe(true);
    expect(isValidNativeMutationActionCost(state(2), state(2), 0)).toBe(true);
    expect(isValidNativeMutationActionCost(state(2), state(1), 0)).toBe(true);
    expect(isValidNativeMutationActionCost(state(0), state(20), 10)).toBe(true);
  });

  it("rejects a free or overpriced action when its native cooldown says otherwise", () => {
    expect(isValidNativeMutationActionCost(state(0), state(1), 0)).toBe(false);
    expect(isValidNativeMutationActionCost(state(0), state(1), 2)).toBe(false);
    expect(isValidNativeMutationActionCost(state(0), state(1), 10)).toBe(false);
    expect(isValidNativeMutationActionCost(state(0), state(1), 11)).toBe(false);
    expect(isValidNativeMutationActionCost('{"cooldown":0}', '{"notCooldown":1}', 1)).toBe(false);
    expect(isValidNativeMutationActionCost("not-json", state(1), 1)).toBe(false);
  });
});

describe("Native item consumption transaction validation", () => {
  const potion = "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
  const food = "com.shatteredpixel.shatteredpixeldungeon.items.food.Food";
  const row = (id:string, cls=potion, quantity=1, stackable=false, serializedBundle?:string) => ({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,stackable,equipped:false,
    serializedBundle:serializedBundle || ("native-item-bundle:"+id+":quantity="+quantity)
  });
  const defaultHungerBundle = JSON.stringify({buff:{
    __className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger",level:55,partialDamage:0
  }});
  const defaultPotionStatus = () => JSON.stringify({
    PotionOfHealing_label:"CRIMSON",PotionOfHealing_known:true,
    PotionOfHaste_label:"AMBER",PotionOfHaste_known:true,
    PotionOfInvisibility_label:"TEAL",PotionOfInvisibility_known:true,
    PotionOfLevitation_label:"SILVER",PotionOfLevitation_known:true,
    PotionOfStrength_label:"GOLD",PotionOfStrength_known:true,
    PotionOfPurity_label:"PURPLE",PotionOfPurity_known:true,
    PotionOfStamina_label:"IVORY",PotionOfStamina_known:true
  });
  const defaultScrollStatus = () => JSON.stringify({
    ScrollOfRecharging_label:"KAUNAN",ScrollOfRecharging_known:true,
    ScrollOfIdentify_label:"SOWILO",ScrollOfIdentify_known:true
  });
  const hero = (items:any[], extra:Record<string,any>={}) => ({
    hp:10,ht:10,pos:9,shielding:0,gold:0,inventoryBundle:"inventory-before",
    combatBundle:JSON.stringify({STR:10,inventory:"inventory-before",items:"inventory-before",buffs:[],
      talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
    potionStatusBundle:defaultPotionStatus(),scrollStatusBundle:defaultScrollStatus(),
    buffCount:1,buff_0:defaultHungerBundle,buffCooldown_0:0,
    inventoryItemsJson:JSON.stringify(items),quickslotsJson:"[]",...extra
  });
  const intent = (id:string, cls=potion, action="DRINK", quantity=1, stackable=false) => ({
    from:9,to:9,targetPos:9,depth:4,branch:0,engineActionCost:1,
    itemId:id,itemClass:cls,itemAction:action,expectedQuantity:1,sourceQuantityBefore:quantity,stackable
  });
  it("accepts only one owned DRINK/EAT intent at the authenticated hero's cell",()=>{
    const before=JSON.stringify(hero([row("native-potion-001",potion)]));
    const level={depth:4,branch:0,locked:false,heaps:[]};
    expect(isValidNativeUseItemIntent(level,intent("native-potion-001"),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
    expect(isValidNativeUseItemIntent(level,intent("native-forged-001"),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeUseItemIntent(level,intent("native-potion-001",potion,"EAT"),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeUseItemIntent(level,intent("native-food-001",food,"EAT"),4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeUseItemIntent(level,intent("native-potion-001",
      "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste","DRINK"),4,
      "player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    const foodBefore=JSON.stringify(hero([row("native-food-001",food,1,true)]));
    expect(isValidNativeUseItemIntent(level,intent("native-food-001",food,"EAT",1,true),4,
      "player-001",{pos:9,state:"ALIVE"},foodBefore)).toBe(true);
    expect(isValidNativeUseItemIntent(level,intent("native-small-ration-001",
      "com.shatteredpixel.shatteredpixeldungeon.items.food.SmallRation","EAT",1,true),4,
      "player-001",{pos:9,state:"ALIVE"},JSON.stringify(hero([row("native-small-ration-001",
        "com.shatteredpixel.shatteredpixeldungeon.items.food.SmallRation",1,true)])))).toBe(true);
    expect(isValidNativeUseItemIntent(level,intent("native-stewed-meat-001",
      "com.shatteredpixel.shatteredpixeldungeon.items.food.StewedMeat","EAT",1,true),4,
      "player-001",{pos:9,state:"ALIVE"},JSON.stringify(hero([row("native-stewed-meat-001",
        "com.shatteredpixel.shatteredpixeldungeon.items.food.StewedMeat",1,true)])))).toBe(true);
    expect(isValidNativeUseItemIntent(level,intent("native-chargrilled-meat-001",
      "com.shatteredpixel.shatteredpixeldungeon.items.food.ChargrilledMeat","EAT",1,true),4,
      "player-001",{pos:9,state:"ALIVE"},JSON.stringify(hero([row("native-chargrilled-meat-001",
        "com.shatteredpixel.shatteredpixeldungeon.items.food.ChargrilledMeat",1,true)])))).toBe(true);
    const purity="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfPurity";
    const stamina="com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfStamina";
    expect(isValidNativeUseItemIntent(level,intent("native-purity-001",purity),4,
      "player-001",{pos:9,state:"ALIVE"},JSON.stringify(hero([row("native-purity-001",purity)])))).toBe(true);
    expect(isValidNativeUseItemIntent(level,intent("native-stamina-001",stamina),4,
      "player-001",{pos:9,state:"ALIVE"},JSON.stringify(hero([row("native-stamina-001",stamina)])))).toBe(true);
    expect(isValidNativeUseItemIntent(level,intent("native-mystery-meat-001",
      "com.shatteredpixel.shatteredpixeldungeon.items.food.MysteryMeat","EAT",1,true),4,
      "player-001",{pos:9,state:"ALIVE"},JSON.stringify(hero([row("native-mystery-meat-001",
        "com.shatteredpixel.shatteredpixeldungeon.items.food.MysteryMeat",1,true)])))).toBe(false);
    expect(isValidNativeUseItemIntent(level,intent("native-meat-pie-001",
      "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie","EAT",1,true),4,
      "player-001",{pos:9,state:"ALIVE"},JSON.stringify(hero([row("native-meat-pie-001",
        "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie",1,true)])))).toBe(true);
  });
  it("rejects potion talent side effects before the native drink can be admitted",()=>{
    const level={depth:4,branch:0,locked:false,heaps:[]};
    const healing="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
    const haste="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste";
    const talentBundle=(tier1:Record<string,any>={},tier2:Record<string,any>={},
      tier3:Record<string,any>={},tier4:Record<string,any>={},replacements:Record<string,string>={})=>JSON.stringify({
        time:10,STR:10,inventory:"inventory-before",items:"inventory-before",buffs:[],
        talents_tier_1:tier1,talents_tier_2:tier2,talents_tier_3:tier3,talents_tier_4:tier4,replacements
      });
    const check=(id:string,cls:string,bundle:string)=>isValidNativeUseItemIntent(
      level,intent(id,cls,"DRINK"),4,"player-001",{pos:9,state:"ALIVE"},
      JSON.stringify(hero([row(id,cls)],{cooldown:0,combatBundle:bundle}))
    );
    expect(check("native-potion-safe-001",healing,talentBundle())).toBe(true);
    expect(check("native-potion-safe-haste-001",haste,talentBundle())).toBe(true);
    expect(check("native-liquid-willpower-001",healing,
      talentBundle({}, {LIQUID_WILLPOWER:1}))).toBe(false);
    expect(check("native-liquid-nature-001",haste,
      talentBundle({}, {}, {LIQUID_NATURE:2}))).toBe(false);
    expect(check("native-liquid-agility-001",healing,
      talentBundle({}, {}, {}, {LIQUID_AGILITY:1}))).toBe(false);
    expect(check("native-liquid-replacement-001",healing,
      talentBundle({}, {}, {}, {}, {OTHER_TALENT:"LIQUID_NATURE"}))).toBe(false);
    expect(check("native-liquid-missing-tiers-001",healing,
      JSON.stringify({time:10,STR:10,inventory:"inventory-before",items:"inventory-before",buffs:[],
        talents_tier_1:{},replacements:{}}))).toBe(false);
  });

  it("supports READ only for a safe native ScrollOfRecharging intent",()=>{
    const scroll="com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging";
    const identify="com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfIdentify";
    const level={depth:4,branch:0,locked:false,heaps:[]};
    const talentBundle=(overrides:Record<string,any>={})=>JSON.stringify({
      time:10,STR:10,items:"inventory-before",
      talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{},...overrides
    });
    const before=JSON.stringify(hero([row("native-scroll-recharging-001",scroll,1,true)],{
      cooldown:0,combatBundle:talentBundle()
    }));
    const read=intent("native-scroll-recharging-001",scroll,"READ",1,true);
    expect(isValidNativeUseItemIntent(level,read,4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
    expect(isValidNativeUseItemIntent(level,intent("native-scroll-recharging-001",identify,"READ",1,true),
      4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    expect(isValidNativeUseItemIntent(level,intent("native-scroll-recharging-001",scroll,"DRINK",1,true),
      4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(false);
    const talentBefore=JSON.stringify(hero([row("native-scroll-recharging-talent-001",scroll,1,true)],{
      cooldown:0,combatBundle:talentBundle({talents_tier_2:{INSCRIBED_STEALTH:1}})
    }));
    expect(isValidNativeUseItemIntent(level,intent("native-scroll-recharging-talent-001",scroll,"READ",1,true),
      4,"player-001",{pos:9,state:"ALIVE"},talentBefore)).toBe(false);
    const invisibleBefore=JSON.stringify(hero([row("native-scroll-recharging-invisible-001",scroll,1,true)],{
      cooldown:0,combatBundle:talentBundle(),
      buffCount:2,buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility",time:25,id:95}}),
      buffCooldown_1:25
    }));
    expect(isValidNativeUseItemIntent(level,intent("native-scroll-recharging-invisible-001",scroll,"READ",1,true),
      4,"player-001",{pos:9,state:"ALIVE"},invisibleBefore)).toBe(false);
  });

  it("allows only the consumed Potion or Scroll class to become identified",()=>{
    const strength="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength";
    const scroll="com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging";
    const potionState=(known:boolean)=>JSON.stringify({
      PotionOfStrength_label:"GOLD",PotionOfStrength_known:known,
      PotionOfHealing_label:"CRIMSON",PotionOfHealing_known:true
    });
    const scrollState=(known:boolean,label="KAUNAN")=>JSON.stringify({
      ScrollOfRecharging_label:label,ScrollOfRecharging_known:known,
      ScrollOfIdentify_label:"SOWILO",ScrollOfIdentify_known:false
    });
    const beforePotion=JSON.stringify(hero([row("native-status-potion-001",strength)],{
      cooldown:0,potionStatusBundle:potionState(false),
      combatBundle:JSON.stringify({time:10,STR:10,inventory:"inventory-before",items:"inventory-before",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    const afterPotion=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      potionStatusBundle:potionState(true),
      combatBundle:JSON.stringify({time:11,STR:11,inventory:"inventory-after",items:"inventory-after",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    expect(parseNativeItemStatusBundle(potionState(false))).not.toBeNull();
    expect(isValidNativeItemStatusMutation(JSON.parse(beforePotion),JSON.parse(afterPotion),"DRINK",strength)).toBe(true);
    expect(mergeNativeItemStatusState(beforePotion,afterPotion,"DRINK",strength)).toEqual({
      potionStatusBundle:potionState(true),scrollStatusBundle:defaultScrollStatus()
    });
    const potionData=intent("native-status-potion-001",strength,"DRINK");
    expect(isValidNativeUseItemMutation(beforePotion,afterPotion,potionData,{...potionData,actionType:"USE_ITEM"})).toBe(true);
    const forgedPotion=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      potionStatusBundle:JSON.stringify({PotionOfStrength_label:"GOLD",PotionOfStrength_known:true,
        PotionOfHealing_label:"CRIMSON",PotionOfHealing_known:false}),
      combatBundle:JSON.stringify({time:11,STR:11,inventory:"inventory-after",items:"inventory-after",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    expect(isValidNativeUseItemMutation(beforePotion,forgedPotion,potionData,{...potionData,actionType:"USE_ITEM"})).toBe(false);

    const purity="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfPurity";
    const stamina="com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfStamina";
    const exoticStatus=(purityKnown:boolean,hasteKnown:boolean)=>JSON.stringify({
      PotionOfPurity_label:"VIOLET",PotionOfPurity_known:purityKnown,
      PotionOfHaste_label:"AMBER",PotionOfHaste_known:hasteKnown,
      PotionOfHealing_label:"CRIMSON",PotionOfHealing_known:true,
      PotionOfStrength_label:"GOLD",PotionOfStrength_known:true
    });
    const statusBase={
      potionStatusBundle:exoticStatus(false,false),
      scrollStatusBundle:defaultScrollStatus()
    };
    const purityKnown={
      ...statusBase,
      potionStatusBundle:exoticStatus(true,false)
    };
    expect(isValidNativeItemStatusMutation(statusBase,purityKnown,"DRINK",purity)).toBe(true);
    expect(mergeNativeItemStatusState(statusBase,purityKnown,"DRINK",purity)).toEqual({
      potionStatusBundle:exoticStatus(true,false),scrollStatusBundle:defaultScrollStatus()
    });
    const wrongPurityTarget={
      ...statusBase,
      potionStatusBundle:exoticStatus(false,true)
    };
    expect(isValidNativeItemStatusMutation(statusBase,wrongPurityTarget,"DRINK",purity)).toBe(false);

    // Exotic PotionOfStamina identifies its regular base PotionOfHaste class.
    const staminaKnown={
      ...statusBase,
      potionStatusBundle:exoticStatus(false,true)
    };
    expect(isValidNativeItemStatusMutation(statusBase,staminaKnown,"DRINK",stamina)).toBe(true);
    expect(mergeNativeItemStatusState(statusBase,staminaKnown,"DRINK",stamina)).toEqual({
      potionStatusBundle:exoticStatus(false,true),scrollStatusBundle:defaultScrollStatus()
    });
    const wrongStaminaTarget={
      ...statusBase,
      potionStatusBundle:JSON.stringify({
        ...JSON.parse(exoticStatus(false,false)),
        PotionOfStamina_label:"IVORY",PotionOfStamina_known:true
      })
    };
    expect(isValidNativeItemStatusMutation(statusBase,wrongStaminaTarget,"DRINK",stamina)).toBe(false);

    const beforeScroll=JSON.stringify(hero([row("native-status-scroll-001",scroll,1,true)],{
      cooldown:0,scrollStatusBundle:scrollState(false),
      combatBundle:JSON.stringify({time:10,STR:10,inventory:"inventory-before",items:"inventory-before",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    const afterScroll=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      scrollStatusBundle:scrollState(true),buffCount:2,
      combatBundle:JSON.stringify({time:11,STR:10,inventory:"inventory-after",items:"inventory-after",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Recharging",time:40,id:96}}),
      buffCooldown_1:30
    }));
    expect(parseNativeItemStatusBundle(scrollState(false))).not.toBeNull();
    expect(isValidNativeItemStatusMutation(JSON.parse(beforeScroll),JSON.parse(afterScroll),"READ",scroll)).toBe(true);
    expect(mergeNativeItemStatusState(beforeScroll,afterScroll,"READ",scroll)).toEqual({
      potionStatusBundle:defaultPotionStatus(),scrollStatusBundle:scrollState(true)
    });
    const scrollData=intent("native-status-scroll-001",scroll,"READ",1,true);
    expect(isValidNativeUseItemMutation(beforeScroll,afterScroll,scrollData,{...scrollData,actionType:"USE_ITEM"})).toBe(true);
    const forgedLabel=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      scrollStatusBundle:scrollState(true,"FORGED"),buffCount:2,
      combatBundle:JSON.stringify({time:11,STR:10,inventory:"inventory-after",items:"inventory-after",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Recharging",time:40,id:96}}),
      buffCooldown_1:30
    }));
    expect(mergeNativeItemStatusState(beforeScroll,forgedLabel,"READ",scroll)).toBeNull();
    expect(isValidNativeUseItemMutation(beforeScroll,forgedLabel,scrollData,{...scrollData,actionType:"USE_ITEM"})).toBe(false);
  });

  it("validates the exact native ScrollOfRecharging buff and rejects inflated duration",()=>{
    const scroll="com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging";
    const recharging="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Recharging";
    const talentBundle=(time:string,items:string)=>JSON.stringify({
      time:time==="before"?10:11,STR:10,items,
      talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}
    });
    const id="native-scroll-recharging-002";
    const before=JSON.stringify(hero([row(id,scroll,1,true)],{
      cooldown:0,combatBundle:talentBundle("before","inventory-before")
    }));
    const data=intent(id,scroll,"READ",1,true),accepted={...data,actionType:"USE_ITEM"};
    const after=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:talentBundle("after","inventory-after"),buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:recharging,time:40,id:96}}),buffCooldown_1:30
    }));
    expect(isValidNativeUseItemMutation(before,after,data,accepted)).toBe(true);
    const inflated=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:talentBundle("after","inventory-after"),buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:recharging,time:55,id:96}}),buffCooldown_1:45
    }));
    expect(isValidNativeUseItemMutation(before,inflated,data,accepted)).toBe(false);
    expect(isValidNativeUseItemMutation(before,before,data,accepted)).toBe(false);
    const alreadyActive=JSON.stringify(hero([row(id,scroll,2,true)],{
      cooldown:0,combatBundle:talentBundle("before","inventory-before"),buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:recharging,time:15,id:97}}),buffCooldown_1:5
    }));
    const extended=JSON.stringify(hero([row(id,scroll,1,true)],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:talentBundle("after","inventory-after"),buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:recharging,time:45,id:97}}),buffCooldown_1:35
    }));
    const extendedData=intent(id,scroll,"READ",2,true),extendedAccepted={...extendedData,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(alreadyActive,extended,extendedData,extendedAccepted)).toBe(true);
  });

  it("requires the native Healing buff, one consumed source unit and no unrelated inventory or Gold change",()=>{
    const before=JSON.stringify(hero([row("native-potion-001"),row("native-other-001",food)]));
    const after=JSON.stringify(hero([row("native-other-001",food)],{
      inventoryBundle:"inventory-after",buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{
        __className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing",
        id:52,time:0,left:22,percent:0.25,flat:0,healing_limited:false
      }}),buffCooldown_1:0
    }));
    const d=intent("native-potion-001"),accepted={...d,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);
    expect(isValidNativeUseItemMutation(before,before,d,accepted)).toBe(false);
    expect(isValidNativeUseItemMutation(before,JSON.stringify(hero([row("native-other-001",food)],{gold:1,inventoryBundle:"inventory-after"})),d,accepted)).toBe(false);
    expect(isValidNativeUseItemMutation(before,JSON.stringify(hero([row("native-other-001",food),row("native-forged-001")],{inventoryBundle:"inventory-after"})),d,accepted)).toBe(false);
  });

  it("accepts only the native Hunger delta for plain Food and rejects injected buffs",()=>{
    const hunger="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger";
    const serialized=(className:string,fields:Record<string,any>={})=>JSON.stringify({buff:{__className:className,...fields}});
    const before=JSON.stringify(hero([row("native-food-plain-001",food,1,true)],{
      buffCount:1,buff_0:serialized(hunger,{level:55,partialDamage:0.25}),buffCooldown_0:0
    }));
    const after=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      buffCount:1,buff_0:serialized(hunger,{level:25,partialDamage:0.25}),buffCooldown_0:0
    }));
    const d=intent("native-food-plain-001",food,"EAT",1,true), accepted={...d,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);
    const forged=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      buffCount:2,buff_0:serialized(hunger,{level:25,partialDamage:0.25}),buffCooldown_0:0,
      buff_1:serialized("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste",{}),buffCooldown_1:5
    }));
    expect(isValidNativeUseItemMutation(before,forged,d,accepted)).toBe(false);
  });
  it("accepts the exact ChargrilledMeat Hunger recovery and rejects extra recovery",()=>{
    const hunger="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger";
    const chargrilled="com.shatteredpixel.shatteredpixeldungeon.items.food.ChargrilledMeat";
    const serialized=(className:string,fields:Record<string,any>={})=>JSON.stringify({buff:{__className:className,...fields}});
    const before=JSON.stringify(hero([row("native-chargrilled-energy-001",chargrilled,1,true)],{
      buffCount:1,buff_0:serialized(hunger,{level:220,partialDamage:0.25}),buffCooldown_0:0
    }));
    const validAfter=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      buffCount:1,buff_0:serialized(hunger,{level:70,partialDamage:0.25}),buffCooldown_0:0
    }));
    const tooMuchAfter=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      buffCount:1,buff_0:serialized(hunger,{level:69,partialDamage:0.25}),buffCooldown_0:0
    }));
    const data=intent("native-chargrilled-energy-001",chargrilled,"EAT",1,true);
    const accepted={...data,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,validAfter,data,accepted)).toBe(true);
    expect(isValidNativeUseItemMutation(before,tooMuchAfter,data,accepted)).toBe(false);
  });
  it("accepts exact MeatPie Hunger recovery and a native WellFed reset only",()=>{
    const hunger="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger";
    const wellFed="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.WellFed";
    const meatPie="com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie";
    const serialized=(className:string,fields:Record<string,any>={})=>JSON.stringify({buff:{__className:className,...fields}});
    const before=JSON.stringify(hero([row("native-meat-pie-state-001",meatPie,1,true)],{
      buffCount:1,buff_0:serialized(hunger,{level:400,partialDamage:0.25}),buffCooldown_0:0
    }));
    const validAfter=JSON.stringify(hero([],{inventoryBundle:"inventory-after",buffCount:2,
      buff_0:serialized(hunger,{level:0,partialDamage:0.25}),buffCooldown_0:0,
      buff_1:serialized(wellFed,{id:71,time:0,left:450}),buffCooldown_1:0
    }));
    const overlong=JSON.stringify(hero([],{inventoryBundle:"inventory-after",buffCount:2,
      buff_0:serialized(hunger,{level:0,partialDamage:0.25}),buffCooldown_0:0,
      buff_1:serialized(wellFed,{id:71,time:0,left:999}),buffCooldown_1:0
    }));
    const injected=JSON.stringify(hero([],{inventoryBundle:"inventory-after",buffCount:3,
      buff_0:serialized(hunger,{level:0,partialDamage:0.25}),buffCooldown_0:0,
      buff_1:serialized(wellFed,{id:71,time:0,left:450}),buffCooldown_1:0,
      buff_2:serialized("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste",{id:72,time:0}),buffCooldown_2:0
    }));
    const data=intent("native-meat-pie-state-001",meatPie,"EAT",1,true),accepted={...data,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,validAfter,data,accepted)).toBe(true);
    expect(isValidNativeUseItemMutation(before,overlong,data,accepted)).toBe(false);
    expect(isValidNativeUseItemMutation(before,injected,data,accepted)).toBe(false);
  });
  it("rejects food recovery above the native SmallRation energy",()=>{
    const hunger="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger";
    const serialized=(className:string,fields:Record<string,any>={})=>JSON.stringify({buff:{__className:className,...fields}});
    const smallRation="com.shatteredpixel.shatteredpixeldungeon.items.food.SmallRation";
    const before=JSON.stringify(hero([row("native-small-ration-energy-001",smallRation,1,true)],{
      buffCount:1,buff_0:serialized(hunger,{level:280,partialDamage:0}),buffCooldown_0:0
    }));
    const after=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      buffCount:1,buff_0:serialized(hunger,{level:0,partialDamage:0}),buffCooldown_0:0
    }));
    const d=intent("native-small-ration-energy-001",smallRation,"EAT",1,true);
    expect(isValidNativeUseItemMutation(before,after,d,{...d,actionType:"USE_ITEM"})).toBe(false);
  });
  it("accepts PotionOfHaste only with a correctly scheduled native Haste buff",()=>{
    const haste="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste";
    const hasteBuff="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste";
    const before=JSON.stringify(hero([row("native-haste-001",haste)],{
      cooldown:0,combatBundle:JSON.stringify({time:10,STR:10,items:"inventory-before",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    const after=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,items:"inventory-after",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:hasteBuff,time:30,id:52}}),buffCooldown_1:20
    }));
    const d=intent("native-haste-001",haste),accepted={...d,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemIntent({depth:4,branch:0,locked:false,heaps:[]},d,4,
      "player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
    expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);
    const mismatchedClock=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,items:"inventory-after",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:hasteBuff,time:55,id:52}}),buffCooldown_1:20
    }));
    expect(isValidNativeUseItemMutation(before,mismatchedClock,d,accepted)).toBe(false);
    const overlong=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,items:"inventory-after",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:hasteBuff,time:55,id:52}}),buffCooldown_1:45
    }));
    expect(isValidNativeUseItemMutation(before,overlong,d,accepted)).toBe(false);
  });

  it("accepts PotionOfPurity and PotionOfStamina only with their native timed buffs",()=>{
    const level={depth:4,branch:0,locked:false,heaps:[]};
    const purity="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfPurity";
    const stamina="com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfStamina";
    const blobImmunity="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.BlobImmunity";
    const staminaBuff="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Stamina";
    const beforeFor=(id:string,cls:string)=>JSON.stringify(hero([row(id,cls)],{
      cooldown:0,combatBundle:JSON.stringify({time:10,STR:10,items:"inventory-before",
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    const afterFor=(buff:string,id:number,duration:number)=>JSON.stringify(hero([],{
      inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,items:"inventory-after",
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
      buffCount:2,buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:buff,time:10+duration,id}}),buffCooldown_1:duration
    }));
    for (const [itemClass,buffClass,id,duration] of [
      [purity,blobImmunity,71,20],
      [stamina,staminaBuff,72,100]
    ] as Array<[string,string,number,number]>) {
      const before=beforeFor("native-consumable-"+id,itemClass);
      const after=afterFor(buffClass,id,duration);
      const d=intent("native-consumable-"+id,itemClass),accepted={...d,actionType:"USE_ITEM"};
      expect(isValidNativeUseItemIntent(level,d,4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
      expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);
      const inflated=afterFor(buffClass,id,duration+1);
      expect(isValidNativeUseItemMutation(before,inflated,d,accepted)).toBe(false);
    }
  });
  it("validates PotionOfShielding against the exact native Barrier shield and rejects poison fallbacks",()=>{
    const shieldingPotion="com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding";
    const barrierClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier";
    const poisonClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison";
    const level={depth:4,branch:0,locked:false,heaps:[]};
    const beforeFor=(id:string,oldBarrier:any=null,oldShielding=0)=>JSON.stringify(hero(
      [row(id,shieldingPotion)],{
        ht:20,shielding:oldShielding,cooldown:0,
        combatBundle:JSON.stringify({time:10,STR:10,items:"inventory-before",
          talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
        ...(oldBarrier?{
          buffCount:2,buff_0:defaultHungerBundle,buffCooldown_0:0,
          buff_1:JSON.stringify({buff:oldBarrier}),buffCooldown_1:0
        }:{})
      }));
    const afterFor=(id:string,barrier:any,aggregateShield:number)=>JSON.stringify(hero([],{
      ht:20,shielding:aggregateShield,inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,items:"inventory-after",
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
      buffCount:2,buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:barrier}),buffCooldown_1:0
    }));
    const id="native-shielding-potion-001";
    const d=intent(id,shieldingPotion),accepted={...d,actionType:"USE_ITEM"};
    const before=beforeFor(id);
    const newBarrier={__className:barrierClass,id:81,time:10,shielding:22,partial_lost_shield:0};
    const after=afterFor(id,newBarrier,22);
    expect(isValidNativeUseItemIntent(level,d,4,"player-001",{pos:9,state:"ALIVE"},before)).toBe(true);
    expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);

    const inflated=afterFor(id,{...newBarrier,shielding:23},23);
    expect(isValidNativeUseItemMutation(before,inflated,d,accepted)).toBe(false);
    const missing=JSON.stringify(hero([],{ht:20,shielding:0,inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,items:"inventory-after",
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    expect(isValidNativeUseItemMutation(before,missing,d,accepted)).toBe(false);

    const oldBarrier={__className:barrierClass,id:82,time:10,shielding:10,partial_lost_shield:0.4};
    const beforeExisting=beforeFor("native-shielding-potion-002",oldBarrier,10);
    const afterExisting=afterFor("native-shielding-potion-002",
      {...oldBarrier,shielding:22,partial_lost_shield:0},22);
    const existingIntent=intent("native-shielding-potion-002",shieldingPotion);
    expect(isValidNativeUseItemMutation(beforeExisting,afterExisting,existingIntent,
      {...existingIntent,actionType:"USE_ITEM"})).toBe(true);

    const badPartial=afterFor("native-shielding-potion-002",
      {...oldBarrier,shielding:22,partial_lost_shield:0.2},22);
    expect(isValidNativeUseItemMutation(beforeExisting,badPartial,existingIntent,
      {...existingIntent,actionType:"USE_ITEM"})).toBe(false);

    const strongerBarrier={...oldBarrier,shielding:30,partial_lost_shield:0.4};
    const beforeStronger=beforeFor("native-shielding-potion-003",strongerBarrier,30);
    const afterStronger=afterFor("native-shielding-potion-003",strongerBarrier,30);
    const strongerIntent=intent("native-shielding-potion-003",shieldingPotion);
    expect(isValidNativeUseItemMutation(beforeStronger,afterStronger,strongerIntent,
      {...strongerIntent,actionType:"USE_ITEM"})).toBe(true);

    const poisonFallback=JSON.stringify(hero([],{ht:20,shielding:0,inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,items:"inventory-after",
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
      buffCount:2,buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:poisonClass,id:83,time:10,left:9}}),buffCooldown_1:0
    }));
    expect(isValidNativeUseItemMutation(before,poisonFallback,d,accepted)).toBe(false);
  });

  it("accepts Invisibility and Levitation only for their native single-buff effects",()=>{
    const invisibility="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility";
    const levitation="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation";
    const invisBuff="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility";
    const levBuff="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Levitation";
    const roots="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Roots";
    const level={depth:4,branch:0,locked:false,heaps:[]};
    const beforeInvisibility=JSON.stringify(hero([row("native-invisibility-001",invisibility)],{
      cooldown:0,combatBundle:JSON.stringify({time:10,STR:10,items:"inventory-before",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    const afterInvisibility=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,items:"inventory-after",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:invisBuff,time:30,id:61}}),buffCooldown_1:20
    }));
    const invisIntent=intent("native-invisibility-001",invisibility),invisAccepted={...invisIntent,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemIntent(level,invisIntent,4,"player-001",{pos:9,state:"ALIVE"},beforeInvisibility)).toBe(true);
    expect(isValidNativeUseItemMutation(beforeInvisibility,afterInvisibility,invisIntent,invisAccepted)).toBe(true);
    const assassin=JSON.stringify(hero([row("native-invisibility-assassin-001",invisibility)],{
      combatBundle:JSON.stringify({STR:10,items:"inventory-before",subClass:"ASSASSIN",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    expect(isValidNativeUseItemIntent(level,intent("native-invisibility-assassin-001",invisibility),4,
      "player-001",{pos:9,state:"ALIVE"},assassin)).toBe(false);
    const protectiveShadows=JSON.stringify(hero([row("native-invisibility-protective-001",invisibility)],{
      cooldown:0,combatBundle:JSON.stringify({time:10,STR:10,items:"inventory-before",
        talents_tier_1:{},talents_tier_2:{PROTECTIVE_SHADOWS:1},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    expect(isValidNativeUseItemIntent(level,intent("native-invisibility-protective-001",invisibility),4,
      "player-001",{pos:9,state:"ALIVE"},protectiveShadows)).toBe(false);

    const beforeLevitation=JSON.stringify(hero([row("native-levitation-001",levitation)],{
      cooldown:0,combatBundle:JSON.stringify({time:10,STR:10,items:"inventory-before",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    const afterLevitation=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,items:"inventory-after",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:levBuff,time:30,id:62}}),buffCooldown_1:20
    }));
    const levIntent=intent("native-levitation-001",levitation),levAccepted={...levIntent,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemIntent(level,levIntent,4,"player-001",{pos:9,state:"ALIVE"},beforeLevitation)).toBe(true);
    expect(isValidNativeUseItemMutation(beforeLevitation,afterLevitation,levIntent,levAccepted)).toBe(true);
    const rooted=JSON.stringify(hero([row("native-levitation-rooted-001",levitation)],{
      buffCount:2,buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:roots,time:3,id:63}}),buffCooldown_1:3
    }));
    expect(isValidNativeUseItemIntent(level,intent("native-levitation-rooted-001",levitation),4,
      "player-001",{pos:9,state:"ALIVE"},rooted)).toBe(false);
  });
  it("validates all VialOfBlood levels against their exact PotionOfHealing multiplier",()=>{
    const healing="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing";
    const vial="com.shatteredpixel.shatteredpixeldungeon.items.trinkets.VialOfBlood";
    for (const [level,expectedLeft] of [[1,28],[2,30],[3,33]] as Array<[number,number]>) {
      const vialId="native-vial-healing-level-"+level;
      const vialBundle=JSON.stringify({item:{__className:vial,multiplayer_item_id:vialId,
        quantity:1,level,cursed:false,cursedKnown:true}});
      const vialRow={itemId:vialId,className:vial,quantity:1,level,cursed:false,cursedKnown:true,
        stackable:false,equipped:false,serializedBundle:vialBundle};
      const before=JSON.stringify(hero([row("native-healing-potion-level-"+level,potion),vialRow]));
      const after=JSON.stringify(hero([vialRow],{inventoryBundle:"inventory-after",buffCount:2,
        buff_0:defaultHungerBundle,buffCooldown_0:0,
        buff_1:JSON.stringify({buff:{__className:healing,left:expectedLeft,percent:0.25,flat:0,healing_limited:true}}),
        buffCooldown_1:0
      }));
      const d=intent("native-healing-potion-level-"+level),accepted={...d,actionType:"USE_ITEM"};
      expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);
      const inflated=JSON.stringify(hero([vialRow],{inventoryBundle:"inventory-after",buffCount:2,
        buff_0:defaultHungerBundle,buffCooldown_0:0,
        buff_1:JSON.stringify({buff:{__className:healing,left:expectedLeft+1,percent:0.25,flat:0,healing_limited:true}}),
        buffCooldown_1:0
      }));
      expect(isValidNativeUseItemMutation(before,inflated,d,accepted)).toBe(false);
    }
  });

  it("validates PotionOfHealing's native Healing buff and rejects unrelated combat bundle edits",()=>{
    const healing="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing";
    const before=JSON.stringify(hero([row("native-healing-001",potion)]));
    const after=JSON.stringify(hero([],{inventoryBundle:"inventory-after",buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:healing,left:22,percent:0.25,flat:0,healing_limited:false}}),
      buffCooldown_1:0
    }));
    const d=intent("native-healing-001"),accepted={...d,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);
    const forged=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      combatBundle:JSON.stringify({STR:10,items:"inventory-after",attackSkill:999})
    }));
    expect(isValidNativeUseItemMutation(before,forged,d,accepted)).toBe(false);
  });

  it("rejects the NO_HEALING PotionOfHealing poison fallback instead of accepting a missing Healing buff",()=>{
    const id="native-healing-no-heal-challenge-001";
    const before=JSON.stringify(hero([row(id,potion)],{
      cooldown:0,combatBundle:JSON.stringify({time:10,STR:10,lvl:4,items:"inventory-before",
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    const after=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:10,lvl:4,items:"inventory-after",
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
      buffCount:2,buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{
        __className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison",
        id:91,time:10,left:6
      }}),buffCooldown_1:0
    }));
    const d=intent(id),accepted={...d,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(false);
  });

  it("applies the exact VialOfBlood multiplier to PotionOfHealing and rejects inflated or missing native flags",()=>{
    const healing="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing";
    const vial="com.shatteredpixel.shatteredpixeldungeon.items.trinkets.VialOfBlood";
    const vialId="native-vial-healing-001";
    const vialBundle=JSON.stringify({item:{__className:vial,multiplayer_item_id:vialId,
      quantity:1,level:0,cursed:false,cursedKnown:true}});
    const vialRow={itemId:vialId,className:vial,quantity:1,level:0,cursed:false,cursedKnown:true,
      stackable:false,equipped:false,serializedBundle:vialBundle};
    const before=JSON.stringify(hero([row("native-healing-vial-potion-001",potion),vialRow]));
    const after=JSON.stringify(hero([vialRow],{inventoryBundle:"inventory-after",buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:healing,left:25,percent:0.25,flat:0,healing_limited:true}}),
      buffCooldown_1:0
    }));
    const d=intent("native-healing-vial-potion-001"),accepted={...d,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);
    const inflated=JSON.stringify(hero([vialRow],{inventoryBundle:"inventory-after",buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:healing,left:26,percent:0.25,flat:0,healing_limited:true}}),
      buffCooldown_1:0
    }));
    expect(isValidNativeUseItemMutation(before,inflated,d,accepted)).toBe(false);
    const missingFlag=JSON.stringify(hero([vialRow],{inventoryBundle:"inventory-after",buffCount:2,
      buff_0:defaultHungerBundle,buffCooldown_0:0,
      buff_1:JSON.stringify({buff:{__className:healing,left:34,percent:0.25,flat:0,healing_limited:false}}),
      buffCooldown_1:0
    }));
    expect(isValidNativeUseItemMutation(before,missingFlag,d,accepted)).toBe(false);
  });
  it("accepts a native Hero clock advance only when it matches the cooldown delta",()=>{
    const strength="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength";
    const before=JSON.stringify(hero([row("native-strength-clock-001",strength)],{
      cooldown:0,combatBundle:JSON.stringify({time:10,STR:10,items:"inventory-before",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    const d=intent("native-strength-clock-001",strength),accepted={...d,actionType:"USE_ITEM"};
    const validAfter=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:11,STR:11,items:"inventory-after",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    expect(isValidNativeUseItemMutation(before,validAfter,d,accepted)).toBe(true);
    const forgedClock=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({time:15,STR:11,items:"inventory-after"})
    }));
    expect(isValidNativeUseItemMutation(before,forgedClock,d,accepted)).toBe(false);
    const forgedCooldown=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:2,
      combatBundle:JSON.stringify({time:11,STR:11,items:"inventory-after",talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    expect(isValidNativeUseItemMutation(before,forgedCooldown,d,accepted)).toBe(false);
    const missingClock=JSON.stringify(hero([],{inventoryBundle:"inventory-after",cooldown:1,
      combatBundle:JSON.stringify({STR:11,items:"inventory-after"})
    }));
    expect(isValidNativeUseItemMutation(before,missingClock,d,accepted)).toBe(false);
  });

  it("persists PotionOfStrength only as an exact native STR increase of one",()=>{
    const strength="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength";
    const combat=(STR:number, inventory:string)=>JSON.stringify({
      STR,inventory,items:inventory,buffs:[],
      talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}
    });
    const before=JSON.stringify(hero([row("native-strength-001",strength)],{
      combatBundle:combat(10,"inventory-before")
    }));
    const after=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      combatBundle:combat(11,"inventory-after")
    }));
    const d=intent("native-strength-001",strength),accepted={...d,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);
    const forged=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      combatBundle:combat(12,"inventory-after")
    }));
    expect(isValidNativeUseItemMutation(before,forged,d,accepted)).toBe(false);
  });
  it("validates native source-slot remainder and last-unit placeholder conversion",()=>{
    const itemClass="com.shatteredpixel.shatteredpixeldungeon.items.food.Food";
    const nativeItem=(id:string,quantity:number,slot:number)=>JSON.stringify({item:{
      __className:itemClass,quantity,multiplayer_item_id:id,quickslotpos:slot
    }});
    const slot=(slotIndex:number,id:string,quantity:number,bundle:string)=>({
      slot:slotIndex,itemId:id,className:itemClass,quantity,serializedBundle:bundle
    });
    const stackId="native-quickslot-food-stack-001";
    const beforeBundle=nativeItem(stackId,4,2),afterBundle=nativeItem(stackId,3,2);
    const before=JSON.stringify(hero([row(stackId,itemClass,4,true,beforeBundle)],{
      quickslotsJson:JSON.stringify([slot(2,stackId,4,beforeBundle)])
    }));
    const after=JSON.stringify(hero([row(stackId,itemClass,3,true,afterBundle)],{
      inventoryBundle:"inventory-after",quickslotsJson:JSON.stringify([slot(2,stackId,3,afterBundle)])
    }));
    const data=intent(stackId,itemClass,"EAT",4,true),accepted={...data,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,after,data,accepted)).toBe(true);
    const moved=JSON.stringify(hero([row(stackId,itemClass,3,true,afterBundle)],{
      inventoryBundle:"inventory-after",quickslotsJson:JSON.stringify([slot(3,stackId,3,nativeItem(stackId,3,3))])
    }));
    expect(isValidNativeUseItemMutation(before,moved,data,accepted)).toBe(false);

    const oneId="native-quickslot-food-one-001",oldOne=nativeItem(oneId,1,1);
    const placeholderId="native-quickslot-food-placeholder-001",placeholder=nativeItem(placeholderId,0,1);
    const beforeOne=JSON.stringify(hero([row(oneId,itemClass,1,true,oldOne)],{
      quickslotsJson:JSON.stringify([slot(1,oneId,1,oldOne)])
    }));
    const afterOne=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      quickslotsJson:JSON.stringify([slot(1,placeholderId,0,placeholder)])
    }));
    const oneData=intent(oneId,itemClass,"EAT",1,true),oneAccepted={...oneData,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(beforeOne,afterOne,oneData,oneAccepted)).toBe(true);
    const wrongIndex=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      quickslotsJson:JSON.stringify([slot(2,placeholderId,0,nativeItem(placeholderId,0,2))])
    }));
    expect(isValidNativeUseItemMutation(beforeOne,wrongIndex,oneData,oneAccepted)).toBe(false);
    const positiveQuantity=JSON.stringify(hero([],{inventoryBundle:"inventory-after",
      quickslotsJson:JSON.stringify([slot(1,placeholderId,1,nativeItem(placeholderId,1,1))])
    }));
    expect(isValidNativeUseItemMutation(beforeOne,positiveQuantity,oneData,oneAccepted)).toBe(false);
  });

  it("accepts a one-unit stack decrement only when the same stable source ID remains",()=>{
    const before=JSON.stringify(hero([row("native-food-stack-001",food,4,true)]));
    const after=JSON.stringify(hero([row("native-food-stack-001",food,3,true)],{inventoryBundle:"inventory-after"}));
    const d=intent("native-food-stack-001",food,"EAT",4,true),accepted={...d,actionType:"USE_ITEM"};
    expect(isValidNativeUseItemMutation(before,after,d,accepted)).toBe(true);
    expect(isValidNativeUseItemMutation(before,JSON.stringify(hero([row("native-food-stack-001",food,2,true)],{inventoryBundle:"inventory-after"})),d,accepted)).toBe(false);
  });
});

describe("Native Shopkeeper buyback transactions", () => {
  const cls="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
  const item=(id:string,quantity=1,value=30,bundle?:string)=>({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:true,stackable:true,equipped:false,shopPrice:-1,
    nativeValue:value,nativeUnitValue:quantity===1?value:30,
    serializedBundle:bundle||`native-item:${id}:quantity=${quantity}`
  });
  const economy=(row:any)=>({itemId:row.itemId,className:row.className,quantity:row.quantity,
    nativeValue:row.nativeValue,nativeUnitValue:row.nativeUnitValue,nativeSellable:true});
  const hero=(items:any[],gold=100,slots:any[]=[],extra:Record<string,any>={})=>({
    hp:10,ht:10,pos:9,shielding:0,gold,cooldown:0,alchemyEnergy:0,
    inventoryBundle:"native-inventory-before",
    combatBundle:JSON.stringify({time:10,STR:10,inventory:"inventory-before",buffs:[],
      talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}}),
    inventoryItemsJson:JSON.stringify(items),nativeItemEconomyJson:JSON.stringify(items.map(economy)),
    quickslotsJson:JSON.stringify(slots),notesBundle:"native-notes",questStateBundle:"native-quests",
    ironKeyCount:0,crystalKeyCount:0,wornKeyCount:0,goldenKeyCount:0,...extra
  });
  const shop=(buyback:any[]=[],bundle="native-shop-before")=>({
    entityId:"stable-buyback-shop-001",mobId:15,name:"Shopkeeper",pos:10,hp:20,ht:20,shielding:0,
    state:"Wandering",serializedBundle:bundle,defenseSkill:0,baseSpeed:1,effectiveSpeed:1,cooldown:0,
    targetCell:-1,targetType:"NONE",targetEntityId:"",enemySeen:false,alerted:false,buffs:[],
    shopkeeperTurnsSinceHarmed:-1,buybackItems:buyback
  });
  const d=(overrides:Record<string,any>={})=>({
    from:9,to:9,targetPos:9,depth:4,branch:0,engineActionCost:1,
    shopEntityId:"stable-buyback-shop-001",buybackItemId:"stable-buyback-item-001",
    buybackItemClass:cls,buybackQuantity:1,price:30,resultItemId:"stable-buyback-item-001",
    itemClass:cls,itemLevel:0,cursed:false,cursedKnown:true,stackable:true,nativeValue:30,nativeUnitValue:30,
    resultItemBundle:"native-item:stable-buyback-item-001:quantity=1",...overrides
  });
  const accepted=(data:any)=>({...data,actionType:"BUYBACK",playerId:"player-001"});
  const player={pos:9,state:"ALIVE"};

  it("accepts only the exact adjacent Shopkeeper item and rejects stale, unaffordable or redirected intents",()=>{
    const source=item("stable-buyback-item-001"), level={depth:4,branch:0,locked:false,width:8,height:8,heaps:[],mobs:[shop([source])]};
    const before=JSON.stringify(hero([],100));
    expect(isValidNativeBuybackIntent(level,d(),4,"player-001",player,before)).toBe(true);
    expect(isValidNativeBuybackIntent(level,d({engineActionCost:0}),4,"player-001",player,before)).toBe(false);
    expect(isValidNativeBuybackIntent({...level,mobs:[shop([])]},d(),4,"player-001",player,before)).toBe(false);
    expect(isValidNativeBuybackIntent(level,d({price:29}),4,"player-001",player,before)).toBe(false);
    expect(isValidNativeBuybackIntent(level,d({shopEntityId:"stable-other-shop-001"}),4,"player-001",player,before)).toBe(false);
    expect(isValidNativeBuybackIntent(level,d(),4,"player-001",{pos:9,state:"DEAD"},before)).toBe(false);
    expect(isValidNativeBuybackIntent(level,d(),4,"player-001",player,JSON.stringify(hero([],20)))).toBe(false);
    expect(isValidNativeBuybackIntent({...level,mobs:[{...shop([source]),pos:30}]},d(),4,"player-001",player,before)).toBe(false);
  });

  it("commits exactly one item and the exact gold debit while removing that item from buyback",()=>{
    const source=item("stable-buyback-item-001"), oldHero=hero([],100),newHero=hero([source],70,[],{
      cooldown:1,inventoryBundle:"native-inventory-after",
      combatBundle:JSON.stringify({time:10,STR:10,inventory:"inventory-after",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    });
    const data=d(),result=accepted(data);
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldHero),JSON.stringify(newHero),data,result)).toBe(true);
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldHero),JSON.stringify({...newHero,gold:69}),data,result)).toBe(false);
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldHero),JSON.stringify(newHero),data,
      {...result,nativeValue:31})).toBe(false);
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldHero),JSON.stringify({...newHero,cooldown:0}),data,result)).toBe(false);
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldHero),JSON.stringify({...newHero,cooldown:2}),data,result)).toBe(false);
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldHero),JSON.stringify({...newHero,
      inventoryItemsJson:JSON.stringify([source,{...source,itemId:"forged-extra-item-001"}]),
      nativeItemEconomyJson:JSON.stringify([economy(source),economy({...source,itemId:"forged-extra-item-001"})])
    }),data,result)).toBe(false);

    const placeholder={slot:2,itemId:source.itemId,className:cls,quantity:0,serializedBundle:source.serializedBundle};
    const restoredSlot={...placeholder,quantity:1};
    const oldQuickslotHero=hero([],100,[placeholder]);
    const newQuickslotHero=hero([source],70,[restoredSlot],{
      cooldown:1,inventoryBundle:"native-inventory-after",
      combatBundle:JSON.stringify({time:10,STR:10,inventory:"inventory-after",items:"inventory-after",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    });
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldQuickslotHero),
      JSON.stringify(newQuickslotHero),data,result)).toBe(true);
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldQuickslotHero),
      JSON.stringify({...newQuickslotHero,quickslotsJson:JSON.stringify([{...restoredSlot,slot:3}])}),data,result)).toBe(false);

    const beforeShop=shop([source]), afterShop=shop([],"native-shop-after");
    expect(isValidNativeBuybackShopkeeperMutation([beforeShop],[afterShop],data,result)).toBe(true);
    expect(isValidNativeBuybackShopkeeperMutation([beforeShop],[shop([source],"native-shop-after")],data,result)).toBe(false);
    expect(isValidNativeBuybackShopkeeperMutation([beforeShop],[shop([],"native-shop-after")],
      {...data,buybackItemId:"stable-other-item-001"},result)).toBe(false);
  });

  it("rejects ring buyback when native collection would identify it through Thief's Intuition",()=>{
    const ringClass="com.shatteredpixel.shatteredpixeldungeon.items.rings.RingOfMight";
    const ring={itemId:"stable-buyback-ring-001",className:ringClass,quantity:1,level:0,cursed:false,
      cursedKnown:false,stackable:false,shopPrice:-1,nativeValue:40,nativeUnitValue:40,
      serializedBundle:"native-item:stable-buyback-ring-001"};
    const level={depth:4,branch:0,locked:false,width:8,height:8,heaps:[],mobs:[shop([ring])]};
    const data=d({buybackItemId:ring.itemId,buybackItemClass:ringClass,itemClass:ringClass,price:40,
      itemLevel:0,cursed:false,cursedKnown:false,nativeValue:40,nativeUnitValue:40,stackable:false,
      resultItemId:ring.itemId,resultItemBundle:ring.serializedBundle});
    const nativeHero=JSON.stringify(hero([],100,[],{
      combatBundle:JSON.stringify({time:10,inventory:"inventory-before",items:"inventory-before",buffs:[],
        talents_tier_1:{},talents_tier_2:{THIEFS_INTUITION:2},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    }));
    expect(isValidNativeBuybackIntent(level,data,4,"player-001",player,nativeHero)).toBe(false);
  });

  it("rejects unrelated Hero edits, duplicate item identity and forged native economy metadata",()=>{
    const source=item("stable-buyback-item-001"),data=d(),result=accepted(data);
    const oldHero=hero([],100),validHero=hero([source],70,[],{
      inventoryBundle:"native-inventory-after",
      combatBundle:JSON.stringify({time:10,STR:10,inventory:"inventory-after",buffs:[],
        talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}})
    });
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldHero),JSON.stringify({...validHero,hp:9}),data,result)).toBe(false);
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(hero([source],100)),JSON.stringify(validHero),data,result)).toBe(false);
    expect(isValidNativeBuybackInventoryMutation(JSON.stringify(oldHero),JSON.stringify({...validHero,
      nativeItemEconomyJson:JSON.stringify([{...economy(source),nativeValue:31}])
    }),data,result)).toBe(false);
  });
});

describe("Native shop purchase transaction validation", () => {
  const potion="com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
  const ring="com.shatteredpixel.shatteredpixeldungeon.items.rings.RingOfAccuracy";
  const wand="com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfMagicMissile";
  const bag="com.shatteredpixel.shatteredpixeldungeon.items.bags.ScrollHolder";
  const bundle=(id:string,quantity:number,cls:string,extra:Record<string,any>={})=>JSON.stringify({item:{
    __className:cls,multiplayer_item_id:id,quantity,level:0,levelKnown:false,cursed:false,cursedKnown:false,...extra
  }});
  const item=(id:string,quantity=1,cls=potion,stackable=false,shopPrice=-1,extra:Record<string,any>={})=>({
    itemId:id,className:cls,quantity,level:0,cursed:false,cursedKnown:false,stackable,equipped:false,shopPrice,
    serializedBundle:bundle(id,quantity,cls,extra)
  });
  const combat=(time:number,inventory:string)=>JSON.stringify({time,STR:10,inventory,items:inventory,buffs:[],
    talents_tier_1:{},talents_tier_2:{},talents_tier_3:{},talents_tier_4:{},replacements:{}});
  const hero=(items:any[],extra:Record<string,any>={})=>({
    hp:10,ht:10,pos:9,shielding:0,gold:100,cooldown:0,inventoryBundle:"inventory-before",
    inventoryItemsJson:JSON.stringify(items),quickslotsJson:"[]",buffCount:0,
    combatBundle:combat(10,"inventory-before"),...extra
  });
  const afterBuy=(items:any[],extra:Record<string,any>={})=>hero(items,{
    gold:75,cooldown:1,inventoryBundle:"inventory-after",combatBundle:combat(11,"inventory-after"),...extra
  });
  const heap=(heapId:string,pos:number,rows:any[],type="FOR_SALE")=>({
    heapId,pos,type,seen:true,haunted:false,hidden:false,autoExplored:false,items:rows
  });
  const d=(extra:Record<string,any>={})=>({
    from:9,to:9,targetPos:9,depth:4,branch:0,engineActionCost:1,heapId:"stable-shop-001",
    itemId:"stable-shop-item-001",itemClass:potion,expectedQuantity:1,sourceQuantityBefore:1,
    stackable:false,itemLevel:0,cursed:false,cursedKnown:false,price:25,
    itemBundle:bundle("stable-shop-item-001",1,potion),
    resultItemId:"stable-shop-item-001",resultHeapId:"",acquiredByInventory:true,...extra
  });
  const player={pos:9,state:"ALIVE"};

  it("requires the exact sale heap, quoted price, and byte-identical native item bundle",()=>{
    const sale=item("stable-shop-item-001",1,potion,false,25);
    const level={depth:4,branch:0,locked:false,heaps:[heap("stable-shop-001",9,[sale])]};
    const prior=JSON.stringify(hero([])),details=d();
    expect(isValidNativeBuyIntent(level,details,4,"player-001",player,prior)).toBe(true);
    expect(isValidNativeBuyIntent(level,d({price:0}),4,"player-001",player,prior)).toBe(false);
    expect(isValidNativeBuyIntent(level,d({heapId:"different-shop-001"}),4,"player-001",player,prior)).toBe(false);
    expect(isValidNativeBuyIntent({...level,heaps:[heap("stable-shop-001",9,[sale],"HEAP")]},
      details,4,"player-001",player,prior)).toBe(false);
    expect(isValidNativeBuyIntent(level,d({itemBundle:bundle("stable-shop-item-001",1,potion,{level:2})}),
      4,"player-001",player,prior)).toBe(false);
    expect(isValidNativeBuyIntent(level,d({itemBundle:"forged-bundle-with-stable-shop-item-001"}),
      4,"player-001",player,prior)).toBe(false);
  });

  it("rejects custom Bag/Wand pickup callbacks and ring identification from Thief's Intuition",()=>{
    const prior=JSON.stringify(hero([]));
    expect(isValidNativeBuyIntent({depth:4,branch:0,locked:false,heaps:[heap("stable-shop-001",9,
      [item("stable-shop-item-001",1,bag,false,25)])]},d({itemClass:bag,itemBundle:bundle("stable-shop-item-001",1,bag)}),
      4,"player-001",player,prior)).toBe(false);
    expect(isValidNativeBuyIntent({depth:4,branch:0,locked:false,heaps:[heap("stable-shop-001",9,
      [item("stable-shop-item-001",1,wand,false,25)])]},d({itemClass:wand,itemBundle:bundle("stable-shop-item-001",1,wand)}),
      4,"player-001",player,prior)).toBe(false);
    const ringD=d({itemClass:ring,itemBundle:bundle("stable-shop-item-001",1,ring)});
    const ringLevel={depth:4,branch:0,locked:false,heaps:[heap("stable-shop-001",9,[item("stable-shop-item-001",1,ring,false,25)])]};
    const thief=JSON.stringify(hero([],{combatBundle:JSON.stringify({time:10,STR:10,inventory:"inventory-before",
      items:"inventory-before",buffs:[],talents_tier_1:{},talents_tier_2:{THIEFS_INTUITION:2},
      talents_tier_3:{},talents_tier_4:{},replacements:{}})}));
    expect(isValidNativeBuyIntent(ringLevel,ringD,4,"player-001",player,thief)).toBe(false);
    expect(isValidNativeBuyIntent(ringLevel,ringD,4,"player-001",player,prior)).toBe(true);
  });

  it("requires exact gold debit, original item bundle and unchanged native combat/buffs",()=>{
    const prior=JSON.stringify(hero([])),details=d(),accepted={...details,actionType:"BUY"};
    expect(isValidNativeBuyInventoryMutation(prior,JSON.stringify(afterBuy([item("stable-shop-item-001")])),
      details,accepted)).toBe(true);
    expect(isValidNativeBuyInventoryMutation(prior,JSON.stringify(afterBuy([item("stable-shop-item-001")],{gold:74})),
      details,accepted)).toBe(false);
    expect(isValidNativeBuyInventoryMutation(prior,JSON.stringify(afterBuy([
      item("stable-shop-item-001"),item("stable-forged-001")
    ])),details,accepted)).toBe(false);
    expect(isValidNativeBuyInventoryMutation(prior,JSON.stringify(afterBuy([
      item("stable-shop-item-001",1,potion,false,-1,{level:1})
    ])),details,accepted)).toBe(false);
    const extraBuff=JSON.stringify(afterBuy([item("stable-shop-item-001")],{buffCount:1,
      buff_0:JSON.stringify({buff:{__className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste",time:20,id:22}}),
      buffCooldown_0:20}));
    expect(isValidNativeBuyInventoryMutation(prior,extraBuff,details,accepted)).toBe(false);
  });

  it("allows only quickslot-position changes in a directly acquired native item bundle",()=>{
    const prior=JSON.stringify(hero([])),details=d(),accepted={...details,actionType:"BUY"};
    const slotted=bundle("stable-shop-item-001",1,potion,{quickslotpos:2});
    const slotJson=JSON.stringify([{slot:2,itemId:"stable-shop-item-001",className:potion,quantity:1,serializedBundle:slotted}]);
    expect(isValidNativeBuyInventoryMutation(prior,JSON.stringify(afterBuy([
      {...item("stable-shop-item-001"),serializedBundle:slotted}
    ],{quickslotsJson:slotJson})),details,accepted)).toBe(true);
    const forged=bundle("stable-shop-item-001",1,potion,{quickslotpos:2,custom_enchantment:"FORGED"});
    const forgedSlot=JSON.stringify([{slot:2,itemId:"stable-shop-item-001",className:potion,quantity:1,serializedBundle:forged}]);
    expect(isValidNativeBuyInventoryMutation(prior,JSON.stringify(afterBuy([
      {...item("stable-shop-item-001"),serializedBundle:forged}
    ],{quickslotsJson:forgedSlot})),details,accepted)).toBe(false);
  });

  it("permits merges only when source, old stack and result share the same native bundle identity signature",()=>{
    const ownedId="stable-owned-stack-001";
    const prior=JSON.stringify(hero([item(ownedId,2,potion,true)]));
    const details=d({stackable:true,resultItemId:ownedId});
    const accepted={...details,actionType:"BUY"};
    expect(isValidNativeBuyInventoryMutation(prior,JSON.stringify(afterBuy([item(ownedId,3,potion,true)])),
      details,accepted)).toBe(true);
    const different=d({stackable:true,resultItemId:ownedId,itemBundle:bundle("stable-shop-item-001",1,potion,{custom_enchantment:"different"})});
    expect(isValidNativeBuyInventoryMutation(prior,JSON.stringify(afterBuy([item(ownedId,3,potion,true)])),
      different,{...different,actionType:"BUY"})).toBe(false);
    expect(isValidNativeBuyInventoryMutation(prior,JSON.stringify(afterBuy([
      {...item(ownedId,3,potion,true),serializedBundle:bundle(ownedId,3,potion,{custom_enchantment:"forged"})}
    ])),details,accepted)).toBe(false);
  });

  it("removes exactly the sale heap or leaves the exact original item when inventory is full",()=>{
    const sale=item("stable-shop-item-001",1,potion,false,25),before=[heap("stable-shop-001",9,[sale])];
    const details=d(),accepted={...details,actionType:"BUY"};
    expect(isValidNativeBuyHeapMutation(before,[],9,details,accepted)).toBe(true);
    const dropId="stable-floor-drop-001";
    const full=d({acquiredByInventory:false,resultHeapId:dropId});
    expect(isValidNativeBuyHeapMutation(before,[heap(dropId,9,[item("stable-shop-item-001")],"HEAP")],
      9,full,{...full,actionType:"BUY"})).toBe(true);
    const altered={...item("stable-shop-item-001"),serializedBundle:bundle("stable-shop-item-001",1,potion,{custom:"forged"})};
    expect(isValidNativeBuyHeapMutation(before,[heap(dropId,9,[altered],"HEAP")],9,full,{...full,actionType:"BUY"})).toBe(false);
  });
});

describe('Stable native pickup transactions', () => {
  const item = (itemId: string, className = 'com.shatteredpixel.shatteredpixeldungeon.items.PotionOfHealing', quantity = 1, stackable = false) => ({
    itemId, className, quantity, level: 0, cursed: false, cursedKnown: false, stackable,
    serializedBundle: `native-bundle-item-id:${itemId}`
  });
  const heap = (heapId: string, pos: number, items: any[]) => ({
    heapId, pos, type: 'HEAP', seen: true, haunted: false, hidden: false, autoExplored: false, items
  });
  const baseLevel = (heaps: any[]) => ({ depth: 4, branch: 0, locked: false, width: 8, height: 8, heaps });
  const pickup = (overrides: Record<string, any> = {}) => ({
    from: 9, to: 9, targetPos: 9, itemPos: 9, depth: 4, branch: 0, engineActionCost: 1,
    heapId: 'stable-heap-0001', itemId: 'stable-item-0001',
    itemClass: 'com.shatteredpixel.shatteredpixeldungeon.items.PotionOfHealing',
    expectedQuantity: 1, stackable: false, ...overrides
  });
  const player = { pos: 9, state: 'ALIVE' };

  it('accepts only the exact top item at the alive player current cell and floor', () => {
    const level = baseLevel([heap('stable-heap-0001', 9, [item('stable-item-0001')])]);
    expect(isValidNativePickupIntent(level, pickup(), 4, 'player-0001', player)).toBe(true);
    expect(isValidNativePickupIntent(level, pickup({ itemId: 'stable-item-other' }), 4, 'player-0001', player)).toBe(false);
    expect(isValidNativePickupIntent(level, pickup({ itemClass: 'com.shatteredpixel.shatteredpixeldungeon.items.Ankh' }), 4, 'player-0001', player)).toBe(false);
    expect(isValidNativePickupIntent(level, pickup({ depth: 5 }), 4, 'player-0001', player)).toBe(false);
    expect(isValidNativePickupIntent(level, pickup({ from: 8 }), 4, 'player-0001', player)).toBe(false);
    expect(isValidNativePickupIntent(level, pickup(), 4, 'player-0001', { ...player, state: 'DEAD' })).toBe(false);
    expect(isValidNativePickupIntent({ ...level, locked: true }, pickup(), 4, 'player-0001', player)).toBe(false);
  });

  it('removes one concrete top item from a partial heap without changing the rest', () => {
    const second = item('stable-item-second', 'com.shatteredpixel.shatteredpixeldungeon.items.ScrollOfIdentify');
    const oldHeap = heap('stable-heap-0001', 9, [item('stable-item-0001'), second]);
    const newHeap = heap('stable-heap-0001', 9, [second]);
    const details = pickup();
    const accepted = { ...details, playerId: 'player-0001', actionType: 'PICKUP' };
    expect(isValidNativePickupHeapMutation([oldHeap], [newHeap], 9, details, accepted)).toBe(true);
    expect(isValidNativePickupHeapMutation([oldHeap], [], 9, details, accepted)).toBe(false);
    expect(isValidNativePickupHeapMutation([oldHeap], [heap('stable-heap-other', 9, [second])], 9, details, accepted)).toBe(false);
    expect(isValidNativePickupHeapMutation([oldHeap], [heap('stable-heap-0001', 9, [item('stable-item-0001'), second])], 9, details, accepted)).toBe(false);
    expect(isValidNativePickupHeapMutation([oldHeap], [newHeap, heap('unrelated-new-heap', 20, [item('unrelated-item-001')])], 9, details, accepted)).toBe(false);
  });

  it('allows the heap to disappear only after its sole item is removed', () => {
    const oldHeap = heap('stable-heap-0001', 9, [item('stable-item-0001')]);
    const details = pickup();
    const accepted = { ...details, playerId: 'player-0001', actionType: 'PICKUP' };
    expect(isValidNativePickupHeapMutation([oldHeap], [], 9, details, accepted)).toBe(true);
    expect(isValidNativePickupHeapMutation([oldHeap], [oldHeap], 9, details, accepted)).toBe(false);
    expect(isValidNativePickupHeapMutation([oldHeap], [], 9, details, { ...accepted, itemId: 'stable-item-other' })).toBe(false);
  });

  it('distinguishes two item instances with the same class and rejects a replay', () => {
    const oldHeap = heap('stable-heap-0001', 9, [
      item('stable-item-0001', undefined, 2, true), item('stable-item-0002', undefined, 3, true)
    ]);
    const afterOne = heap('stable-heap-0001', 9, [oldHeap.items[1]]);
    const details = pickup({ expectedQuantity: 2, stackable: true });
    const accepted = { ...details, playerId: 'player-0001', actionType: 'PICKUP' };
    expect(isValidNativePickupHeapMutation([oldHeap], [afterOne], 9, details, accepted)).toBe(true);
    expect(isValidNativePickupHeapMutation([afterOne], [], 9, details, accepted)).toBe(false);
    expect(isValidNativePickupHeapMutation([oldHeap], [afterOne], 9, details, { ...accepted, heapId: 'stable-heap-other' })).toBe(false);
  });
});


describe("Native inventory container ownership and safe Bag pickup", () => {
  const rootBag = "com.shatteredpixel.shatteredpixeldungeon.items.bags.ScrollHolder";
  const potionBag = "com.shatteredpixel.shatteredpixeldungeon.items.bags.PotionBandolier";
  const scrollClass = "com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfIdentify";
  const potionClass = "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
  const daggerClass = "com.shatteredpixel.shatteredpixeldungeon.items.weapon.melee.Dagger";
  const payload = (id:string, className:string, extra:Record<string,any>={}) => ({
    __className:className,multiplayer_item_id:id,quantity:1,level:0,
    levelKnown:true,cursed:false,cursedKnown:true,...extra
  });
  const bundle = (item:any) => JSON.stringify({item});
  const row = (item:any, containerId:string, equipped=false) => ({
    itemId:String(item.multiplayer_item_id),className:String(item.__className),quantity:Number(item.quantity),
    level:Number(item.level),cursed:item.cursed===true,cursedKnown:item.cursedKnown===true,
    stackable:item.stackable===true,equipped,containerId,serializedBundle:bundle(item)
  });
  const state = (rows:any[], belongings:any, extra:Record<string,any>={}) => ({
    nativeInventoryTreeVersion:1,inventoryBundle:JSON.stringify(belongings),
    inventoryItemsJson:JSON.stringify(rows),quickslotsJson:"[]",gold:0,...extra
  });

  it("matches every flattened item to its exact backpack, nested Bag, or typed equipment slot",()=>{
    const scroll=payload("tree-scroll-0001",scrollClass);
    const bag=payload("tree-bag-0001",rootBag,{inventory:[scroll]});
    const weapon=payload("tree-weapon-001",daggerClass);
    const rows=[row(bag,"BACKPACK"),row(scroll,"tree-bag-0001"),row(weapon,"WEAPON",true)];
    const valid=state(rows,{inventory:[bag],weapon});
    expect(isValidNativeInventoryBundleIndex(valid,rows)).toBe(true);
    expect(isValidNativeInventoryBundleIndex(valid,[
      rows[0],{...rows[1],containerId:"BACKPACK"},rows[2]
    ])).toBe(false);
    expect(isValidNativeInventoryBundleIndex(valid,[rows[0],rows[2]])).toBe(false);
    expect(isValidNativeInventoryBundleIndex(valid,[
      rows[0],rows[1],{...rows[2],containerId:"BACKPACK",equipped:false}
    ])).toBe(false);
    const forgedBag=payload("tree-bag-0001",rootBag,{inventory:[{...scroll,multiplayer_item_id:"tree-forged-child-001"}]});
    expect(isValidNativeInventoryBundleIndex(state(rows,{inventory:[forgedBag],weapon}),rows)).toBe(false);
  });

  it("accepts an exact empty supported Bag pickup without changing existing container ownership",()=>{
    const bagId="safe-scroll-holder-001";
    const bag=payload(bagId,rootBag,{inventory:[]});
    const bagBundle=bundle(bag);
    const bagRow=row(bag,"BACKPACK");
    const before=state([],{inventory:[]});
    const after=state([bagRow],{inventory:[bag]});
    const accepted={
      actionType:"PICKUP",itemId:bagId,itemClass:rootBag,expectedQuantity:1,stackable:false,itemBundle:bagBundle
    };
    expect(isValidNativeInventoryBundleIndex(before,[])).toBe(true);
    expect(isValidNativeInventoryBundleIndex(after,[bagRow])).toBe(true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(before),JSON.stringify(after),accepted)).toBe(true);

    const heap={heapId:"safe-bag-heap-001",pos:9,type:"HEAP",items:[{
      itemId:bagId,className:rootBag,quantity:1,level:0,cursed:false,cursedKnown:true,
      stackable:false,serializedBundle:bagBundle
    }]};
    const level={depth:4,branch:0,locked:false,heaps:[heap]};
    const intent={
      from:9,to:9,targetPos:9,itemPos:9,depth:4,branch:0,engineActionCost:1,
      heapId:heap.heapId,itemId:bagId,itemClass:rootBag,expectedQuantity:1,stackable:false,itemBundle:bagBundle
    };
    expect(isValidNativePickupIntent(level,intent,4,"bag-player-001",{pos:9,state:"ALIVE"})).toBe(true);
  });

  it("rejects a filled, unsupported, forged, or container-transfer Bag pickup",()=>{
    const bagId="unsafe-scroll-holder-001";
    const child=payload("unsafe-bag-child-001",scrollClass);
    const filledBag=payload(bagId,rootBag,{inventory:[child]});
    const filledBundle=bundle(filledBag);
    const makeIntent=(className:string,id:string,itemBundle:string)=>({
      from:9,to:9,targetPos:9,itemPos:9,depth:4,branch:0,engineActionCost:1,
      heapId:"unsafe-bag-heap-001",itemId:id,itemClass:className,expectedQuantity:1,stackable:false,itemBundle
    });
    const floor=(id:string,className:string,itemBundle:string)=>({heapId:"unsafe-bag-heap-001",pos:9,type:"HEAP",
      items:[{itemId:id,className,quantity:1,level:0,cursed:false,cursedKnown:true,stackable:false,serializedBundle:itemBundle}]});
    expect(isValidNativePickupIntent({depth:4,branch:0,locked:false,heaps:[floor(bagId,rootBag,filledBundle)]},
      makeIntent(rootBag,bagId,filledBundle),4,"bag-player-001",{pos:9,state:"ALIVE"})).toBe(false);

    const unsupportedClass="com.example.UnvalidatedBag";
    const unsupported=payload("unsafe-unknown-bag-001",unsupportedClass,{inventory:[]});
    const unsupportedBundle=bundle(unsupported);
    expect(isValidNativePickupIntent({depth:4,branch:0,locked:false,
      heaps:[floor("unsafe-unknown-bag-001",unsupportedClass,unsupportedBundle)]},
      makeIntent(unsupportedClass,"unsafe-unknown-bag-001",unsupportedBundle),4,
      "bag-player-001",{pos:9,state:"ALIVE"})).toBe(false);

    const emptyBag=payload(bagId,rootBag,{inventory:[]}), emptyBundle=bundle(emptyBag);
    const mismatched=makeIntent(rootBag,bagId,bundle(payload(bagId,rootBag,{inventory:[]}))+" ");
    expect(isValidNativePickupIntent({depth:4,branch:0,locked:false,heaps:[floor(bagId,rootBag,emptyBundle)]},
      mismatched,4,"bag-player-001",{pos:9,state:"ALIVE"})).toBe(false);

    const existingScroll=payload("already-owned-scroll-001",scrollClass);
    const existingRow=row(existingScroll,"BACKPACK");
    const transferredBag=payload(bagId,rootBag,{inventory:[existingScroll]});
    const transferredRow=row(transferredBag,"BACKPACK");
    const movedScrollRow=row(existingScroll,bagId);
    const previous=state([existingRow],{inventory:[existingScroll]});
    const next=state([transferredRow,movedScrollRow],{inventory:[transferredBag]});
    expect(isValidNativeInventoryBundleIndex(previous,[existingRow])).toBe(true);
    expect(isValidNativeInventoryBundleIndex(next,[transferredRow,movedScrollRow])).toBe(true);
    expect(isValidNativePickupInventoryMutation(JSON.stringify(previous),JSON.stringify(next),{
      actionType:"PICKUP",itemId:bagId,itemClass:rootBag,expectedQuantity:1,stackable:false,itemBundle:emptyBundle
    })).toBe(false);
  });

  it("rejects container markers that are missing, mixed, or not backed by the native bundle tree",()=>{
    const scroll=payload("tree-marker-scroll-001",scrollClass);
    const scrollRow=row(scroll,"BACKPACK");
    const valid=state([scrollRow],{inventory:[scroll]});
    expect(isValidNativeInventoryBundleIndex(valid,[scrollRow])).toBe(true);
    expect(isValidNativeInventoryBundleIndex(valid,[{...scrollRow,containerId:"ORPHAN-BAG"}])).toBe(false);
    expect(isValidNativeInventoryBundleIndex(valid,[{...scrollRow,containerId:undefined}])).toBe(false);
    expect(isValidNativeInventoryBundleIndex({...valid,inventoryBundle:JSON.stringify({inventory:[]})},[scrollRow])).toBe(false);
  });
});


describe("Native run-progress persistence and exactly-once reward identity", () => {
  const heroState = (runProgressBundle: string) => JSON.stringify({
    hp: 20, ht: 20, pos: 12, shielding: 0, cooldown: 1, buffCount: 0,
    combatBundle: "trusted-native-combat", inventoryBundle: "trusted-native-inventory",
    nativeInventoryTreeVersion: 1, inventoryItemsJson: "[]", nativeItemEconomyJson: "[]",
    quickslotsJson: "[]", ankhCount: 1, blessedAnkhCount: 0, gold: 50, alchemyEnergy: 4,
    potionStatusBundle: "native-potions-before", scrollStatusBundle: "native-scrolls-before",
    notesBundle: "native-notes-before", questStateBundle: "native-quests-before",
    ironKeyCount: 0, crystalKeyCount: 0, wornKeyCount: 0, goldenKeyCount: 0,
    runProgressBundle
  });

  it("binds opaque run progress to the trusted Hero pre-state", () => {
    const before = heroState("native-run-state-before");
    expect(hasMatchingNativeHeroStateSnapshot(heroState("native-run-state-before"), before)).toBe(true);
    expect(hasMatchingNativeHeroStateSnapshot(heroState("native-run-state-after"), before)).toBe(false);
  });

  it("rejects journal, quest and item-knowledge changes in an unaccepted pre-action state", () => {
    const before = heroState("trusted-run-progress");
    const base = JSON.parse(before);
    expect(hasMatchingNativeHeroStateSnapshot(JSON.stringify({
      ...base, notesBundle: "forged-notes-before-acceptance"
    }), before)).toBe(false);
    expect(hasMatchingNativeHeroStateSnapshot(JSON.stringify({
      ...base, questStateBundle: "forged-quest-before-acceptance"
    }), before)).toBe(false);
    expect(hasMatchingNativeHeroStateSnapshot(JSON.stringify({
      ...base, potionStatusBundle: "forged-potions-before-acceptance"
    }), before)).toBe(false);
    expect(hasMatchingNativeHeroStateSnapshot(JSON.stringify({
      ...base, ironKeyCount: 99
    }), before)).toBe(false);
  });

  it("preserves run progress during ordinary reconciliation and accepts a validated native reward state", () => {
    const before = heroState("trusted-run-progress");
    const after = heroState("native-kill-run-progress");
    const kept = mergeNativeHeroState(before, after,
      { hp: 20, ht: 20, pos: 12, shielding: 0 }, "[]");
    const accepted = mergeNativeHeroState(before, after,
      { hp: 20, ht: 20, pos: 12, shielding: 0 }, "[]", false, false, false, false);
    expect(JSON.parse(String(kept)).runProgressBundle).toBe("trusted-run-progress");
    expect(JSON.parse(String(accepted)).runProgressBundle).toBe("native-kill-run-progress");
  });

  it("persists attacker-owned rewards, quest and inventory indexes after an accepted native attack", () => {
    const before = heroState("trusted-run-progress");
    const after = JSON.parse(before);
    after.cooldown = 2;
    after.inventoryBundle = "native-inventory-after-throw";
    after.inventoryItemsJson = '[{"itemId":"thrown-stack","quantity":2}]';
    after.nativeItemEconomyJson = '[{"itemId":"thrown-stack","quantity":2}]';
    after.quickslotsJson = '[{"slot":0,"itemId":"thrown-stack"}]';
    after.ankhCount = 1;
    after.blessedAnkhCount = 0;
    after.runProgressBundle = "native-progress-after-nonlethal-attack";
    after.potionStatusBundle = "native-potions-after-attack";
    after.scrollStatusBundle = "native-scrolls-after-attack";
    after.notesBundle = "native-notes-after-attack";
    after.questStateBundle = "native-quests-after-attack";
    after.ironKeyCount = 1;
    const merged = mergeNativeCombatAttackerState(before, before, JSON.stringify(after), {
      hp: 20, ht: 20, pos: 12, state: "ALIVE"
    }, false);
    expect(merged).not.toBeNull();
    const saved = JSON.parse(String(merged));
    expect(saved.runProgressBundle).toBe("native-progress-after-nonlethal-attack");
    expect(saved.questStateBundle).toBe("native-quests-after-attack");
    expect(saved.notesBundle).toBe("native-notes-after-attack");
    expect(saved.potionStatusBundle).toBe("native-potions-after-attack");
    expect(saved.scrollStatusBundle).toBe("native-scrolls-after-attack");
    expect(saved.inventoryBundle).toBe("native-inventory-after-throw");
    expect(saved.inventoryItemsJson).toBe(after.inventoryItemsJson);
    expect(saved.nativeItemEconomyJson).toBe(after.nativeItemEconomyJson);
    expect(saved.quickslotsJson).toBe(after.quickslotsJson);
    expect(saved.ironKeyCount).toBe(1);
  });

  it("commits run-scoped Ankh use statistics with a validated blessed rescue", () => {
    const before = JSON.parse(heroState("run-before-ankh"));
    before.hp = 2;
    before.ankhCount = 1;
    before.blessedAnkhCount = 1;
    before.inventoryBundle = "inventory-before-ankh";
    const after = {
      ...before,
      hp: 5,
      inventoryBundle: "inventory-after-ankh",
      inventoryItemsJson: "[]",
      quickslotsJson: "[]",
      ankhCount: 0,
      blessedAnkhCount: 0,
      runProgressBundle: "run-after-ankh",
      notesBundle: "notes-after-ankh",
      questStateBundle: "quests-after-ankh"
    };
    const merged = mergeNativeHeroState(JSON.stringify(before), JSON.stringify(after),
      { hp: 5, ht: 20, pos: 12, shielding: 0 }, "[]", true, true, true, false);
    expect(merged).not.toBeNull();
    const saved = JSON.parse(String(merged));
    expect(saved.inventoryBundle).toBe("inventory-after-ankh");
    expect(saved.ankhCount).toBe(0);
    expect(saved.blessedAnkhCount).toBe(0);
    expect(saved.inventoryItemsJson).toBe("[]");
    expect(saved.quickslotsJson).toBe("[]");
    expect(saved.runProgressBundle).toBe("run-after-ankh");
    expect(saved.notesBundle).toBe("notes-after-ankh");
    expect(saved.questStateBundle).toBe("quests-after-ankh");
  });

  it("rejects an oversized or non-string opaque native run bundle", () => {
    const valid = JSON.parse(heroState("bounded-native-run-state"));
    expect(isValidNativeHeroStateJson(JSON.stringify(valid),
      { hp: 20, ht: 20, pos: 12, shielding: 0 })).toBe(true);
    expect(isValidNativeHeroStateJson(JSON.stringify({ ...valid, runProgressBundle: 8 }),
      { hp: 20, ht: 20, pos: 12, shielding: 0 })).toBe(false);
    expect(isValidNativeHeroStateJson(JSON.stringify({ ...valid, runProgressBundle: "x".repeat(200001) }),
      { hp: 20, ht: 20, pos: 12, shielding: 0 })).toBe(false);
    expect(isValidNativeHeroStateJson(JSON.stringify({ ...valid, questStateBundle: 8 }),
      { hp: 20, ht: 20, pos: 12, shielding: 0 })).toBe(false);
    expect(isValidNativeHeroStateJson(JSON.stringify({ ...valid, notesBundle: "x".repeat(200001) }),
      { hp: 20, ht: 20, pos: 12, shielding: 0 })).toBe(false);
    expect(isValidNativeHeroStateJson(JSON.stringify({ ...valid, ironKeyCount: -1 }),
      { hp: 20, ht: 20, pos: 12, shielding: 0 })).toBe(false);
  });

  it("creates stable receipts for direct and secondary Mob deaths only", () => {
    const rewards = nativeMobKillRewardIds(6, "native-mob-target-0001", 0, [
      { entityId: "native-mob-secondary-01", hpAfter: 0 },
      { entityId: "native-mob-survivor-01", hpAfter: 4 }
    ]);
    expect(rewards).toEqual([
      "mob-kill:6:native-mob-target-0001",
      "mob-kill:6:native-mob-secondary-01"
    ]);
    expect(nativeMobKillRewardIds(6, "native-mob-target-0001", 4, [])).toEqual([]);
    expect(nativeMobKillRewardIds(6, "native-mob-target-0001", 0, [
      { entityId: "native-mob-target-0001", hpAfter: 0 }
    ])).toBeNull();
  });

  it("rejects replayed stable reward receipts even when a request ID changes", () => {
    const first = nativeMobKillRewardIds(3, "native-mob-stable-0001", 0, []);
    expect(areNativeMobRewardClaimsAvailable(first, [])).toBe(true);
    expect(areNativeMobRewardClaimsAvailable(first, first)).toBe(false);
    expect(areNativeMobRewardClaimsAvailable(first, ["another-reward"])).toBe(true);
    expect(areNativeMobRewardClaimsAvailable(["same-reward", "same-reward"], [])).toBe(false);
    expect(areNativeMobRewardClaimsAvailable(null, [])).toBe(false);
  });
});


describe("Native Poison LifeLink Mob event correlation", () => {
  const linkClass = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LifeLink";
  const ratClass = "com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat";
  const mobBundle = (id:number,hp:number) => JSON.stringify({mob:{
    __className:ratClass,id,time:9,HP:hp,HT:20,pos:25,buffs:[]
  }});
  const heroWithLink = () => ({
    hp:10,ht:20,pos:9,shielding:0,gold:0,alchemyEnergy:5,
    inventoryBundle:"native-inventory",inventoryItemsJson:"[]",quickslotsJson:"[]",
    notesBundle:"notes",questStateBundle:"quests",ankhCount:0,blessedAnkhCount:0,
    cooldown:1,combatBundle:JSON.stringify({time:10,STR:10,items:"native-inventory",buffs:[]}),
    buffCount:1,
    buff_0:JSON.stringify({buff:{__className:linkClass,id:45,time:9,object:7}}),
    buffCooldown_0:0
  });
  const makeEvidence = (hpAfter=18, dead=false) => {
    const entityId="linked-mob-stable-0001";
    const before=mobBundle(7,20);
    const afterEvidence=mobBundle(7,hpAfter);
    const delta:any={
      entityId,actorId:7,
      hpBefore:20,htBefore:20,posBefore:25,shieldBefore:0,buffsBefore:"[]",
      hpAfter,htAfter:20,posAfter:25,shieldAfter:0,buffsAfter:"[]",
      serializedBundleBefore:before,
      serializedBundleAfter:dead?before:afterEvidence
    };
    const currentMobs=dead?[]:[{
      mobId:7,entityId,hp:hpAfter,ht:20,pos:25,shielding:0,buffs:[],
      serializedBundle:afterEvidence
    }];
    const heaps:any[]=dead?[{pos:25,items:[]}]:[];
    const eventPayload:any={
      targetId:entityId,targetType:"MOB",
      targetHpBefore:20,targetHtBefore:20,targetHp:hpAfter,targetHt:20,
      targetPosBefore:25,targetPosAfter:25,targetShieldBefore:0,targetShieldAfter:0,
      targetBuffsBefore:"[]",targetBuffs:"[]",
      targetMobBundleAfter:dead?null:afterEvidence,
      nativeActorId:7,nativeMobBundleBefore:before,
      nativeMobBundleAfterEvidence:afterEvidence,
      nativeMobRewardClassName:ratClass,nativeMobRewardEligible:true,nativeMobRewardExp:0,
      nativeMobRewardMaxLevel:29,nativeMobRewardSpawningWeight:1,nativeMobRewardMonkEnergy:1,
      sourceType:"ENVIRONMENT",sourceClass:linkClass,engineResolved:true,
      ...(dead?{heaps}:{})
    };
    const event={sequence:12,sender_id:"publisher",event_type:"CHAR_DAMAGED",payload:JSON.stringify(eventPayload)};
    const payload={complete:true,deltas:[delta],...(dead?{heaps:JSON.stringify(heaps)}:{})};
    return {payload,currentMobs,heaps,event,eventPayload};
  };

  it("extracts unique native LifeLink Actor IDs and resolves a removed Mob from its accepted death event",()=>{
    const hero=heroWithLink();
    expect(nativeHeroBuffLifeLinkMobActorIds(JSON.stringify(hero))).toEqual([7]);
    const duplicate={...hero,buffCount:2,
      buff_1:JSON.stringify({buff:{__className:linkClass,id:46,time:9,object:7}}),
      buffCooldown_1:0};
    expect(nativeHeroBuffLifeLinkMobActorIds(JSON.stringify(duplicate))).toBeNull();
    const sample=makeEvidence(0,true);
    expect(nativeHeroBuffLifeLinkMobEntityIds(JSON.stringify(hero),{mobs:[]},[sample.event]))
      .toEqual(["linked-mob-stable-0001"]);
    expect(nativeHeroBuffLifeLinkMobEntityIds(JSON.stringify(hero),{mobs:[]},[])).toBeNull();
  });

  it("accepts a live Mob only when its post-state is already committed in the trusted snapshot",()=>{
    const sample=makeEvidence();
    const result=parseAndValidateNativeLifeLinkMobDamageEvidence(
      sample.payload,sample.currentMobs,[7],[sample.event],sample.heaps,64,8,10,"publisher");
    expect(result?.deltas).toHaveLength(1);
    expect(sample.currentMobs[0].hp).toBe(18);
    expect(sample.currentMobs[0].serializedBundle).toBe(mobBundle(7,18));
  });

  it("accepts a death only when the Mob is already absent and the final heaps match",()=>{
    const sample=makeEvidence(0,true);
    const result=parseAndValidateNativeLifeLinkMobDamageEvidence(
      sample.payload,sample.currentMobs,[7],[sample.event],sample.heaps,64,8,10,"publisher");
    expect(result?.deltas[0].hpAfter).toBe(0);
    expect(parseAndValidateNativeLifeLinkMobDamageEvidence(
      sample.payload,sample.currentMobs,[7],[sample.event],[],64,8,10,"publisher")).toBeNull();
    const alteredHeaps=[{pos:26,items:[]}];
    expect(parseAndValidateNativeLifeLinkMobDamageEvidence(
      {...sample.payload,heaps:JSON.stringify(alteredHeaps)},sample.currentMobs,[7],[sample.event],
      alteredHeaps,64,8,10,"publisher")).toBeNull();
  });

  it("rejects duplicate, stale, foreign, unlinked, and forged event evidence",()=>{
    const sample=makeEvidence();
    const parse=(payload:any=sample.payload,events:any[]=[sample.event],actors:number[]=[7],baseline=10,sender="publisher")=>
      parseAndValidateNativeLifeLinkMobDamageEvidence(
        payload,sample.currentMobs,actors,events,sample.heaps,64,8,baseline,sender);
    expect(parse(sample.payload,[sample.event,sample.event])).toBeNull();
    expect(parse(sample.payload,[{...sample.event,sequence:10}])).toBeNull();
    expect(parse(sample.payload,[{...sample.event,sender_id:"another-publisher"}])).toBeNull();
    expect(parse(sample.payload,[sample.event],[8])).toBeNull();
    expect(parse({complete:true,deltas:[{...sample.payload.deltas[0],serializedBundleBefore:mobBundle(8,20)}]})).toBeNull();
    expect(parse(sample.payload,[{...sample.event,payload:JSON.stringify({
      ...sample.eventPayload,nativeMobBundleBefore:mobBundle(8,20)
    })}])).toBeNull();
    const dead=makeEvidence(0,true);
    const forgedRewardEvent={...dead.event,payload:JSON.stringify({
      ...dead.eventPayload,nativeMobRewardExp:999,nativeMobRewardClassName:"forged.Mob"
    })};
    expect(parseAndValidateNativeLifeLinkMobDamageEvidence(
      dead.payload,dead.currentMobs,[7],[forgedRewardEvent],dead.heaps,64,8,10,"publisher")).toBeNull();
  });

  it("rejects a matching event when the current Mob snapshot still contains the pre-damage state",()=>{
    const sample=makeEvidence();
    const staleMobs=[{...sample.currentMobs[0],hp:20,serializedBundle:mobBundle(7,20)}];
    expect(parseAndValidateNativeLifeLinkMobDamageEvidence(
      sample.payload,staleMobs,[7],[sample.event],sample.heaps,64,8,10,"publisher")).toBeNull();
  });
});


describe("Native LifeLink death XP and MonkEnergy reward transition", () => {
  const poisonClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison";
  const lifeLinkClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LifeLink";
  const ascensionClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.AscensionChallenge";
  const monkEnergyClass="com.shatteredpixel.shatteredpixeldungeon.actors.buffs.MonkEnergy";
  const ratClass="com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat";
  const deadActorId=7;
  const bundle=JSON.stringify({mob:{__className:ratClass,id:deadActorId,HP:1,HT:20,pos:25,buffs:[]}});
  const rewardEvent=(overrides:Record<string,any>={})=>({
    sequence:12,sender_id:"publisher",event_type:"CHAR_DAMAGED",
    payload:JSON.stringify({
      targetId:"dead-linked-mob-0001",targetType:"MOB",targetHpBefore:1,targetHp:0,
      nativeActorId:deadActorId,nativeMobBundleBefore:bundle,nativeMobBundleAfterEvidence:bundle,
      sourceType:"ENVIRONMENT",sourceClass:lifeLinkClass,
      nativeMobRewardClassName:ratClass,nativeMobRewardEligible:true,nativeMobRewardExp:2,
      nativeMobRewardMaxLevel:29,nativeMobRewardSpawningWeight:1,nativeMobRewardMonkEnergy:1,
      ...overrides
    })
  });
  const makeHero=(options:{
    subClass?:string;level?:number;exp?:number;expAfter?:number;energy?:number|null;
    includeAscension?:boolean;unencumberedSpirit?:number;poisonAfter?:boolean;
  }={})=>{
    const level=options.level ?? 1, subClass=options.subClass ?? "NONE";
    const rowsBefore:any[]=[
      {className:poisonClass,id:44,time:9,data:{left:9}},
      {className:lifeLinkClass,id:45,time:9,data:{object:deadActorId}}
    ];
    if(options.includeAscension) rowsBefore.push({
      className:ascensionClass,id:46,time:9,data:{}
    });
    if(options.energy!==null && options.energy!==undefined) rowsBefore.push({
      className:monkEnergyClass,id:56,time:9,data:{energy:options.energy,cooldown:0}
    });
    const rowsAfter:any[]=[
      {className:poisonClass,id:44,time:10,data:{left:8}}
    ];
    if(options.includeAscension) rowsAfter.push({
      className:ascensionClass,id:46,time:9,data:{}
    });
    if(options.energy!==null && options.energy!==undefined) rowsAfter.push({
      className:monkEnergyClass,id:56,time:9,data:{energy:options.energy,cooldown:0}
    });
    const create=(exp:number,rows:any[],cooldown=1)=>{
      const combat:any={
        id:21,time:10,lvl:level,exp,subClass,STR:10,items:"native-inventory",buffs:[],
        talents_tier_1:{},talents_tier_2:{},
        talents_tier_3:options.unencumberedSpirit
          ? {UNENCUMBERED_SPIRIT:options.unencumberedSpirit} : {},
        talents_tier_4:{}
      };
      const state:any={
        hp:9,ht:20,pos:9,shielding:0,gold:0,alchemyEnergy:5,
        inventoryBundle:"native-inventory",inventoryItemsJson:"[]",quickslotsJson:"[]",
        notesBundle:"notes",questStateBundle:"quests",ankhCount:0,blessedAnkhCount:0,
        cooldown,combatBundle:JSON.stringify(combat),buffCount:rows.length
      };
      rows.forEach((row,index)=>{
        state["buff_"+index]=JSON.stringify({buff:{
          __className:row.className,id:row.id,time:row.time,...row.data
        }});
        state["buffCooldown_"+index]=Math.max(0,row.time-9);
      });
      return state;
    };
    return {before:create(options.exp ?? 0,rowsBefore),after:create(options.expAfter ?? (options.exp ?? 0)+2,rowsAfter),
      rowsBefore,rowsAfter};
  };
  const data={buffClass:poisonClass,sequenceBefore:10};
  const levelSnapshot={levelClass:"com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel"};

  it("accepts only the exact non-level-up native EXP amount from an accepted linked Mob death",()=>{
    const fixture=makeHero({exp:0});
    const result=validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[rewardEvent()],[deadActorId],levelSnapshot);
    expect(result).toEqual({allowExperienceChange:true,allowMonkEnergyChange:false});
    const forged=makeHero({exp:0});
    forged.after.combatBundle=JSON.stringify({...JSON.parse(forged.after.combatBundle),exp:3});
    expect(validateNativeLifeLinkDeathRewardTransition(
      forged.before,forged.after,data,[rewardEvent()],[deadActorId],levelSnapshot)).toBeNull();
  });

  it("reconciles linked Mob EXP and MonkEnergy when the same Poison hit kills the Hero",()=>{
    const fixture=makeHero({subClass:"MONK",exp:0,energy:0});
    fixture.after.hp=0;
    fixture.after.combatBundle=JSON.stringify({
      ...JSON.parse(fixture.after.combatBundle),exp:2,HP:0,HT:20,pos:9
    });
    // Hero.damage() publishes from inside Char.damage(), before Poison.act() spends its turn.
    // The Poison actor row therefore remains byte-for-byte unchanged in this intermediate state.
    fixture.after.buffCount=2;
    fixture.after.buff_0=fixture.before.buff_0;
    fixture.after.buffCooldown_0=fixture.before.buffCooldown_0;
    fixture.after.buff_1=JSON.stringify({buff:{
      __className:monkEnergyClass,id:56,time:9,energy:1,cooldown:0
    }});
    fixture.after.buffCooldown_1=0;

    const result=validateNativeLifeLinkEnvironmentDeathRewardTransition(
      fixture.before,fixture.after,[rewardEvent()],[deadActorId],10,levelSnapshot);
    expect(result).toEqual({allowExperienceChange:true,allowMonkEnergyChange:true});

    const merged=mergeNativeLifeLinkDeathExperienceBundle(
      fixture.before.combatBundle,fixture.after.combatBundle,true);
    expect(JSON.parse(String(merged)).exp).toBe(2);
    expect(JSON.parse(String(merged)).HP).toBeUndefined();

    const forgedExp={...fixture.after,combatBundle:JSON.stringify({
      ...JSON.parse(fixture.after.combatBundle),exp:3
    })};
    expect(validateNativeLifeLinkEnvironmentDeathRewardTransition(
      fixture.before,forgedExp,[rewardEvent()],[deadActorId],10,levelSnapshot)).toBeNull();

    const unrelatedMutation={...fixture.after,combatBundle:JSON.stringify({
      ...JSON.parse(fixture.after.combatBundle),STR:99
    })};
    expect(validateNativeLifeLinkEnvironmentDeathRewardTransition(
      fixture.before,unrelatedMutation,[rewardEvent()],[deadActorId],10,levelSnapshot)).toBeNull();
    expect(mergeNativeLifeLinkDeathExperienceBundle(
      fixture.before.combatBundle,unrelatedMutation.combatBundle,true)).toBeNull();
  });

  it("rejects an unproven LifeLink detach and keeps EXP fixed without linked Mob deaths",()=>{
    const fixture=makeHero({subClass:"MONK",exp:0,energy:0});
    fixture.after.hp=0;
    fixture.after.combatBundle=JSON.stringify({
      ...JSON.parse(fixture.after.combatBundle),HP:0,HT:20,pos:9
    });
    fixture.after.buffCount=1;
    fixture.after.buff_0=fixture.before.buff_0;
    fixture.after.buffCooldown_0=fixture.before.buffCooldown_0;
    expect(validateNativeLifeLinkEnvironmentDeathRewardTransition(
      fixture.before,fixture.after,[],[],10,levelSnapshot)).toBeNull();

    const liveLinkHero=makeHero({exp:0,expAfter:0,energy:null});
    liveLinkHero.after.hp=0;
    liveLinkHero.after.combatBundle=JSON.stringify({
      ...JSON.parse(liveLinkHero.after.combatBundle),HP:0,HT:20,pos:9
    });
    // Hero.damage() runs inside Poison.act(); neither Poison's duration nor LifeLink
    // may be advanced/removed before this intermediate lethal Hero snapshot is sent.
    liveLinkHero.after.buffCount=2;
    liveLinkHero.after.buff_0=liveLinkHero.before.buff_0;
    liveLinkHero.after.buffCooldown_0=liveLinkHero.before.buffCooldown_0;
    liveLinkHero.after.buff_1=liveLinkHero.before.buff_1;
    liveLinkHero.after.buffCooldown_1=liveLinkHero.before.buffCooldown_1;
    expect(validateNativeLifeLinkEnvironmentDeathRewardTransition(
      liveLinkHero.before,liveLinkHero.after,[],[],10,levelSnapshot))
      .toEqual({allowExperienceChange:false,allowMonkEnergyChange:false});
    expect(mergeNativeLifeLinkDeathExperienceBundle(
      liveLinkHero.before.combatBundle,JSON.stringify({
        ...JSON.parse(liveLinkHero.after.combatBundle),exp:1
      }),false)).toBeNull();

    const noRewardHero=makeHero({exp:0,energy:null});
    expect(mergeNativeLifeLinkDeathExperienceBundle(
      noRewardHero.before.combatBundle,JSON.stringify({
        ...JSON.parse(noRewardHero.after.combatBundle),exp:1
      }),false)).toBeNull();
  });

  it("uses the native AscensionChallenge fallback EXP formula when the Hero exceeds Mob.maxLvl",()=>{
    const fixture=makeHero({level:2,exp:0,includeAscension:true});
    const event=rewardEvent({
      nativeMobRewardExp:1,nativeMobRewardMaxLevel:1,nativeMobRewardSpawningWeight:1.2
    });
    fixture.after.combatBundle=JSON.stringify({...JSON.parse(fixture.after.combatBundle),exp:12});
    const result=validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[event],[deadActorId],levelSnapshot);
    expect(result).toEqual({allowExperienceChange:true,allowMonkEnergyChange:false});
  });

  it("rejects level-up XP transitions until Hero.updateHT and its callbacks have a complete contract",()=>{
    const fixture=makeHero({exp:8});
    fixture.after.combatBundle=JSON.stringify({...JSON.parse(fixture.after.combatBundle),lvl:2,exp:0});
    expect(validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[rewardEvent()],[deadActorId],levelSnapshot)).toBeNull();
  });

  it("accepts exact base MonkEnergy gain and its native cap without Unencumbered Spirit",()=>{
    const fixture=makeHero({subClass:"MONK",exp:0,energy:0});
    fixture.after.buffCount=2;
    fixture.after.buff_1=JSON.stringify({buff:{
      __className:monkEnergyClass,id:56,time:9,energy:1,cooldown:0
    }});
    fixture.after.buffCooldown_1=0;
    const result=validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[rewardEvent()],[deadActorId],levelSnapshot);
    expect(result).toEqual({allowExperienceChange:true,allowMonkEnergyChange:true});
    fixture.after.buff_1=JSON.stringify({buff:{
      __className:monkEnergyClass,id:56,time:9,energy:2,cooldown:0
    }});
    expect(validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[rewardEvent()],[deadActorId],levelSnapshot)).toBeNull();
  });

  it("sums two accepted linked Mob deaths and applies both native MonkEnergy rewards once",()=>{
    const fixture=makeHero({subClass:"MONK",exp:0,energy:0});
    const existingEnergyBefore=fixture.before.buff_2;
    const existingEnergyCooldown=fixture.before.buffCooldown_2;
    fixture.before.buffCount=4;
    fixture.before.buff_2=JSON.stringify({buff:{
      __className:lifeLinkClass,id:46,time:9,object:8
    }});
    fixture.before.buffCooldown_2=0;
    fixture.before.buff_3=existingEnergyBefore;
    fixture.before.buffCooldown_3=existingEnergyCooldown;

    const secondBefore=JSON.stringify({mob:{
      __className:ratClass,id:8,HP:1,HT:20,pos:26,buffs:[]
    }});
    const secondAfter=JSON.stringify({mob:{
      __className:ratClass,id:8,HP:0,HT:20,pos:26,buffs:[]
    }});
    const secondEvent=rewardEvent({
      targetId:"dead-linked-mob-0002",
      nativeActorId:8,
      nativeMobBundleBefore:secondBefore,
      nativeMobBundleAfterEvidence:secondAfter,
      nativeMobRewardExp:3
    });
    secondEvent.sequence=13;

    fixture.after.combatBundle=JSON.stringify({
      ...JSON.parse(fixture.after.combatBundle),exp:5
    });
    fixture.after.buffCount=2;
    fixture.after.buff_1=JSON.stringify({buff:{
      __className:monkEnergyClass,id:56,time:9,energy:2,cooldown:0
    }});
    fixture.after.buffCooldown_1=0;

    const result=validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[rewardEvent(),secondEvent],[deadActorId,8],levelSnapshot);
    expect(result).toEqual({allowExperienceChange:true,allowMonkEnergyChange:true});
    expect(validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[rewardEvent()],[deadActorId,8],levelSnapshot)).toBeNull();
    expect(validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[rewardEvent(),secondEvent,secondEvent],
      [deadActorId,8],levelSnapshot)).toBeNull();
  });

  it("applies MonkEnergy's per-kill cap and rejects unsupported talent multipliers",()=>{
    const fixture=makeHero({subClass:"MONK",exp:0,energy:9});
    fixture.after.buffCount=2;
    fixture.after.buff_1=JSON.stringify({buff:{
      __className:monkEnergyClass,id:56,time:9,energy:10,cooldown:0
    }});
    fixture.after.buffCooldown_1=0;
    expect(validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[rewardEvent()],[deadActorId],levelSnapshot))
      .toEqual({allowExperienceChange:true,allowMonkEnergyChange:true});
    const talented=makeHero({subClass:"MONK",exp:0,energy:0,unencumberedSpirit:1});
    talented.after.buffCount=2;
    talented.after.buff_1=JSON.stringify({buff:{
      __className:monkEnergyClass,id:56,time:9,energy:2,cooldown:0
    }});
    talented.after.buffCooldown_1=0;
    expect(validateNativeLifeLinkDeathRewardTransition(
      talented.before,talented.after,data,[rewardEvent()],[deadActorId],levelSnapshot)).toBeNull();
  });

  it("adds the MonkEnergy Buff with zero gain when native Regeneration is disabled",()=>{
    const fixture=makeHero({subClass:"MONK",exp:0});
    fixture.before.buffCount=3;
    fixture.before.buff_2=JSON.stringify({buff:{
      __className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LockedFloor",
      id:47,time:9,left:0
    }});
    fixture.before.buffCooldown_2=0;
    fixture.after.buffCount=3;
    fixture.after.buff_1=JSON.stringify({buff:{
      __className:monkEnergyClass,id:57,time:9,energy:0,cooldown:0
    }});
    fixture.after.buffCooldown_1=0;
    fixture.after.buff_2=JSON.stringify({buff:{
      __className:"com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LockedFloor",
      id:47,time:9,left:0
    }});
    fixture.after.buffCooldown_2=0;
    expect(validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,[rewardEvent()],[deadActorId],levelSnapshot))
      .toEqual({allowExperienceChange:true,allowMonkEnergyChange:true});
  });

  it("rejects foreign, stale, duplicate, or unproven reward events",()=>{
    const fixture=makeHero({exp:0});
    const parse=(events:any[]= [rewardEvent()])=>validateNativeLifeLinkDeathRewardTransition(
      fixture.before,fixture.after,data,events,[deadActorId],levelSnapshot);
    expect(parse([{...rewardEvent(),sequence:10}])).toBeNull();
    expect(parse([{...rewardEvent(),sender_id:""}])).toBeNull();
    expect(parse([rewardEvent(),rewardEvent()])).toBeNull();
    expect(parse([{...rewardEvent(),payload:JSON.stringify({
      ...JSON.parse(rewardEvent().payload),nativeMobRewardClassName:"forged.Rat"
    })}])).toBeNull();
  });
});
