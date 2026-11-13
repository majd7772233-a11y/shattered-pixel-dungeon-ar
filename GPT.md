## ACTIVE PROJECT CHECKPOINT — 2026-11-13 (PHASE 9 COMPLETE; PHASE 10 IN PROGRESS — 10-A AND 10-B IMPLEMENTED)

- **Repository / branch:** `majd7772233-a11y/shattered-pixel-dungeon-ar` / `multiplayer-framework-core-14118577486727081892`. This is the only write target. Never create a branch, work on master/main or merge this branch.
- **Verified gameplay/test baseline:** `bc6c46b03fee040ff20311adb473b19ff78e9bb7`.
- **Exact code/test CI:** [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588)
- Backend: TypeScript build and 682 executions across eight Vitest files passed (generated/mirrored JS executions are not unique source cases).
- Android: JVM tests and `assembleDebug` passed (`BUILD SUCCESSFUL`).
- Workers runtime: three tests passed against real Durable Object SQLite under the local Cloudflare Workers runtime (rollback/replay across eviction, persisted-snapshot publisher handoff with pending-combat closure, and committed-state reconstruction after eviction).
- This is automated/local Workers-runtime evidence, not a production Worker deployment or a physical-device match. Re-read live branch HEAD and its exact-head Actions run before any later edit.
- **SpiritArrow 9-C complete:** strict native intent binds Bow, SnipersMark and stable Mob identity; MatchRoom reserves/forwards COMBAT_REQUEST; Java executes native SPD combat; publisher result commits Mob/level/event/sequence atomically; requester receives sequenced EVENT_BATCH. Android coverage reconciles by stable Mob ID on two client worlds with different local Actor IDs.
- **Publisher handoff/rebase:** durable generation advance, valid persisted state, pending-combat cancellation, generation notification and persisted snapshot delivery. Replacement must pass lossless rebase validating shared Mob IDs/bundles plus refreshed Hero/RemoteHero/Mob Actor IDs, LifeLink and SnipersMark references before shared actions resume.
- **Timed effects:** enabled effects are validated source-specifically against native Java results; SQL/event/sequence/outbound messages are atomic. Poison/LifeLink, shield priority, concurrent timers, approved consumables, XP/reward and base MonkEnergy boundaries have positive/negative coverage.
- **Explicit fail-closed exclusions:** XP level-up/`Hero.updateHT()`/`onHeroGainExp`; advanced Monk Unencumbered Spirit/UnarmedAbilityTracker; RemoteHero/player LifeLink; unsupported scroll/wand/consumable/Buff callbacks; SpiritArrow SPEED volleys and non-Mob targets.
- **Phase status:** Phases 1–9 complete for implementation and automated acceptance. Phase 10 is in progress and remains OPEN; bounded slices 10-A (enum/version parity) and 10-B (cross-layer route inventory + Worker ingress admission) are implemented. Phases 11–23 remain open.
- **Phase 10-A source/test SHA:** `d8938190960af64d6efc70f4625a7411bfa3b7de`; exact-head CI [43485367695 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43485367695). It adds the canonical 23-value `NetworkActionType` schema definition and a static guard for both ordered Java enums, protocol version `1.0.0`, and the narrower native-mutation allowlist. Backend build + 682 Vitest executions, Android JVM/Debug APK and 3 Durable Object SQLite tests passed.
- **Phase 10-B result:** source-backed matrix covers all 25 outer messages and 23 actions, differentiates eight actual Worker inbound routes from 17 known non-inbound names, records validators/authority/sequence/persistence and Android routing, and adds a fail-closed Worker envelope-admission helper. Static routing guard plus focused Vitest tests are wired into npm test; exact-head CI is pending the implementation commit.
- **Evidence limits:** DO SQLite tests use local Workers runtime, not deployed production; projectile test is headless, not rendered; no physical two-device match. Phases 22–23 remain the release checks.
- **Phase 10 remaining:** strict Android parser/version/required-field parity; inspect producer mapping and remove the unknown-HeroAction-to-WAIT fallback only with appropriate native tests; establish behavior-specific parity tests before any `RemotePlayerActionReceiver` migration; then move toward one typed event path. Preserve the PLAYER_LEFT Actor/Mob cleanup. Keep Phase 11 replay/resync redesign out of scope.

**Source-of-truth hierarchy:** `PROJECT_EXECUTION_PROTOCOL_AR.md` governs workflow; `ROADMAP.md` governs phase scope/status/acceptance; exact source and exact-head CI govern implementation evidence; `docs/multiplayer/` is the maintained architecture/test reference.

## Phase 10 execution log — 2026-11-13 (bounded slice 10-A)

- Start HEAD: `032453bf31f722fceb41b9d164987a7f0763502f`; all 21 tracked Markdown files were read before code changes. Exact start-HEAD CI `43479458418` passed all three jobs.
- Implementation chain: `2a8094a47c88bdf17e123b216f9ce8a77cdb5533` (canonical action enum + test integration), `847333c92d8b24c670c93305e54bd2544a621ed8` (validator syntax correction), `d8938190960af64d6efc70f4625a7411bfa3b7de` (align schema message enum ordering with Java).
- Final exact-head CI `43485367695` passed Backend, Android and Durable Object SQLite jobs. Backend output confirmed 25 message types, 23 action types, protocol 1.0.0 and 682 Vitest executions across eight files (mirrored TS/JS outputs are not unique source scenarios).
- The initial CI exposed two real defects in the new contract guard: an invalid comment-stripping regex and a message enum order mismatch. Both were fixed without weakening exact ordered parity; the final run is green.
- Remaining: comprehensive message/action routing matrix, inbound unsupported-message behavior, typed client event path, and parity-tested `RemotePlayerActionReceiver` migration. Keep Phase 11 replay/resync redesign out of scope.


