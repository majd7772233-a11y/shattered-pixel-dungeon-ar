# Multiplayer Session Recovery and Security Reference

> Gameplay/source-test baseline: bc6c46b03fee040ff20311adb473b19ff78e9bb7; exact code/test CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588). This page records observed controls and explicit open risks; it is not a formal security certification. Verify the live branch HEAD and its matching Actions run before changes.

## 1. Trust model

The client runs the authoritative SPD Java mechanics for selected native gameplay operations. The Worker/Durable Object coordinates the room and validates the reported native result against:
- the authenticated WebSocket attachment player identity;
- previously trusted player/Hero/Mob/world state;
- a unique request ID;
- current room/floor/branch and action state;
- allowed geometry and ownership;
- native bundle and inventory/heap deltas;
- action cost and actor timing;
- replay/idempotency records;
- durable item/chest/reward claims;
- expected event sequence and pending locks.

A client payload field such as engineResult=true is not proof that the actual engine produced the result. A native result is accepted only when the matching request, trusted pre-state and complete allowed transition can be verified.

## 2. Initial connection and identity

Observed Phase 12-A flow in MatchRoom.fetch():
1. The request must target /websocket and carry Upgrade: websocket; otherwise the handler rejects it.
2. A sessionToken query parameter is rejected. A resume credential must be Authorization: Bearer <token> with the server's strict token character/length contract.
3. For resume, the server resolves that token to exactly one players row. An optional playerId query value is only an equality assertion; a mismatch is rejected and it never selects another row.
4. Without a Bearer credential, the request can create a new player ID only; an existing player ID cannot be claimed without its token.
5. The server accepts the WebSocket and serializes {playerId, sessionToken} into its attachment before rotating the persisted token, so an accept failure cannot invalidate the client's still-current credential.
6. A synchronous transaction verifies the same player/token row, preserves the existing player state/position, rotates the token and marks that player connected. New identities are inserted rather than upserted over existing rows.
7. The server returns SESSION with the authenticated player ID, rotated token, current sequence and publisher status.

Every inbound message derives its sender identity from the socket attachment and checks that the attached token still matches the current persisted token. After a successful rotation, an older socket receives SESSION_REPLACED and is closed.

### Security controls and remaining risks

- Reconnect credentials are sent only through the Authorization header on HTTPS/WSS; URLs, query strings and RECONNECT payloads carry no session secret.
- playerId remains a client-visible player identifier, not an account-authentication identity. The token proves possession of the room's current session credential; this is not an account system.
- session_token remains stored as plaintext in the Durable Object SQLite players table. Hash-at-rest migration, expiry, explicit revocation, room-code entropy/discovery, and broader abuse/rate limits are not included in this slice.
- A successful reconnect rotates the token. A stale socket's later messages are rejected against the current DB token; the previous token is no longer accepted for another upgrade.
- Do not expose session tokens in logs, chat, diagnostic text, URLs, or crash reports. Avoid logging full Authorization headers.
- These controls are code-level protections, not a formal security certification or evidence of a production deployment.

## 3. Reconnect and event-gap recovery

Client MultiplayerManager:
- stores the current sessionToken in memory and tracks the last successfully applied sequence;
- opens a replacement secure WebSocket using Authorization: Bearer <sessionToken> in the upgrade handshake;
- sends RECONNECT with lastSequence only; player/session identity and secret are not repeated in that message;
- accepts the resumed SESSION only when the returned playerId is unchanged and a non-empty replacement token is present;
- installs the rotated token but does not advance the applied sequence from the reconnect SESSION; replayed events/snapshot must apply through the existing native paths;
- requests RESYNC after invalid or failed state application.

Server RECONNECT:
- relies on the authenticated {playerId, sessionToken} socket attachment established at upgrade;
- confirms that this exact attachment still matches the current persisted player/token row;
- ignores identity/token values in the message body; only lastSequence controls the recovery cursor;
- computes gap = currentSequence - lastSequence;
- if gap > 0 and gap <= 50, queries ordered events above lastSequence;
- sends EVENT_BATCH only if missingEvents.length exactly equals gap;
- otherwise falls back to full SNAPSHOT.

