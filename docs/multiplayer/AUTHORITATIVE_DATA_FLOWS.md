# Authoritative Multiplayer Data Flows

## 1. Core invariant

Every shared gameplay change must have one identifiable owner, an auditable request/result relationship, and a defined reconciliation path.

Intended lifecycle:

**Native intent/result → capture trusted pre-state → request with identity → server authorization and validation → durable state plus sequence/event commit → client application → native reconciliation → resync if ambiguous.**

Do not introduce a second route that applies the same action independently. Do not accept a client assertion as proof of native execution.

## 2. Session startup and initial world

Observed client-side path:

1. TitleScene exposes multiplayer entry.
2. MultiplayerTransportScene records the selected transport and opens MultiplayerSetupScene.
3. MultiplayerSetupScene.startMultiplayerSession() instantiates InternetTransport, LANTransport, or BluetoothTransport.
4. It generates a player ID and calls MultiplayerManager.startSession(...).
5. It switches to HeroSelectScene immediately after calling startSession.
6. HeroSelectScene calls applyAuthoritativeSeed() so the shared seed is installed before native run generation.
7. GameScene.create() calls publishCurrentLevel() and sendLevelReady() when multiplayer is active.
8. The server handles room state/readiness, then publishes accepted room/snapshot/event state through its Durable Object.

Important current limitation: the source flow does not visibly gate the scene transition on a confirmed server SESSION/ROOM_STATE/ready result. The setup path also catches LAN/Bluetooth host-start exceptions without surfacing them. Treat connection/readiness UX and all transport handshakes as open work, not completed behavior.

Relevant files: TitleScene.java, MultiplayerTransportScene.java, MultiplayerSetupScene.java, MultiplayerManager.java, HeroSelectScene.java, GameScene.java, selected transport, MatchRoom.fetch()/webSocketMessage(), and protocol definitions.

## 3. Native movement and world mutation

For an action using the native world-mutation path:

1. Hero observes the native action and captures relevant pre-action Hero state/cooldown.
2. MultiplayerActionDispatcher maps native Hero action/movement/pit-fall/interactions to an action type and chooses supported publishing path.
3. MultiplayerManager.sendAction(...) creates/sends the request, including request identity and serialized details.
4. The native mutation publisher captures native output details such as action kind, source/target cell, item IDs/quantities, and native state.
5. The server validates authenticated sender, room state, action type, current floor, source state, target geometry, inventory/item ownership, native mutation metadata, allowed before/after deltas, cooldown/action cost, replay state, and durable claim/lock requirements relevant to the action.
6. The server persists accepted state and produces a sequenced event/result.
7. Publisher and peers apply the event or validated snapshot through client routing.
8. If a required identity, pre-state, field, or side effect cannot be proven, request resync rather than continuing with guessed local state.

Do not assume every NetworkActionType has a complete server implementation. NetworkActionBridge enum conversion and a client publisher are only pieces of an end-to-end action.

## 4. Native combat flow

The combat model keeps original SPD Java combat code authoritative for hit/damage/procs.

### Player attacks a Mob

1. Attacker client initiates native Hero attack and captures attacker/target pre-state.
2. Authority policy and MultiplayerManager determine whether the local client can resolve the shared Mob interaction.
3. Designated native level publisher executes SPD's actual attack pipeline.
4. Native code records exact result: hit/miss, HP/HT, shields, buffs, actor cooldown, position, item/projectile effects, possible secondary Mob deltas, death and loot consequences.
5. Result is sent with request ID and stable target entity ID; local Actor.id() remains an internal publisher key only.
6. Worker validates pending request, authenticated publisher, trusted attacker/target pre-state, range/type, target identity, native transition, damage/HP/shield consistency, secondary deltas, reward/loot constraints, replay and action timing.
7. Worker persists accepted state and emits a sequenced combat event/snapshot.
8. Other clients update replicas without rerunning the native death/loot reward pipeline. If death or a complex side effect requires more state than a scalar event carries, request the full authoritative snapshot.

