# Multiplayer Engineering Documentation

> Source-grounded documentation for the multiplayer implementation in Shattered Pixel Dungeon AR. Batch 1 architecture baseline: 1c48f0e5c70c9e774a3931ee08e332c7c79d8220. Batch 2 detailed-source baseline: eb2075b3f09ca4779773140b7e6539a6655f6824. The pages describe observed source and evidence; they do not imply every feature is complete.

## Purpose

This directory is the persistent technical map for the multiplayer project. It reduces repeated repository discovery, preserves cross-layer knowledge across interrupted sessions, and identifies the right source files, callers, tests, and documentation to update.

All engineering pages in this set are written in English for consistency with source identifiers, protocol values, build output and the project roadmap.

## Reading order

1. PROJECT_OVERVIEW.md — product scope, boundaries, terminology and current evidence.
2. SYSTEM_ARCHITECTURE.md — Gradle modules, native runtime, networking, Worker/Durable Object, storage and trust boundaries.
3. COMPONENT_AND_FILE_MAP.md — current responsibilities and change impact for multiplayer files.
4. AUTHORITATIVE_DATA_FLOWS.md — startup, actions, combat, snapshots, recovery and transitions.
5. ANDROID_NATIVE_INTEGRATION.md — method-level Java/libGDX and Android integration.
6. SERVER_VALIDATION_AND_STORAGE.md — validator domains, MatchRoom methods, SQLite schema and request paths.
7. PROTOCOL_MESSAGE_CATALOG.md — outer message types, actions, event records and payload definitions.
8. TEST_MATRIX.md — source test files, suite inventory, coverage limits and CI mapping.
9. SESSION_RECOVERY_AND_SECURITY.md — session token, replay, authority, reconnect, locks, FOV and risk notes.
10. SOURCE_FILE_REFERENCE.md — module/file inventory, source-refactor stages and protected native files.
11. BUILD_TEST_AND_CI.md — exact build/test commands, workflow behavior, deployment boundary and evidence limits.
12. PHASE14-B3_ANDROID_NETWORK_RECOVERY.md — current Android network/background lifecycle, heartbeat, endpoint and hosted-service gate evidence.

## Current continuation checkpoint — 2026-11-19 — Phase 14-B3 local follow-on; runtime gates deferred

- Phase 14-A is CLOSED. Phase 14-B1 callback/transport ownership and 14-B2 render-thread dispatch are CLOSED with exact-head CI. Phase 14-B3 implementation and local automated verification are current; parent 14-B and Phase 14 remain OPEN.
- Android API 21+ connectivity monitoring is integrated with Activity create/resume/pause/destroy. API 24+ tracks the exact default network and API 21–23 use an INTERNET request. Callback identity + monitor-generation fencing prevents callbacks from a stopped/recreated Activity monitor from publishing late state. Start/stop and state publication share the monitor lock.
- Current forced local Android/JVM: **58/58 Gradle tasks executed; BUILD SUCCESSFUL; 11 JUnit XML reports / 172 tests / 0 failures / 0 errors / 0 skipped**. Debug APK: 35,219,222 bytes; SHA-256 `F31514F7D57573CAEEBD9633848AF9201DFA364AFD1E2A3CD67E5FD532D8951A`.
- The regular multiplayer CI workflow runs Backend, Durable Object SQLite and Android JVM/debug-APK validation only; the Android Emulator job was removed. A later manual runtime helper is kept behind `ALLOW_DEFERRED_ANDROID_RUNTIME_SMOKE=1`, but it has NOT been run and must remain disabled until the user authorizes that later phase.
- Worker `spd-multiplayer-backend` remains deployed at `https://spd-multiplayer-backend.magd.workers.dev`; deployment run [44549387460](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44549387460) bound `MATCH_ROOM`. `MAGD_JWT_SECRET` was provisioned but current session auth is still opaque random tokens, not JWT.
- No Android app/Emulator/ADB runtime test and no hosted room create/join/resume/WebSocket/failure smoke has been run in this follow-on. These service/platform gates remain open; emulator-visible host/join/lobby work remains Phase 20, RTL/touch/layout remains Phase 21, and physical multi-device gameplay remains Phase 23.
- Base exact-head CI before this follow-on: [run 44550669826](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44550669826) passed three jobs on `9904aa120b60f195a2df76b48f901862254ce65f`; it predates these local changes. Re-verify exact-head CI after pushing the follow-on commit.
- Follow-on exact-head CI run 44576949868 passed 3/3 jobs on source commit 33513defbabf4bd3e64e0ee9ae9e2e90f2f4a48e (Backend, Durable Object SQLite and Android JVM/debug APK).
## Current source-refactor state

