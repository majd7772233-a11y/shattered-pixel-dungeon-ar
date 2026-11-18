# Current continuation checkpoint - 2026-11-18 (Phase 13 CLOSED; Phase 14-A IN PROGRESS)

Repository: `majd7772233-a11y/shattered-pixel-dungeon-ar`
Branch: `multiplayer-framework-core-14118577486727081892`
Current pushed HEAD before the pending payload-test/doc slice: `3c460a44963bac9677dc837a253e0de43f1c1815`; Phase 13 closeout parent: `ff97f45133e52ccc709ec71266a243e8e62484e4`.
WebGPT token remains RUNNING/open: `d8ff20f1-780c-4e55-acc5-ed2dfe8d71be`.

Phase 12 is CLOSED. Phase 13 implementation and local automated acceptance now cover the in-game WndMultiplayerLobby, validated roster, render-thread state routing, native gameplay gate, fail-closed reconnect, abrupt owner socket loss, atomic owner/publisher transfer, all-member READY reset and former-owner authenticated reconnect with token rotation and full roster restoration.

- **Debug APK:** 35,202,307 bytes; SHA-256 C2E40AA02A5161082EE2A196312F7B24AABDB82857019EFA1F20F50277C3C05B.
- **Current verification:** backend TypeScript build PASS; npm test 10 files / 744 reported executions (372 unique TS scenarios) PASS; Durable Object SQLite 17/17 PASS; Android JVM 141/141 PASS; forced full test assembleDebug PASS (57 actionable Gradle tasks, all executed).

Phase 13 implementation, automated acceptance, commit/push and exact-head CI are complete. Commit fbf46ef15a1ec4554710a43894cfa4969c3176a7 is pushed on the only permitted branch; Actions run 1272 is green for Backend, Android and Durable Object SQLite. Keep the emulator available: visible host/join/lobby checks are deferred to Phase 20 and RTL/touch/layout checks to Phase 21. No production deployment or physical two-device playtest is claimed.

Read `docs/multiplayer/PHASE13_ROOM_SESSION_LIFECYCLE.md` for the detailed boundary. Do not begin Phases 14-16. No Worker production deployment or physical two-device match is claimed.

## Phase 14-A — Internet/WebSocket wire transport (2026-11-18; local full suites and maximum-collection payload regression PASS; final exact-head CI pending)

- **Only working branch:** `multiplayer-framework-core-14118577486727081892`; do not create branches, PRs, merge, or touch main/master.
- **Current pushed base HEAD:** `3c460a44963bac9677dc837a253e0de43f1c1815`. Exact-head CI [run 1278 / 44313332223](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44313332223) passed Backend, Android and Durable Object SQLite. npm 11.21.2 corrected the npm 10 Arborist `edgesOut` install exception. Final source/docs changes still need their own exact-head run.
- **Implementation chain:** `7fd0bfe3e7d542ebed5493647b3ea3a53bafcc81` (transport foundation), `3d9e111e55d7fd334adc048d3a6e619e6bbc1e59` (HTTP status/credential hardening), `11955c577eec4ebbb09075a7f60263fa72d6d12a` (CRLF fixture correction), `3c460a44963bac9677dc837a253e0de43f1c1815` (npm 11 CI runner install).
- **14-A scope:** Worker path `/room/{roomCode}/websocket`, `lifecycle=1`, optional playerId query, Bearer only in Authorization; strict 101/Upgrade/Connection/Sec-WebSocket-Accept validation; canonical 16-byte client key; TLS hostname verification, connect/upgrade timeouts, credentials rejected on ws://; bounded RFC 6455 frames, fragmentation, strict UTF-8, masks, Ping/Pong and Close.
- **Security corrections:** preserve HTTP 401/403/409 rejection status so expired credentials are not retried as transient socket loss; reject malformed Authorization/header injection and invalid/noncanonical Sec-WebSocket-Key; enforce 8 KiB handshake header-line boundary.
- **Actual SNAPSHOT overflow fix:** full snapshot builders previously copied every row in the events table, including validation-only LifeLink `CHAR_DAMAGED` evidence. Central `MatchRoomBase.replayWindowEvents()` now returns only the newest 200 rows, ordered ascending, for the four client full-snapshot paths (`actions.ts`, `lifecycle.ts`, `messages.ts`, `snapshots.ts`). This never deletes SQLite evidence rows. `lifelink-death.integration.test.ts` adds a RESYNC regression: a 515-row DB yields a 200-row SNAPSHOT event window and still retains all 515 rows in SQLite.
- **Stress test:** `NativeCombatRuntimeIntegrationTest.nativeLevelSnapshotFitsWebSocketBudgetAtServerValidationCeilings` passes 1/1. It covers 100×100 cells, 512 mobs, 10,000 heaps, 10,000 traps, 10,000 plants, 10,000 visited/mapped positions, 4 co-op players, 2,060 retained DB rows, and 200 transmitted replay events. UTF-8 sizes: inner native level JSON **13,631,699** bytes; full escaped `LEVEL_DATA` **14,613,062** bytes; full escaped recovery `SNAPSHOT` **15,664,067** bytes; client cap **16,777,216** bytes; headroom **1,113,149** bytes (~6.64%).
- **Local verification:** Android `gradlew.bat test assembleDebug --no-daemon --console=plain` — BUILD SUCCESSFUL, 57 tasks, 11 JUnit reports / 159 tests / 0 failures/errors/skips. Debug APK 36,949,480 bytes; SHA-256 `A05D0A2B1FE4A0C8AD36402935594E548222CCF533939DE7DF9355836BE5190C`. Backend `npm test` — 373 passed across 5 files; `npm run build` / tsc passed.
- **Measurement boundary:** fixture reaches maximum server-accepted dimensions and collection counts but uses representative native Bundles; it does not maximize each individual Bundle or all heap item arrays. No aggregate byte ceiling covers every legal combination. Tested fixture compatibility is PASS; universal worst-case size guarantee remains NOT PROVEN. Do not raise the Android 16 MiB cap as a shortcut; keep aggregate-cap/chunking policy open.
- **Next action:** complete diff audit, commit test/server fix/docs together on this branch, push and verify all three CI jobs on the exact new SHA. Run 1278 only covers pushed base `3c460a4`.
- **14-B NOT STARTED:** manager/callback/reconnect thread safety, render-thread UI, Android network/background/screen-off lifecycle and live Worker service smoke tests. Do not start without explicit authorization.
- **WebGPT task:** `d8ff20f1-780c-4e55-acc5-ed2dfe8d71be` must remain RUNNING/open; never submit/terminate unless explicitly asked.
- **No production Worker deployment, live service room test, emulator test or physical-device match is claimed.**

