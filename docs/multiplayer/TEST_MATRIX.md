# Multiplayer Automated Test Matrix

> Gameplay/test baseline: bc6c46b03fee040ff20311adb473b19ff78e9bb7; exact gameplay/test CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588).
> Phase 10-A protocol contract SHA: d8938190960af64d6efc70f4625a7411bfa3b7de; exact-head CI [43485367695 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43485367695). Counts distinguish source declarations from mirrored CI executions. This is not a formal security certification or physical-device result. Always inspect the live branch HEAD and exact-head CI before future edits.


## Source-refactor compatibility

Stage 1 keeps the existing backend test files and their `./index` import path. The facade must continue exporting all names originally exported by `server/src/index.ts`; the suite is an important compile-time guard against accidental export loss. New direct-module tests may be added where they improve isolation, but do not rewrite tests merely to follow internal paths.

## 1. Evidence levels and counts

| Layer | Source evidence at baseline | Meaning |
|---|---|---|
| Backend main suite | server/src/index.test.ts: 305 source it/test declarations | Generated/mirrored JavaScript is also run in CI; execution count is not a unique-scenario count |
| Backend focused pickup suite | server/src/native-pickup-side-effect.test.ts | Focused negative/positive side-effect policy |
| Core native integration | NativeCombatRuntimeIntegrationTest.java: 60 @Test declarations | Native SPD integration including SpiritArrow reconciliation on distinct local Actor IDs |
| Other multiplayer JVM tests | Five files, 19 @Test methods combined | Stable IDs, level metadata, authority and NPC/item safety |
| Arabic text handler | ArabicHandlerTest.java | Separate Arabic handler tests; not general multiplayer acceptance |

Gameplay/test baseline `bc6c46b03fee040ff20311adb473b19ff78e9bb7`; exact code/test CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588). Backend 682 executions across eight Vitest files passed. The number includes generated/mirrored JavaScript and is not a unique-case count. Android JVM/Debug APK and three Workers-runtime SQLite tests also passed. Verify live branch HEAD and its exact-head Actions run before the next change.

## 2. Backend suite map — server/src/index.test.ts

The 57 describe groups are grouped below by their primary coverage domain. Their names are retained to make source lookup easier.

### Envelope, snapshot and entity identity
1. Server Network Message Parsing and Validation
2. Native combat HP transition validation
3. Native level snapshot contract
4. Stable native entity identity
5. Snapshot identity idempotency
6. Stable entity target resolution
7. Native combat event contract
8. Native combat buff payload validation
9. Native kill loot snapshot validation
10. Strict native combat wire fields
11. Native hero state merge safety
12. Native mob damage wire contract

### Combat authority, pre-state and revival
13. Combat request idempotency contract
14. Native combat pre-state binding
15. Native mob shield pre-state validation
16. Native hero buff pre-state validation
17. Native combat miss immutability
18. Blessed-Ankh revival validation
19. Native environmental and periodic damage validation
20. Native secondary mob combat deltas
21. Dead native mob snapshot reconciliation
22. Native mob bundle validation
23. Native mob damage owner authorization
24. Authoritative native hero pre-state
25. Native hero buff snapshot and Ankh merge
26. Native attack intent contract
27. Publisher-authoritative mob-to-player outcomes
28. Unblessed Ankh revival contract
29. Unblessed Ankh native LostBackpack loot contract

### Movement, transitions and native world mutations
30. Authoritative native movement and floor transition validation
31. Native movement mutation snapshot admission

### Inventory, equipment, loot and item economy
32. Native item DROP ownership validation
33. Native pickup inventory transaction validation
34. Native equipment, quickslot, and chest transactions
35. Native inventory economic value index
36. Native mine and non-effect action buff integrity
37. Generic native NPC interaction inventory boundary
38. Native mining inventory and floor economy reconciliation
39. Native mutation lock admission
40. Unsupported native item actions remain fail-closed
41. Native shop SELL transactions
42. Native self-buff armor ability transactions
43. Native Hero Buff tick reconciliation
44. Native alchemy transaction validation
45. Stable item-instance claim idempotency
46. Strict stable floor item and heap identities
47. Atomic stable item claims scoped by room, depth, branch, heap, and item
48. Partial stack DROP transactions
49. Native missile throw transaction validation
50. Thrown missile floor impact reconciliation
51. Native mutation action-cost binding
52. Native item consumption transaction validation
53. Native Shopkeeper buyback transactions
54. Native shop purchase transaction validation
55. Stable native pickup transactions
56. Native inventory container ownership and safe Bag pickup
57. Native run-progress persistence and exactly-once reward identity

These groups cover many individual positive and negative cases, but the suite is primarily a set of helper/validator tests. Do not describe a pure function test as a complete real Durable Object lifecycle or live two-device test unless the test actually constructs and exercises that lifecycle.

## 3. Focused backend pickup policy tests

File: server/src/native-pickup-side-effect.test.ts

The three declarations are:
1. Requires trusted talent state when a Ring can trigger native identification.
2. Rejects LostBackpack pickup because it restores several native systems at once.
3. Rejects a same-class dart merge while allowing a non-merging pickup.