### Mob attacks a player

The designated level publisher runs the Mob's native AI/action. The Mob path queues the damage report and associates it with the Hero target. The Worker validates stable Mob owner/ID, trusted source/target state, reported native effect, and allowed transition. Target-owner/client reconciliation applies the resulting player state. Avoid accepting reactive client-side scalar damage with no bound native pre-state.

### PvP / delegated native combat

Current code includes target-owner/delegated patterns using RemoteHero representations so an authorized native SPD runtime can execute native attack logic. Server checks must bind attacker identity, target player identity, target ownership, request freshness, and exact before/after state. Final PvP/Deathmatch/Survival rules remain open phases and must be audited independently.

## 4.1 Poison LifeLink Mob damage: one native batch, one SQL transaction

The publisher captures the Hero pre-state, sequence baseline and shared Mob combat state before the original native Poison actor runs. Shattered Pixel Dungeon still executes all damage, LifeLink callbacks, Buff detach, XP, MonkEnergy and loot mechanics. The multiplayer layer captures their result; it does not reproduce the damage formula in TypeScript.

### Native message construction

- While a Poison `TickCapture` is active on the level publisher, `MultiplayerManager.sendAction()` suppresses the separate `SYNC_MOB_STATE` message for a `LifeLink`-source callback at the captured depth. This prevents a Mob death from being committed before the Hero side of the same native Poison callback is ready.
- `NativeMobCombatDelta.changedSince()` serializes every changed linked Mob using its publisher-local Actor ID, stable server entity ID, exact before/after HP/HT/position/shield/Buffs and native serialized bundles. A removed Mob is represented by a zero-HP tombstone and preserves its trusted pre-death bundle. When a Mob dies, `heaps` is a JSON array containing the final native heap snapshot.
- For a nonlethal Poison tick, `NativeHeroBuffTickPublisher.publish()` emits one `SYNC_HERO_STATE` action with `sourceType=BUFF_TICK`, the Hero post-state and the complete `secondaryMobDeltas` payload. The server commits the Hero and Mob results together.
- When the same Poison callback kills the local Hero after one or more LifeLink callbacks, `Hero.damage()` sends its environment-death result before the actor scheduler could emit `BUFF_TICK`. `MultiplayerManager.sendAction()` enriches that lethal `SYNC_HERO_STATE` environment action with the same Poison pre-state, sequence baseline, Buff identity and `secondaryMobDeltas`. The publisher intentionally emits no late Buff tick after Hero death.

### Server validation and ownership

The Worker/MatchRoom handler validates the batch against server-held state before any Mob or Hero write:

1. The Hero pre-state must match the trusted stored Hero snapshot, and the sequence baseline must be current (at least the latest accepted `HERO_BUFF_TICKED` sequence and no greater than the room sequence).
2. Native `LifeLink.object` Actor IDs are resolved against the same trusted Hero pre-state and complete level snapshot, then mapped to stable server entity IDs. Process-local Actor IDs from another device are not accepted as shared Mob identity.
3. Every delta must match the saved Mob's SQL HP/HT/position and trusted native pre-bundle. The native post-bundle, HP/HT/position, shield and Buff rows are validated; a dead Mob must be represented by the exact tombstone form and removed by stable entity ID.
4. If a Mob dies, the final heap array is validated against the previous trusted heaps and only the cells of the dead linked Mobs may change. Reward inputs (class, eligibility, EXP, maxLvl, spawning weight and base MonkEnergy) come from the trusted saved Mob metadata, never from an untrusted client reward claim.
5. The Hero Buff/environment transition must prove the exact native Poison result, LifeLink detach only for the same linked Mob death, and only supported non-level-up XP/base MonkEnergy changes. Malformed, stale, replayed, foreign or unrelated mutations fail closed.

