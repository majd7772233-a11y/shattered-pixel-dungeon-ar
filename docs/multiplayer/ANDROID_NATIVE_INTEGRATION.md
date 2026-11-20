# Android and Native SPD Integration Reference

> Baseline source commit: eb2075b3f09ca4779773140b7e6539a6655f6824. This page describes the observed Java/libGDX integration and Android adapter at that exact branch state. Re-open source before editing because line numbers and behavior can change.

## 1. Integration principle

The game remains a native Java/libGDX Shattered Pixel Dungeon application. Multiplayer code must orchestrate the existing engine rather than recreate its gameplay rules in a second simulation.

The native engine remains the reference for:
- Hero and Mob action processing;
- hit chance, damage, armor, shields, procs and death;
- Actor time, cooldown and scheduler ordering;
- Mob AI and targeting;
- item use, inventory, equipment and quickslots;
- Buff attach/tick/detach callbacks and timed expiry;
- Level generation, geometry, floor transitions and native metadata;
- sprites, map updates and rendering.

The multiplayer layer adds action capture, authority selection, identity mapping, publication, validation metadata, replica reconciliation and recovery. A class being present or an action having an enum value is not proof that the whole path is implemented.

## 2. Threading boundary

The transport layer can invoke callbacks away from the libGDX render thread. At the Phase 10-E closeout, MessageRouter explicitly routes all 25 canonical MessageType values. It schedules native-state work on Game.runOnRenderThread(...) for:
- EVENT_BATCH and SNAPSHOT application;
- PLAYER_JOINED remote-Actor creation/update;
- PLAYER_LEFT disconnect cleanup;
- READY room-metadata updates;
- COMBAT_REQUEST and ACTION_ACCEPTED.

PING is consumed as transport liveness only; CHAT and known non-inbound values do not mutate game state. Unknown future message values fail closed. RemotePlayerActionReceiver is retained for explicitly invoked native Hero setup/legacy helper duties and is not a generic default outer-message route.

Treat these as separate stages:
1. Decode and validate immutable wire data without mutating native world state.
2. Queue state changes onto the game/render thread.
3. Re-check that the session and target scene are still valid.
4. Apply native Actor, Dungeon, Hero, Mob, Level, sprite and inventory changes in sequence.
5. Advance the applied sequence only after the required state application has succeeded.
6. Request resync if preconditions no longer match.

Do not access Dungeon.level, Actor collections, native Bundles, Hero inventory, sprites or GameScene collections from arbitrary transport worker threads. A future event-router refactor must preserve deterministic event ordering and render-thread ownership.

### Phase 14-B1 - transport/session callback ownership

- MultiplayerManager.callbackFor() binds each callback to both the exact NetworkTransport object and the captured sessionGeneration.
- The identity/generation check and callback dispatch execute under the same manager monitor as startSession(), reconnectInternetSession() and endSession(). This removes the check-then-dispatch gap that could otherwise admit an old SESSION after replacement.
- The callback entrypoints onConnected, onDisconnected, onMessageReceived and onError are synchronized. Cross-thread readers use volatile session-active, local-player and session-token fields.
- InternetTransport gives each asynchronous connection attempt its own generation. Cancellation closes a TCP socket even while HTTP Upgrade is pending, and stale workers cannot install sockets/streams, write control frames or notify a newer attempt.
- External callbacks are never invoked while holding the InternetTransport monitor. Keep this lock ordering when adding transport lifecycle work.
- The isConnected callback guard applies only to InternetTransport on connected/message callbacks, where the transport generation is authoritative. LAN and Bluetooth callback ordering is not delayed or suppressed by a new state check.

Phase 14-B2 closeout (2026-11-19; commit `11b5c79d207e21798ff7e441744cb422a43e4d8c`; exact-head Actions run 44487454618 passed 3/3): MultiplayerManager queues inbound transport messages and disconnect/error callbacks onto Game.runOnRenderThread(...). It rechecks the exact transport identity and captured sessionGeneration inside the runnable before invoking the callback; SESSION therefore installs player/token/seed only on the render thread. MessageRouter deferred native mutations use runOnCurrentSessionRenderThread(...), capturing the active session generation and rechecking it immediately before mutation. The helper enters Game.runWithRenderThreadGuard(...); Game.runOnRenderThread propagates that guard through a ThreadLocal into nested runnables, so the sprite callbacks inside WorldSnapshot and RemotePlayerActionReceiver are rechecked too. This preserves the existing protected WorldSnapshot.java, Hero.java and Mob.java files. This prevents queued ROOM_STATE, MATCH_START, EVENT_BATCH/SNAPSHOT, PLAYER_JOINED/LEFT, READY, combat and accepted-action work from crossing endSession/session replacement. The headless regression queues an old SESSION behind a blocked render thread, replaces the session, then verifies the queued callback cannot mutate the new player identity, token, sequence or Dungeon.seed. Full local verification passed (163 JVM tests and root `test assembleDebug`); exact-head CI passed 3/3 jobs.
## 3. Actor scheduler integration

Source: core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/Actor.java

Relevant methods and locations at the baseline:
- restoreMultiplayerCooldown(float remaining), around line 113.
- restoreFromBundlePreservingRuntimeIdentity(Bundle bundle), around line 139.
- isMultiplayerSharedActor(Actor actor), around line 292.
- shouldSkipMultiplayerSharedActor(Actor actor), around line 300.
- shouldPublishMultiplayerSharedActorResult(Actor actor), around line 313.
- deferMultiplayerSharedActorResult(Actor actor), around line 321.
- publishDeferredMultiplayerSharedActorResult(Actor actor), around line 330.
- process(), around line 343.
- actor registration/removal remains in add/addDelayed/remove near lines 443–486.

