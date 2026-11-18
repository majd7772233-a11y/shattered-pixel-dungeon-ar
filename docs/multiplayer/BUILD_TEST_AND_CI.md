# Build, Test, and CI Reference

## 1. Scope

This document records commands and workflow configuration inspected at the documentation audit HEAD. It distinguishes local source checks, backend compilation/tests, Android JVM tests/debug APK compilation, live Cloudflare Worker deployment/smoke test, and physical two-device playtest. These are different evidence levels.

## Current Phase 14-A Closeout Verification — 2026-11-18

This section records local and exact-head CI evidence for the closed Phase 14-A implementation. Final source/test HEAD `0f0d84e24ecbdc3253ae17d6a2d613c4513cac28` passed all three jobs in [GitHub Actions run 1285 / 44353955443](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44353955443): Backend typecheck/tests, Android Debug APK compilation and real Durable Object SQLite rollback/eviction.

- **Branch:** `multiplayer-framework-core-14118577486727081892`; no other branch, PR or merge is part of this work.
- **Complete SNAPSHOT byte policy:** Android's unchanged limit is **16,777,216 bytes**. Server cap is **16,252,928 UTF-8 bytes (15.5 MiB)**, leaving 512 KiB. `snapshot-size.ts` counts JSON.stringify-compatible UTF-8 bytes; it pre-counts nested payload before serialization and checks the complete escaped outer envelope before sending. Oversize fails with `SNAPSHOT_TOO_LARGE`.
- **Atomic preflight:** LEVEL_DATA, ACTION, JOIN_ROOM, READY, MATCH_START and projected floor transitions are measured before their transaction/floor state commits. Initial WebSocket handshake and authenticated reconnect admission also preflight before token rotation or accepting the socket; oversize returns HTTP 413 `SNAPSHOT_TOO_LARGE`. Oversized candidates roll back. RECONNECT/RESYNC and room-resume failure paths surface explicit errors. Lifecycle-v1 snapshots are restricted to connected durable room members.
- **Inbound frame guard:** text frames above 16 MiB UTF-8 are rejected before JSON parsing. Android cap is unchanged.
- **Replay:** full snapshots contain the newest 200 events in ascending sequence order; older LifeLink proof/evidence rows remain in SQLite. Regression keeps all 515 stored rows while RESYNC sends 200.
- **Backend:** `npm test` — all schema/routing/protocol guards and **380 Vitest tests / 6 files passed**. `npm run build` / TypeScript passes. `server/tsconfig.json` uses `noEmit:true` to avoid generated JS in the source tree.
- **Real Durable Object:** Workers + Durable Object SQLite integration — **17/17 passed**.
- **Android:** `gradlew.bat test assembleDebug --no-daemon --console=plain` — **BUILD SUCCESSFUL**, 57 tasks; 11 core JUnit XML reports / **159 tests / 0 failures / 0 errors / 0 skipped**.
- **Debug APK:** `android/build/outputs/apk/debug/android-debug.apk`; 36,949,480 bytes; SHA-256 `A05D0A2B1FE4A0C8AD36402935594E548222CCF533939DE7DF9355836BE5190C`.
- **SDK environment:** process-local `ANDROID_HOME` and `ANDROID_SDK_ROOT` used `C:\\Users\\Magd\\AppData\\Local\\Android\\Sdk`; no global environment or `local.properties` changed.
- **Maximum-collection fixture:** 100×100 cells, 512 mobs, 10,000 heaps/traps/plants/visited/mapped positions, four players, 2,060 stored events and 200 transmitted replay events. Inner level JSON **13,631,699 bytes**, complete LEVEL_DATA **14,613,062 bytes**, complete SNAPSHOT **15,664,067 bytes**; 588,861 bytes below server cap and 1,113,149 bytes below Android cap.
- **Byte boundary regressions:** exact 15.5 MiB accepted and one-byte-over rejected; oversized nested JSON rejected before serialization; JSON/UTF-8 parity verified for Arabic, accents, emoji, lone surrogates and escaped controls.
- **Evidence boundary:** no production Worker, hosted live room/session, emulator UI or physical two-device match is claimed.

## Phase 14-B1 local verification - 2026-11-18