Non-publishers cannot author linked Mob deltas from their local `LifeLink.object` Actor IDs. The non-publisher integration test verifies that the server returns `BUFF_TICK_MOB_AUTHORITY_REQUIRED` and leaves both sides untouched. Authority handoff and RemoteHero/player LifeLink are still separate Phase 9 work.

On a non-publisher, the owner's local Poison actor may still predict the Hero-side split damage, while `Mob.damage()` correctly refuses the shared Mob portion. The client sends the Hero tick only for server validation; because the sender's local Actor IDs cannot authorize the shared LifeLink, MatchRoom rejects the request with `BUFF_TICK_MOB_AUTHORITY_REQUIRED` even when the delta list is empty. `MultiplayerManager` recognizes the rejected `SYNC_HERO_STATE` and requests a full snapshot. This is a fail-closed recovery path, not supported delegated LifeLink gameplay; an end-to-end remote Hero/Mob execution path remains open.

### Atomic MatchRoom commit

The public `MatchRoom.handleAction()` wrapper recognizes every native `SYNC_HERO_STATE` `BUFF_TICK` carrying a string source class, safe Buff ID and trusted Hero pre-state envelope, plus the corresponding lethal Poison environment-death action carrying the Poison pre-state and secondary Mob batch. The Android full-snapshot regression now covers the recovery edge after a rejected non-publisher Poison/LifeLink tick: the client receives ERROR, requests RESYNC, then applies a complete server-format SNAPSHOT through `MessageRouter` and restores the authoritative local Hero HP/Buffs and stable Mob state. It runs the inner handler once inside `state.storage.transactionSync(...)`. The transaction includes Mob SQL updates/deletions and the level snapshot/heap, Hero state and player HP/state, stable Mob reward claims, the request replay record and final event, sequence and world-time advancement.

If `transactionSync` is not available, the batch is rejected instead of falling back to split writes. If any statement or final event insertion throws, SQL rollback restores the rows, snapshots, claims and event log; the handler restores its in-memory sequence/world-time checkpoint. The outer `MatchRoomMessages.webSocketMessage()` catch now includes the parsed `requestId` and current room `sequence` in its ERROR response, allowing the sender to remove the pending request and request RESYNC after rollback. The transaction wrapper also queues `ACTION_ACCEPTED` and FOV/room broadcasts until commit succeeds; the FOV `excludeWs` is translated from the transactional proxy back to the original sender socket so the publisher does not receive its own event twice. If a post-write hook throws, rollback occurs before any success/event message is delivered. The wrapper covers supported native Hero Buff ticks generally and the special lethal Poison LifeLink environment-death batch. The strict source-specific Hero Buff validator still decides whether a result is admissible; wrapping an unsupported class does not authorize it. Actions outside these shapes retain their existing transaction behavior.

The nonlethal accepted event is `HERO_BUFF_TICKED` and carries `secondaryMobDeltas` plus `nativeLifeLinkAtomicBatch` when the batch changed linked Mobs. The lethal environment path produces the Hero damage/death event with the linked entity IDs and reward evidence in the same request.

### Rewards and supported native side effects

The server builds validation-only synthetic Mob damage evidence from the already-validated deltas and trusted pre-death Mob snapshot. This lets the Hero validator calculate exact native non-level-up EXP (including the AscensionChallenge fallback) and supported base MonkEnergy while retaining the trusted Hero Bundle. It is not a second event or a second Mob write. Level-ups, `Hero.updateHT()`, item `onHeroGainExp` callbacks, Unencumbered Spirit, UnarmedAbilityTracker and RemoteHero/player links remain fail-closed.

### Poison damage absorbed by a concurrent Hero Barrier

The original Java `Char.damage()` path applies `ShieldBuff.processDamage()` to Poison damage (unlike Hunger, which native `ShieldBuff.processDamage()` explicitly bypasses). If a Hero has a `Barrier`, that same Poison callback may reduce its shield row or detach it at zero while leaving Hero HP unchanged.

