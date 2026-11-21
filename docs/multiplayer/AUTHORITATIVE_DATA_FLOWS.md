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

Important boundary: `MultiplayerSetupScene` still transitions to `HeroSelectScene` without waiting for a confirmed server SESSION/ROOM_STATE. The in-game lobby now appears from GameScene after native-level publication; GameScene separately blocks native turns and cell selection until authoritative PLAYING. Bluetooth listener-start failures are now propagated rather than swallowed. Phase16B adds paired/nearby Classic peer selection and runtime/host-visibility consent; setup still lacks a visible pending/connected/authoritative-room gate. Complete connection-state and lobby UX is Phase20/21.

Relevant files: TitleScene.java, MultiplayerTransportScene.java, MultiplayerSetupScene.java, MultiplayerManager.java, HeroSelectScene.java, GameScene.java, selected transport, MatchRoom.fetch()/webSocketMessage(), and protocol definitions.

## 2A. Lifecycle-v1 room lobby and authoritative start

1. An Internet session requests lifecycle version 1; rooms without that opt-in retain the legacy path.
2. `MultiplayerSetupScene` starts the transport/session and proceeds to HeroSelectScene. `GameScene` publishes the first native level and sends LEVEL_READY before the lobby exposes Ready/Start.
3. `WndMultiplayerLobby.tick()` opens the modal in GameScene. `RoomLobbyState` parses the server ROOM_STATE once on the render thread and publishes a validated roster plus revision.
4. READY is sent only after the local native snapshot has been applied and seed/sequence match. READY=true carries the native class and serialized Hero state required by the Worker.
5. Only the owner can start; UI requires local snapshot synchronization, local/server readiness and LOBBY status. The Worker repeats publisher, membership, readiness, seed/sequence, snapshot and transition checks transactionally.
6. Authoritative MATCH_START moves the manager to PLAYING and closes the modal. GameScene does not spend native actors or enable cell selection before PLAYING.
7. Leave waits for server confirmation and ends the local lifecycle cleanly. Retry exhaustion clears pending requests and exposes explicit local exit; failed/reconnecting Internet state never unlocks solo gameplay implicitly.

The lobby is only a presentation/command surface. The server owns membership, readiness, publisher, start, cancellation and closure. Malformed roster data leaves the last trusted roster intact and disables state-changing actions.

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

Do not assume every NetworkActionType has a complete server implementation. NetworkActionBridge maps only ten explicit HeroAction classes to Optional network actions; unmapped actions are rejected by MultiplayerActionDispatcher and are never converted to WAIT. Direct producers for other action families remain source-specific. Neither enum membership nor a Worker branch proves every item/effect subcase is enabled.

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

Non-publishers cannot author linked Mob deltas from their local `LifeLink.object` Actor IDs. The non-publisher integration test verifies that the server returns `BUFF_TICK_MOB_AUTHORITY_REQUIRED` and leaves both sides untouched. Publisher handoff is implemented and tested in Section 4.3. RemoteHero/player LifeLink remains an explicit fail-closed exclusion under the accepted Phase 9 support boundary; it is not an unfinished Phase 9 task.

On a non-publisher, the owner's local Poison actor may still predict the Hero-side split damage, while `Mob.damage()` correctly refuses the shared Mob portion. The client sends the Hero tick only for server validation; because the sender's local Actor IDs cannot authorize the shared LifeLink, MatchRoom rejects the request with `BUFF_TICK_MOB_AUTHORITY_REQUIRED` even when the delta list is empty. `MultiplayerManager` recognizes the rejected `SYNC_HERO_STATE` and requests a full snapshot. This is a fail-closed recovery path, not supported delegated RemoteHero/player LifeLink gameplay. Such cross-device Buff Actor references remain outside the accepted Phase 9 support boundary unless a separately scoped future capability is specified and validated.

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

