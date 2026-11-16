# Multiplayer Continuation Notes — Phase 12-A in progress (Phase 11-B remains closed)

**Repository:** majd7772233-a11y/shattered-pixel-dungeon-ar  
**Only working branch:** `multiplayer-framework-core-14118577486727081892`  
**Phase 12-A base HEAD:** 417dc7082f37db02b658112e33f3a51b69f72fbb (local worktree changes are uncommitted)
**Phase 12-A base CI:** run 43754713148 passed at committed baseline 417dc7082f37db02b658112e33f3a51b69f72fbb. Phase 12-A changes are uncommitted; no CI result for them yet.

## 2026-11-15 — Phase 11-B implementation and acceptance

- **Phase 11-B code/test SHA:** `2574489ff25e6f1fedc1e21718161bc5a7a1b230`; exact-head CI [run 43731016036 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036).
- **Android event application:** EVENT_BATCH rows are validated and normalized before application; exact duplicate sequences are applied once, conflicting duplicates reject, rows are sorted into ascending order and must form the complete contiguous range beginning at the last applied sequence + 1. The envelope sequence must match the batch tail. Gaps, malformed rows or invalid application request full recovery without advancing the applied watermark. Per-event rollback baselines protect the live native world; applied sequence commits only after successful application. EVENT_SKIPPED consumes its valid sequence without changing the world. Stale snapshots are rejected before live restore.
- **Worker request identity:** processed_actions stores canonical request fingerprints and delegated-completion identity. Exact retries from the same player with equivalent payloads replay the recorded result; reuse by another player or with different action/payload is rejected as REQUEST_ID_CONFLICT. Object-key ordering does not change a canonical fingerprint. Legacy processed-action rows are retained through idempotent column migration.
- **Atomic ACTION boundary:** the covered Durable Object ACTION path uses transactionSync. Persistent state/claims, processed-action receipt, event, sequence and world-time changes roll back together on failure. Success ACKs and broadcasts are held until commit; the transaction path fails closed when synchronous transactions are unavailable.
- **Recovery policy:** reconnect replays only a complete contiguous retained range of at most 50 events for an eligible non-current publisher; otherwise the server sends a full SNAPSHOT. RESYNC remains a full-SNAPSHOT path.
- **CI:** Backend TypeScript build and 10 Vitest files / 740 reported executions passed; Android JVM tests and Debug APK compilation passed; Durable Object runtime SQLite integration passed 4/4. The 740 count includes mirrored/generated TS/JS executions and is not a count of unique source scenarios.
- **Boundary:** 25 canonical message values and 23 action values remain unchanged; no protocol schema expansion or native SPD gameplay formula change is claimed. No production Worker deployment or physical two-device session is claimed.

- Phase 11-B closeout baseline: NativeCombatRuntimeIntegrationTest.java had 74 @Test methods and NetworkProtocolParityTest.java had 15. Current Phase 12-A source counts: NativeCombatRuntimeIntegrationTest.java 78, NetworkProtocolParityTest.java 20, MultiplayerReconnectLifecycleTest.java 3.
- Android regressions cover out-of-order sorting, missing-sequence recovery, stale-event suppression, opaque skipped events, no watermark advance for malformed events, stale/incomplete snapshot rejection, and duplicate ACTION_ACCEPTED/EVENT_BATCH application.
- Worker regressions cover request fingerprint migration/replay/conflict, stable fingerprints despite object-key ordering, cross-player reuse, delegated completion identity, concurrent exact retry (one event/sequence/world-time charge), and rollback/no success broadcast on transaction failure.
- The Durable Object SQLite workflow has four passing integration tests. Backend has 740 reported executions across 10 Vitest files; mirrored TS/JS results are not unique source scenario counts.

## 2026-11-16 — Phase 12-A active work checkpoint

