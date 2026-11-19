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
| 9 | Native buffs and timed effects | Complete for implementation and automated acceptance; unsupported branches explicitly fail-closed |
| 10 | Canonical protocol schema and one typed event path | Complete for implementation and automated acceptance (2026-11-14) |
| 11 | Event ordering, replay protection and resynchronization | Complete for implementation and automated acceptance |
| 12 | Durable recovery, reconnect and authority handoff | Complete for implementation and automated acceptance; deployment/device checks remain later gates |
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

### Phase 11-B closeout — 2026-11-15 (implementation and exact-head CI verified)

- **Repository / only working branch:** `majd7772233-a11y/shattered-pixel-dungeon-ar` / `multiplayer-framework-core-14118577486727081892`.
- **Phase 11-A role:** historical characterization tests remain as regression guards; their old "gap accepted" assertions are superseded by Phase 11-B tests and current source behavior.
- **Code/test HEAD:** `2574489ff25e6f1fedc1e21718161bc5a7a1b230`; exact-head CI [43731016036 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036).
- **Phase 11-B code/test SHA:** `2574489ff25e6f1fedc1e21718161bc5a7a1b230`; exact-head CI [run 43731016036 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036).
- **Android event application:** EVENT_BATCH rows are validated and normalized before application; exact duplicate sequences are applied once, conflicting duplicates reject, rows are sorted into ascending order and must form the complete contiguous range beginning at the last applied sequence + 1. The envelope sequence must match the batch tail. Gaps, malformed rows or invalid application request full recovery without advancing the applied watermark. Per-event rollback baselines protect the live native world; applied sequence commits only after successful application. EVENT_SKIPPED consumes its valid sequence without changing the world. Stale snapshots are rejected before live restore.
- **Worker request identity:** processed_actions stores canonical request fingerprints and delegated-completion identity. Exact retries from the same player with equivalent payloads replay the recorded result; reuse by another player or with different action/payload is rejected as REQUEST_ID_CONFLICT. Object-key ordering does not change a canonical fingerprint. Legacy processed-action rows are retained through idempotent column migration.
- **Atomic ACTION boundary:** the covered Durable Object ACTION path uses transactionSync. Persistent state/claims, processed-action receipt, event, sequence and world-time changes roll back together on failure. Success ACKs and broadcasts are held until commit; the transaction path fails closed when synchronous transactions are unavailable.
- **Recovery policy:** reconnect replays only a complete contiguous retained range of at most 50 events for an eligible non-current publisher; otherwise the server sends a full SNAPSHOT. RESYNC remains a full-SNAPSHOT path.
- **CI:** Backend TypeScript build and 10 Vitest files / 740 reported executions passed; Android JVM tests and Debug APK compilation passed; Durable Object runtime SQLite integration passed 4/4. The 740 count includes mirrored/generated TS/JS executions and is not a count of unique source scenarios.
- **Boundary:** 25 canonical message values and 23 action values remain unchanged; no protocol schema expansion or native SPD gameplay formula change is claimed. No production Worker deployment or physical two-device session is claimed.
- **Phase status:** Phases 1-13 are CLOSED for implementation and automated acceptance within their documented support boundaries. Phase 13 delivered lifecycle-v1 room authority, in-game lobby, validated server roster, render-thread message routing, native gameplay gate, abrupt owner-loss handoff, all-member readiness-proof invalidation and authenticated former-owner resume with credential rotation and roster replacement. Local evidence: backend 372 unique TypeScript source scenarios / 744 reported Vitest executions; Durable Object SQLite 17/17; Android core JVM 141/141; full Debug APK build PASS. Exact-head GitHub Actions run 1272 [https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44149425355] passed Backend, Android and Durable Object SQLite on fbf46ef15a1ec4554710a43894cfa4969c3176a7. Emulator-visible host/join/lobby acceptance is deferred to Phase 20 and RTL/touch/layout review to Phase 21. Production Worker deployment remains Phase 22; physical-device playtesting remains Phase 23.

### Current Phase 14-A checkpoint — 2026-11-18 (CLOSED; aggregate SNAPSHOT cap, atomic preflight and all local suites PASS)

- **Repository / only working branch:** majd7772233-a11y/shattered-pixel-dungeon-ar / `multiplayer-framework-core-14118577486727081892`.
- **Phase status:** Phase 14-A is CLOSED. Parent Phase 14 remains OPEN; Phase 14-B1 is closed with exact-head CI and 14-B2 render-thread dispatch is closed with exact-head Actions run 44487454618 (3/3) on `11b5c79d207e21798ff7e441744cb422a43e4d8c`. Android network/background lifecycle and live Worker smoke remain.
- **Aggregate snapshot contract:** Android's existing frame ceiling remains 16,777,216 bytes. Server full-SNAPSHOT maximum is **15.5 MiB / 16,252,928 UTF-8 bytes**, 512 KiB below Android. Nested payload JSON is measured before serialization and the full escaped envelope is measured before sending.
- **Atomic rejection:** LEVEL_DATA, ACTION, JOIN_ROOM, READY, MATCH_START and projected floor transitions preflight the resulting snapshot before SQLite commit or authoritative floor mutation. Initial WebSocket handshakes and authenticated reconnects preflight before token rotation/connection acceptance and return HTTP 413 on oversize. Over-budget states return `SNAPSHOT_TOO_LARGE`; they are not committed or silently truncated. RECONNECT/RESYNC and room-resume failures surface explicit size errors.
- **Single canonical serializer:** all production full-SNAPSHOT paths use `MatchRoomSnapshots.buildSnapshotMessage`; lifecycle-v1 snapshots include only connected durable room members. Incoming text frames above 16 MiB UTF-8 are rejected before JSON.parse.
- **Replay evidence:** send newest 200 replay events in ascending order; retain all SQLite rows including LifeLink proof evidence. Regression: 515 stored rows remain while RESYNC sends 200.
- **Local backend:** `npm test` — all schema/routing guards and **380 Vitest tests / 6 files passed**. `npm run build` / TypeScript passed; `noEmit:true` avoids compiler-generated JS in the TS source tree.
- **Real Durable Object:** Cloudflare Workers + SQLite integration **17/17 passed**.
- **Local Android/JVM:** full `gradlew.bat test assembleDebug` — **BUILD SUCCESSFUL**, 57 tasks; 11 core JUnit reports / **159 tests / 0 failures / 0 errors / 0 skipped**. Debug APK 36,949,480 bytes; SHA-256 `A05D0A2B1FE4A0C8AD36402935594E548222CCF533939DE7DF9355836BE5190C`.
- **Maximum-collection fixture:** 100×100 cells, 512 mobs, 10,000 heaps/traps/plants/visited/mapped positions, four players and 2,060 stored DB rows. Measured: inner native level JSON **13,631,699 bytes**; complete LEVEL_DATA **14,613,062 bytes**; complete SNAPSHOT **15,664,067 bytes**. This is 588,861 bytes below server cap and 1,113,149 bytes below Android cap.
- **Byte-boundary tests:** exact 15.5 MiB accepted; one more byte rejected; nested oversize rejected before serialization; exact UTF-8/JSON parity verified for Arabic, accents, emoji, lone surrogates and controls.
- **Exact-head CI:** commit `0f0d84e24ecbdc3253ae17d6a2d613c4513cac28` passed all three required jobs in [Actions run 1285 / 44353955443](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44353955443): Backend typecheck/tests, Android Debug APK compile and Durable Object SQLite rollback/eviction.
- **Not claimed:** no production Worker deployment, live hosted room/session smoke, emulator UI run, or physical-device match. Those remain outside 14-A.
- **14-B:** IN PROGRESS. 14-B1 callback/transport lifecycle safety has exact-head CI acceptance. 14-B2 generation-safe render-thread dispatch is CLOSED with exact-head CI run 44487454618 (3/3). Next bounded slice is Android network/background lifecycle and service-level Worker smoke (14-B3).

### Historical Phase 10-C continuation checkpoint — 2026-11-14 (superseded by Phase 10-D/10-E and formal Phase 10 closeout)

