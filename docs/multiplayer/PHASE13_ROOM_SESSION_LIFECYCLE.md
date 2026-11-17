# Phase 13 - Common Room and Session Lifecycle (active, partial)

Date: 2026-11-17
Branch: `multiplayer-framework-core-14118577486727081892`
Status: CLOSED for implementation and automated acceptance. Lifecycle-v1 server logic, Android lobby integration, reconnect recovery and owner-loss/rejoin acceptance are implemented and locally verified. Exact-head GitHub Actions run 1272 [https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44149425355] passed Backend, Android and Durable Object SQLite for fbf46ef15a1ec4554710a43894cfa4969c3176a7. Emulator UI/touch/layout acceptance is intentionally deferred to Phases 20-21 by user direction.

## Implemented

### Server and Durable Object

- `server/src/match-room/lifecycle.ts` owns lifecycle-v1 room membership and keeps legacy rooms on their existing path unless they explicitly negotiate `lifecycle=1`.
- Explicit `CREATE_ROOM`, `JOIN_ROOM`, `READY`, `MATCH_START` start/cancel, `LEAVE` and authoritative `ROOM_STATE` retain the existing 25-message / 23-action protocol vocabulary.
- SQLite persists membership, owner/publisher terms, capacity, readiness seed/sequence, lifecycle/game status and permanent last-member closure.
- Start is fail-closed: owner and current publisher authority, connected/ready members, matching seed/sequence, a complete native first-level snapshot, matching publisher-ready term and no pending floor transition are all required.
- Explicit owner departure transfers owner/publisher authority to an eligible successor and clears remaining readiness proofs; last-member departure closes the room.
- Abrupt owner WebSocket loss with an eligible successor and persisted native snapshot performs the same readiness invalidation atomically with owner/publisher handoff: each room member has players.ready=0 and a matching durable roomReady proof with ready=false. The committed transaction broadcasts an authoritative ROOM_STATE to connected members; stale socket generations remain fenced by their session token.
- New and resumed members receive authoritative room roster and snapshot state when available.

### Android lobby and gameplay gate

- `WndMultiplayerLobby` is opened from `GameScene` after the native level publication path has run. It displays room name/code, member/capacity and ready counts, each member's class/readiness/connection state, host and local-player markers.
- Ready/Unready, owner Start, readiness reset (server `MATCH_START` cancel operation) and Leave are wired to the existing `MultiplayerManager` request methods. Pending operations disable controls; Start requires owner authority, local/server readiness and local snapshot synchronization while the server remains in `LOBBY`.
- `RoomLobbyState` is the single parsed roster/revision store. It rejects malformed counts/capacity, duplicate/empty player IDs, invalid owner references and inconsistent `allReady`; a rejected roster fails closed instead of replacing the last trusted list.
- `MessageRouter` applies one `ROOM_STATE` update on the render thread and handles `MATCH_START` on that thread. `GameScene` gates native turn processing and cell selection until the manager reports authoritative `PLAYING`.
- The UI refreshes on roster, local snapshot, request, ACK/ERROR and timeout revisions. It shows reconnecting state and disables room operations while reconnecting. Retry exhaustion clears stale pending requests and exposes an explicit local exit, which ends the lifecycle only through `endSession()`.
- Internet lifecycle gating is sticky across handshake/reconnect failure and is cleared only on explicit session exit; transport-connected or failed does not imply playable.
- English and Arabic UI message resources include the new lobby labels.

## Local automated verification

- Backend: `npm run build` PASS; `npm test` PASS, 10 Vitest files / 744 reported executions (372 unique TypeScript scenarios; generated JS mirrors are build outputs, not additional unique source scenarios).
- Real Workers Durable Object SQLite: 1 file / 17 tests PASS. Phase 13 coverage includes concurrent JOIN_ROOM vs MATCH_START serialization, cancellation and resetting every member READY proof, a fully synchronized MATCH_START, authoritative MATCH_START/ROOM_STATE broadcasts, late-join refusal, post-start cancel refusal, and abrupt owner WebSocket loss with atomic ownership/publisher transfer and all-member READY-proof invalidation.
- Android MultiplayerReconnectLifecycleTest: 12 methods. The former-owner reconnect case verifies authenticated resume, session-token rotation, stable local identity, successor ownership, full connected/offline roster replacement, cleared readiness and a gameplay gate that remains closed until PLAYING.
- Android core JVM: 10 JUnit XML files / 141 tests / 0 failures / 0 errors / 0 skipped. Forced :core:test --rerun-tasks completed BUILD SUCCESSFUL.
- Forced full test assembleDebug --rerun-tasks --no-daemon --console=plain: 57/57 Gradle tasks executed, BUILD SUCCESSFUL. APK android/build/outputs/apk/debug/android-debug.apk: 35,202,307 bytes; SHA-256 C2E40AA02A5161082EE2A196312F7B24AABDB82857019EFA1F20F50277C3C05B. Full build/runtime evidence: BUILD_TEST_AND_CI.md.
- `git diff --check`: PASS at the last source review. Exact-head GitHub Actions run 1272 (https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44149425355) passed Backend, Android and Durable Object SQLite on fbf46ef15a1ec4554710a43894cfa4969c3176a7. Historical run 44100890572 applies only to the earlier `7a75b493124f99a773b23d089a2ee8d3ded2ebd6` commit only.
- No production Worker deployment or physical two-device test is claimed.

## Deferred acceptance outside Phase 13

- Phase 20: emulator/in-app host/join/setup/lobby acceptance, including lobby open/close, owner/non-owner controls, reconnect/failure exit and MATCH_START transition.
- Phase 21: Arabic RTL/English layout, room code and IP rendering, touch targets, insets, orientation, screen sizes, modal transitions and navigation/cleanup.
- Phase 22: production Worker deployment and service preflight; no deployment is claimed here.
- Phase 23: user-led physical-device playtest; no physical two-device test is claimed here.

Phase 13 is CLOSED for implementation and automated acceptance. Do not mark the deferred visual or release gates complete until their own evidence exists.