The client must only mark a SNAPSHOT sequence applied after WorldSnapshot.restoreWorld succeeds. For EVENT_BATCH, event ordering and state application must remain monotonic. Stale events must not roll back newer native Mob/player state.

The 50-event threshold is a source constant in the current implementation, not a universal protocol guarantee. Any threshold change affects reconnect behavior and needs tests/documentation updates.

### Historical Phase 12-A-only verification boundary (before Phase 12-B; 2026-11-16)

- Backend TypeScript noEmit check: PASS.
- Source-only backend test suite: 5 files / 370 tests PASS.
- Cloudflare Workers Durable Object SQLite integration: 1 file / 5 tests PASS.
- Android core JVM suite: 132 tests PASS (0 failures/errors/skips); Debug APK build PASS.
- Protocol vocabulary remains 25 messages / 23 actions.
These were local Phase 12-A-only checks on the then-current worktree based on 417dc7082f37db02b658112e33f3a51b69f72fbb; the later combined Phase 12-A/12-B evidence is recorded at the end of this document. Exact-head CI, live Worker deployment and physical-device testing are not claimed.



## 4. Request identity, replay and duplicate prevention

ACTION requests carry requestId. The Worker checks processed_actions:
- a requestId already owned by a different player is a conflict;
- a repeated request by the same player can receive its prior accepted result rather than applying the action again;
- a request with a new requestId is not automatically safe if a stable reward/item/claim identity has already been consumed.

Durable anti-duplication domains:
- processed_actions: request/result idempotency;
- claimed_item_instances: one owner/request for a specific depth/branch/heap/item tuple;
- claimed_chest_instances: one owner/request for a specific depth/heap;
- native_mob_reward_claims: stable reward claim IDs;
- room_meta mutation/combat locks: in-flight ownership and serialization.

Stable IDs:
- network playerId identifies a participant;
- stable entityId identifies a shared Mob/entity;
- heapId identifies a floor heap;
- itemId identifies one concrete item instance;
- native Mob mobId and Actor.id() are runtime/local identifiers, not cross-device ownership keys.

Do not replace a stable identity with class name, item slot, local Actor ID, array index or floor coordinate.

## 5. Native mutation lock

Native world mutation actions can require a snapshot after the native action. The Worker maintains a per-player room_meta key nativeMutationPending:{playerId} containing playerId, requestId and actionType.

The lock is checked against:
- exact owner;
- exact request ID;
- action type;
- lock status (FREE, OWNED, PENDING or STALE as defined by helper code).

The accepted action and the later native mutation snapshot must be bound to the same request. The snapshot must not be admitted just because the sender has a valid session.

## 6. Pending combat locks

MatchRoom.reservePendingCombat(...) reserves:
- one request per attacker;
- optionally one request per stable target.

A new request is rejected if the previous matching reservation is fresh. A stale pending reservation older than 15 seconds may be cleared. clearPendingCombat removes request, attacker and target lock keys.

The exact lock deadline and cleanup policy are part of the combat concurrency contract. Do not change them without attack/replay/concurrent-target tests and roadmap synchronization.

## 7. Floor-transition barrier and timeout

The room stores a transitionPending state and transitionReady:{playerId} entries.

Observed flow:
1. Validate the source stair/fall intent.
2. Ensure the transition is the only active pending transition.
3. Record source/destination depth, initiator, publisher and transition identity.
4. The destination level publisher submits a complete native destination LEVEL_DATA snapshot.
5. Each required connected living player supplies a validated destination state/readiness report.
6. tryFinalizeLevelTransition() verifies all required connected living players and their matching destination landing.
7. The room commits the new depth/player state, clears pending keys and alarms, then broadcasts the full snapshot.
8. MatchRoom.alarm() aborts a still-pending transition after 30 seconds and broadcasts LEVEL_TRANSITION_ABORTED.

The alarm is a Durable Object recovery mechanism; it is not a client-side timer. A timed-out transition must leave the room on the source depth and must not partially commit a destination.

## 8. Event sequencing and recovery

- For a legacy room without `room_meta.currentSequence`, `MAX(events.sequence)` supplies the cursor backfill before compaction.
- Once retention runs, the persisted `room_meta.currentSequence` checkpoint is authoritative and must not be replaced with `MAX(events.sequence)`, because older rows may have been compacted.
- Each accepted state transition receives the next monotonic sequence; its event row is stored in `events`.
- A request result is stored in `processed_actions` when applicable.
- `ACTION_ACCEPTED` and `EVENT_BATCH` communicate accepted requests/results; `SNAPSHOT` carries the full room state and sequence.
- `RESYNC` asks the Worker to send a full `SNAPSHOT`.