The three-stage source refactor is complete for implementation and automated acceptance. Exact-HEAD CI [run 42486485451](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42486485451) passed on `a513327caf7e500d8416befae8c04a984a4bbc18`: Backend typecheck/full tests and Android JVM/debug-APK jobs both succeeded.

Stage 1 moved all 200 original top-level declarations before the original `MatchRoom` class into 15 focused protocol/validator/helper modules. A normalized declaration-text comparison verified 200/200 matches with no body-text differences. All 118 historical validator/protocol/helper named exports remain available through the root facade.

Stage 2 moved the Durable Object into seven responsibility modules under `server/src/match-room/`. One final `MatchRoom` class is exported from `match-room/index.ts`; all internal layers share the same instance and mutable state.

Stage 3 moved the original default Worker router unchanged into `server/src/worker.ts`. The 35-line `server/src/index.ts` remains Wrangler's configured `main`, re-exports the default Worker handler, all 118 historical exports, and the named `MatchRoom` class. `server/src/entrypoint.test.ts` checks the room route, same-Request forwarding, `DEFAULT_ROOM` fallback, non-room response, and root `MatchRoom` export.

The Stage 2 baseline root had 51 lines; after Stage 3 it has 35 lines. `protocol/schema.json`, `server/wrangler.jsonc` binding/class identity and migration, and protected Java files `Hero.java`, `Mob.java`, and `WorldSnapshot.java` remain unchanged. The refactor does not alter gameplay phases 1–23. No live Worker deployment or physical two-device session is claimed.

## Historical checkpoint — 2026-11-15 — Phase 11-B closed

- **Repo/branch:** majd7772233-a11y/shattered-pixel-dungeon-ar / multiplayer-framework-core-14118577486727081892.
- **Code/test SHA:** `2574489ff25e6f1fedc1e21718161bc5a7a1b230`; exact-head CI [43731016036 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036).
- **Phase 10:** closed for implementation and automated acceptance.
- **Phase 11-A:** historical characterization baseline retained as regression evidence; it is no longer the current behavior description.
- **Phase 11-B:** event ordering, contiguous sequence acceptance, requestId/action/payload binding, fail-closed conflict handling, atomic ACTION transaction behavior and regression coverage are complete for the accepted scope.
- **Android:** EVENT_BATCH rejects gaps/conflicting duplicate sequences, sorts out-of-order contiguous rows, applies behind rollback baselines and commits the watermark only after success. Phase 11-B baseline had 74 NativeCombatRuntimeIntegrationTest methods and 15 NetworkProtocolParityTest tests; current Phase 12-A source counts are 78 and 20, with 3 reconnect lifecycle tests.
- **Worker:** canonical request fingerprints allow exact retry replay and reject changed payload/action or cross-player requestId reuse. Transactional ACTION writes roll back together; success messages are emitted only after commit.
- **CI:** Backend 10 files / 740 reported executions, Android JVM tests + Debug APK, Durable Object SQLite 4/4. Mirrored TS/JS executions are not unique source scenario counts.
- **Boundaries at the 2026-11-15 Phase 11-B checkpoint:** protocol remained 25 messages / 23 actions; Phase 12 had not yet been authorized at that timestamp. Phase 12-A/B completion, exact-head CI and later review are recorded in the current 2026-11-16 checkpoint below.

## Current checkpoint - 2026-11-17 - Phase 13 CLOSED (implementation + automated acceptance)

Phase 12 remains closed. Phase 13 is CLOSED for implementation and automated acceptance: lifecycle-v1 server authority, WndMultiplayerLobby, validated room roster, render-thread ROOM_STATE/MATCH_START handling, reconnect/failure exit and native gameplay gating until PLAYING are implemented. Local evidence: backend 372 unique TypeScript source scenarios / 744 reported executions, real Durable Object SQLite 17/17, Android core JVM 141/141 and forced full test assembleDebug PASS. Abrupt owner WebSocket loss, atomic owner/publisher handoff, all-member readiness reset and former-owner reconnect/roster restoration have server and Android regression coverage. Exact-head Actions run 1272 [https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44149425355] passed all three jobs on fbf46ef15a1ec4554710a43894cfa4969c3176a7. Visible emulator host/join/lobby checks are deferred to Phase 20 and RTL/touch/layout checks to Phase 21. Production deployment and physical two-device test remain unclaimed.

## Superseded pre-closeout checkpoint - 2026-11-18 - Phase 14-A

Phase 13 remains CLOSED for implementation and automated acceptance at its previous documented boundary. Phase 14 is split into two independently accepted slices:

- **14-A — WebSocket wire transport:** endpoint/Worker source-contract verification, secure upgrade and status handling, TLS hostname verification and timeouts, RFC 6455 frame parsing/writing, masking, fragmentation, UTF-8, control frames and deterministic localhost tests.
- **14-B — Android/session lifecycle:** manager/callback/retry thread safety, render-thread UI, Android connectivity/background/screen-off handling and live Worker room lifecycle smoke tests. This slice is NOT STARTED.