## Phase 10 execution log — 2026-11-13 (bounded slice 10-B — routing matrix and Worker ingress)

- Start HEAD: `fa5f7937eb55145345230de7930be8f860b74694`; branch was re-fetched and exactly matched the documented HEAD before changes. The exact start-HEAD CI run `43488066751` passed Backend typecheck/tests, Android debug APK compile and Durable Object SQLite rollback/eviction.
- Read all 21 Markdown files in the live branch before editing, including GPT.md, ROADMAP.md and MULTIPLAYER_CONTINUATION_NOTES.md.
- Audited all 25 outer MessageType values and all 23 NetworkActionType values against Java enums, protocol/schema.json, Worker route/action branches, the native Java senders/publishers, MultiplayerManager, MessageRouter and RemotePlayerActionReceiver.
- Confirmed eight explicit Worker inbound types; the other 17 canonical outer names are classified as known but non-inbound (a mix of server outputs and unimplemented/unused message declarations). Confirmed all 23 actions have explicit Worker ACTION branch tokens, while per-action validators and follow-up native LEVEL_DATA/authority behavior remain distinct.
- Added `server/src/protocol/message-admission.ts` and `message-admission.test.ts`; Worker validates authenticated attachment, text frame, envelope fields/types, protocol 1.0.0, inbound classification and nested JSON before dispatch. Admission rejections have stable ERROR codes and safely echo a parsed requestId. Unexpected handler exceptions preserve their existing exception-message contract for transaction rollback compatibility. The client-provided senderId remains overwritten by the socket attachment.
- Added `server/scripts/validate-phase10-routing.mjs` to npm test. It compares the 25-value Java/schema vocabulary with inbound/non-inbound classification, the eight exact route branches and all 23 Worker ACTION branches, while retaining the INVALID_ACTION fail-closed default.
- Updated protocol catalog, server validation/storage guide, test matrix, build/CI guide, multiplayer README and active roadmap/checkpoint/continuation docs. The catalog explicitly documents all 25 message directions and 23 action validation paths.
- No Java/gameplay action validator, message sequence, persistence, replay/resync behavior, MessageRouter route or RemotePlayerActionReceiver code was changed. RemotePlayerActionReceiver remains necessary for PLAYER_LEFT Actor/Mob cleanup and legacy handling; do not move/delete it without parity tests.
- Known remaining gap: NetworkActionBridge maps only a subset of HeroAction classes and falls back to WAIT for an unmapped action. This is not proof that the original action is supported; test/fix this in a dedicated client-producer slice.
- Exact CI for the 10-B implementation commit: pending; record the resulting SHA and Actions run after the commit. Phase 10 remains OPEN; Phase 11 is not started.

## Source refactor checkpoint — Stage 3 complete (2026-11-08; exact-HEAD CI verified)

- **Repository/branch:** `majd7772233-a11y/shattered-pixel-dungeon-ar` / `multiplayer-framework-core-14118577486727081892`. No new branch and no merge to `main`.
- **Stage 1 source parent:** `4b1a321539bd828014b4194c3104bfb556d4d0a1`.
- **Stage 1 implementation:** `8a0a9f4f275f1a450aec066865d182de0f21125b`; import-path correction: `4119263d9cc4dd5b230c551897b37dc4391417cf`.
- **Stage 1 parity result:** all 200 original top-level declarations before the original `MatchRoom` class are present in the 15 protocol/validator/helper modules. A normalized source-text comparison found 200/200 matching declaration bodies and no mismatches. The 118 original validator/protocol/helper named exports remain on the root facade.
- **Stage 2 source chain:** `78e80177d9fb508f90c99879a0097e97c0fb929c`, `0651fb1ab97cb6006d41f8916e7daa5fb8058fc7`, `92661b809a84cc524ee76ce092061a87855721c0`, `237577f1e8c68a3f052b36fcac64cd7efc07918d`.
- **Stage 2 architecture:** one `MatchRoom` class is defined in `server/src/match-room/index.ts` and inherits the shared state through base → persistence → combat → snapshots → actions → messages. No per-layer Durable Object or duplicated mutable state was introduced. The original 20 method bodies and the four RECONNECT/LEVEL_DATA/LEVEL_READY/ACTION branch bodies were checked against the pre-extraction source; required private-to-protected visibility changes support inheritance.
- **Stage 2 exact-HEAD CI:** [run 42483052104](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42483052104) passed Backend typecheck/tests and Android JVM/debug-APK compilation on `237577f1e8c68a3f052b36fcac64cd7efc07918d`.
- **Stage 3 implementation commits:** root router extraction `0224d8eef0015212af3e6922b9a7c9404adddd17`; `worker.ts` creation `839cf2977eb239c77544c9c2baf0efc3eec4fde2`; Worker integration tests `c8a60f27b9e9af2a18cce511e546a8467a86ead4`.
- **Stage 3 Worker boundary:** the original default Worker fetch body is now in `server/src/worker.ts`. `server/src/index.ts` remains `server/wrangler.jsonc`'s stable `main`, the root compatibility facade, and re-exports the default Worker plus all historical named exports and `MatchRoom`. The root is 35 lines.
- **Stage 3 integration tests:** `server/src/entrypoint.test.ts` covers the root `MatchRoom` export, forwarding a room request to `MATCH_ROOM.idFromName/get`, forwarding the exact original Request, the `DEFAULT_ROOM` fallback, and the existing non-room information response.
- **Cross-layer parity:** baseline declaration names/text and root exports were checked; all 118 validator/protocol/helper exports plus the `MatchRoom` named export remain available (119 named exports total). Existing backend tests retain their `./index` imports. `protocol/schema.json`, `server/wrangler.jsonc`, the `MATCH_ROOM` binding, `class_name: MatchRoom`, migration tag `v1`, and all Java source contracts remain unchanged.
- **Protected files:** `Hero.java`, `Mob.java`, and `WorldSnapshot.java` were not modified or split.
- **Stage 3 exact-HEAD acceptance:** [GitHub Actions run 42486485451](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42486485451) passed on `a513327caf7e500d8416befae8c04a984a4bbc18`: Backend TypeScript build and full tests succeeded (568 reported mirrored TS/JS executions across six files, not 568 unique source scenarios); Android JVM tests and debug APK compilation succeeded.
- **Stage 3 status:** complete for implementation, parity and automated acceptance. CI is not a Worker deployment or physical-device test.
- **No deployment/device claim:** no live Worker smoke test and no physical two-device multiplayer session is claimed. The deploy workflow remains limited to `master`/`main` pushes or manual dispatch.
- **Gameplay status is unchanged:** gameplay Phases 1–8 remain complete for implementation/automated acceptance; Phase 9 remains open/in progress; Phases 10–23 remain open. The three source-refactor stages are separate from gameplay phases.