- Command: gradlew.bat test assembleDebug --rerun-tasks --no-daemon --console=plain.
- Environment: process-local ANDROID_HOME and ANDROID_SDK_ROOT pointed to the configured Android SDK. No repository local.properties or machine-wide environment variable was written.
- Result: BUILD SUCCESSFUL, 57 Gradle tasks executed. Core JUnit reports: 11 XML files / 161 tests / 0 failures / 0 errors / 0 skipped.
- Debug APK: android/build/outputs/apk/debug/android-debug.apk, 35,210,270 bytes; SHA-256 C1789E2DC63CD543ECFDF461A202D96B5BD5A59D580B9E90B3320BAC44F59D18.
- Targeted forced run of MultiplayerReconnectLifecycleTest and InternetTransportProtocolTest also passed before the full suite.
- This is local JVM/build evidence only. No exact-head GitHub Actions run exists until this change is committed and pushed. The command does not test a deployed Worker, Android radio/network transitions, background/screen-off behavior, or rendered UI.
## 2. Backend package

Working directory: server/

Inspected server/package.json:

| Script | Command | Purpose |
|---|---|---|
| build | tsc | Compile/type-check TypeScript according to tsconfig.json. |
| test | node scripts/validate-phase7-native-mutation-schema.mjs && node scripts/validate-spirit-arrow-schema.mjs && node scripts/validate-publisher-handoff-schema.mjs && node scripts/validate-phase10-protocol-enums.mjs && node scripts/validate-phase10-routing.mjs && vitest run | Run six static native/schema/protocol/routing/payload contracts, then Vitest. |

Normal backend validation sequence from repository root:

1. cd server
2. npm ci
3. npm run build
4. npm test

npm ci is the CI installation command and uses package-lock.json. Use the package scripts rather than inventing a second command path. Run the full suite after changing shared validators, action admission, protocol shape, or persistence behavior.

Backend dependencies inspected:
- Runtime dependencies: none declared in dependencies.
- Development dependencies: Cloudflare Worker type definitions, TypeScript, Vitest.
- Node version in CI: 20.

## 3. Android / Java build

From repository root, the CI Android job executes:

    ./gradlew test assembleDebug --no-daemon

The job:
- uses Temurin Java 17;
- makes the Gradle wrapper executable;
- runs participating JVM tests;
- assembles the Android debug APK;
- uses the multi-module Gradle graph (:SPD-classes, :core, :android, platform/service modules).

The core module is a Java library and uses libGDX headless runtime for JVM tests. Android is an application module depending on :core and includes native libGDX libraries during packaging.

Run focused tests only when the relevant Gradle task/test filter is known and appropriate; the full workflow command remains the baseline acceptance check.

## 4. Branch CI workflow

File: .github/workflows/multiplayer-ci.yml
Workflow name: Multiplayer Branch Validation.

### Triggers