- Repository/only working branch: majd7772233-a11y/shattered-pixel-dungeon-ar / multiplayer-framework-core-14118577486727081892.
- Live code/test HEAD audited for Phase 10-C: 2d9a36d6c90ae95a91e6d08dca7a5bc4861c7fa5; this is newer than the user-supplied c8998912005e458fac7a8776618b073f33f4d642. Do not reset to the older checkpoint.
- Exact-HEAD CI [43512831773 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43512831773): Backend typecheck/build + 10 Vitest files / 708 executions; Android JVM tests/Debug APK; three Durable Object SQLite integration tests — all passed.
- Phase 10-A: canonical 25-message / 23-action enum and version parity complete at d8938190960af64d6efc70f4625a7411bfa3b7de, CI [43485367695](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43485367695).
- Phase 10-B: 25-message/23-action route inventory, eight actual Worker ingress types versus 17 known non-inbound types, fail-closed Worker ingress and static/test guards complete at d16be138d74bb9930777f5352efbeae3291070c6, CI [43494769215](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43494769215).
- Phase 10-C: Android envelope/parser parity, transport-scoped legacy envelope compatibility, fail-closed HeroAction mapping, and behavior-specific MessageRouter/RemotePlayerActionReceiver tests are complete at the audited code/test HEAD above; exact-head CI passed.
- At the time of this historical checkpoint, Phase 10 remained OPEN and 10-D was next. The subsequent 10-D and 10-E slices completed the remaining accepted route/payload inventory scope; the current CLOSED state is recorded in the active Phase 10 checkpoint below. Do not infer that 10-D is still next.
- RemotePlayerActionReceiver remains present and unchanged; PLAYER_LEFT still performs required Actor/Mob-target/Buff/sprite cleanup. Do not remove/move it without dedicated equivalence tests for each behavior being migrated.
- No deployed production Worker smoke test or physical two-device match is claimed. These remain Phases 22–23.


### Historical continuation checkpoint — 2026-11-09 (superseded by 2026-11-13)

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
- **Historical remaining Phase 9 work at the 2026-11-09 checkpoint only (superseded by the 2026-11-13 closeout):** real Durable Object/SQLite integration, crash/restart/authority handoff, XP level-up/item callbacks, Monk talent/ability variants, RemoteHero links, reconnect/expiry edges, more consumables and overlapping DOT/HoT/shield/detach callbacks, malformed/replay/resync. These were subsequently implemented and tested where included in the accepted Phase 9 scope, or explicitly retained as fail-closed exclusions. This is not current Phase 9 backlog. No live Worker smoke test or physical two-device match was claimed at that historical checkpoint.


### Historical continuation checkpoint — 2026-10-31 (superseded by 2026-11-09)

