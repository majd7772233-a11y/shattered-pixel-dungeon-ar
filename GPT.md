# GPT.md — Internal Project Operating Notes

> This file is the working memory and implementation guide for the AI continuing this repository. It is intentionally open-ended: append new findings, decisions, rules, verification results and user requirements as the project evolves. Do not treat it as a user-facing README.

## Permanent execution rule from the user


When the user says “yalla phase N” or asks to finish a phase, implement the entire phase and all related acceptance criteria in one continuous effort—not just scaffolding, a status report, or a list of remaining work. Inspect the actual roadmap and code, complete dependent paths and tests, then run the build and tests against the exact final commit. If verification exposes defects, fix them and rerun before reporting. Do not claim completion without evidence; do not stop at “done except ...” for required phase items. Keep the response concise and direct, and never merge to `main` unless explicitly asked.

## Historical continuation checkpoint — 2026-10-24 (superseded by 2026-10-26 roadmap restructure)

The detailed checkpoint that followed this heading described the previous ten-phase roadmap and is superseded. Use the authoritative 2026-10-26 checkpoint below and the current phase map in ROADMAP.md for all future phase numbering. Technical facts from the older append-only logs remain historical context only.

---


## CURRENT CONTINUATION CHECKPOINT — 2026-10-27 (AUTHORITATIVE; READ FIRST)

- **Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`
- **Branch:** `multiplayer-framework-core-14118577486727081892`; never merge to `main` unless asked.
- **Latest code/test SHA tested:** `859be3d6b1aea3b3fe13802fe9298d2344162edc` (“Cover drop replay and shared-cell missile reconciliation”).
- **Phase 6 exact-SHA CI:** [run 40508581979](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40508581979) passed both required jobs. Backend TypeScript build passed; Vitest reported 180 tests in each mirrored TS/JS test file (360 executions, not 360 unique source cases). Android JVM tests and debug APK compilation passed (`BUILD SUCCESSFUL`).
- **Phase 6 complete for implementation and automated acceptance:** exact full/partial DROP deltas, source/result identity, native stack merge semantics, quickslot remainders, per-item/per-heap validation, duplicate replay rejection, and native missile landing/PinCushion/consumption outcomes are implemented and covered by regression tests.
- **Phase 6 verification limits:** no physical-device match or deployed Worker end-to-end test was executed. The deployed-service preflight remains Phase 22 and the user-led physical-device test remains Phase 23. The broader multiplayer project is not yet complete.
- **Next: Phase 7 — Inventory Actions and Item Economy.** Read the authoritative Phase 7 section in `ROADMAP.md` before changing it.
- **Phase 5 remains complete:** stable item/heap IDs, exact native-bundle identity validation, room/depth/branch-scoped claims, atomic exact-owner/request retries and branch-aware migration are recorded below and in `ROADMAP.md`.
- **Current map:** 23 dependency-based phases; Phases 1–6 are complete for implementation and automated acceptance, phases 7–23 remain open.
- **Interruption rule:** if tools/network/usage limits interrupt a phase, preserve exact SHA, changed files, actual tests and next action. Never describe partial implementation as completion.

---


---

## 1. Project Identity and Main Goal

- **Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`
- **Working branch:** `multiplayer-framework-core-14118577486727081892`
- **Game:** Arabic Shattered Pixel Dungeon codebase, based on the original Java/libGDX SPD engine.
- **Primary objective:** real multiplayer gameplay between two or more devices. Players should share a coherent match and world, perform actions, fight native mobs/other players, collect and drop items, preserve inventory and temporary effects, move between floors, and recover from disconnects without duplicated/lost actions.
- **Target transports represented in code:** Internet/WebSocket, LAN, and Bluetooth. Do not advertise any transport as working until it is actually wired and verified.
- **Internet Worker endpoint currently hardcoded in setup:** `https://spd-multiplayer.majd7772233.workers.dev/room/{roomName}/websocket`.
- **Phase 2 native combat re-audit:** current branch head `0a88887fa01bed79bc317f28d73692c5192b78da`; CI [39656587836](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39656587836) passed both jobs. Verified 28 native runtime integration tests and 107 backend tests overall; see the 2026-10-21 Phase 2 re-audit in `ROADMAP.md`.
- **Final verified snapshot-consistency code:** `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`; exact-SHA CI [39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) succeeded for backend TypeScript build/tests and Android JVM tests/debug APK compilation.
- **Phase 3 native Mob AI/scheduler completion:** tested code SHA `a5565ea05ae677104f3eccfa428e99c5b5e787bb`; exact-SHA CI [39670992419](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39670992419) passed backend TypeScript/Vitest and Android JVM/debug APK jobs.
- **Phase 4 movement/floors/world-interactions completion:** tested phase-specific code SHA `c0c231a501bb2996f261e7e9e4e5d66e4136d70b`; exact-SHA CI [39850368287](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39850368287) passed both required jobs. A follow-on combined branch tip `ab81c507c5f1ae0b767732a7247cf7afe5afd917` also passed both jobs in [CI 39859774332](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39859774332). Phase 4 remains complete for implementation and automated acceptance.
- **Phase 5 stable item identity and pickup claims:** final code/test SHA `fb722732261823ab2d969ac4e5a5b706b0f53308`; exact-SHA CI [40402007522](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40402007522) passed backend TypeScript build/tests and Android JVM/debug APK compilation. Phase 5 is complete for implementation and automated acceptance.
- **Phase 6 drops, partial stacks and floor-heap reconciliation:** tested code/test SHA `859be3d6b1aea3b3fe13802fe9298d2344162edc`; exact-SHA CI [40508581979](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40508581979) passed backend and Android jobs. Full/partial drops, ID preservation/splitting, exact heap deltas, quickslots, replay rejection and native missile impact outcomes are complete for implementation and automated acceptance.
- **Test boundaries:** Phase 22 is the automated/deployed-service preflight; the user-led physical-device gameplay test is reserved for Phase 23.
- **Roadmap:** read `ROADMAP.md` before starting a task. Its 23-phase dependency map is authoritative. Phases 1–6 are complete for implementation and automated acceptance; next is Phase 7, Inventory Actions and Item Economy. Old phase numbers in historical logs refer to the former ten-phase plan.

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
- `protocol/schema.json`: protocol schema; it must match `MessageType` and actual payloads. The current schema includes `LEVEL_DATA`; native Mob full-snapshot AI/scheduler fields were synchronized with server preflight during the 2026-10-21 Phase 1 audit.
- `.github/workflows/multiplayer-ci.yml`: on relevant pushes, runs backend dependency install/typecheck/tests and Android `assembleDebug`. Docs-only commits may not trigger it because of the path filters.
- `.github/workflows/deploy-server.yml`, `.github/workflows/release.yml`: inspect before changing deployment/release behavior.

