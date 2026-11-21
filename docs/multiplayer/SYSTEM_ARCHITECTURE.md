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

Phase 10-E closed the agreed client outer-message route migration: MessageRouter has one explicit route decision for all 25 canonical MessageType values and no generic forwarding fallback to RemotePlayerActionReceiver. PLAYER_JOINED, PLAYER_LEFT and READY have typed render-thread handlers; EVENT_BATCH and SNAPSHOT retain their typed reconciliation paths; PING is transport-only; CHAT is deliberately non-routed on Android without a chat surface. Declared client-to-Worker/placeholder values are explicit non-inbound decisions. This route closure does not mean every message/action enum value is a fully implemented gameplay feature.

## Current Android connectivity boundary — Phase 14-B3 follow-on (2026-11-19)

`AndroidPlatformSupport` owns an Activity-scoped `ConnectivityManager.NetworkCallback`. API 24+ uses the default-network callback and binds validation to the exact reported default Network; API 21–23 register an INTERNET request and track qualifying networks. Every callback captures a monitor generation and verifies both that generation and callback identity before state mutation. Teardown invalidates the generation before unregistering and clearing state. State publication is synchronized with monitor lifecycle, preventing a stopped monitor from issuing a late availability notification. This source/build/JVM evidence is not an Android framework runtime test: the Emulator smoke job was removed from default CI and the manual helper remains gated/deferred.
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
- Exhaustive outer-message decisions and EVENT_BATCH/SNAPSHOT reconciliation in MessageRouter; RemotePlayerActionReceiver remains for explicit RemoteHero setup/legacy helper duties, not as a generic default for outer messages.
- Combat authority/state helpers in NativeCombatAuthorityPolicy, NativeCombatJson, NativeMobCombatDelta, and NativeHeroBuffTickPublisher.
- Item action gates/publishers in NativeItemUse and NativeItemActionPublisher.
- Player representation/helpers in RemotePlayer, MultiHeroManager, PlayerFOV, and MultiplayerRunProgress.
- Mode descriptors in GameMode, CoopMode, PvPMode, DeathmatchMode, and SurvivalMode.

MultiplayerManager is the client-side session coordinator. It is not the Worker, a durable database, or the native game engine.

### 3.3 Transport layer

All transports implement NetworkTransport and report through TransportCallback. The abstraction lets the manager start, send, stop, and query a transport without owning socket mechanics.

Current source implementations:
- InternetTransport: TCP/TLS client, explicit connect and HTTP-upgrade timeouts, HTTPS hostname verification, strict HTTP/1.1 WebSocket upgrade validation, RFC 6455 frame read/write, fragmented text assembly and control-frame handling. It delegates handshake parsing to WebSocketHandshake and frame parsing/encoding to WebSocketFrameCodec.
- WebSocketHandshake: validates HTTP/1.1 status 101, Upgrade/Connection tokens, canonical 16-byte Sec-WebSocket-Key, exact Sec-WebSocket-Accept, duplicate/malformed headers, and refuses unrequested extensions/subprotocols. It preserves non-101 HTTP status text (notably 401/403/409) so MultiplayerManager can distinguish rejected credentials from transient transport loss; validates Bearer syntax and builds the path/query without putting the session secret in the URL.
- WebSocketFrameCodec: validates server unmasked frames, canonical payload-length encodings, RSV/opcodes, control-frame rules, strict UTF-8, close codes and bounded frame/message payloads; writes all client frames with a fresh four-byte mask.
- LANTransport: local TCP server/client and UDP host discovery.
- BluetoothTransport: required-provider core facade over Classic RFCOMM; AndroidLauncher injects AndroidBluetoothProvider. BluetoothFrameCodec owns strict bounded UTF-8 newline framing. Socket success is TRANSPORT_CONNECTED, not room membership. Pairing/discovery/runtime consent and the Bluetooth peer picker are implemented in Phase16B; full connection-state/lobby UX remains Phase20/21. See PHASE16_BLUETOOTH_TRANSPORT.md.

Phase 14-A local automated evidence at HEAD `11955c577eec4ebbb09075a7f60263fa72d6d12a`: 17/17 transport tests and 158/158 full core JVM tests pass; full `test assembleDebug` succeeds. Exact-head Actions on the final source+documentation SHA remain pending. Phase 14-A is limited to the wire/transport boundary and deterministic local endpoint tests. The current codec sets a 16 MiB maximum frame/message payload; verify that this remains compatible with the largest supported native level snapshots before raising or lowering it. Localhost tests do not prove a deployed Worker smoke test, Android network lifecycle, callback-thread safety, or physical two-device behavior; manager/retry/render-thread/network-background work is reserved for Phase 14-B. Do not infer production readiness from source presence alone. The setup UI still catches some LAN/Bluetooth startup exceptions without surfacing them and immediately advances after startSession; truthful connection UX remains an open audit target.

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

