# Multiplayer Completion Roadmap

> Canonical execution plan for completing the multiplayer implementation. Written in English so future conversations can continue without reconstructing context.
>
> Repository: majd7772233-a11y/shattered-pixel-dungeon-ar  
> Working branch: multiplayer-framework-core-14118577486727081892  
> Phase 1 implementation commits: `1a5d4c537ee3c2e8b6da88c126310e1499ff42c4`, `39f7441b39874988b3b4293defc48f65ec4745cf`, `81ed967088aedbfc1bcc65773a8cb5dd0774c087`, `88ed103aaa31ed0723e145f0cb843f549e861c75`, `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`  
> Latest validated snapshot-consistency code SHA: `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`  
> CI for that exact code SHA: [run 39655327420 — success](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) (backend TypeScript build/tests and Android JVM tests/debug APK both passed).

## Product Goal and Definition of Done

Deliver genuine multiplayer Shattered Pixel Dungeon gameplay on two or more Android devices. Players must enter the same real match and share a coherent native SPD run through actions, Mob turns, combat, inventory and loot, timed effects, death/revival, floor transitions, disconnects, reconnects and authority changes.

The original Java/libGDX SPD engine remains the gameplay reference: level generation, hit/damage calculations, native Mob AI, actor scheduling, buffs, item effects and progression must not be replaced with simplified TypeScript approximations. The Worker/Durable Object coordinates sessions, validates transitions, persists state and sequences/distributes events. A designated native authority resolves gameplay the Worker cannot execute.

“Done” means the full acceptance gate has passed for every phase, exact-code CI is green, and final real-device/deployment tests have been recorded. Compilation or a successful room connection alone is not project completion.

## Current Roadmap Structure — Dependency-Based Plan (2026-10-26)

The old ten-phase plan contained 88 primary work items, several of which spanned unrelated systems and could leave a long phase unfinished when a session ended. The current plan has **23 phases**: the first four remain complete, implementation work is separated by coherent cross-layer boundaries, automated and deployment checks are phase 22, and the user's physical-device playtest is deliberately **the final phase, 23**. The number is based on scope/dependencies, not a target quota.

| Phase | Scope | State |
|---:|---|---|
| 1 | Lossless native world snapshot and restoration | Complete |
| 2 | Native combat replication | Complete |
| 3 | Native Mob AI and Actor scheduler | Complete |
| 4 | Movement, floors and world interactions | Complete |
| 5 | Stable item identity and pickup claims | Complete for implementation and automated acceptance |
| 6 | Drops, partial stacks and floor heaps | Complete for implementation and automated acceptance |
| 7 | Inventory actions and item economy | Complete for implementation and automated acceptance |
| 8 | Inventory persistence, restoration and exactly-once rewards | Complete for implementation and automated acceptance |
| 9 | Native buffs and timed effects | In progress — partial implementation; acceptance open |
| 10 | Canonical protocol schema and one typed event path | Open |
| 11 | Event ordering, replay protection and resynchronization | Open |
| 12 | Durable recovery, reconnect and authority handoff | Open |
| 13 | Common room/session lifecycle and readiness | Open |
| 14 | Internet/WebSocket transport | Open |
| 15 | LAN transport | Open |
| 16 | Bluetooth transport or truthful unavailability | Open |
| 17 | Co-op rules and shared match lifecycle | Open |
| 18 | PvP and Deathmatch enforcement | Open |
| 19 | Survival mode enforcement | Open |
| 20 | Truthful host/join/setup UX | Open |
| 21 | Localization, RTL/layout, navigation and cleanup | Open |
| 22 | Automated cross-layer verification and deployed-service preflight | Open |
| 23 | Final physical-device playtest led by the user | Open; last by design |

**Dependency chain:** phases 5–9 finish item/effect gameplay; phases 10–12 consolidate event correctness and durable recovery; phase 13 establishes transport-independent session states before phases 14–16 wire transports; phases 17–19 enforce modes on that stable foundation; phases 20–21 make the completed capability honestly usable; phase 22 runs automated and service-level checks; phase 23 is the user's actual gameplay test. A test or fix found in Phase 23 is recorded as a new Phase 24+ (or grouped, dependency-aware follow-up phases), not silently folded into the old plan.

**Testing policy:** automated unit/JVM/contract/integration tests stay inside the implementation phases that need them. Phase 22 contains the broad automated two-client scenarios, exact-commit CI and deployed Worker/service smoke checks. No physical-device testing is scheduled in phases 1–22. Phase 23 is user-led, and nobody should claim it passed until the user reports the actual outcomes. If a supported transport cannot be verified, mark it unsupported in the UI rather than pretending it works.

## Atomic-Phase Rule — No Partial Phases

A numbered phase is **one indivisible milestone**, not a collection of separately completable parts. Its full scope, dependencies, implementation, schema, tests, cross-file integration and completion criteria must be finished before the phase is marked complete. Phase scope is intentionally bounded to reduce unfinished work if a session ends; when interruption occurs, save a precise continuation checkpoint and resume the same phase rather than pretending it is complete.

- Never mark a phase complete with an unchecked requirement, known dependent defect, missing test or unverified integration path.
- Never push a missing requirement into the next phase merely to close the current one.
- A new class, schema field or test alone is not completion. Trace the whole path: native action → protocol → server validation/persistence → sequenced event → client reconciliation → reconnect/snapshot.
- Fix all failures revealed by CI and rerun against the exact final code SHA before reporting.
- Do not claim physical-device testing unless it really happened. CI cannot run a physical two-device session.
- Work on the named branch. Never merge into main unless explicitly instructed.
- Update ROADMAP.md and GPT.md whenever implementation, phase status, architecture, risks or verification changes.


### Conversation slicing rule

A parent phase is still indivisible for acceptance/status, but work is delivered through bounded conversation subphases (for example 9-C). Each conversation owns one coherent slice with explicit scope, files, acceptance criteria and tests. A passed slice is recorded as passed; it does not make the parent phase Complete. The next slice starts only in a new conversation after the user sends the handoff prompt. See PROJECT_EXECUTION_PROTOCOL_AR.md. This execution method does not renumber or replace the 23 phases.


## Documentation Governance — Continuous and Outside the Gameplay Phase Plan

The multiplayer documentation set lives under docs/multiplayer/. It is not a new product subsystem and must not add, renumber, compress, or silently move any of the 23 gameplay phases.

**Permanent rule: documentation is live and edit-level.** Every source, test, protocol, resource, build, workflow, or documentation edit—including a one-character correction, import, string, condition, fixture, rename, or deletion—must update every affected documentation reference in the same logical work unit. Keep GPT.md and ROADMAP.md synchronized whenever continuation state, phase scope/status, acceptance evidence, architecture, risk, dependency, or next action changes. Update the relevant deep-dive document at the same time; do not wait for phase completion.

- GPT.md is the continuation checkpoint, user rules, verified findings, decisions, risks, exact tested SHA/CI evidence, and next action.
- ROADMAP.md remains the sole authority for phase scope, dependencies, work-item checklists, acceptance criteria, and phase status.
- docs/multiplayer/ explains product architecture, responsibilities, relationships, data flows, tests, and file impacts. It is a maintained reference, not executable truth.
- The exact source tree at active HEAD is implementation truth. If a doc disagrees with code, verify behavior and correct the doc; never edit code by blindly trusting stale descriptions.
- Read the index and relevant deep reference first, then reopen the actual target source, callers, and tests before editing.
- Record every edit, even tiny changes, in the same change/session log. For multi-file edits, identify each path and its reason. Keep docs and implementation together in commits wherever possible.
- After renames/deletions, repair inbound links and file-map entries before calling the task complete.
- The temporary documentation/source-refactor tracker has been retired. Permanent architecture, preservation requirements and final status are maintained in `docs/multiplayer/README.md`, `docs/multiplayer/SOURCE_FILE_REFERENCE.md`, this roadmap and `GPT.md`. Source-refactor stages are separate from gameplay phases.

The historical documentation batches established the technical references now indexed in `docs/multiplayer/README.md`. They are complete and are not a current implementation track.

## Current Verified Status

### Active project checkpoint — 2026-11-12 (9-C authority-result blocked)

- Repo/branch: `majd7772233-a11y/shattered-pixel-dungeon-ar` / `multiplayer-framework-core-14118577486727081892`.
- Current gameplay/test HEAD: `7fe9b0164408cfde36b89a57551536bf6bbcd67c`; parent `59243da863f46151981ff2dae1e4c3559e122e53`.
- Exact CI [43242489324 — failure](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43242489324): Backend 652 passed / 2 failed (8 files; 654 executions), Android JVM + assembleDebug pass.
- ATTACK forwarding to COMBAT_REQUEST succeeds; synthetic publisher SYNC_MOB_STATE result returns INVALID_ACTION, not ACTION_ACCEPTED.
- First visible missing field: authorityResult fixture omits attackerPos, required by strict combat validation and matched to trusted player position. Verify all gates and native serializer.
- Last green local-lifecycle baseline: `6f912afb5d169370b44dae17a46cf2f10716ff51` / [CI 43240391766](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43240391766), historical only.
- Phases 1–8 complete; Phase 9 open; Phases 10–23 open. Only active slice 9-C.

### Active continuation checkpoint — 2026-11-09 (Poison LifeLink batch atomicity verified; Phase 9 remains OPEN)

- **Repository/branch:** `majd7772233-a11y/shattered-pixel-dungeon-ar` / `multiplayer-framework-core-14118577486727081892`. No new branch and no merge to `main`.
- **Exact tested code/test HEAD:** `b68b66e686b98dbf343997202b215e2c828b7b89`; exact-head GitHub Actions [run 42777941791 — success](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42777941791). Backend TypeScript build and 644 Vitest executions across eight files passed; Android JVM tests and Debug APK compilation passed. Mirrored TS/JS suites mean executions are not unique scenario counts.
- **Publisher-side Poison capture:** LifeLink Mob callbacks during a native Poison actor tick are buffered by `MultiplayerManager` instead of being emitted as separate `SYNC_MOB_STATE` writes. `NativeMobCombatDelta` carries complete publisher-local before/after Mob deltas, stable entity IDs, bundles, Buff/shield values and a JSON-array loot snapshot.
- **Single-request outcomes:** nonlethal Poison submits one `SYNC_HERO_STATE` / `BUFF_TICK` action with Hero and linked Mob results. If the same Poison callback kills the local Hero, the Hero environment-death action is enriched with the same pre-state/baseline/Mob batch because no later Buff tick will occur.
- **Scoped SQL transaction:** `MatchRoom.handleAction` wraps exactly these publisher Poison LifeLink batch shapes in `state.storage.transactionSync`. Mob rows/deletions, level snapshot/heaps, Hero/player HP and state, reward claims, event, deduplication record, sequence and world time are committed together. If storage cannot provide `transactionSync`, the batch is rejected; a thrown error rolls SQL back and restores the in-memory sequence/world-time checkpoint. Other action families retain their existing transaction behavior.
- **Validation/authority:** trusted Hero LifeLink Actor IDs are resolved through the complete authoritative level snapshot to stable Mob entities. Mob SQL pre-state, native bundles, HP/HT/position/shields/Buffs, dead-Mob tombstones, exact allowed loot cells and trusted reward inputs are checked before commit. Non-publishers cannot author LifeLink Mob deltas from process-local Actor IDs.
- **Non-publisher fail-closed regression:** an empty Mob-delta Poison tick is still rejected when the trusted Hero carries LifeLink references; the server returns `BUFF_TICK_MOB_AUTHORITY_REQUIRED` and leaves Hero, Mob, reward and sequence state unchanged. This closes the gap where the Mob delta was empty but the sender's process-local Actor IDs still could not authorize a shared effect.
- **Android rejection/recovery regression:** a non-publisher Poison tick does not change local Mob HP; its predicted Hero split-damage action is rejected, and a matching ERROR for `SYNC_HERO_STATE` triggers RESYNC. The JVM test now passes a server-format full `SNAPSHOT` through `MessageRouter` and verifies Hero HP, stable Mob identity/HP, Poison/LifeLink Buff instances and exact actor clocks restore. The envelope is assembled in the test from native level export and saved pre-tick Hero state, not fetched from a live Worker. Remote/non-publisher LifeLink execution remains unsupported.
- **Integration regressions:** actual MatchRoom handler tests cover nonlethal publisher tick + Mob damage, replay via a fresh request ID, lethal Hero death, rollback on final event insertion failure, forged unrelated heap positions, non-publisher rejection with both changed and empty Mob deltas. They use a deterministic in-memory SQL adapter, not the actual Cloudflare Durable Object SQLite runtime.
- **Wire/diagnostic fixes:** the native Mob delta emits `heaps` as an array; JSON object-end parsing handles escaped strings/nested braces; native Buff failures return specific validation error codes.
- **Atomic failure response:** the WebSocket wrapper now returns the failed request's `requestId` and current room `sequence` when the scoped SQLite transaction throws and rolls back. The caller can therefore clear its pending Hero request and request RESYNC rather than waiting indefinitely. A handler-level WebSocket regression forces the final event insert to fail and verifies both rollback and the correlated `ERROR`.
- **Post-commit network delivery:** the scoped batch temporarily queues `ACTION_ACCEPTED`, `broadcastWithFOV` and room broadcasts, then flushes them only after SQL commit. A forced post-write hook exception rolls back without leaking a success ACK or event; a success test checks accepted-before-FOV delivery and confirms the original sender socket remains excluded despite the transactional WebSocket proxy.
- **Poison shield-priority validation:** the server now mirrors native descending shield priorities: tier 2 (`WarriorShield`/`BlockBuff`), tier 1 (`AscendBuff`/`DivineShield`), tier 0 (`Barrier`). It derives the incoming hit from Hero HP/aggregate-shield conservation and proves each tier is consumed before any lower tier. Per-class detach-at-zero behavior is enforced. Backend tests include valid full-tier consumption and forged attempts to bypass priority 2 and priority 1; Java executes the native pipeline with all three tiers active.
- **All native Hero Buff ticks now commit atomically:** every `SYNC_HERO_STATE` `BUFF_TICK` with the expected native envelope enters `transactionSync`, so Hero state, player HP, processed request, event, sequence and outbound messages cannot split on a late SQL error. Validation remains source-specific; the wrapper does not broaden accepted effect classes. A Healing rollback regression proves the HP/Buff/player/event/sequence checkpoint is restored on final event insertion failure.
- **Snapshot serializer fix:** `SPDLevelSnapshot.buildLevelJson()` disables libGDX prototype elision so required default-valued schema fields and empty arrays are included in complete level JSON. Android regression checks schema version, branch zero, explicit false lock flag, tile position zero and required collections before submitting the snapshot through the client router.
- **Fail-closed exclusions:** level-up XP and `Hero.earnExp()` item callbacks, Unencumbered Spirit, UnarmedAbilityTracker, RemoteHero/player LifeLink and non-publisher Mob writes remain unsupported. No protected Java file (`Hero.java`, `Mob.java`, `WorldSnapshot.java`) was changed.
- **Remaining Phase 9 work:** real Durable Object/SQLite integration, crash/restart/authority handoff, XP level-up/item callbacks, Monk talent/ability variants, RemoteHero links, reconnect/expiry edges, more consumables and overlapping DOT/HoT/shield/detach callbacks, malformed/replay/resync. No live Worker smoke test or physical two-device match has been performed.