## Historical documentation foundation checkpoint — 2026-11-08 (superseded source-layout observations; READ WITH THE CURRENT CODE)

- **Audit branch HEAD:** 1c48f0e5c70c9e774a3931ee08e332c7c79d8220; this is a documentation-only descendant of gameplay code SHA b9ad0739d10d6a4125fb6ea084d6d072b2699810.
- **Exact-HEAD validation:** [GitHub Actions run 41490481958](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41490481958) succeeded.
- **Phase status is unchanged:** phases 1–8 complete for implementation and automated acceptance; phase 9 in progress and incomplete; phases 10–23 open. No Worker deployment smoke test or physical two-device match is claimed.
- **Batch 1 documentation:** start at docs/multiplayer/README.md, then use the architecture, file map, data-flow, and build/CI pages. These describe source as inspected at the audit HEAD.
- **Historical temporary documentation tracker:** `docs/multiplayer/DOCUMENTATION_ROLLOUT_PLAN.md` coordinated the original documentation batches and source refactor; it has been retired after the permanent architecture/status was transferred into README.md, GPT.md, ROADMAP.md and SOURCE_FILE_REFERENCE.md.
- **Important audit findings:** the multiplayer package contains 32 Java files; server/src/index.ts is a 10,095-line combined validator/Worker/Durable Object implementation; MessageRouter still has a default route to RemotePlayerActionReceiver; the deploy workflow only auto-deploys master/main server changes or manual dispatch. Inspect current source before relying on any description.
- **No gameplay source was changed by this documentation foundation.** The exact tested gameplay SHA remains the parent listed above.


## Historical Batch 2 documentation checkpoint — 2026-11-08 (source-layout observations superseded by Stage 3)

- **Branch:** multiplayer-framework-core-14118577486727081892.
- **Documentation parent/source baseline:** eb2075b3f09ca4779773140b7e6539a6655f6824.
- **Gameplay code/test SHA remains:** b9ad0739d10d6a4125fb6ea084d6d072b2699810. Batch 2 is Markdown-only; it does not change gameplay or phase status.
- **Exact-HEAD CI for Batch 1 parent:** [42470021358](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42470021358) passed backend typecheck/tests and Android JVM tests/debug APK compilation.
- **Batch 2 documents:** ANDROID_NATIVE_INTEGRATION.md, SERVER_VALIDATION_AND_STORAGE.md, PROTOCOL_MESSAGE_CATALOG.md, TEST_MATRIX.md, SESSION_RECOVERY_AND_SECURITY.md and SOURCE_FILE_REFERENCE.md under docs/multiplayer/.
- **Verified current phase state unchanged:** phases 1–8 complete for implementation and automated acceptance; phase 9 in progress/open; phases 10–23 open. No deployed Worker smoke test or physical two-device multiplayer match is claimed.
- **Test inventory:** server/src/index.test.ts has 57 describe groups and 277 test declarations; server/src/native-pickup-side-effect.test.ts has 3. NativeCombatRuntimeIntegrationTest.java has 46 @Test methods; five other multiplayer JVM classes contribute 19 more (65 methods across six multiplayer JVM test files). Mirrored TypeScript/JavaScript test executions must not be described as unique scenarios.
- **Historical large-source findings at the Batch 2 baseline:** server/src/index.ts was 658,825 bytes / 10,095 lines; Hero.java 117,061 bytes; WorldSnapshot.java 83,795; MessageRouter.java 68,021; Mob.java 66,010; GameScene.java 60,874; Level.java 55,788; MultiplayerManager.java 30,457. The user-protected Hero.java, Mob.java and WorldSnapshot.java remain untouched.
- **Android Bluetooth gap:** AndroidBluetoothProvider exists, but no provider registration was found in the inspected AndroidLauncher/AndroidPlatformSupport path or indexed repository search; BluetoothTransport reports connected in its null-provider fallback; the inspected Android manifest has no Bluetooth permission declarations. Treat Phase 16 as open and keep the UX honest until fixed and device-tested.
- **Server/protocol findings:** Worker webSocketMessage explicitly handles RECONNECT, LEVEL_DATA, LEVEL_READY, ACTION, READY, RESYNC, PING and CHAT. MessageRouter default cases still route to RemotePlayerActionReceiver. See PROTOCOL_MESSAGE_CATALOG.md.
- **Historical next action at the Batch 2 checkpoint:** Stage 3 was then next. It is now implemented and recorded in the current source-refactor checkpoint at the top of this file; no gameplay phase status was changed. Keep Hero.java, Mob.java and WorldSnapshot.java unchanged.