Gameplay/test baseline `bc6c46b03fee040ff20311adb473b19ff78e9bb7` passed exact-code CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588): Backend (682 executions), Android JVM/Debug APK and three Workers-runtime Durable Object SQLite tests. This is not a production Worker deployment or a rendered projectile animation. Verify the live branch HEAD and its own exact-head Actions run before later changes.
### 3.6 Android platform bridge

android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/AndroidBluetoothProvider.java implements Classic RFCOMM server/client sockets. AndroidLauncher registers it with an application context; the manifest declares Bluetooth optional, legacy permissions through API30 and BLUETOOTH_CONNECT for API31+. The provider refuses missing permission/disabled/unsupported adapters and generation-fences socket callbacks. Phase16B now implements Android runtime consent, paired/nearby Classic discovery, host visibility consent and device selection; no hardware readiness is claimed until the deferred post-Phase22 tests.

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

Transport callbacks can occur away from the game/render thread. Phase 14-B2 queues inbound transport messages and disconnect/error state callbacks onto the libGDX render thread, rechecking the exact transport identity and captured session generation when the runnable executes. SESSION seed/player/token installation therefore occurs on the render thread. MessageRouter deferred native mutations (ROOM_STATE, MATCH_START, EVENT_BATCH/SNAPSHOT, PLAYER_JOINED/LEFT, READY, COMBAT_REQUEST and ACTION_ACCEPTED) use a generation-aware render helper and are discarded if endSession() or session replacement invalidates the session before execution. Game.runWithRenderThreadGuard carries the same validity predicate through a ThreadLocal; nested Game.runOnRenderThread callbacks (including snapshot/remote-sprite attachment callbacks) inherit and recheck it rather than escaping the outer guard. PING remains transport-liveness-only; CHAT and known non-inbound declarations do not mutate game state. PLAYER_JOINED creates/reuses the native remote Actor and attaches HeroSprite only when GameScene exists. PLAYER_LEFT cleanup mutates Actor scheduling, Buffs, Mob target references and sprites. Native actor, dungeon, sprite and inventory state must only be touched on the game/render thread.

Do not move parsing or validation across thread boundaries casually. Separate safe immutable payload parsing from native scene mutation, and preserve deterministic event ordering when work is queued.

## 8. Key design risks

- `server/src/index.ts` is a 35-line stable Wrangler entry and compatibility facade; `server/src/worker.ts` owns default request routing; `server/src/match-room/` contains the one shared-instance Durable Object inheritance chain; validator implementations live in focused modules. The three source-refactor stages are complete for implementation and automated acceptance.
- Phase 10 outer-message routing is closed: all 25 canonical values have explicit Android route decisions; PLAYER_JOINED/PLAYER_LEFT/READY are typed, PING is transport-only, CHAT is deliberately non-routed, and there is no catch-all forwarding to RemotePlayerActionReceiver. The receiver remains for explicit helper duties.
- Setup UI does not wait for confirmed connection and silently catches some transport startup failures.
- Mode descriptors exist, but server-enforced mode acceptance remains open.
- Transport implementations require protocol and physical-device verification.
- The backend deploy workflow triggers only from master/main server changes or manual dispatch; it does not deploy the active multiplayer branch on push.
- Current exact-head CI proves automated backend and Android JVM/debug-APK validation only. It does not prove live Worker deployment or device networking.

The Worker integration tests live in `server/src/entrypoint.test.ts`; they verify deterministic routing contracts, not live deployment or physical-device behavior. See AUTHORITATIVE_DATA_FLOWS.md and COMPONENT_AND_FILE_MAP.md for edit-level impact details.


## Historical Phase 11-A preflight: sequence/replay ownership (2026-11-14; dependency now satisfied)

This was an audit checkpoint, not a behavior change. The preflight parent `cf3714c82a210eace79614ab7c575acb04b8aebb` passed exact-head CI [43523497982](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43523497982). Phase 10 subsequently closed at implementation/test SHA `f2d79038d1e420461be7a1956471324de5c1ef74` / CI [43618725089](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43618725089). At that historical preflight timestamp, Phase 11 had not started; the observations below were test targets, not fixes.

Current authority boundaries observed:
- Worker/Durable Object owns authoritative request admission, action validation, durable request-result records, event sequence allocation, retained event rows, bounded reconnect replay and full snapshot responses.
- Android MultiplayerManager owns the client's observed sequence watermark, pending request correlation and reconnect/RESYNC requests.
- Android MessageRouter owns explicit outer-message decisions, typed EVENT_BATCH application and full SNAPSHOT routing on the game/render thread; WorldSnapshot owns validation, full world restoration and rollback. RemotePlayerActionReceiver remains for explicit native Hero setup and helper duties, not as an untyped default route.
- The server's event sequence is authoritative; a requestId is not an event sequence. The present same-player request replay lookup does not bind a duplicate ID to the attempted action/payload, and the Android sequence maximum does not prove contiguous delivery.
- Do not move server admission/replay responsibilities into Android or let Android invent missing state. Do not treat a successfully parsed message, a high watermark, or a request ID as complete replay protection.

