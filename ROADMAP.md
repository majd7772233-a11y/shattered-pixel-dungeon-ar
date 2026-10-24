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

## Atomic-Phase Rule — No Partial Phases

A numbered phase is **one indivisible milestone**, not a collection of separately completable parts. Its full scope, dependencies, implementation, schema, tests, cross-file integration and completion criteria must be finished before the phase is marked complete.

- Never mark a phase complete with an unchecked requirement, known dependent defect, missing test or unverified integration path.
- Never push a missing requirement into the next phase merely to close the current one.
- A new class, schema field or test alone is not completion. Trace the whole path: native action → protocol → server validation/persistence → sequenced event → client reconciliation → reconnect/snapshot.
- Fix all failures revealed by CI and rerun against the exact final code SHA before reporting.
- Do not claim physical-device testing unless it really happened. CI cannot run a physical two-device session.
- Work on the named branch. Never merge into main unless explicitly instructed.
- Update ROADMAP.md and GPT.md whenever implementation, phase status, architecture, risks or verification changes.

## Current Verified Status

### Continuation handoff — 2026-10-24

- **Authoritative next task:** Phase 5 — items and effects. Phase 4 is already complete for implementation and automated acceptance; do not redo it just because its request was repeated in the latest conversation.
- **Branch:** `multiplayer-framework-core-14118577486727081892`; keep all work on this branch and never merge to `main` unless explicitly requested.
- **Current state before saving this handoff:** branch HEAD `38630762749fc120da9bbedc4696f413945ef521` (documentation-only phase revalidation). Exact-HEAD CI [39865024347](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39865024347) passed both Backend typecheck/tests and Android debug APK compile. The Phase 4 implementation code SHA `c0c231a501bb2996f261e7e9e4e5d66e4136d70b` passed exact-SHA CI [39850368287](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39850368287); follow-on code tip `ab81c507c5f1ae0b767732a7247cf7afe5afd917` passed [39859774332](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39859774332).
- **Conversation stop point:** the user asked to save all context and rules for continuation in a new conversation. The assistant re-read the branch, current phase status, `GPT.md`, `ROADMAP.md` and the latest workflow; it began a Phase 4 code audit but made no gameplay source changes in this conversation. A suspicion based on partial excerpts that `UNLOCK`, `MINE`, `INTERACT`, `OPEN_CHEST`, or peer transition handlers were absent was disproved by the later full-source audit; these handlers are present. Do not reopen that claim without new evidence.
- **On continuation:** immediately read the full Phase 5 scope and acceptance criteria below, then inspect current item/heap pickup/drop, inventory, effects/buffs, action bridge/router, snapshots, Worker validation/persistence and tests. Finish Phase 5 end-to-end in one effort; add regressions; run CI on the exact final code SHA; fix any failures; update this file and `GPT.md`. Do not ask the user to repeat details or provide only a plan.
- **Non-negotiable rules:** each numbered phase is indivisible and must be fully completed before marking complete; preserve original Java/libGDX SPD gameplay rather than inventing TypeScript approximations; trace native action → protocol → Worker validation/persistence → sequenced event → peer reconciliation/resync; enforce one authority and replay protection; no duplicate event pipelines; update both project memory files; stay on the named branch; no merge to `main` unless asked; report only actually verified results; never claim physical device/deployed Worker testing without evidence; do not suggest `npx wrangler` for Android; avoid unrelated rewrites and unnecessary chatter.
- **Release limits:** no physical two-device session and no deployed Worker end-to-end run are claimed. Keep those release gates in Phase 10. Publisher disconnect/authority handoff remains Phase 9.