## Permanent execution protocol

Follow PROJECT_EXECUTION_PROTOCOL_AR.md in every conversation. The user requires one coherent bounded subphase per conversation, complete Markdown re-read and exact HEAD/CI verification at its start, continuous documentation and an Arabic handoff prompt at its end. Do not start the next slice in the same conversation.

This does not weaken the parent-phase acceptance rule: a phase remains open until every Roadmap requirement is complete. A successful subphase is not a completed parent phase.

## Historical continuation checkpoint — 2026-10-24 (superseded by 2026-10-26 roadmap restructure)

The detailed checkpoint that followed this heading described the previous ten-phase roadmap and is superseded. Use the authoritative 2026-10-26 checkpoint below and the current phase map in ROADMAP.md for all future phase numbering. Technical facts from the older append-only logs remain historical context only.

---


## Historical continuation checkpoint — superseded on 2026-11-12

The former checkpoint referred to SHA 644c221 and is historical only. Use the active checkpoint at the top of GPT.md and the conversation workflow in PROJECT_EXECUTION_PROTOCOL_AR.md. Verify live HEAD before every edit.

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
- **Roadmap:** read `ROADMAP.md` before starting a task. Its 23-phase dependency map is authoritative. Phases 1–9 are complete for implementation and automated acceptance under the explicit fail-closed support boundary; Phase 10, Canonical Protocol Schema and One Typed Event Path, is next and OPEN. Old phase numbers in historical logs refer to the former ten-phase plan.

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
11. **Parent phase acceptance is indivisible; conversations are sliced.** Implement one bounded subphase per conversation as defined in PROJECT_EXECUTION_PROTOCOL_AR.md. Do not mark the parent phase complete until every Roadmap acceptance item across all slices is complete.
12. **Update project memory.** Keep `GPT.md` and `ROADMAP.md` synchronized when code findings, phase status, architecture or acceptance criteria change.
13. **No Wrangler CLI suggestions for Android.** The user has explicitly said `npx wrangler` does not work on their Android environment and does not want it suggested. Use GitHub-based edits/Actions and the available Cloudflare dashboard/workflows where appropriate.
14. **Do not claim unperformed tests.** Distinguish static review, backend tests, Android compilation, deployment smoke tests and real two-device play. A green compile is not proof of working multiplayer.
15. **Avoid unrelated rewrites.** Respect the existing SPD architecture and the smallest coherent set of files needed for the phase. If a cross-cutting redesign is necessary, explain the concrete reason in the code/docs and keep it aligned with the roadmap.
16. **Re-check the live state before resuming a phase.** A user request naming a phase does not prove it is still open. Compare the current roadmap, branch source and exact-SHA CI; if it is already complete, avoid duplicate code and explicitly record the verified state before moving to the next open phase, unless the user asks for a distinct follow-up.
17. **Report mirrored tests honestly.** If `index.test.ts` and generated `index.test.js` execute mirrored cases, distinguish executions from unique source scenarios and do not describe the sum as unique tests.
18. **Continuous live documentation, every edit.** Every source/test/protocol/config/build/workflow/resource/docs change—including a one-character change—must update the relevant reference and log immediately in the same logical work unit. Keep GPT.md and ROADMAP.md synchronized; update deep-dive pages whenever responsibilities, dependencies, data flows, test evidence, or paths change. Do not accumulate documentation debt until phase completion.
19. **Document-first discovery, source-first editing.** Read the documentation index and relevant component/data-flow page before broad exploration, then verify the actual files/callers/tests at the active HEAD before changing code. Source is implementation truth; stale docs must be corrected, never blindly trusted. The Batch 2 tracker is temporary and must be removed after Batch 2 is completed.

## 3. Architecture Map — Read These Before Editing

The maintained deep reference starts at docs/multiplayer/README.md. Read its source-of-truth and continuous-documentation contract, then consult PROJECT_OVERVIEW.md, SYSTEM_ARCHITECTURE.md, COMPONENT_AND_FILE_MAP.md, AUTHORITATIVE_DATA_FLOWS.md, ANDROID_NATIVE_INTEGRATION.md, SERVER_VALIDATION_AND_STORAGE.md, PROTOCOL_MESSAGE_CATALOG.md, TEST_MATRIX.md, SESSION_RECOVERY_AND_SECURITY.md, SOURCE_FILE_REFERENCE.md, and BUILD_TEST_AND_CI.md. The file map accelerates discovery but never replaces opening source at the active HEAD. Large-source decomposition is a separate Batch 3 assessment; do not move source files during documentation work.

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