### Historical continuation checkpoint — 2026-10-31 (superseded by 2026-11-09)

- **Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`.
- **Working branch:** `multiplayer-framework-core-14118577486727081892`; never merge to `main` unless the user asks.
- **Latest tested gameplay code/test SHA:** `d1c2f180f29846ce16d20c010a38805754b9b70f`. Exact-SHA CI [41240428476](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41240428476) passed Backend typecheck/tests and Android JVM tests/debug APK compilation.
- **Phase 8:** complete for implementation and automated acceptance on `e36bc8030755050e3eae3d45ccab4db1040a65f5`; [CI 41230208577](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41230208577) passed 472/472 Vitest tests, Java tests and Android debug APK compilation.
- **Phase 9:** in progress, not complete. All work items and acceptance criteria remain unchecked. Current implementation/verification commits: `4f383d560d728c25a9894dc80e498f8954732098` ([CI 41240321050](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41240321050)) and `d1c2f180f29846ce16d20c010a38805754b9b70f` ([CI 41240428476](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41240428476)); both exact-SHA workflows passed.
- The current code parses native nested Hero Buff classes from the wider SPD package while keeping non-source rows immutable. It narrowly permits Frost/MagicalSleep removal during an effective-damage Hunger/Poison tick. Poison LifeLink Mob damage is accepted only as a two-event sequence: the existing Mob damage event commits the Mob result once, and the later Hero Buff tick correlates an accepted `LifeLink`-source `CHAR_DAMAGED` event from that Poison tick without reapplying Mob HP, SQL, death, or loot writes. Background Levitation expiry remains rejected because native detach occupies the Hero's tile.
- Still open: Wand.Charger/Recharging with exact per-wand charge and scheduler validation; BrokenSeal.WarriorShield, Blocking.BlockBuff and Berserk tick behavior; other damage side effects and linked/dead targets; broader consumable-effect lifetimes; concurrent ticks, exact-once/replay, expiry boundaries and reconnect/resync timing.
- **Next action:** complete the Wand.Charger/Recharging audit against native wand, RingOfEnergy, Regeneration and inventory bundles. Do not accept a charge tick until the server can bind it to one owned wand and validate the native formula and complete before/after item delta.
- No deployed Worker end-to-end smoke test or physical-device multiplayer match was performed; these remain Phases 22 and 23.

### Historical checkpoint — 2026-10-29 (superseded)

- **Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`.
- **Working branch:** `multiplayer-framework-core-14118577486727081892`; never merge to `main` unless the user asks.
- **Branch head before this documentation checkpoint:** `21af4f37d821c8b01bc00efd4377869231c720bb` (documentation-only; parent `dd1e488306e1214fa266d1abd12ebcfb745c7183`).
- **Latest tested gameplay code/test SHA:** `9c2bf9c520a7f18067a331e14461ff2eefb9b8a6`. Exact-SHA GitHub Actions [run 40909964645](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40909964645) passed backend TypeScript build/tests and Android JVM tests/debug APK compilation.
- **Exact stopping point:** the user resumed Phase 6 and then asked for a cross-conversation checkpoint. Re-reading the live roadmap and code confirmed Phase 6 already complete. This continuation was a read-only audit and made no gameplay-code changes.
- **Phase 6:** complete for implementation and automated acceptance on `859be3d6b1aea3b3fe13802fe9298d2344162edc`; exact-SHA CI [40508581979](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40508581979) passed. Coverage includes full/partial DROP quantities, stable source/result identities, stack-compatible merges, quickslot remainders, per-item heap reconciliation, replay rejection, and native projectile `HEAP`/`PIN_CUSHION`/`CONSUMED` outcomes.
- **Phase 7:** the next phase, currently open, with partial implementation already present. Current changed files since the Phase 6 checkpoint are `Shopkeeper.java`, `Food.java`, `Potion.java`, `Scroll.java`, `Wand.java`, `MultiplayerActionDispatcher.java`, `MultiplayerManager.java`, new `NativeItemUse.java`, `NetworkActionType.java`, `SPDLevelSnapshot.java`, `AlchemyScene.java`, `WndTradeItem.java`, `protocol/schema.json`, `server/src/index.ts` and `server/src/index.test.ts` under their existing repository paths. Audit the actual full paths/source before editing.
- **Latest regression fix:** `9c2bf9c520a7f18067a331e14461ff2eefb9b8a6` fixed the Phase 7 mining-buff validator argument contract by passing serialized JSON strings rather than parsed objects; validation was not weakened.
- **Backend count:** each mirrored test file (`index.test.ts` and generated `index.test.js`) passed 203 executions; that is 203 mirrored source cases, 406 executions total, not 406 unique tests.
- **Next action:** in the new conversation, read `GPT.md` and the full Phase 7 scope first. Finish and verify every remaining item-economy criterion against native SPD behavior—consumption/food/potions/scrolls, equipment and quickslots, atomic shop sale/purchase and currency/key costs, alchemy/mining/abilities, safe rejection/resync—and add positive and negative regressions. Run CI against the exact final source SHA, then synchronize both docs. Do not reimplement Phase 6 unless a concrete uncovered issue is proven.
- **Verification limits:** no deployed Worker end-to-end test and no physical-device multiplayer match was performed. Phase 22 remains the deployed-service preflight; Phase 23 remains the user-led physical-device playtest. Phases 1–6 are complete; Phases 7–23 remain open.


## Architecture Reference

For maintained, source-grounded architecture and edit-impact guidance, start at docs/multiplayer/README.md. Batch 2 adds ANDROID_NATIVE_INTEGRATION.md, SERVER_VALIDATION_AND_STORAGE.md, PROTOCOL_MESSAGE_CATALOG.md, TEST_MATRIX.md, SESSION_RECOVERY_AND_SECURITY.md, and SOURCE_FILE_REFERENCE.md. The temporary three-batch tracker separates Markdown documentation from the later large-source analysis. These documents accelerate discovery but do not supersede source at active HEAD.

- Native engine: Actor.java, Char.java, Hero.java, Mob.java, Level.java, Dungeon.java, GameScene.java.
- Snapshot/reconciliation: multiplayer/SPDLevelSnapshot.java and multiplayer/WorldSnapshot.java.
- Session/event/routing: multiplayer/MultiplayerManager.java and multiplayer/MessageRouter.java.
- Legacy overlapping receiver to audit/migrate: multiplayer/RemotePlayerActionReceiver.java.
- Native transport/action bridge: NetworkMessage.java, MessageType.java, NetworkActionType.java, NetworkActionBridge.java, MultiplayerActionDispatcher.java, InternetTransport.java, LANTransport.java and BluetoothTransport.java.
- Native combat contracts: NativeCombatAuthorityPolicy.java, NativeCombatJson.java and NativeMobCombatDelta.java.
- Worker entry/facade: `server/src/index.ts` (Wrangler `main`); request router: `server/src/worker.ts`; Durable Object implementation: `server/src/match-room/`; backend tests: `server/src/index.test.ts`, `server/src/native-pickup-side-effect.test.ts` and `server/src/entrypoint.test.ts`. Protocol: `protocol/schema.json`.
- CI: .github/workflows/multiplayer-ci.yml. It runs Node 20 npm build/tests and Java 17 Gradle JVM tests plus Android debug APK compilation.
- Mode descriptors: CoopMode.java, PvPMode.java, DeathmatchMode.java and SurvivalMode.java need actual server/client enforcement; class existence is not proof that a mode works.

The detailed phase requirements and acceptance gates below are the authoritative work plan. Keep them in sync with GPT.md.

## Phase 1 — Establish a Lossless, Validated World Snapshot

**Priority:** P0  
**Status: Complete for implementation and automated acceptance after the consistency audit.** Server snapshot admission now matches Android's full-snapshot requirements for typed dimensions/seed/floor entrance and exit coordinates, unique tile and exploration cells, unique Mob IDs/positions/stable IDs, unique heap/trap/plant positions and blob classes, and required native Mob runtime fields. Native bundles that the server cannot decode remain length-bounded and are validated by the native client before restore. Exact code SHA `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30` passed [CI run 39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420): backend TypeScript build/tests and Android JVM tests/debug APK build both succeeded. Physical two-device testing remains a Phase 10 release gate.

### Work items

- [x] Define one documented snapshot schema/version shared by `SPDLevelSnapshot`, `MessageRouter`, `WorldSnapshot`, the server's `LEVEL_DATA` validator, `getCurrentLevelSnapshot()`, and `protocol/schema.json`.
- [x] Audit serialized fields against native SPD objects, including all tile/collision flags, transitions, stable mob identity/native state, heap type and item bundles, traps/plants/blobs, hero/inventory/buffs/cooldowns, pending items, level view distance/colors, custom tiles/walls, spawn classes and respawner state.
- [x] Add stable server-assigned entity IDs that survive reconnects and do not depend on local `Actor.id()`. Keep native actor IDs as local runtime identities only; IDs now map through publication ACKs, snapshots and mob attack target resolution.
- [x] Make absent collection versus explicit empty collection semantics clear. A complete snapshot with zero traps/heaps/mobs must clear stale local objects; a partial snapshot must never accidentally clear them.
- [x] Validate bounds, duplicate IDs/positions, native bundle types, array counts, numeric ranges, dimensions, depth/branch and server payload size before changing the live world.
- [x] Make restoration ordered and atomic from the caller's perspective: validate first, apply validated geometry and native object bundles, reconcile entities, and publish the snapshot only after success. A valid local native rollback baseline is captured before the first remote snapshot; a failure restores the prior world and is rethrown so `MessageRouter` requests resync. Failure-after-resize rollback is exercised by JVM tests.
- [x] Reconcile all entities both ways: create missing native instances, update matched instances, remove stale instances safely, and preserve tombstones for dead entities without rerunning kill rewards/loot. Stable IDs are cleaned up on removal, and remote death events remove entities without calling native loot-producing `Mob.die()`.
- [x] Restore complete heaps without losing stack order, item properties, special heap state or remaining items. Restore traps/plants/blobs with their real native bundles and scheduler timing.
- [x] Apply world mutations on the render thread; rebuild custom visuals in their original layer order, refresh all map cells and recompute FOV without inventing visited cells. Pathfinding dimensions are validated against the active level before apply.
- [x] Audit and include gameplay-relevant level metadata omitted by the current snapshot (map exploration state, level lock/feeling, custom tiles/walls, mob spawn classes, respawner bundle and remaining cooldown, and native transitions).
- [x] Restore the entire native serialized bundle for already-matched mobs, including subclass-specific fields, while preserving the current device's Actor ID and scheduler registration; a JVM regression test reapplies the same stable-ID snapshot twice and verifies those invariants.
- [x] Keep server snapshot admission at least as strict as Android restore preflight: enforce numeric schema/dimension/depth/branch/seed/entrance/exit fields and floor-cell bounds, full native Mob AI/scheduler fields, and uniqueness of tile/exploration cells, Mob IDs/positions/stable IDs, heap/trap/plant positions and blob classes before SQL persistence. Regression tests cover conflicting positions, incomplete Mob state, malformed cells/coordinates and coerced string dimensions; `protocol/schema.json` requires the native Mob snapshot state. Exact-SHA run 39655327420 passed both CI jobs.
- [x] Complete automated native-world round-trip/idempotency coverage for missing/stale entities, killed-mob tombstones and reconnect restore. JVM tests reconstruct a missing stable-ID mob, remove unrelated stale mobs, apply the same snapshot twice without duplication, restore a resized floor, converge two independently generated local worlds from one authoritative snapshot, restore native multi-item heaps/traps/plants/timed blobs, and roll back a deliberately failed mid-restore. Server tests cover stable-ID persistence/target resolution, duplicate-ID rejection, explicit empty collections and invalid bundles.

### Acceptance criteria

