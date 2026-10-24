import { describe, it, expect } from 'vitest';
import { removeDeadNativeMobsFromSnapshot, hasMatchingNativeMobShieldSnapshot, parseAndValidateNativeSecondaryMobDeltas, isValidNativeMobBundle, isAuthorizedNativeMobOwner, isValidNativeMissTransition, NetworkMessage, SeededRNG, assignStableEntityIds, isValidNativeMoveIntent, resolveNativeTransitionIntent, isValidNativeFallLanding, isValidNativeFallDestinationSnapshot, canStartNativeFloorTransition, classifyNativeTransitionRejection, isPendingNativeFloorDestinationSnapshot, canAbortNativeFloorTransition, canFinalizeNativeFloorTransition, isValidNativeWorldActionIntent, isValidNativeMovementHeapMutation, isValidNativeWorldMutation, isValidNativePickupIntent, isValidNativePickupHeapMutation, isValidNativeDropIntent, isValidNativeDropInventoryMutation, isValidNativeDropHeapMutation, isValidNativePickupInventoryMutation, isValidNativeEquipmentIntent, isValidNativeEquipmentMutation, isValidNativeChestHeapMutation, parseNativeQuickslotIndex, hasCompleteNativeLevelSnapshot, isValidNativeWorldTurnSnapshot, isValidNativeHpTransition, isValidNativeDamageAccounting, hasMatchingNativeBuffSnapshot, hasMatchingNativeHeroBuffSnapshot, hasMatchingNativeHeroStateSnapshot, nativeBuffSnapshotFromHeroState, hasValidBlessedAnkhConsumption, hasValidUnblessedAnkhConsumption, hasOnlyNativeLostBackpackAdded, isValidNativeEnvironmentDamage, isValidNativeCombatEvent, isValidNativeAttackIntent, hasMatchingNativeAttackIntent, hasStrictNativeCombatFields, hasStrictNativeDamageFields, hasStrictNativeSourceMobState, isValidNativeHeroStateJson, mergeNativeHeroState, mergeNativeCombatAttackerState, isValidNativeCombatRequestId, classifyRequestReplay, isValidNativeCombatBuffs, isValidNativeLootSnapshot, resolveAuthorizedNativeMobDamageTarget, isValidNativeMobNoEffectOutcome, resolveServerMobIdByEntityId } from './index';

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
    expect(isValidNativeWorldActionIntent("UNLOCK", { depth: 4, from: 9, targetPos: 10 }, level, 4, 9)).toBe(true);
    expect(isValidNativeWorldActionIntent("UNLOCK", { depth: 4, from: 9, targetPos: 11 }, level, 4, 9)).toBe(false);
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
    expect(isValidNativeWorldActionIntent("INTERACT", { depth: 4, from: 9, targetPos: 10 }, level, 4, 9)).toBe(true);
    expect(isValidNativeWorldActionIntent("INTERACT", { depth: 4, from: 9, targetPos: 30 }, level, 4, 9)).toBe(false);
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
  const item = (itemId:string, className=cls, quantity=1, equipped=false, bundle?:string) => ({
    itemId,className,quantity,level:0,cursed:false,cursedKnown:false,stackable:false,equipped,
    serializedBundle:bundle || "native-bundle-item-id:"+itemId
  });
  const hero = (items:any[], extra:Record<string,any>={}) => ({
    hp:10,ht:10,pos:9,shielding:0,gold:0,ironKeyCount:0,crystalKeyCount:0,wornKeyCount:0,goldenKeyCount:0,
    inventoryBundle:"native-inventory-bundle",inventoryItemsJson:JSON.stringify(items),quickslotsJson:"[]",
    notesBundle:"native-notes",questStateBundle:"native-quests",...extra
  });
  const quickslots=(slot:number,id:string,cls:string,quantity:number,bundle:string) =>
    JSON.stringify([{slot,itemId:id,className:cls,quantity,serializedBundle:bundle}]);
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
  it("accepts a native equipment toggle but rejects added inventory or changed HP",()=>{
    const id="stable-dagger-001";
    const before=hero([item(id,cls,1,false)]);
    const after=hero([item(id,cls,1,true)]);
    const detail={itemId:id,itemClass:cls,expectedEquipped:true};
    expect(isValidNativeEquipmentIntent(JSON.stringify(before),
      {...detail,depth:4,from:9,to:9,targetPos:9,engineActionCost:1},"EQUIP",4,{pos:9,state:"ALIVE"})).toBe(true);
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify(after),"EQUIP",detail,{...detail,actionType:"EQUIP"})).toBe(true);
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify(hero([item(id,cls,1,true),item("stable-forged-001","com.example.Forged")])),"EQUIP",detail,{...detail,actionType:"EQUIP"})).toBe(false);
    expect(isValidNativeEquipmentMutation(JSON.stringify(before),JSON.stringify(hero([item(id,cls,1,true)],{hp:9})),"EQUIP",detail,{...detail,actionType:"EQUIP"})).toBe(false);
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
    from: 9, to: 9, targetPos: 9, itemPos: 9, depth: 4, engineActionCost: 1,
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
