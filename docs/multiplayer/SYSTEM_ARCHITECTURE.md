# Multiplayer System Architecture

## 1. Architecture summary

The application is a multi-module Java/libGDX game. Multiplayer is a cross-layer feature, not a self-contained networking package.

Conceptual dependency flow:

**Native SPD gameplay and Actor scheduler**
→ **Multiplayer action bridge / capture / snapshot exporter**
→ **Network envelope and transport**
→ **Cloudflare Worker room router**
→ **Durable Object MatchRoom**
→ **SQLite room persistence and ordered events**
→ **validated server event or snapshot**
→ **client MessageRouter**
→ **native reconciliation / WorldSnapshot**
→ **rendered local and remote game state**

This is an explanatory flow, not a guarantee that every event currently passes through one unified pipeline. MessageRouter still routes its default branch to RemotePlayerActionReceiver; a single typed application path is open roadmap work.

## 2. Build-time module graph

The inspected settings.gradle includes:

| Gradle project | Responsibility | Relationship |
|---|---|---|
| :SPD-classes | Shared SPD/engine support sources | Exposed to :core through the core module API dependency |
| :core | Main game, Java/libGDX gameplay, scenes, multiplayer client, assets, JVM tests | Consumed by platform applications; depends on :SPD-classes and :services |
| :android | Android application and Android-specific platform integration | Depends on :core; includes Android libGDX backend and native libraries |
| :ios | iOS/RoboVM platform module | Included in the build; multiplayer readiness on iOS is not established by Android evidence |
| :desktop | Desktop launcher module | Included in the build; multiplayer readiness on desktop is not established by Android evidence |
| :services | Common service module | Consumed by :core |
| :services:updates:debugUpdates | Debug update implementation | Android debug dependency |
| :services:updates:githubUpdates | Release update implementation | Android release dependency |
| :services:news:debugNews | Debug news implementation | Android debug dependency |
| :services:news:shatteredNews | Release news implementation | Android release dependency |

Important inspected build values at the audited HEAD:

- Android Gradle Plugin: 9.1.0.
- Java source compatibility: 11.
- Android compile/target SDK: 36.
- Android minimum SDK: 21.
- libGDX: 1.14.0.
- Controller extension: 2.2.4.
- RoboVM: 2.3.24.
- Android namespace: com.shatteredpixel.shatteredpixeldungeon.android.
- Application ID: com.magd.shatteredpixeldungeon.
- :core uses JUnit 4.13.2 and libGDX headless test runtime.

Re-check root Gradle files before changing versions or modules; these values describe the audited commit, not an eternal guarantee.

## 3. Runtime layers

### 3.1 Native game layer

The original Java game owns gameplay rules and state:
- Actor scheduler and actor time.
- Char attack/damage/buff behavior.
- Hero player action execution, item/inventory state, and native combat.
- Mob AI state, targeting, attacks, damage, death and loot lifecycle.
- Level geometry, terrain, heaps, transitions, traps, plants, blobs and metadata.
- Dungeon run initialization, seed, depth and level lifecycle.
- GameScene rendering, map updates, UI and render-thread operations.

Multiplayer patches these paths at selected boundaries so native results can be captured, authorized, published, applied, or safely skipped on replicas. It does not replace the native classes.

### 3.2 Multiplayer client layer

The package core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/ contains:

- Session/controller state in MultiplayerManager.
- Message envelope and type contracts in NetworkMessage, MessageType, and NetworkActionType.
- Transport abstraction and implementations in NetworkTransport, InternetTransport, LANTransport, and BluetoothTransport.
- Action mapping and hooks in NetworkActionBridge and MultiplayerActionDispatcher.
- Native state capture in SPDLevelSnapshot.
- Native world import/rollback in WorldSnapshot.
- Event dispatch in MessageRouter, with RemotePlayerActionReceiver still present as a secondary/legacy receiver.
- Combat authority/state helpers in NativeCombatAuthorityPolicy, NativeCombatJson, NativeMobCombatDelta, and NativeHeroBuffTickPublisher.
- Item action gates/publishers in NativeItemUse and NativeItemActionPublisher.
- Player representation/helpers in RemotePlayer, MultiHeroManager, PlayerFOV, and MultiplayerRunProgress.
- Mode descriptors in GameMode, CoopMode, PvPMode, DeathmatchMode, and SurvivalMode.

MultiplayerManager is the client-side session coordinator. It is not the Worker, a durable database, or the native game engine.

### 3.3 Transport layer

All transports implement NetworkTransport and report through TransportCallback. The abstraction lets the manager start, send, stop, and query a transport without owning socket mechanics.

Current source implementations:
- InternetTransport: custom TCP/TLS socket and WebSocket handshake/framing implementation.
- LANTransport: local TCP server/client and UDP host discovery.
- BluetoothTransport: common Java facade over NativeBluetoothProvider; Android-specific AndroidBluetoothProvider implements that provider interface.