## 4. Current Verified State and Implemented Architecture

### Exact branch and CI state
- Repository: https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar
- Branch: multiplayer-framework-core-14118577486727081892. Never merge into main without explicit instruction.
- Latest verified snapshot-consistency code SHA: `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`.
- Exact-SHA workflow [39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) succeeded: backend TypeScript build/tests and Android JVM tests/debug APK compile both passed.
- Earlier workflow [39557655189](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39557655189) is historical baseline evidence; the current Phase 1 implementation was separately verified on exact code SHA `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30` by run [39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420).
- Passed job 1: Backend typecheck and tests — Node 20, npm ci, TypeScript build and Vitest.
- Passed job 2: Android debug APK compile — Java 17, Gradle JVM tests and Android debug APK.
- Markdown-only edits may not trigger CI because workflow path filters target code/protocol/Gradle/workflow paths. Do not claim a code change has CI evidence unless the exact SHA was tested.
- Current repository tree contained 2,185 entries. Critical multiplayer code, native engine entry points, protocol/server tests and CI were reviewed. Do not claim every line of the full tree was read; review every affected file and caller in detail before editing.

### Phase status

- **Phases 1–4:** complete for implementation and automated acceptance, with evidence recorded in ROADMAP.md.
- **Phase 5:** complete for implementation and automated acceptance on final code/test SHA `fb722732261823ab2d969ac4e5a5b706b0f53308`; exact-SHA CI [40402007522](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40402007522) passed backend TypeScript tests and Android JVM tests/debug APK compilation.
- **Phase 6:** next — drops, partial stacks and floor-heap reconciliation. Existing partial-drop validation and unique split item IDs are already present; audit before extending.
- **Phases 7–9:** inventory actions/economy, inventory persistence/death rewards, native timed effects.
- **Phases 10–12:** canonical protocol/typed routing; event ordering/replay/resync; durable recovery/reconnect/authority handoff.
- **Phase 13:** transport-independent room/session lifecycle.
- **Phases 14–16:** Internet/WebSocket, LAN, Bluetooth (or explicitly unavailable).
- **Phases 17–19:** Co-op lifecycle, PvP/Deathmatch, Survival.
- **Phases 20–21:** truthful host/join UX; localization/RTL/layout/navigation/cleanup.
- **Phase 22:** automated cross-layer/multi-client scenarios, exact-SHA CI and deployed-service smoke checks.
- **Phase 23:** user-led physical-device gameplay test, deliberately last. Record the user's observations and create coherent new phases 24+ for follow-up fixes.
- **Phase 5 verification limits:** no physical-device match or deployed Worker end-to-end test was performed. Do not infer either from green CI.

