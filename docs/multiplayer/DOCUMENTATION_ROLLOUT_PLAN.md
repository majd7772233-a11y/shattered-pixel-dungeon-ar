# Temporary Multiplayer Documentation and Large-Source Rollout Plan

> Temporary coordination document. This is not part of ROADMAP.md, is not a numbered gameplay phase, and must be retired after the Batch 3 design discussion is complete and all permanent guidance has been transferred.

## Goal

Build a durable, detailed, English-language engineering reference from the current repository source. The intent is to preserve analysis across interruptions, reduce repeated discovery, and make future changes easier to resume without reconstructing the entire project every time.

Markdown documentation and large-source restructuring are deliberately separate. Batch 1 and Batch 2 create/update documentation only. Batch 3 assesses large source files and proposes a safe modular structure; it does not automatically authorize a high-risk refactor.

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
- server/src/index.ts: 10,095 lines / 658,825 bytes
- Phase state: 1–8 complete for implementation and automated acceptance; 9 in progress/open; 10–23 open
- No deployed Worker smoke test or physical two-device match is claimed

## Three independent batches

These are documentation/source-organization production batches only. They do not split, renumber or change the 23 gameplay phases.

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

### Batch 3 — large-source structure assessment and proposal

This batch is separate from Markdown creation and requires a source dependency analysis before implementation decisions.

Initial high-complexity candidates:

| File | Baseline size | Why it needs separate treatment |
|---|---:|---|
| server/src/index.ts | 658,825 bytes / 10,095 lines | Pure validators, room lifecycle, persistence, actions, WebSocket routing and event broadcast are combined |
| Hero.java | 117,061 bytes | Native action, combat, inventory, world mutation, damage and death integrations |
| WorldSnapshot.java | 83,795 bytes | Validation, restore, reconciliation and rollback are tightly coupled |
| MessageRouter.java | 68,021 bytes | Outer routing, snapshot parsing, combat, accepted actions and event application |
| Mob.java | 66,010 bytes | Native AI, scheduler, combat, reward and multiplayer reporting |
| GameScene.java | 60,874 bytes | Scene lifecycle, rendering, visuals, sprites and update coordination |
| Level.java | 55,788 bytes | Native geometry, generation, metadata, transitions and world collections |
| MultiplayerManager.java | 30,457 bytes | Session, transport, identity, sequence and publication coordination |
| server/src/index.test.ts | 337,158 bytes / 5,556 lines | 57 describe groups and 277 source test declarations |
| NativeCombatRuntimeIntegrationTest.java | 2,648 lines | 46 cross-layer native JVM integration tests |

Batch 3 deliverable:
1. inspect all relevant callers/imports/exports and tests for each candidate;
2. identify high-cohesion responsibility boundaries;
3. compare modular extraction options, including the user's Tanweer server layout as one reference;
4. propose target module tree and responsibility ownership;
5. identify dependency cycles, shared contracts, Worker entry point and Durable Object class constraints;
6. map every config, import, test, build, workflow and deployment file requiring change;
7. propose incremental extraction order and exact behavioral parity checks;
8. identify migration, rollback and risk controls;
9. present the recommended design for discussion before performing a large refactor.

No Batch 3 code extraction is approved by this planning document. The user explicitly wants to discuss the best solution first. Do not begin source moves merely because a candidate file is long. A single large file can sometimes be safely decomposed into cohesive modules, but an unplanned split can increase coupling and create more navigation work.

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
- Batch 3 is complete only after its source-structure proposal is reviewed with the user and the agreed plan or explicit decision not to refactor is recorded.
- After Batch 3 is concluded, transfer the permanent governance and final status to README/GPT/ROADMAP, then delete this temporary tracker in a final docs cleanup commit.

