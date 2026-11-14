# Multiplayer Continuation Notes — Phase 11-A characterization tests added; parent Phase 11 remains open

**Repository:** majd7772233-a11y/shattered-pixel-dungeon-ar  
**Only working branch:** multiplayer-framework-core-14118577486727081892  
**Starting audited HEAD:** 3a1924c7e482757543b2500dda86b1d3e94960af  
**Exact starting CI:** [43623254456 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43623254456)  
**Phase 11-A test commit and exact-head CI:** pending verification

## 2026-11-14 — Phase 11-A characterization slice

- Phase 10-A through 10-E remain complete. Phase 11-A now has a separate user-requested characterization scope; the parent phase remains OPEN.
- Added five Worker MatchRoom scenarios: replay at the 50-event boundary; full snapshot above 50; incomplete-retention fallback; RESYNC full snapshot; and same-player requestId reuse with a changed action/payload returning the previously stored result under current behavior.
- Added three Android JVM cases: gap/out-of-order batch behavior, malformed-event watermark behavior, and stale full snapshot rejection without live-world mutation. NativeCombatRuntimeIntegrationTest now has 70 @Test methods; NetworkProtocolParityTest remains at 15.
- Existing stale/duplicate combat-event, snapshot rollback, and Worker transaction rollback coverage remains unchanged.
- No Worker handler/validator/SQL, Android runtime router/manager/snapshot implementation, protocol, event/sequence/replay/resync algorithm, or native SPD gameplay changed.
- Exact new test SHA and CI are pending verification. No production Worker deployment or physical-device session is claimed.

## Historical Phase 10-E final closure

- Phase 10-A through 10-E are complete for implementation and automated acceptance at the SHA above. The Phase 10 dependency for Phase 11 is satisfied; Phase 11 implementation/tests remain untouched.
- Android MessageRouter now contains one explicit decision for all 25 canonical outer message types. There is no generic fallback into RemotePlayerActionReceiver.
- PLAYER_JOINED, PLAYER_LEFT, READY and PING are explicit typed paths. Join validates senderId/playerId equality and a finite integral in-level position; duplicate join reuses the same RemoteHero. READY validates identity/state and updates RemotePlayer.isReady; successful snapshot restore applies the persisted ready flag. PING only consumes pong. CHAT is explicitly non-routed because Android has no chat UI.
- Remote Hero registration now has a render-thread-owned synchronous setup method. It creates a sprite only when a GameScene is present; this avoids scene-dependent sprite initialization inside a queued headless test callback.
- The ACTION envelope has a canonical action-specific schema for all 23 actions. protocol/action-data-contracts.json inventories 361 per-action Worker field names (346 source-referenced in the listed Java producer files, 15 Worker-only) and 18 required NativeLevelSnapshot fields. The Java-source reference count is a static name-presence check, not proof that every field is serialized on every branch; Worker validators remain authoritative for actual field value types, requiredness and supported variants.
- WAIT and USE_ABILITY are declared Worker/schema action names with no Android native producer or bridge; both remain fail-closed. This is explicit scope, not an unfinished implicit fallback.
- CI 43618725089: Backend build + six static guards + 10 Vitest files / 708 executions passed; Android JVM tests and Debug APK passed; Durable Object SQLite integration 3/3 passed. No deployed Worker smoke test or physical multi-device session is claimed.
- No Worker producer/validator/SQL, sequence/replay/resync, event ordering or native SPD gameplay semantics changed.

## Next handoff — verify Phase 11-A exact-head CI

Inspect the matching workflow for the new test commit and require all three jobs (Backend, Android JVM/Debug APK, Durable Object SQLite) to pass. Update this note with the final test SHA, run ID and actual execution counts. The known gaps intentionally captured by the tests—non-contiguous EVENT_BATCH acceptance/watermark timing and same-player requestId reuse without payload binding—remain for a separately requested Phase 11-B. Do not begin Phase 11-B or Phase 12 automatically.

## Historical records

The entries below preserve the evidence and decisions at the time each bounded slice was completed. Statements that Phase 10 remained open or PLAYER_JOINED still used the default route are historical and superseded by the Phase 10-E closeout above.

