# Multiplayer Completion Roadmap

> **Scope:** Complete the multiplayer implementation in this repository without replacing or approximating Shattered Pixel Dungeon's original Java gameplay rules.
>
> **Audited branch:** `multiplayer-framework-core-14118577486727081892`
>
> **Audit baseline:** `657ce010edb03b55707d2b6d496abbb07b36fa7a`
>
> **Baseline CI:** GitHub Actions run `38759441278` completed successfully for that exact commit (backend typecheck/tests and Android debug APK compilation). This confirms compilation and the current automated checks only; it does **not** prove a two-device match works end-to-end.
>
> **Important:** This roadmap starts from the current code state. It does not ask future work to recreate features already present. Each phase includes the unfinished work and concrete acceptance criteria.

## Product Goal and Definition of Done

Deliver real multiplayer Shattered Pixel Dungeon gameplay on two or more devices. Players must enter the same match, start the same run, see a consistent world, act concurrently without duplicated or lost turns, and remain synchronized through combat, loot, temporary effects, level transitions, death/revival, disconnects and reconnects.

The original SPD Java engine remains the source of gameplay truth: its level generation, hit chance, defense, weapon/armor calculations, buffs, item effects, mob-specific AI, actor cooldowns and game rules must not be re-created with generic TypeScript approximations. The server is responsible for session coordination, ordering, validation, persistence and distributing trusted state changes. Where gameplay is authoritative on a device, the protocol must validate and reconcile its results without allowing clients to submit arbitrary outcomes.

A phase is complete only when all of its tasks and acceptance criteria are satisfied, the affected paths have been reviewed, relevant tests pass, and the result is committed on this branch. A feature is not complete merely because a class, enum, button, event name or placeholder implementation exists.

## Current Baseline: Implemented Pieces (Not Equivalent to Finished Multiplayer)

The current branch already contains:

- A multiplayer entry point in `TitleScene`, a transport selector in `MultiplayerTransportScene`, and a setup screen in `MultiplayerSetupScene`.
- Transport abstractions and implementations for Internet/WebSocket, LAN, and a Bluetooth provider interface.
- `MultiplayerManager`, protocol message types, action mapping, event routing, and a Cloudflare Durable Object room server in `server/src/index.ts`.
- A seed handoff intended to align runs before level generation.
- `SPDLevelSnapshot`, which exports a level produced by the actual Java SPD engine: tile geometry, transitions, mobs, heap items, traps, blobs, plants, and a hero-state bundle.
- `WorldSnapshot` and `MessageRouter` code for restoring/reconciling map tiles, transitions, mobs, heaps/dropped items, traps, blobs, plants, player HP/positions, hero inventory/combat data, and temporary buffs.
- Native combat-result reporting from the Java engine for player attacks, and a hero-damage synchronization action.
- Server-side sequencing, persisted event rows, reconnect attempts, level-snapshot storage, movement/pathfinding helpers, and a basic automated CI workflow.

These pieces are the starting point, not evidence of complete behavior. The most important remaining problem is that the current system still mixes local SPD simulation with a simplified server-side simulation, and several transport, event-reconciliation and validation paths can disagree.

## Audit Findings and Known Risks

### P0 — Must be resolved before calling the game playable

