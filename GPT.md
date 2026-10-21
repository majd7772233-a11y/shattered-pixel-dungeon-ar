## Permanent execution rule from the user

When the user says “yalla phase N” or asks to finish a phase, implement the entire phase and all related acceptance criteria in one continuous effort—not just scaffolding, a status report, or a list of remaining work. Inspect the actual roadmap and code, complete dependent paths and tests, then run the build and tests against the exact final commit. If verification exposes defects, fix them and rerun before reporting. Do not claim completion without evidence; do not stop at “done except ...” for required phase items. Keep the response concise and direct, and never merge to `main` unless explicitly asked.

# GPT.md — Internal Project Operating Notes

> This file is the working memory and implementation guide for the AI continuing this repository. It is intentionally open-ended: append new findings, decisions, rules, verification results and user requirements as the project evolves. Do not treat it as a user-facing README.

## 1. Project Identity and Main Goal

- **Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`
- **Working branch:** `multiplayer-framework-core-14118577486727081892`
- **Game:** Arabic Shattered Pixel Dungeon codebase, based on the original Java/libGDX SPD engine.
- **Primary objective:** real multiplayer gameplay between two or more devices. Players should share a coherent match and world, perform actions, fight native mobs/other players, collect and drop items, preserve inventory and temporary effects, move between floors, and recover from disconnects without duplicated/lost actions.
- **Target transports represented in code:** Internet/WebSocket, LAN, and Bluetooth. Do not advertise any transport as working until it is actually wired and verified.
- **Internet Worker endpoint currently hardcoded in setup:** `https://spd-multiplayer.majd7772233.workers.dev/room/{roomName}/websocket`.
- **Branch head before the current documentation refresh:** `d335e3917d3038bbc9043be6b18cfb9b0abd191c`.
- **Latest validated gameplay code:** `8dde21303ac836c177457767d4c8e7c7e3ba7838`; CI run [39557655189](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39557655189) passed both backend and Android jobs.
- **Roadmap:** read `ROADMAP.md` before starting a task. Phase 1 and Phase 2 are complete for automated acceptance; Phase 3 is next.

## 2. Non-Negotiable Product and Engineering Rules

1. **Original SPD Java gameplay is the specification.** Combat hit chance, damage, defense, weapon/armor behavior, procs, buffs, actor timing, mob AI, item behavior and level generation must come from the original engine. Do not invent a TypeScript formula and call it SPD-equivalent.
2. **Do not lie to the player.** Never display placeholder maps/mobs as real game data, fake connection success, or report a transport/mode as functional without evidence.
3. **One authority per state transition.** Every movement, attack, mob turn, item transfer, death, floor change and temporary effect must have a single authoritative outcome. Local prediction is acceptable only with acknowledgement/reconciliation and rollback.
4. **No duplicate event pipelines.** There must be one typed parser and one sequence-aware state application path. Do not keep legacy string parsing alive alongside the structured router once migrated.
5. **No silent corruption.** Empty catch blocks around network, serialization or restoration errors are a defect. Preserve the last known-good state, emit diagnostics, and request resync when appropriate.
6. **Snapshots must be idempotent and complete.** Applying the same full snapshot twice must not duplicate actors, buffs, drops, inventory or visuals. An explicit empty collection means “remove all entities of this category”; a missing field must be handled according to a documented partial/full-snapshot contract.
7. **Use stable network entity identities.** Native `Actor.id()` is a local runtime/scheduler identity and must not be the sole cross-device mob identity. Use stable server/entity IDs and maintain a local ID mapping.
8. **Validate all untrusted payloads.** A client flag such as `engineResult: true` does not prove the reported combat outcome is honest. Validate action identity, target, range, state transition, sequence, request freshness and replay resistance.
9. **Keep the user’s requested branch.** Continue on `multiplayer-framework-core-14118577486727081892` unless explicitly told otherwise. Do not merge to the default branch or create unrelated branches as a workaround.
10. **Execute directly.** Avoid unnecessary questions, overlong preambles and repeating plans instead of doing the work. Inspect the latest code, implement the requested task, run the appropriate validation, commit with an English message, and report concrete results and remaining limitations.
11. **Phase means the whole phase.** When the user says “Phase N”, complete every subtask and acceptance criterion for that phase in `ROADMAP.md`; do not return halfway through it.
12. **Update project memory.** Keep `GPT.md` and `ROADMAP.md` synchronized when code findings, phase status, architecture or acceptance criteria change.
13. **No Wrangler CLI suggestions for Android.** The user has explicitly said `npx wrangler` does not work on their Android environment and does not want it suggested. Use GitHub-based edits/Actions and the available Cloudflare dashboard/workflows where appropriate.
14. **Do not claim unperformed tests.** Distinguish static review, backend tests, Android compilation, deployment smoke tests and real two-device play. A green compile is not proof of working multiplayer.
15. **Avoid unrelated rewrites.** Respect the existing SPD architecture and the smallest coherent set of files needed for the phase. If a cross-cutting redesign is necessary, explain the concrete reason in the code/docs and keep it aligned with the roadmap.

