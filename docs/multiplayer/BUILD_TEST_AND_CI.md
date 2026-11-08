# Build, Test, and CI Reference

## 1. Scope

This document records commands and workflow configuration inspected at the documentation audit HEAD. It distinguishes local source checks, backend compilation/tests, Android JVM tests/debug APK compilation, live Cloudflare Worker deployment/smoke test, and physical two-device playtest. These are different evidence levels.

## 2. Backend package

Working directory: server/

Inspected server/package.json:

| Script | Command | Purpose |
|---|---|---|
| build | tsc | Compile/type-check TypeScript according to tsconfig.json. |
| test | node scripts/validate-phase7-native-mutation-schema.mjs && vitest run | Run static native-mutation/schema validation, then Vitest. |

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

## 6. Evidence captured at documentation audit

| Item | Value |
|---|---|
| Documentation audit HEAD | 1c48f0e5c70c9e774a3931ee08e332c7c79d8220 |
| Parent / gameplay code tested SHA | b9ad0739d10d6a4125fb6ea084d6d072b2699810 |
| Exact HEAD branch workflow | [41490481958](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41490481958) — success |
| Previous gameplay SHA workflow | [41489794307](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41489794307) — success |
| Phase 8 | Complete for implementation and automated acceptance |
| Phase 9 | In progress; incomplete; acceptance remains open |
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

Stage 2 separates the MatchRoom implementation into `server/src/match-room/` internal layers and retains `server/src/index.ts` as the stable Worker main and compatibility facade. The final exported Durable Object class is still named `MatchRoom`; the Wrangler binding/class_name and SQLite migration configuration are unchanged. Initial TypeScript compilation found a surplus class-closing brace after moving the original final `broadcast` method into `base.ts`; it was removed without changing the method. Record the implementation HEAD and both CI jobs here after the first successful exact-HEAD run. A CI pass does not mean the Worker was deployed or a live room was tested.
