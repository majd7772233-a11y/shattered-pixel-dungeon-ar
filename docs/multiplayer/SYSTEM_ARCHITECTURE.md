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

server/src/index.ts currently contains:
1. Shared TypeScript envelope types and a very large group of exported pure validators and state-transition helpers.
2. MatchRoom, the Durable Object class for a room.
3. The default Worker fetch handler that selects a Durable Object by room name and delegates /room/{roomCode}/... requests to it.

MatchRoom stores DurableObjectState, a SQLite handle, sequence, match seed, current depth, world time, game mode and match status. It owns room initialization, database migration/schema setup, session/WebSocket handling, action admission, snapshots, pending combat/transition state, event sequence, broadcast and field-of-view filtering.

The single file is 10,095 lines / approximately 659 KB at the audited HEAD. Backend domain concerns are not yet separated into distinct source modules. This concentration is a maintenance/review risk: when modifying a validator or message handler, inspect the full function and its callers, preconditions, persistence writes, event emission, and tests. A future extraction must be separately planned and preserve behavior; do not introduce an unrelated large refactor inside a gameplay phase.

### 3.5 Protocol layer

protocol/schema.json is a JSON Schema Draft-07 document with protocol version 1.0.0.

The top-level message envelope requires protocolVersion, messageType, and payloadJson; requestId, sequence, and senderId are optional in the schema. It defines message kinds and data structures for native snapshots, Mobs, tiles, heaps, combat outcomes, damage/revival, and item payloads.

The schema is not self-enforcing. Java serialization/parsing and Worker validation must implement the same semantics. Server admission must not rely on a client merely claiming that an operation was natively executed.

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

- server/src/index.ts is a very large single backend implementation combining validators, coordination, persistence and WebSocket lifecycle.
- MessageRouter still has a default receiver branch for RemotePlayerActionReceiver; the one typed event path is incomplete.
- Setup UI does not wait for confirmed connection and silently catches some transport startup failures.
- Mode descriptors exist, but server-enforced mode acceptance remains open.
- Transport implementations require protocol and physical-device verification.
- The backend deploy workflow triggers only from master/main server changes or manual dispatch; it does not deploy the active multiplayer branch on push.
- Current exact-head CI proves automated backend and Android JVM/debug-APK validation only. It does not prove live Worker deployment or device networking.

See AUTHORITATIVE_DATA_FLOWS.md and COMPONENT_AND_FILE_MAP.md for edit-level impact details.
