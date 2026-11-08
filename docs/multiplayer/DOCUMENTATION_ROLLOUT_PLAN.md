# Temporary Multiplayer Documentation Rollout Plan

> Temporary coordination document. This is not part of ROADMAP.md, is not a gameplay phase, and must be deleted after Batch 2 is complete and the permanent guidance is transferred to the documentation index and GPT.md.

## Goal

Create a durable, English-language, source-grounded documentation system for the multiplayer implementation. It must explain the project, architecture, file responsibilities, inter-file relationships, data flows, tests, operational boundaries, and exact continuation procedure so future work can inspect the relevant source and proceed without repeating a full repository analysis.

Documentation is live engineering material. Every source, test, protocol, configuration, or documentation edit — including a one-character edit — must update all affected references immediately and in the same logical work unit. GPT.md and ROADMAP.md are kept synchronized with applicable deep-dive documents.

## Audit baseline

- Repository: majd7772233-a11y/shattered-pixel-dungeon-ar
- Branch: multiplayer-framework-core-14118577486727081892
- Baseline HEAD: 1c48f0e5c70c9e774a3931ee08e332c7c79d8220
- Parent gameplay code SHA: b9ad0739d10d6a4125fb6ea084d6d072b2699810
- Exact-HEAD CI: run 41490481958, success
- Repository tree: 1,956 tracked blobs; tree response was not truncated
- Multiplayer Java package: 32 files
- Backend implementation: one 10,095-line server/src/index.ts file at baseline
- Current phase state: phases 1–8 complete for implementation and automated acceptance; phase 9 in progress/open; phases 10–23 open
- No deployed Worker smoke test or physical two-device match is claimed

## Two-batch plan

These batches are documentation-production units only. They do not split, renumber, or modify the 23 gameplay phases.

### Batch 1 — foundation and navigation

| File | Intended content | State |
|---|---|---|
| docs/multiplayer/README.md | Reading order, source-of-truth hierarchy, live documentation policy, audited repository snapshot and continuation method | Complete in this commit |
| docs/multiplayer/PROJECT_OVERVIEW.md | Product goal, boundaries, terminology, current state and source entry points | Complete in this commit |
| docs/multiplayer/SYSTEM_ARCHITECTURE.md | Gradle/runtime architecture, trust boundaries, native/server responsibility, durable data, threading and startup | Complete in this commit |
| docs/multiplayer/COMPONENT_AND_FILE_MAP.md | 32 multiplayer Java files, native integration points, backend/schema/config/tests and change impact | Complete in this commit |
| docs/multiplayer/AUTHORITATIVE_DATA_FLOWS.md | Startup, native actions, combat, scheduler, snapshots, replay/resync, inventory/loot, transitions and modes | Complete in this commit |
| docs/multiplayer/BUILD_TEST_AND_CI.md | Build configuration, commands, tests, workflow triggers, deployment boundary and evidence limits | Complete in this commit |
| docs/multiplayer/DOCUMENTATION_ROLLOUT_PLAN.md | This temporary batch tracker | Complete in this commit |

Batch 1 is accepted only after files are committed on the requested branch, content is re-read from the resulting HEAD, GPT.md and ROADMAP.md reference it, and exact resulting branch validation is checked.

### Batch 2 — deep technical reference

| File | Intended content | State |
|---|---|---|
| ANDROID_NATIVE_INTEGRATION.md | Method-level native integration for Actor, Hero, RemoteHero, Mob, Level, Dungeon, scenes, native item/buff hooks and render-thread constraints | Planned |
| SERVER_VALIDATION_AND_STORAGE.md | Exported validator domains, MatchRoom method map, SQLite table/column dictionary, migration/locking/transaction/event-sequence behavior | Planned |
| PROTOCOL_MESSAGE_CATALOG.md | Every protocol message type, envelope field, schema definition, producer, consumer, trust owner, persistence effect and error/resync response | Planned |
| TEST_MATRIX.md | Individual test files and describe/test suites mapped to features, phases, source methods, positive/negative boundaries and CI jobs | Planned |
| SESSION_RECOVERY_AND_SECURITY.md | Session/token lifecycle, authority ownership, stable identity, replay/idempotency, sequence gaps, resync, FOV disclosure, deployment/runtime operations and security risks | Planned |
| SOURCE_FILE_REFERENCE.md | Expanded source-file reference across project modules, package responsibilities, assets/config grouping and dependency/change-impact pointers | Planned |

Batch 2 must be balanced to Batch 1 in detail. Avoid copying existing material verbatim; add deeper symbol/table/message/test mapping that Batch 1 intentionally summarizes.

## Live maintenance rule

For every subsequent edit:
1. Read the exact current source file and its callers/tests at the working HEAD.
2. Identify which reference pages describe that code or data flow.
3. Update those pages immediately along with the source/tests.
4. Update GPT.md and ROADMAP.md in the same logical change if continuation, phase status, acceptance, risk, architecture, or next action changes.
5. Record exact file paths and test/CI evidence. Include small and one-character changes in the same edit record.
6. Re-read resulting docs at the committed HEAD and ensure references resolve.
7. If a file is renamed/deleted, update every inbound link and file-map entry before calling the work complete.

## Removal condition

After Batch 2:
- verify all six deep-reference files;
- update README.md with permanent reading order;
- transfer final documentation governance rules and completion record to GPT.md;
- ensure ROADMAP.md keeps the live documentation rule but does not turn doc creation into gameplay scope;
- delete this temporary plan in the same documentation cleanup commit.

Only then is this temporary tracker retired.
