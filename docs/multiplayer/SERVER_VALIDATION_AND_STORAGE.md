# Server Validation, Durable Object, and Storage Reference

> Source baseline: server/src/index.ts at commit 719dd5869a781d1c0eece2f1a7edd682bd02b9c5, reached from documentation branch HEAD eb2075b3f09ca4779773140b7e6539a6655f6824. This file intentionally documents the current monolithic implementation; source extraction/refactoring is reserved for Batch 3.

## 1. Backend shape

At the baseline, server/src/index.ts is 658,825 bytes and 10,095 lines. It contains:
- exported TypeScript wire interfaces;
- pure validation and merge helpers;
- stable entity/item identity helpers;
- native snapshot and transition validation;
- combat, item, ability, inventory, Buff and world mutation validators;
- SeededRNG;
- the MatchRoom Durable Object;
- SQLite schema/migration and per-room state;
- WebSocket session and request routing;
- event sequencing and broadcasts;
- the Worker fetch entry point.

There are no separate backend domain modules for these concerns in the current source tree. Do not treat this document as evidence that a modular structure exists.

## 2. Top-level validator domains

The following line ranges are approximate source regions at the baseline and are intended for navigation, not permanent API contracts.

| Source region | Domain | Representative functions |
|---|---|---|
| 1–246 | Envelope/session types, stable Mob IDs, movement and floor transitions | assignStableEntityIds, resolveServerMobIdByEntityId, isValidNativeMoveIntent, resolveNativeTransitionIntent, isValidNativeFallLanding, canStart/Abort/FinalizeNativeFloorTransition |
| 247–622 | Quickslots, equipment and chest heap validation | parseNativeQuickslotIndex, isValidNativeEquipmentIntent, isValidNativeEquipmentMutation, isValidNativeChestHeapMutation |
| 623–1,032 | Native item Buff/bundle safety and pickup side-effect policy | isValidNativeUseItemBuffMutation, isNativeFoodUseSafe, isNativeRechargingScrollReadSafe, isNativePotionUseSafe |
| 1,033–1,650 | Buyback, item status, item use and ability validation | isValidNativeBuybackIntent, isValidNativeItemStatusMutation, isValidNativeUseItemIntent, isValidNativeUseItemMutation, isValidNativeAbilityIntent, isValidNativeAbilityMutation |
| 1,651–2,130 | Shop buy/sell and Shopkeeper state | isValidNativeBuyIntent, isValidNativeSellIntent, isValidNativeSellInventoryMutation, isValidNativeBuybackShopkeeperMutation |
| 2,131–2,286 | Native world action admission and local movement-generated heap delta | isValidNativeWorldActionIntent, isValidNativeMovementHeapMutation |
| 2,287–2,570 | Stable identity, durable loot claims, native mutation locks and inventory indexing | isValidStableMultiplayerId, reserveNativeLootClaim, classifyNativeMutationLock, isValidNativeInventoryBundleIndex |
| 2,571–3,774 | Inventory economy, mining, DROP/PICKUP/THROW/projectile and alchemy deltas | isValidNativeItemEconomyIndexMutation, isValidNativeMineInventoryMutation, isValidNativeDropIntent, isValidNativePickupIntent, isValidNativeThrowIntent, isValidNativeProjectileCombatResult, isValidNativeAlchemyIntent |
| 3,775–4,810 | Hero Buff tick, wand charge, shield and damage-recovery transitions | isValidNativeHeroBuffTick, isValidNativeUnchangedBuffState, isValidNativeMineBuffMutation, isValidNativeInteractInventoryMutation |
| 4,811–5,655 | Native action-cost/world-mutation validation, complete level snapshots and Mob Buff expiry | isValidNativeMutationActionCost, isValidNativeWorldMutation, hasCompleteNativeLevelSnapshot, isValidNativeMobBuffExpiryTurn |
| 5,656–6,481 | World-turn snapshots, HP/damage, Ankh, attack requests/events, stable Mob reward IDs and secondary Mob deltas | isValidNativeWorldTurnSnapshot, isValidNativeDamageAccounting, isValidNativeAttackIntent, mergeNativeCombatAttackerState, parseAndValidateNativeSecondaryMobDeltas, isValidNativeCombatEvent |
| 6,482–6,503 | SeededRNG | deterministic helper used by server-side logic |
| 6,504–10,095 | MatchRoom class and default Worker fetch | storage, session, room state, WebSocket, actions, snapshots, transitions, FOV and routing |

The validator layer is deliberately strict and fail-closed. It checks native state transitions and action intents; it does not re-run the Java SPD engine.

## 3. MatchRoom method map