This is a focused fail-closed regression suite for native pickup callbacks that can mutate unrelated systems or create implicit stack consequences.

## 4. Core JVM test files

### NativeCombatRuntimeIntegrationTest.java — 46 tests

Coverage includes:
- Hero Buff tick capture and audited flavour expiry;
- deterministic native fall landing;
- NO_HEALING preflight for healing/shielding potions;
- RemoteHero restore isolation;
- snapshot inclusion of RemoteHero actor IDs;
- publisher-only shared Actor turns;
- disconnect removal from native Actor/Mob target structures;
- native Mob AI, speed, target identity and cooldown round-trip;
- Mob pathing using original SPD rules;
- deferred publication after animation/attack callbacks;
- missing/stale Mob restore, stable identity, idempotency and rollback after resize;
- convergence between independently generated local worlds;
- malformed snapshot preflight before live mutation;
- native heap/trap/plant/timed-blob idempotent restore;
- Hero/Mob timed-effect cooldown restoration;
- run-progress/inventory restore;
- native hit/miss/zero-damage/shield-only results;
- retaliation, Ankh revival and delegated Mob kill rewards;
- Mob-to-Hero native damage;
- non-publisher optimistic-damage prevention;
- target-owner native PvP;
- secondary Mob damage procs and full bundle deltas;
- replica death without a second loot/reward pipeline;
- rejected reactive damage/resync;
- stale combat event protection;
- convergence across different local Actor IDs.

The test method names and exact current methods are in core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NativeCombatRuntimeIntegrationTest.java. Read individual setup and assertions before using one of these tests as evidence for an unrelated behavior.

### Other multiplayer JVM suites — 19 tests

| File | Test count | Coverage |
|---|---:|---|
| MultiplayerEntityIdentityTest.java | 3 | Mapping stable server entity IDs to local Actor IDs, mapping cleanup, malformed IDs |
| MultiplayerItemIdentityTest.java | 4 | Item ID bundle round-trip, split identity, heap ID, stable floor item IDs and scoped local claims |
| MultiplayerLevelMetadataTest.java | 4 | Native metadata round-trip, empty collections, duplicate-safe visuals, respawner type validation |
| NativeCombatAuthorityPolicyTest.java | 3 | Local attacker, target-owner delegated authority, invalid/inactive authority |
| NativeItemNpcInteractionPolicyTest.java | 5 | Shopkeeper path, ring knowledge side effects, potion preflight, compound pickup rejection, NPC reward/transform rejection |

Total across these six multiplayer test classes: 65 source test methods.

## 5. Mapping tests to roadmap phases

| Roadmap phase | Relevant tests |
|---|---|
| 1 — full snapshots and restore | Native level snapshot contract; stable snapshot identity; rollback/idempotency/convergence tests; MultiplayerLevelMetadataTest |
| 2 — native combat | Combat HP transition, native attack, damage, shields, Ankh, secondary Mob delta, combat runtime tests |
| 3 — Mob AI and Actor scheduler | Mob AI/scheduler/cooldown/targeting and publisher-only Actor turn tests |
| 4 — movement/floors/world interactions | movement, fall landing, transition and native world mutation snapshot tests |
| 5–8 — identity, drops, inventory and exactly-once rewards | stable identity/claims, pickup/drop/throw, inventory/economy, shop, Bag, run-progress and reward tests |
| 9 — timed Buffs and item effects | Hero Buff tick, Wand.Charger, shield actors, Mob Buff expiry, Potion/Scroll/Alchemy and native effect side-effect tests |
| 10–12 — protocol, sequencing and recovery | current parser, request replay, sequence, snapshot/resync and malformed-state suites; expanded cross-message/lifecycle acceptance remains open |
| 13–21 — lifecycle, transports, modes and UX | limited isolated validation only; do not infer end-to-end transport or mode coverage from the current pure validator suite |
| 22 — automated/deployed preflight | CI jobs cover backend build/tests and JVM tests/debug APK compile; live deployed Worker tests remain open |
| 23 — physical playtest | no CI test substitutes for the user's real multi-device playtest |

## 6. CI workflow to test mapping

File: .github/workflows/multiplayer-ci.yml

### Backend job
- Node 20;
- npm ci;
- npm run build;
- npm test;
- npm test runs six static protocol/schema/routing/payload contracts before Vitest: native mutation metadata, SpiritArrow, publisher handoff, Phase 10 Java/schema enum plus protocol-version parity, Phase 10-B message/action route coverage, and Phase 10-E action-payload/source parity.

### Android job
- Temurin Java 17;
- ./gradlew test assembleDebug --no-daemon;
- participating JVM tests and Android debug APK compilation.