**Repository:** majd7772233-a11y/shattered-pixel-dungeon-ar  
**Only working branch:** multiplayer-framework-core-14118577486727081892  
**Latest implementation/test SHA:** `cc61c68625f587576ca530aef3354bfaffe9e140`  
**Exact-HEAD CI:** [43522055301 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43522055301)

## 2026-11-14 — Phase 9 revalidation and documentation reconciliation

- Re-read the live Phase 9 requirements in ROADMAP.md and verified all 11 completed-work items remain checked. Phase 9 is already complete for implementation and automated acceptance under its explicit fail-closed support boundary.
- Confirmed the Phase 9 code/test baseline `bc6c46b03fee040ff20311adb473b19ff78e9bb7` with CI 43472587588 (Backend, Android JVM/Debug APK, three Durable Object SQLite tests). Current live branch HEAD before this doc correction was `11baec7ad870f666b61424a2638220355f4113cb`, with exact-head CI 43611989142 passing all three jobs.
- Inspected NativeHeroBuffTickPublisher, hero-buffs validator, SpiritBow asynchronous completion, Worker SpiritArrow/Poison LifeLink paths, native JVM regressions, backend LifeLink/SpiritArrow suite and real Durable Object SQLite tests. No missing in-scope Phase 9 behavior was identified.
- Corrected stale technical-reference statements that mislabeled completed publisher handoff/SpiritArrow behavior as unfinished Phase 9 work, and corrected the outdated 10-D-next status row. Unsupported RemoteHero/player LifeLink, XP level-ups/item callbacks, advanced Monk callbacks, unapproved item/Buff effects, and SpiritArrow SPEED/non-Mob targets remain explicitly fail-closed exclusions. The older 2026-11-09 and October ROADMAP continuation entries were also explicitly tagged as historical/superseded so their former Phase 9 backlog is not mistaken for current work.
- No gameplay Java/Worker or test source changed; no Phase 10 or 11 behavior was started.

## 2026-11-14 — Historical Phase 11-A preflight (blocked at that time by Phase 10)

- Verified live branch HEAD before documentation: `cf3714c82a210eace79614ab7c575acb04b8aebb`.
- Exact matching CI: [43523497982](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43523497982) — all three jobs succeeded (Backend, Durable Object SQLite, Android).
- Phase 10 is not closed. The Worker still broadcasts a real `PLAYER_JOINED` from `MatchRoom.fetch`; Android still reaches `RemotePlayerActionReceiver` through MessageRouter's default branch. `READY`, `CHAT` and `PING` response behavior also remains on that default route and needs an explicit support decision.
- Per-action and snapshot payload/serializer parity is not complete. Phase 10-D only migrates the proven `PLAYER_LEFT` cleanup behavior; it does not close the parent phase.
- Source audit found Phase 11 risks without changing them: EVENT_BATCH advances the client sequence before event application and does not detect skipped sequence values; same-player requestId replay returns the old result without binding the ID to the incoming action/payload; RECONNECT replays only a bounded complete-count event slice and otherwise snapshots; RESYNC is a full-snapshot response.
- **Stop condition:** no Phase 11-A source/tests, no Worker validator/persistence edits, no changes to event ordering, replay or resync, and no Phase 11-B. Continue with Phase 10 closure work first. The detailed evidence and exact source paths are in ROADMAP.md and docs/multiplayer/SESSION_RECOVERY_AND_SECURITY.md.

## Verified starting state

- Before 10-D edits, live HEAD was `c51872ac0f3ce52513fcace478ba188456cb943e`; exact matching CI [43518516010](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43518516010) passed all three jobs.
- All 21 tracked Markdown files were reread before source changes, including GPT.md, ROADMAP.md, this file and PROJECT_EXECUTION_PROTOCOL_AR.md.
- The exact pre-migration behavior-test commit `6e5ea7c88ba0238d46c3d728ca0fb4437d3f3630` passed CI [43521307026 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43521307026) while PLAYER_LEFT still used the old MessageRouter default/legacy route.
- Final source/test commit `cc61c68625f587576ca530aef3354bfaffe9e140` passed [CI 43522055301 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43522055301). Backend: 10 test files / 708 executions; Android JVM tests and Debug APK: BUILD SUCCESSFUL; Durable Object SQLite: 3/3.