| Method | Approx. line | Responsibility observed |
|---|---:|---|
| constructor(state, env) | 6,514 | Bind DurableObjectState and SQLite storage; initialize the room database/state |
| alarm() | 6,521 | Enforce a timeout for pending floor transitions |
| abortPendingLevelTransition(...) | 6,542 | Abort a matching pending destination transition, clear readiness keys, sequence/broadcast an abort event |
| reconcileCombatAttackerState(...) | 6,583 | Compare trusted attacker state with the submitted native before/after state |
| clearPendingCombat(...) | 6,605 | Remove combat request, attacker and target reservations |
| reservePendingCombat(...) | 6,619 | Reserve one native combat per attacker/target, replacing stale locks |
| migrateClaimedItemInstances() | 6,647 | Migrate older item claims to include branch identity while preserving legacy rows |
| initDatabase() | 6,674 | Create tables and restore sequence/seed/depth/mode/world time |
| ensureLevelGenerated(depth) | 6,811 | Create a fallback 32x32 server level record if no level record exists |
| isMeleeAdjacent(...) | 6,863 | Check target adjacency using trusted dimensions/terrain |
| isCombatDestinationFree(...) | 6,881 | Prevent combat displacement into occupied player/Mob positions |
| isValidCombatTargetPosition(...) | 6,894 | Validate target cell against stored map flags |
| hasLineOfSight(...) | 6,903 | Server LOS check |
| fetch(request) | 6,942 | Handle WebSocket upgrade and allocate a per-connection session |
| webSocketMessage(ws, message) | 7,001 | Main inbound message handler; contains the majority of room protocol/action logic |
| broadcastCurrentSnapshot(...) | 9,783 | Assemble and broadcast room/player/Mob/events/level state |
| tryFinalizeLevelTransition() | 9,803 | Commit a pending floor transition after destination and participant readiness |
| getCurrentLevelSnapshot() | 9,885 | Build the server's current stored snapshot view |
| checkMatchEndCondition() | 9,944 | Evaluate the implemented competitive end conditions |
| webSocketClose(...) | 10,001 | Mark a player disconnected and broadcast PLAYER_LEFT |
| broadcastWithFOV(...) | 10,014 | Filter competitive event visibility using recipient LOS |
| broadcast(...) | 10,069 | Broadcast a message to room sockets |
| default fetch(request, env) | 10,082 | Resolve /room/{roomCode}/... to the named Durable Object |

webSocketMessage is a single very large method. Its inner request branches are not independent modules; Batch 3 will assess extraction seams and update all callers/imports/tests only after a separate design discussion.

## 4. Inbound message handling

webSocketMessage explicitly handles these inbound message types:
- RECONNECT;
- LEVEL_DATA;
- LEVEL_READY;
- ACTION;
- READY;
- RESYNC;
- PING;
- CHAT.

Other schema/Java enum message values are not explicit top-level inbound branches in this method at the baseline. Some are generated as server responses/events; some appear to be protocol placeholders or legacy entries. See PROTOCOL_MESSAGE_CATALOG.md before adding or repurposing a message.

The received WebSocket attachment supplies the server-side player session. The server overwrites the client-supplied senderId with the attachment's playerId before routing.

### 4.1 Initial WebSocket session

MatchRoom.fetch() at approximately line 6,942:
- requires an Upgrade: websocket header;
- creates a WebSocketPair and accepts the server socket;
- reads playerId from a query parameter or generates a UUID;
- generates a sessionToken UUID;
- serializes {playerId, sessionToken} into the WebSocket attachment;
- inserts or updates the players row as connected;
- chooses the level publisher if no publisher key exists;
- sends SESSION and can broadcast player-join state.

This is the observed source behavior. It is not an authentication system by itself; see SESSION_RECOVERY_AND_SECURITY.md.

### 4.2 RECONNECT

The RECONNECT message carries a sessionToken and lastSequence. The server checks for a players row with that token and then:
- marks the attachment player connected;
- calculates currentSequence - lastSequence;
- when the gap is positive and at most 50, loads the missing event rows;
- sends EVENT_BATCH only when the number of retrieved rows exactly equals the sequence gap;
- otherwise sends a full SNAPSHOT containing room state, player states, live Mob rows and the current level snapshot.

The client must not advance its applied sequence before event/snapshot reconciliation succeeds.

### 4.3 LEVEL_DATA

LEVEL_DATA is publisher-authorized for normal snapshots. A native world-mutation snapshot follows a separate admission path and must be bound to an accepted request, owned mutation lock and native before/after state.

The server validates:
- snapshot dimensions/depth/branch/seed and bounds;
- complete tile/transition/exploration arrays and uniqueness;
- native Mob fields and stable entity IDs;
- heaps/items, traps, plants and blobs;
- pending floor destination/landing rules;
- accepted native world mutation and related item/chest claims;
- trusted player/Hero pre-state, action identity, cooldown/action cost and replay state.

The full path is deliberately more than a generic JSON shape check. Never weaken it to make a malformed snapshot pass.