- [x] Two independently generated local worlds applying the same authoritative snapshot converge on the same playable level and tested entity state in an automated JVM convergence test. A physical two-device session is still a separate release smoke test.
- [x] A reconnecting client can reconstruct a world even when its local generated floor dimensions or entity set differ (same active depth/branch).
- [x] A full empty collection removes stale local objects; malformed/incomplete data is rejected before mutation or restored from the last known-good baseline on failure.
- [x] Reapplying the same snapshot is idempotent for mobs, heaps/items, traps, plants and timed blobs; native mob Actor IDs remain local rather than being treated as network identity.
- [x] Latest consistency-hardening changes pass exact-SHA backend TypeScript build/tests and Android JVM tests/debug APK CI: [run 39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) passed on code SHA `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`.
- [x] Server and Android CI pass; snapshot contract tests cover valid/invalid data and restore rollback.

## Phase 2 — Make Native SPD Combat Replication Correct and Safe

**Status: Complete for code and automated acceptance in CI.** The exact code checkpoint `b19693e81280003381c42003fb7928ff899ade98` passed the backend TypeScript build/tests and Android debug build plus JVM tests in [CI run 39478567024](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39478567024). Physical two-device play was not run by CI and is not claimed as completed.
**Priority:** P0  
**Dependency:** Phase 1 entity identity and snapshot state.

### Completed work

- [x] Trace the native attack and damage flows that Phase 2 synchronizes: native hero attacks, hits and misses, target damage/armor/shields/buffs, attacker reactive damage, mob-to-player outcomes, periodic mob damage, PvP, player death/resurrection with blessed Ankh, secondary mob mutations and lethal mob rewards. These paths use the existing SPD Java engine on the selected authority; the Worker does not invent replacement damage rolls.
- [x] Preserve authoritative hit/miss outcomes, native post-proc HP/HT and shields/buffs, positions, stable entity identity, attacker post-state, secondary mob bundles, and death/loot snapshots. A secondary mutation cannot be accepted without a complete stable-ID payload; incomplete or non-authoritative shared-mob changes are discarded and trigger authoritative resync.
- [x] Define a versioned combat result contract in `protocol/schema.json`, including the depth, sequence/request identity, target type, native result and pre/post state fields.
- [x] Validate authority and pending request ownership for mob attacks and PvP; validate target identity, depth/position, melee or ranged geometry and line of sight, trusted pre-state, HP/HT and shield/buff transitions, move destinations, loot snapshots, replay/collision protection and stable mob entity IDs.
- [x] Reconcile attacker and defender state from the authority-merged native snapshot, including native inventory changes, class/equipment/talents and buffs. For delegated combat, the actual remote attacker receives native kill XP/class rewards rather than the host's hero.
- [x] Replicate actual misses and zero-HP-damage shield-only hits without turning a miss into a hit or treating shield absorption as HP damage. Include defense/retaliation, periodic mob damage, Ankh revival, and complete secondary-mob deltas in the automated runtime/contract coverage.
- [x] Prevent duplicate mob death/reward/loot processing on replicas. Dead replicas are removed using authoritative tombstones rather than calling the local loot-producing death pipeline a second time.
- [x] Add and run JVM native-runtime tests for real hits, misses, zero-damage/shield-only hits, defensive retaliation, attacker state after reactive damage, blessed-Ankh revival, delegated kill rewards, mob-to-player damage, periodic mob damage, PvP/Ankh interactions, secondary mob effects and bundle deltas, stable-identity convergence across clients with different local actor IDs, stale-event protection and duplicate-death prevention.
- [x] Keep headless authority tests safe when presentation objects (sprites/UI) are not attached; native state/rewards still resolve, while optional presentation is skipped. The tests are part of the same CI job that compiles the Android debug APK.

### Authority boundary

The Worker **does not run Java SPD or independently reproduce its RNG/damage formulas**. The designated level publisher resolves native combat against mobs; the target owner's native client resolves incoming PvP. The Worker validates the matching pending authority request/result and commits the reconciled state. Incoming damage from mobs/environment uses the target owner's native simulation; non-authoritative reactive changes to shared mobs or loot are not trusted and require an authoritative snapshot/resync. This is an explicit authority boundary, not a claim that arbitrary client-provided HP is accepted.

### Acceptance criteria

- [x] Outcomes originate from native SPD combat code, not generic server-side random damage.
- [x] Combat requests/results are authority-bound, depth/position/pre-state checked and replay-protected.
- [x] Runtime/contract tests cover convergence and duplicate/stale event safety, including two simulated clients with different local actor IDs.
- [x] Hit, miss, shield-only, reactive, periodic, death/reward and Ankh paths listed above are exercised by automated tests.
- [ ] Physical two-device smoke test in a live Android session remains a release verification step; it was not executed by GitHub Actions and is not represented as passed.

## Phase 3 — Synchronize Native Mob AI and the Actor Scheduler

**Priority:** P0

**Status:** Complete for implementation and automated acceptance on code SHA `a5565ea05ae677104f3eccfa428e99c5b5e787bb`. Exact-SHA CI [39670992419](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39670992419) passed both required jobs.

### Work items

- [x] Use one authoritative execution model for mobs and actor turns: the elected Java SPD level publisher runs the original shared `Actor.process()` scheduler; other clients do not advance shared Mob/Blob/Mob-target Buff/respawner actors independently.
- [x] Keep the TypeScript Worker on the transport/validation/persistence/sequencing side. Generic server pathfinding is not used as native SPD gameplay truth.
- [x] Preserve native per-Mob state through native bundles and AI snapshot data, including sleeping/hunting/fleeing/wandering state, stable target identity and cell, FOV/alert flags, buffs, subclass behavior and special attacks.
- [x] Serialize and restore native effective speed and remaining Actor cooldown; verify status-modified speed (including Haste) survives a full round trip instead of deriving turn time from base speed.
- [x] Keep native actor ordering, ties, action costs, status ticks, delayed effects, respawners and actor removal under the original Java scheduler; publish only completed shared-world results. If a shared actor's native `act()` returns `false`, defer the snapshot until its original callback advances `Actor.next()`; this includes animated attacks and callback-driven special projectiles.
- [x] Sequence accepted native actor turns on the Worker with a strictly contiguous counter; reject replayed or skipped turn numbers and carry the accepted counter through full snapshot/resync restoration.
- [x] Reconcile authoritative Mob moves, attacks, special effects, deaths and drops as sequenced native world state, without re-running replica death/reward/loot code just to update state.
- [x] Support publisher-native targeting of either living co-op Hero according to the game's alignment/FOV rules, and rebind stable PLAYER targets only after the remote Hero has been constructed in the receiving Actor graph.
- [x] Add runtime scenarios covering sleeping/fleeing/out-of-sight state, stable target rebinding, disconnected target removal, obstacles/diagonal corners, fleeing/path choices, speed buffs and cooldowns, animated attack completion, callback-driven special Mob effects, and publisher-only execution. Existing native combat scenarios continue to cover exactly-once death/reward/loot and secondary Mob effects.

### Acceptance criteria

- [x] Every accepted shared native Actor turn has one authoritative result and one contiguous server sequence/counter; stale or skipped native turn submissions are rejected.
- [x] Mob AI, effect resolution and turn timing come from the original Java SPD rules; the Worker does not substitute generic AI/damage/pathing as equivalent behavior.
- [x] Clients do not independently execute conflicting shared Mob turns, and restoration retains native target identity and scheduler state.

### Verification and limits

- Code SHA tested: `a5565ea05ae677104f3eccfa428e99c5b5e787bb`.
- Exact-SHA CI [39670992419](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39670992419) succeeded for `Backend typecheck and tests` and `Android debug APK compile`, including the JVM test suite.
- Vitest reported 220 executions passed across the TypeScript test file and its generated JavaScript counterpart (the two files exercise corresponding test cases; this is not 220 distinct source scenarios).
- `NativeCombatRuntimeIntegrationTest` contains 36 integration test methods at this checkpoint, including the new callback-driven special Mob test.
- No physical two-device session or deployed Worker end-to-end run is claimed. Real-device/network verification remains an explicit Phase 10 release gate.
- At the time of this Phase 3 checkpoint, Phase 4 was next. Its implementation and automated acceptance are recorded in the 2026-10-22 Phase 4 verification entry below; Phase 5 is now next. Phase 9 publisher-disconnect/authority handoff remains separate and open.

## Phase 4 — Complete Movement, Floors, Doors and World Interactions

**Priority:** P0/P1

**Status:** Complete for implementation and automated acceptance on code SHA `c0c231a501bb2996f261e7e9e4e5d66e4136d70b`. Exact-SHA CI [39850368287](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39850368287) passed both required jobs.

### Work items

- [x] Define the authoritative action lifecycle: native SPD intent -> server acceptance/rejection -> original Java resolution -> validated full native mutation snapshot -> sequenced event/broadcast -> peer application or resync.
- [x] Validate movement against the complete current map and occupancy, native passable/avoid/solid/pit rules, source/destination bounds, adjacent step geometry, roots/paralysis, native cost bounds and pending floor transitions. Reject unauthorized movement and reconcile it through an authoritative resync rather than retaining optimistic state.
- [x] Complete regular stair transitions with source/depth/type/branch validation, native destination-level publication, destination seed checking, per-living-player `LEVEL_READY`, one shared target cell, atomic room depth/player-state commit, and timeout abort/recovery.
- [x] Add a first-class native `FALL` transition for the original `Chasm.heroFall()` path (which bypasses ordinary movement into the pit): validate the adjacent source/pit cells, use the original SPD fall/InterlevelScene path on every peer, derive a deterministic safe destination landing from the generated floor seed and source cell, and keep the transition barrier closed until all clients are ready on that same safe cell.
- [x] Prevent a second/simultaneous floor transition while one is pending; reject transitions from dead players, without an active publisher, while floors are locked, or onto unsupported nonzero branches. Nonzero branches fail explicitly rather than silently diverging.
- [x] Synchronize original native door opening/closing, locked doors and keys, secret doors/traps, barricades and destructible terrain, mining, movement-triggered traps/plants/wells and valid NPC interactions/chest state through action-bound, constrained native world mutations. The Worker rejects out-of-range edits, invalid terrain flags, forged loot/inventory, unrelated entity changes and unsupported mutation deltas.
- [x] Preserve Hero state and native progression across floor changes/reconciliation: serialized inventory/equipment, key counts/notes, quests and native buff/cooldown state are carried by the full Hero snapshot; accepted keys/loot are bounded by action-specific validation.
- [x] Cover the critical paths with server tests for terrain/occupancy and movement rejection, locked/unsupported transitions, safe native pit falls and landing rejection for pits/traps/Mobs, destination snapshot admission, per-peer readiness, timeout abort conditions, and simultaneous transition attempts. JVM tests cover deterministic safe landing and exclude traps/Mobs while keeping solo SPD landing logic unchanged.

### Acceptance criteria

- [x] The Worker validates each move against a complete trusted snapshot and only persists action-authorized native changes; rejected optimistic changes can be reconciled by full snapshot/resync.
- [x] A floor is not committed based solely on depth. The destination publisher snapshot, destination seed and each connected living peer's ready Hero state must agree before an atomic floor swap resumes the room.
- [x] Regular stairs and native pit falls use native SPD scene/transition logic, and the multiplayer FALL landing is deterministic, in-bounds, passable, non-pit, and free of traps and Mobs.
- [x] Door/key/chest/mining/terrain/plant/trap/well mutations converge through constrained native snapshots; unsupported branches are rejected explicitly.

### Verification and limits

- Tested code SHA: `c0c231a501bb2996f261e7e9e4e5d66e4136d70b`.
- Exact-SHA CI [39850368287](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39850368287) passed `Backend typecheck and tests` and `Android debug APK compile`, including JVM tests and APK compilation.
- Vitest reported 242 successful executions across `index.test.ts` and the generated `index.test.js` counterpart (121 source cases mirrored across the two files, not 242 distinct scenarios). `NativeCombatRuntimeIntegrationTest` contains 37 test methods at this checkpoint.
- No physical two-device session or deployed Worker end-to-end test is claimed. Those remain explicit Phase 10 release checks; CI proves build and automated contract/runtime tests, not live device timing or transport behavior.
- **Follow-up verification on the later branch tip:** code HEAD `ab81c507c5f1ae0b767732a7247cf7afe5afd917` also passed both jobs in [CI 39859774332](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39859774332). The follow-up commits primarily extend stable inventory/item transaction handling; this confirms that the later combined tree still builds and passes the automated suites, while the phase-specific implementation checkpoint remains `c0c231a501bb2996f261e7e9e4e5d66e4136d70b`.
- Next whole phase: Phase 5 — items and effects. Phase 9 authority handoff and Phase 10 real-device/deployment verification remain separate and open.

## Phase 5 — Stable Item Identity and Pickup Claims

**Priority:** P0 · **Dependencies:** phases 1–4 (complete).

**Status: Complete for implementation and automated acceptance.** Exact final tested code/test SHA `fb722732261823ab2d969ac4e5a5b706b0f53308`; [CI run 40402007522](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40402007522) passed both required jobs.

### Work items
- [x] Audit native item and heap identities across Item/Heap construction, inventory instances, dropped items, partial-stack split/duplicate behavior, native bundle serialization, level export, strict snapshot restore, pickup action routing, and Worker claim validation. Preserve the already-correct Phase 5/6-related code instead of adding parallel flows.
- [x] Ensure distinct floor item and heap instances have stable IDs that survive native Bundle round-trips and floor snapshot restore. Splitting or duplicating an item generates a distinct ID for the new instance while the remainder preserves its original ID.
- [x] Make every complete floor heap/item snapshot include a well-formed stable ID and reject duplicate heap IDs, duplicate item IDs across the floor, malformed metadata, and item rows whose ID/class/quantity/level/curse/stackable metadata disagrees with the decoded native Item bundle.
- [x] Make pickup claims scoped to the room's Durable Object database plus depth, branch, stable heap ID and stable item ID. The database key does not depend on class name or cell position.
- [x] Reserve claims inside a Durable Object SQLite `transactionSync`: only the same authenticated player and same request ID can retry idempotently; a different player or a different request ID receives `ITEM_ALREADY_CLAIMED`. Include branch in claim lookups/releases and the accepted mutation contract.
- [x] Add a transactional migration from older `claimed_item_instances` layouts to the branch-aware composite primary key, preserving existing reservations and assigning legacy rows to branch zero when the old schema lacked the branch column.
- [x] Add JVM and Worker tests for ID validation and bundle round-trips, new IDs after duplicate/split, strict/missing/duplicate IDs, exact owner/request retries, competing claimants, depth/branch/room isolation, old schema detection, and native heap restoration fixtures. Fix the headless test fixtures instead of weakening the production validators.