Continue reviewing database mutation, sequence increment, event writes, processed_actions receipts, claim creation/release and broadcasts against each action-specific contract. The accepted ACTION and native LifeLink transaction boundaries are documented in this file. Phase 12 now also places the complete multi-statement LEVEL_DATA replacement, native snapshot/metadata, Hero/player persistence, claim release, event/cursor updates and transition-ready marker inside one synchronous SQLite transaction. A failed commit restores the in-memory cursor/time and returns a correlated ERROR without ACK or world broadcast; the real Durable Object rollback/retry regression is recorded below.


### 8.1 Poison LifeLink batch rollback and replay

Publisher Poison LifeLink Mob callbacks are not committed as separate `SYNC_MOB_STATE` requests. The Mob deltas travel in the same Hero Buff tick or lethal Hero environment-death request. MatchRoom now uses `state.storage.transactionSync` for every source-shaped native Hero `BUFF_TICK`, plus the lethal Poison LifeLink environment-death request, so Hero/player state, the event and sequence cannot split; linked Mob/loot/reward state is included when present. The in-memory handler checkpoint restores sequence/world time when the transaction throws.

The accepted request ID and sequence belong to the whole batch. A retry with the same request replays its stored result; a new request ID cannot reuse the old Mob pre-state or the previous Hero Buff sequence baseline. The integration tests cover fresh-ID stale replay rejection and rollback after forced final event insertion failure.


### 8.2 Correlated rejection after transaction rollback

When a native Hero Buff tick or lethal Poison LifeLink transaction throws, `MatchRoomActions.handleAction()` restores its in-memory sequence/world-time checkpoint and rethrows so SQLite can roll the transaction back. `MatchRoomMessages.webSocketMessage()` now preserves the parsed request ID and includes it plus the current sequence in the ERROR response. Android can match that response to its pending `SYNC_HERO_STATE`, remove the pending entry and request RESYNC. The integration test invokes the actual WebSocket handler, forces the final event insert to fail, and checks that the SQL state was rolled back and the ERROR was correlated. Malformed frames that fail before a request ID can be parsed necessarily have no request ID in their error response. The same transaction boundary now defers `ACTION_ACCEPTED` and event broadcasts until commit: a later validation/hook failure cannot deliver a success event for rolled-back state. For FOV delivery, the original sender socket is used as the exclusion target after the transactional proxy is removed.

This evidence is still based on a deterministic in-memory SQL adapter. The Android full-snapshot restore check is also deterministic and local: it exercises the client router/restore code with a server-shaped envelope but does not verify that a deployed Worker returns that exact payload. Real Durable Object SQLite commit/rollback behavior, crash/restart recovery and live Worker behavior remain unverified. Do not generalize the atomicity guarantee to actions outside source-shaped native Hero `BUFF_TICK` requests and the special lethal Poison LifeLink environment-death wrapper.



### 8.3 Native Poison/Barrier damage reconciliation

A Poison tick may consume Hero Barrier shielding through the native `ShieldBuff.processDamage()` path without changing Hero HP. The authoritative validator permits only the exact Barrier row shield loss (or detach at zero) when the aggregate Hero shield decreases by the same amount. It leaves `partial_lost_shield` and other Buff state immutable, rejecting excess or unaccounted shield loss. Hunger remains distinct because native starvation damage bypasses shields. Backend and Java tests cover full absorption/detachment, partial absorption and forged shield/partial-state rejection.
The decay accumulator is checked using the exact Java Bundle key `partial_lost_shield`; the validator does not accept a synthetic camelCase field name.
Healing is covered by the same transaction boundary even though it has no linked Mob delta: the integration test forces the final event insert to fail after the Hero HP and Healing Buff updates, and verifies that both the player HP row and stored Hero Buff state roll back with the event and sequence. The wrapper broadens atomicity only; source-specific validation remains strict.


### 8.4 Poison shield priority order and lower-tier bypass

