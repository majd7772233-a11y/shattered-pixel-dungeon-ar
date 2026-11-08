# Temporary Multiplayer Documentation and Large-Source Rollout Plan

> Temporary coordination document for documentation batches and the approved three-stage backend source refactor. It is not a numbered gameplay phase and must remain while source-refactor stages are open.

## Goal

Build a durable, detailed, English-language engineering reference from the current repository source. The intent is to preserve analysis across interruptions, reduce repeated discovery, and make future changes easier to resume without reconstructing the entire project every time.

Markdown documentation and source restructuring are tracked separately. Documentation Batches 1–2 are complete. The source refactor is now approved as three implementation stages for server/src/index.ts only; Hero.java, Mob.java and WorldSnapshot.java are explicitly protected from splitting.

## Baselines

- Repository: majd7772233-a11y/shattered-pixel-dungeon-ar
- Branch: multiplayer-framework-core-14118577486727081892
- Batch 1 baseline: 1c48f0e5c70c9e774a3931ee08e332c7c79d8220
- Current Batch 2 source/docs baseline: eb2075b3f09ca4779773140b7e6539a6655f6824
- Latest gameplay code/test SHA: b9ad0739d10d6a4125fb6ea084d6d072b2699810
- Batch 1 exact-HEAD CI: run 42470021358, success
- Tracked blobs at Batch 2 baseline: 1,963
- Tracked Markdown files: 15 before Batch 2
- Multiplayer Java package: 32 files
- Original server/src/index.ts source baseline: 10,095 lines / 658,825 bytes
- Stage 1 current index.ts: 3,635 lines / 254,668 bytes; original declarations moved into 15 focused modules
- Phase state: 1–8 complete for implementation and automated acceptance; 9 in progress/open; 10–23 open
- No deployed Worker smoke test or physical two-device match is claimed

## Documentation batches and source-refactor stages

The documentation batches and source-refactor stages are separate work tracks. Neither splits, renumbers or changes the 23 gameplay phases.

### Batch 1 — foundation documentation

| File | Purpose | State |
|---|---|---|
| docs/multiplayer/README.md | Index, source-of-truth hierarchy, continuous documentation and resume procedure | Complete |
| docs/multiplayer/PROJECT_OVERVIEW.md | Product goal, native/server boundaries, terminology and evidence | Complete |
| docs/multiplayer/SYSTEM_ARCHITECTURE.md | Build/runtime architecture, trust, persistence and threading | Complete |
| docs/multiplayer/COMPONENT_AND_FILE_MAP.md | Main multiplayer files and change-impact map | Complete |
| docs/multiplayer/AUTHORITATIVE_DATA_FLOWS.md | Native/server/client action and recovery flows | Complete |
| docs/multiplayer/BUILD_TEST_AND_CI.md | Build, test, CI, deployment and evidence | Complete |
| docs/multiplayer/DOCUMENTATION_ROLLOUT_PLAN.md | Temporary tracker | Complete/retained for Batch 2 and 3 |

### Batch 2 — deep Markdown documentation only

| File | Purpose | State |
|---|---|---|
| docs/multiplayer/ANDROID_NATIVE_INTEGRATION.md | Method-level Actor/Hero/RemoteHero/Mob/Level/scenes/Android integration | Complete in Batch 2 |
| docs/multiplayer/SERVER_VALIDATION_AND_STORAGE.md | Validator domains, MatchRoom methods, SQLite schema/migrations and request paths | Complete in Batch 2 |
| docs/multiplayer/PROTOCOL_MESSAGE_CATALOG.md | Envelope, all message/action enums, direction, event batches and schema definitions | Complete in Batch 2 |
| docs/multiplayer/TEST_MATRIX.md | Server describe/test inventory, JVM suites, phase mapping and evidence limits | Complete in Batch 2 |
| docs/multiplayer/SESSION_RECOVERY_AND_SECURITY.md | Session/token, reconnect, sequence, replay, locks, authority, FOV and risk boundaries | Complete in Batch 2 |
| docs/multiplayer/SOURCE_FILE_REFERENCE.md | Module/file inventory, all Markdown files, critical source paths, file-size candidates | Complete in Batch 2 |