1. **Snapshots are not yet a proven lossless reconstruction contract.** The exporter carries many dynamic objects, but restore paths need a single schema/versioned reconciliation pass, explicit handling for absent/empty collections, identity stability, actor scheduling, map metadata and unsupported object types. A missing/invalid bundle is often swallowed and skipped, which can silently produce a different world.
2. **Mob identity is fragile.** Snapshot reconciliation first relies on local actor IDs and then class-name fallback. Actor IDs are local scheduler identities, not guaranteed cross-device persistent IDs; two same-class mobs can be matched to the wrong entity. Dead-mob tombstones and loot creation must be deterministic and idempotent.
3. **The server's mob logic is not the original SPD AI.** `MatchRoom.processMobTurns()` uses generic target selection and pathfinding. It does not execute each native mob's `Mob.act()`, subclass abilities, special attacks, fleeing/passive/sleeping behavior, buffs, field-of-view rules, damage logic or all turn costs. In adjacent range it advances a cooldown but does not resolve a native mob attack. The current `1 / baseSpeed` approximation omits effective speed modifiers and actor-specific costs.
4. **Native combat results still require trust-boundary hardening.** Java now reports native hit/damage/HP and the server validates target/range fields, but a client-provided `engineResult` flag is not proof that the result came from an honest engine. The server must reject impossible HP/damage transitions, duplicate outcomes, stale targets, forged target IDs and replayed actions. Do not replace SPD's combat formulas with server RNG to solve this.
5. **The event receive paths overlap.** `MessageRouter` applies structured `EVENT_BATCH`/accepted actions, while `RemotePlayerActionReceiver` still uses substring checks and legacy parsing. The latter can remove a whole heap when another player picks up one item, apply events twice, or parse an unrelated number as a position/HP. There must be one typed, sequence-aware event application path.
6. **Multiplayer action coverage is incomplete.** The server currently has explicit handling for core actions such as movement, level transition, attacks, wait, pickup, chest opening and hero-state synchronization. The action bridge also maps buying, interacting, unlocking, mining, alchemy, item use, abilities and revive, but mapping an action does not mean the server implements or reconciles it.
7. **Transport setup can claim success too early.** `MultiplayerSetupScene` starts the game scene immediately after calling `startSession`, rather than waiting for a validated session/match-ready result. LAN host setup starts a server and then also invokes the normal connect flow using a loopback endpoint; this needs a real host-authority path and two-device verification. Bluetooth depends on an injected `NativeBluetoothProvider`; when it is absent, the current implementation can report a connected state without a real Bluetooth link.
8. **Level authority and transitions need a single lifecycle.** The server creates a fallback rectangular placeholder level before it receives native `LEVEL_DATA`; a match must not present that placeholder as a real SPD floor. The level publisher is tied to a client, the snapshot replacement path needs atomic validation/storage, and publisher disconnect/depth transition must not strand the room or leave clients on different floors.
9. **Persistence and loot claims need stronger keys and transactions.** `claimed_items` uses `item_pos` as its primary key while also storing depth, so identical cell positions on different floors can collide. Item removal, inventory state, heap contents and kill-generated loot must commit atomically and be idempotent.
10. **Automated tests are too shallow for the risk.** `server/src/index.test.ts` mainly tests standalone message examples and toy arithmetic/pathing. It does not instantiate the room and test real actions, snapshots, authority, duplicate requests, two players, reconnects, or complete SPD serialization/restoration. Current CI success is a compile/check baseline, not end-to-end proof.

### P1 — Important gameplay consistency and player-visible correctness

- Verify that map dimensions, terrain, transitions, heaps, traps, plants, blobs and all actor positions are applied before a snapshot is considered ready. Rebuild/recreate visuals on the render thread and recompute pathfinding/FOV as required by the original engine.
- Audit level fields beyond tile flags: visited/mapped/fog state, level lock/feeling/branch-specific metadata, custom tiles/walls, respawner state and inter-level transfer state. Explicitly serialize anything that affects visible or playable behavior; document any intentionally local-only data.
- Restore each native item using its bundle and preserve quantity, curse state, level, unique properties, container contents, equipment/quickslots and ownership. Class-constructor fallback is best-effort only and must not silently replace a special item with a different one.
- Ensure every player has a native state bundle for class/subclass, talents, strength/level/experience, equipment, buffs and cooldowns. Reconcile hero position, HP/HT, death state and action readiness without replacing the local scheduler identity accidentally.
- Prevent a local client from continuing to execute authoritative mob turns while the server independently moves the same mobs. Establish exactly one authority model and make it explicit in code.
- Implement action idempotency and ordering consistently: request IDs, sequence numbers, duplicate replay, rejected actions, out-of-order events, stale depth and snapshot fallback.
- Verify shared-world co-op versus arena/deathmatch semantics: friendly fire, player visibility/FOV, death, spectator state, kill/score counters, respawn/revive and match-end conditions.
- Ensure room capacity, ready/start flow, late join, disconnected players, host departure and match teardown behave predictably.
- Improve errors and UI states: connecting, creating/joining, waiting for the other device, failed connection, invalid room/IP, missing Bluetooth provider/permissions, host discovery, retry, leave and resync. Never silently proceed into a false-success game.
- Bring `protocol/schema.json` into agreement with actual message types and payloads, including `LEVEL_DATA` and all event payloads. Validate payloads on both sides with explicit size/range limits.
- Review network implementation details: WebSocket handshake/framing, message-size limits, timeouts, keepalive, TLS, disconnect cleanup and callbacks must be tested on the target Android versions.

### P2 — Release quality

- Add repeatable integration tests and a documented manual two-device matrix for Internet, LAN and Bluetooth (Bluetooth only after a real provider is wired).
- Add structured diagnostics for rejected actions, snapshot parse/restore failures, sequence gaps, authority changes and disconnect reasons. Avoid empty catch blocks that hide a broken state.
- Confirm the deployed Worker URL/configuration matches the endpoint in `MultiplayerSetupScene`; document deployment and room lifecycle without requiring Wrangler CLI on Android.
- Verify Android permissions, min/target SDK implications, device sleep/background behavior, reconnect after network changes, and release build behavior.
- Remove dead/duplicate legacy handlers and obsolete placeholder logic only after replacement paths are covered by tests.

