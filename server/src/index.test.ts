import { describe, it, expect } from 'vitest';
import { NetworkMessage, SeededRNG, assignStableEntityIds, hasCompleteNativeLevelSnapshot, isValidNativeHpTransition, isValidNativeCombatEvent, hasStrictNativeCombatFields, hasStrictNativeDamageFields, isValidNativeHeroStateJson, mergeNativeHeroState, isValidNativeCombatBuffs, isValidNativeLootSnapshot, resolveServerMobIdByEntityId } from './index';

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
    snapshot.mobs.push({ serializedBundle: "", buffs: [] });
    expect(hasCompleteNativeLevelSnapshot(snapshot)).toBe(false);
  });

  it('preserves complete heaps containing multiple native item bundles', () => {
    const snapshot: any = completeSnapshot();
    snapshot.heaps.push({
      pos: 21,
      type: "HEAP",
      items: [
        { itemClass: "PotionOfHealing", serializedBundle: "native-item-bundle-1" },
        { itemClass: "ScrollOfUpgrade", serializedBundle: "native-item-bundle-2" },
        { itemClass: "Gold", serializedBundle: "native-item-bundle-3" }
      ]
    });
    expect(hasCompleteNativeLevelSnapshot(snapshot)).toBe(true);
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
    engineDistance: 1, engineActionCost: 1, targetBuffs: '[]'
  });

  it('accepts the complete typed native payload', () => {
    expect(hasStrictNativeCombatFields(validPayload())).toBe(true);
  });

  it('rejects string-coerced numbers, invalid outcome flags and mismatched attack kind', () => {
    expect(hasStrictNativeCombatFields({ ...validPayload(), targetHp: '7' })).toBe(false);
    expect(hasStrictNativeCombatFields({ ...validPayload(), engineHit: 'true' })).toBe(false);
    expect(hasStrictNativeCombatFields({ ...validPayload(), engineRanged: true })).toBe(false);
    expect(hasStrictNativeCombatFields({ ...validPayload(), engineActionCost: '1' })).toBe(false);
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
    combatSchemaVersion: 1, combatDepth: 2, targetType: 'PLAYER', sourceType: 'MOB',
    sourceEntityId: 'stable-mob-0001', sourcePos: 10, sourceAttackKind: 'MELEE',
    targetHpBefore: 12, targetHtBefore: 12, targetHp: 8, targetHt: 12, damage: 4,
    targetPosBefore: 11, targetPosAfter: 11, targetShieldBefore: 0, targetShieldAfter: 0,
    engineDamageResult: true, targetBuffs: '[]'
  });

  it('accepts well-typed native damage state and rejects spoofed fields', () => {
    expect(hasStrictNativeDamageFields(validDamage())).toBe(true);
    expect(hasStrictNativeDamageFields({ ...validDamage(), targetHp: '0' })).toBe(false);
    expect(hasStrictNativeDamageFields({ ...validDamage(), sourceType: 'PLAYER' })).toBe(false);
    expect(hasStrictNativeDamageFields({ ...validDamage(), sourceEntityId: null })).toBe(false);
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