Do not infer production readiness from implementation presence. Handshake correctness, fragmentation, message framing, timeouts, reconnection, host/client startup, discovery, OS permissions, lifecycle, and real two-device tests require separate evidence. The setup UI currently catches some LAN/Bluetooth startup exceptions without surfacing them and immediately advances after startSession; truthful connection UX is still an open audit target.

### 3.4 Backend room layer

After the three-stage source refactor, the backend has these distinct responsibilities:
1. `server/src/protocol/types.ts` owns Env, NetworkMessage and SessionData types.
2. `server/src/validators/` owns the original pure validation/helper declarations, grouped by entity identity, transitions, equipment, item state, abilities, shop, world actions, inventory/claims/economy, floor items, Hero Buffs, world state and combat state.
3. `server/src/util/seeded-rng.ts` owns the original deterministic SeededRNG helper.
4. `server/src/index.ts` remains the stable Wrangler Worker entry and compatibility facade; it re-exports the default request router from `server/src/worker.ts` and the named `MatchRoom` class from `server/src/match-room/index.ts`.

The single MatchRoom class owns one shared DurableObjectState, SQLite storage, sequence, match seed, current depth, world time, game mode/status, schema initialization, session/WebSocket handling, actions, snapshots, pending combat/transition state and broadcasts through internal inheritance layers under `server/src/match-room/`. The final class is defined in `match-room/index.ts`, while the root entry remains the stable Worker main and facade. Stage 2 passed exact-HEAD [CI run 42483052104](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42483052104) on `237577f1e8c68a3f052b36fcac64cd7efc07918d` (Backend + Android jobs). Stage 3 owns the final Worker-entry and declaration-parity audit.

The old 10,095-line / approximately 659 KB figure is the pre-extraction source baseline. Stage 1 moved the original 200 top-level declarations before MatchRoom into 15 modules without changing their validation rules or wire behavior. After Stage 1 the root `index.ts` was 3,635 lines / 254,668 bytes; after Stage 2 it was a 51-line facade; after Stage 3 it is 35 lines and re-exports the unchanged default Worker handler from `worker.ts`. It retains all 118 original validator/protocol/helper exports plus the named `MatchRoom` export. Exact-HEAD [CI run 42479978278](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42479978278) passed backend typecheck/tests and Android JVM/debug-APK checks. Stages 1–3 did not modify Java sources, `protocol/schema.json`, Wrangler binding/class identity, SQLite tables/migrations or deployment routing.

### 3.5 Protocol layer

protocol/schema.json is a JSON Schema Draft-07 document with protocol version 1.0.0. Its outer enum currently contains 25 names, including LEVEL_PUBLISHER_CHANGED; NativeLevelSnapshot carries optional publisherRebase and publisherRebaseTerm fields used by the Phase 9 handoff gate.

The top-level message envelope requires protocolVersion, messageType, and payloadJson; requestId, sequence, and senderId are optional in the schema. It defines message kinds and data structures for native snapshots, Mobs, tiles, heaps, combat outcomes, damage/revival, and item payloads.

The schema is not self-enforcing. Java serialization/parsing and Worker validation must implement the same semantics. Server admission must not rely on a client merely claiming that an operation was natively executed.


### 3.5.1 SpiritArrow and publisher authority handoff — Phase 9 complete

Strict SPIRIT_ARROW intent binds equipped Bow item identity, SnipersMark identity/bonus and stable Mob target identity. MatchRoom reserves the request, forwards COMBAT_REQUEST to the designated level publisher, and accepts only the publisher's native Java result. Mob/level state, event and sequence commit atomically; ACK/FOV/event delivery is deferred until commit. Failures return correlated ERROR and leave no partial state.

The requester receives the accepted sequenced EVENT_BATCH. Android resolves the target by stable server Mob entity ID, not a device-local Actor.id(); when the complete Mob bundle is present it requests the authoritative full snapshot rather than inferring Mob scheduler/AI state. JVM regressions cover two clients with different local Mob Actor IDs, exactly-once MissileSprite callback/cancel, delegated RemoteHero result capture and accepted-event reconciliation.

Publisher loss uses a durable monotonic generation and atomic handoff. A replacement is selected only from valid persisted Hero/world state; pending combat tied to the old publisher is closed. The replacement receives the persisted snapshot and must submit a lossless publisher rebase. Shared Mob IDs/bundles remain unchanged while process-local Hero/RemoteHero/Mob Actor registries are refreshed. LifeLink and SnipersMark references must resolve to the exact stable Mob identity. Remote cross-device local references that cannot be safely rebound remain fail-closed.

Gameplay/test baseline `bc6c46b03fee040ff20311adb473b19ff78e9bb7` passed exact-code CI [43472587588](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588). Current documentation HEAD `7a6e091973051d82cb3cdf749553dd07d4ab0fce` also passed all three jobs in exact-HEAD CI [43476033245](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43476033245): Backend (682 executions), Android JVM/Debug APK and three Workers-runtime Durable Object SQLite tests. This is not a production Worker deployment or a rendered projectile animation.
### 3.6 Android platform bridge