**14-A local evidence at HEAD `11955c577eec4ebbb09075a7f60263fa72d6d12a`:** 17/17 `InternetTransportProtocolTest` tests passed; full Gradle `test assembleDebug` completed BUILD SUCCESSFUL (57 tasks, 6 executed / 51 up-to-date); 11 JUnit XML reports / 158 core tests / 0 failures / 0 errors / 0 skipped. Debug APK: 36,949,486 bytes; SHA-256 `A83DCAC35975C328E12423D4A2967C1B870370D72B1992B6B0AB9970A3EDE329`.

The client preserves 401/403/409 HTTP status lines for rejected-session handling, validates the canonical 16-byte Sec-WebSocket-Key and Bearer header syntax, and refuses session credentials on insecure `ws://`. Exact-head Actions for the final source+documentation commit are still pending; the 16 MiB payload cap still needs a compatibility comparison against the largest supported serialized native level/run snapshot.

A localhost mock verifies the WebSocket wire path, but it does not establish production Worker availability or a live service smoke test. No production deployment or physical-device connection is claimed. Phase 14-B and emulator visual acceptance remain separate gates.

## Source-of-truth hierarchy

1. The exact source tree at the active branch HEAD is implementation truth.
2. Protocol schema, Java serializers/parsers, server validators and client handlers jointly define the wire contract.
3. ROADMAP.md is the authority for phase scope, dependencies, acceptance criteria and phase status.
4. GPT.md is the authority for user rules, current continuation state, verified findings, decisions, risks and next action.
5. docs/multiplayer/ explains current architecture, responsibility, data flow, tests and file impact. It is maintained reference material, not executable truth.
6. CI/test output proves only behavior actually exercised at the exact tested commit. It does not prove live deployment or physical device networking.

If source and documentation disagree, verify the active code and repair the documentation in the same logical work unit. Never edit code by blindly trusting an old document.

## Continuous documentation contract

Update documentation while implementation is being changed, not retrospectively at phase end. This applies to every edit, including one-character fixes, import changes, message strings, constants, conditions, schema fields, test assertions, build settings, file moves and deletions.

For each edit:
- identify the affected behavior and docs;
- update the relevant deep reference and any file/data-flow/test map;
- update GPT.md with new verified continuation state, risks, evidence and next action;
- update ROADMAP.md whenever phase scope/status, acceptance, dependency or project-level risk changes;
- record small changes in the same work log;
- repair inbound links after renames/deletions;
- keep implementation and explanatory docs in the same logical commit whenever possible.

If interrupted, record the exact remaining documentation update and complete it before unrelated work resumes.

## Audit baseline and evidence

| Item | Value |
|---|---|
| Repository | majd7772233-a11y/shattered-pixel-dungeon-ar |
| Working branch | multiplayer-framework-core-14118577486727081892 |
| Batch 1 commit | eb2075b3f09ca4779773140b7e6539a6655f6824 |
| Gameplay code parent | b9ad0739d10d6a4125fb6ea084d6d072b2699810 |
| Batch 1 exact-HEAD CI | [Run 42470021358](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42470021358) — success |
| Source tree blobs | 1,963 at the Batch 2 baseline |
| Tracked Markdown files | 15 before Batch 2; 21 after its six new files |
| Multiplayer Java package | 34 files (including Phase 13 room state/member models) |
| Backend entry | Historical baseline: 10,095 lines / 658,825 bytes; after Stage 1: 3,635 lines; after Stage 2: root `server/src/index.ts` was 51 lines; after Stage 3: root facade is 35 lines, router is `server/src/worker.ts`, and `MatchRoom` is in `server/src/match-room/index.ts` |
| Phase state | Phases 1-13 closed for implementation and automated acceptance; Phase 20 host/join/lobby UX, Phase 21 RTL/layout, Phase 22 deployment/service gate and Phase 23 physical-device gate remain open |
| Live Worker smoke test | Not claimed |
| Physical two-device match | Not performed / not claimed |

Batch 1 and Batch 2 were documentation-only. The separate source-refactor Stage 1 is recorded above; gameplay phases 1–23 remain unchanged.

## Repository at a glance

- SPD-classes/ — shared SPD engine support.
- core/ — main Java/libGDX game, multiplayer client integration, assets and JVM tests.
- android/ — Android app and platform adapters.
- desktop/ and ios/ — platform modules; Android CI does not prove multiplayer readiness there.
- services/ — news and update integrations.
- server/ — Cloudflare Worker/Durable Object and TypeScript tests.
- protocol/ — shared JSON Schema.
- .github/workflows/ — branch validation, deployment and release automation.
- GPT.md — continuation rules and technical working memory.
- ROADMAP.md — authoritative 23-phase implementation plan.