- **Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`.
- **Working branch:** `multiplayer-framework-core-14118577486727081892`; never merge to `main` unless the user asks.
- **Latest tested gameplay code/test SHA:** `d1c2f180f29846ce16d20c010a38805754b9b70f`. Exact-SHA CI [41240428476](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41240428476) passed Backend typecheck/tests and Android JVM tests/debug APK compilation.
- **Phase 8:** complete for implementation and automated acceptance on `e36bc8030755050e3eae3d45ccab4db1040a65f5`; [CI 41230208577](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41230208577) passed 472/472 Vitest tests, Java tests and Android debug APK compilation.
- **Phase 9 status at this 2026-10-31 historical checkpoint:** in progress and not complete at that time. Its implementation/verification commits were: `4f383d560d728c25a9894dc80e498f8954732098` ([CI 41240321050](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41240321050)) and `d1c2f180f29846ce16d20c010a38805754b9b70f` ([CI 41240428476](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41240428476)); both exact-SHA workflows passed.
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
- At the time of this 2026-10 Phase 3 checkpoint, Phase 4 was next. Its implementation and automated acceptance are recorded in the 2026-10-22 Phase 4 verification entry below; Phase 5 was next at that historical point. Phase 9 publisher-disconnect/authority handoff was still pending then and was completed in the 2026-11-13 Phase 9 closeout.

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
- At the time of this 2026-10-22 Phase 4 verification, Phase 5 was next; Phase 9 publisher handoff and the then-planned release verification were pending. Publisher handoff was completed under Phase 9 on 2026-11-13; deployed-service and physical-device checks are now tracked by Phases 22–23.

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

## Phase 9 — Native buffs, timed effects and native effect reconciliation

**Status: COMPLETE for implementation and automated acceptance on 2026-11-13.** Gameplay/test baseline: `bc6c46b03fee040ff20311adb473b19ff78e9bb7`; exact code/test CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588). Backend (682 executions/8 files), Android JVM/Debug APK and three real Durable Object SQLite Workers-runtime tests passed. The explicit exclusions below are tested fail-closed, not partially enabled.

### Completed work
- [x] Original Java/libGDX SPD remains authoritative for every enabled calculation; TypeScript validates native results and does not recreate RNG/combat/Buff/Mob AI/scheduler formulas.
- [x] Supported Hero/Mob Buff ticks, timers/cooldowns, actor clocks, HP/HT, shields, Buff rows and source-specific side effects are validated against trusted pre-state and native post-state.
- [x] Poison LifeLink batching includes every linked Mob delta and Hero outcome in one request, including lethal Hero death. Stable Mob IDs, death tombstones, reward evidence and allowed loot cells are validated.
- [x] Supported Hero Buff ticks and Poison/LifeLink paths commit atomically; SQL/snapshot/replay/event/sequence roll back together. In-memory sequence/world-time restore on failure; ACK/FOV/room broadcasts happen only after commit.
- [x] Transaction errors are correlated with request ID/sequence; Android clears pending actions and requests RESYNC. Failed transactions cannot leak accepted events or partial state.
- [x] Tests cover Poison/Barrier, ShieldBuff priority, Healing+Barrier concurrency, Hunger/WellFed, Drowsy/MagicalSleep, Haste, Amok, Terror, Dread, SnipersMark expiry, concurrent timers, approved Wand.Charger/Recharging, food/potion/scroll effects and native reward receipts.
- [x] XP/reward and Monk boundaries are validated: exact non-level-up XP and bounded base MonkEnergy are accepted; level-up/item callbacks and unsupported Monk bonuses are rejected.
- [x] SpiritArrow 9-C is complete: strict Bow/mark/stable-target intent, publisher reservation/COMBAT_REQUEST, native Java result, atomic commit, correlated failure/rollback, sequenced EVENT_BATCH and stable-identity requester reconciliation. JVM tests cover headless callback/cancel and clients with different local Mob IDs.
- [x] Level Publisher handoff is durable/generation-based. Valid replacement requires persisted state; pending combat closes; clients receive handoff and persisted snapshot.
- [x] Lossless rebase validates shared Mob IDs/bundles, fresh local Hero/RemoteHero/Mob Actor IDs and exact LifeLink/SnipersMark target identity before shared actions resume.
- [x] Workers runtime exercises real Durable Object SQLite rollback, replay, eviction/reconstruction and publisher handoff.
- [x] Malformed/oversized payload, forged identity/position, stale generation, replay, duplicate request, pending-lock expiry and non-publisher authority violations have regression coverage.
- [x] Exact-head Backend build/tests, Android JVM/Debug APK and Workers-runtime SQLite jobs passed.

### Explicitly unsupported and fail-closed
The following are rejected before persistence and are not claimed as playable multiplayer effects:
- XP level-ups, including `Hero.updateHT()` and `onHeroGainExp` item callbacks.
- Monk Unencumbered Spirit and UnarmedAbilityTracker callback/bonus paths beyond verified base MonkEnergy.
- RemoteHero/player LifeLink and cross-device local Buff references that cannot be rebound to the same stable Mob.
- Unapproved scroll READ, generic Wand ZAP, unsupported consumable/Buff callbacks.
- SpiritArrow SPEED volleys and non-Mob targets.

### Exact-head verification
| Job | Result |
|---|---|
| Backend typecheck + tests | Passed; 8 files, 682 reported executions (mirrored TS/JS) |
| Android JVM + Debug APK | Passed; `./gradlew test assembleDebug --no-daemon`, `BUILD SUCCESSFUL` |
| Real Durable Object SQLite | Passed; 3 Workers-runtime integration tests |

### Closeout audit — 2026-11-13

The final Phase 9 audit matched enabled native effect paths to Worker validators, durable SQL transactions, sequenced client reconciliation, publisher handoff/rebase and regression coverage. Unsupported branches listed above are tested fail-closed rather than represented as supported multiplayer effects. No gameplay source change was needed during this final documentation reconciliation.

### Revalidation audit — 2026-11-14

Phase 9 was rechecked against the live Java publishers/native callbacks, Worker validators and transaction boundaries, JVM integration tests, Backend tests and Durable Object SQLite runtime suite. The 11 completed-work items above remain satisfied; there is no unchecked Phase 9 work item. The unsupported cases remain deliberate fail-closed exclusions, not unfinished acceptance criteria. The SpiritArrow publisher result/requester reconciliation and durable publisher handoff/rebase are implemented and tested. Several technical-reference sentences still described those completed behaviors as open Phase 9 work; those documentation contradictions are corrected in the same revalidation commit. No Phase 9 Java/Worker behavior or test was changed because no missing Phase 9 implementation was found.

Verification basis: Phase 9 implementation/test baseline `bc6c46b03fee040ff20311adb473b19ff78e9bb7` passed exact code CI [43472587588](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588). The live branch tip before this revalidation is `11baec7ad870f666b61424a2638220355f4113cb`, whose exact-head CI [43611989142](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43611989142) also passed all three jobs, including the Phase 9 regressions in the current test suite.

Production deployment and physical-device playtest remain Phases 22 and 23, not Phase 9 claims.

## Phase 10 — Canonical Protocol Schema and One Typed Event Path

### Current Phase 10 checkpoint — 2026-11-14 — CLOSED

**Status: Complete for implementation and automated acceptance on the authorized branch.** Phase 10-A through 10-E are closed at exact code/test SHA f2d79038d1e420461be7a1956471324de5c1ef74; matching CI [43618725089 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43618725089).

- **Canonical vocabulary and ingress:** all 25 outer message values and 23 action values remain in exact Java/schema order; the Worker admits exactly eight implemented client inputs, classifies 17 known non-inbound values, and retains fail-closed unknown/unsupported admission.
- **Android routing:** MessageRouter has exactly one explicit route decision for every one of the 25 canonical MessageType values. PLAYER_JOINED, PLAYER_LEFT, READY and PING have typed handling; CHAT is deliberately consumed without a game-state side effect because Android has no chat surface. Client-to-Worker and declared placeholder types are explicit non-inbound/no-op decisions, not falsely advertised as server events. The general default-to-RemotePlayerActionReceiver fallback is gone.
- **Join/readiness correctness:** PLAYER_JOINED verifies senderId against payload playerId and a finite integral in-level position, creates/reuses one RemoteHero actor and updates duplicates without replacing it. READY validates sender identity/state and updates RemotePlayer.isReady; successful SNAPSHOT restoration reapplies persisted player readiness. Native sprite construction occurs synchronously only on the render thread and only when a GameScene exists.
- **ACTION contract:** schema now defines the outer ACTION inner envelope and 23 action-specific data-field inventories. The maintained protocol/action-data-contracts.json inventory links each action to its Worker handler/validators and native Java producer evidence. It inventories 361 Worker-consumed field names: 346 are source-referenced in the listed Java producer files and 15 are Worker-only. This static name-presence check does not prove that every field is serialized on every runtime branch; Worker validators remain authoritative for actual types and requiredness. The 18 required NativeLevelSnapshot fields are checked against the Java wire model and the Worker completeness validator.
- **Explicit non-emitted actions:** WAIT and USE_ABILITY remain named Worker/schema actions but have no Android native producer/bridge mapping; both remain fail-closed. CHAT likewise remains explicitly non-routed until a client chat surface exists. These are declared support boundaries, not silently fabricated behavior.
- **Regression coverage:** NativeCombatRuntimeIntegrationTest.java now has 67 @Test methods; NetworkProtocolParityTest.java has 15. New tests cover PLAYER_JOINED, duplicate join, sender-identity mismatch, READY true/false, control-message non-routing and SNAPSHOT readiness restoration.
- **Automated guard integration:** ordinary npm test runs the Phase 10 routing and action-payload static guards before Vitest. CI output reports 25 explicit Android message routes, 23 action contracts, 361 action data fields and 18 snapshot-required fields.
- **Exact-head CI:** Backend TypeScript build; six static guards; 10 Vitest files / 708 executions; Android JVM tests and Debug APK (BUILD SUCCESSFUL); and three Durable Object SQLite integration tests all passed.
- **Scope protection:** no Worker producer, inbound route, validator behavior, SQL/persistence, event ordering, sequence/replay/resync algorithm or native SPD gameplay formula was changed. No Phase 11 source/test work was started.
- **Evidence limits:** CI is local/automated evidence. No production Worker deployment smoke test or physical two-device session is claimed; those remain Phases 22–23.

**Gate:** Phase 10's dependency for Phase 11 is now satisfied. Phase 11-A is eligible to begin only as the next separately requested work slice; no Phase 11 implementation is included in this closeout.

### Delivered bounded slice 10-A — Canonical enum/version registry (complete)

- Added definitions.NetworkActionType to protocol/schema.json with all 23 Java action values, in Java enum order. The existing 25-value outer messageType enum was aligned to Java ordering; no outer message was added or removed.
- Added server/scripts/validate-phase10-protocol-enums.mjs to compare both Java enums against the schema, compare NetworkMessage.PROTOCOL_VERSION with schema.version and protocolVersion.default, and verify the narrower nativeMutationAction allowlist is contained in the canonical action enum.
- Wired the guard into npm test. It checks vocabulary/version parity only; it does not declare every action executable or imply that every message has an inbound Worker route.
- Implementation SHA: d8938190960af64d6efc70f4625a7411bfa3b7de. Exact-head [CI 43485367695 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43485367695): Backend build + 682 Vitest executions, Android JVM/Debug APK, and three Durable Object SQLite runtime tests.
- No MessageRouter, RemotePlayerActionReceiver, Worker routing or gameplay behavior was changed in slice 10-A. At the end of this historical 10-A slice, the parent Phase 10 remained OPEN. Slices 10-B through 10-E subsequently completed the remaining route, payload inventory and acceptance work; use the CLOSED checkpoint above for current status.


### Delivered bounded slice 10-B — Cross-layer routing matrix and Worker ingress admission

**Implementation scope:** the complete route inventory was built from live Java/Worker/Android source, then the Worker envelope boundary was tightened without changing gameplay validators or the client event application path.

- [x] Map all 25 outer message names with sender/direction, actual Worker ingress or non-inbound status, Java/Android route, and observed sequence/persistence behavior in `docs/multiplayer/PROTOCOL_MESSAGE_CATALOG.md`.
- [x] Map all 23 NetworkActionType names to explicit Worker ACTION branches, source-specific validators/authority checks, native follow-up snapshot needs and Android result path. A Worker branch is not a guarantee that every subcase/effect is enabled.
- [x] Separate the eight implemented Worker inbound message types from the 17 known non-inbound names. The non-inbound set includes server outputs and declared-but-unimplemented placeholders; do not label all 17 server-only.
- [x] Add Worker envelope admission for attachment/session, text framing, object shape, required/optional field types, exact protocol version, inbound route classification and valid nested payload JSON. Stable correlated ERROR codes replace silent ignore for invalid/unknown/unsupported ingress; existing handler exception messages remain unchanged for transaction rollback compatibility.
- [x] Add `message-admission.test.ts` and `validate-phase10-routing.mjs` to the ordinary backend npm test path. The static guard checks exact Java/schema vocabulary coverage, exact Worker route list, all 23 action branch tokens and the fail-closed INVALID_ACTION default.
- [x] Keep `RemotePlayerActionReceiver` intact after confirming its native cleanup/helper behavior. At the historical 10-B checkpoint it still handled legacy default messages; Phase 10-E later removed the top-level default forwarding while retaining the class for explicit helper duties.
- [x] Android envelope parser/version/required-field rejection was completed in Phase 10-C. At that historical checkpoint, per-action field inventory remained open; Phase 10-E later added the agreed 23-action source-name inventory and schema definitions.
- [x] Phase 10-C replaced the unmapped-HeroAction-to-WAIT fallback with an explicit empty mapping and native dispatcher rejection, with JVM coverage.
- [x] Phase 10-C added behavior-specific tests for PLAYER_LEFT cleanup, legacy RemoteHero updates and EVENT_BATCH single-application protection. This was the 10-C checkpoint; Phase 10-D/10-E later completed the supported outer-message route convergence.

**Verified implementation:** `d16be138d74bb9930777f5352efbeae3291070c6`; exact-head CI [43494769215 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43494769215). Backend TypeScript build and 708 Vitest executions passed, Android JVM/Debug APK passed, and all three Durable Object SQLite rollback/eviction tests passed. The first 10-B CI attempt exposed an unintended handler-exception message change; the compatibility fix retained existing transaction error messages and the exact-head rerun passed.

### Delivered bounded slice 10-C — Android envelope and producer parity

**Implementation status:** complete at the live code/test HEAD 2d9a36d6c90ae95a91e6d08dca7a5bc4861c7fa5. The source changes were already present when this conversation began; this slice audited their actual consumers and tests, did not duplicate them, and synchronized the project references.

- [x] Generic NetworkMessage.parseJson rejects missing/wrong-typed required fields, wrong-typed optional fields, unsupported protocol versions, non-object roots, malformed outer/nested JSON, unknown message types and unsafe sequence values. Invalid input is never converted into ACTION.
- [x] Preserve only documented transport-specific compatibility: the exact six-field raw-payload LAN envelope is accepted only by parseLanJson; the exact two-field unversioned Bluetooth legacy envelope is accepted only by parseBluetoothJson. Both normalize to the canonical string-payload envelope and pass through the strict parser. Internet/generic parsing remains canonical-only.
- [x] NetworkActionBridge returns Optional.empty() for null/unmapped HeroAction classes. Its only production consumer, MultiplayerActionDispatcher, rejects an empty mapping through the native Hero warning/abort path and does not send WAIT.
- [x] Add NetworkProtocolParityTest.java with 15 JVM tests for canonical parser/serializer, required/optional fields, version, sequence, JSON, unknown message types, scoped LAN/Bluetooth compatibility, mapped/unmapped HeroActions, transport serialization and LAN action parsing.
- [x] Add receiver behavior regressions to NativeCombatRuntimeIntegrationTest.java: PLAYER_LEFT covers RemotePlayer registry/RemoteHero Actor scheduler removal and Mob target-reference cleanup; legacy RemoteHero position/HP remains covered; EVENT_BATCH applies once through MessageRouter, duplicate sequence does not reapply it, and the legacy receiver refuses a second application. Explicit multiple-Buff detach and attached-sprite removal assertions were added in the Phase 10-D pre-migration expansion.
- [x] Preserve MessageRouter and RemotePlayerActionReceiver source structure; no receiver deletion, move or broad refactor. The receiver still owns PLAYER_LEFT cleanup and other legacy handling. Its EVENT_BATCH guard refuses legacy replay and requests the existing recovery path.
- [x] Keep the Worker 25-message/23-action route catalog and fail-closed routing guard aligned; no new message/action route or Worker subcase was inferred from enum presence.
- [x] No replay/resync algorithm, event-ordering policy, Worker action validator, native SPD gameplay formula or persistence behavior was changed.

**Exact source/test verification:** 2d9a36d6c90ae95a91e6d08dca7a5bc4861c7fa5; [CI 43512831773 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43512831773). Backend build and 10 Vitest files / 708 executions passed; Android JVM/Debug APK passed; three Durable Object SQLite tests passed. NetworkProtocolParityTest has 15 @Test methods; NativeCombatRuntimeIntegrationTest has 62 at this HEAD.

**Historical acceptance boundary at the 10-C checkpoint:** 10-C completed Android parser/producer safety and the specific old-receiver behaviors tested above, but the parent phase remained open at that time. Phase 10-E later closed the agreed single-route and per-action source-name inventory scope. Neither phase closeout claims every outer enum or Worker ACTION branch is fully executable for every item/effect subcase.

### Historical bounded slice 10-D — typed PLAYER_LEFT path (complete for this behavior at that checkpoint)

**Historical selection evidence at the 10-D checkpoint:** the live Worker producer was `MatchRoomBase.webSocketClose`, which marked the authenticated session disconnected and broadcast PLAYER_LEFT with senderId and payload.playerId. At that checkpoint, the separate PLAYER_JOINED producer in `MatchRoom.fetch` still used the default route; Phase 10-E subsequently migrated it to an identity-checked typed route. It was intentionally not combined with disconnect cleanup in 10-D.

- [x] Re-read source and actual producers/consumers before changing route ownership; distinguish real messages from enum-only placeholders and EVENT_BATCH inner event names.
- [x] Expand the legacy PLAYER_LEFT test before migration and prove the original default route's full effects. Pre-migration test-only SHA `6e5ea7c88ba0238d46c3d728ca0fb4437d3f3630` passed exact-head CI [43521307026 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43521307026).
- [x] Add explicit typed MessageRouter PLAYER_LEFT dispatch via Game.runOnRenderThread(...), preserving senderId fallback, payload identity choice, local-ID no-op, Mob target cleanup, Buff detach, Actor removal, sprite unlink/nulling and RemotePlayer registry removal.
- [x] Make RemotePlayerActionReceiver refuse direct PLAYER_LEFT reapplication and request its existing resync path. Keep the receiver and all other legacy responsibilities; no broad relocation/deletion.
- [x] Verify malformed PLAYER_LEFT payload fallback and local-player rejection; retain EVENT_BATCH typed sequence handling and its unchanged legacy receiver guard.
- [x] Final implementation/test SHA `cc61c68625f587576ca530aef3354bfaffe9e140` passed exact-head CI [43522055301 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43522055301): Backend 10 files / 708 executions, Android JVM tests + Debug APK, and three Durable Object SQLite tests.
- [x] Migrate the remaining supported PLAYER_JOINED behavior to a typed identity-checked path with producer trace and positive/negative tests (completed in 10-E).
- [x] Complete the agreed field-name payload contract inventory for all 23 native action declarations and the 18 required native snapshot fields (completed in 10-E; Worker validators remain authoritative for value types/requiredness).

**Historical parent-phase status at the 10-D checkpoint:** this bounded PLAYER_LEFT convergence unit was complete, while Phase 10 remained OPEN. The remaining route and payload inventory work was completed by Phase 10-E below; do not treat this old checkpoint as the current status.


### Delivered bounded slice 10-E — typed message closure and field-level ACTION contract (complete)

**Implementation/test SHA:** f2d79038d1e420461be7a1956471324de5c1ef74; exact code/test CI [43618725089 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43618725089). A later documentation-only closeout commit 9899ec8d315e4199d262e26f618188524857ab0b also passed [CI 43619273512](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43619273512).

- [x] Trace the actual Worker producers and payload contracts for PLAYER_JOINED, READY, PING and CHAT. PLAYER_JOINED's payload identity and senderId agree; SNAPSHOT carries each player's ready flag.
- [x] Add typed render-thread PLAYER_JOINED handling with sender/payload identity equality, finite integral position/range validation, local-player no-op, duplicate-player update and one RemoteHero Actor registration.
- [x] Add typed READY handling with identity/state validation, update RemotePlayer readiness metadata, request recovery if the joined player is unexpectedly missing, and restore ready flags from a successful room snapshot.
- [x] Route PING as transport-only pong; explicitly decide CHAT as non-routed because no Android chat UI exists. Do not forward either into a generic Hero parser.
- [x] Replace MessageRouter's catch-all default dispatch with an exhaustive 25-value switch: each canonical MessageType has exactly one explicit decision, and future unknown types fail closed.
- [x] Preserve RemotePlayerActionReceiver without a whole-class move/deletion. Add a synchronous render-thread RemoteHero setup helper; attach a HeroSprite only when GameScene exists, avoiding queued sprite construction in headless/non-game scenes.
- [x] Add JVM regressions for join, duplicate join, sender mismatch, readiness true/false, PING/CHAT/non-inbound no-phantom-player behavior, snapshot readiness restore and existing PLAYER_LEFT cleanup. Current NativeCombatRuntimeIntegrationTest contains 67 @Test methods; NetworkProtocolParityTest contains 15.
- [x] Add per-action NativeActionEnvelope.oneOf and 23 NativeActionData_<ACTION> schema definitions. Track each action's Worker-consumed fields, validator sources, Java producer sources, Java-source-referenced fields and Worker-only fields in protocol/action-data-contracts.json.
- [x] Reconcile 361 per-action Worker field names: 346 are source-referenced in the listed native Java producer files; 15 are explicitly classified as Worker-only. This is a static source-name inventory, not proof of per-branch serialization. Match all 23 action names/order against Java's enum and the JSON Schema.
- [x] Reconcile the 18 required NativeLevelSnapshot fields against the Java wire model and Worker complete-snapshot validator.
- [x] Keep WAIT and USE_ABILITY explicit but non-emitted by Android: no native producer/bridge mapping exists, so do not synthesize either. Preserve their fail-closed behavior. Keep CHAT explicitly non-routed on Android until a real chat surface is delivered.
- [x] Add both static protocol guards to the ordinary backend npm test path and verify the reported message/action coverage on exact-head CI.
- [x] Confirm no Worker handler/producer, Worker validator, SQLite persistence, sequence/replay/resync algorithm or native SPD gameplay rule changed in this closeout.

**Exact-head evidence:** [CI 43618725089](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43618725089) passed all three jobs:
- Backend typecheck/build and six static guards passed; 10 Vitest files / 708 executions passed.
- Android JVM tests and Debug APK compile passed; log ended with BUILD SUCCESSFUL in 33s.
- Durable Object local Workers runtime passed all three SQLite rollback/eviction integration tests.

PLAYER_JOINED/READY readiness and route decisions are now explicit. This does not imply every enum value is an implemented message producer or every optional Worker action subcase is enabled. Worker validators remain authoritative for detailed field typing, requiredness and accepted variants.

### Work items

- [x] Retain the 25 outer-message / 23 action route inventory and exact Worker admission classification from 10-B; keep source and tests synchronized when a verified route changes.
- [x] Complete the agreed Phase 10 field-name parity inventory and source references for all 23 actions and required native snapshot fields.
- [x] Converge remaining supported real player/control outer-message behaviors into typed MessageRouter paths; explicitly classify non-routed/non-inbound values and remove the generic default-to-legacy-receiver fallback.
- [x] Add positive/negative tests for join/readiness/control routing and preserve render-thread, identity, cleanup and rejection semantics.
- [x] Give every declared outer message exactly one explicit client route decision; keep Worker ingress routes and authority/persistence contracts unchanged.

### Acceptance criteria

- [x] Canonical schema, Java message/action enums, Worker admission, client route decisions and source-backed payload inventories agree.
- [x] Every declared MessageType has one explicit Android route decision; every supported server-originated player/control message has one typed client application path.
- [x] No player/control message is forwarded through a generic default Hero parser; typed/legacy double application is prevented by route ownership and regression tests.
- [x] Known unsupported/non-inbound messages and actions are explicit and fail-closed; no support is inferred from enum presence or Worker branch names.
- [x] Per-action Worker field inventories and Java producer evidence are reconciled, with Worker-only fields and non-emitted actions called out.
- [x] Receiver responsibilities are retained unless a behavior has its own equivalence proof; no whole-class migration/deletion was needed.
- [x] Exact-head CI is green across backend, Android JVM/Debug APK and Durable Object SQLite runtime tests.

**Parent-phase status:** Phase 10 is CLOSED for implementation and automated acceptance at f2d79038d1e420461be7a1956471324de5c1ef74. This does not close Phase 11 or Phases 22–23.



### Historical 2026-11-14 — Phase 11-A dependency preflight (at that checkpoint, Phase 11 had not started)

**Historical preflight baseline:** branch multiplayer-framework-core-14118577486727081892, parent HEAD cf3714c82a210eace79614ab7c575acb04b8aebb. Its exact-head CI [43523497982](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43523497982) passed all three jobs. The findings below record the open items at that time; Phase 10 later closed at SHA f2d79038d1e420461be7a1956471324de5c1ef74 with exact-head CI [43618725089](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43618725089).

**Phase 10 dependency is now met.** The route and payload closure items identified at the earlier preflight were delivered in 10-E; the following records what was incomplete at the old preflight timestamp:

1. **Actual client message routes (status at the historical preflight):** the Worker broadcast PLAYER_JOINED after SESSION; Android had no typed route for it. READY, CHAT and PING also lacked explicit route decisions. Phase 10-E subsequently added the join/readiness/liveness routes, deliberately left CHAT non-routed, and made all 25 Android route decisions explicit.
2. **Field-level contract parity (status at the historical preflight):** field-name parity for each Worker action and required native snapshot fields had not yet been inventoried. Phase 10-E later added the action-specific schema and Java/Worker source inventory; actual field types, per-subcase requiredness and support remain enforced by Worker validators.
3. **Single-path acceptance (closed in 10-E):** the Android route switch has one explicit branch decision for all 25 values; it contains no generic RemotePlayerActionReceiver fallback. Join/readiness/control routes and non-routed cases have JVM coverage.

**Phase 11-A source observations (audit only; not implementation):**

- Android `MessageRouter.handleEventBatchMessage` skips `seq <= lastSequence`, but for a newer event it calls `updateLastSequence(seq)` before validating the event body or completing state application; it does not require the next contiguous sequence (`lastSequence + 1`). A malformed event can therefore request RESYNC after the local watermark has already advanced. `MultiplayerManager.updateLastSequence` is a monotonic maximum, not a gap detector. `ACTION_ACCEPTED` also advances the sequence before its accepted action is applied.
- The Worker `RECONNECT` path replays only for a non-current publisher when `gap > 0 && gap <= 50`, and sends `EVENT_BATCH` when the number of rows returned by the ordered query equals the gap; otherwise it sends a full `SNAPSHOT`. The current publisher reconnect path uses a full snapshot. `RESYNC` always returns a full snapshot; its body includes stored events, but Android snapshot restoration is the full-state path, not event replay.
- `processed_actions.request_id` is the durable primary key. The current replay classifier `classifyRequestReplay(existing, playerId)` returns REPLAY for the same player and CONFLICT for a different player; the duplicate branch returns the prior ACTION_ACCEPTED result without comparing the new request's action or payload to the original one. This does not prove protection against same-player request-ID reuse for a different action/payload.
- `WorldSnapshot.restoreWorld` rejects a snapshot whose sequence is older than the client's current sequence, validates before live mutation, and retains rollback behavior; the router marks a snapshot applied after restoration succeeds. These safeguards do not replace contiguous EVENT_BATCH validation.

**Historical gate decision at this checkpoint:** Phase 10's dependency had been satisfied, so Phase 11-A was then eligible only as a separately requested slice. The subsequent Phase 11-A characterization and Phase 11-B implementation/acceptance are recorded in the current Phase 11 closeout above; this paragraph is not the present next-step instruction.

## Phase 11 — Event Ordering, Replay Protection and Resynchronization

**Priority:** P0 · **Dependencies:** Phase 10.

### Work items
- [x] Apply accepted events in sequence order; ignore already-applied duplicates and detect skipped/out-of-order sequence numbers.
- [x] Deduplicate request IDs across retries and prevent one ID from being reused for a different action/player/payload.
- [x] Preserve action-specific pre-state, current-depth, ownership, stable target, action-cost and result-delta validation before persistent mutation; do not weaken Worker validators.
- [x] Use contiguous retained event replay only when the complete bounded range is available; otherwise recover from a full authoritative snapshot. RESYNC remains full SNAPSHOT.
- [x] Add replay, out-of-order, stale-state, duplicate-action, sequence-gap, invalid-payload and rollback regressions across Worker, Android router and Durable Object SQLite runtime.

### Acceptance criteria
- [x] Replayed, delayed or out-of-order messages cannot apply an action twice or move the match backward.
- [x] A client converges by contiguous event replay or a full snapshot; it never guesses the missing state.
- [x] Invalid events do not partially persist data before rejection.

**Historical closeout (2026-11-15): Phase status CLOSED** for accepted Phase 11-A/11-B scope at SHA 2574489ff25e6f1fedc1e21718161bc5a7a1b230 / CI 43731016036. At that checkpoint Phase 12 had not started; it was subsequently authorized and is now closed for implementation/automated acceptance in the Phase 12 closeout below. The Phase 11 closeout changed no 25-message/23-action vocabulary and claimed no production deployment or physical-device testing.

## Phase 12 — Durable Recovery, Reconnect and Authority Handoff

**Priority:** P0 · **Dependencies:** phases 10–11 and the session model in Phase 13; generic recovery contracts can be tested before individual transports are complete.

### Phase 12-A — authenticated session identity and reconnect credential (IMPLEMENTED; EXACT-HEAD CI PASS; CLOSED FOR IMPLEMENTATION/AUTOMATED ACCEPTANCE)

This user-authorized slice secures the existing Internet WebSocket session path without changing the 25-message / 23-action vocabulary or gameplay rules.

- [x] Require a valid Bearer session credential in the WebSocket Authorization header to resume an existing player; reject sessionToken query parameters.
- [x] Resolve the credential to exactly one persisted player; treat optional playerId only as an equality assertion and reject mismatches.
- [x] Prevent unauthenticated creation from claiming an existing player ID; preserve existing player state/position on authenticated reconnect.
- [x] Bind the accepted socket attachment to the authenticated player and current token; reject messages from a superseded socket after token rotation.
- [x] Rotate the credential on successful reconnect and return it only in SESSION; keep the RECONNECT body limited to lastSequence.
- [x] Add Worker handler and actual Durable Object SQLite tests for identity mismatch, old-token rejection and stale-socket invalidation.
- [x] Add Android reconnect handshake/identity/sequence tests and require a fresh replacement token in the reconnect SESSION response.
- [x] Trigger authenticated reconnect from unexpected Internet transport disconnect/error; scope callbacks to transport generation so stale sockets cannot reopen connections or deliver messages.
- [x] Clear stale client session on SESSION_REPLACED or permanent 401/403/409 resume rejection, and close failed WebSocket handshake resources.
- [x] Android core JVM suite: 132 tests, 0 failures/errors/skips; Debug APK assembleDebug passes locally with the installed SDK.
- [x] Exact-head CI 43921670336 passed Backend, Android and Durable Object SQLite jobs; the requested final source review and clean local/remote branch checks are complete.

### Phase 12-B — bounded Durable Object rehydration and event recovery (IMPLEMENTED; EXACT-HEAD CI PASS; CLOSED FOR IMPLEMENTATION/AUTOMATED ACCEPTANCE)

This completed slice restores the room cursor/status

- [x] Persist `currentSequence` and `gameStatus` in `room_meta` on accepted event paths; restore the monotonic cursor on construction using the persisted checkpoint and legacy `MAX(events.sequence)` backfill.
- [x] Restore and validate persisted `worldTime`, `gameMode`, `seed`, `depth` and `gameStatus`; reject malformed or missing critical metadata for an already-persisted room rather than generating new defaults.
- [x] Recover legacy rooms without `gameStatus`: derive `ENDED` from `MATCH_END`; derive `PLAYING` only from a complete native snapshot for the current depth; otherwise retain `LOBBY`, before the first retention pass.
- [x] Keep the newest 200 room events for bounded reconnect replay. Separately preserve each sender's latest `HERO_BUFF_TICKED`, latest `PLAYER_DAMAGED`, and up to 513 `CHAR_DAMAGED` evidence rows after that sender's latest buff tick; the 513th row preserves the existing over-512 fail-closed LifeLink rule. Total `events` rows may therefore exceed 200 while validation evidence is protected.
- [x] Persist the event cursor/status and apply retention after accepted ACTION events, native world turns/mutations, transition-abort events and MATCH_END records.
- [x] Refuse to synthesize a replacement current level when its row is missing but durable player/event/snapshot/publisher/level-tile/transition/Mob/item-claim/chest-claim/reward-claim state or non-default room_meta keys remains; return `ROOM_RECOVERY_INCOMPLETE`.
- [x] Add real Workers Durable Object SQLite eviction tests for cursor/status/world-time rehydration, contiguous replay, full SNAPSHOT fallback, bounded replay/evidence retention, legacy MATCH_END/complete-snapshot PLAYING recovery, orphaned level-table/room_meta rejection and missing-level fail-closed behavior.
- [x] Local checks on the final implementation worktree: TypeScript noEmit PASS; backend Vitest 5 files / 372 tests PASS; real Workers Durable Object SQLite 1 file / 14 tests PASS; Android forced rerun: 132 core JVM tests, 0 failures/errors/skips; Debug APK assembleDebug PASS.
- [x] Add versioned room-schema migrations (`room_meta.schemaVersion` 1–2), with each migration and its version checkpoint committed in one SQLite transaction; preserve legacy request receipts and branchless item claims.
- [x] Wrap the complete multi-table `LEVEL_DATA` replacement and native snapshot/cursor writes in one synchronous SQLite transaction; restore in-memory cursor/time and return a correlated ERROR without ACK or world broadcast on rollback.
- [x] Fence publisher disconnects and elections by persisted session token; preserve a validated snapshot for handoff/rebase, invalidate stale terms, and revoke authority without electing or broadcasting a fabricated world when the snapshot is unavailable.
- [x] Add real Workers SQLite regressions for legacy schema upgrade, full LEVEL_DATA rollback/retry and missing-snapshot publisher revocation, plus handler-level stale-token and fail-closed publisher tests.
- [x] Remote branch comparison completed; commit `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8` pushed and verified as origin HEAD; exact-head CI 43921670336 passed all three jobs; requested final source review completed.

**Implementation boundary and current result:** the accepted Phase 12 work adds no protocol field/message/action and leaves the 25-message / 23-action contract unchanged. RECONNECT still replays only a complete contiguous range of at most 50 events and otherwise restores from the authoritative snapshot. Room state is now version-migrated, `LEVEL_DATA` replacement is fully transactional, and publisher loss is token-fenced with fail-closed handling for missing snapshots. Lobby/readiness/start lifecycle transitions remain Phase 13 scope.
### Work items
- [x] Phase 12-A authenticates the reconnect token, binds the accepted socket to its owner, rotates credentials safely, rejects stale sockets and reconnects safely on Android.
- [x] Phase 12-B persists/restores the room cursor/status, bounds replay retention while preserving LifeLink evidence, and fails closed on damaged room/level recovery.
- [x] Add room schema versioning and atomic migrations (versions 1–2); migrate processed-action fingerprints and branch-aware item claims without losing legacy receipts/claims.
- [x] Make the complete `LEVEL_DATA` cross-table replacement atomic, including its native snapshot and room cursor writes; rollback emits no success ACK or uncommitted world snapshot.
- [x] Fence publisher loss/election/handoff by persisted session token and term; require a complete native snapshot before replacement election, rebase the replacement before it can publish, and revoke authority without fabricating state when snapshot recovery is impossible.
- [x] Add actual Durable Object SQLite coverage for migration, LEVEL_DATA rollback/retry and missing-snapshot publisher revocation, in addition to eviction/replay/valid handoff coverage.
- [x] Exact-head Actions CI 43921670336 passed all three required jobs for `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8`; the requested final review found no remaining Phase 12 implementation or automated-acceptance item.

### Acceptance criteria
- A reconnect either replays a complete event range or restores from a valid authoritative snapshot.
- Durable Object restart and schema migration do not lose or duplicate accepted gameplay state.
- At every point there is at most one publisher for shared native turns; handoff cannot duplicate Mob turns, death rewards or loot.
### Final Phase 12 closeout — 2026-11-16

Phase 12-A and Phase 12-B are CLOSED for implementation and automated acceptance on the authorized branch. The final implementation/test commit is `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8`; the branch was pushed and verified equal to origin. Exact-head Actions run [43921670336](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43921670336) passed Backend, Android and real Durable Object SQLite jobs. A final source/transaction/recovery/publisher review was performed in the user-requested continuation.

Final local evidence: TypeScript build/noEmit PASS; Backend 10 Vitest files / 744 reported executions (372 unique source scenarios; mirrored TS/JS outputs are not additional unique scenarios) PASS; real Workers Durable Object SQLite 14/14 PASS; Android core JVM 132/132 with zero failures/errors/skips and Debug APK assembleDebug PASS. The 25-message / 23-action protocol contract is unchanged.

Phase 12 does not claim a production Worker deployment or a physical two-device multiplayer match. Those remain explicit later gates: Phase 22 deployment/service preflight and Phase 23 user-led physical-device playtest. Phase 13 room/readiness/start lifecycle is the next implementation phase and was not started by this closeout.

## Phase 13 — Common Room/Session Lifecycle and Readiness (CLOSED: implementation + automated acceptance)

**Priority:** P0 · **Dependencies:** phases 10–12.

### Work items
- [x] Separate transport-connected, authenticated/session-bound, room-created/joined, world-synchronized, ready and playing states in the Android session model.
- [x] Implement explicit create/join/leave/ready/start/room-state operations and enforce mode-specific minimum/maximum player counts.
- [x] Make start contingent on valid room membership, owner/publisher authority, connected/ready members, matching world seed/sequence, complete native snapshot and no pending transition.
- [x] Implement start cancellation, handshake/room-operation timeouts, bounded reconnect retry/backoff, duplicate-session prevention, generation-fenced callbacks and pending-operation cleanup.
- [x] Wire the in-game lifecycle lobby after native-level publication, validate the authoritative roster on the render thread, and gate native gameplay until PLAYING.
- [x] Test simultaneous join/start serialization, cancellation/readiness reset, successful authoritative start, server broadcasts, late-join rejection and post-start cancel rejection in real Durable Object SQLite.

### 2026-11-17 closeout (CLOSED: implementation and automated acceptance)

The server room lifecycle and Android session-control layer are implemented and locally verified: WndMultiplayerLobby, validated authoritative roster, render-thread ROOM_STATE/MATCH_START delivery, reconnect/failure exit handling and hard native turn/input gate until PLAYING. Abrupt owner WebSocket loss transfers owner/publisher authority transactionally, invalidates every READY proof and broadcasts the current ROOM_STATE; the returning former owner resumes with the same player identity, a rotated token and the successor owner ID plus a fresh connected/offline roster. Local evidence: backend 372 unique TypeScript source scenarios / 744 reported Vitest executions; real Durable Object SQLite 17/17; Android core JVM 141/141; forced full test assembleDebug PASS. Exact-head GitHub Actions run 1272 (https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44149425355) is SUCCESS for commit fbf46ef15a1ec4554710a43894cfa4969c3176a7, with Backend, Android and Durable Object SQLite all green. Phase 13 is CLOSED for implementation and automated acceptance. Emulator UI/touch/layout checks were not run by user request and are explicitly deferred to Phases 20-21. No production deployment or physical two-device test is claimed.

### Phase 13 closeout
- [x] Abrupt owner WebSocket loss, atomic owner/publisher transfer, all-member READY-proof invalidation and authoritative ROOM_STATE broadcast verified by real Durable Object SQLite tests.
- [x] Former-owner authenticated reconnect, token rotation, stable player identity, ownership change and complete roster restoration verified by Android JVM regression.
- [x] Local backend, Durable Object SQLite, Android JVM and Debug APK builds pass.
- [x] Commit fbf46ef15a1ec4554710a43894cfa4969c3176a7 pushed to the permitted branch; exact-head Actions run 1272 [https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44149425355] passed all three jobs.
- Emulator-visible host/join/lobby flow remains a Phase 20 task; RTL/touch/layout review remains a Phase 21 task. These are not Phase 13 blockers.

### Acceptance criteria
- Connection alone never means the player is in a playable match.
- The client has a single explicit session state and cannot accidentally start twice or remain half-connected.
- Every failure ends in a truthful error, a safe retry state or a clean exit.
## Phase 14 — Internet/WebSocket Transport (split into 14-A and 14-B)

**Priority:** P0 · **Dependencies:** Phase 13 and the Phase 11–12 protocol/recovery contracts.

This phase is deliberately split at the transport boundary so the wire protocol and deterministic socket behavior can be closed independently from Android lifecycle/thread orchestration.

### Phase 14-A — WebSocket wire transport and protocol correctness

**Status:** CLOSED for implementation and automated acceptance — exact UTF-8 aggregate SNAPSHOT bound, pre-commit rejection, canonical full-snapshot builder, replay retention and local verification. Parent Phase 14 remains OPEN until 14-B.

Scope:
- [x] Verify the client endpoint mapping against Worker source: `/room/{roomCode}/websocket`, `lifecycle=1`, optional player identity assertion, and Bearer session credential only in the Authorization header (never in the URL).
- [x] Validate the complete RFC 6455 HTTP/1.1 upgrade: status 101, Upgrade/Connection tokens, canonical 16-byte request key and exact Sec-WebSocket-Accept; preserve non-101 HTTP status codes for session rejection handling; reject malformed/duplicate headers, unrequested extensions and protocols.
- [x] Harden TCP/TLS setup: explicit connect and upgrade-handshake timeouts, HTTPS hostname verification, and secure-scheme requirement whenever a session token is present; localhost tests verify that credentials are refused on `ws://`.
- [x] Implement bounded server-frame parsing and masked client-frame writing, including canonical 7/16/64-bit lengths, RSV/opcode/mask checks, fragmented text assembly, strict UTF-8, interleaved control frames, PING/PONG, CLOSE validation and bounded payload memory.
- [x] Add deterministic JUnit tests for the handshake/frame codec and an ephemeral localhost WebSocket peer that exercises the full upgrade, PING/PONG, fragmented message and CLOSE exchange (17/17 PASS).
- [x] Run focused transport tests and the full Android test/debug build; verify the client endpoint, lifecycle query and Bearer-header admission contract against Worker source.
- [x] Bound every event-bearing server-built client SNAPSHOT to the newest 200 replay rows while retaining older LifeLink proof rows in SQLite for server-side validation; cover RESYNC and prove the DB evidence is not deleted.
- [x] Stress the client 16 MiB envelope ceiling with a 100×100 level, 512 mobs, maximum per-cell collection counts, four co-op players, 2,060 stored proof/replay rows and a 200-row transmitted replay window; measured complete SNAPSHOT is 15,664,067 bytes.
- [x] Verify exact-head GitHub Actions on the published source-and-evidence SHA `907426a127151dc1acc7517496bd5415a5183526`: [run 1279 / 44329234387](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44329234387), all three jobs passed.

