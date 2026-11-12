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

## Current source-refactor state

The three-stage source refactor is complete for implementation and automated acceptance. Exact-HEAD CI [run 42486485451](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42486485451) passed on `a513327caf7e500d8416befae8c04a984a4bbc18`: Backend typecheck/full tests and Android JVM/debug-APK jobs both succeeded.

Stage 1 moved all 200 original top-level declarations before the original `MatchRoom` class into 15 focused protocol/validator/helper modules. A normalized declaration-text comparison verified 200/200 matches with no body-text differences. All 118 historical validator/protocol/helper named exports remain available through the root facade.

Stage 2 moved the Durable Object into seven responsibility modules under `server/src/match-room/`. One final `MatchRoom` class is exported from `match-room/index.ts`; all internal layers share the same instance and mutable state.

Stage 3 moved the original default Worker router unchanged into `server/src/worker.ts`. The 35-line `server/src/index.ts` remains Wrangler's configured `main`, re-exports the default Worker handler, all 118 historical exports, and the named `MatchRoom` class. `server/src/entrypoint.test.ts` checks the room route, same-Request forwarding, `DEFAULT_ROOM` fallback, non-room response, and root `MatchRoom` export.

The Stage 2 baseline root had 51 lines; after Stage 3 it has 35 lines. `protocol/schema.json`, `server/wrangler.jsonc` binding/class identity and migration, and protected Java files `Hero.java`, `Mob.java`, and `WorldSnapshot.java` remain unchanged. The refactor does not alter gameplay phases 1–23. No live Worker deployment or physical two-device session is claimed.

## Active project checkpoint — 2026-11-12

- Repo/branch: `majd7772233-a11y/shattered-pixel-dungeon-ar` / `multiplayer-framework-core-14118577486727081892`.
- Live HEAD: `9168284e67d353a956fc276e0ea8c00d1c685f1d` — `Type payload on SpiritArrow publisher messages`; parent `f5f88a11c693589a4f6f41486ab0dc65824306f7`.
- Exact-head [CI 43290836162 — failure](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43290836162): Backend build/schema pass; 8 Vitest files, 654 passed / 4 failed of 658 executions; Android JVM and Debug APK pass.
- Two distinct failures mirrored in TS/JS: positive publisher result sees `COMBAT_REQUEST → ACTION_ACCEPTED → ERROR`; forged-`attackerPos` negative test receives a correlated requester `ERROR` despite expecting no response.
- Positive result helper already has `attackerPos: 9`; Java verifies native RemoteHero reports its actual position. Missing/forged positions stay rejected.
- Active slice 9-C only. Phase 9 remains open; do not start Phase 10.
- Local MissileSprite callback/cancel tests pass headlessly with manual completion, not rendered animation. Publisher finish ordering and requester EVENT_BATCH application remain unproven.
- `f5f88a11` adds authenticated player-id exclusion to FOV event broadcasts; investigate post-ACK ERROR and recipient/sequence.
- Permanent workflow: one coherent bounded subphase per conversation; read all 21 Markdown files plus newly discovered files, inspect exact HEAD/CI, update docs/tests, provide Arabic handoff and stop.
- No live Worker, Durable Object SQLite/restart, rendered projectile or physical two-device proof is claimed.


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
| Multiplayer Java package | 32 files |
| Backend entry | Historical baseline: 10,095 lines / 658,825 bytes; after Stage 1: 3,635 lines; after Stage 2: root `server/src/index.ts` was 51 lines; after Stage 3: root facade is 35 lines, router is `server/src/worker.ts`, and `MatchRoom` is in `server/src/match-room/index.ts` |
| Phase state | Phases 1–8 complete for implementation and automated acceptance; Phase 9 in progress/open; Phases 10–23 open |
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