## How to resume

1. Read active branch HEAD.
2. Read the latest GPT.md checkpoint and ROADMAP.md current phase state.
3. Read the relevant page in this directory.
4. Reopen the actual source, all affected callers, tests and config at active HEAD.
5. Trace the complete native → wire → Worker → persisted event/snapshot → client apply path.
6. Implement and test the smallest coherent behavior.
7. Update every affected doc immediately, including one-character changes.
8. Verify exact-commit CI, and separately record deployment/device evidence.
9. Never mark a phase, mode, transport or feature complete based only on source presence or compilation.

The three-stage source refactor is complete for implementation, source parity and automated acceptance; its permanent status and module map are recorded above and in SOURCE_FILE_REFERENCE.md. Hero.java, Mob.java and WorldSnapshot.java remain unchanged.


## 2026-11-14 — Phase 9 revalidation

The Phase 9 roadmap and source/test evidence were re-audited. All 11 completion items remain satisfied, including Poison/LifeLink atomic batching, supported timed Buff effects, Wand.Charger/Recharging, SpiritArrow authority result and requester reconciliation, and durable publisher handoff/rebase. Unsupported effects remain deliberate, regression-tested fail-closed exclusions. No Phase 9 implementation task remains open under the accepted scope. Stale technical-reference descriptions were reconciled; no game or Worker source changed.

## Historical 2026-11-14 — Phase 11-A dependency preflight (blocked at that time)

At parent HEAD `cf3714c82a210eace79614ab7c575acb04b8aebb`, matching CI [43523497982](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43523497982) passed all three jobs. That audit found Phase 10 still OPEN and intentionally did not start Phase 11-A. Phase 10-E subsequently closed the route and payload-inventory dependency at implementation/test SHA `f2d79038d1e420461be7a1956471324de5c1ef74` / CI [43618725089](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43618725089). The sequence/replay/resync findings remain audit-only Phase 11-A targets; no Phase 11 implementation is included in the Phase 10 closeout.

## Current continuation checkpoint — 2026-11-16 — Phase 12 CLOSED

- **Repo / only branch:** `majd7772233-a11y/shattered-pixel-dungeon-ar` / `multiplayer-framework-core-14118577486727081892`.
- **Phase 12 implementation commit:** `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8`, pushed on the permitted branch and covered by exact-head CI 43921670336. The branch subsequently advanced through documentation-only status commit `41f27293214134ce5c9a11ad1ea816b3ae3f2c61`; this continuation adds another docs-only synchronization. No PR or merge was created.
- **Phase 12-A:** CLOSED for implementation/automated acceptance — authenticated Bearer-header session binding, token rotation, stale-socket rejection and Android reconnect lifecycle are implemented and tested.
- **Phase 12-B:** CLOSED for implementation/automated acceptance — persists/restores `currentSequence` and `gameStatus`, validates persisted room metadata, keeps 200 recent replay events plus separately protected LifeLink/player-damage evidence, and rejects a missing current level when related durable state remains. Legacy rooms without a gameStatus key derive `ENDED` from MATCH_END, `PLAYING` only from a complete current-depth native snapshot, or `LOBBY` when no full run snapshot exists.
- **Verified local evidence:** TypeScript build/noEmit PASS; backend 5 TypeScript source test files / 372 unique cases PASS (10 reported files / 744 executions including emitted JS mirrors); actual Cloudflare Workers Durable Object SQLite integration 1 file / 14 tests PASS (eviction/replay, retention, legacy room recovery, schema versions 1–2 and preservation of old claims, atomic LEVEL_DATA rollback/retry, publisher loss without a valid snapshot). Android forced `test assembleDebug --rerun-tasks` completed BUILD SUCCESSFUL: 10 XML reports / 132 core JVM tests / 0 failures, errors or skips; Debug APK generated at `android/build/outputs/apk/debug/android-debug.apk` (35,187,190 bytes).
- **Boundaries:** total retained event rows can exceed 200 to preserve up to 513 LifeLink damage proof rows per sender plus last buff/damage boundary rows. The replay path sends only complete contiguous gaps up to 50; otherwise it uses SNAPSHOT. Schema migrations v1–2, atomic LEVEL_DATA replacement and token-fenced Level Publisher loss/election/rebase are implemented and locally tested. Protocol remains 25 messages / 23 actions.
- **Exact-head CI:** [GitHub Actions 43921670336](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43921670336) passed all three jobs for `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8`. The requested final source review is complete; Phase 12 is CLOSED for implementation and automated acceptance. Production Worker deployment and physical two-device gameplay remain Phase 22/23 gates.