### Acceptance criteria
- [x] A stable item instance cannot be reserved by more than one player/request in the same room/depth/branch/heap/item scope; one valid retry returns the same reservation, while competing/replayed identities are rejected.
- [x] Retries are idempotent only for the same authenticated player and the exact same request ID. The post-action native snapshot must match the accepted pickup intent and the reserved claim before the floor/inventory state is committed.
- [x] Heap and item IDs remain unique and unambiguous across distinct items with the same class, separate cells, stack splits, depth changes, snapshot application and restore. Missing or mismatched identity is rejected before the live native world is changed.

### Verification and limits
- Final tested code/test SHA: `fb722732261823ab2d969ac4e5a5b706b0f53308`.
- Exact-SHA GitHub Actions [run 40402007522](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40402007522) completed successfully: backend TypeScript build + Vitest passed; Android JVM tests + debug APK compilation passed.
- Backend test output reported 173 executions in `index.test.ts` and 173 mirrored executions in `index.test.js` (346 executions across two files, not 346 distinct source cases).
- The first run exposed headless texture initialization in a new test and a pre-existing handmade snapshot fixture that lacked required stable IDs. Both were corrected; production validation remained strict, and the exact-SHA rerun is green.
- No physical-device test or deployed Worker end-to-end run was performed. Physical-device play remains Phase 23 by user request; broad automated/deployed-service preflight remains Phase 22.

## Phase 6 — Drops, Partial Stacks and Floor Heap Reconciliation

**Priority:** P0 · **Dependencies:** Phase 5.  
**Status:** Complete for implementation and automated acceptance on tested code SHA `859be3d6b1aea3b3fe13802fe9298d2344162edc`; exact-SHA CI [40508581979](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40508581979) passed both backend and Android jobs.

### Work items
- [x] Validate full and partial DROP transactions from trusted native inventory pre-state to the exact source remainder, stack metadata, destination heap and quickslot state.
- [x] Preserve source IDs on full moves, issue unique result IDs on split, and accept a stack merge only when native compatibility and serialized state match the expected result.
- [x] Reconcile each heap by stable heap/item IDs and validate every row, retaining unrelated items/order and heap metadata instead of replacing/removing the entire heap for a one-item change.
- [x] Synchronize thrown missiles after native impact resolution, including landed/merged projectiles, PinCushion-attached projectiles and consumed outcomes; keep combat and landing in one action-bound result and request authoritative resync when a mutation is ambiguous.
- [x] Add regressions for full/partial drops, merge/non-merge cases, quickslot quantity changes, duplicate DROP replay, multi-item heaps on one cell, invalid unrelated heap edits, missile durability merges with unchanged/reduced quantities, and HEAP / PIN_CUSHION / CONSUMED outcomes.

### Acceptance criteria
- [x] Accepted full/partial drops reconcile the exact inventory quantity with the resulting floor quantity or native-compatible merge.
- [x] Stable IDs and strict heap validation prevent duplicate/lost items or confusing same-class items in the same cell; invalid/replayed/ambiguous results are rejected and require resync rather than being treated as accepted state.
- [x] Peers receive the validated authoritative floor state or request resync when scalar combat events cannot fully represent floor/Mob side effects.

### Verification limits
- CI includes backend contract/unit tests and Android JVM tests/debug APK compilation. No physical-device multiplayer match or deployed Worker end-to-end test was performed in this phase; those remain Phase 23 and Phase 22 respectively.

## Phase 7 — Inventory Actions and Item Economy

**Priority:** P0/P1 · **Dependencies:** phases 5–6 and existing Phase 4 world-action admission.

**Status: Complete for implementation and automated acceptance on code/test SHA `744b78cebfae17609dd2b7d43e9d19bd42774056`.** Exact-SHA CI [41112954455](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41112954455) passed protocol schema validation, backend TypeScript build and 456 Vitest executions across four test files, plus Android JVM tests and debug APK compilation (`BUILD SUCCESSFUL in 53s`).

### Work items

- [x] Trace native food, potion and scroll effects through original SPD code; whitelist supported effects and validate their real native bundles, Hero clock, cooldown, buffs and inventory outcomes.
- [x] Synchronize supported equip/unequip, weapon/ordinary armor, quickslots, item bundles and capacity changes through action-bound native Hero state. Unsupported transformations and compound equipment cases are rejected safely.
- [x] Make Shopkeeper purchases, sales and buyback, Gold and EnergyCrystal pickups, keys/chest costs and supported currency mutations atomic and exactly-once through stable claims, request locks and exact native quantity/value checks.
- [x] Validate original alchemy recipes, mining/DarkGold inventory changes and supported class/talent/item abilities against native before/after bundles and accepted action costs.
- [x] Return structured rejection/resync for unsupported or ambiguous item mutations; do not broadcast an unvalidated client inventory as truth.
- [x] Add positive/negative tests for currency and claim races, altered quantities, forged item/economy data, repeated consumption, equipment/quickslot consistency, capacity, merge outcomes and unsupported actions.

### Implemented action boundary

- Native SPD paths support the whitelisted food and potion effects, `ScrollOfRecharging`, regular equipment actions, Shopkeeper BUY/SELL/BUYBACK, Gold/key/EnergyCrystal pickups, chest/key use, DarkGold mining, alchemy, and the supported Endure/Nature's Power abilities.
- Other scrolls, wand actions, conditional/class equipment, unrepresented item transformations, quest rewards and ambiguous bag/item mutations fail closed.
- The final pickup audit also rejects unsynchronized run-global identification, compound LostBackpack restoration, and a tipped-dart merge that would create additional floor/inventory items. Server validation independently checks trusted state for these cases.

### Acceptance criteria

- [x] Every enabled item action has one validated native result and one accepted inventory/economy outcome.
- [x] Gold, purchases, sales, keys and consumable quantities cannot be duplicated by retries or forged snapshots.
- [x] Unsupported cases fail visibly and safely; structured rejection/resync is used when the native result cannot be represented.

### Verification and limits

- Tested gameplay SHA: `744b78cebfae17609dd2b7d43e9d19bd42774056`; exact-HEAD CI [41112954455](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41112954455) passed schema, backend and Android jobs.
- No deployed Worker end-to-end smoke test or physical two-device match was run. Those remain Phase 22 and Phase 23.
- **Next whole phase:** Phase 9 — Native Buffs, Consumable Effects and Timed State.

## Phase 8 — Inventory Persistence, Restoration and Exactly-Once Rewards

**Priority:** P0 · **Dependencies:** phases 5–7 and Phase 1 snapshot infrastructure.

### Work items
- [x] Persist each player's complete native Hero/inventory state at the appropriate accepted mutation points, not only when an unrelated generic action happens to carry a Hero blob.
- [x] Preserve exact item bundles and runtime properties: quantities, cursed knowledge, upgrades, enchantments, glyphs, unique IDs, container contents, equipment, quickslots and item-specific state.
- [x] Verify disconnect/reconnect and full resync restore the same inventory and Hero state without constructor defaults, lost items or duplicate instances.
- [x] Cover death/boss/special-heap drops, remains, bones, dew, keys, quest items, Lost Backpack behavior, quest progress, kill rewards and statistics under replay and snapshot restoration.
- [x] Add persistence/reconnect tests for inventories that differ by equipment, container contents, unique items, partial stacks, quest items and reward/drop events.

### Acceptance criteria
- [x] Inventory state survives disconnect, full restore and repeated snapshot application byte-for-byte or by equivalent native semantic state.
- [x] A death, drop, quest or kill reward is applied at most once, including after reconnect.
- [x] Any bundle the server cannot interpret remains bounded and is validated by the native client before being applied.

### Completion record — 2026-10-31

**Status: COMPLETE for implementation and automated acceptance.** Tested code head: `e36bc8030755050e3eae3d45ccab4db1040a65f5`.

- Added versioned native run-progress persistence for statistics, catalog discovery/use counts, local badges, generator decks, limited drops, special/secret-room generation state, ring identification state, chapters, generated floors, pending dropped-item collections and quickslot placeholders.
- Kept native Hero/Belongings bundles and stable item IDs as the source of truth. Restoration now preserves the serialized nested-container tree and stack ownership instead of executing normal pickup auto-packing, stack merging or pickup side effects. Equipment, partial stacks, nested bags, cursed knowledge, quickslots and zero-quantity placeholders are regression-tested.
- Persisted the accepted native Hero progression, inventory indexes, notes/key counts, potion/scroll identification and NPC quest state only through validated mutation/combat/Ankh result paths. Pre-action matching prevents a client from smuggling new journal, quest or identification state into an unaccepted intent; malformed native bundles are bounded and rejected before world mutation.
- Added stable per-depth/per-Mob reward receipts in `native_mob_reward_claims`; replayed kills remain rejected even when submitted with a different request ID. Existing item/chest claim identities continue to protect pickups and rewards.
- Snapshot tests cover remains/skeleton heaps, dew, keys, quest items, LostBackpack after Ankh resurrection, ordered heap contents, native inventory trees, repeated full-world application and rejection-before-apply for malformed run/journal data. NPC quest restore also clears stale inactive quest/reward flags.
- Multiplayer intentionally does not run the single-player final-death `Hero.reallyDie()/Bones.leave()` path for an individual co-op death, because that path deletes the local run and writes a device-global Bones file. Existing skeleton/remains heaps are persisted as world heaps; the multiplayer death/revival flow persists the LostBackpack heap instead.
- Exact-head GitHub Actions [run 41230208577](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41230208577) passed: backend typecheck and **472/472** Vitest tests, Java tests, and Android `assembleDebug` (`BUILD SUCCESSFUL`).

Physical two-device gameplay and deployed Worker end-to-end verification were not run; keep those release checks in Phases 22 and 23.

### Active continuation checkpoint — 2026-11-12 (9-C local lifecycle green; publisher result blocked)

Phase 9 remains OPEN; only 9-C is active. Do not start Phase 10.

- Code/test HEAD: `7fe9b0164408cfde36b89a57551536bf6bbcd67c`; parent `59243da863f46151981ff2dae1e4c3559e122e53`.
- CI [43242489324 — failure](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43242489324): Backend 8 files, 652 pass / 2 fail; Android JVM tests and assembleDebug pass.
- Local SpiritArrow lifecycle: `SnipersMark.doAction() → SpiritBow.cast() → MissileSprite` construction; pending report stays open in flight; registered callback invoked twice yields one ATTACK/cleanup. Target movement before callback cancels, retains mark, requests RESYNC and emits no ATTACK.
- Headless limit: MissileSprite class/callback are real; `onComplete()` is manually invoked, not rendered animation.
- MatchRoom test: requester ATTACK, reservation and COMBAT_REQUEST forwarding succeed; synthetic publisher SYNC_MOB_STATE result gets INVALID_ACTION.
- First visible mismatch: fixture authorityResult appears to omit `attackerPos`; strict validator requires it and binds it to trusted player position. Verify all predicates and native Hero serializer before change.
- Publisher branch currently calls `remoteHero.shoot(target, bow.knockArrow())` then immediately `remoteHero.finishNativeSpiritArrowAttack(target)`; trace async callback ordering.

#### Immediate next task
1. Diagnose exact failed authorityValid predicate (start with attackerPos, then inspect all required fields/actual native output); fix source-faithful payload without weakening validation.
2. Pass TS and generated-JS test copies and full Backend CI.
3. Trace RemoteHero async finish ordering.
4. Add requester → reservation → actual publisher callback → accepted EVENT_BATCH → requester reconciliation test.

#### 9-C acceptance
- [ ] Resolve publisher SYNC_MOB_STATE INVALID_ACTION with source-faithful result.
- [ ] Verify/fix RemoteHero asynchronous completion.
- [ ] Joined cross-layer requester → publisher → accepted event → requester reconcile test.
- [ ] Hit/miss, target invalidation, invalid Bow/mark/entity, exception/cancel, duplicate, stale/replay and RESYNC cases.
- [x] Local callback and target-moved cancellation pass headless JVM tests.
- [x] Android JVM tests and assembleDebug pass on current HEAD.
- [ ] Keep SPEED volley and non-Mob targets fail-closed.

Parent Phase 9 remains OPEN. Remaining after 9-C: Wand/shield/Berserk/consumables, overlapping DOT/HoT/shield/detach/death, real Durable Object SQLite/restart/crash, publisher handoff, XP/Monk/RemoteHero, reconnect/expiry/replay/resync.

**Priority:** P0 · **Dependencies:** phases 7–8 and the native scheduler/snapshot work in phases 1–3.

### Work items
- [ ] Audit all multiplayer-relevant native buff/debuff application paths and retain the existing Java SPD formulas, timing and actor order.
- [ ] Synchronize effect ticks, remaining duration, cooldowns, shields, periodic damage/healing, hunger/WellFed state, potion effects and expiration through an authoritative native result.
- [ ] Ensure expiry is applied exactly once; reject unrelated Hero/Mob changes disguised as an effect tick and handle effect targets removed or killed during callbacks.
- [ ] Restore effect state and scheduler timing after reconnect/resync without restarting durations, applying ticks twice or leaving stale buffs.
- [ ] Add tests for concurrent effects, expiry boundaries, shields/DOTs, death during an effect, reconnect before/after expiry, duplicated tick messages and malformed effect deltas.