The workflow now includes docs/multiplayer/** under both push and pull_request path filters. A docs-only commit therefore runs the full backend and Android jobs. It verifies the project still builds/tests at that SHA, not that the docs were semantically parsed.

## 7. Required test patterns for future changes

For every state-changing server validator or native publisher, add where relevant:
- valid exact native transition;
- forged field or unexpected extra field;
- wrong player/owner/authority;
- stale pre-state;
- invalid target/geometry/range/depth/branch;
- duplicate request/replay/collision;
- malformed/oversized JSON or native bundle;
- duplicate stable ID/position;
- missing versus explicit-empty collection;
- unrelated inventory/Buff/Actor side effect;
- snapshot restore/idempotency/rollback;
- event sequence gap/stale response;
- rejection/resync behavior.

For transport/platform code, add framing, handshake, timeout, close, reconnect, concurrent send/receive, permissions, discovery, and physical-device cases. Current CI does not prove those transports.


## MatchRoom module extraction regression gate

Existing backend tests must continue importing the root compatibility surface from `./index`; they must not be rewritten solely to follow internal module moves. Exact-HEAD CI must run the TypeScript build and full backend tests after each stage. Android JVM tests/debug APK compile remain required to prove no cross-layer contract regression, even though MatchRoom extraction should not need Java changes. Stage 2 moved handler bodies without changing the Java/client wire contract. Exact source SHA `237577f1e8c68a3f052b36fcac64cd7efc07918d` passed [CI run 42483052104](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42483052104): Backend typecheck/full tests and Android JVM/debug APK jobs both succeeded. This does not claim a real Durable Object runtime/deployment or two-device smoke test.


## Worker entry integration regression gate — Stage 3

`server/src/entrypoint.test.ts` imports the default Worker and named `MatchRoom` through the root `./index` facade. It verifies:

- the canonical `MatchRoom` class remains available from the root named export;
- `/room/{roomCode}/...` resolves the expected Durable Object ID and calls its stub;
- the exact incoming `Request` object is forwarded without replacement;
- an empty room-code segment uses `DEFAULT_ROOM`;
- non-room paths preserve the existing HTTP 200 informational response.

These are deterministic Worker-handler integration tests. They do not instantiate a Cloudflare Durable Object runtime, deploy a Worker or prove a physical two-device match. The root test suites continue to use the public `./index` compatibility path.


## Phase 9 — Native buffs, timed effects, SpiritArrow and publisher recovery (complete 2026-11-13)

### Backend and MatchRoom coverage

`server/src/index.test.ts` contains 305 source test declarations. CI also executes generated/mirrored JavaScript, so the 682 workflow executions are not 682 unique scenarios. Coverage includes:
- authoritative entity resolution, trusted native pre-state, malformed/oversized payloads, stale sequence, replay and duplicate request identity;
- native Hero/Mob Buff timing, exact expiry actor clocks and source-specific side effects;
- Poison LifeLink batching, linked Mob tombstones, reward/loot receipts, non-publisher rejection and empty-delta rejection;
- Barrier/ShieldBuff priority conservation, concurrent Healing+Barrier, Hunger/WellFed, Drowsy/MagicalSleep, Haste, Amok, Terror, Dread, SnipersMark and approved timer expiry;
- supported Wand.Charger/Recharging and approved food/potion/scroll side effects; unsupported actions remain fail-closed;
- exact non-level-up XP and MonkEnergy caps; level-up/item callbacks and advanced Monk bonuses are rejected;
- SpiritArrow publisher result, requester EVENT_BATCH, transaction rollback, stable Mob FOV lookup, stale/forged position and mark-target rejection;
- publisher rebase identity/lock gate, disconnect/handoff, stale socket close, no eligible replacement and correlated pending-combat cancellation.

### Android / native JVM coverage

`NativeCombatRuntimeIntegrationTest.java` contains 60 JUnit declarations at this source baseline. It executes native Java SPD effects and projectile callbacks. Coverage includes:
- exactly-once SpiritArrow MissileSprite completion and target-invalidation cancellation;
- RemoteHero result serialization and accepted-event reconciliation on two test clients with distinct local Mob Actor IDs;
- full Mob bundle triggers authoritative snapshot RESYNC;
- local Poison/LifeLink rejection restore, Hero/Mob HP and identity, Buff actor clocks;
- shield priority/detach, Amok/FlavourBuff expiry and bounded native damage/reward transitions.
These are headless JVM tests, not rendered projectile animation or physical-device matches.

### Real Durable Object SQLite runtime

`server/src/match-room/durable-object-sqlite.integration.do.mjs` contains three Workers-runtime integration tests:
1. real Poison LifeLink action rollback/replay across Durable Object eviction;
2. publisher authority transfer only after a persisted snapshot, including pending-combat closure;
3. transaction rollback plus reload of committed room state after eviction.
This uses real Durable Object SQLite under local Cloudflare Workers runtime, not a deployed production Worker.

### Exact-head CI

- Gameplay/test baseline SHA: `bc6c46b03fee040ff20311adb473b19ff78e9bb7`.
- Gameplay/test baseline: `bc6c46b03fee040ff20311adb473b19ff78e9bb7`; exact code/test workflow [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588).
- Backend: TypeScript build passed; 8 Vitest files; **682 executions passed** (mirrored TS/JS).
- Android: `./gradlew test assembleDebug --no-daemon`; JVM tests and Debug APK passed (`BUILD SUCCESSFUL`).
- Workers runtime: one integration file; **3/3 tests passed** against real Durable Object SQLite.

### Explicit exclusions

Fail-closed and tested, not supported multiplayer effects:
- XP transitions crossing a level-up (`Hero.updateHT()`, `onHeroGainExp` item callbacks);
- Monk Unencumbered Spirit and UnarmedAbilityTracker callbacks/bonuses beyond verified base MonkEnergy;
- RemoteHero/player LifeLink and cross-device local Buff references without same-Mob stable-ID rebind;
- unsupported scroll READ, generic Wand ZAP, unsupported consumable effects and unsupported Buff callbacks;
- SpiritArrow SPEED volleys and non-Mob targets.

Phase 9 is complete for the enabled implementation and automated acceptance under this explicit support boundary. Production deployment and physical-device playtest remain Phases 22 and 23.


## Phase 10-A — Canonical protocol enum/version parity

The server/scripts/validate-phase10-protocol-enums.mjs script is invoked by server/package.json's npm test command. It reads the Java source enums and checks exact value and order parity against protocol/schema.json:

- All 25 MessageType names must match the schema envelope enum.
- All 23 NetworkActionType values must match the schema's canonical definitions.NetworkActionType.
- The schema version and protocolVersion default must match NetworkMessage.PROTOCOL_VERSION (1.0.0).
- Every entry in the narrower NativeLevelSnapshot.nativeMutationAction allowlist must be a declared Java action.

At the Phase 10-A checkpoint, the guard intentionally did not claim that every enum value had a Worker route or a complete client handler. Handler/direction/authorization/sequence parity and the single typed event path remained outstanding then; Phase 10-E later closed the agreed client route and field-name inventory scope.

Exact implementation SHA d8938190960af64d6efc70f4625a7411bfa3b7de passed [CI 43485367695](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43485367695): Backend TypeScript build, four static protocol/schema checks and 682 Vitest executions passed; Android JVM/Debug APK and three Durable Object SQLite runtime tests also passed.

## 9. Phase 10-B — cross-layer routing and Worker admission

### Worker message admission tests
File: `server/src/protocol/message-admission.test.ts`

The suite covers:
- all eight explicit client-to-Worker message types classify as inbound;
- all 17 remaining canonical outer message names classify as known but non-inbound;
- unknown, empty and non-string message discriminators remain distinct;
- valid ACTION envelope admission preserves requestId;
- non-object envelopes, missing required fields and wrong optional field types reject;
- negative/non-integer sequence and unsupported protocol versions reject;
- known output/placeholder types return UNSUPPORTED_MESSAGE_TYPE;
- unknown types return UNKNOWN_MESSAGE_TYPE;
- malformed nested payloadJson returns MALFORMED_MESSAGE_PAYLOAD with safe request correlation.

These tests exercise the pure admission helper called by `MatchRoomMessages.webSocketMessage`; they do not construct a live Durable Object WebSocket lifecycle. Worker dispatch still authenticates using the accepted socket attachment and overwrites the client senderId.

### Static cross-layer routing guard
File: `server/scripts/validate-phase10-routing.mjs`

The script cross-checks:
- Java MessageType, schema messageType and the disjoint Worker inbound/non-inbound classifications cover the exact same 25 names;
- the eight listed inbound values exactly match the eight explicit Worker dispatch branches;
- all 23 Java NetworkActionType values have a corresponding explicit Worker ACTION branch token;
- the Worker action dispatcher still defaults to actionValid=false / INVALID_ACTION.

At the historical 10-C checkpoint, this was source-route coverage, not proof that every action subcase was supported or that the Android event path had been consolidated. Phase 10-E later completed the agreed typed-route migration and added the per-action source field inventory; Worker validators still define supported action subcases.

### Scope and exclusions
No change was made to action validator semantics, native SPD gameplay, message sequencing, persistence/replay policy, or resync behavior. RemotePlayerActionReceiver remains in place; its PLAYER_LEFT native Actor/Mob cleanup is required until equivalent typed-path tests prove parity.


### Exact-head verification for Phase 10-B

Implementation/fix SHA: `d16be138d74bb9930777f5352efbeae3291070c6`. Exact-head CI [43494769215 — all three required jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43494769215):
- Backend TypeScript build passed; **10 Vitest files / 708 executions passed**. The static log confirmed 8 Worker inbound message types, 17 known non-inbound message types and 23 explicit Worker ACTION branches.
- Android JVM tests and Debug APK compilation passed.
- Three Durable Object SQLite rollback/eviction tests passed.

The first implementation run exposed an accidental change to the existing handler-exception message contract. The implementation was corrected to preserve transaction rollback error messages; no regression assertion was weakened. The successful run above is the corrected exact SHA.


## Phase 10-C — Android envelope, producer and legacy receiver behavior

### NetworkProtocolParityTest.java — 15 JVM tests

The suite checks:
- canonical protocol 1.0.0 envelope parsing, nested JSON string payload and serializer round-trip;
- required protocolVersion/messageType/payloadJson presence and types;
- optional requestId/senderId types and sequence safe-integer/range behavior, including omitted sequence default and integral-decimal parity;
- wrong/unsupported protocol version, unknown MessageType, malformed outer/nested JSON and non-object roots;
- generic rejection of raw payload objects/arrays and JSON-null optional strings;
- the exact LAN six-field legacy envelope and Bluetooth two-field unversioned legacy envelope only through transport-specific parsers, including extra-field rejection;
- all ten mapped HeroAction values plus null/unmapped action rejection with Optional.empty();
- canonical Bluetooth serialization and strict LAN action discriminator parsing.

### NativeCombatRuntimeIntegrationTest.java — receiver regressions

At the Phase 10-C audited source HEAD this class contained 62 @Test methods. Phase 10-C added targeted behavior checks for:
1. PLAYER_LEFT: RemotePlayer registry removal, RemoteHero Actor scheduler removal and Mob target-reference cleanup. Explicit multi-Buff detach, sprite-parent/reference removal, malformed-payload senderId fallback and local-player no-op assertions were added in the Phase 10-D pre-migration baseline.
2. Historical legacy remote-player updates: before 10-E, the default route updated supported RemoteHero position/HP and retained its Actor registration.
3. EVENT_BATCH single path: MessageRouter applies Mob state once, duplicate sequence does not reapply it, and direct legacy receiver delivery refuses a second application and requests the existing recovery path.

### Exact-HEAD acceptance

Code/test SHA 2d9a36d6c90ae95a91e6d08dca7a5bc4861c7fa5 passed [CI 43512831773](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43512831773): Backend TypeScript build and 10 Vitest files / 708 executions passed; Android JVM tests and Debug APK compilation passed; all three Durable Object SQLite integration tests passed.

### Scope and exclusions

No MessageRouter/RemotePlayerActionReceiver relocation or deletion occurred. No Worker action route/validator, replay/resync algorithm, event ordering, or native SPD gameplay formula changed. A green CI run does not prove production deployment or physical-device play.

## Historical Phase 10-D — typed PLAYER_LEFT equivalence

### Pre-migration behavior baseline

The PLAYER_LEFT cleanup test was expanded while the old MessageRouter default/RemotePlayerActionReceiver path was still active. It covered:
- RemotePlayer registry removal plus both player-to-Hero and Hero-to-player lookup cleanup;
- RemoteHero Actor scheduler removal;
- all active Mob target references cleared while preserving the last-known target cell required by SPD's native lost-target behavior;
- multiple Buffs detached and removed from Actor scheduling;
- sprite removed from its parent group and the RemoteHero sprite reference set to null;
- malformed payload fallback to the Worker-authored senderId;
- ignoring PLAYER_LEFT for the local player.

Pre-migration test-only SHA `6e5ea7c88ba0238d46c3d728ca0fb4437d3f3630` passed [CI 43521307026](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43521307026), all three jobs green, before any route migration.

### Typed-path result and anti-double-application

- The same full cleanup test now passes via the explicit `MessageRouter` PLAYER_LEFT case, which dispatches on the render thread.
- A direct call to `RemotePlayerActionReceiver` with PLAYER_LEFT is refused and requests exactly one existing resync; it does not reapply cleanup.
- EVENT_BATCH remains typed; duplicate event sequence still does not apply Mob state twice, and its legacy receiver guard continues to request recovery rather than parse/apply again.
- At the historical 10-D checkpoint, PLAYER_JOINED remained an actual Worker output handled by the legacy default route; Phase 10-E later migrated it to an identity-checked typed route.

At the historical 10-D source/test SHA, NativeCombatRuntimeIntegrationTest had 64 @Test methods. At the Phase 10-E closeout SHA it has 67; NetworkProtocolParityTest remains at 15.

### Exact implementation/test CI

Final implementation/test SHA `cc61c68625f587576ca530aef3354bfaffe9e140` passed [CI 43522055301](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43522055301):
- Backend typecheck/build: 10 test files and 708 executions passed;
- Android JVM tests and `./gradlew test assembleDebug --no-daemon`: `BUILD SUCCESSFUL`;
- Durable Object SQLite: 3/3 integration tests passed.

The first typed-path attempt exposed a missing retained TestTransport local in the new test fixture. That compile-only defect was corrected in the final SHA; no behavior assertion was weakened or removed.

### Scope and phase boundary

That sentence described the bounded Phase 10-D state. Phase 10-E subsequently added typed PLAYER_JOINED/READY handling, an exhaustive 25-value client route switch and source-backed per-action payload inventory. At that Phase 10-D checkpoint, Phase 11 had not started; the subsequent Phase 11-A/11-B work is recorded below.


## Historical Phase 11-A — event ordering and replay characterization (test-only; superseded by Phase 11-B)

Starting audited HEAD `3a1924c7e482757543b2500dda86b1d3e94960af`; final code/test SHA `1aa62a881dfef122256be253e2c96fd94eddcdea` passed exact-head CI [43641719063](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43641719063): Backend 10 Vitest files / 718 executions, Android JVM + Debug APK, and Durable Object SQLite 3/3.

### Worker MatchRoom coverage

Five additional scenarios were added to `server/src/match-room/lifelink-death.integration.test.ts`:
1. Reconnect at a 50-sequence gap replays exactly 50 retained rows in ascending order.
2. A 51-sequence gap uses full SNAPSHOT fallback.
3. A replay-sized gap with missing retained rows uses full SNAPSHOT fallback.
4. RESYNC returns one full SNAPSHOT; bundled event history does not turn it into EVENT_BATCH replay.
5. Reusing one requestId from the same player with a different action/payload currently returns the stored ACTION_ACCEPTED result. This documents a replay-binding gap, not accepted final behavior.

The in-memory MatchRoom SQL adapter gained only the exact query responses needed by these tests. They exercise MatchRoom handlers with a deterministic adapter, not a production Durable Object deployment. The separate real local Durable Object SQLite CI remains the transactional/eviction gate.

### Android JVM coverage

Three additional tests were added to `NativeCombatRuntimeIntegrationTest.java` (67 → 70 methods):
- Sequence 2 followed by sequence 1 from a zero watermark advances to 2 and does not request gap RESYNC under current behavior.
- A malformed event with a new sequence advances the watermark before requesting RESYNC; the malformed event itself does not mutate native Hero state.
- A structurally valid full snapshot older than the applied sequence is rejected without changing live Hero state, level dimensions or applied watermark.

Existing stale/duplicate combat-event suppression, snapshot validation-before-mutation, idempotency and rollback tests remain intact. `NetworkProtocolParityTest.java` remains at 15 methods.

### Known limitations retained for Phase 11-B

This slice is intentionally characterization-only and is verified at exact-head CI `43641719063`. It does not fix non-contiguous EVENT_BATCH acceptance, watermark advancement before validation/application, same-player requestId reuse with a changed action/payload, or the current bounded reconnect replay policy. The parent Phase 11 remains OPEN. Passing these tests is not event-reliability acceptance.

## 9. Phase 10-E exact-head closure evidence

Implementation/test SHA: f2d79038d1e420461be7a1956471324de5c1ef74. Exact-head [CI 43618725089](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43618725089) passed all three jobs.

- Backend: TypeScript build passed, all six static guards ran, and 10 Vitest files / 708 executions passed. The routing guard reported 25 explicit Android message decisions, eight Worker inbound routes, 17 known non-inbound types and 23 Worker action branches. The payload guard reported 23 action envelopes, 361 per-action Worker field names (346 source-referenced in the listed Java producer files, 15 Worker-only; static name presence does not prove runtime serialization on each branch) and 18 required native snapshot fields. The 708 executions include mirrored/generated TS/JS files and are not 708 unique scenarios.
- Android: JVM tests and Debug APK compile passed (BUILD SUCCESSFUL). NetworkProtocolParityTest has 15 @Test methods; NativeCombatRuntimeIntegrationTest has 67.
- Durable Object Workers runtime: 3 SQLite rollback/eviction integration tests passed.

New Android behavior regressions cover PLAYER_JOINED, duplicate joins, sender/payload identity mismatch, READY true/false, PING/CHAT/non-inbound no-phantom-player handling and readiness restore after SNAPSHOT. Existing PLAYER_LEFT cleanup and EVENT_BATCH single-application tests remain enabled.

At this historical Phase 10-E closeout checkpoint, these tests validated source and local/CI runtimes only; they did not prove production Worker deployment, live production WebSocket operation or a physical two-device session. WAIT and USE_ABILITY remained non-emitted Android action declarations; CHAT remained non-routed without a client chat surface. Phase 10 was closed at that checkpoint; Phase 11 had not yet started. The later Phase 11-A/11-B evidence is recorded above.

## Phase 11-B — event ordering, replay identity and atomicity (2026-11-15)

**Exact source/test SHA:** `2574489ff25e6f1fedc1e21718161bc5a7a1b230`; [CI 43731016036](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036) passed all three jobs.

### Android JVM regressions
At the Phase 11-B baseline, NativeCombatRuntimeIntegrationTest.java had 74 @Test methods (the Phase 11-A snapshot recorded 70). Current Phase 12-A source count is 78; NetworkProtocolParityTest has 20 tests and MultiplayerReconnectLifecycleTest has 3.
- staleEventCannotRollBackNewerNativeMobPosition: a stale event cannot move a Mob backward.
- eventBatchSortsOutOfOrderRowsBeforeContiguousApplication: out-of-order rows are sorted before ordered application.
- eventArrivingAheadOfMissingSequenceRequestsSnapshotWithoutAdvancingWatermark: a sequence gap requests RESYNC without watermark advance.
- opaqueSkippedEventConsumesSequenceWithoutChangingWorld: an intentionally skipped event consumes only its sequence.
- malformedNewEventDoesNotAdvanceAppliedSequenceBeforeRequestingResync: malformed state is rejected without committing sequence or changing the Hero.
- staleFullSnapshotIsRejectedWithoutChangingLiveWorldOrAppliedSequence and incompleteFullSnapshotIsRejectedWithoutChangingLiveWorldOrSequence: invalid/stale full-state recovery preserves live state.
- actionAcceptedAndEventBatchDuplicateSequenceApplyOnlyOnce: overlapping acceptance/event delivery cannot apply one sequence twice.

NetworkProtocolParityTest.java remains at 15 tests.

### Worker and Durable Object regressions
The MatchRoom suite verifies changed same-player request payload/action and cross-player requestId reuse conflict; exact retry replay with canonical key-order equivalence; idempotent processed-action fingerprint migration preserving legacy receipts; separate delegated authority completion identity; concurrent exact retry committing one event/sequence/world-time charge; and atomic rollback with no success broadcast on failure. Existing reconnect 50/51/incomplete-retention and RESYNC full-SNAPSHOT behavior remain regression constraints.

### Phase 12-A — session identity and reconnect credential regression gate (2026-11-16)

- Reject sessionToken in the WebSocket URL and malformed/non-Bearer Authorization credentials.
- Reject unknown credentials and playerId assertions that do not match the token owner; an unauthenticated new session cannot claim an existing player ID.
- Preserve player state/position during an authenticated reconnect; rotate the token only after the replacement WebSocket has been accepted and its attachment serialized.
- Reject a previous token on a later upgrade and reject messages arriving on a superseded socket with SESSION_REPLACED.
- Confirm unexpected Internet disconnect/error starts an authenticated reconnect; stale callbacks from a superseded transport cannot trigger duplicate reconnects or deliver late messages.
- Confirm resumed SESSION preserves player identity, requires a replacement token, and does not advance the applied event watermark before event/snapshot recovery.
- Confirm permanent 401/403/409 resume rejection and SESSION_REPLACED clear the stale client session; failed handshakes release their sockets.
- Confirm a reconnect already in flight suppresses another attempt; malformed replacement credentials fail closed.

### Historical Phase 12-A-only local verification before Phase 12-B (2026-11-16)
- TypeScript noEmit: PASS.
- Backend source-only Vitest: 5 files / 372 tests PASS.
- Cloudflare Workers Durable Object SQLite runtime: 1 file / 5 tests PASS.
- Android core JVM: 132 tests PASS, 0 failures/errors/skips; Debug APK assembleDebug PASS.
- Protocol schema guards: 25 messages / 23 actions unchanged.
- At the initial Phase 12-A checkpoint, exact-head CI was still pending; the subsequent exact-head Phase 12-A/B run is recorded below. No deployment or physical-device acceptance is implied.

### Exact-head CI — historical Phase 11-B baseline
Historical Phase 11-B baseline evidence: Backend TypeScript build + 10 Vitest files / 740 reported executions passed; Android JVM tests + Debug APK passed; Durable Object SQLite integration passed 4/4. The 740 reported executions include mirrored/generated TS/JS outputs, not 740 unique source scenarios. This evidence applies only to the Phase 11-B baseline SHA and predates the then-uncommitted Phase 12-A/12-B changes.

## Phase 12-B — Durable Object eviction, replay retention and snapshot recovery (2026-11-16)

### Real Workers Durable Object SQLite integration

The real-runtime file `server/src/match-room/durable-object-sqlite.integration.do.mjs` now contains 14 tests total (five pre-existing tests plus nine Phase 12 regressions). The nine new regression scenarios verify:

1. Room cursor/status/worldTime survive `evictDurableObject` and constructor rehydration; retained history contains the latest 200 ordinary events plus protected LifeLink/last-damage proof rows.
2. A client at sequence 980 receives the exact contiguous 981–1000 EVENT_BATCH after eviction; a cursor at 0 falls back to SNAPSHOT and restores player position/HP/Hero JSON, depth, game mode, world time and the 1024-tile level.
3. A room with player/item/reward claim state but no current-level row rejects reconstruction with `ROOM_RECOVERY_INCOMPLETE`.
4. Legacy rooms without `gameStatus` derive `ENDED` from MATCH_END; a complete current-depth native snapshot derives `PLAYING`, while absent/incomplete run evidence remains `LOBBY`.
5. Orphaned level-table rows with missing gameMode/seed/depth fail closed before constructor defaults are inserted (`ROOM_RECOVERY_MISSING_GAME_MODE`).
6. A lone non-default `room_meta` state key (`worldTime`) prevents replacement level generation even when player/event/level tables are empty, while default `currentSequence=0` and `gameStatus=LOBBY` do not falsely mark a new room as corrupt.
7. A forced late `mobs` insert failure during `LEVEL_DATA` rolls back level metadata, all tiles, mobs, snapshot and in-memory cursor; no ACK is sent. Retrying after removing the trigger commits the complete replacement.
8. Legacy databases upgrade transactionally through schema versions 1 and 2, adding processed-action fingerprint columns and branch-aware claim keys while preserving both old item claims and a pre-existing processed-action receipt.
9. A disconnected publisher with no valid native snapshot is revoked and its term advances; no replacement is elected and no fabricated SNAPSHOT is broadcast.

### Initial local verification checkpoint before commit/push — Phase 12-A / Phase 12-B worktree

- TypeScript `npx tsc --noEmit --pretty false`: PASS.
- Backend `npm test`: 5 files / 372 tests PASS; static guards still confirm 25 outer message types and 23 actions.
- Workers runtime `npx vitest run --config vitest.durable-objects.config.mjs src/match-room/durable-object-sqlite.integration.do.mjs`: 1 file / 14 tests PASS against real SQLite and Durable Object eviction, migration, transactional LEVEL_DATA replacement and publisher-loss recovery.
- Android `.\gradlew.bat test assembleDebug --no-daemon --console=plain --rerun-tasks`: BUILD SUCCESSFUL; 10 core JVM XML reports / 132 tests / 0 failures / 0 errors / 0 skipped; Debug APK generated.
- At this initial checkpoint, exact-head CI had not yet run for the uncommitted Phase 12-A/12-B worktree; the subsequent verified Actions run is recorded below. No production Worker deploy, live production WebSocket test or physical two-device acceptance is implied.

The compaction count is not a strict global 200-row cap: latest replay rows plus protected per-sender validation evidence are retained. Schema versioning, complete `LEVEL_DATA` atomicity and token-fenced publisher handoff are implemented and tested; exact-head CI 43921670336 passed all three jobs. The requested final review found no remaining Phase 12 implementation or automated-acceptance item. Phase 12 is CLOSED; production deployment/device gates remain Phases 22/23.

## Phase 12 exact-head GitHub Actions confirmation - 2026-11-16

Commit `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8` passed exact-head workflow [43921670336](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43921670336): Backend typecheck/tests PASS; Android Java tests/debug APK compile PASS; actual Durable Object SQLite rollback/eviction PASS. All three jobs concluded `success`. Local final tree also passed TypeScript noEmit, backend 372 unique source scenarios / 744 mirrored executions, Durable Object SQLite 14/14, Android core JVM 132/132 (zero failures/errors/skips) and Debug APK build. The requested final source review is complete; Phase 12 is CLOSED for implementation and automated acceptance. No production Worker or physical two-device test is claimed.


## Phase 13 - Room, lobby and session lifecycle (2026-11-17, CLOSED: implementation + automated acceptance)

### Automated coverage

- Backend: `npm run build` and `npm test` PASS; 10 Vitest files / 744 reported executions, representing 372 unique TypeScript source scenarios (generated JavaScript mirrors are not separate unique scenarios).
- Real Workers Durable Object SQLite: 1 file / 17 tests PASS. Coverage includes concurrent JOIN_ROOM/MATCH_START, readiness reset/cancel, synchronized start, authoritative broadcasts, late-join/post-start-cancel refusal, and abrupt owner WebSocket loss with atomic owner/publisher transfer, publisher-term advance, reset of every READY flag and durable roomReady proof, and ROOM_STATE broadcast.
- Debug APK: 35,202,307 bytes; SHA-256 `C2E40AA02A5161082EE2A196312F7B24AABDB82857019EFA1F20F50277C3C05B`.
- MultiplayerReconnectLifecycleTest contains 12 test methods. The new former-owner reconnect case checks authenticated resume, bearer-token rotation, retained player identity after owner transfer, server-authoritative owner ID and complete roster replacement including an offline member.

### Implementation under test

- `WndMultiplayerLobby` appears from GameScene after native-level publication and displays room/member/ready counts, host/local identity and per-member class/readiness/connectivity.
- `RoomLobbyState` is the single validated server roster source. Its revision refreshes the modal after roster, local snapshot, pending operation, ACK/ERROR and timeout changes.
- Owner Start requires a synchronized native snapshot, local/server readiness and LOBBY status; the server repeats all checks transactionally. The cancel operation is presented as readiness reset because the server clears every member proof.
- MessageRouter applies ROOM_STATE and MATCH_START on the render thread. GameScene blocks native actor-turn processing and cell selection before authoritative PLAYING.
- Reconnecting disables room operations; retry exhaustion clears pending requests and exposes explicit local exit. Internet lifecycle gating remains fail-closed until `endSession()`.

### Not yet proven

- Android instrumentation/manual emulator UI acceptance has not been run. By user direction the visible lobby flow is deferred to Phase 20 and RTL/touch/layout review to Phase 21; no emulator session was used for this continuation.
- Abrupt owner WebSocket loss, atomic owner/publisher transfer, readiness-proof reset, former-owner reconnect and fresh connected/offline roster restoration are now covered by real Durable Object SQLite and Android JVM regressions.
- Exact-head GitHub Actions run 1272 [https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44149425355] completed SUCCESS on fbf46ef15a1ec4554710a43894cfa4969c3176a7: Backend typecheck/tests, Android JVM tests + Debug APK compile, and Durable Object SQLite rollback/eviction all passed.
- Current checkpoint: backend 10 Vitest files / 744 reported executions (372 unique TypeScript source scenarios plus generated JavaScript mirrors); Durable Object SQLite 17/17; Android core JVM 10 XML files / 141 tests / zero failures, errors or skips; forced full test assembleDebug PASS. Exact-head Actions run 1272 is green for the implementation SHA. Phase 13 is CLOSED for implementation and automated acceptance. Emulator UI/touch/layout acceptance is deferred to Phases 20-21; no production Worker deployment or physical two-device match is claimed.
