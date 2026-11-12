# Multiplayer Automated Test Matrix

> Baseline: branch HEAD eb2075b3f09ca4779773140b7e6539a6655f6824. This matrix records source test declarations and suite structure; it is not a claim that every production behavior is covered or device-verified.


## Source-refactor compatibility

Stage 1 keeps the existing backend test files and their `./index` import path. The facade must continue exporting all names originally exported by `server/src/index.ts`; the suite is an important compile-time guard against accidental export loss. New direct-module tests may be added where they improve isolation, but do not rewrite tests merely to follow internal paths.

## 1. Evidence levels and counts

| Layer | Source evidence at baseline | Meaning |
|---|---|---|
| Backend main suite | server/src/index.test.ts: 5,556 lines, 57 describe groups, 277 it/test declarations | 277 unique test declarations in the TypeScript source file |
| Backend focused pickup suite | server/src/native-pickup-side-effect.test.ts: 70 lines, 3 it declarations | Focused negative/positive side-effect policy |
| Core native integration | NativeCombatRuntimeIntegrationTest.java: 2,648 lines, 46 @Test methods | Cross-cutting native engine/runtime integration tests |
| Other multiplayer JVM tests | Five files, 19 @Test methods combined | Stable IDs, level metadata, authority and NPC/item safety |
| Arabic text handler | ArabicHandlerTest.java | Separate Arabic handler tests; not general multiplayer acceptance |

The last verified gameplay code commit b9ad0739d10d6a4125fb6ea084d6d072b2699810 had exact-SHA workflow run 41489794307. GPT.md records 560 backend executions across four files because generated JavaScript outputs mirror the TypeScript test files. Do not report 560 as 560 unique test scenarios.

The documentation-only commit eb2075b3f09ca4779773140b7e6539a6655f6824 has its own successful branch validation run 42470021358. That proves both CI jobs ran successfully at that commit; it does not add gameplay test coverage or prove deployed/device operation.

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
- npm test runs the static native-mutation/schema validation script before Vitest.

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


## Phase 9 — Poison LifeLink Mob batching and transaction coverage (2026-11-09)

