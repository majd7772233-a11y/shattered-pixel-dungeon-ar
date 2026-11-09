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

## 4.1 Poison LifeLink Mob damage: commit once, correlate once

A native Poison tick that damages a LifeLink Mob produces two ordered messages:

1. The existing Mob.damage() path emits SYNC_MOB_STATE. The Worker validates that envelope against its trusted pre-event level snapshot, commits the Mob state or death and any loot change once, then records a CHAR_DAMAGED event with server-derived Actor identity and before/after bundle evidence.
2. The Hero Buff publisher emits SYNC_HERO_STATE / BUFF_TICK after Poison.act(). It includes the sequence baseline captured before the tick and a NativeMobCombatDelta payload. That Mob delta is evidence only; it is not a second mutation command.

The BUFF_TICK handler may correlate only accepted same-sender CHAR_DAMAGED events with native LifeLink source during this captured Poison tick and with sequence greater than sequenceBefore. The baseline must be at least the sender's latest accepted HERO_BUFF_TICKED sequence, so a client cannot widen the window and reuse an older LifeLink damage event. It must match publisher-local Actor ID, stable entity ID, exact HP/HT/position/shield/Buff values, trusted pre-bundle, native post-bundle, and the already-updated level snapshot. For a dead Mob, the accepted event must prove the target identity and zero-HP native post-bundle while the Mob is already absent from the current snapshot; final heaps must match the committed level snapshot.

The BUFF_TICK handler must never update Mob SQL rows, remove dead Mobs, rewrite levelSnapshot Mob entries, or apply the heap snapshot again. Reward receipts may be recorded idempotently, but they are not authority to repeat the native death transaction. When the native Mob death callback detaches the matching Hero-side LifeLink, the server permits only that exact detach when the correlated accepted event proves the same Actor ID reached zero HP; a generic missing LifeLink row is insufficient.

### Verified native Mob death rewards carried by the Hero Buff tick

The trusted level snapshot now captures the Mob's reward inputs while the Mob is still alive: native class name, enemy alignment eligibility, `EXP`, `maxLvl`, `spawningWeight()`, and the native base MonkEnergy amount (Boss 5, Miniboss 3, selected special Mob classes 0.5, otherwise 1). These values come from the publisher's native `Mob` instance and are stored in `SPDLevelSnapshot.MobData`. The Worker copies them from its trusted snapshot into the accepted `CHAR_DAMAGED` death event; the later `BUFF_TICK` cannot choose or replace them.

For a linked Mob death, the later Hero validator correlates the same accepted event and computes the expected native `Hero.earnExp()` delta. It supports only non-level-up transitions, including the native AscensionChallenge fallback (`Math.round(10 * spawningWeight())`) when the Hero is above the Mob's `maxLvl`. The Hero's level must remain unchanged and the resulting EXP must match exactly. Level-up paths remain rejected because `Hero.updateHT()`, skill/talent changes, abilities and item `onHeroGainExp` callbacks may alter additional Hero state.

For a Monk Hero, the validator also supports the exact base `MonkEnergy.gainEnergy(Mob)` reward and native energy cap when Unencumbered Spirit is absent and no UnarmedAbilityTracker is active. It uses the server-captured Mob reward class/properties to determine the gain and verifies the native Regeneration gate; when regeneration is disabled, the Buff may be created with zero added energy. Unencumbered Spirit multipliers and the tracker cap bypass remain fail-closed until their full native inputs and callbacks are represented.

The Java runtime regression now kills a positive-EXP linked Rat while the Hero is a Monk and verifies the native XP and MonkEnergy results. A second runtime regression confirms multiple linked Mob deaths in one Poison tick. Backend tests cover exact XP, AscensionChallenge fallback, level-up rejection, Monk base/cap behavior, Regeneration-off creation, unsupported talent multipliers, and stale/forged/foreign reward evidence.

### Lethal Hero Poison after linked Mob damage in the same callback

The native scheduler can run `LifeLink` Mob damage from inside `Poison.act()`. If the linked Mob dies first and the Hero's own Poison damage is lethal later in that same callback, `Hero.damage()` emits the Hero environment-death `SYNC_HERO_STATE` immediately. Because the Hero is now dead, the publisher intentionally emits no later `BUFF_TICK`.

The Worker uses the last accepted `HERO_BUFF_TICKED` sequence from the same sender as the baseline, then reads only later accepted same-sender `CHAR_DAMAGED` events whose source is native `LifeLink` and whose Actor IDs belong to the Hero's pre-death LifeLink rows. The accepted Mob death event already committed HP, removal and heaps; the Hero death handler only validates matching death/reward evidence and records idempotent reward claims. It never reapplies Mob writes.

For one or more linked Mob deaths, the Hero validator computes the exact non-level-up XP and supported MonkEnergy changes from those accepted events, validates exact LifeLink detaches, and preserves the trusted Hero combat Bundle except for the proven `exp` field. When Poison kills the Hero without a linked Mob death, the same complete Buff-delta validator still runs: no LifeLink detach, XP/MonkEnergy gain or unrelated Buff/Bundle mutation is admitted. The native runtime test asserts the Mob event precedes the Hero death event and that no late `BUFF_TICK` is sent.

### MatchRoom handler verification and its boundary

The server integration test calls the actual `MatchRoom.handleAction` method in order for the accepted Mob death request and the subsequent Hero death request. A deterministic in-memory SQL adapter verifies that the Mob row and level-snapshot entry are removed once, the Hero request records `PLAYER_DAMAGED` after `CHAR_DAMAGED`, the trusted Hero Bundle contains only the exact validated XP change, and the stable Mob reward claim is inserted once. It also checks same-request idempotency and rejects replaying the old Mob death with a new request ID.

This is not a single atomic action: the Mob event and Hero event are separate accepted requests. The test uses an in-memory SQL adapter rather than the Cloudflare Durable Object SQLite runtime; it therefore does not prove rollback/restart semantics or atomicity if the process fails between the two requests. Those recovery guarantees remain open and must not be inferred from CI.

Exact-head CI on `768485f5222fd5d8cf2285211af367f8fcf5b773` passed [run 42620080111](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42620080111): Backend TypeScript build and 610 Vitest executions across eight files, plus Android JVM tests and Debug APK compilation. Some TypeScript/generated-JavaScript suites mirror source cases; the execution count is not a count of unique scenarios.

Level-up/item callbacks, Monk talent/ability variants, RemoteHero/player LifeLink, reconnect/expiry boundaries and remaining consumable/detach callback families are still open. No Worker deployment or physical-device multiplayer session has been performed.

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

SPDLevelSnapshot exports state from the actual native game, including:
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