### Acceptance criteria

#### Parent Phase 9 acceptance — phase remains OPEN until every item below is satisfied

- [x] The original Java SPD engine remains authoritative for every enabled combat/effect calculation; TypeScript validates exact native results and never substitutes its own RNG, damage or scheduler formula.
- [x] Implemented Hero/Mob effect ticks are source-specific and validate trusted pre-state, native post-state, actor clocks, HP/shields/Buffs and only their permitted side effects.
- [x] Due-only expiry and selected concurrent timer restoration are covered by native/backend regressions; unrelated Hero Buff ticks cannot silently expire protected rows.
- [x] Poison LifeLink publisher batches, reward/loot evidence, replay rejection, non-publisher fail-closed behavior and scoped SQL rollback/deferred outbound messaging have MatchRoom/Android tests.
- [x] Unsupported effect branches remain fail-closed rather than accepting arbitrary client state.
- [x] Complete local SpiritArrow asynchronous callback lifecycle in the native headless JVM test.
- [ ] Complete full authority → accepted event → requester reconciliation.
- [ ] Close remaining Wand/shield/Berserk/consumable and native side-effect variants with exact Java and server positive/negative tests; no source effect may hide unrelated item/quest/economy/AI changes.
- [ ] Cover overlapping DOT/HoT/shield/detach effects, death during effects, target removal, concurrent timers, stale/replay/duplicate and reconnect/expiry boundaries.
- [ ] Verify actual Durable Object SQLite atomic rollback, restart/crash behavior and publisher authority handoff; the current test adapter is deterministic/in-memory.
- [ ] Validate XP level-up/`Hero.updateHT()`/item `onHeroGainExp` callbacks, Monk talent/ability variants and RemoteHero/player LifeLink, or keep them explicitly unsupported and ensure no path can partially apply them.
- [ ] Run the complete backend build/tests and Android JVM tests plus `assembleDebug` on the exact final SHA; both CI jobs must pass.
- [ ] Complete the deployment/service preflight and physical multiplayer playtest in phases 22–23; CI alone is not live service or device evidence.

Phase 9 must not be closed while any required enabled effect, authority, recovery or acceptance item remains open. Unsupported features may remain fail-closed only when that limitation is explicit and compatible with the parent phase's final intended scope.

### Progress checkpoint — 2026-11-09 (publisher Poison LifeLink batches atomic; Phase 9 remains OPEN)

- **Exact tested gameplay HEAD:** `b68b66e686b98dbf343997202b215e2c828b7b89` on `multiplayer-framework-core-14118577486727081892`; exact-head [CI run 42777941791 — success](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42777941791).
- **CI evidence:** TypeScript build and 644 Vitest executions across eight files passed; Android JVM tests and Debug APK compilation passed. TypeScript/generated-JavaScript suites mirror cases, so this is an execution count, not a unique-scenario count.
- Native LifeLink Mob callbacks produced inside the publisher's Poison actor are buffered rather than sent as separate `SYNC_MOB_STATE` commits. The complete before/after data is included in `NativeMobCombatDelta`, including publisher-local Actor IDs, stable entity IDs, native bundles, Buff/shield values, and a JSON-array heap snapshot when a Mob dies.
- A nonlethal Poison tick emits one `SYNC_HERO_STATE` / `BUFF_TICK` action containing both the Hero result and the complete linked Mob delta. A lethal local-Hero Poison callback attaches that same pre-state, sequence baseline and Mob batch to the Hero environment-death action; it does not wait for a post-death Buff tick.
- `MatchRoom.handleAction` wraps these two exact Poison batch shapes in `state.storage.transactionSync`. Mob SQL updates/deletions, the level snapshot and heaps, Hero/player HP state, reward receipts, the final event, `processed_actions`, sequence and world time share the request transaction. If `transactionSync` is not available, the batch is rejected. If a write/event insert throws, SQL rolls back and the handler restores its in-memory sequence/world-time checkpoint. This is deliberately scoped; it does not make every action transactional.
- The server resolves LifeLink Actor IDs only from the trusted Hero pre-state and complete level snapshot, then validates the stable server Mob identities and SQL before-state. It checks native post-bundles, HP/HT/position/shields/Buffs, death tombstones, loot only at dead Mob cells and trusted reward metadata. Non-publishers cannot author LifeLink Mob deltas from process-local Actor IDs.
- The lethal publisher branch builds synthetic Mob-damage evidence from the validated batch and trusted pre-death Mob snapshot; the same evidence drives exact non-level-up XP and supported base MonkEnergy checks. Level-up/item callbacks and unsupported talent/ability variants remain rejected. The legacy non-publisher lethal evidence branch only correlates already-accepted events and does not write Mob state.
- `server/src/match-room/lifelink-death.integration.test.ts` covers publisher nonlethal and lethal flows, replay using a fresh request ID, forged heap positions, non-publisher rejection and rollback when final event insertion fails. The in-memory SQL adapter models the HP-only Hero update, transaction rollback and all asserted rows. This exercises the MatchRoom handler, but is not a real Cloudflare Durable Object SQLite test.
- **Non-publisher limitation:** a local Hero Poison tick with LifeLink references is not authorized to mutate shared Mobs. Even an empty `secondaryMobDeltas` payload is rejected with `BUFF_TICK_MOB_AUTHORITY_REQUIRED`. Android verifies the shared Mob is not changed locally and that rejection of the Hero tick requests RESYNC; it does not test full remote snapshot application. Cross-client delegated LifeLink remains an open feature.
- **Correlated transaction errors:** an exception during the scoped SQL transaction is caught by the WebSocket message boundary, which now sends the original `requestId` and current room `sequence` in `ERROR`. The client can clear the pending action and request a snapshot after rollback. The new integration regression exercises the full message boundary with a forced final event-insert failure.
- **Deferred external side effects:** ACTION_ACCEPTED and FOV/MATCH_END event broadcasts are queued while the SQL transaction runs and emitted only after its successful return. Rollback after a later hook therefore cannot leave a phantom accepted event. The FOV exclusion uses the original sender WebSocket, not the proxy passed into the handler.
- **Concurrent Poison/Barrier damage:** server validation now accounts for the native ShieldBuff side effect of Poison damage against a Hero Barrier. A surviving Barrier may lose only the exact absorbed shield amount with unchanged partial decay; a depleted Barrier may detach only when the aggregate Hero shield decreases by exactly its old value. Tests accept full absorption/detach and partial absorption, while rejecting an unchanged shield with a missing Barrier, extra aggregate shield loss, or a forged partial accumulator. A Java runtime regression exercises a full two-point Poison hit absorbed by a two-point Barrier with no Hero HP loss.
- **Barrier Bundle field-name correction:** `Barrier.storeInBundle()` writes `partial_lost_shield`, not `partialLostShield`. The Poison side-effect validator and native Barrier-tick validator now read the exact native key. Backend tests mirror Bundle output and include a negative camelCase-alias case; this closes the Android/server mismatch missed by earlier fixtures.
- **Poison/ShieldBuff priority ordering:** the server mirrors native priorities 2 (`WarriorShield`/`BlockBuff`), 1 (`AscendBuff`/`DivineShield`) and 0 (`Barrier`). It requires complete consumption of each higher-priority tier before any lower-tier shield changes. Positive native-order and negative lower-tier-bypass fixtures pass; the Java runtime test exercises all three tiers and per-class zero-shield lifecycle.
- **Atomic Hero Buff tick boundary:** all source-shaped `SYNC_HERO_STATE` `BUFF_TICK` actions now use the same transaction/deferred-send wrapper as Poison LifeLink; strict validators still determine which source transitions may commit. A forced Healing event-insert failure proves the full Hero/player HP/Buff/event/sequence rollback path.
- **Wire fixes:** `NativeMobCombatDelta.Payload.heaps` is an object/JSON array, not a JSON string; `findObjectEnd()` handles nested objects and escaped quotes/backslashes; native Buff rejection responses report the first failed validation precondition.
- **Full resync application:** the Android regression now confirms a rejected non-publisher Poison/LifeLink prediction is undone by applying a complete server-shaped SNAPSHOT; Hero pre-tick HP, linked Mob HP/Actor identity and Poison/LifeLink clocks are restored. It uses a deterministic in-test envelope, not a live Worker/SQLite response.
- **Native snapshot JSON:** prototype elision was disabled for `SPDLevelSnapshot.buildLevelJson()`; otherwise default schema/branch values and explicit empty collections could be omitted and the client would reject the full snapshot as incomplete.
- **Protected files:** `Hero.java`, `Mob.java`, and `WorldSnapshot.java` remain unchanged.
- **Safe Hero Amok expiry:** the publisher now captures a due `Amok` Buff targeted at the local Hero. Native `Amok.detach()` only resets enemy-to-enemy Mob aggro when its target is an enemy; Hero-targeted expiry only removes the Hero Buff. Backend tests prove due-only removal and reject forged HP/shield changes, while the Android native runtime test executes the original `Amok.act()` and confirms the shared Mob HP and `AiState` remain unchanged. Amok is intentionally excluded from the cross-tick expirable set so another Buff tick cannot remove it as an incidental side effect.

- **Safe Hero SnipersMark expiry:** native local-Hero `SnipersMark.act()` is now published only at its own due expiry. Its detach clears the local `ActionIndicator`; it does not perform Mob damage or AI changes. The backend accepts only due removal with exact pre-state identity/bonus and unchanged HP/shield/inventory, and rejects missing/early/modified marks or incidental disappearance during another Buff tick. Spirit Arrow use and target combat are not included by this expiry-only change.
- **Still open for Phase 9:** real Durable Object/SQLite restart/failure validation, publisher authority handoff, level-up XP and item callbacks, Monk talent/ability variants, RemoteHero/player LifeLink, reconnect/expiry boundaries, more consumables/detach paths and simultaneous DOT/HoT/shield effects, and broader malformed/replay/resync testing. No Worker deployment smoke test or physical two-device match was run. Phase 9 remains OPEN.


### Progress checkpoint — 2026-11-02 (Phase 9 remains OPEN)

- Latest exact-SHA code/test checkpoint: `b9ad0739d10d6a4125fb6ea084d6d072b2699810`; exact-head CI [41489794307](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41489794307) passed Backend TypeScript build/tests and Android `:core:test` plus Debug APK assembly (`BUILD SUCCESSFUL`). Backend executed **560 Vitest tests across four files**; TypeScript and generated JavaScript suites mirror the same source cases, so this is not 560 unique scenarios.
- Added native Hero/Mob flavour-expiry handling for `Foresight`, `Invulnerability`, and `FrostImbue`. These additions are expiry-only: the Java publisher admits the source event, while server validation requires the source timer to be due, exactly one removal, unchanged Hero HP/shield and unrelated native state. No application-side callbacks are authorized by these additions. The Java publisher regression constructs the Buff objects and sets their Hero target directly, avoiding scene-backed `Foresight.attachTo()` in headless tests; final exact-head Android CI passes.
- The intermediate run [41489235105](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41489235105) exposed that headless `Foresight.attachTo()` calls `Hero.search()` and requires `GameScene.scene`; the Java fixture was corrected without changing production behavior, and [41489794307](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41489794307) passes both jobs.
- New regressions prove two overlapping Hero timers expire as separate due scheduler events: the second expiry is rejected before its deadline, then accepted at its deadline, and both an old event and a duplicate are rejected after commit. Java Mob restore now verifies concurrent Haste+Weakness cooldown preservation, no duplicates on repeated snapshots, and no resurrection after both effects expire.
- Cloudflare verification: the `spd-multiplayer` Worker still has its only 100%-traffic deployment from 2026-09-13; code through `b9ad073` has not been deployed and no live Worker smoke test was run. No physical-device multiplayer match was performed.
- Native Hero Buff ticks remain source-specific and fail closed. Verified branches include Hunger/Poison constraints (Poison with LifeLink is rejected), Drowsy-to-MagicalSleep, Dread countdown/expiry, Recharging, Barrier/Blocking/BrokenSeal shield behavior, and only the deterministic portion of Berserk. Random Berserk shield decay remains rejected because it can kill the Hero and mutate additional state.
- Wand charging is now implemented as an item-bound `Wand.Charger` tick: the event identifies one owned Wand by stable item ID and proves exact `curCharges`/`partialCharge` changes against native max-charge, Wand subclass, MagicalHolster, RingOfEnergy/EnhancedRings/Light Reading, Regeneration/LockedFloor/VaultLevel, MagicImmune, Recharging remainder and actor order. Unrelated inventory, quickslot and economy state remains immutable.
- Native Mob timed-effect expiry has its own full-world validator. It checks the native actor clock, exact Mob/Buff Bundles, stable entity identity, globally unique local Actor IDs (including local/remote Heroes, their Buffs, Mobs, Mob Buffs, Blobs and the level respawner), unchanged unrelated world state and exactly one source expiry. `Terror` expiry is admitted only with the exact native `Mob.remove(Terror)` transition: FLEEING becomes HUNTING when `enemySeen` is true, otherwise WANDERING; unrelated AI/visibility changes and simultaneous Dread+Terror are rejected. Hero Terror damage recovery remains a distinct Hero tick callback.
- Mob Buff restoration prepares the complete set before detaching prior effects, restores each original remaining cooldown, rejects failed attachment/decoding instead of silently dropping effects, and is covered for concurrent Haste+Weakness restoration, repeated snapshot application and non-resurrection after both effects expire.
- Consumable validation includes the admitted native Food, Potion, and ScrollOfRecharging paths. PotionOfHealing uses the exact VialOfBlood multiplier and per-turn cap; PotionOfPurity/Stamina, Haste, Invisibility, Levitation, Strength and Shielding have source-specific checks. PotionOfShielding now requires the exact native Barrier shield amount and partial-decay state; it cannot add Poison. Healing and Shielding are blocked before local execution under `NO_HEALING`, and the server rejects a Poison fallback disguised as a successful consume.
- The remaining phase work is broader than the current accepted subset: multi-target `LifeLink`/death callbacks, additional potion/scroll families and other Buff detach side effects, plus broader concurrent-effect, target-death, expiry-boundary, reconnect-before/after-expiry and malformed/replay/resync coverage. Separate sequential timer expiries and concurrent Mob-buff restoration now have focused regression coverage. Unsupported branches must continue to request resync or reject rather than mutate locally.
- No deployed Worker end-to-end smoke test or physical-device multiplayer match was run; those remain Phases 22 and 23. CI does not replace those release checks.