## 3. Architecture Map — Read These Before Editing

### Android / Java game engine

- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/Char.java`
  - Native hit calculation, attack pipeline, damage mitigation, defense, actor speed and base combat semantics. This is essential before changing combat replication.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/hero/Hero.java`
  - Player action execution, inventory/equipment, hero stats/talents/buffs, native attack result replication and hero damage sync.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/mobs/Mob.java`
  - Native mob AI states and transitions, native speed, attack/damage behavior, death and drop/reward lifecycle.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/Actor.java`
  - Actor IDs, scheduler ordering, cooldowns, `Actor.add/remove`, `spend`, `timeToNow`. Do not restore a scheduler object without understanding these semantics.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/levels/Level.java`
  - Native tile arrays and mutable world collections: transitions, mobs, heaps, blobs, plants, traps, custom tiles/walls, level lock and other level metadata.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/Dungeon.java`
  - Run seed, depth/branch, initialization and level switching. Multiplayer seed changes must happen before native generation, and floor switching must follow native lifecycle rules.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/GameScene.java`
  - Multiplayer level publishing is currently hooked into scene creation. This is also where render-thread/UI and map updates matter.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/TitleScene.java`
  - Multiplayer entry button.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/MultiplayerTransportScene.java`
  - Internet/LAN/Bluetooth transport choice.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/MultiplayerSetupScene.java`
  - Current transport setup, host/join assumptions, room/IP defaults and start-session behavior. Review this before claiming a transport is usable.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/HeroSelectScene.java`
  - Applies the authoritative seed before run generation; verify ordering whenever seed/session startup changes.

### Multiplayer Java package

Path: `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/`

- `MultiplayerManager.java`: session lifecycle, transport ownership, player registry, sequence tracking, pending requests, sending actions, seed reception and level publishing.
- `NetworkTransport.java`, `TransportCallback.java`, `NetworkMessage.java`, `MessageType.java`, `NetworkActionType.java`: protocol and transport contracts.
- `InternetTransport.java`: custom socket/TLS/WebSocket implementation; verify handshake, framing, fragmentation, ping/pong, timeouts and close handling.
- `LANTransport.java`: LAN discovery and socket host/client behavior; host setup currently needs correction/real-device verification.
- `BluetoothTransport.java`: provider interface and 2-player limit. It is not a complete native Bluetooth integration merely because the class exists.
- `EmbeddedMatchAuthority.java`: legacy/simple LAN authority; current behavior is only a rudimentary approximation and must not be treated as native SPD authority.
- `MultiplayerActionDispatcher.java` and `NetworkActionBridge.java`: convert native hero actions to network actions. An enum mapping alone does not mean the server implements that action.
- `MessageRouter.java`: structured message parsing and application of accepted actions/events/snapshots. This should become the sole typed event reconciliation path.
- `RemotePlayerActionReceiver.java`: legacy receiver with substring/unescape parsing. It overlaps with `MessageRouter` and is a known source of duplicate/wrong state changes; remove or refactor only after all behavior is covered by the typed path.
- `RemotePlayer.java` and `MultiHeroManager.java`: remote player model/instances. Remote hero identity and state must not be inferred from string fragments.
- `PlayerFOV.java`: local calculation of a hero's field of view; shared/competitive visibility policy needs mode-specific verification.
- `SPDLevelSnapshot.java`: exports state from the actual native SPD world. Extend this as the native snapshot schema evolves.
- `WorldSnapshot.java`: restores/reconciles the snapshot into a locally generated SPD level. This is a critical P0 subsystem.
- `CoopMode.java`, `PvPMode.java`, `DeathmatchMode.java`, `SurvivalMode.java`: rule descriptors. Check server enforcement as well; these classes alone do not implement a mode.
- `LootClaimManager.java`: in-memory position-only claim helper; do not rely on it as durable or depth-safe item ownership.

### Server, protocol and CI

- `server/src/index.ts`: Cloudflare Worker/Durable Object room authority, SQL schema, sessions, snapshot/level storage, actions, event log, reconnect, broadcast/FOV and simplified mob movement. Read the whole affected method before changing it.
- `server/src/index.test.ts`: current tests are mostly isolated examples and toy calculations; they do not yet exercise the actual Durable Object action lifecycle.
- `server/package.json`, `server/tsconfig.json`, `server/wrangler.jsonc`: backend scripts/build/deployment configuration.
- `protocol/schema.json`: protocol schema; it must match `MessageType` and actual payloads. Current schema is stale because the Java enum includes `LEVEL_DATA`, while the schema's message type list does not.
- `.github/workflows/multiplayer-ci.yml`: on relevant pushes, runs backend dependency install/typecheck/tests and Android `assembleDebug`. Docs-only commits may not trigger it because of the path filters.
- `.github/workflows/deploy-server.yml`, `.github/workflows/release.yml`: inspect before changing deployment/release behavior.

## 4. Current Verified State and Implemented Architecture

### Exact branch and CI state
- Repository: https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar
- Branch: multiplayer-framework-core-14118577486727081892. Never merge into main without explicit instruction.
- Branch HEAD before this documentation refresh: d335e3917d3038bbc9043be6b18cfb9b0abd191c.
- Latest validated gameplay code SHA: 8dde21303ac836c177457767d4c8e7c7e3ba7838.
- Workflow [39557655189](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39557655189) passed on that exact code SHA.
- Passed job 1: Backend typecheck and tests — Node 20, npm ci, TypeScript build and Vitest.
- Passed job 2: Android debug APK compile — Java 17, Gradle JVM tests and Android debug APK.
- Markdown-only edits may not trigger CI because workflow path filters target code/protocol/Gradle/workflow paths. Do not claim a code change has CI evidence unless the exact SHA was tested.
- Current repository tree contained 2,185 entries. Critical multiplayer code, native engine entry points, protocol/server tests and CI were reviewed. Do not claim every line of the full tree was read; review every affected file and caller in detail before editing.

### Phase status
- Phase 1, lossless native world snapshot/restoration: **complete for implementation and automated acceptance**.
- Phase 2, native SPD combat replication: **complete for implementation and automated acceptance**.
- Phase 3, native Mob AI and Actor scheduler: **next whole phase; open**.
- Phases 4–10 remain open. See ROADMAP.md for the entire indivisible phase scope and completion gates.
- No physical two-device match has been performed by CI; this must not be implied by the green workflow.

### Verified Phase 1 facts
- SPDLevelSnapshot exports schema/depth/branch/seed/dimensions/entrance/exit, tile and collision flags, transitions/exploration state, native metadata, stable Mob identities/bundles/state/buffs/cooldowns, heaps/items/heap flags, traps, plants, timed blobs and hero/inventory/combat/buff state.
- WorldSnapshot preflights full snapshots and bounds values/bundles before live state mutation. Full snapshots use explicit empty arrays to remove stale objects. Restore/reconcile occurs on the render/game thread.
- Stable server entity IDs are distinct from local Actor IDs. Missing Mobs are rebuilt from serialized native bundles and registered with the Actor scheduler; stale Mobs are removed without rerunning local loot/reward death logic.
- Ordered heaps preserve item state/order without merge-causing drop semantics. Custom tile/wall visuals and native Level metadata are restored. FOV recomputation must not invent visited cells.
- Same-active-depth/branch dimensions can be replaced using the proper native Level type. A forced mid-restore failure verifies rollback. The rollback baseline is captured from live native objects instead of a JSON round trip that may omit primitive zero defaults.
- Runtime test names include worldSnapshotReconstructsMissingStableMobAndRepeatedRestoreIsIdempotent, firstSnapshotFailureAfterResizeRollsBackToLocalNativeWorld, sameSnapshotConvergesAcrossTwoLocallyDifferentGeneratedWorlds, snapshotPreflightRejectsMalformedHeroBuffBeforeChangingLiveWorld and worldSnapshotRestoresNativeHeapTrapPlantAndTimedBlobIdempotently.
- MultiplayerLevelMetadataTest covers custom tile/wall Bundle round-trip, empty metadata, idempotent visual application and invalid respawner metadata.

### Verified Phase 2 facts and trust boundary
- Native runtime coverage includes hit/miss, zero damage, shield-only hits, actual defense/retaliation, attacker post-state, blessed Ankh, delegated kill XP attribution, periodic Mob damage, Mob-to-player outcomes, native PvP/Ankh, secondary Mob procs with stable IDs/full bundles, stale events, duplicate-death prevention and convergence across different local Actor IDs.
- NativeMobCombatDelta must keep explicit complete/deltas and zero-valued HP/HT/position/shield fields. libGDX prototype/default optimization can omit primitive zeros; map-based JSON serialization was rejected because type metadata broke decode.
- Worker is TypeScript/Cloudflare and cannot directly execute the Java SPD engine. A designated level-publisher native SPD engine resolves Mob combat; the PvP target owner resolves incoming PvP. Worker validates authority/request/identity/depth/geometry/trusted pre-state/native transitions/bundles/loot/replay, then persists and broadcasts.
- Client-sent engineResult=true is not proof of an honest engine. Do not call this cheat-proof. Phase 3 must decide whether a single elected Java publisher is the accepted trust model or a server-side JVM/native engine is needed for stronger integrity.
- Do not call native Mob.die() on a replica just to set its state; that can duplicate loot/reward. Use the authoritative tombstone/removal path.

## 5. Open Risks and Work After Phase 2

### Phase 3 — native Mob AI and scheduler
Existing TypeScript Mob-turn/path logic is not original SPD Mob.act(). Audit Actor/Char/Mob, Mob subclasses, buffs, target memory, FOV, action costs, native effective speed, cooldown, delayed actions and server turn logic. Pick one native authority; no client may independently advance the same Mob. If stronger trust needs server-side Java, implement/document that rather than pretending TS matches. Test special attacks, sleeping/fleeing/passive states, obstacles, both co-op targets, buffs/DOT/time-stop, scheduler ties, publisher disconnect and handoff without two active authorities.

### Phase 4 — movement and floor lifecycle
Trace every native action from input/dispatcher to server and back. A level transition requires branch/depth/seed, native destination generation, LEVEL_DATA acknowledgment and world-ready gate. Synchronize doors, terrain, traps, plants, quest/key effects and recover during reconnect/floor load. Never show a placeholder map as real state.

### Phase 5 — items/effects
Stable item/heap IDs must survive moves/snapshots/reconnect. Claims include room and depth. Pickup/drop/consume/equip/shop/throw, partial heaps, buff duration/expiry, shields, DOTs, Ankh/LostBackpack/death drops/reward stats must be transactional and exactly-once.

### Phase 6 — transports
InternetTransport, LANTransport and BluetoothTransport need real verification. LAN host must not accidentally run the ordinary client path. Bluetooth needs actual Android provider wiring and permissions or must display unavailable. Setup must wait for room and world readiness.

### Phase 7 — modes/lifecycle
Mode descriptors require server-enforced capacity/teams/target rules, score/win, death/spectator/respawn/revive, match-end and host/publisher departure semantics. Test simultaneous events and reconnect in each advertised mode.

### Phase 8 — protocol/recovery
MessageRouter is the target typed path. RemotePlayerActionReceiver legacy substring parsing overlaps and must be migrated with equivalent tests before removal. Verify schema against Java enums and Worker handlers; sequence gaps, duplicate/replay, stale snapshots, reconnect tokens, event retention, Durable Object restart/migrations, authority handoff and transaction boundaries need direct tests.

### Phase 9 — truthful UX
Audit TitleScene, MultiplayerTransportScene and MultiplayerSetupScene as one flow. Show authentic connect/auth/sync/world-ready/retry/disconnect states. Arabic/RTL and English, room code/address validation, cancel/leave cleanup, accessibility and no false-success states are required.

### Phase 10 — physical-device and release gate
No physical two-device test is currently claimed. Run and record real devices, Android versions, app SHA, Worker deployment and outcomes for every supported transport/mode; verify reconnect/resync, movement, Mob AI, combat, items/effects, floor changes, death/revival, publisher loss and server restart where supported. Exact-SHA CI and deployed Worker smoke test are required. Do not infer deployment correctness from compilation.



## 6. Recommended Work Method

1. Fetch the current branch head and verify it is still `multiplayer-framework-core-14118577486727081892`. Never assume the audit SHA is still current.
2. Read `ROADMAP.md` and identify the requested phase. Fetch the latest version of every affected file, including helper classes and tests.
3. Trace the flow end-to-end: native action -> dispatcher -> protocol payload -> server validation/persistence -> sequenced event -> typed client router -> native state reconciliation -> reconnect snapshot.
4. Before changing code, identify which existing implementation should be extended and which legacy path conflicts with it.
5. Implement the complete phase, including dependent code paths, schema, migration and tests. Do not stop after adding an enum, field or event name.
6. Run appropriate validation. For server changes, run the workflow's TypeScript build and tests. For Java changes, run Android debug compilation. For protocol/world changes, add focused tests and perform two-device tests when available.
7. Inspect the latest GitHub Actions run for the exact final SHA. If it fails, fetch the failing job logs, fix the cause and rerun. Do not report a prior commit's green status as proof for a newer commit.
8. Commit with a concise English message on `multiplayer-framework-core-14118577486727081892`.
9. Update phase status in `ROADMAP.md` and add a dated note here with changed files, exact commit, test status and remaining gaps.
10. In the final user response, report what actually changed, exact commit link, actual CI status, and what remains. Be direct; do not pad the answer with a long plan or claim unperformed real-device testing.

## 7. Definition of “Done”

The project is not done when it compiles or when two clients merely connect. Done means:

- Two physical devices can join the same real room and initialize a consistent native SPD run.
- Each gameplay action has one accepted/rejected result, one sequence, and consistent reconciliation.
- Native SPD combat, mob AI, actor timing, items, buffs and floor transitions remain correct.
- Snapshots reconstruct the complete gameplay-relevant world after reconnect or local divergence without duplicates or missing objects.
- Inventory/loot/death/revive/mode rules are consistent and exactly-once.
- Each advertised transport works on real devices; unsupported transports do not fake success.
- Backend integration tests, Java/build checks and the two-device acceptance matrix pass for the exact release commit.
- The roadmap has no unresolved P0 items and known limitations are documented honestly.

## 8. Append-Only Working Log (Keep This Section Open)

### 2026-10-21 — Current state supersedes older checkpoints

- Branch head before this documentation update: d335e3917d3038bbc9043be6b18cfb9b0abd191c. The current validated gameplay code is 8dde21303ac836c177457767d4c8e7c7e3ba7838.
- CI run 39557655189 passed on the exact gameplay SHA. Backend build/tests and Android JVM tests/debug APK compilation both passed.
- Phase 1 automated acceptance is complete: stable-ID Mob reconstruction, stale cleanup, idempotency, rollback after forced resize failure, native heap/trap/plant/timed-blob restore and independent-world convergence are tested.
- Phase 2 implementation and automated acceptance are complete: native hit/miss/shield/retaliation/Ankh/reward/Mob-to-player/periodic/PvP/secondary-Mob paths are covered by runtime and backend contract tests.
- Next whole phase is Phase 3, native Mob AI and Actor scheduler from one authority. Phases 3–10 remain open.
- No physical two-device run is claimed. Phase 10 must record it.
- Historical dated entries below preserve previous checkpoints; do not use their old phase status as current status.


### 2026-10-16 — Baseline audit and roadmap creation

- Audited the branch tree (2,174 entries; 1,320 Java files, 2 TypeScript files, 6 XML files, 35 paths matching test/spec naming) and reviewed the multiplayer package, key SPD engine integration points, server action/snapshot code, protocol schema, setup/title scenes, backend tests and CI workflow.
- Baseline commit: `657ce010edb03b55707d2b6d496abbb07b36fa7a`.
- GitHub Actions run `38759441278` succeeded for that exact SHA. This is compile/current-check evidence only, not real-device proof.
- Created `ROADMAP.md` with ten phases beginning with snapshot/reconstruction correctness and proceeding through native combat, native AI/scheduling, movement/transitions, inventory/effects, transport, game modes, protocol/recovery, UI and final end-to-end validation.
- Key confirmed risks: generic server mob AI does not equal native SPD AI; overlapping legacy/typed event handlers; shallow backend tests; stale protocol schema (`LEVEL_DATA` missing); LAN host flow and Bluetooth provider wiring need correction/verification; item claim key is not depth-safe; server trusts client-reported native combat fields too much; setup launches before a confirmed ready state.
- Next work starts at **ROADMAP Phase 1**. Do not restart previously implemented exporter/restore/combat scaffolding without checking the latest code and acceptance criteria.

### 2026-10-16 — Continuation checkpoint for native world restoration/combat

- User's active request: continue implementation of missing-world-entity reconstruction, dropped items/heaps, inventory, traps and timed effects, then match combat hit/miss, defense, damage and actor/action timing to original SPD Java engine. The user is moving to a new conversation because this one is lagging; use `MULTIPLAYER_CONTINUATION_NOTES.md` as the handoff document and do not ask the user to repeat context.
- Current branch head at checkpoint: `ba97f1b71605bec2e5642355fe0fcbc1add08f68` (documentation checkpoint); latest gameplay code commit before docs: `657ce010edb03b55707d2b6d496abbb07b36fa7a`.
- Last known green workflow run: `38759441278`, success for exact gameplay SHA `657ce010edb03b55707d2b6d496abbb07b36fa7a`. Recheck Actions for later runs before relying on this status. It does not prove two-device play.
- Added `MULTIPLAYER_CONTINUATION_NOTES.md` containing the exact resume branch, commit/workflow state, known code already present, specific unresolved gaps, next execution sequence and a copy-paste prompt for the next conversation.
- Current code already contains native snapshot export/restore scaffolding for mobs and buffs, heaps/items, traps, plants, blobs, hero combat/inventory/buffs, and native hero attack/damage outcome replication. Extend and test these paths; do not recreate parallel implementations.
- Critical gaps remain: stable network entity/item IDs; full and idempotent restoration contract; safe exact native bundle restoration without swallowed errors; durable depth-aware item claims; inventory and item lifecycle completeness; client-reported combat trust/replay validation; native effective speed and Actor scheduler/action costs; generic TypeScript mob AI is not native SPD AI. Phases 1, 2 and 3 in `ROADMAP.md` are NOT complete until their acceptance criteria and tests pass.
- Immediate continuation: inspect latest head and Actions; read `ROADMAP.md` and `MULTIPLAYER_CONTINUATION_NOTES.md`; audit current `WorldSnapshot.java`, `SPDLevelSnapshot.java`, `MessageRouter.java`, `RemotePlayerActionReceiver.java`, `Hero.java`, `Char.java`, `Mob.java`, `Actor.java`, `Level.java`, and `server/src/index.ts`; implement/fix tests; run backend typecheck/tests and Android `assembleDebug` on the exact code SHA; update the roadmap and report exact results.
- Durable execution rules reinforced: no unnecessary discussion, no false claims, no merge to main, no Wrangler CLI suggestions for Android, and no claim of physical two-device testing unless it occurred.

### Future notes

Append new dated sections here whenever a phase starts/completes, architecture changes, the user gives a durable rule, or verification reveals a new issue. Keep this file open-ended; do not replace this log with a closed summary.


## 2026-10-16 execution update — NOT COMPLETE

Code changes on `multiplayer-framework-core-14118577486727081892` are currently at `25955a6d8e21f1947a4ac5c7afe7d3971cc76c4c` (the code commit; subsequent documentation-only commits may advance branch HEAD). GitHub Actions run [38809893294](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38809893294) was pending when recorded; do not claim its tests passed until its final conclusion is checked.

Changes made:
- `WorldSnapshot.java`: removed constructor-default fallback objects when native serialized bundles are missing/invalid for mobs, items, traps, plants and blobs. Previously empty restore catches now log diagnostics instead of silently swallowing failures.
- `server/src/index.ts`: added `isValidNativeHpTransition` and applied it to player/mob attack reports. It rejects target HP increases and reported damage inconsistent with the HP delta; this is validation, not proof of an honest client-side native result.
- `server/src/index.test.ts`: added focused tests for hit/miss transitions, reported healing, mismatched damage and invalid numbers.

Do not mark Phase 1/2/3 complete. Still required: validate the entire snapshot before mutating the live level, trigger resync on failed restore, stable cross-device mob/item IDs, exact idempotent inventory/heap ownership, full native trap/plant/blob/buff/scheduler restoration, combat replay/authority hardening, native mob AI/timing authority, and end-to-end tests. The generic TypeScript mob simulation is not original SPD AI. No physical two-device test was performed.


## Verification correction — 2026-10-16

- A first Android compilation of the strict-bundle/logging changes failed because five catch clauses still listed `ReflectiveOperationException` after constructor fallback code had been removed. This failure was inspected from Actions logs, and the obsolete checked exception types were removed in commit `63da31501485255c4ebae7b9f6bd04f4ae511fdb`.
- The new validation run for that fix is [38810085987](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38810085987), pending at the time of this update. Do not report the Android build as passing until that exact run completes.
- The earlier backend job passed on code SHA `25955a6d8e21f1947a4ac5c7afe7d3971cc76c4c`, including TypeScript build and tests; that is not a passing full-workflow result for the latest code SHA.


## 2026-10-16 Phase 2 continuation checkpoint — NOT COMPLETE

- Gameplay code checkpoint: `e911d7a7e76f85a1c3a7b10675715f2ee62d1ef1`; CI run [38937930225](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38937930225) had backend tests green while Android validation was still running at checkpoint time.
- Native mob-to-hero damage and PvP attacks now include and validate target buff pre-state against saved authoritative hero/mob state; protocol schema now describes the native mob damage payload and conditional combat outcome fields.
- Phase 2 must remain open: the Worker does not independently run SPD Java combat RNG/damage/proc logic, so internally consistent forged damage is still possible; secondary/periodic effects and PvP death/Ankh convergence lack end-to-end verification. No physical two-device test was performed.
- Continue implementation and tests directly; do not report Phase 2 complete merely because CI is green or scaffolding exists.
