# Phase 17-A - Authoritative Co-op Room Lifecycle

**Status:** Implementation and local automated verification complete; exact-head CI remains the acceptance gate.
**Parent phase:** Phase 17 remains OPEN until both 17-A and 17-B are accepted.
**Boundary:** This slice does not implement death/respawn policy or the full room UI.

## Split rationale

17-A establishes a trustworthy room/match lifecycle that every member can observe and that gates native gameplay. 17-B builds the living/dead/spectator and end-of-match rules on top of that foundation. This is a delivery boundary, not a change to the parent phase goals.

## 17-A scope

1. Preserve the server-owned Co-op contract: supported mode, capacity, minimum players, membership, connected state, shared seed/depth/sequence, and ready proofs bound to the current seed and sequence.
2. Project one authoritative room status: LOBBY, READY, PLAYING, SUSPENDED, RECOVERING, ENDED, or CLOSED.
3. Derive READY from evidence: enough members; every member connected and ready; every persisted ready proof matches the current seed and sequence; a complete current-depth/current-seed native level snapshot exists; and the publisher is a connected room member whose ready term matches its current publisher term.
4. Treat publisher loss as a lifecycle transition. No eligible successor means SUSPENDED. A successor elected/reconnected during an active Co-op match means RECOVERING, with a new publisher term and no ready proof yet.
5. Return to PLAYING only after a successor's validated native rebase and matching ready term commit durably in the same SQLite transaction. Publish the committed snapshot and recovered room state afterward.
6. Make Android consume roomStatus, validate state/game-status combinations, and keep gameplay disabled in SUSPENDED, RECOVERING, ENDED and CLOSED. Delayed MATCH_START or local snapshot callbacks cannot override these states.

## Authoritative projection

| Room status | Internal game status | Meaning / client gate |
|---|---|---|
| LOBBY | LOBBY | Setup; not yet startable |
| READY | LOBBY | Current room proofs and world snapshot satisfy start prerequisites |
| PLAYING | PLAYING | Connected publisher is ready for its current term; gameplay may proceed |
| SUSPENDED | PLAYING | No connected authoritative publisher; gameplay blocked |
| RECOVERING | PLAYING | Successor has not committed its current native rebase; gameplay blocked |
| ENDED | ENDED | Match terminal |
| CLOSED | Existing status may remain LOBBY or PLAYING | Room admission permanently closed; room gameplay is not admitted |

allReady is proof-backed. A ready flag with a stale seed or sequence does not make the room all-ready. A stale levelPublisher metadata key is insufficient: the publisher must also be a connected room member.

## Compatibility and non-goals

- These transitions apply to lifecycle-v1 Co-op rooms. Legacy sessions and non-Co-op publisher behavior are not redefined.
- Persisted gameStatus remains the internal match clock; roomStatus is the richer room-level authority exposed to members.
- Existing capacity, membership, readiness and start validation are retained; this slice makes their public readiness projection evidence-backed.
- Phase 20 owns the full host/join/setup/lobby UI. Phase 21 owns responsive Arabic/English RTL/LTR, touch and accessibility.
- No hosted Worker smoke, Android app launch, emulator/ADB, network toggle, Bluetooth discovery/pairing, physical device or two-device gameplay test is performed. Service/network smoke remains Phase 22; physical gameplay remains Phase 23.

## Files changed

- server/src/match-room/lifecycle.ts - current-proof validation and authoritative room-status projection.
- server/src/match-room/index.ts - publisher handoff, suspend/recover state and authorized Co-op publisher promotion on reconnect.
- server/src/match-room/actions.ts and base.ts - committed-rebase lifecycle hook and notification.
- core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/RoomLobbyState.java - strict room/game state invariants.
- core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MultiplayerManager.java - recovery states, stale-message guard and gameplay gate.
- server/src/match-room/lifelink-death.integration.test.ts - proof-backed projection and publisher handoff regressions.
- core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MultiplayerReconnectLifecycleTest.java - delayed-start/snapshot and invalid-state regressions.

## Local automated verification

- Backend: npm run build and npm test - **381 tests passed**.
- Real Cloudflare Durable Object SQLite suite: npx vitest run --config vitest.durable-objects.config.mjs - **17/17 passed**, including existing rollback and eviction coverage. This is separate from the in-memory lifecycle projection unit regressions.
- Android: gradlew.bat test assembleDebug --rerun-tasks --no-daemon --console=plain - **BUILD SUCCESSFUL**, 58 actionable Gradle tasks; **246 JVM tests**, zero failures/errors/skips.
- Debug APK: android/build/outputs/apk/debug/android-debug.apk; SHA-256 34EF9C4A2660B03444CB3DF8B986008B05C58EC9C2909A1815EA23145BD14FFD.
- git -c core.whitespace=cr-at-eol diff --check passes.

## Acceptance boundary

17-A can be marked accepted only after the final pushed commit's exact-head CI passes Backend, Durable Object SQLite and Android jobs. 17-B remains NOT STARTED. Parent Phase 17 stays OPEN until 17-B and the full parent acceptance criteria are met.