Observed responsibilities:
- MultiplayerManager identifies whether multiplayer is active and whether the local client is the level publisher.
- Shared Mob/remote-actor turns are not allowed to run independently on every client.
- The publisher executes the native turn and publishes its resulting state.
- A Mob result can be deferred while its native attack callback is still pending; the scheduler publishes the completed result after the actor's action finishes.
- NativeHeroBuffTickPublisher.capture(actor) is invoked before a relevant Actor tick; the capture is published or aborted depending on how the native tick completes.
- Cooldown restoration is explicit. Do not restore a native Actor bundle in a way that changes its local Actor ID or duplicates scheduler registration.

Critical invariants:
- Actor.id() is a local runtime/scheduler identity, not a stable network identity.
- Do not add the same shared actor's turn to two independent authorities.
- Do not publish a result before post-attack callbacks and side effects have completed.
- Do not restore cooldown/time without checking the actor clock and the original native scheduling semantics.
- Replica death reconciliation must not call a second reward-producing native death pipeline.

## 4. Hero integration

Source: core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/hero/Hero.java

Hero is a very large native class (117,061 bytes at baseline) and is one of the highest-impact integration points. Batch 3 is reserved for a separate large-file decomposition assessment; this page records the multiplayer surface without attempting to redesign Hero.java.

### 4.1 Native combat

Relevant methods:
- sendNativeCombatReport(...), around line 226.
- restoreMultiplayerCombatState(Bundle), around line 561.
- restoreBlessedAnkhForMultiplayerAuthority(), around line 733.
- attack(Char enemy, ...), around line 800.
- spend(float time), around line 1261.
- act(), around line 1283.
- damage(int dmg, Object src), around line 2116.
- die(Object cause), around line 2827.

The native attack path uses NativeCombatAuthorityPolicy to decide whether this client can publish the outcome or is simulating a delegated authority action. It captures relevant state before the actual SPD attack, executes the real native attack pipeline, and then reports the native result. The code captures secondary Mob changes through NativeMobCombatDelta and uses stable server entity IDs when referring to mobs.

Do not replace this with a TypeScript hit/damage formula. The Worker validates the submitted native result against trusted state and bounded transitions; it is not a substitute for the original Java engine.

### 4.2 Hero actions and movement

During Hero.act(), multiplayer-enabled local actions capture:
- the starting position;
- the current cooldown;
- the serialized Hero pre-state;
- the native HeroAction being performed.

The native action is then mapped/dispatched through MultiplayerActionDispatcher. After an actual position change, onNativeMovementStep(...) can publish the native movement result with the action-cost delta and pre-state.

Hero also owns the bridge for:
- queueNativeWorldMutation(...);
- publishPendingNativeWorldMutation();
- discardPendingNativeWorldMutation();
- rejectUnsupportedMultiplayerWorldAction().

The queue/finalization design exists so selected native world mutations can be validated as a request plus the matching authoritative Level snapshot. Do not bypass the queue by inventing a simplified immediate event. Unsupported/ambiguous native side effects must remain fail-closed.

### 4.3 Projectile and item state

Hero contains native projectile mutation tracking:
- beginNativeProjectileMutation(...);
- finishNativeProjectileMutation(...);
- pending projectile heap/item/result IDs and target cell;
- reconciliation of projectile outcomes and resulting heaps.

The item path also uses NativeItemUse and NativeItemActionPublisher. Item actions must preserve native item identity, serialized bundles, quantity, container/equipment ownership, quickslots, heap deltas, buffs and Hero cooldown. A successful Java method call does not by itself prove the server accepted the resulting transaction.

### 4.4 Damage, death and revival

Hero.damage(...) is a multiplayer boundary for native effects caused by Mobs, environment, timed damage and revival behavior. The code captures pre-state and sends native state where required. It includes special handling for:
- target-owner damage;
- delegated native combat;
- Mob-originated Hero damage reports;
- blessed and unblessed Ankh flows;
- resync when a source/target identity or native outcome cannot be reconciled.

Hero.die(...) avoids deleting a multiplayer run as though it were a completed local single-player run when the room-authoritative combat result owns the death outcome.

Any change to Hero.damage(), die(), revive, Buff callbacks or item consumption must inspect Char.java, Mob.java, Actor.java, InterlevelScene.java, NativeHeroBuffTickPublisher, Worker validation and the matching JVM/server regressions.


### 4.5 Poison/LifeLink Mob callback batching

`NativeHeroBuffTickPublisher` captures a full Mob combat pre-state when it begins a native Poison actor tick. During that capture, `MultiplayerManager.sendAction()` buffers the normal `SYNC_MOB_STATE` publication for a `LifeLink`-source Mob callback on the level publisher. It does not change `Char.damage()`, LifeLink damage, death, rewards or heap generation; it prevents that partial result from reaching the server as a separate commit.

At the end of a nonlethal Poison tick, `NativeMobCombatDelta.changedSince()` captures the complete linked Mob delta and the Hero Buff publisher sends it with the Hero result in one `SYNC_HERO_STATE` / `BUFF_TICK` action. If the same callback kills the Hero, `Hero.damage()` publishes the environment-death result first; `MultiplayerManager` enriches that action with the captured Poison pre-state, sequence baseline and Mob delta. No later Buff tick is sent after Hero death.

A removed linked Mob is represented by a stable-entity tombstone with zero HP and its trusted pre-death bundle. If any linked Mob dies, the payload carries the final native heap snapshot as a JSON array. The Worker validates the complete result and commits Hero, Mob, heap and reward state in one scoped Durable Object SQL transaction.

This path is publisher-only for shared Mob writes. Actor IDs are local to a native SPD process; a non-publisher must not use its local `LifeLink.object` value to author shared Mob state. Keep non-publisher and RemoteHero/player LifeLink behavior fail-closed until a separate authority/identity design is implemented and tested.

