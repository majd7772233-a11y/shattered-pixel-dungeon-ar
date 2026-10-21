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

- **Phase 1 — Lossless native snapshots/restoration: complete for implementation and automated acceptance after cross-layer re-verification.** The final snapshot-consistency code SHA is `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`; [CI run 39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) succeeded for this exact SHA, with both backend and Android jobs green. The audit fix rejects conflicting or incomplete snapshots before server persistence and adds negative regression tests. Physical two-device testing remains in Phase 10.
- **Phase 2 — Native combat replication: complete for implementation and automated acceptance.** Tests cover native hits/misses, shield-only outcomes, retaliation/attacker post-state, blessed Ankh, delegated kill rewards, periodic Mob damage, Mob-to-player damage, PvP, secondary stable-ID Mob deltas and replay/stale-event handling.
- **Latest verified snapshot-consistency code:** `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`. **CI:** [39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) — exact-SHA backend TypeScript build/tests and Android JVM tests/debug APK build passed. Later documentation commits must preserve the distinction between code SHA and branch HEAD.
- **No physical two-device match has been performed by CI.** Phase 10 retains this as a required release verification step.
- **Phase 3 is next.** Phases 3–10 remain open. Phase 1/2 success does not establish native Mob scheduler parity, complete floor/interactions, transactional inventory, working transports, enforced modes or release readiness.

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

### Work items

- [ ] Choose one authoritative execution model for mobs and actor turns. Do not run native AI independently on each client while the server also simulates the mob.
- [ ] Replace generic server AI/pathfinding as gameplay truth. Preserve native per-mob state (sleeping, wandering, investigating, hunting, fleeing, passive, target, alerted flags, buffs, subclass-specific behavior, special attacks and cooldown).
- [ ] If the server remains TypeScript-only, treat its pathing as non-authoritative transport/display logic only; it must not claim to match SPD AI. Otherwise provide an engine-backed authority capable of running the Java SPD actor scheduler.
- [ ] Serialize/restore native effective speed and remaining cooldown, not only `baseSpeed`; include modifiers from buffs, armor glyphs, challenges, status effects and mob-specific overrides.
- [ ] Ensure actor turn ordering, ties, action costs, delayed actions, paralysis/stun/time stop, DOTs, regeneration, respawners and actor removal match the native scheduler.
- [ ] Replicate mob moves, attacks, special effects, deaths and drops as sequenced events; never re-run mob death/reward code on clients merely to update HP.
- [ ] Handle mobs targeting either co-op player according to actual alignment, FOV and native AI rules.
- [ ] Add scenario tests for sleeping mobs, out-of-sight players, obstacles/diagonal corners, fleeing, special mob attacks, speed buffs, simultaneous actor turns and disconnected targets.

### Acceptance criteria

- Every mob action has one authoritative outcome and one sequence number.
- Mob AI behavior and turn timing come from the native SPD rules; no generic damage/pathing approximation is presented as equivalent.
- Clients do not independently produce conflicting mob actions.

## Phase 4 — Complete Movement, Floors, Doors and World Interactions

**Priority:** P0/P1

### Work items

- [ ] Define authoritative action lifecycle: local intent, server acceptance/rejection, native action resolution, event broadcast and final reconciliation.
- [ ] Validate movement against the current snapshot's real terrain, occupancy, pits, diagonals, roots/immobility and native action cost. Reconcile rejected optimistic movement.
- [ ] Complete stair/transition handling with branch, depth, destination type, level seed, level data publication, transition acknowledgement and atomic floor swap.
- [ ] Ensure all clients enter the same destination floor before actions resume; do not infer that a floor is ready from depth alone.
- [ ] Synchronize doors, locked doors, secret doors, barricades, destructible terrain, mining, traps triggered by movement, wells, plants and other native level mutations.
- [ ] Validate branch support. Until nonzero branches are fully implemented, reject them clearly rather than accepting an incompatible snapshot.
- [ ] Transfer hero state and native inter-level inventory/keys/quests correctly; avoid resetting progression or duplicating items during a floor change.
- [ ] Add tests for invalid movement, occupied tiles, transitions, locked floors, stairs, branch mismatch, missing next-floor snapshot and simultaneous floor transitions.

### Acceptance criteria

- Both devices see the same map and stand on valid cells after every move.
- Floor transitions do not strand either player, reset the wrong state or permit actions against the previous depth.
- Doors, traps and other terrain changes converge and remain correct after reconnect.

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