- Push to multiplayer-framework-core-14118577486727081892.
- Pull requests with configured path filters.
- Relevant source, schema, Gradle, workflow, project-memory, and multiplayer documentation paths are included.
- Batch 1 adds docs/multiplayer/** to both push and pull-request path filters so edits to this documentation set receive the branch validation workflow.

### Jobs

| Job | Environment | Steps | Evidence produced |
|---|---|---|---|
| server — Backend typecheck and tests | Ubuntu, Node 20 | npm ci, npm run build, npm test in server/ | Backend typecheck, static schema check, Vitest suite |
| android — Android debug APK compile | Ubuntu, Temurin Java 17 | Enable wrapper, ./gradlew test assembleDebug --no-daemon | JVM tests and debug APK compilation |
| durable-object-sqlite — Durable Object SQLite rollback and eviction | Ubuntu, Node + Workers runtime test runner | Run server/src/match-room/durable-object-sqlite.integration.do.mjs | Real DO SQLite commit/rollback, eviction/reconstruction and publisher-handoff evidence under local Workers runtime |

Concurrency group is branch/ref-scoped and cancels an older in-progress run when a newer run for the same ref starts. Permissions are read-only contents: read.

### Documentation-triggered runs

A docs-only commit can trigger backend and Android jobs. That confirms the repository still builds/tests at that exact commit and the workflow path configuration includes the docs. It does not mean the docs are parsed by tests or every statement in them has been semantically proven.

## 5. Deployment workflow boundary

File: .github/workflows/deploy-server.yml

Observed triggers:
- push to master or main with changes under server/** or the deploy workflow;
- manual workflow_dispatch.

It runs backend install/tests and invokes cloudflare/wrangler-action@v3 using the CLOUDFLARE_API_TOKEN GitHub secret.

Critical implication: pushing to multiplayer-framework-core-14118577486727081892 does not automatically deploy the Worker through that workflow. Never infer that a successful multiplayer branch CI run published the backend to production. A deployment must be explicitly run through an authorized deployment path and followed by live smoke tests. Avoid suggesting a Wrangler CLI workflow on the user's Android environment; use repository automation/dashboard path where appropriate.

## 6. Historical evidence captured at the 2026-11-08 documentation audit (superseded by Section 9)

| Item | Value |
|---|---|
| Documentation audit HEAD | 1c48f0e5c70c9e774a3931ee08e332c7c79d8220 |
| Parent / gameplay code tested SHA | b9ad0739d10d6a4125fb6ea084d6d072b2699810 |
| Exact HEAD branch workflow | [41490481958](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41490481958) — success |
| Previous gameplay SHA workflow | [41489794307](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41489794307) — success |
| Phase 8 | Complete for implementation and automated acceptance |
| Phase 9 | Complete for implementation and automated acceptance under the explicit fail-closed support boundary |
| Phases 10–23 | Open |
| Live Worker smoke test | Not claimed |
| Physical two-device playtest | Not claimed |

The 2026-11-02 GPT checkpoint records 560 backend test executions across four files with mirrored TypeScript/JavaScript suites. Do not report that number as 560 unique test scenarios. The exact-HEAD workflow above is the current documentation commit's CI result.

## 6.1 Source-refactor Stage 1 verification

| Item | Evidence |
|---|---|
| Source implementation commit | `8a0a9f4f275f1a450aec066865d182de0f21125b` |
| Import correction commit | `4119263d9cc4dd5b230c551897b37dc4391417cf` |
| Exact-HEAD CI | [Run 42479978278](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42479978278) — success |
| Backend job | TypeScript build and full backend tests — success |
| Android job | JVM tests and debug APK compile — success |
| Source preservation | 200 declarations moved; all 118 previously public named exports retained through `index.ts`; MatchRoom and Worker default fetch retained |
| Protected files/config | Hero.java, Mob.java, WorldSnapshot.java, protocol/schema.json and Wrangler config unchanged |
| Deployment/device evidence | No live Worker deployment or physical multiplayer test claimed |

The first Stage 1 CI attempt exposed invalid relative imports from the new `index.ts` facade. Those 14 paths were corrected in the import-fix commit above; the successful run is tied to the corrected exact source SHA, not the failed intermediate commit.

## 7. Minimum validation matrix by change type

| Change | Minimum check before completion |
|---|---|
| Worker validator/action admission | TypeScript build, full backend tests, positive/negative tests, replay/malformed/stale pre-state tests |
| SQL schema/migration | Backend tests for schema migration and legacy rows; idempotent initialization; action/claim/event consistency |
| Message envelope/schema | Static schema script, backend build/tests, Java tests, parser/serializer parity and exact routing |
| Native Hero/Mob/Actor behavior | Core JVM tests, native runtime integration tests, backend validator tests, Android debug build |
| Snapshot capture/restore | Snapshot validation, round-trip/idempotency/rollback tests, Worker full-snapshot validation |
| Transport implementation | Framing/handshake/failure tests, matching-server integration, physical-device tests for device APIs |
| Connection/setup UX | Navigation and validation tests, failure/timeout/permission handling, truthful connection-state check |
| Mode enforcement/FOV | Server rule tests, client reconciliation/render tests, cross-client visibility and end-condition tests |
| Deployment config | Authorized deployment, deployed health/WebSocket smoke test, compatibility check and rollback plan |
| Documentation-only change | Verify exact files/references at HEAD; branch workflow should remain green when docs path filters match |

## 8. What CI does not prove

The current branch workflow does not:
- deploy a Cloudflare Worker;
- test the Worker endpoint currently hardcoded in setup against the exact branch code;
- verify Android Bluetooth runtime permissions or device pairing;
- verify LAN discovery across actual network interfaces/subnets;
- verify Internet WebSocket handshake through real network intermediaries;
- create a room from two physical devices;
- verify complete Co-op, PvP, Deathmatch, or Survival playability;
- prove every schema enum or action enum is implemented end to end.

Use separate deployment and user-led device-test records for those criteria. Phase 22 is the broad automated/deployed-service preflight; Phase 23 is the final physical-device playtest led by the user.


## 6.2 MatchRoom Stage 2 source extraction

Stage 2 separates the MatchRoom implementation into `server/src/match-room/` internal layers and retains `server/src/index.ts` as the stable Worker main and compatibility facade. The final exported Durable Object class is still named `MatchRoom`; the Wrangler binding/class_name and SQLite migration configuration are unchanged. The initial TypeScript attempts exposed a surplus class-closing brace, duplicate protocol-type imports and missing type imports; those were corrected without changing the extracted method bodies or handlers.

| Item | Evidence |
|---|---|
| Stage 2 source parent | `8b679910fcc76e6474c7ca81d066da8bc670735d` |
| Stage 2 implementation chain | `78e80177d9fb508f90c99879a0097e97c0fb929c`, `0651fb1ab97cb6006d41f8916e7daa5fb8058fc7`, `92661b809a84cc524ee76ce092061a87855721c0`, `237577f1e8c68a3f052b36fcac64cd7efc07918d` |
| Exact-HEAD CI | [Run 42483052104](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42483052104) — success |
| Backend job | TypeScript build and full Backend tests — success |
| Android job | JVM tests and debug APK compile — success |
| Root Worker entry | `server/src/index.ts` — 51 lines; default Worker fetch and public re-exports retained |
| Durable Object class | One exported `MatchRoom`, defined in `server/src/match-room/index.ts` |
| Protected source/config | No Java files, `protocol/schema.json` or `server/wrangler.jsonc` changed |
| Deployment/device evidence | No live Worker deployment or physical multiplayer test claimed |

A green branch CI run does not mean the Worker was deployed or a live room was tested.


## 6.3 Worker entry integration and Stage 3 parity

Stage 3 keeps `server/wrangler.jsonc`'s `main: src/index.ts` stable while moving the default request router into `server/src/worker.ts`. The root facade re-exports the default handler and retains all original named validator/helper exports plus `MatchRoom`. `server/src/entrypoint.test.ts` checks room routing, exact Request forwarding, `DEFAULT_ROOM` fallback, the non-room information response and the root Durable Object export.

The source-preservation audit reconciled all 200 original top-level declarations before the original `MatchRoom` class against the 15 destination modules using normalized declaration-text comparisons: 200/200 matched without text differences. The 118 historical validator/protocol/helper exports and the `MatchRoom` named export remain available. The separate Stage 2 inheritance chain still contains a single `MatchRoom` class and shares one Durable Object instance.

Exact-HEAD Stage 3 CI [run 42486485451](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42486485451) passed on `a513327caf7e500d8416befae8c04a984a4bbc18`: the Backend typecheck/build and full tests (including schema validation) succeeded, and Android JVM tests plus debug APK compilation succeeded. Backend reported 568 executions across six test files; generated/mirrored TypeScript and JavaScript outputs mean this is not 568 unique source scenarios. A green workflow is not a live Worker deployment or a physical-device multiplayer result. The deploy workflow remains scoped to `master`/`main` pushes or manual dispatch.

## 9. Historical verified branch checkpoint — 2026-11-13

- Repository/branch: `majd7772233-a11y/shattered-pixel-dungeon-ar` / `multiplayer-framework-core-14118577486727081892`.
- Gameplay/test baseline: `bc6c46b03fee040ff20311adb473b19ff78e9bb7`; exact code/test workflow [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588).
- Backend: 8 Vitest files, 682 executions passed (mirrored JS output is not a unique-source count).
- Android: JVM tests and Debug APK passed.
- Workers runtime: 3 real Durable Object SQLite integration tests passed.
- Re-run CI on the live branch HEAD before any later edits; green branch CI does not deploy the production Worker.
- Backend: TypeScript build passed; 8 Vitest files; 682 test executions passed. Generated/mirrored TS/JS outputs mean this is not a count of unique source scenarios.
- Android: `./gradlew test assembleDebug --no-daemon`; JVM tests passed and `assembleDebug` completed with `BUILD SUCCESSFUL`.
- Workers runtime: one integration file, 3 tests passed against real Durable Object SQLite, covering rollback/replay across eviction, publisher handoff after persisted snapshot and pending-combat closure, and reconstruction after eviction.
- Phase 9: complete for implementation and automated acceptance. XP level-up/item callbacks, advanced Monk callbacks, RemoteHero/player LifeLink and unsupported item/Buff effects remain fail-closed.
- Phase 10: closed at exact-head SHA f2d79038d1e420461be7a1956471324de5c1ef74 / CI 43618725089. At that historical Phase 10 checkpoint, Phase 11 was eligible but had not started.
- CI does not deploy this branch. The deploy workflow is scoped to master/main changes or manual dispatch. A green branch run is not a production Worker smoke test, rendered projectile evidence or physical two-device gameplay; Phases 22–23 own those checks.



## 10. Phase 10-A canonical protocol enum/version check

The backend npm test command now invokes server/scripts/validate-phase10-protocol-enums.mjs before Vitest. The script compares Java MessageType and NetworkActionType to the ordered schema enums, checks the 1.0.0 protocol version/default against NetworkMessage.java, and verifies that the existing nativeMutationAction allowlist remains a subset of declared Java actions. It is a static contract guard, not proof that every message/action has a Worker handler or an end-to-end client path.

Exact implementation SHA d8938190960af64d6efc70f4625a7411bfa3b7de passed [GitHub Actions run 43485367695](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43485367695): Backend build and tests, Android JVM/debug-APK compilation, and Durable Object SQLite rollback/eviction tests all succeeded.

## Phase 10-B — outer-message routing admission

Backend `npm test` now runs six static guards before Vitest. The added `validate-phase10-routing.mjs` compares the exact Java/schema 25-message vocabulary with the Worker’s eight explicit inbound and 17 known non-inbound classifications, checks that the route list matches the Worker dispatch branches, checks explicit Worker branch tokens for all 23 actions, and protects the fail-closed INVALID_ACTION default. `message-admission.test.ts` covers malformed envelopes, optional field types, version mismatch, nested malformed payloads, unknown messages and known non-inbound messages.

The gate is part of the ordinary `npm test` path, not a separate CI-only check. The Android workflow continues to run `./gradlew test assembleDebug --no-daemon`; this Phase 10-B slice did not change Java code. Exact-head Actions status must be checked after every resulting commit. A pure admission-helper test is not a deployed Durable Object WebSocket lifecycle test.


### Phase 10-B exact-head CI result

Corrected implementation SHA `d16be138d74bb9930777f5352efbeae3291070c6` passed [Actions run 43494769215 — all three required jobs succeeded](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43494769215). Backend TypeScript build and 708 Vitest executions across 10 files passed; the routing guard reported eight Worker inbound types, 17 known non-inbound types and 23 explicit Worker ACTION branches. Android JVM/Debug APK and all three Durable Object SQLite rollback/eviction tests passed. The successful SHA also preserves the established handler exception message contract used by transaction rollback tests.


## 10-C exact-head CI result

The Phase 10-C source/test baseline 2d9a36d6c90ae95a91e6d08dca7a5bc4861c7fa5 passed [GitHub Actions run 43512831773](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43512831773). All three jobs completed successfully:
- Backend typecheck/build and 10 Vitest files / 708 executions passed.
- Android JVM tests and ./gradlew test assembleDebug --no-daemon completed with BUILD SUCCESSFUL.
- Three Durable Object SQLite runtime integration tests passed.
The 708 backend executions include mirrored generated TypeScript/JavaScript tests and are not 708 unique source scenarios. These results do not represent a production Worker deployment or a physical-device test.

## 10-D exact-head verification — typed PLAYER_LEFT route

The expanded PLAYER_LEFT behavior test first passed through the original default/legacy route on pre-migration test-only SHA `6e5ea7c88ba0238d46c3d728ca0fb4437d3f3630`, CI [43521307026](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43521307026), with all three jobs green. This is the old-behavior proof required before changing route ownership.

Final implementation/test SHA `cc61c68625f587576ca530aef3354bfaffe9e140` passed exact-head CI [43522055301](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43522055301):
- Backend typecheck/build: 10 Vitest files / 708 executions passed;
- Android: JVM test suite and Debug APK compilation passed; log ends with `BUILD SUCCESSFUL in 1m 1s`;
- Durable Object local Workers runtime: 1 test file / 3 SQLite integration tests passed.

An intermediate implementation/test run (43521714424) failed at Java test compilation because the new legacy-refusal assertions referenced a TestTransport fixture that had not been retained in the test method. The fixture was corrected in the final SHA and the exact-head full CI rerun passed. No assertion was removed or relaxed.

At that historical 10-D implementation SHA, the Android test class contained 64 @Test methods and verified the bounded PLAYER_LEFT migration. The later 10-E closeout contains 67 @Test methods and completes the agreed route/payload acceptance; see §11. Production Worker deployment and physical-device gameplay are still not claimed.


## 11. Phase 10-E exact-head closure verification — 2026-11-14

Exact implementation/test SHA f2d79038d1e420461be7a1956471324de5c1ef74 passed [Actions run 43618725089](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43618725089), with all three required jobs successful:

- Backend typecheck/build, six static guards and 10 Vitest files / 708 executions passed. Routing contract output: eight Worker inbound message types, 17 known non-inbound types, 23 Worker ACTION branches and 25 explicit Android route decisions. ACTION field contract output: 23 per-action envelopes, 361 Worker-consumed field names (346 source-referenced in Java producer files and 15 Worker-only), 18 required native snapshot fields.
- Android JVM suite and ./gradlew test assembleDebug --no-daemon passed; build log ends with BUILD SUCCESSFUL. NetworkProtocolParityTest contains 15 tests; NativeCombatRuntimeIntegrationTest contains 67 @Test methods.
- Durable Object Workers runtime passed all three SQLite rollback/eviction integration tests.

The 708 backend executions include mirrored/generated TypeScript/JavaScript and are not 708 unique source scenarios. CI does not deploy the production Worker and does not count as a physical two-device test. Phase 10 is closed for implementation/automated acceptance; at this historical CI checkpoint, Phase 11-A had not started. WAIT/USE_ABILITY are declared but non-emitted by Android and remain fail-closed; Android CHAT remains explicitly non-routed.


## Phase 11-A characterization test gate — 2026-11-14 (exact-head CI verified)

Starting audited branch HEAD `3a1924c7e482757543b2500dda86b1d3e94960af`; final Phase 11-A code/test SHA `1aa62a881dfef122256be253e2c96fd94eddcdea` passed exact-head [CI 43641719063](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43641719063), all three jobs green:
- Backend TypeScript build + six static guards + 10 Vitest files / 718 executions passed.
- Android JVM suite and Debug APK compilation passed (`BUILD SUCCESSFUL`).
- Durable Object Workers runtime: 3 SQLite integration tests passed.

The test-only change adds five Worker MatchRoom scenarios in `server/src/match-room/lifelink-death.integration.test.ts` and three Android JVM tests in `NativeCombatRuntimeIntegrationTest.java` (67 → 70 methods); `NetworkProtocolParityTest` remains at 15 methods. CI run 43641470951 on the earlier intermediate test commit exposed malformed Java JSON escaping; commit `1aa62a88` fixed the literals and added explicit Hero HP/position non-mutation assertions. No Worker handler/validator/SQL, Android runtime class, protocol or native game source changed. This closes only the Phase 11-A characterization gate; parent Phase 11 remains OPEN.

## Phase 11-B — event reliability and idempotent ACTION closeout (2026-11-15)

Code/test SHA `2574489ff25e6f1fedc1e21718161bc5a7a1b230` passed exact-head [CI 43731016036](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036); all three jobs succeeded.

- **Backend:** TypeScript build and 10 Vitest files / 740 reported executions passed.
- **Android:** latest local full-suite run: 132 core JVM tests, 0 failures/errors/skips; Debug APK assembleDebug passed. Current test inventories: NativeCombatRuntimeIntegrationTest.java 78 @Test methods, NetworkProtocolParityTest.java 20, MultiplayerReconnectLifecycleTest.java 3.
- **Durable Object Workers runtime:** four real SQLite integration tests passed.
- **Coverage added/updated:** contiguous replay ordering, gap/malformed-row rejection without watermark advance, stale/incomplete snapshot safety, exact-request fingerprint replay, changed/cross-player request conflict, migration compatibility, delegated authority completion identity, concurrent exact retry and atomic rollback/after-commit broadcast behavior.
- Historical Phase 12-A-only checkpoint before Phase 12-B: Phase 11 remains closed; TypeScript noEmit PASS; backend source-only Vitest 5 files / 370 tests PASS; Cloudflare Workers Durable Object SQLite runtime 1 file / 5 tests PASS; protocol guards 25 messages / 23 actions; Gradle core JVM tests and assembleDebug PASS. The Phase 12 local evidence is recorded immediately below, including the forced 132-test Android rerun and the additional migration/atomicity/publisher-loss runtime regressions.

## 12. Phase 12-A / Phase 12-B local verification checkpoint — 2026-11-16 (worktree, not CI)

Initial Phase 12-A/12-B worktree checkpoint before commit/push: baseline `836d4e4739bba3877a1ce04df75b8a30ab0655ee` on `multiplayer-framework-core-14118577486727081892`, matching `origin` at start. At that initial checkpoint the changes were uncommitted and exact-head branch CI had not yet run; the later commit and exact-head CI result are recorded below.

- Backend TypeScript noEmit: PASS.
- Backend npm test: 5 Vitest files / 372 tests PASS; all six protocol/routing/payload guards pass, including 25 outer message types and 23 ACTION types.
- Real Cloudflare Workers Durable Object SQLite runtime: 1 file / 14 tests PASS. Includes eviction/reconstruction, cursor/status/worldTime restore, contiguous replay, snapshot fallback, retention, legacy schema upgrade, atomic LEVEL_DATA rollback/retry and publisher revocation when the native snapshot is missing.
- Android forced rerun: `.\gradlew.bat test assembleDebug --no-daemon --console=plain --rerun-tasks` completed BUILD SUCCESSFUL. XML reports: 10 files / 132 core JVM tests / 0 failures / 0 errors / 0 skipped. `android/build/outputs/apk/debug/android-debug.apk` was generated.
- Gradle reported pre-existing deprecated API/unchecked-operation notices and that it will not be compatible with Gradle 10; there were no build/test failures.

At that initial pre-commit worktree checkpoint, local green tests did not yet establish exact-head CI, deployed Worker readiness or physical-device multiplayer acceptance. Phase 12 implementation (versioned migrations, full LEVEL_DATA transactionality and token-fenced publisher loss/handoff) was subsequently committed and pushed; exact-head CI 43921670336 passed all three required jobs, and the final requested source review closed Phase 12 for implementation/automated acceptance.

## Phase 12 exact-head CI confirmation - 2026-11-16

Implementation/test commit `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8` on `multiplayer-framework-core-14118577486727081892` passed exact-head GitHub Actions [run 43921670336](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43921670336), triggered by push; all three required jobs completed successfully:

- **Backend typecheck and tests:** TypeScript build and backend test job PASS.
- **Android debug APK compile:** Java unit tests and debug APK compile PASS.
- **Durable Object SQLite rollback and eviction:** real Workers SQLite rollback/eviction recovery job PASS, including schema migration, atomic LEVEL_DATA and publisher recovery regressions.

The same committed tree passed local TypeScript noEmit, backend 5 files / 372 unique source tests (744 reported executions including mirrored/generated JS), real Durable Object SQLite 1 file / 14 tests, Android 10 XML reports / 132 core JVM tests (0 failures/errors/skips) and `assembleDebug` (`BUILD SUCCESSFUL`). This is exact-head automated CI, not a production Worker deployment or physical two-device gameplay test. The requested final Phase 12 source review is complete; Phase 12 is CLOSED for implementation and automated acceptance.

## Phase 13 current local verification (2026-11-17; partial worktree)

The following local checks apply to the Phase 13 source/test commit `7a75b493124f99a773b23d089a2ee8d3ded2ebd6` on the permitted branch:

- Backend TypeScript `npx tsc --noEmit --pretty false`: PASS.
- Backend `npm test`: 10 files / 744 reported executions, representing 372 unique TypeScript source scenarios plus generated JavaScript mirrors: PASS.
- Real Cloudflare Workers Durable Object SQLite integration `src/match-room/durable-object-sqlite.integration.do.mjs`: 1 file / 15 tests: PASS.
- Android `:core:test --no-daemon --console=plain --rerun-tasks`: BUILD SUCCESSFUL; 10 JUnit XML reports / 137 tests / 0 failures / 0 errors / 0 skipped.
- The full `test assembleDebug --no-daemon --console=plain --rerun-tasks` command passed on 2026-11-17: 57 actionable tasks, 137 core JVM tests with zero failures/errors/skips, and Debug APK assembled. APK is 35,197,092 bytes; SHA-256 `83C3104CBCA9B31B0C01D6F8A80F1A6C27B8984C2B5BB33938AC6570720EE371`. Re-run after the in-game lobby UI is integrated.
- Exact-head GitHub Actions [44100890572](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44100890572) passed Backend, Android and Durable Object SQLite jobs for commit `7a75b493124f99a773b23d089a2ee8d3ded2ebd6`.
- No production Worker deployment or physical two-device test is claimed.


## Historical intermediate Phase 13 lobby integration checkpoint (2026-11-17; superseded below)

This was the intermediate lobby-only checkpoint before owner-loss/rejoin acceptance was added. It is superseded by the current owner-loss/rejoin continuation below. The earlier APK/hash and CI run remain historical evidence for commit `7a75b493124f99a773b23d089a2ee8d3ded2ebd6` only.

- Backend `npm run build`: PASS. `npm test`: PASS, 10 Vitest files / 744 reported executions (372 unique TypeScript source scenarios; generated JavaScript mirrors are build outputs).
- Real Workers Durable Object SQLite integration: PASS, 16/16 tests. Phase 13 additions cover simultaneous JOIN_ROOM/MATCH_START, cancellation with all-member READY reset, successful synchronized start, MATCH_START/ROOM_STATE broadcasts, late-join refusal and post-start cancellation refusal.
- Debug APK: 35,202,307 bytes; SHA-256 `C2E40AA02A5161082EE2A196312F7B24AABDB82857019EFA1F20F50277C3C05B`.
- This is an intermediate pre-handoff checkpoint; the later owner-loss/rejoin continuation below contains the superseding final test totals and exact-head CI result.
- No production Worker deployment or physical two-device test was performed.
## Phase 13 owner-loss/rejoin continuation — 2026-11-17 (verified implementation commit and exact-head CI)

This record supersedes the previous lobby checkpoint for current local verification only. Previous APK hashes and CI runs remain attached to their original commit/SHA and must not be reused as evidence for the new worktree.

- Backend npm run build: PASS (TypeScript compiler exit 0).
- Backend npm test: PASS, 10 Vitest files / 744 reported executions. This is 372 unique TypeScript source scenarios plus generated JavaScript mirrors emitted by tsc; mirrors are not additional unique scenarios.
- Worker protocol guards: PASS — 25 message types, 23 action types, 12 inbound message types, 13 known non-inbound types, and 23 explicit Worker ACTION branches.
- Real Workers Durable Object SQLite: PASS, 1 file / 17 tests, including abrupt owner WebSocket loss, transactional owner/publisher transfer, publisher-term advance, all-member player READY reset and durable READY-proof invalidation, and authoritative ROOM_STATE broadcast.
- Android core JVM: forced :core:test --rerun-tasks PASS; 10 JUnit XML files / 141 tests / 0 failures / 0 errors / 0 skipped. The new resumedMemberAppliesTransferredOwnerAndFreshRosterAfterNetworkHandoff test verifies authenticated resume, rotated credential, stable former-owner identity, successor owner and complete roster replacement containing connected and offline members.
- Full Android build: test assembleDebug --rerun-tasks --no-daemon --console=plain PASS; 57 actionable Gradle tasks, all 57 executed. JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true was applied to this process only to avoid a local Gradle loopback file-lock listener bind conflict; no global environment/network configuration was changed.
- Debug APK: android/build/outputs/apk/debug/android-debug.apk, 35,202,307 bytes; SHA-256 C2E40AA02A5161082EE2A196312F7B24AABDB82857019EFA1F20F50277C3C05B.
- git diff --check: PASS after final documentation and source review. TypeScript-generated .js mirrors were removed from the worktree after testing; .ts sources and .mjs Durable Object test remain the maintained source files.
- Exact-head GitHub Actions run 1272 [https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44149425355] completed SUCCESS on fbf46ef15a1ec4554710a43894cfa4969c3176a7: Backend typecheck/tests, Android JVM tests + Debug APK compile, and Durable Object SQLite rollback/eviction all passed.
- Manual emulator UI/touch/layout acceptance: NOT_RUN by explicit user request; emulator remains available. Move visible lobby flow to Phase 20 and RTL/touch/layout checks to Phase 21. No production Worker deployment or physical two-device test is claimed.


## Phase 14-B1 exact-head CI - 2026-11-18

- Commit: `d9bff9e0aa8b5b3be7b34c2e7f9bb7a201c8d609` — Harden WebSocket session lifecycle for Phase 14-B1.
- GitHub Actions run [44391529189](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44391529189) completed with **3/3 jobs successful**: Backend typecheck/tests, Android debug APK compile and Durable Object SQLite rollback/eviction.
- This exact-head CI result complements the forced local Android run (57 tasks; 161 JUnit tests; zero failures/errors/skips; APK 35,210,270 bytes, SHA-256 `C1789E2DC63CD543ECFDF461A202D96B5BD5A59D580B9E90B3320BAC44F59D18`).
- CI does not deploy the Worker or prove a hosted room smoke, Android background/network transition, emulator UI or physical-device match; those remain open.