---

# Multiplayer Continuation Notes — Phase 12 CLOSED; Phase 13 next (2026-11-16)

**Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`
**Only working branch:** `multiplayer-framework-core-14118577486727081892`
**Phase 12 implementation/test commit:** `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8` (pushed to the only allowed branch and verified against `origin` before this documentation-only closeout).
**Current worktree:** code implementation was clean at the verified Phase 12 commit; this continuation adds a documentation-only closeout commit on the same branch. No PR, merge, production deployment or physical two-device test was performed.
**WebGPT task:** keep token `d8ff20f1-780c-4e55-acc5-ed2dfe8d71be` RUNNING/open; never call submit_result or terminate it unless the user explicitly asks.

## 2026-11-16 — Final Phase 12 closeout checkpoint

- **Phase 12-A:** CLOSED for implementation/automated acceptance — Bearer-header session authentication, persisted token-owner binding, safe credential rotation, stale-socket fencing and Android automatic reconnect lifecycle.
- **Phase 12-B recovery:** CLOSED for implementation/automated acceptance — SQLite persists/restores `currentSequence` and `gameStatus`; constructor validates/restores `worldTime`, mode, seed and depth; legacy `MATCH_END` backfills `ENDED`; complete native current-depth snapshots recover `PLAYING`; otherwise the legacy room remains `LOBBY`. Replay keeps the newest 200 ordinary events plus protected per-sender LifeLink/player-damage evidence; damaged persisted worlds fail closed.
- **Schema migrations:** `room_meta.schemaVersion` tracks versions 1 and 2. Each migration and its version checkpoint share one SQLite transaction. The steps add processed-action fingerprint/authority columns and convert legacy item claims to branch-aware composite keys without losing existing claims.
- **LEVEL_DATA atomicity:** every cross-table write for level replacement (tiles, transitions, mobs, levels, claims, native snapshot/metadata and event/cursor state) executes inside one `transactionSync`. On failure, SQLite rolls back, the in-memory cursor/world time are restored, and the publisher receives a correlated ERROR; no ACK or new world snapshot escapes before commit.
- **Level Publisher recovery:** disconnect and election are fenced by the persisted session token. A replacement must have a live socket with the exact persisted token and a complete native snapshot; generation/term gates require rebase before the replacement can publish. When the old publisher disconnects and no valid snapshot exists, its term is advanced and authority/ready state are revoked; no replacement or fabricated snapshot is broadcast.
- **Backend verification:** `npm run build` / TypeScript noEmit PASS; 5 TypeScript source test files / **372 unique source tests PASS**. The runner reports 10 files / 744 executions because emitted JavaScript mirrors the TypeScript sources. All protocol guards remain 25 outer messages / 23 ACTION types.
- **Real Workers runtime:** Durable Object SQLite 1 file / **14 tests PASS**. Added real SQLite checks for failed/successful LEVEL_DATA rollback/retry, schema upgrade/preservation of old claims, and lost-publisher revocation when native snapshot is missing. Existing eviction/replay/valid handoff tests also pass.
- **Debug APK:** 35,202,307 bytes; SHA-256 `C2E40AA02A5161082EE2A196312F7B24AABDB82857019EFA1F20F50277C3C05B`.
- **Exact-head CI:** GitHub Actions run [43921670336](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43921670336) for `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8` passed Backend, Android and Durable Object SQLite jobs. The requested final source review and local re-verification are complete. No production Worker deployment or physical two-device gameplay test is claimed; these remain Phase 22/23 gates.

## Phase 12 final status and boundaries

Phase 12-A, Phase 12-B, parent Phase 12 and Phase 13 are CLOSED for implementation and automated acceptance. Phase 13 exact-head CI run 1272 passed all three jobs on fbf46ef15a1ec4554710a43894cfa4969c3176a7. The earlier dated notes below are historical checkpoints and are superseded by this current status.

## Next phase and preserved execution rules

1. Do not reopen or duplicate Phase 12 work; it is closed at the verified implementation/CI scope.
2. At that historical checkpoint Phase 13 still required separate authorization; the user has since authorized it and the current worktree implements part of it.
3. Phase 22 production/service preflight and Phase 23 physical-device playtest remain later release gates; neither is claimed complete.
4. Keep the WebGPT task token RUNNING/open; do not call submit_result or shutdown.
5. Preserve one source of truth in ROADMAP.md, GPT.md and docs/multiplayer/; update those documents alongside future code changes and commit each coherent change.
6. Keep the WebGPT task token RUNNING/open; do not call submit_result or shutdown.

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