- Effects use original SPD gameplay and agree across clients on active state, tick result, duration and expiry.
- Replaying a tick or restoring the same snapshot does not duplicate damage/healing or extend/restart an effect.
- Removed actors/effects are safely cleaned up with no hidden scheduler corruption.

## Phase 10 — Canonical Protocol Schema and One Typed Event Path

**Priority:** P0 · **Dependencies:** accepted contracts from phases 1–9.

### Work items
- [ ] Compare every active Java message/action enum and payload with Worker handlers and protocol/schema.json, including LEVEL_DATA and all item/effect outcomes.
- [ ] Document required versus optional fields, full versus partial snapshots, stable IDs, request IDs, sequence numbers, rejection/error payloads and supported protocol versions.
- [ ] Make structured JSON parsing and the typed MessageRouter the single event-application path.
- [ ] Migrate any remaining behavior from RemotePlayerActionReceiver and remove the legacy overlapping parser only after equivalent behavior has dedicated tests.
- [ ] Add contract tests that reject missing/wrongly typed fields and ensure every declared message has a known handler or an explicit unsupported response.

### Acceptance criteria
- Schema, Java messages, Worker validators and client handlers describe the same contract.
- No duplicate legacy/event receiver can mutate gameplay state separately from the typed path.
- Unknown or unsupported messages fail safely and observably.

## Phase 11 — Event Ordering, Replay Protection and Resynchronization

**Priority:** P0 · **Dependencies:** Phase 10.

### Work items
- [ ] Apply accepted events in sequence order; ignore already-applied duplicates and detect skipped/out-of-order sequence numbers.
- [ ] Deduplicate request IDs across retries and prevent one ID from being reused for a different action/player/payload.
- [ ] Ensure action pre-state, current depth, actor ownership, stable target identity, action cost and result delta are validated before any persistent mutation.
- [ ] Define when an event gap can be repaired from the retained event log and when the client must request a full authoritative snapshot.
- [ ] Add replay, out-of-order, stale-state, duplicate action, sequence-gap and bad-resync regression tests across the Worker and Java router.

### Acceptance criteria
- Replayed, delayed or out-of-order messages cannot apply an action twice or move the match backward.
- A client converges by contiguous event replay or a full snapshot; it never guesses the missing state.
- Invalid events do not partially persist data before rejection.

## Phase 12 — Durable Recovery, Reconnect and Authority Handoff

**Priority:** P0 · **Dependencies:** phases 10–11 and the session model in Phase 13; generic recovery contracts can be tested before individual transports are complete.

### Work items
- [ ] Fix reconnect token/session lookup so a new socket binds to the correct player before being marked connected, while preventing session impersonation.
- [ ] Bound event-log retention and snapshot fallback, and make room/player/world persistence recoverable after Durable Object restart.
- [ ] Add explicit SQL/schema migrations and transactional boundaries for related room, player, event, inventory and item-claim updates.
- [ ] Transfer native level-publisher authority safely when its player disconnects or leaves: preserve a validated snapshot, elect one replacement and resume one authoritative scheduler.
- [ ] Add tests for reconnecting identity, dropped connections, expired tokens, restart/recovery, transaction rollback, migration compatibility and publisher loss during combat or transition.

### Acceptance criteria
- A reconnect either replays a complete event range or restores from a valid authoritative snapshot.
- Durable Object restart and schema migration do not lose or duplicate accepted gameplay state.
- At every point there is at most one publisher for shared native turns; handoff cannot duplicate Mob turns, death rewards or loot.

## Phase 13 — Common Room/Session Lifecycle and Readiness

**Priority:** P0 · **Dependencies:** phases 10–12.

### Work items
- [ ] Separate transport-connected, authenticated/session-bound, room-created/joined, world-synchronized, ready and playing states.
- [ ] Implement explicit create/join/leave/ready/start/room-state operations and enforce the chosen mode's player capacity before launch.
- [ ] Make start contingent on valid room membership, the designated authority and a consistent world seed/snapshot; never launch a local/fake match on timeout.
- [ ] Implement cancellation, connection timeout, bounded retry/backoff, duplicate-session prevention and cleanup of sockets/listeners/pending actions.
- [ ] Add session-state machine tests for partial failures, simultaneous joins/starts, last-player departure, cancellation and late callbacks.

### Acceptance criteria
- Connection alone never means the player is in a playable match.
- The client has a single explicit session state and cannot accidentally start twice or remain half-connected.
- Every failure ends in a truthful error, a safe retry state or a clean exit.

## Phase 14 — Internet/WebSocket Transport

**Priority:** P0 · **Dependencies:** Phase 13 and the Phase 11–12 protocol/recovery contracts.

### Work items
- [ ] Verify the handshake and endpoint contract against the deployed Worker, including required headers and correct room URL behavior.
- [ ] Audit WebSocket framing/masking, fragmentation, text payload limits, UTF-8, ping/pong, close codes, TLS and timeout behavior.
- [ ] Make connection callbacks and reconnect/retry paths thread-safe; marshal scene/UI changes onto the render thread.
- [ ] Handle network changes, temporary offline state, screen-off/background behavior and slow or half-open connections on supported Android versions.
- [ ] Add deterministic transport tests with a local/mock compliant endpoint and service-level smoke tests before physical-device validation.

### Acceptance criteria
- Internet sessions either connect and establish a real room or return a specific visible failure.
- Malformed frames, timeouts and disconnects cannot corrupt gameplay state.
- No UI scene is changed from an unsafe callback thread.

## Phase 15 — LAN Transport

**Priority:** P0/P1 · **Dependencies:** Phase 13.

### Work items
- [ ] Correct host startup so the host owns the local authority and never accidentally connects to itself via the ordinary client path.
- [ ] Validate bind address, port, host/guest roles, discovery, local network interface selection and join-by-address behavior.
- [ ] Implement deterministic startup/shutdown and cleanup when discovery, bind or connection fails.
- [ ] Reuse the common session, protocol and recovery path; do not create a second gameplay event pipeline for LAN.
- [ ] Add tests for host/guest lifecycle, wrong address/port, host closure, timeout and duplicate clients.

### Acceptance criteria
- LAN has one authority and known player identities, with host and guest in the same actual room.
- A failed bind/discovery/join never reports success or leaves stale listeners.
- Unsupported network configurations are reported clearly.

## Phase 16 — Bluetooth Transport or Truthful Unavailability

**Priority:** P1 · **Dependencies:** Phase 13.

### Work items
- [ ] Inspect the existing BluetoothTransport interface and wire a real Android provider for discovery, pairing, permissions and byte-stream callbacks if the repository has a viable provider path.
- [ ] Implement Android-version-specific permission requests and explicit user selection/consent.
- [ ] Reuse the same typed messages, session lifecycle and disconnect/reconnect semantics as other transports.
- [ ] If no viable provider or permissions path can be completed, disable Bluetooth selection and display a specific “unavailable on this build/device” explanation rather than fabricating success.
- [ ] Add provider-contract tests and failure-path tests for cancelled permission, cancelled pairing, device disappearance and socket loss.

### Acceptance criteria
- Bluetooth is advertised as supported only after the real provider path is verified.
- Permission denial/cancel/disconnect are recoverable and do not create ghost sessions.
- No placeholder provider can claim the room is connected.

## Phase 17 — Co-op Rules and Shared Match Lifecycle

**Priority:** P1 · **Dependencies:** phases 12–16.

### Work items
- [ ] Enforce Co-op capacity, shared seed/run rules, player membership and readiness on both server and client.
- [ ] Implement one authoritative match lifecycle: lobby, ready, playing, suspended/recovering and ended.
- [ ] Make death, revive, respawn eligibility, resource/cost rules, spectator state and action availability consistent with the chosen co-op behavior.
- [ ] Handle the final living player, a dead player's reconnect, voluntary leave and publisher departure according to explicit documented policies.
- [ ] Add tests for simultaneous death/revive, leaving/rejoining, publisher departure, match-end determination and floor transitions while another player acts.

### Acceptance criteria
- All co-op participants agree on match state, membership, alive/dead state and allowed actions.
- Death/revive/respawn and lifecycle changes are exactly-once events.
- There is no implicit local-only respawn or fake ready state.

## Phase 18 — PvP and Deathmatch Enforcement

**Priority:** P1 · **Dependencies:** phase 17 and the recovery/event rules in phases 10–12.

### Work items
- [ ] Turn PvP/Deathmatch descriptors into enforced rules: teams/target restrictions, friendly-fire policy, player limits, kill/death scoring and win condition.
- [ ] Enforce server-side visibility/FOV rules so co-op users receive needed state and competitive users do not receive hidden arena state.
- [ ] Resolve simultaneous kills, same-tick attacks, duplicate score events, player disconnect/rejoin and match end deterministically.
- [ ] Keep native Java SPD combat outcomes authoritative; the Worker validates/commits them rather than inventing damage formulas.
- [ ] Add positive and negative tests for every mode rule, score race, visibility boundary, revive/death behavior and duplicate kill/reward.

### Acceptance criteria
- PvP/Deathmatch cannot bypass target, team, score or win rules by sending a forged payload.
- All clients agree on final scores and exactly one match-end outcome.
- Hidden information follows the documented mode policy.

## Phase 19 — Survival Mode Enforcement

**Priority:** P1 · **Dependencies:** phase 17 and the shared protocol/recovery path.

### Work items
- [ ] Define and enforce Survival-specific run limits, score/progression rules, end conditions and capacity in the server/session model.
- [ ] Ensure death, continuation, spectator/respawn behavior and leaving/rejoining follow the selected Survival policy rather than inheriting accidental Co-op behavior.
- [ ] Persist and restore Survival progress and score exactly once across reconnect and authority handoff.
- [ ] Add mode-specific acceptance/rejection tests for the end condition, score changes, reconnect, publisher loss and duplicated events.

### Acceptance criteria
- Survival is either fully enforced end-to-end or disabled as unsupported; a descriptor class alone is insufficient.
- Score, progression and match end agree after reconnect/recovery.
- Mode-specific failures are visible rather than silently falling back to Co-op.

## Phase 20 — Truthful Host/Join and Setup UX

**Priority:** P1 · **Dependencies:** phases 13–19.

### Work items
- [ ] Audit TitleScene, MultiplayerTransportScene and MultiplayerSetupScene as one end-to-end flow.
- [ ] Provide clear host/join choice, room code create/join/copy, manual/discovered LAN address, Bluetooth device selection where supported, mode and capacity.
- [ ] Show connecting, session-bound, waiting for peer, syncing world, ready, starting, retrying, disconnected and match-ended states distinctly.
- [ ] Disable start/gameplay controls until the selected transport, session and native world are actually ready.
- [ ] Add UI tests or deterministic state tests for connection failures, late callbacks, duplicate taps and server rejection.

### Acceptance criteria
- First-time host/join flow is understandable without implementation knowledge.
- The UI never presents a transport connection as a playable match.
- Every advertised action leads to a real supported operation or an explicit explanation.

## Phase 21 — Localization, RTL/Layout, Navigation and Cleanup

**Priority:** P1 · **Dependencies:** Phase 20.

### Work items
- [ ] Replace hardcoded new multiplayer text with localized resource keys and verify Arabic and English resources.
- [ ] Audit Arabic RTL, long room codes, IP addresses, error messages, touch targets, safe insets, portrait/landscape and phone/tablet layouts.
- [ ] Make back/cancel/leave actions clean up transport, listeners, pending requests, timers, session membership and authority state.
- [ ] Check empty/loading/error/retry states, accessibility labels and focus order where supported by the UI framework.
- [ ] Remove fake/placeholder maps, dummy mobs, stale remote heroes and fabricated success messages from user-visible match states; show actionable failure details.

### Acceptance criteria
- UI text and states remain legible in Arabic/RTL and English on supported layouts.
- Leaving or cancelling does not leak sockets, listeners or room membership.
- No known false-success or stale-placeholder path remains in the multiplayer setup flow.

## Phase 22 — Automated End-to-End Verification and Deployed-Service Preflight

**Priority:** Final automated gate · **Dependencies:** phases 5–21.

### Work items
- [ ] Add cross-layer tests that exercise the actual Durable Object room/action lifecycle rather than only helper functions.
- [ ] Run automated multi-client scenarios for supported actions, combat, native Mob turns, items/effects, floor transitions, modes, duplicate/stale messages, reconnect gaps, authority loss and restart.
- [ ] Run backend typecheck/tests, Android JVM tests and debug APK compilation on the exact final code SHA; fix all failures and rerun.
- [ ] Verify deployment configuration and the configured Worker endpoint, then run a fresh-room service smoke test without a physical device.
- [ ] Inspect test and service logs for silent exceptions, stale actors, duplicate drops/rewards, invalid action acceptance, sequence gaps and unrecovered errors; update both project memory files and evidence links.
- [ ] Disable any transport or mode that has not passed its automated/service acceptance rather than marking it supported by implication.