android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/AndroidBluetoothProvider.java implements the core BluetoothTransport.NativeBluetoothProvider interface using Android Bluetooth APIs. This is a platform adapter. Verify its provider registration/injection path and current Android permission/manifest behavior before describing Bluetooth as ready.

## 4. Authority and trust boundaries

The architecture separates the actor that executes native behavior from the service that coordinates and validates it.

- Native SPD runtime produces formulas and callbacks.
- A designated level publisher owns shared Mob/world turns in the current design.
- A player owner resolves selected effects against that player's Hero.
- The Worker verifies sender authorization, request/target identity, trusted pre-state, geometry, sequence/replay constraints, bounded native bundle changes, and allowed side effects before committing accepted state.
- Other clients reconcile sequenced events and complete snapshots. They must not rerun side-effecting native death/loot logic for a Mob whose authoritative death has already been resolved elsewhere.
- Unsupported, incomplete, ambiguous, or multi-target side effects should fail closed and request resync rather than be guessed.

Actor.id() is local to one device's scheduler. Stable server entity IDs are carried across peers and mapped to local Actor IDs by MultiplayerManager. Keep those identity domains separate.

## 5. Durable data and consistency

The Durable Object uses SQLite tables created in MatchRoom.initDatabase():

| Table | Observed purpose |
|---|---|
| room_meta | Key/value room state, mode, seed, depth, world time, pending transitions/combat locks and serialized hero-state keys |
| players | Player identity/session token, class, location, HP/HT, combat statistics, next action time, ready/state/connected fields |
| levels | Per-depth dimensions, entrance/exit and seed |
| level_tiles | Per-depth tile terrain and traversal/LOS flags |
| mobs | Per-depth server Mob rows, positions, HP/HT and selected native/runtime fields |
| claimed_item_instances | Durable per-depth/branch heap-item ownership claims |
| claimed_chest_instances | Durable chest-open claims |
| level_transitions | Transition records for floors |
| processed_actions | Request-ID idempotency/result records |
| native_mob_reward_claims | Exactly-once Mob reward claims |
| events | Sequenced authoritative event log |

claimed_item_instances has a migration path that recreates the table with a branch column while preserving older rows. MatchRoom.alarm() expires/aborts a pending floor-transition flow if destination readiness does not arrive before its deadline. Pending combat reservation keys are maintained in room_meta and stale reservations are reconciled.

Do not assume this table list is a complete logical data dictionary or that every field is authoritative for every phase. Inspect initDatabase, migrations, inserts, reads, updates and deletes before changing persistence. SQLite mutations and event-sequence changes must be reviewed as one consistency operation.

## 6. Startup and scene integration

Observed scene flow:
1. TitleScene exposes multiplayer navigation.
2. MultiplayerTransportScene stores the selected transport (INTERNET, LAN, or BLUETOOTH) and enters MultiplayerSetupScene.
3. MultiplayerSetupScene constructs the transport and invokes MultiplayerManager.startSession(...).
4. The current setup code switches to HeroSelectScene immediately after starting the session; it does not visibly wait for a confirmed room-ready handshake.
5. HeroSelectScene calls applyAuthoritativeSeed() so the shared seed can be applied before native run generation.
6. GameScene.create() publishes the level and sends LEVEL_READY when multiplayer is active.

This is the observed flow, not proof that all room state transitions or transports are release-ready. Common lifecycle and truthful connection/readiness gates remain open roadmap work.

## 7. Threading and rendering

Transport callbacks can occur away from the game/render thread. MessageRouter explicitly schedules EVENT_BATCH, COMBAT_REQUEST, ACTION_ACCEPTED, and default receiver work through Game.runOnRenderThread(...) in the inspected implementation. Native actor, dungeon, sprite and inventory state must only be touched on the thread required by the game runtime.

Do not move parsing or validation across thread boundaries casually. Separate safe immutable payload parsing from native scene mutation, and preserve deterministic event ordering when work is queued.

## 8. Key design risks

- `server/src/index.ts` is a 35-line stable Wrangler entry and compatibility facade; `server/src/worker.ts` owns default request routing; `server/src/match-room/` contains the one shared-instance Durable Object inheritance chain; validator implementations live in focused modules. The three source-refactor stages are complete for implementation and automated acceptance.
- MessageRouter still has a default receiver branch for RemotePlayerActionReceiver; the one typed event path is incomplete.
- Setup UI does not wait for confirmed connection and silently catches some transport startup failures.
- Mode descriptors exist, but server-enforced mode acceptance remains open.
- Transport implementations require protocol and physical-device verification.
- The backend deploy workflow triggers only from master/main server changes or manual dispatch; it does not deploy the active multiplayer branch on push.
- Current exact-head CI proves automated backend and Android JVM/debug-APK validation only. It does not prove live Worker deployment or device networking.

The Worker integration tests live in `server/src/entrypoint.test.ts`; they verify deterministic routing contracts, not live deployment or physical-device behavior. See AUTHORITATIVE_DATA_FLOWS.md and COMPONENT_AND_FILE_MAP.md for edit-level impact details.