Acceptance for 14-A:
- [x] A valid local compliant endpoint completes the handshake; invalid/non-101 responses, bad accept values, malformed frames and unsupported data frames fail closed.
- [x] Every client frame is masked; server frames are unmasked; fragmentation and interleaved control frames preserve message boundaries.
- [x] Frame/message size, UTF-8 and close-code failures are bounded and deterministic; no attacker-controlled length can overflow an allocation.
- [x] Bearer credentials never appear in the request URL and are rejected on insecure endpoints.
- [x] Local/mock transport tests and exact-head GitHub CI run 1279 pass. A live production Worker smoke test is not claimed by localhost tests.
- [x] Confirm the 16 MiB ceiling is above the tested maximum-dimension/maximum-collection fixture after server replay-window bounding (15,664,067 bytes including the complete escaped SNAPSHOT envelope).
- [x] Enforce a universal accepted-message invariant: every complete client SNAPSHOT is at most 15.5 MiB UTF-8 (16,252,928 bytes), 512 KiB below Android's unchanged 16 MiB cap; oversized combinations are rejected rather than committed or truncated.
- [x] Count nested payload JSON before serialization and the final escaped NetworkMessage envelope before sending; verify exact UTF-8 byte parity and boundary behavior.
- [x] Preflight LEVEL_DATA, ACTION, JOIN_ROOM, READY, MATCH_START and projected floor transitions before their SQLite transaction or authoritative floor change commits.
- [x] Route LEVEL_DATA peer publication, RECONNECT, RESYNC, lifecycle and general snapshots through one bounded builder; filter lifecycle-v1 snapshots to connected room members.
- [x] Reject inbound UTF-8 text frames above 16 MiB before JSON.parse; keep Android MAX_MESSAGE_PAYLOAD unchanged.
- [x] Preserve SQLite replay/proof rows while sending only the newest 200 events in ascending order; prove 515 rows remain after RESYNC.
- [x] Verify local backend (380/380), real Durable Object SQLite (17/17), Android/JVM (159/159) and Debug APK build.