### Verified Phase 1 facts
- SPDLevelSnapshot exports schema/depth/branch/seed/dimensions/entrance/exit, tile and collision flags, transitions/exploration state, native metadata, stable Mob identities/bundles/state/buffs/cooldowns, heaps/items/heap flags, traps, plants, timed blobs and hero/inventory/combat/buff state. The Worker preflight now rejects repeated/out-of-range tile and exploration cells, duplicate Mob IDs/positions/stable identities, duplicate heap/trap/plant positions, duplicate blob classes, malformed item/trap/plant/blob fields, incomplete native Mob runtime state, invalid entrance/exit coordinates, missing/invalid seed and coerced string dimensions before persistence.
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
- Client-sent engineResult=true is not proof of an honest engine. The implemented trust model uses one elected Java SPD publisher as the shared Mob/Actor execution authority, with Worker validation/sequencing and resync on rejected native turns. This is not cheat-proof; stronger integrity would require a server-side engine that independently executes the Java SPD rules.
- Do not call native Mob.die() on a replica just to set its state; that can duplicate loot/reward. Use the authoritative tombstone/removal path.

## 5. Open Risks and Work After Phase 5

The current authoritative scope is the 23-phase plan in `ROADMAP.md`. Phases 1–5 are complete for implementation and automated acceptance. Work remaining is dependency ordered:

- **Phase 6 — drops/heaps:** finish full/partial drop transactions, unique IDs for split instances, per-item heap reconciliation and dropped/thrown item outcomes.
- **Phases 7–9 — remaining item/effect lifecycle:** inventory actions/economy, inventory restoration/rewards, native buffs and timed-effect expiry.
- **Phases 10–12 — contract/reliability:** one typed protocol path, sequence/replay/resync correctness, Durable Object persistence/reconnect/authority handoff.
- **Phases 13–16 — sessions and transports:** shared room/readiness state, Internet/WebSocket, LAN, Bluetooth with an honest unavailable state if necessary.
- **Phases 17–19 — modes:** Co-op lifecycle, PvP/Deathmatch, Survival.
- **Phases 20–21 — UI:** truthful host/join/setup flow followed by localization, RTL/layout, accessibility, cancellation and cleanup.
- **Phase 22 — automated/service preflight:** real room/action lifecycle tests, multi-client scenarios, exact-SHA CI, deployment configuration and fresh-room Worker smoke test.
- **Phase 23 — user-led physical-device playtest:** final only. The user reports actual results; append coherent new Phase 24+ fixes afterward and preserve symptoms/reproduction steps.

Never assume a later phase is complete because a class or enum exists. Check current source and tests. Keep automated tests inside the phase that implements the behavior; only physical-device gameplay is reserved for Phase 23.
## 6. Recommended Work Method

1. Fetch the current branch head and verify it is still `multiplayer-framework-core-14118577486727081892`. Never assume the audit SHA is still current.
2. Read `ROADMAP.md` and identify the requested phase. Fetch the latest version of every affected file, including helper classes and tests.
3. Trace the flow end-to-end: native action -> dispatcher -> protocol payload -> server validation/persistence -> sequenced event -> typed client router -> native state reconciliation -> reconnect snapshot.
4. Before changing code, identify which existing implementation should be extended and which legacy path conflicts with it.
5. Implement the complete phase, including dependent code paths, schema, migration and tests. Do not stop after adding an enum, field or event name.
6. Run appropriate validation. For server changes, run the workflow's TypeScript build and tests. For Java changes, run Android debug compilation. For protocol/world changes, add focused automated tests. Reserve physical-device gameplay testing for Phase 23, after automated and service preflight.
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
- Backend integration tests, Java/build checks and deployed-service preflight pass for the exact release commit in Phase 22; physical-device play is separately recorded in Phase 23 and is never inferred from CI.
- The roadmap has no unresolved P0 items and known limitations are documented honestly.