### 4.4 ACTION

The ACTION branch:
1. blocks new actions while a floor transition is pending or the match has ended;
2. checks processed_actions by requestId;
3. rejects a request ID reused by a different player;
4. replays an accepted result for the same existing request instead of applying it again;
5. reads action and data payload fields;
6. validates the action against trusted player, Hero and Level state;
7. coordinates native combat ownership/pending combat where required;
8. uses native mutation locks and durable claims for relevant mutations;
9. increments currentSequence only after the relevant validation/commit path succeeds;
10. persists the processed request and event;
11. sends ACTION_ACCEPTED and broadcasts the sequenced event.

Observed action branches include native combat sync, REVIVE, MOVE, LVL_TRANSITION, ATTACK, WAIT, USE_ABILITY, ALCHEMY, THROW, USE_ITEM, PICKUP, DROP, BUY, BUYBACK, SELL, EQUIP/UNEQUIP, OPEN_CHEST and native world actions. UNLOCK, MINE, INTERACT and OPEN_CHEST have a dedicated native world-action intent validator. Do not infer support for every NetworkActionType merely from enum membership.

### 4.5 READY, RESYNC, PING and CHAT

- READY marks the current player ready and broadcasts readiness.
- RESYNC sends a full SNAPSHOT assembled from stored room state.
- PING returns a PING response.
- CHAT is broadcast to room sockets.
- Unknown/unhandled messages do not gain implicit gameplay authority.

## 5. SQLite schema

Tables are created in MatchRoom.initDatabase(). The table names and columns below reflect the SQL definitions inspected at the baseline.

### room_meta

| Column | Type | Meaning |
|---|---|---|
| key | TEXT PRIMARY KEY | Named room state / lock / snapshot key |
| value | TEXT | Serialized state value |

Observed key families include:
- gameMode, seed, depth, worldTime, levelPublisher;
- heroState:{playerId};
- levelSnapshot:{depth};
- transitionPending and transitionReady:{playerId};
- nativeWorldTurnCounter;
- nativeMutationPending:{playerId};
- pendingCombat:{requestId};
- pendingCombatAttacker:{playerId};
- pendingCombatTarget:{targetLockKey}.

### players

| Column | Type / default | Meaning |
|---|---|---|
| player_id | TEXT PRIMARY KEY | Network player ID |
| session_token | TEXT | Current reconnect token |
| class_name | TEXT DEFAULT 'WARRIOR' | Selected class |
| pos | INTEGER DEFAULT 0 | Current cell |
| hp / ht | INTEGER DEFAULT 20 | Health and maximum health |
| str | INTEGER DEFAULT 10 | Stored strength field |
| weapon_dmg_max | INTEGER DEFAULT 8 | Stored weapon damage field |
| armor_val | INTEGER DEFAULT 2 | Stored armor field |
| kills / deaths / score | INTEGER DEFAULT 0 | Match counters |
| next_act_at | REAL DEFAULT 0.0 | Server action-time field |
| ready | INTEGER DEFAULT 0 | Lobby/floor readiness |
| state | TEXT DEFAULT 'ALIVE' | Alive/dead/spectator-like room state |
| connected | INTEGER DEFAULT 1 | Current connection flag |

### levels

| Column | Type | Meaning |
|---|---|---|
| depth | INTEGER PRIMARY KEY | Floor depth |
| width / height | INTEGER DEFAULT 32 | Stored floor dimensions |
| entrance_pos / exit_pos | INTEGER | Stored transition coordinates |
| seed | INTEGER | Stored floor seed |

### level_tiles

| Column | Type / default | Meaning |
|---|---|---|
| depth | INTEGER | Floor key |
| pos | INTEGER | Cell position |
| terrain | TEXT | Native terrain numeric/string representation |
| passable | INTEGER DEFAULT 1 | Traversal flag |
| solid | INTEGER DEFAULT 0 | Solid flag |
| pit | INTEGER DEFAULT 0 | Pit flag |
| los_blocking | INTEGER DEFAULT 0 | LOS flag |

Primary key: (depth, pos).

### mobs

| Column | Type / default | Meaning |
|---|---|---|
| mob_id | INTEGER PRIMARY KEY | Publisher-local/server row key |
| depth | INTEGER DEFAULT 1 | Floor |
| name | TEXT | Mob class/name representation |
| pos | INTEGER DEFAULT 0 | Position |
| hp / ht | INTEGER DEFAULT 10 | Health and maximum health |
| str | INTEGER DEFAULT 8 | Stored strength |
| dmg_max | INTEGER DEFAULT 6 | Stored damage |
| next_act_at | REAL DEFAULT 0.0 | Stored next-action time |
| state | TEXT DEFAULT 'HUNTING' | Stored AI state |

### claimed_item_instances