The Java runtime integration tests assert one ACTION for multiple linked Mob deaths, a complete Mob delta list and an array-shaped final heap payload. MatchRoom integration tests are described in `TEST_MATRIX.md`; they use an in-memory SQL adapter and do not replace real Worker or device verification.

On a non-publisher, shared Mob periodic damage is blocked by `Mob.damage()`, including the LifeLink callback. The local Hero's Poison actor can still predict the divided Hero-side damage and send a Hero `BUFF_TICK` with a complete but empty secondary Mob delta. The server rejects it with `BUFF_TICK_MOB_AUTHORITY_REQUIRED` because that peer's `LifeLink.object` Actor ID is not authoritative. When the corresponding `SYNC_HERO_STATE` request receives an ERROR, `MultiplayerManager` requests a full RESYNC. A JVM regression verifies the Mob HP guard, empty delta and RESYNC request, then passes a complete server-format `SNAPSHOT` through `MessageRouter` and checks that the local Hero HP, stable Mob HP/Actor identity, Poison/LifeLink Buff objects and native actor clocks restore to their authoritative pre-tick values. The test builds a deterministic envelope locally; it does not connect to a live Worker or real Durable Object SQLite response. This is fail-closed fallback, not supported remote LifeLink execution. For publisher transaction failures, the WebSocket boundary returns an ERROR correlated with the original request ID and current sequence, so the manager can clear the pending `SYNC_HERO_STATE` and request RESYNC rather than leave it waiting. The server defers that action's acceptance and event broadcasts until the atomic SQL transaction commits, and retains the actual sender socket as the FOV exclusion even though validation runs through a WebSocket proxy.



### 4.6 Poison damage against an active Barrier

When the native Poison actor damages a Hero, `Char.damage()` runs the regular shield pipeline. A Hero-side `Barrier` is therefore allowed to absorb the hit before HP changes; at zero, native `ShieldBuff.absorbDamage()` detaches it. This is distinct from Hunger/Starvation damage, which native `ShieldBuff.processDamage()` explicitly lets bypass shields.

The Barrier Bundle stores its decay remainder under the exact key `partial_lost_shield`; the server reads that same native key. The server admits only the exact Barrier row transition associated with the Poison tick. A surviving Barrier may lose shield but cannot change its decay remainder or unrelated fields. A depleted Barrier can detach only when the Hero's total shield drops by exactly the Barrier's previous shield amount. Hero HP and other Buffs must still match the strict native Poison contract.

The Java regression `nativePoisonDamageConsumesConcurrentBarrierWithoutChangingHeroHp` executes the original Poison actor with a two-point Barrier and verifies that the shield absorbs the hit, Barrier detaches at zero and Hero HP stays unchanged. Backend tests also reject a missing/forged aggregate shield loss and a changed `partial_lost_shield`. This does not relax the existing separate Hunger shield-bypass rule.


### 4.7 Poison against multiple native ShieldBuff priorities

The Java engine sorts shields before applying Poison damage: `WarriorShield` and `Blocking.BlockBuff` are priority 2; Cleric `AscendBuff` and `DivineShield` are priority 1; `Barrier` is priority 0. The server validates the same order and derives the incoming damage from Hero HP and total shield conservation. It rejects a lower-priority row losing shield while a higher-priority row still has capacity.

The regression `nativePoisonConsumesPriorityTwoAndOneShieldsBeforeBarrier` executes the original native Poison actor with all three tiers active. It checks that priority 2 and then priority 1 absorb the hit before Barrier, and that zero-shield Buffs follow their native detach rules. The test keeps Hero HP above the WarriorShield activation threshold to avoid initializing UI textures in the headless JVM environment; it tests shield consumption, not the separate automatic activation visual callback.

### 4.8 Atomic commit for all native Hero Buff ticks

`NativeHeroBuffTickPublisher.publish()` uses the `SYNC_HERO_STATE` / `BUFF_TICK` envelope for every supported local Hero Buff tick, including Healing, Hunger, Poison, Barrier and the source-specific expiry/charging transitions. MatchRoom wraps every such source-shaped Buff tick in `state.storage.transactionSync`, not only Poison/LifeLink, so Hero bundle/player HP, the sequenced event and request record commit or roll back together. `ACTION_ACCEPTED` and FOV/room broadcasts are held until commit succeeds.

This is a transaction-boundary change, not an expansion of the accepted effect list: the backend still validates each Buff class against its native transition rules and rejects unsupported transitions. The Healing integration regression forces event insertion to fail after Hero/player writes and verifies that stored HP and Healing Buff state roll back. Exact-head CI at `b68b66e686b98dbf343997202b215e2c828b7b89` passed Backend 644 Vitest executions and Android JVM/Debug APK compilation ([run 42777941791](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42777941791)).


### 4.9 Hero-targeted Amok expiry

The Hero Buff publisher admits native `Amok` as a timed Hero Buff tick. This is narrowly scoped to `Buff.target == Dungeon.hero`: native `Amok.detach()` performs the enemy-to-enemy Mob aggro reset only when its target alignment is `ENEMY`; the local Hero is not an enemy, so the Hero-targeted path only removes the Hero's Amok row. The Java test executes the original `Amok.act()`, publishes the resulting `BUFF_TICK`, and verifies that a nearby Mob's HP and native `AiState` reference remain unchanged.

The backend accepts Amok only as its own due source tick, with unchanged Hero HP/shield and unrelated Buff/inventory state. It is intentionally excluded from the set of rows that may disappear between a previous Hero state and another Buff's pre-state; this prevents a malicious/incorrect Amok removal from being hidden inside a different Buff event. Other Amok targets and their Mob aggro callbacks are not authorized through this Hero-only tick path.



### 4.10 Hero-targeted SnipersMark expiry