## 8. Append-Only Working Log (Keep This Section Open)

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

- The implementation/fixture SHA `40592960ac1a1ae93fda37b80adadfeb63d96cc0` first passed exact-SHA CI [40401131992](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40401131992). A final test-only refinement then made the Java duplicate-ID regression use two distinct items with the same declared ID and their own matching native bundles; final tested code/test SHA is `fb722732261823ab2d969ac4e5a5b706b0f53308`, and exact-SHA GitHub Actions [40402007522](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40402007522) passed both backend and Android jobs.
- Stable `Item`/`Heap` identifiers have bounded validation; native snapshot restoration requires unique heap/item IDs and exact identity/metadata agreement with decoded native Item bundles. Split/duplicate item IDs are tested.
- Durable item claims now include depth and branch plus stable heap/item IDs; room scope is the per-room Durable Object DB. The reservation uses `transactionSync`, allows only exact player/request retries, and migrates old claim schemas transactionally without dropping prior reservations.
- Regression coverage includes conflicting claims, exact retries, different depths/branches/rooms, malformed or duplicate identity fields, legacy schema recognition, and strict native heap restore. The first Android run exposed headless graphics initialization in a new test and an old hand-built snapshot fixture missing stable IDs; both were fixed without weakening production validation.
- Backend output: 173 tests in each mirrored `index.test.ts`/`index.test.js` file (346 executions, not 346 distinct source tests). Android JVM tests and debug APK compilation passed.
- No physical-device match or deployed Worker end-to-end test was run; Phase 22/23 boundaries remain unchanged. **Next whole phase: Phase 6 — Drops, Partial Stacks and Floor Heap Reconciliation.**

### 2026-10-26 — Dependency-based roadmap restructure

- Reorganized the former ten-phase plan into 23 dependency-based phases; active phase scope is in ROADMAP.md.
- Phases 1–4 remain complete. Phase 5 is next and must start with an audit of the item/effect changes already present on the branch.
- Latest checked branch HEAD: `c20ffb0730c4f8f9c82895faf93b595b7f2280e5`; no exact-HEAD workflow run/status was returned. The previously documented green tip `ab81c507c5f1ae0b767732a7247cf7afe5afd917` predates the newest Phase 5 code.
- The user explicitly reserved physical-device gameplay for Phase 23 and will report issues afterward; record those as new phases 24+.


### 2026-10-21 — Current state supersedes older checkpoints

- Verified snapshot-consistency code SHA: `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`. Exact-SHA CI run [39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) passed both backend and Android jobs.
- Historical baseline CI run 39557655189 passed its then-current gameplay SHA; the latest Phase 1 follow-up passed exact-SHA run 39655327420 on `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`.
- Phase 1 automated acceptance is complete after the final snapshot consistency audit: stable-ID Mob reconstruction, stale cleanup, idempotency, rollback after forced resize failure, native heap/trap/plant/timed-blob restore, independent-world convergence and strict server/Android preflight parity are covered by tests.
- Phase 2 implementation and automated acceptance are complete: native hit/miss/shield/retaliation/Ankh/reward/Mob-to-player/periodic/PvP/secondary-Mob paths are covered by runtime and backend contract tests.
- At the time of this earlier checkpoint, Phase 3 was next. Its completion is recorded in the 2026-10-21 Phase 3 verification entry below; Phases 4–10 remain open.
- No physical two-device run is claimed. Phase 10 must record it.
- Historical dated entries below preserve previous checkpoints; do not use their old phase status as current status.


### 2026-10-16 — Baseline audit and roadmap creation