Columns:
- depth INTEGER NOT NULL;
- branch INTEGER NOT NULL DEFAULT 0;
- heap_id TEXT NOT NULL;
- item_id TEXT NOT NULL;
- claimed_by TEXT NOT NULL;
- request_id TEXT NOT NULL;
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP.

Primary key: (depth, branch, heap_id, item_id). This is a durable item-instance claim, not the in-memory Java LootClaimManager.

### claimed_chest_instances

Columns:
- depth INTEGER NOT NULL;
- heap_id TEXT NOT NULL;
- claimed_by TEXT NOT NULL;
- request_id TEXT NOT NULL;
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP.

Primary key: (depth, heap_id).

### level_transitions

Columns: transition_id TEXT PRIMARY KEY, depth INTEGER, pos INTEGER, type TEXT, target_depth INTEGER.

### processed_actions

Columns: request_id TEXT PRIMARY KEY, player_id TEXT, sequence INTEGER, result_json TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP.

This is the durable request-id replay/result record.

### native_mob_reward_claims

Columns: reward_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, request_id TEXT NOT NULL, depth INTEGER NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP.

This provides a stable reward-claim identity separate from local Actor IDs.

### events

Columns: sequence INTEGER PRIMARY KEY, sender_id TEXT, event_type TEXT, payload TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP.

This is the durable ordered event log used by reconnect/snapshot paths.

## 6. Migrations and transaction boundaries

The current explicit claimed_item_instances migration:
1. reads PRAGMA table_info;
2. detects whether branch exists;
3. renames the old table;
4. creates the current branch-aware table;
5. copies prior rows using the original branch or zero;
6. drops the legacy table.

This migration is wrapped in state.storage.transactionSync(...).

The reusable reserveNativeLootClaim helper also uses transactionSync for the claim reservation path. Do not assume every multi-statement action path in the 10,095-line file is wrapped in one SQLite transaction merely because the Durable Object serializes its events. Inspect the exact write sequence and failure path for every mutation being changed.

The currentSequence is restored from MAX(events.sequence) during initialization. The server then increments it when accepting a new event, writes the event row, stores processed_actions where a request ID exists, and sends the corresponding response/broadcast. Verify that the exact write order and retry behavior remain correct after any refactor.

## 7. Pending locks and deadlines

- Pending native combat is reserved by request, attacker and optional target keys. A previous reservation older than 15 seconds may be cleared; a fresh conflicting reservation is rejected.
- Pending native world mutations use a per-player key under room_meta and bind playerId, requestId and action type.
- Floor transitions use transitionPending and per-player transitionReady entries.
- MatchRoom.alarm() uses a 30-second destination readiness deadline. It reschedules while the deadline has not expired and aborts only when the pending transition is still the one that started on the current source depth.
- Loot/chest claims are durable and scoped by their primary keys.

Do not change timeout values or lock semantics without updating server tests, recovery documentation and the relevant roadmap acceptance criteria.

## 8. Fallback world generation is not native SPD generation

ensureLevelGenerated() creates a simple 32x32 server-side border/empty map with fallback Mob rows. It is a storage/bootstrap fallback for the Durable Object. It is not a substitute for SPD's native randomized level generator, room/painter logic, special rooms, terrain features, traps, items, blobs and all native metadata.

The full native level is published by the client. Never describe the fallback map as a real native dungeon.

## 9. Visibility and end conditions

broadcastWithFOV() filters event delivery in PVP_ARENA and DEATHMATCH by checking recipient line of sight to the action and, where applicable, the target. Co-op and Survival are not filtered by this exact conditional in the inspected method.

checkMatchEndCondition() currently contains:
- DEATHMATCH: end when the highest kill count reaches 10;
- PVP_ARENA: end when at least two players exist and exactly one player remains ALIVE.

No Survival end condition appears in this method at the baseline. Mode descriptors in Java are not enough to prove full server-side mode enforcement.

## 10. Default Worker entry

The default export fetch handler:
- parses URL pathname;
- for /room/{roomCode}/..., obtains the Durable Object namespace ID by roomCode;
- delegates the request to that Durable Object stub;
- otherwise returns a basic informational response.

server/wrangler.jsonc binds MATCH_ROOM to the MatchRoom class and declares its SQLite Durable Object migration tag v1. The deploy workflow is separate from multiplayer branch validation.

## 11. Batch 3 boundary

Batch 2 documents the existing monolith and its current behavior only. Batch 3 will separately inspect the feasibility of extracting validators, action domains, storage/repositories, session/WebSocket lifecycle and snapshot/transition coordination into smaller modules. No file is split or behavior changed by this document commit. The extraction design must account for imports, exports, test mocks, Wrangler entry points, storage compatibility, request serialization, module cycles and exact behavior parity. Discuss the proposed design before committing a large refactor.