The live gaps and safe future test targets are documented in ROADMAP.md and SESSION_RECOVERY_AND_SECURITY.md. No Worker validator, Java router, event persistence, native gameplay semantics or recovery algorithm changed in this gate review.


## Historical Phase 11-A reliability findings (2026-11-14; superseded by Phase 11-B)

The test-only Phase 11-A pass records the current responsibilities and limits:
- MatchRoom owns the persisted event sequence, processed request IDs, retained rows, reconnect replay-window decision and full snapshot generation.
- MultiplayerManager stores the observed client sequence watermark and sends reconnect/RESYNC requests; its update method remains a monotonic maximum.
- MessageRouter applies EVENT_BATCH rows on the render thread and WorldSnapshot validates/restores full world state. The current event path skips lower/equal sequences, accepts a higher sequence without checking contiguity, and updates the watermark before validating/applying the event body.

The added tests characterize this behavior, the 50-row reconnect replay threshold/fallbacks, same-player requestId collisions, and stale snapshot protection. Exact Phase 11-A code/test SHA `1aa62a881dfef122256be253e2c96fd94eddcdea` passed CI [43641719063](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43641719063): Backend 718 executions, Android JVM/Debug APK, and Durable Object SQLite 3/3. No runtime implementation is changed in Phase 11-A; corrected contiguous ordering and request binding remain Phase 11-B work.

## Phase 11-B verified architecture state (2026-11-15)

At code/test SHA `2574489ff25e6f1fedc1e21718161bc5a7a1b230`, exact-head [CI 43731016036](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036) passed all three automation jobs.

- Durable Object MatchRoom remains the authoritative owner of request identity, action validation, persistent state, processed receipts, event allocation and snapshot/replay decisions. Request fingerprints bind IDs to player and canonical action payload; delegated completion has a distinct authority identity.
- The covered ACTION lifecycle uses one transactionSync boundary across durable state/claims, request receipt, event, sequence and world-time accounting. Network success delivery is buffered until commit; rollback and fail-closed transaction availability protect atomicity.
- Android MultiplayerManager owns the applied-sequence watermark/recovery gate; MessageRouter performs contiguous EVENT_BATCH ordering/application on the render thread and only commits the watermark after successful application. Per-event rollback prevents partial native state.
- WorldSnapshot remains the authoritative full-world restore path with pre-mutation stale/incomplete validation. RESYNC continues to request a full snapshot.
- The bounded reconnect replay window remains unchanged: replay only the complete contiguous retained range up to 50 events for eligible non-current publishers; otherwise send SNAPSHOT.

Phase 11 accepted scope is closed for implementation and automated acceptance. Phase 12-A/B is CLOSED at `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8` / exact-head CI 43921670336. Phase 13 is ACTIVE/PARTIAL: lifecycle-v1 room authority and Android session state now include the in-game lobby, validated server roster, render-thread routing, reconnect/exit UX and native turn/input gate until PLAYING. Local evidence: backend 372 unique TypeScript source scenarios / 744 reported executions, real Durable Object SQLite 16/16, Android core JVM 140/140 and full Debug APK PASS. Abrupt owner WebSocket loss/member rejoin and rendered Android UI acceptance remain open; exact-head CI for the new continuation is pending push/verification. Historical run [44100890572](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44100890572) applies only to `7a75b493124f99a773b23d089a2ee8d3ded2ebd6`. No production deployment or physical-device validation is claimed.

## Phase 17-A - authoritative Co-op lifecycle

MatchRoomLifecycle.roomStatePayload() is the public projection boundary for lifecycle-v1 rooms. It derives READY from membership, current ready proofs, the current native snapshot and the connected current-term publisher. MatchRoom.webSocketClose() persists publisher handoff as SUSPENDED or RECOVERING; authorized Co-op room-member reconnects may be promoted for recovery. MatchRoomActions writes the new publisher-ready term and PLAYING state in the same durable rebase transaction, then calls the lifecycle hook to publish the committed snapshot and room state.

On Android, RoomLobbyState validates state/game-status invariants and MultiplayerManager carries SUSPENDED, RECOVERING and ENDED as explicit session states. The gameplay gate remains closed unless authoritative room state is PLAYING. Phase 17-B owns player life-state and terminal-match policy; Phase 20/21 own the full setup/lobby and responsive presentation.

## Phase 17-B: player-life and terminal-match authority

The Durable Object is authoritative for co-op life state. It derives `DEAD`/`SPECTATOR` transitions from validated native Hero HP and Ankh counts, admits only the native `REVIVE` action while an unblessed Ankh choice is pending, and rejects ordinary actions from non-ALIVE members. A coherent terminal roster produces one sequenced `MATCH_END`; the same SQLite transaction persists `gameStatus = ENDED`, marks the lifecycle ended, revokes `levelPublisher`, clears its ready term and advances the publisher term. Unknown life-state data is not treated as elimination.