`NativeHeroBuffTickPublisher` admits `SnipersMark` only when the native actor target is the local `Dungeon.hero`; it captures the full Hero pre-state and actor clock and publishes the native due expiry as a `SYNC_HERO_STATE` / `BUFF_TICK`. The actual `FlavourBuff.act()` remains authoritative. `SnipersMark.detach()` clears `ActionIndicator.action` and removes the Hero Buff row; the multiplayer layer does not synthesize the expiry.

The Android JVM regression creates a Hero-targeted mark with a real local Mob Actor ID and a 0.35 damage-bonus value, executes the original `mark.act()`, and verifies that the Hero row and local action indicator are removed while the nearby Mob HP and `AiState` object remain unchanged. It also inspects the transmitted pre-state to ensure the exact marked Actor ID and bonus are preserved.

This is intentionally an expiry-only contract. It does not validate `SnipersMark.doAction()`, SpiritBow/SpiritArrow targeting, the marked Mob's identity across publishers, or the resulting arrow damage; those paths remain unaudited and must not be assumed synchronized by this tick.



### 4.11 SpiritBow / SnipersMark / asynchronous SpiritArrow — Phase 9 complete

The origin client retains the native Hero report after `SnipersMark.doAction()` and `SpiritBow.cast()`. The real MissileSprite completion callback finalizes it exactly once. If the marked target moves/disappears before completion, the pending report is cancelled, the mark is retained and RESYNC is requested instead of sending stale ATTACK. Headless JVM coverage invokes completion twice and checks exactly-once cleanup; this is not a rendered projectile animation test.

On the publisher device, MessageRouter resolves COMBAT_REQUEST using trusted Bow/mark/stable Mob metadata and runs the original Java Hero/RemoteHero combat pipeline. The report carries native target identity, position, HP/HT, Buffs and Mob bundle. The Worker validates the outcome and commits state/event/sequence atomically; it does not reimplement combat formulas.

The requester receives a sequenced EVENT_BATCH. Android resolves the stable server Mob ID to the current device's local Actor ID, applies bounded state and requests the authoritative full snapshot when the event carries the complete Mob bundle or secondary Mob changes. A dedicated JVM regression runs the same accepted result on two test clients with different local Mob Actor IDs and verifies the correct Mob is updated.

Missing/forged positions, wrong publisher/mark/target identity, stale request/generation, invalid Bow and unsupported SPEED/non-Mob branches remain rejected. Transaction rollback returns correlated errors without leaking ACTION_ACCEPTED/EVENT_BATCH. Publisher handoff requires a lossless rebase of fresh local Actor IDs; remote cross-device LifeLink/SnipersMark references that cannot map to the exact stable Mob remain fail-closed.

The gameplay/test baseline passed [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588), including Android JVM/Debug APK, Backend and Workers-runtime SQLite jobs. No rendered animation or physical two-device match is claimed; every later documentation-only commit must still receive its own exact-head CI check.
## 5. RemoteHero and RemotePlayer

Sources:
- actors/hero/RemoteHero.java (32 lines at baseline);
- multiplayer/RemotePlayer.java;
- multiplayer/RemotePlayerActionReceiver.java;
- multiplayer/MultiplayerManager.java.

RemoteHero extends Hero and adjusts native action/death behavior when MultiplayerManager is resolving an authority combat action. It is a native engine representation, not merely a visual sprite.

RemotePlayer stores network-side identity/metadata and a local Hero instance. The manager maps remote player IDs to those instances. Snapshot restoration can construct RemoteHero instances and schedule sprite creation on the render thread.

Preserve these identity domains separately:
- player ID: network identity of a participant;
- server entity ID: shared identity of a Mob/entity;
- Actor.id(): local native scheduler ID;
- Buff/actor IDs belonging to a specific local Hero instance.

Never infer a remote Hero from JSON substring fragments when a stable typed state is available. Legacy parsing remains a migration target.

## 6. Mob integration

Source: core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/mobs/Mob.java

Mob is 66,010 bytes / 1,880 lines at baseline. Its multiplayer bridge includes:
- multiplayerBaseSpeed();
- restoreMultiplayerState(...);
- multiplayerEffectiveSpeed() and multiplayerEffectiveSpeedMatches(...);
- target-cell, target-type and stable target-entity accessors;
- multiplayerForgetTarget(...);
- restoreMultiplayerAiState(...);
- multiplayerAttackAwaitingCompletion();
- onAttackComplete();
- queueMultiplayerHeroDamageReport(...);
- flushMultiplayerHeroDamageReport(...).

The native Mob.act()/doAttack()/onAttackComplete() lifecycle remains authoritative for AI and attack timing. The current bridge:
- selects remote Heroes as valid targets on the level publisher where appropriate;
- prevents non-publishers from independently running shared Mob turns;
- preserves AI state, speed modifiers, target state and cooldown in snapshots;
- delays publication until the native attack pipeline finishes;
- aggregates Mob-to-Hero reports for the target owner/authority flow;
- includes native Mob bundle, buff and heap information when needed.

Do not create a second simplified Mob AI loop in the Worker and call it equivalent to SPD. Do not invoke Mob.die() on a replica for an already-authoritative death because that can award duplicate rewards or generate duplicate loot.

## 7. Level and Dungeon integration

### Level.java

Source: core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/levels/Level.java

Multiplayer-specific metadata bridge:
- multiplayerMetadataBundle(), around line 487;
- canRestoreMultiplayerMetadata(Bundle), around line 504;
- restoreMultiplayerMetadata(Bundle), around line 538;
- multiplayerFeelingName(), around line 570;
- restoreMultiplayerFeeling(String), around line 575;
- fallCell(boolean), around line 1223.

Metadata includes more than geometry. The snapshot/restore contract also needs native feeling/lock state, custom tile/wall metadata, respawner state/cooldown, and other fields required for a faithful generated level. Never assume that a tile array alone is a complete Level.

Level.fallCell() is part of the native pit/fall semantics. A chasm fall is not an ordinary movement into a cell: native fall callbacks and destination selection must be preserved. The server has separate transition validation for FALL and safe destination landing.

