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
- Final Durable Object export, alarm and HTTP fetch: `index.ts`.

These are modules on one MatchRoom instance, not independent Durable Objects or parallel stores. The same request/session/sequence and SQL state must flow across every layer. The final Stage 2 source SHA `237577f1e8c68a3f052b36fcac64cd7efc07918d` passed [exact-HEAD CI run 42483052104](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42483052104) for both Backend typecheck/tests and Android JVM/debug APK compilation.