The same Poison transition is checked against native `ShieldBuff.processDamage()` priority order. Tier 2 (`WarriorShield`/`Blocking.BlockBuff`) must absorb its available amount before tier 1 (`AscendBuff`/`DivineShield`), and tier 1 must be exhausted before tier 0 (`Barrier`) can lose shield. The server derives the incoming damage from the Hero HP/aggregate-shield delta, not from a client-provided per-shield allocation. It validates each supported Buff's identity and class-specific Bundle fields and its native zero-shield lifecycle. A forged Barrier loss while BlockBuff or a Cleric shield remains is rejected even if the aggregate shield total would otherwise balance. Current Java and Backend regressions cover the supported three-tier set; new ShieldBuff classes require an explicit priority/lifecycle audit before admission.




### 8.3 SnipersMark expiry and restore boundary

A Hero-targeted `SnipersMark` is now published at its own due native expiry, including its remaining timer, target Actor ID and damage bonus in the trusted Hero before-state. The source-specific validator rejects early removal and disappearance hidden inside another Buff tick. Snapshot restoration must retain the mark's remaining cooldown and re-run its native attach side effect so the local `ActionIndicator` is reconstructed. This expiry-only test does not itself prove SpiritArrow selection/target identity or arrow damage. Those separate action semantics are covered by the completed stable-Mob SpiritArrow intent, publisher-result and requester-reconciliation path documented in `AUTHORITATIVE_DATA_FLOWS.md` §4.2. RemoteHero/player LifeLink and SpiritArrow SPEED/non-Mob branches remain explicit fail-closed exclusions, not unfinished Phase 9 work.


## 9. Authority and ownership

The current authority model includes authenticated player identity from the WebSocket attachment, one designated levelPublisher with a durable monotonic generation, target-owner/delegated native combat for selected Hero outcomes, pending mutation/combat locks, and stable server entity IDs mapped separately to each device's local Actor IDs.

### 9.1 Publisher handoff after disconnect

When the authenticated level publisher disconnects, MatchRoom checks that no newer socket for the same player is active. Ownership transfer, term increment, pending-combat cleanup and old native mutation lock removal execute inside a Durable Object `transactionSync`. Pending combat waiting for the disconnected authority is cancelled and the original requester receives a correlated ERROR. A stale close callback after a newer same-player connection does not transfer authority.

The server selects a replacement only when persisted level and Hero state pass validation. If no eligible replacement exists, it clears publisher ownership and increments the term; no other client may publish merely because the old owner disappeared. If atomic storage or the required snapshot is unavailable, handoff fails closed.

The replacement receives the persisted authoritative SNAPSHOT followed by LEVEL_PUBLISHER_CHANGED. The payload carries publisherId (or null), monotonic term and reason. Android ignores older generations; a different owner under the same term cannot replace the current owner.

### 9.2 Lossless publisher rebase gate

A replacement restores the persisted shared world but regenerates publisher-local Actor IDs. Its LEVEL_DATA includes `publisherRebase` and `publisherRebaseTerm`. MatchRoom compares reserialized state with trusted persisted state: shared world/level fields remain equivalent; stable Mob entity IDs, native bundles and Buff rows are unchanged; Mob Actor IDs are unique; connected Hero/RemoteHero Actor IDs are complete and disjoint from Mob IDs; local LifeLink.object references resolve only to trusted Mobs; SnipersMark.object and server_entity_id identify the exact same Mob.

Cross-device RemoteHero/player LifeLink or SnipersMark references that cannot be rebound are rejected. Invalid/stale rebase does not advance publisher-ready term; native world actions remain blocked until the exact current generation is committed.

### 9.3 Poison LifeLink and non-publisher behavior

Poison LifeLink is a publisher-owned batch. The server resolves local Actor IDs through trusted Hero/level state and requires the current publisher for linked Mob writes. A non-publisher process-local Actor ID is not a shared identity and is rejected with `BUFF_TICK_MOB_AUTHORITY_REQUIRED`, even when its Mob delta is empty. RemoteHero/player LifeLink remains unsupported.

After a rejected `SYNC_HERO_STATE`, Android requests RESYNC. The deterministic JVM regression applies a server-shaped full SNAPSHOT and verifies Hero HP/Buff clocks and linked Mob state restore. Workers-runtime tests exercise SQLite rollback/eviction/handoff; deployed Worker and physical-device recovery remain Phases 22–23.