- [x] Capture native Mob before/after combat state around the original Poison actor tick; keep native SPD damage/reward/loot formulas authoritative.
- [x] Buffer publisher-side `LifeLink` Mob `SYNC_MOB_STATE` messages while the native Poison capture is active, so no independent Mob commit can survive ahead of the Hero result.
- [x] Send nonlethal Poison Hero and secondary Mob results in one `SYNC_HERO_STATE` / `BUFF_TICK` ACTION.
- [x] Attach the same captured Mob batch to the lethal Hero Poison environment-death ACTION, because Hero death prevents a later `BUFF_TICK`.
- [x] Validate sequence freshness, trusted Hero pre-state, publisher-local Actor IDs, stable Mob entity IDs, Mob SQL pre-state, exact native bundles, HP/HT/position/shield/Buffs, death tombstones and dead-cell-only heap changes.
- [x] Use trusted level-snapshot Mob metadata for class, reward eligibility, EXP, maxLvl, spawningWeight and base MonkEnergy; reject level-ups and unsupported reward callbacks.
- [x] Commit Mob SQL/snapshot/loot, Hero/player HP state, reward receipts, request replay record, event and sequence within one scoped `state.storage.transactionSync` action.
- [x] Reject the batch if atomic storage is unavailable; restore SQL and the handler's sequence/world-time checkpoint on thrown writes.
- [x] Reject non-publisher LifeLink Mob deltas because Actor IDs are process-local and cannot be mapped across devices from a client assertion.
- [x] MatchRoom integration: accepted nonlethal publisher batch updates Hero+Mob together and rejects stale replay under a fresh request ID.
- [x] MatchRoom integration: lethal publisher Hero-death batch and prior lethal rollback coverage.
- [x] MatchRoom integration: reject a forged loot heap outside all dead linked Mob positions.
- [x] MatchRoom integration: reject non-publisher linked Mob writes without changing either state.
- [x] MatchRoom integration: reject a non-publisher Poison tick with a valid empty Mob delta when the Hero pre-state still contains local LifeLink Actor IDs.
- [x] MatchRoom integration: force final event insertion failure and verify Mob rows, level snapshot, Hero state, rewards, event log, sequence and world time roll back together.
- [x] WebSocket boundary: force the same final event insertion failure through `webSocketMessage()`; verify SQL/sequence rollback and an `ERROR` carrying the original request ID and current sequence.
- [x] Transaction output boundary: force a post-write `checkMatchEndCondition()` hook failure and verify SQL/in-memory rollback without leaking `ACTION_ACCEPTED`, FOV or room broadcasts.
- [x] Successful transaction delivery: verify `ACTION_ACCEPTED` is flushed before the FOV event and the original sender WebSocket—not the transactional proxy—is excluded from its own event broadcast.
- [x] Android error correlation: receiving that failed `SYNC_HERO_STATE` request response removes the pending action and requests RESYNC.
- [x] Native Java runtime: multiple linked Mob deaths in one Poison tick are included in one ACTION; final heaps are serialized as a JSON array.
- [x] MatchRoom transaction scope: every source-shaped native Hero `BUFF_TICK` uses `transactionSync`, not only Poison/LifeLink; source-specific validators remain fail-closed.
- [x] MatchRoom integration: force Healing's final event insert to fail after Hero/player HP and Buff writes, and verify SQL state, event, processed request and sequence all roll back with a correlated ERROR.
- [x] Android non-publisher regression: local Poison/LifeLink leaves Mob HP unchanged, publishes an empty secondary Mob delta for server rejection, and triggers RESYNC when the Hero tick is rejected.
- [x] Native full-snapshot JSON: disable libGDX prototype elision so `schemaVersion=1`, `branch=0`, default flags, zero-valued tile fields and explicit empty arrays survive serialization; assert required fields before `MessageRouter` application.
- [x] Native Hero Poison/Barrier: accept a Poison hit fully absorbed by Barrier with Hero HP unchanged and Barrier detached exactly at zero.
- [x] Native Hero Poison/Barrier: accept partial Barrier absorption only when the Hero's aggregate shield loss equals the Barrier row loss and its partial-decay remainder remains unchanged.
- [x] Native Hero Poison/Barrier: reject a missing Barrier with no aggregate shield loss, excess aggregate shield loss, or a forged partial-decay accumulator.
- [x] Use Java's actual Bundle key `partial_lost_shield` in both Poison-damage and Barrier-actor tests; reject the incorrect `partialLostShield` camelCase alias.
- [x] Native Hero Poison/Barrier: preserve Hunger's distinct native shield-bypass rule.
- [x] Native Hero Poison/ShieldBuff: validate native descending priorities—tier 2 (`WarriorShield`/`Blocking.BlockBuff`), tier 1 (`AscendBuff`/`DivineShield`), tier 0 (`Barrier`).
- [x] Native Hero Poison/ShieldBuff: derive incoming damage from HP/aggregate-shield conservation and require each higher tier to absorb its available amount before a lower tier can lose shield.
- [x] Native Hero Poison/ShieldBuff: reject forged Barrier consumption while priority-2 or priority-1 capacity remains; reject forged aggregate/row mismatches.
- [x] Native Hero Poison/ShieldBuff: enforce zero-shield lifecycle (WarriorShield/AscendBuff persist; BlockBuff/DivineShield/Barrier detach).
- [x] Java runtime: run the original Poison actor with all three shield-priority tiers active and verify priority-2/priority-1 absorption leaves Barrier unchanged.
- [x] Native Hero Amok expiry: only a due local-Hero `Amok` source tick may remove the row; a different Hero Buff tick cannot silently expire it as a background side effect.
- [x] Native Java Amok runtime: execute the original Hero-targeted `Amok.act()`, publish one `BUFF_TICK`, and verify Mob HP and Mob AI state are unchanged because the Hero is not an enemy Amok target.
- [x] Native Hero SnipersMark expiry: execute the original local-Hero `FlavourBuff.act()`, verify the Hero Buff and `ActionIndicator` are cleared, preserve the target Actor ID/bonus in the pre-state, and confirm Mob HP/AI are unchanged.
- [x] Backend SnipersMark expiry: accept only its own due source tick; reject early removal, changed target Actor ID, changed HP/shield/inventory, and implicit disappearance during a different Hero Buff tick.
- [ ] Validate `SnipersMark.doAction()` and SpiritArrow target/damage replication as a separate stable-identity native combat path; expiry coverage does not claim that action is synchronized.
- [ ] Exercise the same handler against the actual Cloudflare Durable Object SQLite runtime, including real transaction rollback and Worker crash/restart.
- [ ] Cover authority handoff/disconnect while a Poison capture is active, plus RemoteHero/player LifeLink if that feature is intentionally supported.
- [ ] Validate level-up XP, `Hero.updateHT()`, talent/ability and item `onHeroGainExp` callbacks as one authoritative batch; currently fail-closed.
- [x] Android JVM recovery: after a non-publisher Poison/LifeLink ERROR, feed a complete server-format `SNAPSHOT` through `MessageRouter`; verify predicted Hero HP is undone, stable Mob actor/HP remain authoritative, Poison and LifeLink Buff objects/clocks restore, and sequence advances.
- [ ] Verify the same resync response against a live Worker/Cloudflare Durable Object SQLite session; the current Android test constructs a deterministic server-shaped envelope locally.
- [ ] Expand integration coverage to more overlapping DOT/HoT/shield/detach families, reconnect/expiry boundaries and malformed/replay/resync cases.

