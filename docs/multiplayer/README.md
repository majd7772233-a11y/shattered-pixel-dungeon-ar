# Multiplayer Engineering Documentation

> Source-grounded documentation for the multiplayer implementation in Shattered Pixel Dungeon AR. Baseline: branch commit 1c48f0e5c70c9e774a3931ee08e332c7c79d8220, audited on 2026-11-08. These pages describe observed source and evidence; they do not imply that every feature is complete.

## Purpose

This directory is the persistent technical map for the multiplayer project. It reduces repeated repository discovery, preserves cross-layer knowledge across interrupted sessions, and helps future work identify the right source files, callers, tests, and documentation to update.

All project documentation created in this set is written in English to stay consistent with identifiers, protocol values, build output, and the existing engineering roadmap.

## Reading order

1. **PROJECT_OVERVIEW.md** — product scope, gameplay boundaries, terminology, current evidence, and key entry points.
2. **SYSTEM_ARCHITECTURE.md** — Gradle modules, native runtime, network layers, Worker/Durable Object, persistence, trust boundaries, and threading.
3. **COMPONENT_AND_FILE_MAP.md** — responsibilities and change impact for the multiplayer Java package, engine integration points, server, protocol, tests, and build configuration.
4. **AUTHORITATIVE_DATA_FLOWS.md** — startup, native action publication, combat, snapshots, reconnect, claims, event order, and floor transitions.
5. **BUILD_TEST_AND_CI.md** — verified build commands, CI jobs, deployment boundary, and evidence limits.
6. **DOCUMENTATION_ROLLOUT_PLAN.md** — temporary two-batch creation plan. This is coordination metadata, not a numbered gameplay phase; remove it after Batch 2 is complete and its permanent guidance has been transferred.

Batch 2 is planned to add deeper native integration, backend validation/storage, protocol message catalog, test matrix, recovery/security operations, and an expanded source-file reference. Those pages must not be treated as present until committed.

## Source-of-truth hierarchy

When sources disagree, resolve the disagreement explicitly using this order:

1. **The exact source tree at the active branch HEAD** is the implementation truth. A document never overrides executable code.
2. **Protocol schema plus actual serializers/parsers and server validators** jointly define the wire contract. A schema entry alone does not prove that a message is implemented.
3. **ROADMAP.md** defines phase scope, dependencies, acceptance criteria, and official phase status.
4. **GPT.md** holds the authoritative continuation checkpoint, user rules, current verified findings, decisions, risks, and next action.
5. **docs/multiplayer/** explains architecture, responsibilities, relationships, data flows, tests, and file impacts. It is a maintained reference, not executable truth.
6. **CI and test output** prove only the behavior actually exercised by the exact tested commit. A green compile is not proof of transport operation, production deployment, or physical-device multiplayer.

If a source edit reveals that a document is stale, correct the affected documentation in the same logical work unit. Never knowingly leave misleading guidance for the next session.

## Continuous documentation contract

Documentation is updated while implementation is being changed, not retrospectively at the end of a phase.

For every edit — including a one-character correction, import, message string, condition, schema field, test assertion, build setting, resource path, rename, or deletion:

- Identify the behavior and documentation affected by that exact edit.
- Update the relevant deep-dive page and file map/data-flow/test map as appropriate.
- Update GPT.md with the new verified continuation state, decisions, risks, test evidence, and next exact action.
- Update ROADMAP.md if phase scope, a work item, acceptance evidence, dependency, official phase state, or project-level risk changes. Its phase checklist remains authoritative.
- Record the file path, reason, and evidence in the same session/change record. Tiny edits are included in that record; no edit is exempt because it is small.
- Repair inbound links and file-map references after file moves or renames.
- Commit source and the documentation that explains it together whenever possible.
- If an interruption occurs between source and docs, the checkpoint must state exactly which documentation updates remain pending, and those must be completed before unrelated work resumes.

The code must not be edited on the assumption that documentation is current: reopen the actual target file, relevant callers, and tests at the active HEAD before changing it.

## Audited repository snapshot

| Property | Audited value |
|---|---|
| Repository | majd7772233-a11y/shattered-pixel-dungeon-ar |
| Working branch | multiplayer-framework-core-14118577486727081892 |
| Documentation audit HEAD | 1c48f0e5c70c9e774a3931ee08e332c7c79d8220 |
| Parent / latest gameplay code SHA | b9ad0739d10d6a4125fb6ea084d6d072b2699810 |
| Exact-HEAD validation | [Run 41490481958](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41490481958) — success |
| Phase status | Phases 1–8 complete for implementation and automated acceptance; Phase 9 in progress/open; Phases 10–23 open |
| Production Worker smoke test | Not verified at this checkpoint |
| Physical two-device match | Not performed / not claimed |

This audit changed documentation only. It did not change gameplay code or phase status. The latest tested gameplay code remains the parent commit shown above.

## Repository layout at a glance

- **SPD-classes/** — shared engine/game support classes consumed by the core module.
- **core/** — Java/libGDX game logic, scenes, multiplayer client implementation, assets, and JVM tests.
- **android/** — Android launcher/application integration and Android-specific Bluetooth provider.
- **desktop/** and **ios/** — platform launchers/build modules; multiplayer readiness on those platforms is not proved by Android test evidence.
- **services/** — common and platform-specific news/update implementations.
- **server/** — Cloudflare Worker and Durable Object multiplayer backend, TypeScript tests, package and deployment configuration.
- **protocol/** — shared JSON Schema protocol contract.
- **.github/workflows/** — branch validation, backend deployment, and release automation.
- **docs/** — platform/contributor documentation and this multiplayer architecture set.
- **GPT.md** — continuation guide and technical working memory.
- **ROADMAP.md** — authoritative 23-phase engineering plan.
- **MULTIPLAYER_CONTINUATION_NOTES.md** — superseded historical checkpoint; do not use it as current phase authority.

## Efficient resume procedure

1. Read the active branch, HEAD, and current branch state.
2. Read the current checkpoint in GPT.md and the current phase/status in ROADMAP.md.
3. Read the relevant page in this directory, then inspect the linked source files at the active HEAD.
4. Trace the complete native → wire → server → event/snapshot → client reconciliation path.
5. Implement the smallest coherent change with relevant positive, negative, malformed-input, replay, stale-state, and cross-layer tests.
6. Update documentation immediately while making the source/test edit.
7. Run appropriate checks and inspect CI against the exact resulting commit.
8. Record exact SHAs, workflow links, outcomes, failures, limitations, and the next concrete action.
9. Never call a transport, mode, deployment, test, or phase complete merely because a class exists or compilation succeeds.

## Evidence vocabulary

Use these labels consistently:

- **Implemented in source** — code exists; no runtime success is implied.
- **Covered by automated tests** — a specific automated test exercises the stated path.
- **CI-verified** — the exact commit has a successful named workflow.
- **Deployment-verified** — a live deployed Worker/service was explicitly exercised.
- **Device-verified** — a physical multi-device scenario was completed and recorded.
- **Open / fail-closed** — unsupported or rejected until native side effects and trust requirements can be proven.

Never collapse these different evidence levels into the word “working”.