### Acceptance criteria
- All automated jobs pass on the exact recorded SHA and the deployed service accepts a fresh real room/session.
- Automated cross-layer scenarios show coherent state and exactly-once outcomes through reconnect/recovery.
- The remaining gate is the user's physical-device gameplay test in Phase 23. This phase does not claim physical-device coverage.

## Phase 23 — Final Physical-Device Playtest (User-Led, Last Phase)

**Priority:** Last by design · **Owner:** user plays the game and reports actual findings · **Dependencies:** Phase 22.

### Test approach
- [ ] Install/run the exact tested app build on the available real Android device(s), and record device model, Android version, app SHA/build and Worker endpoint/version used.
- [ ] Walk through the actual gameplay matrix: create/join, movement and hazards, Mob turns/combat, pickup/drop/partial stacks, consume/equip, buffs/expiry, shop/keys/chests, floor changes, death/revive, mode rules, disconnect/reconnect and leaving.
- [ ] Test each advertised transport/mode only if Phase 22 leaves it enabled; clearly label any emulator-assisted test and do not call it a two-physical-device test.
- [ ] Record every result as scenario, expected behavior, observed behavior, reproduction steps and logs/screenshots if available.
- [ ] Return the findings to the assistant. Group them into coherent, dependency-aware **new phases 24+**, preserving the original report and implementing fixes only when the resulting phase is requested/started.
- [ ] Update this roadmap with the actual test evidence and do not mark this phase complete until the user confirms what was actually run.

### Acceptance criteria
- The user has exercised the real game and returned a documented result matrix.
- No test run, transport, device count or fix is claimed without evidence from the user or actual execution.
- Any defects become explicit new phases 24+ rather than being hidden in historical notes or silently treated as already fixed.

## Execution Rules for Future Phase Requests

- “Start Phase N” means complete **all** tasks and acceptance criteria in that phase, including its dependent fixes and tests, before reporting completion.
- These phases are deliberately bounded around coherent cross-layer outcomes, normally about 3–6 major work items. Do not split a feature arbitrarily, but do not recombine unrelated transport, gameplay, recovery or UX systems into a single oversized milestone.
- A phase is indivisible for status. If usage limits, network failure or a tool timeout interrupt work, record the exact commit/SHA, changed files, checks run, remaining unchecked items and the next precise action, then resume that same phase later. Never label an interrupted phase complete.
- Re-read the current branch head and affected code before each phase; recent implementation may already satisfy some items. Verify it, extend it, and do not duplicate it.
- Work on `multiplayer-framework-core-14118577486727081892`; never merge into `main` unless explicitly requested.
- Keep original Java/libGDX SPD behavior as the gameplay reference. Trace native action → protocol → validation/persistence → sequenced event → peer reconciliation/resync.
- Run focused automated tests as part of every implementation phase. The broad automated/service-level gate is Phase 22. Physical-device tests are reserved for Phase 23, which is led by the user.
- Update ROADMAP.md and GPT.md with durable status/risk changes. Report exact SHA and actual CI results; never infer a green run for a newer SHA.
- Phase 23 is an evidence-gathering gate. After the user returns findings, append coherent Phase 24+ follow-up work, then implement and verify each requested phase without erasing the original issue report.

## Current Audit and Verification Log

### 2026-10-26 — Dependency-based roadmap restructure

- Re-read the roadmap, project operating notes and current branch metadata. Current branch HEAD at review time was `c20ffb0730c4f8f9c82895faf93b595b7f2280e5`.
- Replaced the former ten oversized phases with a dependency-ordered 23-phase plan. Phases 1–4 remain complete; phases 5–9 isolate identity/pickup, drops, inventory actions, persistence/rewards and timed effects; phases 10–12 cover protocol, ordering and durable recovery; phases 13–16 cover session lifecycle and individual transports; phases 17–19 cover Co-op, PvP/Deathmatch and Survival; phases 20–21 cover UX; Phase 22 is automated/service preflight; Phase 23 is the user-led physical-device playtest.
- Recent branch activity already includes Phase-5-related commits for Hero buff ticks, food effects, partial stack drops and stable item claims. These must be audited against acceptance criteria instead of duplicated.
- The connector returned no commit status or workflow run for exact HEAD `c20ffb0730c4f8f9c82895faf93b595b7f2280e5`. The last previously documented green combined code tip is `ab81c507c5f1ae0b767732a7247cf7afe5afd917` with CI [39859774332](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39859774332); newer changes are not claimed tested by that run.
- No code behavior was changed as part of this roadmap review. No physical-device or deployed-service test was run here.
- Historical log entries below preserve what was recorded under the previous ten-phase numbering. They are context only; the active 23-phase index and sections above are authoritative. In those old entries, “Phase 10” as final physical-device/release gate refers to the old numbering; current Phase 22 is automated/service preflight and current Phase 23 is physical-device testing.

### 2026-10-27 — Phase 6 drops, partial stacks and floor-heap reconciliation completed

- **Tested code SHA:** `859be3d6b1aea3b3fe13802fe9298d2344162edc` (“Cover drop replay and shared-cell missile reconciliation”); exact-SHA GitHub Actions [run 40508581979](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40508581979) passed both jobs.
- **Backend:** TypeScript build passed; Vitest reported 180 tests in each mirrored `index.test.ts` / generated `index.test.js` file (360 executions, 180 mirrored source scenarios). **Android:** JVM tests and debug APK compilation passed; Gradle reported `BUILD SUCCESSFUL`.
- Hardened full/partial DROP validation across trusted inventory pre-state, exact remaining quantities, stack identity, destination heap contents and quickslot updates. Full drops preserve identity; splits use a new identity. Target-heap validation checks every item row and rejects unrelated row/heap additions, changed rows, replayed quantities and ambiguous multiple heaps at one cell.
- Native stack merging follows SPD compatibility semantics and serialized bundle changes. Missile durability merges may keep or lower resulting quantity, so quantity-only detection was replaced with bundle-aware outcome detection and bounded quantity transitions.
- Closed the enemy-target missile gap: the attack report is deferred until native `rangedHit` / `rangedMiss` and PinCushion/floor/consumption resolution finishes. The combat transaction includes source, detached projectile and result identities; server validation binds it to trusted inventory pre-state and the exact post-impact heap. PvE direct/delegated and PvP paths validate/reconcile it, including projectile + death-loot changes on the same cell.
- Added protocol declarations and regressions for full/partial drops, source/quickslot remainder, duplicate DROP replay, shared-cell heap preservation, split projectile identities, landed and durability-merged missiles, and HEAP / PIN_CUSHION / CONSUMED outcomes. Invalid/ambiguous results are rejected and trigger authoritative resync when scalar events cannot express full floor/Mob changes.
- **Limits:** no physical two-device play session and no deployed Worker end-to-end test were run. Phase 22 remains the deployed-service preflight; Phase 23 is the user-led physical-device test. The broader multiplayer project remains unfinished.
- **Next whole phase:** Phase 7 — Inventory Actions and Item Economy.

### 2026-10-26 — Phase 5 stable item identity and pickup claims completed

- Audited the latest Phase 5-related code before adding changes. Existing work for partial stack drops, native item mutations and effect ticks was retained rather than duplicated.
- Hardened native `Item`/`Heap` ID format/restore handling, duplicate/split-instance behavior tests, strict complete-snapshot heap/item identity validation, exact item-row/native-bundle matching in `WorldSnapshot`, required protocol fields, and the client-side duplicate claim guard keyed by depth + branch + heap ID + item ID.
- Added server validation requiring stable IDs on every heap and floor item and rejecting duplicate/missing/malformed identity sets before snapshot admission. Pickup and shop claims now share a transaction-backed reservation helper scoped by room (the per-room Durable Object database), depth, branch, heap ID and item ID.
- Migrated older claim tables transactionally to the branch-aware composite primary key. A legacy table without a branch column is copied to branch zero; prior claim rows are preserved.
- First CI run [40400686224](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40400686224) passed backend build/tests but revealed two new headless graphics test failures and one existing native snapshot test fixture missing required stable IDs. The tests/fixtures were corrected without relaxing production validation.
- The preceding implementation/fixture commit `40592960ac1a1ae93fda37b80adadfeb63d96cc0` passed [CI run 40401131992](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40401131992). A final test-only refinement then made the Java duplicate-ID regression use two distinct items with the same declared ID and their own matching native bundles, so the test proves the duplicate-ID rejection path itself.
- Final tested code/test SHA: `fb722732261823ab2d969ac4e5a5b706b0f53308`. Exact-SHA [CI run 40402007522](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40402007522) passed both jobs: backend TypeScript build + 346 mirrored Vitest executions, Android JVM tests and debug APK build.
- No physical-device or deployed Worker end-to-end test was performed. Phase 22 remains the automated/deployed-service gate; Phase 23 remains the user-led physical-device gameplay test.
- **Next phase:** Phase 6 — drops, partial stacks and floor heap reconciliation.

### 2026-10-21 — Synchronized phase state and execution rules

- Current branch head before this documentation refresh: d335e3917d3038bbc9043be6b18cfb9b0abd191c.
- Latest validated snapshot-consistency code: `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`; exact-SHA CI run 39655327420 passed both jobs.
- Workflow run [39557655189](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39557655189) succeeded for that exact gameplay SHA: backend TypeScript build/tests and Android JVM tests/debug APK build both passed.
- Phase 1 automated acceptance is complete, including cross-generation convergence and rollback-after-resize. Phase 2 native combat implementation/automated acceptance is complete. The whole project is not yet finished.
- Next whole phase: Phase 3, native Mob AI and Actor scheduling from one authority.
- No physical two-device run is claimed. Phase 10 must record real device/Worker test evidence.
- Repository tree contained 2,185 entries during this audit. Critical multiplayer code, native engine entry points, protocol, server tests and CI were reviewed; this is not a claim that every character of every file was manually inspected. Each file affected by a future phase must be reviewed with its callers/tests.
- Older dated checkpoints have been removed because they contradicted current verified phase status. Preserve future updates as dated entries, but never leave obsolete “current” instructions at the end of the file.


## 2026-10-21 consistency-audit update — Phase 1 re-verification

- Audit confirmed a contract mismatch: Android's `WorldSnapshot.validateForRestore()` rejects duplicate tile/entity-map positions and requires the native Mob AI/scheduler fields, but the Worker full-snapshot admission function did not consistently enforce the same checks before persisting a `LEVEL_DATA` replacement.
- Updated `server/src/index.ts` to reject duplicate/out-of-range tile and exploration cells, duplicate heap/trap/plant positions, duplicate Mob IDs/positions/stable IDs, duplicate blob classes, malformed native heap/trap/plant values, and incomplete native Mob runtime fields before persistence.
- Added corresponding negative tests in `server/src/index.test.ts` and aligned `protocol/schema.json` so the Mob AI/scheduler fields captured by the native exporter are required in full snapshots.
- Source commits: [1a5d4c5](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/commit/1a5d4c537ee3c2e8b6da88c126310e1499ff42c), [39f7441](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/commit/39f7441b39874988b3b4293defc48f65ec4745cf), and [81ed967](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/commit/81ed967088aedbfc1bcc65773a8cb5dd0774c087).
- Exact-SHA workflow [39654793671](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39654793671) was superseded by subsequent fixes and CI run 39655327420, which passed both jobs on the final Phase 1 code SHA.
- No physical two-device run is claimed. This audit and CI do not replace Phase 10 live-device release verification.


## 2026-10-21 Phase 1 completion verification — consistency fixes green

- Completed the cross-layer audit that exposed Worker/Android disagreement on full native snapshots.
- `server/src/index.ts` now rejects duplicate/out-of-range tile and exploration cells, duplicate Mob local IDs/positions/stable IDs, duplicate heap/trap/plant positions, duplicate blob classes, malformed native object metadata and incomplete full-snapshot Mob runtime state before SQL persistence. Shared validation also requires numeric version/dimensions/depth/branch/seed/entrance/exit and in-bounds entrance/exit cells; it no longer accepts numeric strings for dimensions.
- `server/src/index.test.ts` adds negative tests for these invalid cases. A first CI run exposed a test fixture missing `defenseSkill`; the fixture was corrected rather than weakening validation. Follow-up exact-SHA run is green.
- `protocol/schema.json` now marks the Mob AI/scheduler state required by the full native snapshot as required contract fields.
- Final code SHA: `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`. Exact-SHA CI [39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) succeeded for both `Backend typecheck and tests` and `Android debug APK compile`.
- Phase 1 is complete for implementation and automated acceptance. No physical two-device session was performed; real-device/network release verification remains under Phase 10.


## 2026-10-21 Phase 2 re-audit — native combat replication

