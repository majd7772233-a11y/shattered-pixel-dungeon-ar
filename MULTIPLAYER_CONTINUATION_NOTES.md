# Multiplayer Continuation Checkpoint

> **Historical only — not an active checkpoint or source of phase status.** This file preserves old Phase 1/2 notes. Its branch, status, SHA and next-phase statements are stale. For every new conversation follow PROJECT_EXECUTION_PROTOCOL_AR.md, verify the live branch HEAD, read all current Markdown, then use GPT.md and ROADMAP.md for the current state. Do not infer that Phase 9 is next from this historical file.

Updated: 2026-10-21 (UTC)

## Repository / branch guardrails

- Repository: https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar
- Working branch: `multiplayer-framework-core-14118577486727081892`
- Do not merge to `main` or switch branches as part of this continuation.
- Latest verified code checkpoint: `c1d009cc99bf093754987a38e35e98ef42e895b5`
- CI run for that exact code checkpoint: [39653964374](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39653964374) — success. Backend TypeScript build/tests and `./gradlew test assembleDebug` (JVM tests and Android debug APK) both passed.
- A documentation-only follow-up updates the Phase 1 roadmap checkpoint; it does not change the tested code SHA.
- A docs-only commit may follow this code checkpoint; verify the code SHA and latest run when making later changes.

## Phase 1 — lossless world snapshot / restoration

**Implementation and automated acceptance: complete.** Verified paths:
- A stable server mob identity never falls back to an unrelated local Actor/class/position match; absent stable mobs reconstruct from native bundles and are registered with the local scheduler.
- When a stable server ID already maps to a local native Mob, the full native bundle (including subclass-specific fields) is restored into the existing object while preserving device-local `Actor.id()` and scheduler registration. Regression test: `matchedStableMobRestoresSubclassBundleStateWithoutChangingLocalActorId`.
- Active-floor dimension differences are supported for the same depth/branch by replacing native level geometry/flag arrays and recreating the render scene only after successful apply.
- Full native round trips are exercised for ordered multi-item heaps, heap state flags, traps, plants and timed blobs; repeated application does not duplicate them and stale local objects are removed.
- A test forces failure after level resizing, and verifies restore returns to the local native rollback baseline before propagating the error for resync.
- A single authoritative snapshot is applied to two independently generated local worlds with different stale entity sets; the tested terrain, player state, and stable-ID mob state converge.
- Hero buff bundles are preflighted before the live hero changes; malformed input is rejected.

The local rollback baseline is captured directly from live native Level/Mob/Heap/Trap/Plant/Blob objects instead of round-tripping it through libGDX JSON that omits default numeric zeros. Its local mob IDs remain private to that rollback-only copy; inbound network snapshots still require stable server entity IDs.

## Phase 2 — native combat replication

Implementation and automated CI acceptance remain complete, as documented in `ROADMAP.md`. The Worker does not run the Java SPD engine or independently reproduce its RNG/damage formulas. The designated level publisher resolves native attacks against mobs; the PvP target owner resolves incoming player attacks. The Worker validates authority, pending request, identity, depth, geometry, trusted pre-state, transitions, bundles, loot and replay protection before committing outcomes. Non-authoritative secondary mob changes/loot are rejected and require resync.

## Remaining release verification / declared limits

1. Run a physical two-device Android smoke test for co-op combat, reconnect/resync and PvP. GitHub Actions cannot perform this physical-device test, so it is not claimed as passed.
2. Test unusual mod/class-specific effects and rare item/quest content on real game levels/devices.
3. Dimension reconstruction is limited to the currently active depth/branch so the original native `Level` subclass remains valid. A snapshot for a different depth or branch is rejected for resync rather than being forced into the wrong Level subclass.
4. Phase 3 remains separate: native mob AI/pathing/actor-scheduler timing is not yet proven equivalent to the original Java scheduler. Do not infer Phase 3 completion from Phase 1/2 CI.

## User execution rule

When asked to finish a stage, directly implement and test the missing work, fix red tests, and verify the final code commit in CI. Do not report a stage as completed based only on a plan, a source review, or a successful older commit.


## 2026-10-31 — Phase 8 completion checkpoint

- Repository: `majd7772233-a11y/shattered-pixel-dungeon-ar`.
- Working branch: `multiplayer-framework-core-14118577486727081892`. Do not switch to or merge into `master` as part of continuation.
- Tested code head: `e36bc8030755050e3eae3d45ccab4db1040a65f5`.
- Exact-head CI: [41230208577](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/41230208577) — success. Backend typecheck and 472/472 Vitest tests passed; Java tests and Android Debug APK compilation passed.
- Phase 8 added/restored native run-progress bundles, exact inventory tree semantics, trusted journal/quest/item-knowledge reconciliation, stable exactly-once Mob reward receipts, Ankh/ LostBackpack heap coverage, bounds checks and NPC inactive-quest resets. Detailed acceptance notes are in `ROADMAP.md` and `GPT.md`.
- Multiplayer individual death intentionally does not call single-player `Hero.reallyDie()/Bones.leave()`; that would delete the local run. Existing remains/skeleton heaps and LostBackpack are kept in the multiplayer world snapshot.
- Physical two-device testing and deployed Worker end-to-end verification remain release checks in Phases 22 and 23; they are not claimed as passed.
- **Next phase: Phase 9 — Native Buffs, Consumable Effects and Timed State.** Re-read its full acceptance criteria in `ROADMAP.md` before implementation.