Batch 2 must not split, rename, move, extract or rewrite any Java/TypeScript source file. Its output is documentation only, plus synchronization of README.md, GPT.md, ROADMAP.md and this tracker.

### Source refactor — three implementation stages

#### Stage 1 — protocol types, pure validators and deterministic helper

- Move every original top-level declaration before MatchRoom into focused `protocol/`, `validators/` and `util/` files.
- Keep all original public named exports available from `server/src/index.ts`.
- Keep the complete MatchRoom class and Worker default fetch implementation in index.ts.
- Preserve the original declaration bodies, comments, constants, return conditions and fail-closed checks. Add only necessary module exports/imports.
- Keep test files on their existing `./index` import path unless a demonstrated code change requires otherwise.
- **State:** complete for source extraction and automated acceptance. Exact source SHA `4119263d9cc4dd5b230c551897b37dc4391417cf`; [CI run 42479978278](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42479978278) passed both backend and Android jobs.

#### Stage 2 — MatchRoom decomposition

- Move storage/schema and migration operations, session lifecycle, WebSocket routing, action-domain handlers, combat coordination, snapshot/transition methods, FOV and broadcasting into modules with explicit dependencies.
- Preserve one authoritative MatchRoom Durable Object export. Do not change Wrangler `MATCH_ROOM` binding, `class_name: MatchRoom`, migration history, SQLite statements/schema, alarm timings, session attachments, action replay/locks, sequence/event ordering or payloads.
- Avoid copying MatchRoom mutable state into multiple owners. Use explicit context contracts.

**State:** complete for extraction and automated acceptance. Exact source SHA `237577f1e8c68a3f052b36fcac64cd7efc07918d`; [CI run 42483052104](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42483052104) passed both Backend and Android jobs.

#### Stage 3 — Worker entry and end-to-end parity

- Finish Worker request routing and any supporting integration boundaries while keeping `server/src/index.ts` as `wrangler.jsonc`'s stable main.
- Trace every original declaration from the baseline to its new location; only remove transitional glue when all callers have moved and the replacement is proven equivalent.
- Audit tests, Java clients, protocol/schema, Wrangler, workflows and documentation.
- Run backend build/full tests and exact-HEAD Android JVM/debug-APK CI. CI does not count as live deployment or physical-device verification.

#### Protected native files

`Hero.java`, `Mob.java` and `WorldSnapshot.java` must remain as they are. Their current large size is not permission to split them. Other Java sources must only change if an actual dependency on a moved server implementation is demonstrated; TypeScript module paths alone do not create a Java dependency.

#### Stage completion gate

A stage remains open until source accounting proves all original elements are preserved, all dependent callers/tests/docs/config are adjusted, no behavior or protocol contract changed unintentionally, and exact-final-commit CI succeeds. If a check fails, repair and rerun before advancing.

### Out of scope for all documentation batches

- No change to gameplay phase numbering/status.
- No change to gameplay behavior or server validation.
- No deployment or Worker configuration mutation other than the existing documentation CI path filter.
- No physical-device claims.
- No merge to main.
- No branch creation.

## Continuous documentation rule

For every source, test, schema, resource, config, workflow or documentation edit — including a single-character correction:
1. reopen the exact target file and its affected callers/tests at the active HEAD;
2. identify every affected docs page/file map/data-flow/test reference;
3. update those docs in the same logical work unit;
4. update GPT.md and ROADMAP.md whenever continuation state, architecture, phase scope/status, risk, acceptance or next action changes;
5. record the changed paths and evidence, even for tiny changes;
6. run relevant tests and exact-commit CI;
7. verify links/references from the resulting commit.

## Completion and retirement

- Batch 1 is complete and its source/docs links have been verified.
- Batch 2 is complete only after all six detailed Markdown pages are committed, re-read at resulting HEAD, linked from README, synchronized with GPT/ROADMAP, and exact-HEAD CI is green.
- The source refactor is complete only after all three stages pass the stage completion gate and every original index.ts declaration has a verified destination. The protected native Java files remain unchanged.
- After all three source-refactor stages are concluded, transfer the permanent module map and final status to README/GPT/ROADMAP, then retire this temporary tracker in a final docs cleanup commit.

