# Multiplayer Session Recovery and Security Reference

> Current branch HEAD: 7a6e091973051d82cb3cdf749553dd07d4ab0fce; gameplay/source-test baseline: bc6c46b03fee040ff20311adb473b19ff78e9bb7 (documentation-only descendant). This page records observed controls and explicit open risks; it is not a formal security certification.

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

Observed flow in MatchRoom.fetch():
1. Request must target a path ending in /websocket and carry Upgrade: websocket; otherwise the handler returns 426.
2. The server creates a WebSocketPair and accepts the server socket.
3. playerId is read from the URL query string or generated using crypto.randomUUID().
4. A new sessionToken is generated using crypto.randomUUID().
5. {playerId, sessionToken} is serialized into the server WebSocket attachment.
6. The players row is inserted/updated with session_token and connected=1.
7. If there is no levelPublisher room_meta key, the connecting player becomes the initial publisher.
8. The server returns SESSION with playerId, sessionToken, current sequence and publisher status.

Inbound sender identity is then overwritten from the server attachment; the client cannot choose an arbitrary senderId inside each later message.

### Security observations requiring future review

- The initial playerId can be supplied in the query string. The server creates a new session token, but the code shown does not use a separate account-authentication identity.
- session_token is stored in the players table as a string. The inspected schema does not hash it.
- Do not expose session tokens in logs, chat, diagnostic text or public URLs.
- Review whether reconnect tokens need rotation, expiry, revocation, device/session limits or stronger binding.
- Review room-code entropy, room discovery, duplicate playerId handling and whether a reconnect/second socket can supersede an older socket safely.
- These are threat-model review items. Do not claim an exploitable vulnerability without tracing the complete connection and deployment environment.

## 3. Reconnect and event-gap recovery

Client MultiplayerManager:
- stores sessionToken;
- tracks lastSequence;
- sends RECONNECT with sessionToken and lastSequence on reconnect;
- receives SESSION and installs its token/sequence;
- tracks pending request IDs;
- requests RESYNC after invalid or failed state application.

Server RECONNECT:
- reads sessionToken and lastSequence from payload;
- looks up a players row by session_token;
- marks the attached player connected;
- computes gap = currentSequence - lastSequence;
- if gap > 0 and gap <= 50, queries ordered events above lastSequence;
- sends EVENT_BATCH only if missingEvents.length exactly equals gap;
- otherwise falls back to full SNAPSHOT.

The client must only mark a SNAPSHOT sequence applied after WorldSnapshot.restoreWorld succeeds. For EVENT_BATCH, event ordering and state application must remain monotonic. Stale events must not roll back newer native Mob/player state.

The 50-event threshold is a source constant in the current implementation, not a universal protocol guarantee. Any threshold change affects reconnect behavior and needs tests/documentation updates.

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

- currentSequence is initialized from MAX(events.sequence).
- A successful state transition receives the next sequence.
- The event row is stored in events.
- A request result is stored in processed_actions when applicable.
- ACTION_ACCEPTED and EVENT_BATCH communicate the accepted request and result to clients.
- SNAPSHOT carries a full room state and sequence.
- RESYNC asks the Worker to send a full SNAPSHOT.

Review whether database mutation, sequence increment, events insert, processed_actions insert, claim creation/release and broadcast are safely ordered for each specific action. The code has explicit transactionSync use in some claim/migration helpers; do not assume every action's multiple SQL statements are wrapped in one common transaction.


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

A Hero-targeted `SnipersMark` is now published at its own due native expiry, including its remaining timer, target Actor ID and damage bonus in the trusted Hero before-state. The source-specific validator rejects early removal and disappearance hidden inside another Buff tick. Snapshot restoration must retain the mark's remaining cooldown and re-run its native attach side effect so the local `ActionIndicator` is reconstructed. This does not prove SpiritArrow selection/target identity or arrow damage is shared; those action semantics remain separate Phase 9 scope.


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