### Dungeon.java

Dungeon.java has no direct MultiplayerManager import/reference in the inspected baseline. Its normal responsibilities still matter:
- initSeed()/init();
- newLevel()/resetLevel();
- seedCurDepth()/seedForDepth();
- switchLevel(...);
- save/load and run lifecycle.

The current multiplayer seed injection is performed through MultiplayerManager.applyAuthoritativeSeed() in HeroSelectScene before native run generation. Keep this timing before the engine creates the first floor. A change to Dungeon lifecycle may therefore break multiplayer even though Dungeon.java itself has no multiplayer-specific code.

## 8. Scene integration

| Scene | Observed integration | Required care |
|---|---|---|
| TitleScene | Exposes multiplayer entry navigation | Entry visibility and localization must match actual feature readiness |
| MultiplayerTransportScene | Offers INTERNET, LAN and BLUETOOTH choices | Do not claim a transport works based on a button |
| MultiplayerSetupScene | Creates selected transport, room/IP defaults and starts MultiplayerManager | Current flow switches to HeroSelect immediately after startSession without waiting for an accepted peer or authoritative SESSION. Bluetooth startup exceptions now propagate; the paired-device selector and connection-state UI remain Phase16B/20/21 |
| HeroSelectScene | Calls applyAuthoritativeSeed() before run generation | Preserve seed-before-generation ordering |
| GameScene | Publishes current level and sends LEVEL_READY during scene creation when multiplayer is active | Native rendering/map/sprite work belongs to render thread |
| InterlevelScene | Completes pending unblessed-Ankh revival continuation | Preserve native transition/load/resurrection order |

GameScene also exposes refreshMultiplayerCustomVisuals(), refreshRemotePlayerSprites() and addRemoteHeroSprite(...). A snapshot can create the correct data but still render incorrectly if these integration methods are bypassed.

### 9.1 Full snapshot wire completeness

`SPDLevelSnapshot.buildLevelJson()` uses a dedicated libGDX `Json` writer with prototype elision disabled. Required defaults must remain on the wire: schema version 1, branch zero, false flags, zero-valued cells and empty collections. `MessageRouter` treats a snapshot as complete only when all required arrays and the nonempty native metadata bundle are explicit. The Phase 9 non-publisher Poison/LifeLink regression parses a complete server-shaped envelope through the router and verifies native restore; it is a deterministic JVM integration test, not a live Worker response.

## 9. Snapshot and restoration boundary

SPDLevelSnapshot exports native data; WorldSnapshot validates, restores and rolls back it.

WorldSnapshot responsibilities include:
- restoreNativeCombatBuffs(...);
- removeMobReplicaWithoutRewards(...);
- restoreRemoteHeroState(...);
- hasValidStableHeapItemIdentities(...);
- validateForRestore(...);
- captureLocalRollbackBaseline();
- rollbackToLastApplied();
- restoreNativeMobAiState(...);
- restoreWorld(...).

The restore path validates before mutation, captures a local rollback baseline, restores native geometry/metadata/entities, preserves local runtime identities where required, refreshes visuals, and attempts rollback/resync if a restore fails. A failed snapshot must not leave a partially resized or partially populated live Dungeon.

## 10. Native timed effects

NativeHeroBuffTickPublisher is called from Actor processing. It captures native actor/Hero state before the tick and publishes a before/after transition only through the supported path.

At baseline it exposes:
- capture(Actor);
- isCapturingPeriodicHeroDamage(Hero);
- refreshCaptureBaselineAfterRevive(...);
- abort(TickCapture);
- publish(TickCapture).

NativeItemUse applies a fail-closed action allowlist/preflight for selected item consumption paths. NativeItemActionPublisher executes a supported native action and queues the matching result for Worker validation.

Timed Buff changes must be audited across:
1. native Buff class and attach/tick/detach callbacks;
2. Actor clock and scheduling;
3. Hero/Mob serialized bundles;
4. capture/publish code;
5. Worker before/after-state validator;
6. reconnect/snapshot restoration;
7. positive and negative regression tests.

A Buff disappearing from a serialized list is not proof that its side effects were harmless. If expiry can damage, heal, move, kill, grant items, change inventory, affect another actor or trigger a scene callback, all consequences must be validated or the transition must remain rejected.

## 11. Android Bluetooth RFCOMM adapter — Phase 16A implementation

Files:
- `android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/AndroidBluetoothProvider.java`
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/BluetoothTransport.java`
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/BluetoothFrameCodec.java`
- `android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/android/AndroidLauncher.java`
- `android/src/main/AndroidManifest.xml`

`AndroidLauncher.onCreate` installs one application-context `AndroidBluetoothProvider` through `BluetoothTransport.setNativeProvider`. Android manifest declares the hardware feature optional (a no-Bluetooth device can still install the game), legacy `BLUETOOTH`/`BLUETOOTH_ADMIN` permissions up to API 30, and `BLUETOOTH_CONNECT` for API 31+. The provider checks the dangerous connect permission before accessing the adapter on API 31+, and returns explicit unsupported, disabled and permission-required failures. Runtime permission UI is not yet implemented; this is Phase 16B.

The provider implements Classic RFCOMM `listenUsingRfcommWithServiceRecord` and `createRfcommSocketToServiceRecord` using the shared service UUID. Host start means only that the listener was bound; it does not call `onConnected` until a peer is accepted and both streams are acquired. Guest connect is generation-fenced and bounded by a 15-second timeout. Reader, sender and disconnect share a single owned socket/stream lifecycle; stale callbacks are ignored, EOF closes the session, errors release resources, and outgoing writes are serialized. The server accepts one peer, consistent with a two-player Bluetooth transport limit in this slice.