- Audited the branch tree (2,174 entries; 1,320 Java files, 2 TypeScript files, 6 XML files, 35 paths matching test/spec naming) and reviewed the multiplayer package, key SPD engine integration points, server action/snapshot code, protocol schema, setup/title scenes, backend tests and CI workflow.
- Baseline commit: `657ce010edb03b55707d2b6d496abbb07b36fa7a`.
- GitHub Actions run `38759441278` succeeded for that exact SHA. This is compile/current-check evidence only, not real-device proof.
- Created `ROADMAP.md` with ten phases beginning with snapshot/reconstruction correctness and proceeding through native combat, native AI/scheduling, movement/transitions, inventory/effects, transport, game modes, protocol/recovery, UI and final end-to-end validation.
- Risks confirmed at the 2026-10-16 baseline included generic server Mob AI, overlapping event handlers, shallow backend tests, LAN/Bluetooth integration, depth-unsafe item claims, client-reported combat trust and premature setup readiness. `LEVEL_DATA` is present in the current schema. Open implementation work is tracked by Phases 3–10; do not treat historical risks as fixed unless the relevant current phase is verified.
- At this 2026-10-16 checkpoint, the next work started at Phase 1. This historical direction is superseded by the 2026-10-21 Phase 1 completion verification and is not the current next action.

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


## Historical checkpoint — 2026-10-16 execution update (superseded by 2026-10-21 verification)

Code changes on `multiplayer-framework-core-14118577486727081892` are currently at `25955a6d8e21f1947a4ac5c7afe7d3971cc76c4c` (the code commit; subsequent documentation-only commits may advance branch HEAD). GitHub Actions run [38809893294](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38809893294) was pending when recorded; do not claim its tests passed until its final conclusion is checked.

Changes made:
- `WorldSnapshot.java`: removed constructor-default fallback objects when native serialized bundles are missing/invalid for mobs, items, traps, plants and blobs. Previously empty restore catches now log diagnostics instead of silently swallowing failures.
- `server/src/index.ts`: added `isValidNativeHpTransition` and applied it to player/mob attack reports. It rejects target HP increases and reported damage inconsistent with the HP delta; this is validation, not proof of an honest client-side native result.
- `server/src/index.test.ts`: added focused tests for hit/miss transitions, reported healing, mismatched damage and invalid numbers.

At the time of this historical checkpoint, these items were still open. Subsequent commits completed Phase 1 and Phase 2 automated acceptance. The 2026-10-21 consistency re-audit found a server/Android snapshot-preflight mismatch; it has since been fixed and verified by exact-SHA CI run 39655327420. Native Mob AI/Actor scheduling and end-to-end real-device verification remain tracked in later phases. No physical two-device test was performed.


## Historical verification correction — 2026-10-16 (superseded)

- A first Android compilation of the strict-bundle/logging changes failed because five catch clauses still listed `ReflectiveOperationException` after constructor fallback code had been removed. This failure was inspected from Actions logs, and the obsolete checked exception types were removed in commit `63da31501485255c4ebae7b9f6bd04f4ae511fdb`.
- The new validation run for that fix is [38810085987](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38810085987), pending at the time of this update. Do not report the Android build as passing until that exact run completes.
- The earlier backend job passed on code SHA `25955a6d8e21f1947a4ac5c7afe7d3971cc76c4c`, including TypeScript build and tests; that is not a passing full-workflow result for the latest code SHA.


## Historical Phase 2 continuation checkpoint — 2026-10-16 (superseded by later automated acceptance)

- Gameplay code checkpoint: `e911d7a7e76f85a1c3a7b10675715f2ee62d1ef1`; CI run [38937930225](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38937930225) had backend tests green while Android validation was still running at checkpoint time.
- Native mob-to-hero damage and PvP attacks now include and validate target buff pre-state against saved authoritative hero/mob state; protocol schema now describes the native mob damage payload and conditional combat outcome fields.
At the time of this checkpoint Phase 2 remained open. Later commits added native runtime tests for secondary/periodic effects, PvP/Ankh and replay handling, and the current phase status records its automated acceptance baseline. The broader trust boundary still matters: the Worker cannot independently prove all client-reported Java RNG/combat decisions, and the absence of a physical two-device test is unchanged.
- Continue implementation and tests directly; do not report Phase 2 complete merely because CI is green or scaffolding exists.


## 2026-10-21 Phase 1 consistency-audit log

