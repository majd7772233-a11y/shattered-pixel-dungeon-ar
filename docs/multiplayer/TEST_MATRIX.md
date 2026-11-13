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
- npm test runs five static protocol/schema/routing contracts before Vitest: native mutation metadata, SpiritArrow, publisher handoff, Phase 10 Java/schema enum plus protocol-version parity, and Phase 10-B message/action route coverage.

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

The check intentionally does not claim that every enum value has a Worker route or a complete client handler. Handler/direction/authorization/sequence parity and the single typed event path remain outstanding Phase 10 work.

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

This is source-route coverage, not proof that every action subcase is supported or that the Android event path has been consolidated. The Phase 10-B catalog records the per-action validators/authority boundaries and every outer message direction. Android parser strictness, producer-to-action parity (including the NetworkActionBridge fallback-to-WAIT), and behavior-specific RemotePlayerActionReceiver parity remain open.

### Scope and exclusions
No change was made to action validator semantics, native SPD gameplay, message sequencing, persistence/replay policy, or resync behavior. RemotePlayerActionReceiver remains in place; its PLAYER_LEFT native Actor/Mob cleanup is required until equivalent typed-path tests prove parity.