- User correctly asked where Phase 2 was. The roadmap already described Phase 2 as native SPD combat replication, but its status was not tied to the latest branch verification. Re-read the full Phase 2 acceptance scope and the current Java runtime tests, Worker validation tests, native combat protocol definitions, and CI workflow on branch `multiplayer-framework-core-14118577486727081892`.
- Native runtime integration suite contains 28 tests, including publisher-only shared Actor turns; actual native hit/miss/zero-damage/shield-only outcomes; retaliation and attacker post-state; blessed Ankh; delegated kill XP; Mob-to-player and periodic Mob damage; target-owner PvP/Ankh; secondary-Mob effects and stable-ID/full-bundle deltas; authoritative death removal without replica loot; untrusted reactive damage resync; stale-event protection; and cross-client Actor-ID convergence.
- Backend suite contains 107 tests overall, with explicit combat acceptance/rejection cases for HP/damage consistency, forged healing, finite/ranged values, authority ownership, target geometry, stale pre-state, stable identity, buffs/shields, Ankh inventory/HP, replay/collision protection, secondary Mob state, loot and exactly-once persistence.
- `protocol/schema.json` defines native attack, combat outcome, Mob damage, blessed/unblessed Ankh revival, periodic/environment damage, and complete native Mob/level snapshot contracts.
- Current branch head at re-audit: `0a88887fa01bed79bc317f28d73692c5192b78da`. [CI run 39656587836](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39656587836) passed both required jobs: Backend typecheck and tests; Android debug APK compile (including JVM tests).
- Conclusion: Phase 2 already had its required implementation and automated acceptance; no duplicate implementation was added merely to create activity. Its phase status and verification evidence are now explicit and current. The physical two-device test is intentionally not claimed and remains a Phase 10 release gate.
- At this historical Phase 2 re-audit, Phase 3 was next. Its completion and the current next phase (Phase 4) are recorded above. Keep phase numbering fixed: Phase 1 = snapshots/restoration; Phase 2 = native combat; Phase 3 = Mob AI/Actor scheduler.

## 2026-10-22 Phase 4 completion verification — native movement and floor/world interactions

- Tested code SHA: `c0c231a501bb2996f261e7e9e4e5d66e4136d70b`. Exact-SHA GitHub Actions [run 39850368287](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39850368287) completed successfully: backend TypeScript build and Vitest passed, Android JVM tests and debug APK compilation passed.
- Fixed the native pit-fall gap end-to-end. SPD calls `Chasm.heroFall()` before entering a pit cell, so it cannot be represented as an ordinary MOVE. The publisher now submits a validated FALL intent; peers replay the native Chasm/InterlevelScene path without emitting a duplicate intent; the server admits a complete destination snapshot only if the Hero landing is safe.
- Multiplayer `Level.fallCell()` now selects the same safe destination cell from the generated destination seed and shared source Hero cell. The server requires that landing to be passable, non-solid, non-pit, and free of traps/Mobs; every connected living peer must report the same landing, depth, branch and seed before the atomic commit.
- Added a strict single-transition admission gate and a dedicated test for pending transitions, dead initiators, and missing active publisher. Existing regular stair validation continues independently of FALL-only terrain fields.
- Verified server suite: 242 successful Vitest executions across TypeScript plus the generated JavaScript counterpart (121 mirrored source cases). Verified Android suite: the JVM tests and debug APK compile passed; `NativeCombatRuntimeIntegrationTest` has 37 methods after the deterministic safe-fall regression.
- Existing action-bound native mutation checks remain in place for movement, doors and keys, chest opening, mining, barricades/destructible terrain, secret interactions, wells, plants, traps and eligible NPC interactions. Branch-zero support is explicit; unsupported branches are rejected rather than locally diverging.
- Limit: no physical two-device session or deployed Worker end-to-end test was run here. Keep the live transition/door/reconnect matrix as a Phase 10 release gate. Phase 4 is complete for implementation and automated acceptance; this is not a claim that final release verification is complete.

### 2026-10-28 — Resumed Phase 6 and verified current branch state

- Re-read `GPT.md`, the authoritative Phase 6 scope, the drop/partial-stack/projectile implementation and its Worker/Android tests. The live branch was already beyond the earlier saved checkpoint: Phase 6 was marked complete on `859be3d6b1aea3b3fe13802fe9298d2344162edc`, and later commits had started Phase 7 inventory-economy work.
- Verified branch HEAD `99d4d6e4fdf4aab7487f68b7b13321f1a4e81ea5` and its exact-HEAD workflow [40515866931](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40515866931). Backend TypeScript build passed, 380 Vitest executions passed across mirrored TS/JS files (not 380 unique source scenarios), and Android JVM tests/debug APK compilation passed (`BUILD SUCCESSFUL`).
- Confirmed the current source still has the Phase 6 stable identity and heap-delta validation, the full/partial DROP checks, and the deferred native projectile-impact path for HEAP / PinCushion / consumed outcomes. No duplicate Phase 6 implementation was added because the existing phase is already complete and its regressions pass on the later branch tip.
- No deployed Worker end-to-end test or physical-device match was run. Those remain Phase 22 and Phase 23 respectively. Phase 7 is the next phase and already has partial code on the branch, but stays open until its complete scope is audited and accepted.


### 2026-10-28 — Phase 6 resumption and latest-head CI recovery

- The actual branch had already completed Phase 6 for implementation and automated acceptance. No duplicate DROP/heap/projectile implementation was added. Its code and regression coverage remain in the current tip.
- Repaired `MultiplayerActionDispatcher.java` after CI identified an invalidly escaped JSON literal for native mining's `sourceTerrain` field in commit `3ce9ece02165a0aed8d4097404849930fcb2609c`. Fix commit: `1e9087d8ec02f04879853fc10c2d6748070f1fe1`.
- Exact-HEAD workflow [40729427066](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40729427066) passed both Backend typecheck/tests and Android JVM tests/debug APK compile. No deployed Worker or physical-device test was performed.
- Phase 7 remains open. The next task is a full inventory-action/economy audit against every Phase 7 work item and acceptance criterion, not another Phase 6 implementation pass.


### 2026-10-29 — Phase 6 continuation audit and exact-HEAD regression recovery

- Re-read the current branch’s operating notes and Phase 6 scope, then traced the existing native DROP, stable-heap reconciliation, and missile impact paths across Java, protocol/server validation and regression tests.
- Confirmed Phase 6 was already implemented and met automated acceptance on this branch; no duplicate implementation was added. Existing coverage checks full/partial drops, split/full ID behavior, stack merges, quickslots, shared-cell floor items, replay/ambiguous mutation rejection, and missile HEAP / PIN_CUSHION / CONSUMED outcomes.
- The latest prior HEAD had two mirrored failures in Phase 7’s mining-buff regression. Fixed the argument boundary in `server/src/index.ts`: the unchanged-buff validator now receives the original serialized JSON values rather than parsed objects. Commit: `9c2bf9c520a7f18067a331e14461ff2eefb9b8a6`.
- Exact-HEAD CI [40909964645](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40909964645) passed backend TypeScript build and tests plus Android JVM tests/debug APK compile. Both mirrored backend test files passed 203 tests each; Android ended with `BUILD SUCCESSFUL in 54s`.
- Phase 7 remains open. No deployed Worker end-to-end test or physical-device match was performed; these remain Phase 22 and Phase 23.



### 2026-10-29 — Phase 7 inventory action-cost binding and audited scope

- Added a server-side acceptance check tying the trusted native Hero cooldown delta to the same action cost recorded in the accepted world-time transaction, restricted to native-mutation-lock actions. Added positive/negative unit regressions.
- Code commit [3291bfb](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/commit/3291bfbca20d540aeab8b323c93d2633c473ef4e) passed exact-HEAD workflow [40927978622](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40927978622): backend build/tests and Android JVM tests/debug APK compilation all succeeded. Vitest reported 205 tests in each mirrored TypeScript/JavaScript output (410 executions, not 410 unique scenarios).
- Phase 7 stays **OPEN**: item-action coverage is not yet complete; scroll `READ`, wand `ZAP`, and Shopkeeper buyback remain fail-closed. Continue the end-to-end audit against every Phase 7 acceptance criterion. No deployed Worker or physical two-device verification was performed; Phase 22 and Phase 23 stay open.


### 2026-10-29 — Phase 7 native consumable clock reconciliation

- Audited the original native scheduling contract. `Actor.storeInBundle` includes `Hero.time`, while native item consumption advances Hero time/cooldown. Server validation now permits the native combat-bundle time change only when it matches the trusted-to-reported cooldown delta, and timed `Haste`, `Invisibility`, and `Levitation` buff expiration times must match their remaining cooldown against the same actor clock.
- Positive/negative tests now cover native clock advancement, mismatched cooldown/time, missing clock data, forged timed-buff schedules, and overlong effects. Intermediate CI [40928973468](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40928973468) exposed a missing schedule check in a new negative test; follow-up commit [e4f57ad](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/commit/e4f57ad0d65f9857a346a67879db6182631897d2) implemented the check. Exact-HEAD CI [40929166097](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40929166097) then passed both backend and Android jobs.
- Backend tests: 206 tests in each mirrored TypeScript/JavaScript output (412 reported executions, not 412 unique cases); Android JVM tests and debug APK compilation succeeded. Phase 7 remains **OPEN**: native scroll `READ`, wand `ZAP`, and Shopkeeper buyback are still fail-closed, and remaining item-action/economy acceptance criteria have not all been completed. No deployed Worker or physical two-device validation was run; Phase 22 and Phase 23 remain open.


### 2026-10-30 — Phase 7 completed

- Completed all Phase 7 work items and acceptance criteria. Enabled actions use original native SPD results; server validation binds trusted pre-state, action cost, item identity, inventory/economy/quickslot changes, floor deltas and replay/claim state. Unsupported or ambiguous effects fail closed with visible rejection/resync.
- Final side-effect audit closed Ring identification, unsafe potion side effects, LostBackpack restoration and tipped-dart merge-generated extras through client preflight, Worker validation and positive/negative regressions.
- Exact tested gameplay SHA `744b78cebfae17609dd2b7d43e9d19bd42774056`; exact-HEAD CI [41112954455](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41112954455): schema valid, backend build and 456 tests passed, Android JVM tests and APK compile passed.
- Phase 7 is complete for implementation and automated acceptance. Phase 8 is next. No deployed Worker or physical-device test was performed; Phases 22 and 23 remain open.


## Non-gameplay Source Refactor — Three Stages (2026-11-08)

This is a separate source-organization effort. It does not create, renumber, close, or change any of the 23 gameplay phases above.

### User-preservation contract

- Every original top-level implementation element in `server/src/index.ts` must be moved intact to its new owner or remain in the entry file until its scheduled stage. Do not drop validators, helpers, comments, branches, storage operations, event paths, or Worker behavior.
- Moves may add the exports/imports required for module boundaries, but must not weaken, replace, simplify, stub, duplicate, or silently remove existing behavior.
- `index.ts` remains the official Worker/Durable Object module entry and compatibility facade. Preserve the historical public exports unless a future explicit decision authorizes a migration.
- `Hero.java`, `Mob.java`, and `WorldSnapshot.java` are explicitly out of scope for splitting and must remain unchanged.
- Inspect all affected server tests, Java/client callers, protocol/schema definitions, Wrangler settings, build configuration, and docs after each move. Java changes are only justified by a demonstrated cross-layer contract impact.

### Stage 1 — protocol types, pure validators and deterministic helpers

Move the original type/helper/validator declarations and `SeededRNG` into focused `protocol/`, `validators/`, and `util/` modules. Keep the `MatchRoom` implementation in its single class module and the Worker default handler in its own router module; preserve every original named export through `index.ts` so current tests and consumers do not need import-path changes. Do not change gameplay or wire behavior.

**State:** complete for Stage 1 extraction and automated acceptance. Exact-HEAD source commit `4119263d9cc4dd5b230c551897b37dc4391417cf`; [CI run 42479978278](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42479978278) passed backend TypeScript build/tests and Android JVM tests/debug APK compile.

### Stage 2 — MatchRoom decomposition

Extract the Durable Object's storage/repository operations, lifecycle/snapshot helpers, and protocol/action handlers into cohesive modules. Keep one authoritative MatchRoom class export and preserve the Cloudflare binding name `MATCH_ROOM`, class name `MatchRoom`, existing migration history, SQL behavior, WebSocket attachment/session semantics, sequencing, replay protection, and event payloads. Establish explicit context interfaces instead of copying state or introducing parallel owners.

**State:** complete for source extraction and automated acceptance. Verified source SHA `237577f1e8c68a3f052b36fcac64cd7efc07918d`; [exact-HEAD CI run 42483052104](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42483052104) passed Backend typecheck/tests and Android JVM tests/debug APK compile. The root Worker entry remains stable, and the final named Durable Object export remains `MatchRoom`.

### Stage 3 — Worker entry, integration and parity audit

- Moved the original default Worker request handler intact into `server/src/worker.ts`; `server/src/index.ts` remains the unchanged Wrangler `main` and now re-exports the default handler alongside the historical named API and `MatchRoom`.
- Added `server/src/entrypoint.test.ts` for room-code resolution, exact Request forwarding, `DEFAULT_ROOM` fallback, the non-room information response and the root `MatchRoom` export.
- Reconciled all 200 original pre-`MatchRoom` top-level declarations against their 15 destination modules using normalized declaration-text comparisons: 200/200 matched, with no body-text differences. Verified all 118 original validator/protocol/helper exports and the named `MatchRoom` export remain available (119 named exports total).
- Verified the single `MatchRoom` class definition and the seven-module shared-instance inheritance chain; checked the root Worker route, Wrangler `main`, `MATCH_ROOM` binding, class name and `v1` SQLite migration.
- Confirmed `protocol/schema.json` and the protected Java files `Hero.java`, `Mob.java`, and `WorldSnapshot.java` are unchanged. Existing validator tests continue to import `./index`.
- **Exact-HEAD acceptance:** [GitHub Actions run 42486485451](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42486485451) passed on `a513327caf7e500d8416befae8c04a984a4bbc18`: Backend typecheck/build/full tests and Android JVM/debug-APK jobs both succeeded.
- **State:** Stage 3 is complete for implementation, source parity and automated acceptance. This is not live Worker deployment or physical-device verification.

### Stage completion gate

A stage is complete only when all moved source is accounted for, no original behavior has been omitted, all dependent files/docs are updated, backend build/tests and required Android CI pass at the exact final commit, and the resulting module tree/import graph has been inspected. A failed check keeps the current stage open.