## 10. Field-of-view disclosure

broadcastWithFOV() filters event visibility in PVP_ARENA and DEATHMATCH:
- it determines action/sender position;
- resolves target player or Mob position when targetId/targetPlayerId is supplied;
- checks line of sight from each recipient to the action and, where relevant, target;
- emits EVENT_BATCH only to recipients meeting those checks.

At the inspected baseline, this exact filter does not run for COOP_DUNGEON or SURVIVAL. A future mode-policy change must test event disclosure for movement, combat, unseen targets, missing target positions and disconnect/reconnect snapshots. A FOV filter is an information-disclosure boundary, not merely a visual optimization.

## 11. Mode/security caveats

Java GameMode descriptors currently declare properties:
- Co-op: no friendly fire, revive enabled, no auto-respawn, shared map, four players;
- PvP Arena: friendly fire, no revive/auto-respawn, no shared map, spectator death behavior, four players;
- Deathmatch: friendly fire, no revive, auto-respawn, no shared map, six players;
- Survival: no friendly fire/revive/auto-respawn, shared map, four players.

These are descriptor properties. The Worker currently has explicit Deathmatch kill-limit and PvP last-player-standing end conditions. The inspected checkMatchEndCondition() has no Survival end condition. Do not claim every mode property is enforced end-to-end.

## 12. Logging and error-handling requirements

Do not log bearer/session tokens or full secret-bearing payloads. For diagnostics, record request ID, message type, sequence, player ID in an appropriately protected context, validation code and failure stage.

Empty catch blocks around socket send, parsing, SQL or native restore can hide lost messages and inconsistent state. A future hardening pass should classify expected disconnects versus unexpected failures, retain safe diagnostics, and request resync/cleanup when state application is uncertain.

Known server error codes include:
- Room startup/recovery: `ROOM_RECOVERY_INVALID_WORLD_TIME`, `ROOM_RECOVERY_INVALID_EVENT_SEQUENCE`, `ROOM_RECOVERY_INVALID_SEQUENCE_CHECKPOINT`, `ROOM_RECOVERY_INVALID_GAME_MODE`, `ROOM_RECOVERY_MISSING_GAME_MODE`, `ROOM_RECOVERY_INVALID_SEED`, `ROOM_RECOVERY_MISSING_SEED`, `ROOM_RECOVERY_INVALID_DEPTH`, `ROOM_RECOVERY_MISSING_DEPTH`, `ROOM_RECOVERY_INVALID_GAME_STATUS`, and `ROOM_RECOVERY_INCOMPLETE`.
- LEVEL_PUBLISHER_ONLY;
- INVALID_SPD_LEVEL_SNAPSHOT / INVALID_SPD_EXPLORATION / INVALID_SPD_LEVEL_TILES / INVALID_SPD_TRANSITIONS / INVALID_SPD_MOBS / INVALID_SPD_ENTITY_IDS;
- INVALID_NATIVE_WORLD_MUTATION / INVALID_NATIVE_HERO_MUTATION;
- TRANSITION_PENDING / INVALID_TRANSITION_DESTINATION_SNAPSHOT / INVALID_LEVEL_READY;
- INVALID_OR_REPLAYED_NATIVE_WORLD_TURN / UNMARKED_NATIVE_WORLD_TURN;
- MATCH_ALREADY_ENDED / REQUEST_ID_CONFLICT;
- INVALID_NATIVE_ATTACK_INTENT / INVALID_NATIVE_PROJECTILE_INTENT;
- NATIVE_COMBAT_AUTHORITY_UNAVAILABLE / NATIVE_COMBAT_PRESTATE_REJECTED / NATIVE_COMBAT_ALREADY_PENDING / NATIVE_PVP_PRESTATE_REJECTED;
- ITEM_ALREADY_CLAIMED / CHEST_ALREADY_CLAIMED.

## 13. Deployment and operational boundary

server/wrangler.jsonc binds the MATCH_ROOM Durable Object and declares migration tag v1.

.github/workflows/deploy-server.yml deploys only for master/main server changes or manual workflow_dispatch. The multiplayer branch validation workflow does not deploy the active branch. A green branch build is not a live Worker deployment.