## Phase 10-D delivered behavior: PLAYER_LEFT

### Source-backed route

- The real producer is `server/src/match-room/base.ts::webSocketClose`; on the authenticated socket close it persists connected=false and broadcasts PLAYER_LEFT with the session player as senderId and playerId in payload.
- `MessageRouter.routeMessage` now has an explicit PLAYER_LEFT case and queues the cleanup on `Game.runOnRenderThread(...)`.
- `MessageRouter.handlePlayerLeftMessage` preserves the old behavior: string payload.playerId wins; invalid/non-string payload ID falls back to senderId; null/empty/local IDs do nothing; a missing registry entry is removed; and a known player causes every Mob to forget that RemoteHero target, all attached Buffs to detach, the Hero to leave Actor scheduling, its sprite to be removed and nulled, and the player/hero registry association to disappear.
- `RemotePlayerActionReceiver` still exists and handles the remaining default paths. Direct PLAYER_LEFT delivery to it is rejected with the existing `requestResync(message.sequence)` behavior, preventing a second application.
- `EVENT_BATCH` remains exclusively typed in MessageRouter. The existing receiver guard still refuses it and requests recovery; duplicate sequence protection and event application semantics were not changed.
- `PLAYER_JOINED` is a real Worker output from `MatchRoom.fetch` and intentionally remains on the default/legacy route. Other message names were not declared supported just because they appear in MessageType.

### Equivalence evidence and tests

- Before changing route ownership, the expanded PLAYER_LEFT regression passed through the old route on SHA `6e5ea7c88ba0238d46c3d728ca0fb4437d3f3630` / CI 43521307026. It proves player registry/reverse identity cleanup, RemoteHero Actor removal, Mob target clearing while preserving the last-known cell, multiple Buff detach + Actor removal, sprite parent/reference removal, malformed-payload senderId fallback and local-player leave rejection.
- After migration the same full cleanup assertions run through the typed route. The test also directly calls the legacy receiver and verifies it requests one resync without reapplying cleanup.
- NetworkProtocolParityTest.java remains 15 tests. NativeCombatRuntimeIntegrationTest.java now contains 64 @Test methods.
- The first typed-route CI run (43521714424) exposed only a compile-time test fixture defect: a TestTransport local was not retained for the new resync assertions. The fixture was fixed in the final SHA; no assertion was deleted or weakened.

## Scope explicitly not changed

- No Worker message producer, admission/routing validator, 25-message inventory, 23-action inventory, protocol schema, action subcase or persistence logic changed.
- No EVENT_BATCH replay, event order, sequence semantics, resync algorithm or snapshot recovery algorithm changed.
- No Hero, RemoteHero, Mob, Actor, Buff, sprite or native SPD gameplay implementation was changed beyond calling the existing cleanup operations from the typed router.
- No receiver deletion/whole-class move, branch creation, main/master update, merge or PR.
- No production Worker deployment or physical two-device match is claimed.

## Phase status and next checkpoint

- Phase 9: complete for implementation and automated acceptance within its explicit fail-closed boundaries.
- Phase 10-A: complete.
- Phase 10-B: complete.
- Phase 10-C: complete.
- Phase 10-D: the bounded PLAYER_LEFT typed-path unit is complete. The broader Phase 10 remains **OPEN** because PLAYER_JOINED and any other supported default-route behaviors still require a separate producer/consumer audit and equivalence work; field-level payload/serializer parity also remains outstanding.
- Phase 11 has **not** started. ROADMAP.md declares Phase 11 dependent on Phase 10. Do not silently bypass that dependency. A later Phase 11-A request must first recheck whether Phase 10 has since been formally closed and document any unmet prerequisite rather than claiming it is complete.

## Exact next-chat guard

On a new task, re-fetch the live branch HEAD and exact matching CI, reread every Markdown file and the current PROJECT_EXECUTION_PROTOCOL_AR.md before editing. Work only on the named branch, do not create branches or PRs, and stay within the explicitly requested phase/slice. Do not begin Phase 11 or any later slice automatically.
