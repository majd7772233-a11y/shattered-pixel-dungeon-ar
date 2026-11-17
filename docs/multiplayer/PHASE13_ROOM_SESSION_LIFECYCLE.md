# Phase 13 - Common Room and Session Lifecycle (active, partial)

Date: 2026-11-17
Branch: `multiplayer-framework-core-14118577486727081892`
Status: server lifecycle and client session-control slice implemented and locally verified; in-game lobby UI and concurrency acceptance remain open.

## Implemented in the current worktree

### Server and Durable Object

- Added `server/src/match-room/lifecycle.ts` as the room lifecycle layer over the existing MatchRoom action pipeline.
- New Internet sessions request lifecycle version 1 with `lifecycle=1`; existing rooms are not upgraded after durable player records already exist.
- Implemented explicit `CREATE_ROOM`, `JOIN_ROOM`, `READY`, `MATCH_START` (start/cancel), `LEAVE`, and `ROOM_STATE` using the existing protocol vocabulary. The protocol remains 25 message types and 23 action types; 12 message types are classified as Worker inbound.
- Durable membership, owner, capacity, readiness seed/sequence, lifecycle status, and room closure are persisted in SQLite `room_meta`.
- Enforces mode-specific capacity and minimum player count, room membership before ACTION, PLAYING before gameplay ACTION, owner/publisher authority, connected and ready members, matching seed/sequence, complete native level snapshot, publisher readiness, and no pending floor transition before match start.
- Owner departure transfers owner and publisher authority to the earliest still-connected member, preferring connected members over offline members; if all remaining members are offline, it retains the earliest durable member as a safe rejoin owner. All remaining readiness proofs are reset. Last-member departure permanently closes the room.
- New members and resumed sessions receive the current roster and authoritative room snapshot when available. A committed first native level snapshot is distributed while the room is still in LOBBY.
- Legacy rooms without `roomLifecycleVersion=1` keep the legacy message path; lifecycle activation is explicit and refuses to retrofit an already-populated legacy room.

### Android client session control

- `MultiplayerManager.SessionState` distinguishes DISCONNECTED, CONNECTING, TRANSPORT_CONNECTED, RECONNECTING, SESSION_BOUND, ROOM_JOINED, WORLD_SYNCED, READY, PLAYING, and FAILED.
- Internet endpoints are normalized to include `lifecycle=1`; the setup screen distinguishes host/create from guest/join and generates or accepts a room code.
- The client exposes create/join/ready/start/cancel/leave operations and tracks correlated room requests.
- Readiness requires a successfully applied snapshot and matching room seed/sequence. `READY=true` includes `className` and escaped `heroStateJson` from the native Hero snapshot because the Worker validates those fields before setting the member ready. `READY=false` sends no stale Hero snapshot. Start requires local ownership, local readiness, all-ready state, and a synchronized snapshot before requesting the server start.
- Connection/session handshake timeout is 15 seconds; room-operation timeout is 12 seconds; reconnect uses up to three attempts with 250 ms exponential base delay capped at 4 seconds.
- Each connection callback is fenced by transport identity and `sessionGeneration`; ending/replacing a session invalidates late callbacks. Permanent 401/403/409 resume rejection clears the stale session. Retry exhaustion becomes an explicit FAILED state.
- The current Android flow still transitions from `MultiplayerSetupScene` directly to `HeroSelectScene`. `GameScene.create()` publishes the native level and sends the level-ready signal, but no in-game room lobby currently calls the public ready/start/cancel/leave APIs. This is a known integration gap, not a completed UX.

## Verification on the current worktree

- Backend: `npx tsc --noEmit --pretty false` PASS.
- Backend suite: 372 unique TypeScript source scenarios PASS; runner reports 10 files / 744 executions because generated JavaScript mirrors the TypeScript tests.
- Real Workers Durable Object SQLite suite: 1 file / 15 tests PASS. Includes minimum/maximum players, membership/action gating, readiness, owner/publisher transfer, room closure, roster delivery and resume snapshot behavior.
- Android core JVM: 10 XML reports / 137 tests / 0 failures / 0 errors / 0 skipped. The lifecycle/reconnect class has 8 tests, including a new nested READY payload serialization regression that confirms `heroStateJson` survives JSON escaping and `className` is supplied; create-vs-join negotiation; initial handshake timeout; bounded reconnect exhaustion; room-operation timeout; rejected credentials; stale callbacks; and reconnect behavior.
- `:core:test --no-daemon --console=plain --rerun-tasks`: BUILD SUCCESSFUL.
- Full `test assembleDebug --no-daemon --console=plain --rerun-tasks`: BUILD SUCCESSFUL on 2026-11-17; 57 actionable tasks, 10 JUnit reports / 137 tests / 0 failures / 0 errors / 0 skipped. Debug APK: 35,197,092 bytes; SHA-256 `83C3104CBCA9B31B0C01D6F8A80F1A6C27B8984C2B5BB33938AC6570720EE371`. Re-run after in-game lobby UI changes.
- `git diff --check`: PASS; no whitespace errors remain.
- No exact-head GitHub Actions run has been performed for the current Phase 13 worktree. The older Phase 12 run 43921670336 applies only to its recorded Phase 12 implementation commit.
- No production Worker deployment or physical two-device test is claimed.

## Remaining Phase 13 work

1. Add an in-game lobby window after the first native level is published, using the existing `GameScene.create()` initialization seam so the host can produce the snapshot required by MATCH_START.
2. Display room code, member/ready counts and per-player readiness; wire Ready/Unready, owner Start/Cancel, and Leave to the current `MultiplayerManager` methods. Disable Start until all server-side prerequisites are satisfied.
3. Keep the lobby modal until authoritative MATCH_START / PLAYING; show explicit connection, room, snapshot, and operation-timeout errors. Ensure leaving returns to a clean non-multiplayer state without late callbacks reopening the room.
4. Add tests for simultaneous join/start serialization, cancellation/readiness reset, and UI state transitions; add focused tests for owner departure while disconnected and member reconnection.
5. Run the full Android `test assembleDebug`, backend and Durable Object suites after the UI integration; then perform exact-head GitHub Actions on the resulting commit.

Phase 13 remains OPEN. Do not begin Phases 14-16 or claim end-to-end multiplayer readiness until the lobby UI and remaining concurrency tests pass.