This original MatchRoom adapter remains a deterministic in-memory SQL test and does not itself instantiate Cloudflare Durable Object SQLite. Phase 9 subsequently added `server/src/match-room/durable-object-sqlite.integration.do.mjs`, which runs three tests against real Durable Object SQLite under the local Workers runtime: Poison LifeLink transaction rollback/replay across eviction, persisted-snapshot publisher handoff with pending-combat closure, and committed-state reconstruction after eviction. The deployed production Worker and physical-device multiplayer session have not been tested; those remain Phases 22 and 23. Phase 9 is complete for implementation and automated acceptance under its explicit fail-closed support boundary.



### Hero-targeted Amok expiry

`NativeHeroBuffTickPublisher` now captures the source tick for `Amok` when its target is the local Hero. This does not reproduce or modify native Mob AI: the original `Amok.detach()` only resets enemy-to-enemy aggro when the target is aligned as an enemy, whereas the local Hero is an ally. The backend therefore accepts only removal of the due Hero Amok row with all other Hero/Mob state unchanged. Amok is deliberately omitted from the set of Buff rows that may expire incidentally between another Buff's before/previous snapshots; only its own `BUFF_TICK` may remove it. The Android runtime test executes the original Buff actor and proves no Mob HP or AI-state change.



### Hero-targeted SnipersMark expiry

The local Hero's `SnipersMark` inherits `FlavourBuff.act()`, so the expiry is a native actor detach, not a new damage or target-selection calculation. The native `SnipersMark.detach()` removes its local `ActionIndicator` and then removes the Buff from the Hero. The Hero Buff publisher captures this one source actor and the server accepts only its own due removal with unchanged Hero HP/shield/inventory and unchanged mark identity fields in the pre-state. SnipersMark is not allowed to vanish incidentally between another Buff's snapshots.

This is deliberately narrower than synchronizing the mark's action: `SnipersMark.doAction()` knocks a SpiritArrow, resolves its target using a publisher-local Actor ID, sets the bow's sniper bonus and detaches the mark. That targeting and resulting arrow combat still require their own stable identity/native combat contract and are not covered by this expiry event.

The Java regression checks the action indicator clear, preserved target Actor ID/bonus in the transmitted pre-state, and unchanged nearby Mob HP/AI state. The backend regression rejects early expiry, a modified target ID, changed HP/shield/inventory, and implicit disappearance during a Haste tick.



## 4.2 SpiritArrow intent, authority, result and requester reconciliation — Phase 9 complete

1. The originating Hero runs native `SnipersMark.doAction()` and the equipped `SpiritBow` path. The report retains Bow identity, mark identity/bonus, stable target entity ID, Hero pre-state and native target pre-state.
2. The server validates intent against trusted Hero/Bow/mark/Mob state and current publisher generation. It reserves attacker/target locks and forwards a server-authored COMBAT_REQUEST to the level publisher.
3. The publisher resolves SPD combat in Java. The origin-client missile completion finalizes the deferred report exactly once; target movement/removal cancels and requests RESYNC instead of sending stale ATTACK state. Delegated RemoteHero resolution uses the native Hero attack/deferred-report path.
4. The publisher submits SYNC_MOB_STATE. MatchRoom rechecks request, authority, stable target identity, pre-state and native bundle, then commits Mob row, level snapshot, replay receipt, event and sequence in one transaction.
5. ACTION_ACCEPTED and FOV/event delivery occur only after commit. Rollback returns a correlated error to the requester/publisher and does not leak an accepted event.
6. The requester receives the sequenced PLAYER_ATTACKED EVENT_BATCH. Android resolves the Mob via its stable server entity ID, applies bounded scalar fields and requests a full snapshot whenever a complete targetMobBundleAfter or secondary Mob result proves scalar reconciliation incomplete.
7. Android JVM coverage routes the same accepted SpiritArrow event to two client worlds with distinct local Mob Actor IDs but the same stable server identity. Both update the correct Mob and request the authoritative full snapshot. Backend tests cover result commit, requester delivery, correlated rejection, forged/missing position, wrong mark target and SQL rollback.

The accepted scope is the verified stable-Mob target path. SPEED volleys and non-Mob targets remain fail-closed. RemoteHero/player LifeLink remains unsupported because process-local Buff Actor IDs cannot be transferred safely under the current mapping contract.

