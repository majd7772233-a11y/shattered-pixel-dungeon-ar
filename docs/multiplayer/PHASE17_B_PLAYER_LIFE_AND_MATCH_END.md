# Phase 17-B — Co-op Player Life, Revival, Leave and Match Completion

**Status:** Implementation complete; local automated acceptance PASS. Exact-head GitHub CI is pending the final pushed commit. Real-device acceptance remains deferred until after Phase 22.

## Scope

Phase 17-B completes the player-life and terminal-match rules on top of the authoritative room lifecycle delivered by Phase 17-A. It does not build the final multiplayer screens and it does not claim that cross-device play has been verified.

## Authoritative life-state policy

Life state is derived from the server-validated native Hero state, not from a client-supplied status flag alone.

- `ALIVE`: the player may submit normal gameplay actions.
- `DEAD`: reserved for the native unblessed-Ankh resurrection choice that is still pending. The only gameplay action admitted for this state is the validated native `REVIVE` path.
- `SPECTATOR`: the player has no available unblessed Ankh revival. The member can remain in the room and receive room/game updates, but cannot submit gameplay actions or become the Level Publisher.
- `LEFT`: a terminal server-recorded voluntary departure. Membership and readiness metadata are removed, the player is marked disconnected, and the previous room membership cannot be used to rejoin.

There is no free respawn. The existing native Ankh mechanics remain the only revival resource: blessed Ankhs follow the native automatic path, while an unblessed Ankh remains pending until the native choice consumes it successfully. The server verifies the before/after native Hero state and the required Ankh consumption before accepting revival.

## Revival and floor-transition safety

A player with a pending unblessed Ankh keeps the match alive and blocks a floor transition until the native revival choice is resolved. A malformed or internally inconsistent `DEAD`/`SPECTATOR` Hero snapshot is treated as unresolved: it does not falsely end the match and it does not let the rest of the party cross a floor boundary while the player's revival state is unknown.

After successful native revival, the player returns to `ALIVE`. If the previous Level Publisher is no longer eligible, publisher election can promote the revived connected player. A player with no revival resource remains a spectator and does not block further progression once the state is coherent.

## Publisher continuity

- Only an `ALIVE` room member can hold gameplay publisher authority.
- During `PLAYING`, failover requires a live socket/session, a valid native Hero snapshot and a complete recoverable current Level snapshot. If no valid candidate exists, the room remains suspended/recovering rather than inventing a publisher.
- During `LOBBY`, an alive member whose server-maintained membership is connected may be elected so that a missing lobby snapshot can be uploaded again. This election does **not** create readiness: `levelPublisherReadyTerm` is cleared, and the new publisher must send valid native Level data and satisfy the current-term readiness gates before MATCH_START can proceed.
- Lobby failover prefers the current room owner when eligible and realigns room ownership with the elected publisher. This preserves the Phase 13/17-A MATCH_START owner/publisher invariant.
- Explicit leave and publisher death revoke stale authority. A replacement receives a new publisher term; old-term readiness is never carried forward.

## Voluntary leave versus temporary disconnect

A voluntary `LEAVE` is terminal for the current room membership:

1. Delete room-member and ready metadata.
2. Persist player state `LEFT`, `connected = 0`, and `ready = 0`.
3. Append a sequenced `PLAYER_LEFT` event before any resulting `MATCH_END` event.
4. Transfer owner/publisher roles as required, without pre-marking a replacement publisher ready.
5. Acknowledge and close the departing socket with the normal leave code.

An unexpected transport disconnect is different: it does not mark the player `LEFT` and does not change `ALIVE`/`DEAD`/`SPECTATOR`. The member can reconnect only while the original room membership still exists; reconnect does not resurrect a dead player or turn a spectator back into an active player.

The Android `MessageRouter` applies the sequenced `PLAYER_LEFT` event and removes the departed remote player from the local multiplayer scene model. In LAN transport, the host registers a guest for broadcasts before sending `SESSION`, but buffers up to 64 pending frames until the `SESSION` frame is flushed; this guarantees an immediate `PLAYER_LEFT` cannot overtake the handshake or be lost after the guest has observed it.

## Match completion and persistence

For lifecycle-enabled Co-op rooms, `MATCH_END` is committed only when the roster is empty or every remaining member has a coherent terminal life state. Explicit `LEFT` is terminal; `DEAD`/`SPECTATOR` is terminal only when the native Hero snapshot confirms zero HP and no unblessed Ankh is pending. Missing or contradictory life-state data is not proof that everyone has been eliminated.

The match-end event, event sequence, persisted `gameStatus = ENDED`, lifecycle state, and Co-op publisher revocation are written in the same SQLite transaction. Ending the match deletes `levelPublisher` and its ready-term proof and advances the publisher term, preventing a dead or departed player from retaining authority. In-memory sequence/status values are restored when persistence fails, so a failed transaction cannot leave a phantom terminal match. A reloaded Durable Object therefore does not replay MATCH_END or reopen the match as PLAYING.

## Automated acceptance coverage

The focused suites cover life-state classification, Ankh eligibility/consumption, gameplay-action admission, floor-transition blocking, publisher death/failover, owner/publisher alignment in the lobby, voluntary leave, disconnect/reconnect distinction, `PLAYER_LEFT`/`MATCH_END` ordering, exactly-once match completion, persistence after Durable Object eviction, and rollback when MATCH_END cannot be stored, plus LAN peer-departure ordering across the `SESSION` handshake.

## Local verification — 2026-11-21

- Backend build and protocol/schema guards: PASS; 7 Vitest files / 408 tests PASS.
- Durable Object SQLite integration: 1 file / 18 tests PASS. The recovery exceptions in the log are expected corrupted-state rejection fixtures.
- Android/Java: forced `test assembleDebug --rerun-tasks --no-daemon`; 58 Gradle tasks successful, 24 JUnit reports / 246 tests PASS, 0 failures, 0 errors, 0 skipped. Debug APK: 35,262,158 bytes; SHA-256 `9FDE2B71BAF9F99B8817EE423C883226CA3746AAD579B2CCB6AEB6184026E1CE`.
- Cross-platform CI attempt on `7eb49092a7b61ed88e2db94d3976a7b33aef65a9`: Backend and Durable Object SQLite PASS; Android exposed a Linux-only timing race in `LANTransportTest.peerDepartureIsBroadcastToRemainingGuests`. The race is fixed in `LANTransport.java` by registering the peer before SESSION while buffering outbound messages until SESSION flush. Windows full Gradle/JVM/APK rerun after the fix: 58/58 tasks, 24 JUnit reports / 246 tests PASS, 0 failures/errors/skips. Exact-head GitHub CI is being rerun for this fix.
## Explicitly deferred

- No emulator launch, ADB session, Bluetooth pairing test, real Wi-Fi broadcast test or two-device game test is part of Phase 17-B. Real device/runtime acceptance remains after Phase 22, as requested.
- The multiplayer UI is still not considered complete. The major room/party/gameplay interface work remains in Phase 20, followed by responsive Arabic/English RTL/LTR polish and accessibility in Phase 21.
- A successful Phase 17 implementation/CI result does not by itself prove that the current user-facing multiplayer flow is playable online.