`BluetoothFrameCodec` uses strict UTF-8 newline JSON framing capped at 16 MiB. It rejects empty, truncated, malformed, injected-delimiter and oversized frames. `NetworkMessage.parseBluetoothJson` remains the exact legacy receive compatibility boundary; outbound messages use the canonical versioned envelope. A missing provider throws `BLUETOOTH_UNAVAILABLE`; it never fabricates `onConnected`.

The manager deliberately maps a connected Bluetooth socket to `TRANSPORT_CONNECTED`, not `ROOM_JOINED`. RFCOMM does not implement the authoritative room roster/readiness/MATCH_START/native action lifecycle; Phase 17 remains responsible for that contract. Setup still lacks a paired-device selector and currently passes the existing endpoint field to the guest transport; that field is not a Bluetooth UX. Device discovery, pairing consent, runtime permission request/recovery, host discoverability, peer selection and cancel/retry are Phase 16B, with full setup/lobby states in Phase20 and RTL/accessibility work in Phase21.

**Automated evidence only:** focused JVM frame/provider-facade/manager/error/parity tests and Android `assembleDebug` are the acceptance gates for this slice. The final local test count and APK hash are recorded in `PHASE16_BLUETOOTH_TRANSPORT.md` / `TEST_MATRIX.md`; exact-head CI for the Phase16A commit is still pending. No Android app launch, emulator/ADB, Bluetooth hardware, two-device or gameplay test is claimed. Per user instruction, real device/network tests are postponed until after Phase22; physical playtesting is Phase23.

## 12. Native change checklist

Before changing native multiplayer behavior:
1. Re-open the target native method and the full callback chain.
2. Identify whether the local actor is publisher, local Hero owner, RemoteHero simulation or replica.
3. Trace the serialized before-state and after-state.
4. Check actor clock/cooldown and scheduler effects.
5. Check all Buff/item/NPC/loot/death/scene side effects.
6. Trace stable entity/item identity.
7. Follow Worker admission and every persistence/event update.
8. Follow MessageRouter's exhaustive typed route switch and explicit legacy helper behavior.
9. Confirm render-thread ownership.
10. Add positive, negative, replay and malformed-state regressions.
11. Update ROADMAP.md, GPT.md, this guide and affected protocol/test references in the same logical work unit.

## 13. Baseline test evidence

NativeCombatRuntimeIntegrationTest.java contained 46 @Test methods at the historical baseline; it now contains 67 at the Phase 10 closeout. It includes shared Actor scheduling, disconnect cleanup, native Mob AI/timing, native world restore/rollback/idempotency, Hero timed effects, native combat outcomes, Ankh behavior, delegated combat/PvP, secondary Mob effects, replica death without rewards, resync and cross-client Actor-ID convergence.

Other multiplayer JVM test files add stable entity identity, item/heap identity, level metadata, combat authority policy and native NPC item side-effect policy. See TEST_MATRIX.md.


## 14. Phase 10-C — protocol envelope and HeroAction producer parity

### Canonical parser and envelope contract

NetworkMessage.parseJson is the strict generic decoder for protocol 1.0.0:
- outer JSON must be an object;
- protocolVersion, messageType and payloadJson are required strings;
- protocol mismatch, unknown message type, malformed outer JSON, malformed nested payload JSON and non-object roots return explicit ERROR envelopes;
- optional requestId and senderId must be strings when present; sequence must be a non-negative safe integer and defaults to zero only when absent;
- payloadJson is a JSON-encoded string; the generic parser rejects raw object/array values and null optional string values;
- invalid input is never coerced into ACTION.

Compatibility is limited to two tested methods: parseLanJson accepts only the exact legacy six-field LAN envelope with raw object/array payload; parseBluetoothJson accepts only the exact two-field unversioned Bluetooth envelope. Extra fields are rejected. Both normalize into the canonical envelope then invoke the strict parser. InternetTransport uses only the generic parser. BluetoothTransport writes the canonical versioned envelope.

### HeroAction mapping and unsupported behavior

NetworkActionBridge.mapHeroActionToNetworkAction returns Optional values for only ten explicitly mapped native HeroAction classes. Null and unrecognized classes return Optional.empty(). MultiplayerActionDispatcher is the only production caller; an empty result calls Hero.rejectUnsupportedMultiplayerWorldAction(), clears pending native mutation and warns the player. It does not send NetworkActionType.WAIT.

The 23-value NetworkActionType enum and 23 Worker ACTION branch tokens remain a vocabulary/routing inventory, not proof that each item/effect/class subcase has an enabled native producer or accepted server semantics. Direct native producer paths remain action-specific.

### Behavior-specific routing tests

NetworkProtocolParityTest.java contributes 15 JVM tests. NativeCombatRuntimeIntegrationTest.java has 62 test methods at the audited HEAD, including:
- PLAYER_LEFT cleanup of the remote-player registry, RemoteHero Actor scheduler and Mob target references. Explicit multiple-Buff detach and attached-sprite lifetime assertions were added in the Phase 10-D pre-migration expansion;
- retention of the tested legacy RemoteHero movement/HP path;
- EVENT_BATCH single-application through MessageRouter, duplicate-sequence protection and rejection by RemotePlayerActionReceiver with the existing recovery behavior.

Historical pre-10-E statement: MessageRouter and RemotePlayerActionReceiver were structurally unchanged and a default legacy route remained. Phase 10-E subsequently replaced the top-level fallback with an exhaustive 25-value switch; the receiver remains only for explicit helper/legacy responsibilities.

Exact-HEAD evidence: 2d9a36d6c90ae95a91e6d08dca7a5bc4861c7fa5, [CI 43512831773](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43512831773) — Backend, Android and Durable Object SQLite jobs all passed.

## 15. Historical Phase 10-D — typed PLAYER_LEFT disconnect cleanup

The Worker producer is `MatchRoomBase.webSocketClose`: after marking the authenticated session disconnected it broadcasts PLAYER_LEFT with the session player ID in senderId and payload. MessageRouter now handles this outer message explicitly and schedules the native cleanup with `Game.runOnRenderThread(...)`.

