# Multiplayer Continuation Notes — Phase 10-D PLAYER_LEFT typed-path unit delivered; Phase 10 remains OPEN

**Repository:** majd7772233-a11y/shattered-pixel-dungeon-ar  
**Only working branch:** multiplayer-framework-core-14118577486727081892  
**Latest implementation/test SHA:** `cc61c68625f587576ca530aef3354bfaffe9e140`  
**Exact-HEAD CI:** [43522055301 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43522055301)

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