### Phase 14-B - Session lifecycle, Android threading and network transitions
**Status:** IN PROGRESS — 14-B1 callback/transport generation safety and 14-B2 render-thread dispatch are CLOSED with exact-head CI. 14-B3 Android network/background recovery, project endpoint wiring, monitor-generation fencing and safe localized connection-failure feedback are locally verified. Latest forced Android run after the failure-feedback follow-on: 12 JUnit reports / 176 tests / 0 failures / 0 errors / 0 skipped; Debug APK 35,220,632 bytes (SHA-256 `A3AF4DD93CD8606DBF9F9D217343434E3EFD722BA9C168172CED741C9FD953A4`). Exact-head CI for this follow-on is pending until its source+documentation commit is pushed. Hosted Worker room smoke and actual Android framework network/background runtime acceptance remain OPEN. Parent Phase 14-B and Phase 14 remain OPEN.
Scope:
- [x] Make connection callbacks, manager state transitions, reconnect/retry paths and cancellation/generation fencing thread-safe (14-B1).
- [x] Add deterministic manager/callback regressions for session replacement, stale SESSION delivery and cancellation during HTTP Upgrade (14-B1).
- [x] Queue inbound transport messages and disconnect/error callbacks onto the libGDX render thread; recheck transport identity/session generation when the queued callback executes (14-B2).
- [x] Guard deferred MessageRouter native/scene actions with the session generation captured when queued; stale work is discarded after endSession/session replacement (14-B2).
- [x] Marshal callback-caused SESSION/Dungeon.seed, typed MessageRouter native/scene mutations, and disconnect/error state callbacks onto the libGDX render thread with execution-time generation fencing (14-B2).
- [x] Wire Android connectivity monitoring for API 21+ and Activity create/resume/pause/destroy lifecycle; use default-network callbacks on API 24+ and INTERNET request callbacks on API 21–23.
- [x] Fence each Android network callback with a monitor generation and callback identity; invalidate the generation before teardown, clear old network state, and serialize state publication with monitor lifecycle to prevent late callbacks from a destroyed Activity.
- [x] Implement manager offline/background state: preserve authenticated sessions on transient network loss, pause retry/handshake timers, and resume retries after network/foreground recovery; add JVM regressions for offline and background transitions.
- [x] Add heartbeat timeout isolation from blocked socket writes and immediate generation-invalidating disconnect; cover with a backpressured localhost peer test.
- [x] Centralize room URL generation on the configured Worker name/account subdomain and validate room codes before connection.
- [ ] Validate connectivity callback behavior during actual Android network handoff, screen-off and activity recreation on a supported device/runtime.
- [ ] Run hosted Worker room creation/join, authenticated resume/token rotation and failure-visibility smoke tests when explicitly requested by the user (currently intentionally deferred).
Acceptance for 14-B:
- [x] An old socket/callback cannot change the state of a newer session or revive a closed session (manager callback generation/identity gate; JVM race regression).
- [x] No callback-caused scene/UI mutation occurs off the render thread; nested runnables inherit the session generation guard.
- [x] JVM manager regressions show network loss/recovery and background transitions preserve the authenticated session/token and pause retries without corrupting session/replay state.
- [ ] Verify Android framework connectivity callbacks and lifecycle through an actual supported Android runtime network/background cycle.
- [x] Deploy `spd-multiplayer-backend` through `.github/workflows/deploy-server.yml` using GitHub Actions Secrets; exact successful run [44549387460](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44549387460) deployed version `0285e269-b4fb-415b-bf78-03587851ba6c` with `MATCH_ROOM`.
- [ ] Service-level tests prove room creation/join, authenticated resume and failure visibility against the deployed Worker before physical-device acceptance (intentionally deferred by user instruction).