The server now admits this one exact side effect for a native Poison `BUFF_TICK`:
- A surviving Barrier keeps its Actor ID, Actor time/cooldown and all non-shield bundle fields. Its shield value may only decrease; its `partial_lost_shield` decay remainder must remain unchanged.
- A depleted Barrier may disappear only when its row shield reaches zero. The outer Hero shield total must decrease by exactly the same amount as that Barrier row; unrelated shield loss cannot be hidden in the exception.
- Hero HP and every unrelated Buff remain governed by the existing Poison tick rules. An unchanged aggregate shield with a missing Barrier, extra shield loss, or a forged partial-decay change is rejected.
- Hunger remains on its native separate rule: starvation damage bypasses shields and cannot use this Poison/Barrier exception.

The server tests cover a fully absorbed Poison hit that detaches the Barrier, a partial shield absorption with the remainder unchanged, and negative cases for missing shield loss, excess aggregate loss and a forged partial accumulator. A Java runtime regression runs the native Poison actor against a two-point Barrier and verifies that the Barrier absorbs the two-point hit without changing Hero HP.
The serialized field name is taken directly from Java `Barrier.storeInBundle()`: `partial_lost_shield`. The backend rejects the non-native camelCase alias so test-only naming cannot mask a client/server wire mismatch.

### Native ShieldBuff priority ordering during Poison

The original `ShieldBuff.processDamage()` sorts active shields in descending order before applying the remaining damage:

| Native priority | Current native classes | Zero-shield lifecycle |
|---|---|---|
| 2 | `BrokenSeal$WarriorShield`, `Blocking$BlockBuff` | WarriorShield stays attached; BlockBuff detaches |
| 1 | `AscendedForm$AscendBuff`, `DivineIntervention$DivineShield` | AscendBuff stays attached; DivineShield detaches |
| 0 | `Barrier` / generic shields | Barrier detaches |

The server recovers the incoming Poison damage from the Hero's HP and aggregate-shield before/after totals (including the exact native WarriorShield activation amount when it triggers). It then aggregates the changed rows by priority and requires each tier to consume `min(remainingDamage, availableShield)` before the next tier can lose shield. Equal-priority rows are checked as one tier because Java's comparator can preserve native attachment order among equal-priority actors.

Every changed row still passes its class-specific identity, timing, native-field and detach checks. Unsupported or newly added ShieldBuff subclasses do not inherit this exception until their priority and zero-shield behavior are audited. Backend tests include valid tier consumption and forged bypasses of both priority 2 and priority 1; a Java runtime test executes the original Poison actor with all three tiers active.

### MatchRoom tests and verification boundary

`server/src/match-room/lifelink-death.integration.test.ts` invokes the actual `MatchRoom.handleAction` path with a deterministic in-memory SQL adapter. Coverage includes nonlethal and lethal publisher batches, fresh-ID replay rejection, unrelated/forged heap positions, non-publisher rejection, rollback when the final event insert fails, and a forced transaction failure through the WebSocket message boundary that verifies a correlated ERROR. Native Java runtime tests verify one ACTION for multiple linked Mob deaths and the proper heap-array wire shape.

Exact-head CI on `b68b66e686b98dbf343997202b215e2c828b7b89` passed [run 42777941791](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42777941791): TypeScript build and 644 Vitest executions across eight files, Android JVM tests and Debug APK compilation. Some TypeScript/generated-JavaScript suites mirror cases; this is an execution count, not a unique-scenario count.

The MatchRoom adapter models rollback deterministically but does not instantiate Cloudflare's actual Durable Object SQLite runtime or simulate a Worker restart. No Worker deployment or physical-device multiplayer session has been performed. Phase 9 remains open.



### Hero-targeted Amok expiry