A deployment acceptance record must identify:
- exact code SHA and Worker version;
- route/environment;
- successful room creation/WebSocket handshake;
- two-client join/readiness/action/snapshot/reconnect smoke tests;
- logs/errors and rollback path.

## 14. Security test backlog

The current unit suite tests many validators and replay/ownership cases but does not prove a complete security audit. Add or extend tests for:
- spoofed initial player IDs and duplicate concurrent sessions;
- invalid, expired, replayed and rotated session tokens;
- room-code enumeration and unauthorized room joins;
- requestId reuse across players/actions;
- publisher spoofing and target-owner spoofing;
- sequence rollback/gaps and truncated event history;
- malformed/oversized nested payloads;
- reconnect while combat/transition/mutation locks are pending;
- stale locks and simultaneous claim attempts;
- FOV disclosure to an occluded player;
- deployment mismatch between clients, schema and Worker version.

## 15. Batch 3 boundary

Large-source decomposition is intentionally separate. This document maps current security/session responsibilities in the monolithic index.ts; it does not split it. Batch 3 must decide whether to preserve one Worker entry while extracting cohesive pure validator modules, persistence/claim services, room lifecycle, action domains and event broadcasting into separate files. The proposed design must be reviewed before code moves.


## 16. Historical Phase 11-A characterization baseline — 2026-11-14 (test-only gate; superseded by Phase 11-B)

The Phase 10 dependency is satisfied. This separately requested Phase 11-A slice adds tests that pin current behavior before replay/sequence implementation changes. Starting audited branch HEAD was `3a1924c7e482757543b2500dda86b1d3e94960af`; final code/test SHA is `1aa62a881dfef122256be253e2c96fd94eddcdea`, with exact-head CI [43641719063](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43641719063) passing all three jobs: Backend 10 Vitest files / 718 executions, Android JVM + Debug APK, and Durable Object SQLite 3/3. The parent Phase 11 remains OPEN; this is a verified characterization gate, not a replay/sequence fix.

### Worker behavior characterized

- **Reconnect replay window:** `MatchRoomActions.handleReconnect` replays only for a non-current publisher when `0 < gap <= 50`, and sends EVENT_BATCH only if the ordered result row count equals the gap. Tests pin ordered replay of 50 rows, SNAPSHOT fallback at 51, and SNAPSHOT fallback when retained rows are incomplete. The 50-event threshold is current source policy, not a protocol-wide guarantee.
- **RESYNC:** `MatchRoomMessages.webSocketMessage` returns a full SNAPSHOT with current players/Mobs/level and stored event rows. It is not an incremental EVENT_BATCH response.
- **Same-player request-ID collision:** the duplicate branch classifies only stored player identity. The same player receives the original ACTION_ACCEPTED sequence/result even if incoming action/payload differs; another player's reuse conflicts. A test now pins the changed-action/payload behavior.

### Android behavior characterized

- Existing stale-combat-event coverage remains: an older event cannot overwrite newer Mob HP.
- A new gap/out-of-order test sends sequence 2 followed by sequence 1 from a zero watermark; the current router advances to sequence 2, skips sequence 1, and does not request RESYNC for the missing sequence.
- A malformed new event currently advances the sequence watermark before requesting RESYNC. The test pins that order and checks no native Hero state changed for the malformed row.
- A structurally valid full snapshot older than the applied sequence is rejected without changing live Hero state, level dimensions, or applied watermark.

### Scope and interpretation

These are characterization tests, not approval of current behavior. Phase 11-B must design/fix contiguous EVENT_BATCH application, validate before advancing the applied watermark, bind request IDs to the original action/payload, and define the gap replay versus full-snapshot policy. Keep these tests as regression constraints; do not weaken them to make a later implementation pass.

No Worker route/validator/SQL, event persistence, Android router/manager/snapshot implementation, protocol schema or SPD gameplay formula changed in Phase 11-A. No production Worker deployment or physical-device test is claimed. The parent Phase 11 remains OPEN; Phase 11-B and Phase 12 remain out of scope until separately requested.

## 17. Phase 11-B verified event and request recovery behavior (2026-11-15)

At code/test SHA `2574489ff25e6f1fedc1e21718161bc5a7a1b230`, exact-head [CI 43731016036](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036) passed Backend, Android and Durable Object SQLite jobs.