#### 14-B3 — Android network/background recovery and hosted-service wiring (in progress)

Local implementation/evidence: `docs/multiplayer/PHASE14-B3_ANDROID_NETWORK_RECOVERY.md`. Latest forced Android/JVM run: 11 reports / 172 tests / zero failures, errors or skips; 58 Gradle tasks executed successfully. Debug APK 35,219,222 bytes (SHA-256 `F31514F7D57573CAEEBD9633848AF9201DFA364AFD1E2A3CD67E5FD532D8951A`). Default CI no longer launches an Android Emulator; the retained lifecycle smoke script is guarded and NOT RUN. Backend deploy run [44549387460](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44549387460) on `7a4b95c9f260d6cf820b96a78cc771c116fa3f32` passed TypeScript + 380/380 Vitest and deployed Worker `spd-multiplayer-backend` with Durable Object binding `MATCH_ROOM`; version `0285e269-b4fb-415b-bf78-03587851ba6c`.
Exact-head CI for source commit 33513defbabf4bd3e64e0ee9ae9e2e90f2f4a48e passed 3/3 jobs in run 44576949868 (Backend, Durable Object SQLite, Android JVM/debug APK).

#### 14-B3 follow-on — honest setup and lobby failure feedback (2026-11-19)

- `MultiplayerErrorMessages` maps internal manager/transport error codes to safe localized resource keys for offline/background state, session handshake timeout, room-operation timeout/rejection, closed/invalid rooms, rejected/replaced session credentials and unavailable server cases. Unknown/null errors use a generic localized fallback; raw exception/HTTP text is not rendered.
- `MultiplayerSetupScene` catches synchronous `startSession` failures, keeps the player on setup and shows a localized `WndError`; it does not advance to hero selection after failed startup.
- `WndMultiplayerLobby` now uses the same classifier for room/session/lobby errors rather than appending raw `roomLifecycleError`, `sessionError` or `RoomLobbyState` strings.
- English and Arabic bundles contain the same 10 `connection_*` keys. `MultiplayerErrorMessagesTest` adds four JVM cases covering offline/background, session/room timeout, rejected room/session credentials, unreachable server, unknown and empty errors.
- This is failure-message correctness only, not a UI redesign or evidence of a working live room. Phase 20 remains the complete host/join/lobby flow and Phase 21 remains RTL/layout/navigation/cleanup. No emulator or hosted-service smoke ran.