`NativeHeroBuffTickPublisher` now captures the source tick for `Amok` when its target is the local Hero. This does not reproduce or modify native Mob AI: the original `Amok.detach()` only resets enemy-to-enemy aggro when the target is aligned as an enemy, whereas the local Hero is an ally. The backend therefore accepts only removal of the due Hero Amok row with all other Hero/Mob state unchanged. Amok is deliberately omitted from the set of Buff rows that may expire incidentally between another Buff's before/previous snapshots; only its own `BUFF_TICK` may remove it. The Android runtime test executes the original Buff actor and proves no Mob HP or AI-state change.



### Hero-targeted SnipersMark expiry

The local Hero's `SnipersMark` inherits `FlavourBuff.act()`, so the expiry is a native actor detach, not a new damage or target-selection calculation. The native `SnipersMark.detach()` removes its local `ActionIndicator` and then removes the Buff from the Hero. The Hero Buff publisher captures this one source actor and the server accepts only its own due removal with unchanged Hero HP/shield/inventory and unchanged mark identity fields in the pre-state. SnipersMark is not allowed to vanish incidentally between another Buff's snapshots.

This is deliberately narrower than synchronizing the mark's action: `SnipersMark.doAction()` knocks a SpiritArrow, resolves its target using a publisher-local Actor ID, sets the bow's sniper bonus and detaches the mark. That targeting and resulting arrow combat still require their own stable identity/native combat contract and are not covered by this expiry event.

The Java regression checks the action indicator clear, preserved target Actor ID/bonus in the transmitted pre-state, and unchanged nearby Mob HP/AI state. The backend regression rejects early expiry, a modified target ID, changed HP/shield/inventory, and implicit disappearance during a Haste tick.



## 4.2 SpiritArrow intent, authority and asynchronous native result (9-C partial)

The originating player starts at native `SnipersMark.doAction()`. The local client resolves the equipped `SpiritBow`, marked Mob and stable server `targetEntityId`, obtains Bow item identity/Bundle, captures Hero pre-state and sends strict `spiritArrow` metadata inside the existing NativeAttackPayload.

The schema and backend `isValidNativeSpiritArrowAttackIntent()` bind Bow/mark/target data to trusted Hero and level state. MatchRoom has pending combat reservation and COMBAT_REQUEST forwarding. A separate forwarding test verifies the request reaches the designated publisher and the pending identity is saved.

The local native lifecycle is covered: `SnipersMark.doAction() → SpiritBow.cast() → MissileSprite`; pending report remains open in flight; registered callback manually invoked twice yields one ATTACK/cleanup. Target-moved test checks cancellation, mark retention, RESYNC and no ATTACK. This is headless callback coverage, not rendered animation or device validation.

### Current MatchRoom roundtrip blocker

A new MatchRoom test joins requester ATTACK, pending reservation and COMBAT_REQUEST forwarding with a synthetic publisher SYNC_MOB_STATE response. The server rejects the response with `INVALID_ACTION` before ACTION_ACCEPTED/EVENT_BATCH. Exact CI [43242489324](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43242489324) on `7fe9b0164408cfde36b89a57551536bf6bbcd67c` is Backend-red (652 passed / 2 failed Vitest executions); Android JVM and assembleDebug pass.

The synthetic `authorityResult` appears to omit `attackerPos`; `hasStrictNativeCombatFields()` requires an integer and `isValidNativeCombatEvent()` compares it with the trusted attacker position. Verify all `authorityValid` predicates and the actual native Hero result serializer before changing anything. Do not weaken validation.

### Publisher asynchronous lifecycle still to audit

The publisher MessageRouter branch currently calls `remoteHero.shoot(target, bow.knockArrow())` and immediately `remoteHero.finishNativeSpiritArrowAttack(target)`. Trace RemoteHero sprite/group lifecycle, Hero.shoot, SpiritArrow.cast and MissileSprite callback to establish whether it finalizes too early.

The MatchRoom test synthesizes the publisher response; it does not execute Android MessageRouter or the original requester applying the event. A joined requester → server reservation → actual publisher native callback → accepted event → requester reconciliation test remains required. 9-C and parent Phase 9 remain open.


## 5. Mob turns and Actor scheduling