The typed handler preserves the former receiver contract:
- use payload.playerId only when it is a string; otherwise fall back to senderId, including malformed JSON;
- ignore null/empty IDs and the local player's own ID;
- clear every Mob's target reference to the departing RemoteHero while preserving SPD's last-known target cell;
- detach all RemoteHero Buffs (including their Actor scheduler entries);
- remove the RemoteHero from Actor scheduling;
- unlink and null its sprite;
- remove the RemotePlayer registry entry, which also clears both player-to-Hero and Hero-to-player lookups.

Historical 10-D note: at that checkpoint RemotePlayerActionReceiver remained on the legacy default route for PLAYER_JOINED and other remaining paths. Phase 10-E superseded that state by adding an exhaustive 25-value MessageRouter switch with no generic receiver fallback. The receiver class itself remains for explicit native Hero setup/helper duties. EVENT_BATCH application/sequence semantics were not changed by that migration.

The full cleanup regression was expanded and passed first on the old route at SHA `6e5ea7c88ba0238d46c3d728ca0fb4437d3f3630` / CI [43521307026](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43521307026). The same assertions passed after 10-D migration on SHA `cc61c68625f587576ca530aef3354bfaffe9e140` / CI [43522055301](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43522055301). At that checkpoint NetworkProtocolParityTest had 15 tests and NativeCombatRuntimeIntegrationTest had 64; Phase 10-E later increased the latter to 67 and completed the broader typed route. Android JVM tests and Debug APK passed.

Historical 10-D boundary: this one PLAYER_LEFT unit did not complete Phase 10 at that checkpoint. Phase 10-E completed the agreed remaining route and payload inventory scope; no Worker validator, event ordering, sequence semantics or replay/resync algorithm changed.


## 16. Phase 10-E — exhaustive outer-message routing and typed player lifecycle

Exact implementation/test SHA f2d79038d1e420461be7a1956471324de5c1ef74 passed [CI 43618725089](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43618725089).

- MessageRouter.routeMessage has one explicit switch decision for each of the 25 canonical MessageType values. Its default no longer forwards arbitrary message JSON to RemotePlayerActionReceiver; future unrecognized values request resync.
- PLAYER_JOINED runs on the game render thread. It validates playerId/senderId equality and an integral in-level position, ignores the local player and avoids replacing an already-registered RemoteHero on duplicate join.
- PLAYER_LEFT retains the earlier typed cleanup path.
- READY validates sender identity and true/false state, updates RemotePlayer.isReady, and requests recovery when a known room participant has not been registered. After a successful WorldSnapshot restore, existing RemotePlayer records receive the persisted ready flag from the room players list.
- PING is liveness-only. CHAT is explicitly not applied to game state because Android does not provide a chat surface. ROOM_STATE, HELLO, client-to-server message values and other known non-inbound names have explicit route decisions and are not parsed as remote Hero state.
- The new setupRemoteHeroInstanceOnRenderThread helper registers the RemoteHero Actor on the render thread. It creates/attaches a HeroSprite only when Game.scene() is a GameScene; it does not create a scene-dependent sprite in the headless test environment.
- NativeCombatRuntimeIntegrationTest contains 67 @Test methods; the join, duplicate, identity mismatch, READY, CHAT/PING/non-inbound and snapshot-readiness cases are covered. NetworkProtocolParityTest remains at 15 tests.

### 16.1 Outer ACTION contract boundary

The Android producer serializes ACTION as a JSON string body with action, data and heroStateJson. protocol/schema.json defines NativeActionEnvelope.oneOf with 23 action-specific data field inventories. protocol/action-data-contracts.json reconciles 361 Worker-consumed names (346 source-referenced in Java producer files and 15 Worker-only) with the corresponding Worker action handler and validator modules. The contract guard also checks all 18 required NativeLevelSnapshot fields against the Java wire model and Worker completeness check.

WAIT and USE_ABILITY remain declared names but have no Android native action producer/bridge. They stay fail-closed and no action is fabricated. Worker validators continue to decide actual field types, requiredness, allowed values and feature-specific subcases; field-name inventory alone is not proof of runtime support.

## Phase 11-B — ordered event application and native-state safety (2026-11-15)

Current code/test SHA `2574489ff25e6f1fedc1e21718161bc5a7a1b230` passed exact-head [CI 43731016036](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036), including Android JVM tests and Debug APK compilation.

MessageRouter.handleEventBatchMessage now normalizes a batch before live application: it requires safe positive sequence values, removes exact duplicate rows, rejects conflicting duplicates, sorts by sequence, and verifies a contiguous range that begins immediately after the client's applied watermark and ends at the envelope sequence. An ahead-of-watermark row or malformed event requests recovery without advancing the applied sequence.

Each valid event is applied behind a native-world rollback baseline. The world-applied marker and manager watermark commit only after application succeeds; failures roll back and request RESYNC. EVENT_SKIPPED advances the sequence while leaving Hero/Mob/world state untouched. Stale events do not undo newer Mob positions. ACTION_ACCEPTED shares contiguous sequence discipline and duplicate delivery is guarded.

The full snapshot path still rejects stale or structurally incomplete snapshots before changing live world state. The implementation does not change native SPD combat formulas or add a new action/message type.

Phase 11-B baseline inventory: NativeCombatRuntimeIntegrationTest.java had 74 @Test methods and NetworkProtocolParityTest.java had 15. Current Phase 12-A inventory: NativeCombatRuntimeIntegrationTest.java has 78 methods, NetworkProtocolParityTest.java has 20, and MultiplayerReconnectLifecycleTest.java has 3. No physical two-device test is claimed.


## 12. Phase 12-A Internet session credential and reconnect handshake