- `server/src/index.ts`: 35-line stable Wrangler Worker main and compatibility facade; it re-exports historical named validators/types, `MatchRoom`, and the default handler from `server/src/worker.ts`.
- `server/src/worker.ts`: default Cloudflare Worker router; it maps `/room/{roomCode}/...` to the `MATCH_ROOM` Durable Object stub and retains the non-room informational response.
- `server/src/match-room/`: one `MatchRoom` Durable Object implementation split into seven inherited responsibility modules sharing the same state/SQLite instance.
- `server/src/index.test.ts` and `server/src/native-pickup-side-effect.test.ts`: existing backend contract/validator suites remain on `./index`; `server/src/entrypoint.test.ts` adds direct Worker-handler routing regression tests. These tests still do not instantiate a deployed Cloudflare Durable Object runtime.
- `server/package.json`, `server/tsconfig.json`, `server/wrangler.jsonc`: backend scripts/build/deployment configuration.
- `protocol/schema.json`: protocol schema; it must match `MessageType` and actual payloads. The current schema includes `LEVEL_DATA`; native Mob full-snapshot AI/scheduler fields were synchronized with server preflight during the 2026-10-21 Phase 1 audit.
- `.github/workflows/multiplayer-ci.yml`: on relevant pushes, runs backend dependency install/typecheck/tests and Android `assembleDebug`. Docs-only commits may not trigger it because of the path filters.
- `.github/workflows/deploy-server.yml`, `.github/workflows/release.yml`: inspect before changing deployment/release behavior.

## 4. Current Verified State and Implemented Architecture

### Exact branch and CI state
- Repository: https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar
- Branch: `multiplayer-framework-core-14118577486727081892`. Never merge into main without explicit instruction.
- Gameplay/test baseline: `bc6c46b03fee040ff20311adb473b19ff78e9bb7`; exact code/test CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588)
- Backend: 8 Vitest files, 682 executions passed (mirrored JS means executions are not unique source scenarios).
- Android: JVM tests and Debug APK compilation passed.
- Workers runtime: three real Durable Object SQLite tests passed under the local Workers runtime.
- These results do not prove a deployed production Worker or a physical-device match. Always inspect the live branch HEAD and its matching Actions run before changing code or documentation.
- Phase 9 is complete for implementation and automated acceptance under the explicit fail-closed exclusions in ROADMAP.md. Phase 10 is the active next phase.

### Phase status

- **Phases 1–4:** complete for implementation and automated acceptance, with evidence recorded in ROADMAP.md.
- **Phase 5:** complete for implementation and automated acceptance on code/test SHA `fb722732261823ab2d969ac4e5a5b706b0f53308`; exact-SHA CI [40402007522](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40402007522) passed backend TypeScript tests and Android JVM tests/debug APK compilation.
- **Phase 6:** complete for implementation and automated acceptance on code/test SHA `859be3d6b1aea3b3fe13802fe9298d2344162edc`; exact-SHA CI [40508581979](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40508581979) passed backend and Android jobs.
- **Phase 7:** complete for implementation and automated acceptance on code/test SHA `744b78cebfae17609dd2b7d43e9d19bd42774056`; exact-SHA CI [41112954455](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41112954455) passed protocol schema, backend tests and Android JVM/debug APK jobs.
- **Phase 8:** complete for implementation and automated acceptance on `e36bc8030755050e3eae3d45ccab4db1040a65f5`; exact-SHA CI [41230208577](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41230208577) passed.
- **Phase 9:** complete for implementation and automated acceptance on gameplay/test baseline `bc6c46b03fee040ff20311adb473b19ff78e9bb7`; exact code and current documentation HEAD workflows are recorded in ROADMAP.md.
- **Phase 10:** next and OPEN — canonical protocol schema and one typed event path.
- **Phases 11–12:** event ordering/replay/resync; durable recovery/reconnect/authority handoff.
- **Phase 13:** transport-independent room/session lifecycle.
- **Phases 14–16:** Internet/WebSocket, LAN, Bluetooth (or explicitly unavailable).
- **Phases 17–19:** Co-op lifecycle, PvP/Deathmatch, Survival.
- **Phases 20–21:** truthful host/join UX; localization/RTL/layout/navigation/cleanup.
- **Phase 22:** automated cross-layer/multi-client scenarios, exact-SHA CI and deployed-service smoke checks.
- **Phase 23:** user-led physical-device gameplay test, deliberately last. Record the user's observations and create coherent new phases 24+ for follow-up fixes.
- **Phase 7 verification limits:** no deployed Worker end-to-end test or physical-device match was performed. Those remain explicit Phase 22/23 gates and are not inferred from green CI.

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

## 5. Open Risks and Work After Phase 9

The current authoritative scope is the 23-phase plan in `ROADMAP.md`. Phases 1–9 are complete for implementation and automated acceptance under the explicitly documented fail-closed exclusions. Work remaining is dependency ordered:

- **Phase 10 — canonical protocol contract:** compare all message/action enums, serializers, schemas, Worker routes, validators and Android handlers; consolidate event application through one typed path; migrate legacy receiver behavior only with parity tests.
- **Phase 11 — event reliability:** sequence ordering, replay protection, duplicate requests and resynchronization.
- **Phase 12 — durable recovery:** reconnect and authority handoff lifecycle beyond the Phase 9 timed-effect/SpiritArrow acceptance scope.
- **Phase 13 — session lifecycle:** common room/readiness state and failure-safe start/leave behavior.
- **Phases 14–16 — transports:** Internet/WebSocket, LAN, Bluetooth with an honest unavailable state if necessary.
- **Phases 17–19 — modes:** Co-op lifecycle, PvP/Deathmatch, Survival.
- **Phases 20–21 — UI:** truthful host/join/setup flow followed by localization, RTL/layout, accessibility, cancellation and cleanup.
- **Phase 22 — automated/service preflight:** real room/action lifecycle tests, multi-client scenarios, exact-SHA CI, deployment configuration and fresh-room Worker smoke test.
- **Phase 23 — user-led physical-device playtest:** final only. The user reports actual results; append coherent Phase 24+ fixes afterward and preserve symptoms/reproduction steps.


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