- Scope: authenticate Internet reconnect from the stored session credential, bind the socket to the token owner, prevent player-ID takeover, rotate the credential, reject superseded sockets, and carry the credential only in the secure WebSocket Authorization header.
- Implemented locally: Bearer-header validation and query-token rejection; playerId is only a consistency assertion during resume; unauthenticated sessions cannot claim an existing player row; the accepted socket attachment binds {playerId, sessionToken}; each inbound socket message checks that its attachment token is still current; RECONNECT body carries lastSequence only.
- Android: InternetTransport sends the Bearer credential in the upgrade header over TLS, rejects credentials on non-TLS endpoints, and preserves the raw encoded path/query. MultiplayerManager automatically attempts reconnect on Internet disconnect/error, binds callbacks to transport generations, preserves the applied sequence, requires the same player identity and a fresh token in SESSION, and sends no secret in the RECONNECT body.
- Local verification: TypeScript noEmit PASS; backend source-only suite 5 files / 370 tests PASS; Cloudflare Workers Durable Object SQLite runtime 1 file / 5 tests PASS; Android core JVM 132 tests PASS (0 failures/errors/skips) and assembleDebug PASS; protocol guards confirm 25 message / 23 action vocabulary.
- Exact-head CI, commit/push, production deployment and physical-device testing remain pending. This worktree is based on 417dc7082f37db02b658112e33f3a51b69f72fbb; do not close Phase 12-A or move to Phase 12-B.

## Phase state and next checkpoint

- Phase 10: closed.
- Phase 11-A: characterization gate complete and retained as historical regression coverage.
- Phase 11-B: implementation, regression tests and source-HEAD CI complete; accepted Phase 11 scope is closed.
- Phase 12-A: IN PROGRESS / OPEN by explicit user request. Phase 12-B and later scopes have not started.
- No production Worker deployment or physical two-device gameplay is claimed. Phases 22–23 own those release checks.

## Exact next-chat guard

Continue Phase 12-A from the active worktree on the named branch. Re-check branch/HEAD/status before edits. Do not recreate Phase 11, create branches, touch master/main, open a PR, or start Phase 12-B. Keep this task/token open. Finish full exact-HEAD CI and final source review; do not claim deployment or real-device testing.

## Historical Phase 10-E final closure

- Phase 10-A through 10-E are complete for implementation and automated acceptance at the SHA above. The Phase 10 dependency for Phase 11 is satisfied; Phase 11 implementation/tests remain untouched.
- Android MessageRouter now contains one explicit decision for all 25 canonical outer message types. There is no generic fallback into RemotePlayerActionReceiver.
- PLAYER_JOINED, PLAYER_LEFT, READY and PING are explicit typed paths. Join validates senderId/playerId equality and a finite integral in-level position; duplicate join reuses the same RemoteHero. READY validates identity/state and updates RemotePlayer.isReady; successful snapshot restore applies the persisted ready flag. PING only consumes pong. CHAT is explicitly non-routed because Android has no chat UI.
- Remote Hero registration now has a render-thread-owned synchronous setup method. It creates a sprite only when a GameScene is present; this avoids scene-dependent sprite initialization inside a queued headless test callback.
- The ACTION envelope has a canonical action-specific schema for all 23 actions. protocol/action-data-contracts.json inventories 361 per-action Worker field names (346 source-referenced in the listed Java producer files, 15 Worker-only) and 18 required NativeLevelSnapshot fields. The Java-source reference count is a static name-presence check, not proof that every field is serialized on every branch; Worker validators remain authoritative for actual field value types, requiredness and supported variants.
- WAIT and USE_ABILITY are declared Worker/schema action names with no Android native producer or bridge; both remain fail-closed. This is explicit scope, not an unfinished implicit fallback.
- CI 43618725089: Backend build + six static guards + 10 Vitest files / 708 executions passed; Android JVM tests and Debug APK passed; Durable Object SQLite integration 3/3 passed. No deployed Worker smoke test or physical multi-device session is claimed.
- No Worker producer/validator/SQL, sequence/replay/resync, event ordering or native SPD gameplay semantics changed.

## Historical next handoff — verify Phase 11-A exact-head CI (superseded by the Phase 11-B closeout above)

Historical handoff text retained from the Phase 11-A checkpoint; its Phase 12-not-started instruction is superseded by the active Phase 12-A checkpoint above.

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