The intended account host `spd-multiplayer-backend.magd.workers.dev` is deployed. GitHub Actions run [44549387460](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44549387460) succeeded; Cloudflare confirms script `spd-multiplayer-backend`, Durable Object binding `MATCH_ROOM`, version `0285e269-b4fb-415b-bf78-03587851ba6c`. `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `MAGD_JWT_SECRET` were read from GitHub Actions Secrets; current code still does not use `MAGD_JWT_SECRET` because the protocol remains opaque random session tokens, not JWT. Per user instruction, hosted create/join/resume/WebSocket smoke is intentionally **deferred** and is not counted as accepted. Actual Android framework network/background runtime verification is also not run.

### Parent Phase 14 acceptance
- Internet sessions either establish the requested room or report a specific visible failure.
- Malformed frames, timeouts and disconnects cannot corrupt gameplay state.
- No UI scene is changed from an unsafe callback thread.
- Phase 14 is not CLOSED until both 14-A and 14-B satisfy their own evidence gates.

## Phase 15 — LAN Transport

**Preflight:** `docs/multiplayer/PHASE15_LAN_PREFLIGHT.md` records the source-only readiness audit. Phase 15 implementation has NOT started; all LAN work items below remain open.

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
- [ ] Perform emulator/in-app acceptance of the complete host/join/lobby flow: lobby open/close, owner/non-owner controls, retry/failure exit and MATCH_START transition.

### Acceptance criteria
- First-time host/join flow is understandable without implementation knowledge.
- The UI never presents a transport connection as a playable match.
- Every advertised action leads to a real supported operation or an explicit explanation.

## Phase 21 — Localization, RTL/Layout, Navigation and Cleanup

**Priority:** P1 · **Dependencies:** Phase 20.

### Work items
- [ ] Replace hardcoded new multiplayer text with localized resource keys and verify Arabic and English resources.
- [ ] Audit Arabic RTL, long room codes, IP addresses, error messages, touch targets, safe insets, portrait/landscape and phone/tablet layouts.
- [ ] Verify the lobby and reconnect screens visually on the emulator across Arabic/RTL and English, including touch targets and modal transitions.
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