- Re-read `ROADMAP.md` and this notebook, then compared `server/src/index.ts` native snapshot admission with Android `WorldSnapshot.validateForRestore()` and the `NativeLevelSnapshot` protocol definition.
- Confirmed a real interoperability defect: server validation did not uniformly reject duplicate positions/identity collisions and omitted Mob runtime fields that Android restore requires. Such a snapshot could be persisted by the Worker and subsequently rejected by Android, causing unnecessary resynchronization.
- Hardened server validation before persistence; added regression tests for duplicate tile/exploration cells, heap/trap/plant positions, Mob local IDs/positions/stable IDs, duplicate blob classes, out-of-range values and incomplete native scheduler fields. Updated protocol schema requirements to match actual native snapshot fields.
- Commits: `1a5d4c537ee3c2e8b6da88c126310e1499ff42c4` (validator), `39f7441b39874988b3b4293defc48f65ec4745cf` (tests), `81ed967088aedbfc1bcc65773a8cb5dd0774c087` (protocol schema).
- CI run [39654793671](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39654793671) was superseded during iteration. After correcting the test fixture and adding strict entrance/exit/seed validation, exact-SHA workflow [39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) passed both required jobs on `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`.
- No real two-device Android session has been executed by this workflow. Keep that as a Phase 10 release gate.


## 2026-10-21 Phase 1 completion — server/Android snapshot consistency verified

- Current code SHA: `73cf9c76c936f0dd0eade1689c8f9e8bbdb1af30`.
- Exact-SHA workflow [39655327420](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39655327420) passed both jobs: backend TypeScript build plus Vitest, and Android JVM tests plus debug APK compilation.
- The cross-layer audit found the server could admit snapshots with duplicate tile/exploration/heap/trap/plant/Mob positions, duplicate identities/blob classes, incomplete native Mob scheduler fields, and invalid entrance/exit/seed fields that the Android side would reject or rely on. The validator now performs shared strict checks before persistence.
- Tests cover duplicate conflicts, incomplete Mob scheduler state, out-of-range cells, invalid entrance/exit coordinates, missing seed and string-coerced dimensions. The fixture for valid native Mob-turn snapshots now includes `defenseSkill`; strict validation was not weakened to make the tests pass.
- `protocol/schema.json` now requires native Mob scheduler/AI fields for a complete full snapshot.
- Phase 1 is complete for implementation and automated acceptance. This does not claim a physical two-device test; Phase 10 remains responsible for real-device and deployed Worker verification.
- Next whole phase: Phase 3 — native Mob AI and Actor scheduling. Do not start it until the phase scope and current repository are re-read from the latest branch head.


## 2026-10-21 Phase 2 re-audit — current verified status

- Phase numbering is fixed: Phase 1 = lossless native snapshots/restoration; Phase 2 = native combat replication; Phase 3 = native Mob AI/Actor scheduler.
- Re-read Phase 2's acceptance criteria, `NativeCombatRuntimeIntegrationTest.java` (28 native runtime tests), `NativeCombatAuthorityPolicyTest.java`, `server/src/index.test.ts` (107 backend tests total), `server/src/index.ts`, `protocol/schema.json`, and `.github/workflows/multiplayer-ci.yml` on the current branch.
- Verified coverage includes native hit/miss/zero-damage/shield-only, retaliation and attacker post-state, blessed Ankh and kill reward attribution, Mob-to-player/periodic damage, target-owner PvP, secondary Mob deltas with stable IDs and full bundles, duplicate-death prevention, replay/stale-state checks, authority ownership, buffs/shields, loot and resync on untrusted reactive damage.
- Exact current branch-head CI [39656587836](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39656587836) passed both backend and Android jobs on `0a88887fa01bed79bc317f28d73692c5192b78da`.
- Phase 2 remains complete for implementation and automated acceptance. Do not add duplicate code to make the phase appear newly implemented; keep the evidence current. Physical two-device validation remains Phase 10 and is not claimed.
- At the time of this Phase 2 re-audit, Phase 3 was next. The later 2026-10-21 Phase 3 completion entry supersedes that status; Phase 4 is now next. Phase 2 must never be skipped in user-facing summaries.

### 2026-10-21 — Phase 3 native Mob AI and Actor scheduler completed