- InternetTransport carries an existing session credential only as Authorization: Bearer in the secure WebSocket upgrade; it never appends the secret to the endpoint URL or query string.
- Session credentials are rejected for non-TLS ws/http endpoints and validated against the same 16–256 character URL-safe token alphabet as the Worker.
- MultiplayerManager automatically starts an authenticated reconnect after an unexpected Internet disconnect/error. Callback wrappers ignore late events from superseded transports. A failed upgrade does not spin in an immediate retry loop; a later transport failure can start another attempt.
- A resumed SESSION must return the same playerId and a replacement token. Missing identity/token or a changed player identity clears the stale client session.
- The reconnect SESSION does not advance the native applied-sequence watermark; existing EVENT_BATCH/SNAPSHOT application paths remain responsible for committing recovered state.
- Unit tests cover Bearer-header construction, malformed/short tokens, raw encoded endpoint preservation, identity mismatch, missing replacement token, and watermark preservation.


## 17. Phase 13 in-game lifecycle lobby (2026-11-17)

- `GameScene.update()` calls `WndMultiplayerLobby.tick()` after `GameScene.create()` publishes the native level and sends LEVEL_READY.
- `WndMultiplayerLobby` is a UI surface only. It reads the validated roster/revision from `RoomLobbyState` and forwards commands to `MultiplayerManager`.
- Owner Start requires local native snapshot synchronization, local readiness, every connected member ready and LOBBY status. The Worker repeats authority and snapshot checks transactionally.
- MessageRouter applies ROOM_STATE exactly once and MATCH_START on the render thread. Malformed roster data does not replace the last trusted member list; state-changing actions remain disabled.
- GameScene gates native actor turns and cell selection until `isRoomGameplayAllowed()` confirms PLAYING. A connection or failed/reconnecting handshake never unlocks native gameplay.
- The lifecycle-required Internet flag survives handshake/reconnect failure and is cleared only by explicit endSession. Retry exhaustion clears pending room requests and allows local exit instead of trapping the user behind an unacknowledgeable Leave.
- MultiplayerReconnectLifecycleTest now contains 12 cases. The former-owner reconnect regression retains the player identity, rotates the session token, updates the owner ID to the successor, and applies the complete SESSION_RESUMED roster with connected and offline members. Readiness remains false and gameplay remains blocked until PLAYING.
- No Android instrumentation or manual emulator rendering/touch test is claimed. By user direction these visible UI checks are deferred to Phases 20-21 and are not Phase 13 blockers.

### Phase 14-B3 — Android connectivity and Activity lifecycle

- `AndroidPlatformSupport.startConnectivityMonitoring()` runs from `AndroidLauncher.onCreate`. It uses `registerDefaultNetworkCallback` on API 24+ and `registerNetworkCallback` with `NET_CAPABILITY_INTERNET` on API 21–23. `isInternetAvailable()` requires both INTERNET and VALIDATED on API 23+; API 21–22 uses the connected active `NetworkInfo` fallback. The project minSdk is 21 and the manifest already includes `ACCESS_NETWORK_STATE`.
- `AndroidLauncher.onResume()` refreshes active connectivity then calls `MultiplayerManager.onAppForegrounded`; `onPause()` calls `onAppBackgrounded`; `onDestroy()` unregisters the network callback. `stopConnectivityMonitoring()` clears the callback/manager references and tolerates framework teardown races.
- `MultiplayerManager` pauses reconnect attempts and in-flight SESSION timeout tasks in the background. A temporary network loss after authentication retains `sessionToken` and session state, transitions to RECONNECTING, closes the old socket, and resumes bounded retry after availability returns. The initial pre-SESSION handshake is tracked separately and cleared on end/failure/success.
- Platform evidence is source/build/JVM-level only. No Android emulator/device network toggle, screen-off or Activity recreation session was run in this slice.

### Phase 14-B3 — Half-open and backpressured sockets

`InternetTransport` heartbeats every 15 seconds and treats 45 seconds without inbound frames as timeout. The scheduler delegates writes to a separate executor, with one pending heartbeat send per transport; it never blocks on socket output. `disconnect()` increments the connection generation, detaches and closes the socket without waiting to enqueue/write a graceful CLOSE frame behind a blocked application write. `InternetTransportProtocolTest.disconnectInterruptsABackpressuredApplicationWrite` uses a localhost peer that stops reading a 15 MiB application frame and proves disconnect returns promptly, releases the sender and suppresses stale send errors.
## Phase 14-B3 follow-on — Android connectivity callback fencing (2026-11-19)

`AndroidPlatformSupport.startConnectivityMonitoring()` creates one `ConnectivityManager.NetworkCallback` per active monitor generation. Each callback checks both `connectivityMonitorGeneration` and `networkCallback == this` while holding the platform-support monitor before touching network state. API 24+ stores the exact default `Network` and its INTERNET + VALIDATED state; API 21–23 maintain a concurrent map of networks received by the INTERNET request, applying VALIDATED on API 23+. `onLost` only clears the matching default Network on API 24+, so a late loss for an old default cannot erase its replacement.

`stopConnectivityMonitoring()` increments the generation before unregistering, marks monitoring inactive, detaches the callback and clears manager/default/per-network references. `publishConnectivityState(generation)` is synchronized with start/stop and performs a generation check before notifying MultiplayerManager. A queued callback from an old Activity therefore cannot publish into the new monitoring generation. `AndroidLauncher` emits DEBUG-only onCreate/onResume/onPause/onDestroy diagnostics; the platform adapter logs DEBUG-only callback and availability transitions. `android/build.gradle` explicitly enables BuildConfig generation.

Current automated evidence is 172/172 core JVM tests and a successful forced `test assembleDebug` build (58/58 Gradle tasks executed). No Android framework callback/network toggle/screen-off/Activity recreation runtime test is claimed; the standalone Emulator helper is gated and deferred by user instruction.