Actor scheduler is part of gameplay rules. Actor.java exposes multiplayer-specific classification and scheduler decisions: whether a shared actor is skipped on a non-publisher, whether its result should be published, and deferred publication when an actor is still resolving an attack.

Mob.java exposes native state and multiplayer bridges for AI state, base/effective speed, target cell/type/stable entity identity, attack completion and queued Hero damage. NativeMobCombatDelta captures secondary Mob state changes produced by native combat.

Required invariants:
- Shared actors must not independently advance on every client.
- Local Actor IDs may differ across peers; stable server IDs map to local runtime IDs.
- Cooldowns and global Actor clock must be restored without duplicate turns.
- Actor result is published after native action completion, not before pending callbacks.
- Replicas must not rerun death/loot/reward callbacks already resolved by the authority.
- Server tick validators must check expected timing and allowed side effects, not only an HP number.

Phase 3 is complete for implementation and automated acceptance, but future Actor/Mob timing changes must preserve these guarantees and be re-verified.

## 6. Snapshot publication, validation, and restoration

### Publication

SPDLevelSnapshot exports state from the actual native game, including: The serializer explicitly disables libGDX prototype elision with `Json.setUsePrototypes(false)`, because omitted default-valued fields such as `schemaVersion=1`/`branch=0` or empty required arrays make a complete snapshot fail the Android full-snapshot gate.
- level depth/branch, dimensions, seed, lock/feeling, native Level metadata;
- terrain/collision and exploration cells;
- transitions and shared Mobs with stable IDs, native bundles, buffs and AI/scheduler fields;
- heaps and native item bundles/identity;
- traps, plants, blobs and run/Hero/inventory/equipment/quickslot state where defined.

The server full-snapshot admission path validates bounded structure, required fields, numeric domains, positions and uniqueness before persistence. protocol/schema.json describes the shared envelope and native payload shapes.

### Restoration

1. MessageRouter receives a full snapshot.
2. It validates the outer payload and sequence.
3. WorldSnapshot.validateForRestore(...) performs native restore preflight before mutation.
4. A local rollback baseline is captured from live native state.
5. Restore applies validated geometry and metadata, reconciles native entities/bundles, refreshes visuals/map state, and updates stable-ID mappings.
6. Snapshot is marked applied only after successful restore.
7. If native restoration fails, rollback to the last known local baseline is attempted and resync is requested.

A complete authoritative collection that is empty must clear stale local instances. Missing fields must follow the documented full/partial snapshot contract; absence must not be interpreted as empty by default. Repeated full snapshot application must not duplicate entities or side effects.

## 7. Event ordering, replay, and resync

The message envelope contains protocolVersion, messageType, optional requestId, sequence, senderId, and serialized payloadJson.

Client MultiplayerManager keeps last-sequence state and exposes resync requests and snapshot application markers. MessageRouter routes SNAPSHOT, EVENT_BATCH, ACTION_ACCEPTED, ACK, COMBAT_REQUEST and other message families. Server keeps currentSequence, persisted event rows and processed request state.

Required behavior for all event paths:
- reject stale, duplicate, skipped, out-of-order, malformed, and conflicting requests according to contract;
- bind request/result to authenticated player and exact request ID;
- prevent request ID replay as a new action or reuse by another player;
- persist state mutation and sequence consistently;
- advance applied client sequence only after successful state reconciliation;
- request a complete snapshot when local pre-state cannot be proven or incremental application fails.

Current migration limit: MessageRouter default cases still forward to RemotePlayerActionReceiver. A single typed event path has not replaced all older message handling. Do not extend the legacy parsing path while implementing the phase-10 protocol migration.

## 8. Inventory, loot claims, exactly-once rewards

Native item actions must run through original SPD item methods. Client captures item class, stable ID, stack quantity, serialized bundle, inventory/container/equipment/quickslot changes, heap changes and native action cost.