---

## Phase 1 — Establish a Lossless, Validated World Snapshot

**Priority:** P0  
**Status:** In progress. Stable server identities now flow through snapshot publication, ACK mapping, reconciliation and mob attack targets; native custom-tile/wall and respawner metadata is included; failed/stale restores request resync without acknowledging the snapshot. Fully prepared rollback-safe restoration, full native round-trip coverage and two-device convergence still require verification.

### Work items

- [x] Define one documented snapshot schema/version shared by `SPDLevelSnapshot`, `MessageRouter`, `WorldSnapshot`, the server's `LEVEL_DATA` validator, `getCurrentLevelSnapshot()`, and `protocol/schema.json`.
- [ ] Audit every serialized field against the native SPD object it represents. Include dimensions/branch/depth/seed, tiles and collision flags, transitions, stable mob identity and native state, heap type and every item bundle, traps, plants, blobs, hero bundle, inventory, buffs and actor cooldowns.
- [x] Add stable server-assigned entity IDs that survive reconnects and do not depend on local `Actor.id()`. Keep native actor IDs as local runtime identities only; IDs now map through publication ACKs, snapshots and mob attack target resolution.
- [x] Make absent collection versus explicit empty collection semantics clear. A complete snapshot with zero traps/heaps/mobs must clear stale local objects; a partial snapshot must never accidentally clear them.
- [ ] Validate bounds, duplicates, bundle size, class allowlists, array counts, numeric ranges and depth/branch before changing the live world.
- [ ] Make restoration ordered and atomic from the caller's perspective: validate first, prepare native objects, apply world geometry, reconcile entities, then publish the snapshot as applied. On failure, keep the last good state and request a fresh snapshot.
- [x] Reconcile all entities both ways: create missing native instances, update matched instances, remove stale instances safely, and preserve tombstones for dead entities without rerunning kill rewards/loot. Stable IDs are cleaned up on removal, and remote death events remove entities without calling native loot-producing `Mob.die()`.
- [ ] Restore complete heaps without losing stack order, item properties, special heap state or remaining items. Restore traps/plants/blobs with their real native bundles and scheduler timing.
- [ ] Rebuild visuals on the render thread; refresh map cells, FOV, pathfinding dimensions and actor sprites after geometry changes.
- [x] Audit and include gameplay-relevant level metadata omitted by the current snapshot (map exploration state, level lock/feeling, custom tiles/walls, mob spawn classes, respawner bundle and remaining cooldown, and native transitions).
- [ ] Add round-trip, missing-entity, stale-entity, empty-list, invalid-bundle, duplicate-ID, killed-mob/tombstone, multiple-items-in-one-heap and reconnect snapshot tests.

### Acceptance criteria

- Two clients applying the same valid snapshot converge on the same playable level and entity/item state.
- A reconnecting client can reconstruct a world even when its local generated floor or entity set differs.
- A full empty collection removes stale local objects; malformed/incomplete data never silently marks the world synchronized.
- Reapplying the same snapshot is idempotent and does not duplicate actors, loot, buffs or visuals.
- Server and Android CI pass; snapshot contract tests cover both valid and invalid payloads.

## Phase 2 — Make Native SPD Combat Replication Correct and Safe

**Priority:** P0  
**Dependency:** Phase 1 entity identity and snapshot state.

### Work items

- [ ] Trace native combat end-to-end in `Char.attack`, `Char.hit`, `Char.drRoll`, `Hero.attack`, `Mob.attack`, `Hero.damage`, `Char.damage`, armor/weapon procs and relevant buffs.
- [ ] Preserve the native engine's exact hit/miss outcome, damage after armor and procs, target HP/HT, death outcome, attacker/target identity, ranged/melee kind, actual action cost and effects such as shields, knockback, curses and kill-triggered loot.
- [ ] Define a combat event payload with schema version, match/depth, sequence, request ID, stable attacker/target IDs, pre-state and post-state, and a native outcome record.
- [ ] Harden server validation: ensure the target exists/alive/on the same depth, the request is fresh, the range and attack kind are legal, the HP transition is possible, and the event is not a replay. Do not accept arbitrary client HP/damage just because `engineResult` is true.
- [ ] Decide and implement how native outcomes are trusted. Prefer an authority capable of running the original Java engine; if client-resolved combat remains the architecture, define the trust model and detect/reject impossible state changes instead of pretending the server independently reproduced SPD RNG.
- [ ] Replicate misses as real consumed turns, and replicate zero-damage hits, shield-only damage, buffs, armor procs, death and loot exactly once.
- [ ] Ensure remote hero instances use the correct class/subclass/equipment/talents/buffs before any native combat calculation.
- [ ] Remove duplicate/contradictory damage application paths between `MessageRouter` and `RemotePlayerActionReceiver`.
- [ ] Add deterministic contract tests for legal/illegal range, stale target, miss, damage, armor reduction, invulnerability, death, repeated request, forged HP and kill loot.