### 4.3 Publisher disconnect and lossless rebase

Level Publisher is a durable generation, not a client-side boolean. Disconnect handoff updates owner and generation transactionally, closes pending combat reservations tied to the old authority, sends the committed server snapshot and publishes LEVEL_PUBLISHER_CHANGED. If no eligible replacement exists, owner is cleared and world actions stay blocked.

The new publisher must send a lossless full-level rebase. Shared Mob IDs/bundles and world state remain unchanged; publisher-local Actor IDs are refreshed and checked. LifeLink.object and SnipersMark.object/server_entity_id must resolve to the exact same Mob identity. Invalid/stale rebase does not update publisher-ready term, and shared actions remain blocked until the current generation is committed.

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

### Phase 14-A complete serialized-byte admission

All production full SNAPSHOT paths use the single `MatchRoomSnapshots.buildSnapshotMessage` builder. `snapshot-size.ts` counts the exact UTF-8 JSON representation, including escaping of the inner `payloadJson` string. Nested payload data is measured before JSON serialization; the outer envelope is measured before its wire text is returned.

- Maximum accepted complete SNAPSHOT: **15.5 MiB / 16,252,928 UTF-8 bytes**, leaving 512 KiB below Android's unchanged **16 MiB / 16,777,216-byte** frame limit.
- Over-budget data returns `SNAPSHOT_TOO_LARGE`; no data is silently trimmed.
- LEVEL_DATA, ACTION, JOIN_ROOM, READY, MATCH_START and projected floor transitions are preflighted before the applicable SQLite transaction or authoritative floor mutation commits.
- Initial WebSocket handshake and authenticated reconnect also preflight before rotating the persisted session token or accepting the socket; an oversized recovery snapshot returns HTTP 413 and leaves the prior token/connection state unchanged.
- RECONNECT, RESYNC, room lifecycle broadcasts and general full snapshots use the same bounded builder. Lifecycle-v1 snapshots are restricted to connected durable room members.
- Inbound text frames above 16 MiB UTF-8 are rejected before JSON parsing.
- Only the newest 200 replay events are transmitted in ascending order; older SQLite event and LifeLink proof evidence remains stored.

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

Phase 10-E closeout: MessageRouter now has one explicit route decision for all 25 canonical outer message values, with no catch-all forwarding to RemotePlayerActionReceiver. PLAYER_JOINED is a typed render-thread path with senderId/payload identity and position validation; PLAYER_LEFT retains its tested cleanup; READY updates server-authored RemotePlayer readiness metadata and snapshots restore it; PING is transport-only. CHAT is explicitly non-routed on Android because there is no chat UI. Client-to-Worker and declared placeholder enum values are explicit non-inbound decisions. The receiver remains in the source tree for explicit Hero setup/legacy helper duties, including render-thread actor creation and scene-conditional HeroSprite attachment. EVENT_BATCH sequence/application semantics were not changed by Phase 10. Exact closeout SHA f2d79038d1e420461be7a1956471324de5c1ef74 passed CI 43618725089.

### Historical Phase 11-A behavior characterization (2026-11-14; superseded by Phase 11-B)

Tests now pin the current reliability boundaries without changing runtime behavior:
- Worker reconnect replays only a complete retained sequence range for a non-current publisher when the gap is at most 50; a gap above 50 or an incomplete row range falls back to a full SNAPSHOT.
- RESYNC emits a full SNAPSHOT with current player/Mob/level state and an event-history field; this is not an EVENT_BATCH response.
- Same-player requestId reuse currently returns the stored accepted result without comparing incoming action/payload with the original request.
- Android EVENT_BATCH does not require contiguous sequence values and advances the watermark before validating/applying a new event body.
- Full SNAPSHOT restore rejects snapshots older than the currently applied client sequence before mutating the live world.

These are known gaps for Phase 11-B, not accepted reliability guarantees. The Phase 11-A tests characterize them; no runtime code changed.

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


### Phase 10 ACTION payload field reconciliation