### 2026-11-13 — Phase 9 final closeout audit and Phase 10 handoff

- Re-read the live branch history, all 21 Markdown files, Phase 9/10 scope, source/test baseline and exact CI evidence. Confirmed Phase 9 is complete for implementation and automated acceptance under its explicit support boundary; unsupported XP level-up/item callbacks, advanced Monk callbacks, RemoteHero/player LifeLink, unsupported item/Buff callbacks, SpiritArrow SPEED volleys and non-Mob targets remain fail-closed.
- Verified gameplay/test baseline `bc6c46b03fee040ff20311adb473b19ff78e9bb7` and exact CI run 43472587588: Backend 682 executions across eight Vitest files, Android JVM/Debug APK and three local Workers-runtime Durable Object SQLite tests passed.
- Real SQLite tests cover rollback/replay across eviction, persisted-snapshot publisher handoff with pending-combat closure, and committed-state reconstruction after eviction. This is local Workers runtime evidence, not a deployed production Worker.
- Corrected stale Phase 9 status/history references and synchronized the Phase 10 entry across GPT.md, ROADMAP.md, continuation notes and technical references. No gameplay source change was needed during final closeout.
- Phase 10 is next: canonical schema/enum/serializer/Worker/Android-handler parity, one typed event-application path, and parity-tested migration of remaining RemotePlayerActionReceiver behavior. Keep Phase 11 out of scope.



### 2026-10-29 — Explicit handoff before switching conversations

- The user asked to resume Phase 6, then explicitly asked to record the exact stopping point, remaining work and next action before moving to a new conversation.
- Rechecked the live branch and found Phase 6 already complete for implementation and automated acceptance; no gameplay changes were made during this read-only continuation audit.
- Read-only paths traced included native `Item.execute(AC_DROP)`, item split/merge ID behavior, `Hero`'s queued/published native mutation flow, `Item.cast` projectile setup, `MissileWeapon.resolveMultiplayerProjectileImpact`, and Worker DROP/THROW/heap-mutation validators. Current code captures source inventory state, checks destination identity/heap deltas, treats ambiguity as resync, and resolves projectile outcomes as `HEAP`, `PIN_CUSHION` or `CONSUMED`; Phase 6 already has focused regressions for these paths.
- Phase 7 is the active work area. Diff from Phase 6 checkpoint `859be3d6b1aea3b3fe13802fe9298d2344162edc` to tested source `9c2bf9c520a7f18067a331e14461ff2eefb9b8a6` shows ongoing item-use/food/potion/scroll/wand, shop, alchemy, inventory snapshot, protocol, Worker validation and backend-test work. Files are enumerated in the authoritative checkpoint above.
- The last source fix is `9c2bf9c520a7f18067a331e14461ff2eefb9b8a6`; exact-SHA CI [40909964645](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40909964645) passed backend TypeScript build/tests and Android JVM tests/debug APK compile. The mirrored test files each ran 203 cases (203 source scenarios mirrored; 406 total executions).
- **Resume with Phase 7, not Phase 6.** First compare all existing Phase 7 code to every item in `ROADMAP.md`, then finish gaps and add regressions; do not claim the phase done until exact final SHA CI passes. Keep Phase 22 deployed-service verification and Phase 23 physical-device testing open.



### 2026-10-29 — User-requested Phase 6 continuation completed by current-state verification

- Re-read the current branch head, the full execution rules, Phase 6 roadmap criteria, native DROP and stack split/merge behavior, destination-heap validation, missile-impact lifecycle, server mutation validators and focused regression tests.
- Confirmed Phase 6 was already complete on tested code/test SHA `859be3d6b1aea3b3fe13802fe9298d2344162edc`; exact-SHA CI [40508581979](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40508581979) succeeded for backend typecheck/tests and Android JVM/debug APK compilation. Its final regression commit adds tests for DROP replay/shared-cell heap reconciliation, quickslot quantity, and projectile outcomes.
- Verified current branch head `dd1e488306e1214fa266d1abd12ebcfb745c7183`. Its latest code/test ancestor `9c2bf9c520a7f18067a331e14461ff2eefb9b8a6` passed exact-HEAD CI [40909964645](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40909964645); the two later commits only edit GPT.md and ROADMAP.md. That latest green workflow reported 203 mirrored test executions per TS/JS file (406 executions, 203 mirrored source cases).
- No duplicate implementation was added: all Phase 6 acceptance items, including full/partial inventory-to-floor accounting, stack-compatible merge rules, stable IDs, item-by-item heap reconciliation, duplicate/replay rejection and native projectile `HEAP`/`PIN_CUSHION`/`CONSUMED` outcomes, are present and covered.
- Corrected the stale status in this document: Phase 6 is complete; the next whole phase is Phase 7 — Inventory Actions and Item Economy, which remains open. `ROADMAP.md` already records Phase 6 complete.
- No physical-device multiplayer match or deployed Worker end-to-end test was run; retain those gates at Phase 23 and Phase 22 respectively.

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

### 2026-10-28 — Resumed Phase 6 and verified current branch state