### Client sequence and event application
- MessageRouter.handleEventBatchMessage parses valid positive safe-integer sequence values, collapses exact duplicate rows, rejects conflicting duplicates, sorts rows ascending and verifies the exact contiguous range from the current applied sequence + 1 through the envelope sequence.
- A missing sequence, invalid row or conflicting duplicate requests recovery before any new applied watermark is committed. Each accepted event is applied with a rollback baseline; the world-applied marker and MultiplayerManager.commitAppliedSequence advance only after successful application.
- EVENT_SKIPPED consumes the sequence without changing native world state. Stale/duplicate rows cannot roll the world backward.
- ACTION_ACCEPTED also requires the next contiguous sequence and validates/applies its event before committing the applied sequence. A full snapshot older than the client's applied sequence is rejected before live-world mutation.

### Server request replay and recovery policy
- processed_actions stores a canonical request fingerprint. Same-player retries with equivalent action/payload replay the recorded result; a different player or changed action/payload with the same requestId is a conflict.
- Fingerprints are stable across JSON object-key ordering. The schema migration adds request fingerprint and delegated-authority completion identity columns idempotently while preserving older receipt rows.
- The reconnect replay policy remains unchanged: a non-current publisher can receive EVENT_BATCH only for a complete contiguous retained range of 1–50 events; gaps outside that range, incomplete rows or ineligible publisher/visibility states use full SNAPSHOT. RESYNC remains a full SNAPSHOT.
- The ACTION transaction boundary rolls back persisted state, claims, processed receipt, event, sequence and world time together. Success broadcasts are delayed until commit; transactionSync unavailability fails closed.

No protocol vocabulary change, production Worker deployment or physical two-device test is claimed.
## Phase 12-B — eviction recovery and event evidence retention (2026-11-16)

The authenticated socket/session contract from Phase 12-A remains unchanged. A legacy room without `worldTime` retains the old zero-clock default because earlier versions wrote that key lazily on the first accepted ACTION; any persisted value is parsed and validated as finite and nonnegative. After an ACTION advances time, the value is stored transactionally. After a Durable Object is evicted, construction restores the persisted sequence checkpoint, room status, world time, mode, seed and depth from SQLite; legacy rooms backfill the cursor from their still-uncompacted event table and infer `ENDED` from MATCH_END, infer `PLAYING` only from a complete native snapshot at the current depth, or retain `LOBBY` when no complete run snapshot exists. Malformed critical metadata or a missing current level with durable related state is rejected rather than replaced with a generated room.

The event table keeps the newest 200 ordinary events for replay, alongside per-sender LifeLink proof retention (up to 513 CHAR_DAMAGED events after the newest HERO_BUFF_TICKED, plus latest HERO_BUFF_TICKED/PLAYER_DAMAGED boundaries). The evidence window is intentionally distinct from the replay window and can make the table exceed 200 rows. The existing reconnect policy still emits EVENT_BATCH only when the full missing sequence range is contiguous and no larger than 50; incomplete/older gaps use an authoritative SNAPSHOT.

The actual Cloudflare Workers Durable Object SQLite suite now contains 14 passing tests. It proves eviction/reconstruction, a 20-event contiguous replay at sequence 1000, snapshot fallback, restored Hero/player/level/worldTime, retention boundaries, legacy MATCH_END/active `PLAYING` status restoration and fail-closed missing-level detection. The additional Phase 12 regressions prove schema upgrades through versions 1 and 2 while preserving old receipts/claims, complete LEVEL_DATA rollback followed by successful retry, valid-snapshot publisher handoff, and term revocation without replacement election or fabricated broadcast when the snapshot is unavailable. No session-token location, protocol message, action or authority rule changed in the Phase 12-B recovery slice.

Final local checks on the committed implementation: backend 372 unique source scenarios / 744 mirrored executions; real Durable Object SQLite 14/14; Android core JVM 132/132 with zero failures/errors/skips; Debug APK build PASS. Exact-head CI 43921670336 passed all three jobs. Phase 12-A/B and parent Phase 12 are CLOSED for implementation and automated acceptance. No production Worker deployment or physical two-device test is claimed; those remain Phase 22/23 gates.