### Acceptance criteria

- The game outcome is generated by native SPD combat code, not server-side generic random damage.
- All clients converge to the same target HP/death/loot state and never apply a combat event twice.
- A modified client cannot set arbitrary target HP, attack a nonexistent/out-of-range target, or replay a successful hit.
- Combat consumes the correct native turn cost for hits, misses and special attacks.

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

## Audit Notes

- This is a code-based gap assessment of the current multiplayer implementation and its key integration points, protocol, backend, tests and CI. It is not a claim that all 2,174 repository tree entries were manually read line-by-line in a single pass; phase execution must continue the file-by-file review for every affected subsystem.
- The current automated workflow passing is a useful baseline, but the current backend tests do not exercise a real Durable Object match or physical two-device play.


---

## 2026-10-16 Continuation checkpoint — NOT a phase completion

- The current user request continues **Phase 1 (complete snapshot/world reconstruction), Phase 2 (native combat replication), and Phase 3 (native mob AI/Actor scheduler)**. Existing scaffolding is not sufficient to mark these phases complete.
- See `MULTIPLAYER_CONTINUATION_NOTES.md` for the precise resume prompt, current branch/commit, implementation already present, code paths to inspect, outstanding defects and required verification.
- Current branch head before this documentation update: `ba97f1b71605bec2e5642355fe0fcbc1add08f68`; latest gameplay-code commit: `657ce010edb03b55707d2b6d496abbb07b36fa7a`.
- Last known green CI: run `38759441278` for the exact gameplay-code commit `657ce010edb03b55707d2b6d496abbb07b36fa7a`. Recheck Actions for newer runs and verify the exact head SHA before reporting status. This is not evidence of real two-device play.
- Current known implementation includes native snapshot export/restore scaffolding for mobs/buffs, heaps/items, traps/plants/blobs, hero inventory/combat state, and native hero combat/damage replication. Remaining P0 gaps include stable entity/item IDs, idempotent full-snapshot semantics, safe exact bundle restoration, depth-aware durable item ownership, complete inventory/drop/effect lifecycle, replay/forgery validation, and native effective timing/AI rather than generic TypeScript approximations.
- **Do not check off Phase 1, 2, or 3** until each phase's listed work items, acceptance criteria and automated tests have been verified. Continue on `multiplayer-framework-core-14118577486727081892`; do not merge into the default branch.


## 2026-10-16 implementation checkpoint — work in progress

- Current gameplay code commit under validation: `25955a6d8e21f1947a4ac5c7afe7d3971cc76c4c`.
- Workflow run: [Multiplayer Branch Validation #127](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38809893294). At the time of this note it is **pending**, so no result is claimed.
- `WorldSnapshot.java`: removed constructor-default fallback creation for missing native mob/item/trap/plant/blob bundles. Snapshot restoration failures from previously empty catch blocks now emit game diagnostics. This avoids silently substituting default objects, but strict restoration, preflight validation, resync-on-failure and cross-device stable entity IDs remain unfinished.
- `server/src/index.ts`: native combat reports are now rejected if target HP increases or reported damage does not equal the HP delta. The SPD combat formula remains in Java; this validation does not prove the client result itself is authentic.
- `server/src/index.test.ts`: added tests for accepted hit/miss HP transitions, impossible healing, mismatched damage and invalid numeric values. These tests require the pending workflow to confirm execution.
- Phase 1, Phase 2 and Phase 3 remain **in progress**. Native mob AI/scheduler parity, full snapshot reconstruction, stable entity/item identity, durable inventory/loot ownership, replay-resistant authority and real-device verification are not complete.


## Verification correction — 2026-10-16

- A first Android compilation of the strict-bundle/logging changes failed because five catch clauses still listed `ReflectiveOperationException` after constructor fallback code had been removed. This failure was inspected from Actions logs, and the obsolete checked exception types were removed in commit `63da31501485255c4ebae7b9f6bd04f4ae511fdb`.
- The new validation run for that fix is [38810085987](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38810085987), pending at the time of this update. Do not report the Android build as passing until that exact run completes.
- The earlier backend job passed on code SHA `25955a6d8e21f1947a4ac5c7afe7d3971cc76c4c`, including TypeScript build and tests; that is not a passing full-workflow result for the latest code SHA.