- **Phase 1 — Lossless native snapshots/restoration: complete for implementation and automated acceptance after cross-layer re-verification.** The final snapshot-consistency code SHA is `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`; [CI run 39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) succeeded for this exact SHA, with both backend and Android jobs green. The audit fix rejects conflicting or incomplete snapshots before server persistence and adds negative regression tests. Physical two-device testing remains in Phase 10.
- **Phase 2 — Native combat replication: complete for implementation and automated acceptance.** Re-audited against the current branch on 2026-10-21: 28 native runtime integration tests exercise native hits/misses, shield-only/zero-damage outcomes, retaliation, attacker post-state, blessed Ankh, delegated kill rewards, Mob-to-player damage, periodic damage, PvP/Ankh, secondary Mob effects, stable-ID/full-bundle deltas, stale events and duplicate-death prevention. The Worker suite contains 107 tests overall, including combat pre-state/authority/replay/buff/shield/loot/Ankh and secondary-delta validation. Current branch head `0a88887fa01bed79bc317f28d73692c5192b78da` passed [CI run 39656587836](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39656587836) with both backend and Android jobs green. This re-verification found no missing Phase 2 implementation item; the unchecked physical two-device smoke test remains a Phase 10 release gate.
- **Phase 3 — native Mob AI/Actor scheduler: complete for implementation and automated acceptance.** Exact-SHA code `a5565ea05ae677104f3eccfa428e99c5b5e787bb` passed [CI run 39670992419](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39670992419), including backend TypeScript/Vitest and Android JVM/debug APK jobs.
- **Phase 4 — movement, floor lifecycle and world interactions: complete for implementation and automated acceptance.** Exact-SHA code `c0c231a501bb2996f261e7e9e4e5d66e4136d70b` passed [CI run 39850368287](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39850368287): both backend and Android jobs succeeded. The Phase 4 work items, acceptance criteria, tests and limits are recorded in the Phase 4 section and 2026-10-22 log below.
- **Latest code SHA tested green:** `c0c231a501bb2996f261e7e9e4e5d66e4136d70b`. Documentation commits may advance the branch head; never imply the docs commit is the same SHA as the tested code.
- **No physical two-device match or deployed Worker end-to-end run has been performed.** Phase 10 retains both as required release verification; passing CI does not prove live peer synchronization.
- **Next whole phase: Phase 5 — items and effects.** Phases 5–10 remain open; Phase 4’s implementation and automated acceptance do not establish live two-device readiness or project-wide release completion.

## Architecture Reference

- Native engine: Actor.java, Char.java, Hero.java, Mob.java, Level.java, Dungeon.java, GameScene.java.
- Snapshot/reconciliation: multiplayer/SPDLevelSnapshot.java and multiplayer/WorldSnapshot.java.
- Session/event/routing: multiplayer/MultiplayerManager.java and multiplayer/MessageRouter.java.
- Legacy overlapping receiver to audit/migrate: multiplayer/RemotePlayerActionReceiver.java.
- Native transport/action bridge: NetworkMessage.java, MessageType.java, NetworkActionType.java, NetworkActionBridge.java, MultiplayerActionDispatcher.java, InternetTransport.java, LANTransport.java and BluetoothTransport.java.
- Native combat contracts: NativeCombatAuthorityPolicy.java, NativeCombatJson.java and NativeMobCombatDelta.java.
- Worker/Durable Object room: server/src/index.ts. Backend tests: server/src/index.test.ts. Protocol: protocol/schema.json.
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

## Phase 5 — Complete Inventory, Loot, Items, Buffs and Timed Effects

**Priority:** P0/P1

### Work items

- [ ] Make pickup a transaction over a stable item/entity ID, heap ID, depth and player. Do not identify an item only by class name or cell position.
- [ ] Fix loot-claim persistence keys to include depth and stable heap/item IDs; make pickup, stack decrement, inventory update and event publication atomic/idempotent.
- [ ] Reconcile partial heaps item-by-item on every client. Never remove the whole heap when one item is taken unless it becomes empty.
- [ ] Synchronize chest opening and key consumption, shop purchases and gold, item drops, thrown/missile items, item consumption, equipment changes, quickslots, alchemy, mining and abilities.
- [ ] Persist each player's native inventory and hero state on every relevant state change, not only opportunistically with a generic action payload.
- [ ] Preserve item bundles, stack quantities, curse knowledge, upgrades, enchantments, glyphs, unique IDs, container contents and item-specific state. Do not use class-constructor defaults when the exact bundle is required.
- [ ] Synchronize buffs/debuffs, shields, DOTs, duration, cooldown and expiry; apply expiration once and handle actors removed while effects are active.
- [ ] Verify death drops, boss drops, special heaps, remains, bones, dew, quest items, keys and reward/statistics effects do not duplicate on snapshot restore.
- [ ] Add tests for competing pickups, partial stacks, same cell on different depths, shop purchase races, inventory restoration and temporary effect expiry.

