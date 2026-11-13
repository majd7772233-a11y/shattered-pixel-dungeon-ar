# Multiplayer Continuation Notes — Phase 10 Entry

**Verified gameplay/test baseline:** `bc6c46b03fee040ff20311adb473b19ff78e9bb7`  
**Exact code/test CI:** [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588)  
**Evidence:** Backend 682 executions across eight Vitest files, Android JVM/Debug APK, and three real Durable Object SQLite Workers-runtime tests passed.  
**Rule:** Always read the live branch HEAD and its exact-head Actions run before editing; do not assume a previous documentation SHA remains HEAD.  
**Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`  
**Only working branch:** `multiplayer-framework-core-14118577486727081892`

## Phase status

Phase 9 — Native buffs and timed effects — is complete for implementation and automated acceptance. Enabled effects are validated against the Java SPD engine. Unsupported callback branches remain fail-closed and are listed in ROADMAP.md.

Phase 10 — Canonical Protocol Schema and One Typed Event Path — is next and remains OPEN. Do not start Phase 11 in parallel. The exact Phase 10 entry checklist below is the next bounded work unit.

## Exact evidence

- Backend TypeScript build passed; 8 Vitest files, **682 test executions passed**. Generated/mirrored TS/JS suites mean this is not a unique-scenario count.
- Android `./gradlew test assembleDebug --no-daemon` passed; JVM tests and Debug APK compilation completed with `BUILD SUCCESSFUL`.
- Workers runtime passed **3 tests** against real Durable Object SQLite: Poison LifeLink rollback/replay across eviction, publisher handoff after a persisted snapshot with pending-combat closure, and committed-state reconstruction after eviction.
- SpiritArrow is joined across strict intent, trusted reservation, publisher COMBAT_REQUEST, native Java result, atomic commit, sequenced EVENT_BATCH and stable Mob-ID client reconciliation. Android test worlds use distinct local Mob Actor IDs.
- Publisher disconnect/rebase is generation-based, transactional and fail-closed until persisted state and local Actor references have been validated.
- XP level-up/item callbacks, advanced Monk callbacks, RemoteHero/player LifeLink, unsupported item/Buff callbacks, SpiritArrow SPEED volleys and non-Mob targets remain rejected without partial state.

## Phase 10 entry work

1. Compare all 25 active Java/schema outer message names and every `NetworkActionType`, serializer, payload field and protocol version.
2. Map each message/action to its exact Worker branch, validator, authorization, persistence/sequence semantics and Android handler. An enum entry alone does not prove a handler exists.
3. Consolidate event application into one typed `MessageRouter` path. Characterize `RemotePlayerActionReceiver` default-route behavior; migrate only with equivalent parity regressions.
4. Define direction, required/optional fields, request ID, sequence, malformed payload behavior and explicit unsupported outcomes.
5. Add contract tests for missing/wrong-type/oversized fields and ensure every declared message/action has a handler or safe explicit response.

## Boundaries

- Java/SPD remains the gameplay specification; do not reimplement combat, Mob AI, Buff or scheduler formulas in TypeScript.
- Never accept client-created rewards or Mob IDs without trusted-state binding.
- Do not broaden non-publisher permissions or remote LifeLink authority.
- Keep Phase 11 replay/resync redesign, transport phases 14–16, modes 17–19, UX 20–21, deployed service Phase 22 and physical-device Phase 23 out of Phase 10.
- Work only on `multiplayer-framework-core-14118577486727081892`; no new branch and no merge to main/master.