The ACTION inner envelope is defined in protocol/schema.json with action, data and heroStateJson; its oneOf contains a separate data-field inventory for every one of the 23 canonical action names. protocol/action-data-contracts.json names the Worker handler and validators, Java producer source paths, and the partition between Java-source-referenced and Worker-only field names. The static guard verifies 361 Worker-consumed field names (346 in the listed Java producer source; 15 Worker-only) and the 18 required NativeLevelSnapshot fields. This is a source/name parity inventory, not a replacement for runtime Worker validators: actual field types, per-subcase requiredness, values, preconditions and feature support remain validator-owned. WAIT and USE_ABILITY are declared but non-emitted by Android and remain fail-closed.

## Phase 11-B — authoritative sequence, replay and commit flow (2026-11-15)

The current cross-layer data flow at code/test SHA `2574489ff25e6f1fedc1e21718161bc5a7a1b230` passed exact-head [CI 43731016036](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036).

1. **Worker request admission:** ACTION requests pass action-specific source validators and request fingerprint checks. A requestId is bound to the authenticated player and canonical action/payload; exact retry reuses the recorded result, while changed or cross-player reuse rejects.
2. **Durable commit:** the covered ACTION mutation writes authoritative state/claims, processed receipt, event, sequence and world time in the same transaction. Response/broadcast messages are buffered until commit. On failure, persisted and in-memory checkpoints roll back and no accepted event escapes.
3. **Client batch normalization:** Android parses batch rows, rejects invalid/conflicting sequence rows, deduplicates exact repeats and sorts remaining rows. It requires a contiguous run from lastApplied + 1 and checks the envelope tail.
4. **Client state mutation:** each event is applied with a rollback baseline. Only a successful world application commits the event watermark; malformed rows or gaps request RESYNC without consuming the missing sequence. EVENT_SKIPPED consumes sequence but leaves game state unchanged.
5. **Recovery:** reconnect may replay only a complete contiguous retained range of at most 50 events for an eligible non-current publisher. Otherwise the authoritative response is a full SNAPSHOT; RESYNC itself remains full SNAPSHOT. Stale/incomplete snapshots are rejected before live-world mutation.

The 25-message / 23-action protocol vocabulary is unchanged. No production deployment or physical-device proof is implied.

## Phase 17-A - Co-op room lifecycle projection and publisher recovery

The server projects room state from durable facts rather than copying gameStatus into the room payload. In a lifecycle-v1 Co-op room, READY requires at least the mode's minimum membership, every member connected and ready with a persisted proof matching the current seed and sequence, a complete native snapshot for the current depth/seed, and a connected room-member publisher whose ready term equals the current publisher term. allReady uses those same current proofs; a stale ready flag is not sufficient.

During an active match, publisher loss is durable: no eligible successor yields SUSPENDED; a promoted or reconnecting Co-op member yields RECOVERING until it submits a validated native rebase. The rebase transaction persists the level data and new publisher-ready term and changes roomLifecycleState back to PLAYING together. Only after commit does the lifecycle layer broadcast the committed room snapshot and recovered room state. A failed/rolled-back rebase cannot reopen gameplay.

Android treats roomStatus as the room authority and separately validates its relationship with internal gameStatus. SUSPENDED, RECOVERING, ENDED and CLOSED remain non-gameplay states. MATCH_START and local world-sync callbacks cannot supersede a recovery state. Legacy non-lifecycle sessions and non-Co-op publisher behavior remain outside this Co-op transition change.

## Phase 17-B — death, revival, leave and match end

Native Hero/Ankh state flows from a validated client snapshot into the Durable Object, which derives the member life state and action permissions. Pending unblessed-Ankh revival (or an inconsistent dead/spectator snapshot) blocks floor transition; a coherent spectator state does not. A voluntary LEAVE is serialized as `PLAYER_LEFT`, removes membership/readiness and sets `LEFT`/disconnected before any resulting `MATCH_END`. `MATCH_END` is sequenced and persisted with terminal room/game status and publisher revocation in the same SQLite transaction.