### Acceptance criteria

- A picked-up/dropped/consumed item has one owner and one final state on all devices.
- Inventory/equipment/buffs survive disconnect and restore exactly from native state.
- Loot, gold, quest progress and kill rewards cannot be duplicated by replaying actions or snapshots.

## Phase 6 — Make Internet, LAN and Bluetooth Sessions Actually Connect

**Priority:** P0

### Work items

- [ ] Separate transport connection from room creation/joining and match readiness. The UI must wait for explicit server/host confirmation before starting the run.
- [ ] Fix LAN host startup so the host is the authority and does not accidentally connect to itself through the client path. Validate host/guest addressing, discovery, bind address, ports and failure cleanup.
- [ ] Wire a real Android Bluetooth provider into `BluetoothTransport`, including discovery/pairing/permissions and stream callbacks. If no provider is available, show “unsupported/unavailable” and fail instead of returning a false connected state.
- [ ] Validate the WebSocket implementation against a standards-compliant endpoint: handshake headers, masking/framing, fragmentation, payload limits, TLS, ping/pong, timeout and close handling.
- [ ] Implement explicit create/join/leave/ready/start/room-state flows and correct room capacity per mode.
- [ ] Add connect timeout, retry, cancellation, reconnect, backoff, duplicate-session prevention and clear user-visible error messages.
- [ ] Make callbacks thread-safe and marshal scene/UI changes onto the game render thread.
- [ ] Test Android 6+ permissions/API differences, background/screen-off behavior, network changes and slow connections.

### Acceptance criteria

- Two physical devices can create/join the same room using each transport that is declared supported.
- A failed transport never reports success or silently launches a fake match.
- The room has one known authority and a stable player/session identity.

## Phase 7 — Finish Game Modes, Death, Revival and Match Lifecycle

**Priority:** P1

### Work items

- [ ] Turn `CoopMode`, `PvPMode`, `DeathmatchMode` and `SurvivalMode` settings into enforced server and client rules rather than descriptive classes only.
- [ ] Implement readiness and match start, mode/party capacity, game-over conditions, score/kills/deaths, spectator state, auto-respawn, revive requests and revive resource/cost rules.
- [ ] Make death state, death animation, inventory/drop behavior, revive HP, action availability and actor removal consistent across all clients.
- [ ] Implement reconnect behavior for dead/spectator players and handle the final living player or disconnected host according to the selected mode.
- [ ] Ensure PvP visibility/FOV filtering cannot hide required state from a co-op partner or leak hidden arena information.
- [ ] Add mode-specific acceptance tests, including kill limit, simultaneous kills, leaving/rejoining, host departure, revive while another player acts and match end.

### Acceptance criteria

- Each mode's advertised rules are enforced in both UI and server state.
- Death/revive/respawn and score changes are exactly-once events.
- All clients agree whether the match is lobby, playing or ended.

## Phase 8 — Unify the Protocol, Events, Authority and Recovery

**Priority:** P0/P1

### Work items

- [ ] Make `protocol/schema.json` match `MessageType`, including `LEVEL_DATA`, and document every request/event/snapshot field.
- [ ] Use structured JSON parsing only. Remove brittle substring detection, manual unescaping and competing legacy event handlers once the typed path covers their behavior.
- [ ] Apply events only in sequence order, ignore already-applied sequences, detect gaps, deduplicate request IDs and request a full snapshot when replay is incomplete or invalid.
- [ ] Fix reconnect token/session lookup and ensure the reconnecting socket is attached to the correct player before it is marked connected.
- [ ] Ensure event log retention, snapshot fallback and world persistence are bounded, crash-safe and recoverable after Durable Object restart.
- [ ] Transfer level-publisher authority safely if the publisher leaves; persist a snapshot before authority changes.
- [ ] Use transactions for multi-table changes and schema migrations for existing Durable Object rooms.
- [ ] Add validation and rate limits for message size, room code, IDs, action count, depth, position, bundle payload, item count and client spam.
- [ ] Return structured errors that the client can display and recover from; do not swallow all failures without diagnostics.

