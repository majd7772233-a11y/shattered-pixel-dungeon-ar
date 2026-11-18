# Phase 14-A Closeout — Internet/WebSocket Wire Transport

**Status: CLOSED for implementation and automated acceptance.**  
**Parent Phase 14: OPEN. Phase 14-B: NOT STARTED.**  
**Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`  
**Only working branch:** `multiplayer-framework-core-14118577486727081892`

## What is closed

Phase 14-A now has one server-side byte contract for complete client `SNAPSHOT` frames. It does not rely on a maximum-collection fixture being representative of every possible native Bundle: every snapshot accepted for publication is preflighted against the actual serialized wire size; an oversized state is rejected before its transaction commits.

### Aggregate wire-size policy

- Android's existing complete WebSocket message limit remains **16 MiB = 16,777,216 bytes**.
- The server's maximum complete `SNAPSHOT` envelope is **15.5 MiB = 16,252,928 UTF-8 bytes**, leaving a fixed **512 KiB** below the Android limit.
- `server/src/match-room/snapshot-size.ts` counts UTF-8 bytes using JSON.stringify-compatible escaping, including non-ASCII, supplementary Unicode, lone surrogates, controls, quotes and backslashes. It does not allocate a duplicate full-size UTF-8 byte array.
- Nested payload data is counted before its JSON string is materialized; the complete outer `NetworkMessage` is measured again after escaped `payloadJson` accounting. The accepted wire text is serialized once and reused by send paths.
- The same module enforces a **16 MiB UTF-8 ceiling on inbound text frames before JSON.parse**.
- Oversized snapshots fail with `SNAPSHOT_TOO_LARGE`. This is rejection, not truncation: entities, player state and proof data are never silently dropped to fit.

### Atomicity and snapshot coverage

One canonical `buildSnapshotMessage` path in `server/src/match-room/snapshots.ts` is used for full snapshots from native `LEVEL_DATA`, general broadcasts, `RECONNECT`, `RESYNC`, lifecycle room broadcasts and floor transitions.

The exact post-change snapshot is preflighted **inside the same SQLite transaction or connection-admission boundary** before a durable session/state change for:
- native `LEVEL_DATA` publication;
- authoritative `ACTION` mutations;
- lifecycle `JOIN_ROOM`, `READY` and `MATCH_START` transitions;
- projected floor-transition destination and participant state before the new floor becomes authoritative.

When the preflight fails, the transaction rolls back. Clients receive an explicit size error where a response path exists; reconnect fallback returns `SNAPSHOT_TOO_LARGE` rather than a generic malformed-payload error. Room-resume failure is surfaced rather than swallowed.

The initial WebSocket handshake and authenticated reconnect in `server/src/match-room/index.ts` also preflight the recovery snapshot before rotating the session token or accepting the socket as connected. An oversized resume receives HTTP **413** with `SNAPSHOT_TOO_LARGE`; the prior token and persisted player/connection state remain unchanged. The real Durable Object SQLite test forces this failure and then verifies the original token/state before retrying a normal reconnect.

Lifecycle-v1 snapshots include connected **room members only**, not unrelated connected sessions.

The replay payload is bounded to the newest **200 events in ascending sequence order**. It does **not** delete SQLite rows or protected LifeLink `CHAR_DAMAGED` proof evidence. Regression: 515 rows remain stored while RESYNC returns the newest 200.

## Verification evidence

| Area | Result |
|---|---|
| Backend | `npm test`: **380 tests / 6 files passed**, including schema/routing guards |
| TypeScript | `npm run build`: PASS; `server/tsconfig.json` uses `noEmit` |
| Durable Object | Real Workers + SQLite integration: **17/17 passed** |
| Android/JVM | `gradlew.bat test assembleDebug --no-daemon --console=plain`: **BUILD SUCCESSFUL**, 57 tasks; 11 core JUnit reports, **159 tests / 0 failures / 0 errors / 0 skipped** |
| Debug APK | `android/build/outputs/apk/debug/android-debug.apk`, 36,949,480 bytes; SHA-256 `A05D0A2B1FE4A0C8AD36402935594E548222CCF533939DE7DF9355836BE5190C` |
| Exact-head CI | Commit `89ff8fcaf31b7cf0b4078027f78ecc64c09676bf`; [Actions run 1283 / 44352316406](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44352316406) — Backend, Android Debug APK and Durable Object SQLite all passed |
| Maximum-collection fixture | 100×100 cells, 512 mobs, 10,000 heaps/traps/plants, 10,000 visited/mapped positions, four players, 2,060 stored rows, 200 transmitted replay events |
| Measured fixture sizes | Inner level JSON **13,631,699 bytes**; complete `LEVEL_DATA` **14,613,062 bytes**; complete `SNAPSHOT` **15,664,067 bytes** |
| Headroom | Fixture is **588,861 bytes** below server cap and **1,113,149 bytes** below Android cap |

Focused byte tests verify the exact 15.5 MiB boundary, one-byte-over rejection, pre-serialization rejection of oversized nested JSON and byte parity against `TextEncoder(JSON.stringify(...))` for Arabic, accented text, emoji, lone surrogates and escaped controls.

## Explicit boundary / not claimed

- Closure proves bounded deterministic rejection of over-budget snapshots. It does **not** claim every theoretical combination at maximum native Bundle/item limits will fit; those oversized states are rejected atomically.
- No production Worker deployment, hosted live-room smoke test, authenticated service resume, emulator UI run or physical-device multiplayer session is claimed.
- Callback/manager/reconnect thread safety, render-thread UI dispatch, Android network/background/screen-off behavior and live Worker lifecycle smoke remain in **Phase 14-B**.

## Handoff to Phase 14-B

14-A is closed. Do not begin 14-B until the user explicitly authorizes it. Preserve the single working branch and keep the WebGPT task RUNNING/open.