- Re-read `GPT.md`, the authoritative Phase 6 scope, the drop/partial-stack/projectile implementation and its Worker/Android tests. The live branch was already beyond the earlier saved checkpoint: Phase 6 was marked complete on `859be3d6b1aea3b3fe13802fe9298d2344162edc`, and later commits had started Phase 7 inventory-economy work.
- Verified branch HEAD `99d4d6e4fdf4aab7487f68b7b13321f1a4e81ea5` and its exact-HEAD workflow [40515866931](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40515866931). Backend TypeScript build passed, 380 Vitest executions passed across mirrored TS/JS files (not 380 unique source scenarios), and Android JVM tests/debug APK compilation passed (`BUILD SUCCESSFUL`).
- Confirmed the current source still has the Phase 6 stable identity and heap-delta validation, the full/partial DROP checks, and the deferred native projectile-impact path for HEAP / PinCushion / consumed outcomes. No duplicate Phase 6 implementation was added because the existing phase is already complete and its regressions pass on the later branch tip.
- No deployed Worker end-to-end test or physical-device match was run. Those remain Phase 22 and Phase 23 respectively. Phase 7 is the next phase and already has partial code on the branch, but stays open until its complete scope is audited and accepted.


### 2026-10-28 — Phase 6 continuation and Phase 7 CI recovery

- Resumed from the actual branch state instead of recreating Phase 6: `ROADMAP.md` and the latest code confirm Phase 6 is already complete for implementation and automated acceptance, including exact full/partial DROP source remainders, floor heap item-by-item reconciliation, native missile impact outcomes, and regression coverage.
- Audited the current branch's Phase 7 entry work. The commit `3ce9ece02165a0aed8d4097404849930fcb2609c` had a Java string-escaping error in `MultiplayerActionDispatcher.java` for the `sourceTerrain` mining detail. Fixed it in `1e9087d8ec02f04879853fc10c2d6748070f1fe1` using valid JSON string construction.
- Exact-HEAD CI [40729427066](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40729427066) passed backend TypeScript build/tests and Android JVM tests/debug APK compilation. This verifies the latest code tip but is not a Phase 7 acceptance claim.
- No deployed Worker end-to-end test or physical-device match was run. Phase 7 remains open; the next whole-phase work is to audit and finish its native inventory actions/economy acceptance criteria.


### 2026-10-29 — Phase 6 continuation audit and exact-HEAD regression recovery

- Resumed from the current branch and re-read `GPT.md`, the Phase 6 entry in `ROADMAP.md`, and the native DROP, heap reconciliation, and missile combat-impact paths.
- Confirmed Phase 6 had already met its implementation and automated-acceptance criteria on this branch: exact full/partial DROP accounting, stable IDs, quickslot deltas, shared-cell heap reconciliation, replay rejection, and native missile landing/PinCushion/consumption are implemented and tested. No duplicate Phase 6 implementation was added.
- The latest prior HEAD had two mirrored failures in a Phase 7 mining-buff regression. Fixed the validator wiring in `server/src/index.ts` by passing serialized values to `isValidNativeUnchangedBuffState` instead of already-parsed objects. Fix commit: `9c2bf9c520a7f18067a331e14461ff2eefb9b8a6`.
- Exact-HEAD CI [40909964645](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40909964645) passed backend TypeScript build and tests (203 tests in each mirrored TS/JS test file; 406 executions, not unique scenarios) and Android JVM tests/debug APK compilation (`BUILD SUCCESSFUL in 54s`).
- Phase 7 remains open. No deployed Worker end-to-end test or physical-device match was performed; keep those at Phase 22 and Phase 23 respectively.


### 2026-10-29 — Phase 7 inventory action-cost binding and audited scope

- Continued from the actual Phase 7 checkpoint rather than repeating Phase 6. Re-read the operating notes and Phase 7 acceptance criteria, then traced native item consumption, the fail-closed scroll/wand paths, equipment, shop transactions, alchemy, and the action-bound world-mutation submission/acceptance path.
- Added `isValidNativeMutationActionCost` in `server/src/index.ts`. For actions protected by the native-mutation lock, the server now compares the cooldown delta from the trusted Hero pre-state to the reported native post-state with the exact `actionCost` accepted and added to world time. A snapshot cannot be committed when its native cooldown cost disagrees with the accepted world-time cost.
- Added positive/negative regressions in `server/src/index.test.ts` for matching costs, zero/negative/clamped deltas, mismatched costs, invalid values, and missing cooldowns.
- Exact-source CI [40927978622](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40927978622) passed backend TypeScript build/tests and Android JVM tests/debug APK compilation. Vitest reported 205 tests in each mirrored TypeScript/JavaScript output (410 executions, not 410 unique scenarios).
- Phase 7 remains **OPEN**. Scroll `READ`, wand `ZAP`, and Shopkeeper buyback are intentionally rejected rather than accepted without complete native transaction validation. The remaining work is to finish auditing the full supported/unsupported item-action matrix and implement additional native paths only where their complete before/after state can be validated. No deployed Worker end-to-end or physical two-device match was run; Phase 22 and Phase 23 remain open.
- Code commit: [3291bfb](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/commit/3291bfbca20d540aeab8b323c93d2633c473ef4e). Follow-up item-clock verification and its exact-HEAD acceptance are recorded below.


### 2026-10-29 — Phase 7 native consumable clock reconciliation