### Acceptance criteria

- Duplicate, delayed, out-of-order and malformed messages cannot corrupt the match.
- Reconnect either replays a complete contiguous event range or receives a full snapshot.
- Server restart and authority handoff preserve one coherent world.

## Phase 9 — Finish Multiplayer UX and Remove False-Success Paths

**Priority:** P1

### Work items

- [ ] Review `TitleScene`, `MultiplayerTransportScene` and `MultiplayerSetupScene` as one user flow.
- [ ] Add clear host/join selection, room code entry/copy, IP discovery/manual input, Bluetooth device selection, selected mode/player limit and ready state.
- [ ] Show connecting, waiting for peer, syncing world, retrying, disconnected and match-start states. Disable controls while transitions/snapshots are incomplete.
- [ ] Replace hardcoded text with localized message keys and ensure every key exists in the supported language bundles.
- [ ] Add cancel/back/leave behavior and guaranteed cleanup for sockets, listeners, authority state and pending actions.
- [ ] Ensure no placeholder map, dummy mobs, stale local objects or fabricated state are shown as real match data.
- [ ] Audit layout on phone/tablet and portrait/landscape, safe insets, long room codes, Arabic/RTL strings and touch targets.
- [ ] Add UI-level tests where feasible and a manual checklist for all failure states.

### Acceptance criteria

- A first-time user can host and join without knowing implementation details.
- Connection/sync failures are visible and recoverable.
- The UI never claims a match is ready until both session and world state are ready.

## Phase 10 — End-to-End Verification, Release Readiness and Maintenance

**Priority:** Final gate

### Work items

- [ ] Expand backend tests to instantiate/test the Durable Object action flow instead of testing only helper examples.
- [ ] Add Java tests for snapshot parsing/validation and deterministic reconciliation where the engine/test environment allows.
- [ ] Add automated scenarios for two players, all supported actions, combat misses/hits, mob turns, loot races, floor changes, reconnect gaps, duplicate events, host disconnect and server restart.
- [ ] Run backend typecheck/tests and Android debug APK compilation on the final commit; investigate and fix all failures before returning.
- [ ] Run a real two-device manual test matrix for each supported transport and record device/Android version, scenario, expected result and actual result.
- [ ] Verify deployment configuration and Worker endpoint, then perform a fresh-room smoke test against the deployed service.
- [ ] Inspect logs for silent exceptions, stale actors, duplicate drops, invalid action acceptance and sequence gaps.
- [ ] Update this roadmap and `GPT.md` with what was verified, remaining limitations and exact commit/run links.
- [ ] Create a release only after the acceptance criteria below pass; do not label an untested transport or game mode as supported.

### Final acceptance criteria

- Two physical devices complete a full co-op run segment together, including movement, native combat, mobs, loot/inventory, temporary effects, a floor transition and reconnect recovery.
- Each advertised competitive mode passes its mode-specific tests.
- No known P0 issues remain; CI is green for the exact final commit; real-device results are documented.
- All supported transports are genuinely operational, or unsupported ones are clearly disabled instead of falsely reporting success.

---

## Execution Rules for Future Phase Requests

- “Start Phase N” means complete **all** tasks and acceptance criteria in that phase, including its dependent fixes and tests, before reporting completion.
- Work on `multiplayer-framework-core-14118577486727081892` unless explicitly instructed otherwise. Do not silently switch branches or merge this work into the default branch.
- Inspect the current branch and latest commit before editing; another phase or manual change may have landed since this file was written.
- Read the relevant current code before changing it. Avoid duplicating completed work; update existing code paths instead of adding parallel implementations.
- Keep Java SPD engine behavior as the gameplay reference. Never label a generic server approximation as native-equivalent.
- Use English commit messages. Report the exact commit SHA and actual CI result. Do not claim device testing unless physical devices were tested.
- Update this file and `GPT.md` when a finding changes, a phase is completed, or new blockers are discovered.
- Keep the roadmap tied to code. If an item turns out to be already implemented, verify it against its acceptance criteria and mark it accordingly instead of rewriting it.

## Current Audit and Verification Log

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