Worker validates action intent and complete allowed before/after changes. Durable claimed_item_instances records are scoped by depth, branch, heap ID and item ID; claimed_chest_instances, processed_actions, and native_mob_reward_claims provide related claim/idempotency domains.

Distinguish:
- LootClaimManager is an in-memory Java helper.
- Worker SQL claims are the durable shared-room authority.
- A local claim is not proof of server-persisted ownership.
- Loot/item/reward event must not apply twice after reconnect or replay.

## 9. Floor transitions

Current implementation uses a pending transition lifecycle in the Durable Object. Room validates a source transition, marks it pending, waits for destination reports/readiness from required participants, then finalizes or aborts. MatchRoom.alarm() bounds the wait and aborts a transition that has not completed safely.

Client integration includes Hero/Level native transition behavior, InterlevelScene, MultiplayerManager, MessageRouter, and a complete destination LEVEL_DATA snapshot. Native fall/chasm flow is not an ordinary adjacent movement: SPD performs its pit/fall callback and destination logic before the normal move path.

Do not weaken destination snapshot/landing checks to make transitions pass. Validate floor/branch, destination seed, entrance/landing, required ready participants, and native world consistency.

## 10. Mode and visibility data flow

Mode descriptor classes provide properties; Worker stores room gameMode, includes mode-dependent logic, and broadcastWithFOV filters visibility in competitive modes. These pieces must be reconciled into one policy.

For every mode, prove:
- who may join and maximum participants;
- whether friendly fire, revive, respawn, or shared map applies;
- who owns a Mob or player target;
- how FOV changes event disclosure;
- score, kill/death, end condition, and persisted lifecycle;
- how disconnect/rejoin affects the match.

Until those criteria pass, show an honest unsupported/unavailable state rather than declaring the mode functional.

## 11. Practical tracing method

When a test fails or a behavior is reported:
1. Identify the initiating native Hero/Mob/scene method.
2. Follow the call into the multiplayer publisher or action dispatcher.
3. Inspect exact serialized payload and stable identity generation.
4. Follow Java message type/envelope and selected transport serialization.
5. Trace the Worker message branch and each helper validator it calls.
6. Identify all SQLite reads/writes, lock/claim operations and sequence increments.
7. Follow emitted event back through MessageRouter and any legacy receiver.
8. Confirm native object changes, scheduler effects, visual refresh and snapshot fallback.
9. Add accepted and rejected tests where applicable.
10. Update file map, roadmap, GPT checkpoint and affected flow notes in the same work unit.


## Backend implementation locations after MatchRoom Stage 2

The Worker still enters through `server/src/index.ts`, which preserves protocol/validator exports and re-exports the named `MatchRoom` Durable Object. Once routed to the Durable Object, responsibilities are located under `server/src/match-room/`:

- WebSocket JSON parsing and protocol dispatch: `messages.ts`.
- RECONNECT, LEVEL_DATA, LEVEL_READY and ACTION handling: `actions.ts`.
- Shared SQL/state fields and WebSocket broadcast primitive: `base.ts`.
- Schema/migration, item claim migration and generated fallback levels: `persistence.ts`.
- Combat reservation, authoritative reconciliation, spatial checks and FOV: `combat.ts`.
- Snapshot publication, floor transition finalization and match-end conditions: `snapshots.ts`.
- Final Durable Object export, constructor, alarm and room HTTP fetch: `server/src/match-room/index.ts`.
- Cloudflare Worker request routing before Durable Object dispatch: `server/src/worker.ts`; Wrangler still loads it through the root `server/src/index.ts` default re-export.

These are modules on one MatchRoom instance, not independent Durable Objects or parallel stores. The same request/session/sequence and SQL state must flow across every layer. The Stage 3 router extraction is covered by `server/src/entrypoint.test.ts`; it verifies room-name dispatch, exact Request forwarding, the default-room fallback, the non-room API response and the root `MatchRoom` export. Exact final-head CI is the acceptance gate; it does not prove a deployed Worker or physical-device session.
