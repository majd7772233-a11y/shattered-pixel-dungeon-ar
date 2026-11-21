# Phase 18-A - Authoritative mode policy and target admission

**Status:** CLOSED for implementation and automated acceptance. Source commit `f81c6bfb1510c22a724dbb11c326ade85d0789c0` passed exact-head GitHub Actions [run 44943258563](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44943258563), 3/3 jobs. Phase 18-B has not started.

## Scope

Phase 18-A establishes the Worker-side source of truth for existing multiplayer mode capabilities and uses it to guard lifecycle room limits and player-versus-player target admission. It deliberately does not implement match scoring, actual Deathmatch respawn, winner resolution or the Phase 18-B visibility/race audit.

## Enforced mode matrix

| Mode | Players | Player targets | Team policy | Friendly fire | Revive | Auto-respawn | Shared map | Death behavior |
|---|---:|---|---|---|---|---|---|---|
| COOP_DUNGEON | 2-4 | Disabled | Cooperative | No | Yes | No | Yes | REVIVE_OR_GAMEOVER |
| PVP_ARENA | 2-4 | Free-for-all | Free-for-all | Yes | No | No | No | SPECTATOR |
| DEATHMATCH | 2-6 | Free-for-all | Free-for-all | Yes | No | Yes | No | AUTO_RESPAWN |
| SURVIVAL | 2-4 | Disabled | None | No | No | No | Yes | SPECTATOR |

Competitive modes are free-for-all in this phase. The current durable player schema has no team identity, so the Worker does not accept client-authored team assignments or imply team support.

## Implementation

- `server/src/match-room/mode-rules.ts` defines the typed mode matrix, mode validation and the pure player-target predicate.
- `server/src/match-room/base.ts` uses the typed mode union.
- `server/src/match-room/lifecycle.ts` derives room capacity/minimum player requirements from the matrix for room creation, joining, room-state projection and match start. A persisted room capacity that disagrees with the selected mode is rejected on join.
- `server/src/match-room/persistence.ts` validates persisted mode identifiers against the same matrix during recovery.
- `server/src/match-room/actions.ts` rejects PLAYER targets outside PvP Arena/Deathmatch, blocks non-ALIVE PvP members and Deathmatch players with non-ALIVE state or non-positive HP from normal actions; both PvP combatants must be distinct, ALIVE and have positive HP. In lifecycle-v1 rooms, both must be verified members of that room before a native combat request is forwarded.
- Native Java SPD remains authoritative for combat results. The Worker routes the request to the defender and validates the correlated result; this phase does not implement a new damage formula.

## Automated verification

- `cd server && npm run build` - PASS.
- `cd server && npm test` - PASS: all protocol/schema/routing guards and 424 Vitest tests across 8 files.
- `src/match-room/mode-rules.test.ts` - 10 tests for all four mode descriptors, malformed/unknown modes, target policy, distinct identities, positive HP, life state and strict membership booleans.
- `server/src/match-room/lifelink-death.integration.test.ts` - 74 tests, including six Phase 18-A MatchRoom admission regressions: Co-op player-target rejection; non-member PvP defender rejection; valid member-to-member PvP request forwarding; PvP Arena zero-HP action rejection; and Deathmatch zero-HP and contradictory DEAD-state action rejection.
- Real Workers Durable Object SQLite integration: 19/19 PASS, including Deathmatch minimum, six-player maximum, room-state maxPlayers projection, seventh-player rejection and corrupted persisted capacity rejection.
- Exact-head CI: [run 44943258563](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44943258563) passed 3/3 jobs on the source commit. Deployment workflow [run 44943258545](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44943258545) also succeeded; this is deployment-pipeline evidence, not a live Worker health check or WebSocket smoke test.

## Explicit Phase 18-B boundary

18-B remains responsible for actual Deathmatch auto-respawn and its native life-flow integration, PvP spectator/elimination completion, exactly-once kill/death scoring, killer attribution, simultaneous result races, disconnect/rejoin scoring behavior, final winner persistence and exhaustive FOV disclosure/replay/snapshot tests. Existing kill-limit and last-player-standing code must be audited and completed under that phase rather than treated as finished merely because a descriptor or baseline branch exists.

No deployed Worker smoke test or physical-device gameplay test is claimed here. Device/network acceptance remains deferred until the agreed later device-validation phase.