**Exact-head CI:** `b68b66e686b98dbf343997202b215e2c828b7b89` passed [run 42777941791](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42777941791): TypeScript build + 644 Vitest executions across eight files and Android JVM tests + Debug APK compilation.

## Phase 9-C — SpiritArrow asynchronous lifecycle and authority roundtrip (2026-11-12; OPEN)

### Completed pieces, not full acceptance

- [x] Add `SPIRIT_ARROW` to `NativeAttackPayload.attackWeaponMode` and define strict `spiritArrow` metadata/conditional requirements in `protocol/schema.json`.
- [x] Add `server/scripts/validate-spirit-arrow-schema.mjs` to `npm test`; Backend CI reports `SpiritArrow native attack protocol schema: valid`.
- [x] Backend validator and MatchRoom pending-authority reservation/forwarding paths exist with separate tests.
- [x] Publisher-side MessageRouter simulation/tests exist.
- [x] Local SpiritArrow completion context/callback wiring has been attempted; runtime acceptance is not yet proven.

### Still failing / not accepted

- [ ] Diagnose `Hero.beginNativeSpiritArrowAttack()` false return versus `SpiritArrow.cast()` throw/cancel; record each guard value and preserve the original throwable/stack trace.
- [ ] Make real local `SnipersMark.doAction()` → asynchronous `SpiritArrow.cast()` → projectile completion finish/cancel exactly once.
- [ ] Prove target-disappearing cancellation and resync without stale combat.
- [ ] Cover hit/miss, target moved/removed, invalid mark/Bow/entity, duplicate callback, exception, cancellation, stale/replay and reconnect/resync.
- [ ] Add a single end-to-end test: request → pending authority → designated publisher native execution → accepted event/result → requester reconciliation.
- [ ] Keep SPEED multi-arrow volley and non-Mob marked targets fail-closed.
- [ ] Exact-head CI must pass Backend and Android JVM plus `assembleDebug`.

### Exact blocker and diagnostic requirements

- `nativeSnipersMarkSpiritArrowTargetDisappearingBeforeMissileCompletionCancelsAndResyncs`: `Pending SpiritArrow missing; resync=true, missileCreated=false`.
- `nativeSnipersMarkSpiritArrowCompletesFromTheRealMissileCallbackExactlyOnce`: `SnipersMark must retain the pending report until the missile completes; resync=true, bowSniper=false, missileCreated=false`.
- Both fail after `SnipersMark.doAction()` but before test `MissileSprite` creation; `MissileSprite.onComplete()` is not reached.
- `beginNativeSpiritArrowAttack()` guards: multiplayer active; nonempty Hero pre-state; nonempty SpiritArrow JSON; nonempty Bow bundle; positive mark Buff ID; no pending SpiritArrow; no pending generic projectile mutation; and `deferNativeCombatReport == false`.
- The separate `SpiritArrow.cast()` catch clears `sniperSpecial`, cancels the pending report and requests RESYNC. Preserve/report its original exception rather than collapsing it into the same symptom.
- `CapturingMissileGroup`/`TestMissileSprite` are headless doubles; they capture/manual-call completion but do not render real animation.

### Exact-head verification

- Repository/documentation HEAD: `a81edaeb7113d684a41719ac6385628e6c13aa11`.
- Gameplay code/test SHA: `377fa362772fb5367b548f44686e129493b1be14`; commits after it are Markdown-only.
- Exact repository-head [CI 43231618201](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43231618201): Backend passed (8 files / 652 executions and both schema validators); Android failed (88 JVM tests, 2 SpiritArrow failures at `:core:test`); `assembleDebug` not reached.
- Last green pre-9-C baseline: `0a70053addd976fc6d4330af52330d7593ee1bc4` / [CI 43198856325](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43198856325), historical only.