- **Tested code SHA:** a5565ea05ae677104f3eccfa428e99c5b5e787bb. Exact-SHA GitHub Actions run [39670992419](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39670992419) completed successfully: backend TypeScript build and Vitest passed; Android JVM tests and debug APK compilation passed.
- **Single native execution authority:** the elected Java SPD level publisher executes the original shared Actor scheduler. Other clients skip independent shared Mob/Blob/Mob-target Buff/respawner turns. The TypeScript Worker validates, persists and sequences resolved native state; it does not replace SPD Mob AI with generic pathing.
- **Callback timing:** shared actor results are committed only after original action completion. When shared act() returns false, the scheduler defers publication until the callback calls Actor.next(); this covers animated attacks and delayed/special projectile callbacks. Native damage/procs/cooldown still use the original SPD path.
- **Snapshot/AI convergence:** Mob AI state (target type/stable target ID/target cell, state, alert/visibility, effective speed, cooldown and buffs) restores after remote Hero replicas exist. This fixes the first-snapshot PLAYER target loss. Worker native-turn counters must increase by exactly one and the accepted counter is restored through full resync.
- **Runtime scenarios:** NativeCombatRuntimeIntegrationTest contains 36 test methods at this checkpoint. Phase 3 coverage includes sleeping/fleeing/out-of-sight state, stable target rebinding, disconnected targets, native obstacle/diagonal pathing and fleeing, Haste/effective-speed/cooldown round trips, animated attack deferral and special callback-driven effects. Existing native combat tests preserve authoritative/idempotent death, reward and loot behavior.
- **Backend tests:** CI reported 220 successful Vitest executions across index.test.ts and its generated index.test.js counterpart; those files exercise corresponding test cases, so this is not 220 distinct source scenarios.
- **Limits:** no physical two-device match or deployed Worker end-to-end test has been performed. Keep both as Phase 10 release verification. Publisher disconnect/authority handoff remains Phase 9 work, not Phase 3.
- At this historical Phase 3 checkpoint, Phase 4 was the next whole phase. That status is superseded by the Phase 4 completion entry below.

### 2026-10-22 — Phase 4 movement, floor and world-interaction completion

- **Tested code SHA:** c0c231a501bb2996f261e7e9e4e5d66e4136d70b. Exact-SHA GitHub Actions [run 39850368287](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39850368287) passed both required jobs: backend TypeScript build/tests and Android JVM tests/debug APK compilation.
- **Native FALL path closed:** SPD calls Chasm.heroFall() before entering a pit. Multiplayer now sends a separate FALL intent, peers replay the native Chasm/InterlevelScene path, and Level.fallCell() chooses a deterministic safe destination from the generated floor seed and shared source Hero cell. The Worker waits for the publisher destination snapshot plus every connected living peer's matching LEVEL_READY state before committing.
- **Regular stairs and recovery:** destination floor data must come from the publisher; depth, branch, seed, landing cell and ready Hero snapshots must agree. The room remains at source depth until atomic commit. Timeout/abort returns through native loading. A separate admission gate rejects concurrent transitions and invalid/dead/unpublished initiators.
- **World actions:** constrained native snapshots preserve legitimate doors/keys, secret terrain, barricades/destructible terrain, mining, movement-triggered traps/plants/wells, NPC interactions and chest changes while rejecting unrelated terrain/object/loot/inventory edits. Unsupported nonzero branches are rejected.
- **Tests:** Vitest reported 242 successful executions across index.test.ts and its generated JavaScript counterpart (121 mirrored source test cases); NativeCombatRuntimeIntegrationTest has 37 methods, including deterministic safe multiplayer fall landing and hazard-exclusion coverage.
- **Limits:** no physical two-device session or deployed Worker end-to-end test was performed. Those are still Phase 10 release checks; Phase 4 is complete for implementation and automated acceptance, not complete final-release verification.
- **Next whole phase:** Phase 5 — items and effects. Publisher handoff remains Phase 9; real-device/deployment evidence remains Phase 10.

### 2026-10-23 — Phase 4 resumed audit and current-branch verification

- Re-read the complete current Worker action branches and Android world-action/transition paths. The server has a shared accepted-action branch for `UNLOCK`, `MINE`, `INTERACT` and `OPEN_CHEST`; peer `MessageRouter` handling for `LEVEL_TRANSITION`/abort is present. The earlier suspicion that those entire handlers were absent came from a partial excerpt and is superseded by this full-source audit.
- The phase's specific implementation and acceptance remains recorded against `c0c231a501bb2996f261e7e9e4e5d66e4136d70b` and CI `39850368287`. The later branch tip `ab81c507c5f1ae0b767732a7247cf7afe5afd917`, which includes follow-up stable item identity/pickup/drop work, passed both CI jobs in [39859774332](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39859774332).
- Branch HEAD before this documentation-only audit was `ab81c507c5f1ae0b767732a7247cf7afe5afd917`. No two-device or deployed Worker run is claimed; those remain Phase 10 checks.
- Phase 4 remains complete for implementation and automated acceptance. The next whole phase is Phase 5 — items and effects.