- Traced the original Java engine: `Actor.storeInBundle` serializes `Hero.time`, and native food/potion code calls `Hero.spend()` before publishing the resolved item transaction. The previous server comparison treated that time field as immutable, although native cooldown advances along with it. Updated the consumable validator to allow `time` only when the Hero actor-time delta equals the top-level cooldown delta.
- Tightened timed `Haste`, `Invisibility`, and `Levitation` validation: the serialized buff expiration time must agree with `buffCooldown` when evaluated against the same native Hero actor clock. Added positive native-clock fixtures and negative tests for mismatched or missing clock/cooldown fields and forged buff duration.
- Intermediate CI [40928973468](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40928973468) caught the new mismatch-clock regression before the buff-schedule check was implemented. The follow-up fix is [e4f57ad](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/commit/e4f57ad0d65f9857a346a67879db6182631897d2); exact-HEAD CI [40929166097](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/40929166097) passed backend build/tests (206 mirrored source cases executed twice, 412 reported executions) and Android JVM tests/debug APK compilation.
- Phase 7 remains **OPEN**. Scroll `READ`, wand `ZAP`, and Shopkeeper buyback still fail closed until their native outcomes can be validated completely. The broader acceptance work remains outstanding, and no deployed Worker end-to-end or physical-device two-player test was run; Phase 22 and Phase 23 remain open.


### 2026-10-30 — Phase 7 inventory actions and item economy completed

- Completed the full Phase 7 acceptance scope. Enabled item actions use original native SPD resolution; the Worker validates trusted pre-state, accepted action identity/cost, inventory/economy/quickslot changes, floor results, stable IDs and replay/claim state.
- Enabled paths include supported food/potions/scroll reading, regular equipment actions, Shopkeeper BUY/SELL/BUYBACK, Gold/EnergyCrystal/key/chest transactions, alchemy, DarkGold mining and the supported Endure/Nature's Power abilities. Unsupported scrolls/wands, conditional or transformed equipment, quest rewards, non-whitelisted abilities and ambiguous bag/item changes fail closed.
- Final audit fixes: blocked pickup effects that would desynchronize run-global Ring knowledge; blocked unsupported potion side effects before consumption; rejected LostBackpack's multi-system restore callback; and rejected tipped-dart merging when it would spawn extra ordinary darts. Java and backend regressions cover each boundary.
- Exact tested gameplay SHA `744b78cebfae17609dd2b7d43e9d19bd42774056`; exact-HEAD CI [41112954455](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41112954455) passed schema validation, backend build, 456 Vitest executions, Android JVM tests and debug APK compilation.
- Phase 7 is **COMPLETE for implementation and automated acceptance**. Phase 8 is next. No deployed Worker end-to-end smoke test or physical two-device match was run; those remain Phases 22 and 23.


### 2026-10-31 — Phase 8 inventory persistence, restoration and exactly-once rewards completed

- Completed Phase 8 on `multiplayer-framework-core-14118577486727081892`; exact tested gameplay commit: `e36bc8030755050e3eae3d45ccab4db1040a65f5`.
- Added bounded, versioned `MultiplayerRunProgress` capture/restore for native statistics, catalog state, local badges, generator decks, limited drops, special/secret-room state, ring knowledge, chapters, generated floors, pending floor drops and quickslot placeholders. Hero/inventory bundles retain exact nested ownership, item IDs, partial stacks, equipment and quickslots; restore bypasses normal pickup auto-packing/stack merging.
- Closed accepted-state persistence gaps for native combat results, Ankh consumption/revival and validated world mutations. Trusted pre-state matching binds notes, key counts, quests and Potion/Scroll identification so unaccepted intents cannot rewrite them. Native bundles are bounded and preflighted before any world mutation.
- Added stable per-depth/Mob kill-reward receipts; the same kill cannot be claimed again under a different request ID. Inventory/drop/heap/quest/statistics regression coverage includes full snapshot reapplication, nested containers, remains/skeleton heaps, dew, keys, quest items and LostBackpack after Ankh revival. Inactive NPC quests now clear stale flags/rewards during restore.
- Exact-head CI [41230208577](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41230208577) passed backend typecheck, **472/472** Vitest tests, Java tests and Android Debug APK compilation (`BUILD SUCCESSFUL`).
- Scope note: individual co-op death intentionally does not invoke the single-player `Hero.reallyDie()/Bones.leave()` final-run path; that would delete a local run and write a device-global Bones file. Multiplayer persists existing skeleton/remains heaps and the authoritative LostBackpack heap instead. Physical two-device and deployed Worker end-to-end checks remain Phases 22/23.
- Phase 8 is **COMPLETE for implementation and automated acceptance**. Next: **Phase 9 — Native Buffs, Consumable Effects and Timed State**. Do not infer Phase 9 completion from Phase 8's Hero/run-state persistence.



### 2026-10-31 — Phase 9 native Hero Buff reconciliation checkpoint

- Exact tested gameplay code/test SHA: `d1c2f180f29846ce16d20c010a38805754b9b70f`; exact-HEAD CI [41240428476](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41240428476) passed Backend typecheck/tests and Android JVM tests/debug APK compilation.
- Fixed native Hero Buff state parsing for nested Java Buff classes outside `actors.buffs` (including `BrokenSeal.WarriorShield`, `Blocking.BlockBuff` and `Wand.Charger`). Their rows are parseable and remain immutable unless a dedicated source-tick validator explicitly supports them.
- Added narrow validation for `Char.damage()` side effects: only native `Frost` and `MagicalSleep` removal is permitted during an HP/shield-damaging Hunger/Poison tick; all other unrelated buff rows must remain unchanged. Poison ticks are rejected when `LifeLink` exists because the current single-Hero result omits the linked target's mutation.
- Removed `Levitation` from background-expiry admission. Its native `detach()` calls `Level.occupyCell()`, so treating that as a simple missing buff could hide tile/trap/world effects.
- Phase 9 remains OPEN. Wand.Charger item charge synchronization, Recharging interaction/order, other shield actors, broader periodic effects and potion/scroll lifetime coverage, exactly-once/replay, death handling and reconnect-expiry behavior remain mandatory work.

