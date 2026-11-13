# Server Validation, Durable Object, and Storage Reference

> Historical monolithic source baseline: server/src/index.ts at commit 719dd5869a781d1c0eece2f1a7edd682bd02b9c5. The current source has since completed Stage 1 validator extraction and Stage 2 MatchRoom decomposition; the historical line map below is retained only for tracing the original implementation.

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

This describes the original pre-extraction baseline. Stage 1 moved the validator/type/helper declarations into focused modules. Stage 2 has now moved the MatchRoom implementation into the inheritance chain documented in section 1.2; the root Worker entry remains in `server/src/index.ts`.

## 1.1 Current source layout after Stage 1

The original validator declarations have been moved out of `server/src/index.ts` into these focused modules. The original function bodies and domain behavior are retained; helpers required across module boundaries are exported internally, while `index.ts` keeps the former public named exports.

| Module | Responsibility |
|---|---|
| `server/src/protocol/types.ts` | Env, NetworkMessage and SessionData declarations |
| `server/src/validators/entity-identity.ts` | Stable server entity identity mapping |
| `server/src/validators/floor-transitions.ts` | Movement, stair/fall validation and transition barriers |
| `server/src/validators/equipment.ts` | Quickslots, equipment slots, equipment and chest validation |
| `server/src/validators/item-state.ts` | Item Buff/bundle safety, buyback, item status and use validation |
| `server/src/validators/abilities.ts` | Ability identities, intent and mutation validation |
| `server/src/validators/shop.ts` | Buy, sell, buyback and Shopkeeper state |
| `server/src/validators/world-actions.ts` | Native world action admission and movement heap deltas |
| `server/src/validators/inventory-claims.ts` | Stable loot identity, durable claim helpers, mutation locks and inventory bundle tree checks |
| `server/src/validators/inventory-economy.ts` | Inventory/economy indexing and mining deltas |
| `server/src/validators/world-items.ts` | DROP/PICKUP/THROW/projectile/alchemy helpers and mutations |
| `server/src/validators/hero-buffs.ts` | Hero Buff tick, wand charge, shield and damage-recovery validation |
| `server/src/validators/world-state.ts` | Action cost, native world mutations, full level snapshot and Mob Buff expiry validation |
| `server/src/validators/combat-state.ts` | World turn, HP/damage, Ankh, combat, Hero state, Mob deltas and combat event validation |
| `server/src/util/seeded-rng.ts` | Deterministic SeededRNG utility |
| `server/scripts/validate-phase10-protocol-enums.mjs` | Static ordered Java/schema message/action enum and protocol-version parity guard, invoked by `npm test` |

The grouping follows source cohesion and the observed helper dependencies. Some validator modules import shared helpers from other validator modules; imports are explicit. Do not create duplicate copies to avoid imports. The exact source SHA `4119263d9cc4dd5b230c551897b37dc4391417cf` passed the full backend TypeScript build and test job plus Android JVM/debug-APK job in [CI run 42479978278](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42479978278).

`server/src/index.ts` is now the stable 35-line Wrangler Worker entry and compatibility facade. It re-exports the original validator API and the final `MatchRoom` class from `server/src/match-room/index.ts`, plus the default handler from `server/src/worker.ts`. The Worker router lives in `worker.ts`; the room implementation lives under `server/src/match-room/`. Existing validator tests continue to import through `./index`; `entrypoint.test.ts` exercises the default route through that same facade. Original line ranges in sections 2–4 describe the pre-extraction baseline, not current line numbers.

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
| 6,504–10,095 | Historical MatchRoom class and default Worker fetch in the pre-extraction source | storage, session, room state, WebSocket, actions, snapshots, transitions, FOV and routing; now split into `server/src/match-room/` |

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

`webSocketMessage` is now the dispatcher in `server/src/match-room/messages.ts`. The original RECONNECT, LEVEL_DATA, LEVEL_READY and ACTION branch bodies are in `actions.ts`; ACTION remains a single ordered handler. The extracted branch bodies were checked against the original source, and the outer parse/error boundary is retained.

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

Historical MatchRoom.fetch() at approximately line 6,942 (now `server/src/match-room/index.ts`):
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
- RESYNC sends a full SNAPSHOT assembled from stored room state. Android's complete-snapshot gate also depends on the native level serializer preserving default-valued schema fields and explicit empty collections; `SPDLevelSnapshot.buildLevelJson()` now disables libGDX prototype elision so version/branch/default flags and required arrays reach the client.
- PING returns a PING response.
- CHAT is broadcast to room sockets.
- Unknown/unhandled messages do not gain implicit gameplay authority.


### 4.6 Android full-snapshot envelope regression

After a non-publisher Poison/LifeLink Hero tick is rejected, Android requests RESYNC and must not acknowledge the optimistic state. A JVM integration now constructs a full server-format `SNAPSHOT` envelope, routes it through the real `MessageRouter`, and verifies that `WorldSnapshot` restores the saved Hero HP/native Buff clocks and the same stable Mob actor/HP. This test confirms client application behavior but does not call the live Worker `RESYNC` endpoint or Cloudflare Durable Object SQLite.


## 5. SQLite schema

Tables are now created by `MatchRoomPersistence.initDatabase()` in `server/src/match-room/persistence.ts`. The table names and columns below reflect the SQL definitions inspected at the historical baseline; Stage 2 relocated them without changing the schema or migration statements.

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


### 6.1 Atomic native Hero Buff ticks and Poison LifeLink batches

There is an action-level transaction boundary in addition to the older claim/migration transactions. `MatchRoomActions.handleAction()` detects:
- every `SYNC_HERO_STATE` native `BUFF_TICK` carrying a string `buffClass`, a safe integer Buff ID and the trusted `heroStateBeforeJson` pre-state; and
- a lethal Poison `SYNC_HERO_STATE` environment-death action carrying the captured Hero pre-state and secondary Mob batch.

Those requests run `handleActionInTransaction()` inside `state.storage.transactionSync(...)`. For every Hero Buff tick, the transaction includes Hero state/player HP, processed request, event row, sequence and world-time updates. When the Poison LifeLink payload contains Mob changes, it also includes Mob SQL updates/deletions, the authoritative level snapshot/heap, and stable reward claims. The handler restores its in-memory sequence/world-time checkpoint if the transaction callback throws. If `transactionSync` is unavailable, the server sends `ATOMIC_NATIVE_BATCH_UNAVAILABLE` rather than accepting split writes.

This broader transaction wrapper does not widen the effect allowlist. Each request still passes `isValidNativeHeroBuffTick()` and its source-specific state transition validator; an unsupported or malformed Buff tick is rejected without becoming accepted state. The publisher batches LifeLink Mob callbacks generated by native Poison instead of publishing them as separate `SYNC_MOB_STATE` requests. The server maps local Actor IDs to stable Mob entities only through trusted Hero and level snapshots; non-publishers cannot author linked Mob state. For Mob deaths, the heap array is checked against the previous snapshot and only dead Mob positions are mutable. Reward metadata is derived from the trusted saved Mob.

Even an empty `secondaryMobDeltas` list is not sufficient for a non-publisher Poison tick when the trusted Hero pre-state contains LifeLink references. MatchRoom resolves those Actor IDs against the trusted level snapshot and requires the level publisher for the tick; otherwise it returns `BUFF_TICK_MOB_AUTHORITY_REQUIRED` without persisting Hero/Mob state or advancing sequence.

The in-memory integration adapter verifies rollback for both Poison LifeLink and a non-Poison Healing tick. The Healing regression forces final event insertion to fail after the Hero/player HP and Buff state are written, then checks that the stored Hero, player HP, event, processed request, sequence and world time return to their pre-request values. This is deterministic handler-level evidence, not a substitute for Cloudflare Durable Object SQLite, storage restart semantics or a deployed Worker.

The WebSocket boundary in `MatchRoomMessages.webSocketMessage()` preserves the parsed request ID before dispatch and includes it plus the current room sequence in its outer `ERROR` response when a handler throws. During these native Hero Buff transactions, `ACTION_ACCEPTED`, FOV event delivery and room broadcasts are deferred until `transactionSync` succeeds. The original sender socket is restored as the FOV exclusion after leaving the proxy-based transaction context; a rollback cannot leak an acceptance or phantom event.


### 6.1.1 Source-specific Hero FlavourBuff expiry: SnipersMark

`SnipersMark` is admitted through the existing simple-expiry branch only as its own native Hero `BUFF_TICK`. It must be due at the authoritative Hero actor clock, absent from the post-state, and the request must preserve HP, shielding and the stable Hero inventory/state checks performed by the common validator. Its target Actor ID and bonus remain unchanged in the serialized pre-state, and SnipersMark is intentionally absent from the cross-tick `expirable` set. Consequently, a Haste or other unrelated Buff event cannot silently remove the mark. This validates cleanup of the Hero-side action indicator only; it does not authorize a SpiritArrow action or client-asserted Mob target/damage.




### 6.1.2 SpiritArrow result commit and publisher rebase — Phase 9 complete

Strict SpiritArrow intent is validated against trusted Hero/Bow/SnipersMark/Mob state and a pending request reservation. Only the active level publisher may return the matching native result. Validation binds request ID, publisher identity/generation, stable target entity ID, attacker/target positions, native pre-state and post-bundle; missing/forged position, stale generation, wrong target and wrong mark-to-Mob identity are rejected.

The supported publisher result enters the scoped native combat transaction. Mob SQL state, full level snapshot, processed request, event and sequence are committed together. ACTION_ACCEPTED and FOV/EVENT_BATCH delivery are deferred until commit. On failure the SQL transaction and in-memory sequence/world-time checkpoint roll back; the requester receives a correlated error.

The requester receives the accepted sequenced PLAYER_ATTACKED event. Android resolves it by stable server entity ID and asks for a full snapshot when the native Mob bundle is present. A dedicated JVM regression verifies reconciliation across two client worlds with different local Mob Actor IDs.

Publisher disconnect handoff uses a durable generation. Its SQL transaction transfers or clears the owner, advances the term and cancels combat reservations tied to the old publisher. A replacement does not gain write authority until its restored persisted snapshot and `publisherRebase` are accepted as a lossless shared-world reserialization. Mob stable IDs/bundles and gameplay state remain fixed; process-local Hero/RemoteHero/Mob Actor IDs are refreshed and checked. LifeLink/SnipersMark references must point to the exact stable Mob; unsupported remote references fail closed.

The Workers runtime suite exercises real Durable Object SQLite rollback, replay, eviction/reconstruction and publisher handoff after a persisted snapshot. Gameplay/test baseline `bc6c46b03fee040ff20311adb473b19ff78e9bb7` passed exact-code CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588). The test runtime is local Workers emulation, not a deployed production Worker smoke test; verify later documentation-only commits with their own exact-head Actions run.

### 6.2 Poison damage against a native Hero Barrier

The Hero Buff validator also accounts for a bounded secondary row mutation during a Poison tick: `Char.damage()` may invoke `ShieldBuff.processDamage()`, which consumes a Hero's active `Barrier` before HP changes. This exception is Poison-only; native Hunger damage explicitly bypasses shield buffs.

Java writes the Barrier decay remainder under the native Bundle key `partial_lost_shield`; both the Poison-damage side-effect validator and the standalone Barrier tick validator read that exact name, not a camelCase alias.

For a surviving Barrier, the row must retain its ID, time/cooldown and all fields other than `shielding`; its shield can only decrease and `partial_lost_shield` must remain unchanged. When the Barrier reaches zero and detaches, the validator permits the row removal only if the outer Hero shield total falls by exactly the Barrier's full prior shield amount. This conservation check prevents unrelated/second shield changes from being hidden inside the Barrier exception. Hero HP and all unrelated Buff rows still pass the ordinary Poison validator.

The matching tests cover full Barrier absorption/detachment, partial consumption, and rejection of a vanished Barrier without aggregate shield loss, excess total shield loss, and a forged partial-decay remainder. The Java runtime test executes Poison against a two-point Barrier and checks the native Hero HP/shield result. Hunger's shield bypass remains separately enforced.



### 6.3 Native Poison ShieldBuff priority conservation

The current native ShieldBuff rows use these descending priorities in `ShieldBuff.processDamage()`:

- **2:** `BrokenSeal$WarriorShield`, `Blocking$BlockBuff`.
- **1:** `AscendedForm$AscendBuff`, `DivineIntervention$DivineShield`.
- **0:** `Barrier` and generic shields.

For a Poison Hero tick, the validator derives the integer incoming damage from `HP_before + aggregateShield_before - HP_after - aggregateShield_after`, adding the exact native WarriorShield shield activation if that callback occurred. It aggregates capacity/consumption within each tier and requires the higher tier to absorb its full capacity before a lower tier can change. It does not accept a client-selected distribution merely because the aggregate Hero shield total balances.

The per-row validator still verifies identity, time/cooldown and every immutable Bundle field. Zero-shield lifecycle is native-specific: WarriorShield and AscendBuff stay attached at zero; BlockBuff, DivineShield and Barrier detach. Equal-priority rows are treated as a tier aggregate to avoid imposing an order not guaranteed by Java's same-priority comparator. Any unrecognized ShieldBuff class is rejected as a Poison side effect until its priority and lifecycle are added deliberately.

Backend tests cover valid priority-tier consumption and forged attempts to spend Barrier before priority-2 or priority-1 capacity. The Android JVM regression executes the actual Poison actor with all tiers active. Exact-head CI at `3291698d1fbbb6bc37611d1a8276bb2477c50b58` passed [run 42703880852](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42703880852).


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

The default Worker fetch handler is implemented in `server/src/worker.ts` and re-exported unchanged by `server/src/index.ts`:
- parses the URL pathname;
- for `/room/{roomCode}/...`, obtains the Durable Object namespace ID by `roomCode` (or `DEFAULT_ROOM` when the segment is empty);
- delegates the same Request object to that Durable Object stub;
- otherwise returns the existing informational response.

`server/wrangler.jsonc` still uses `src/index.ts` as `main`, binds `MATCH_ROOM` to the `MatchRoom` class and declares SQLite Durable Object migration tag `v1`. The deploy workflow is separate from multiplayer branch validation.

## 11. Historical documentation-batch boundary

The earlier documentation batches described the pre-refactor monolith and are historical. The separate three-stage source refactor is now implemented: pure declarations are in focused protocol/validator/helper modules, the Durable Object uses the single shared-instance inheritance chain under `server/src/match-room/`, and the default Worker router is in `server/src/worker.ts`. The root `server/src/index.ts` remains the configured Worker entry and compatibility facade. The preservation audit and current ownership map below supersede any pre-extraction source-layout wording.


## 1.2 MatchRoom responsibility modules — Stage 2

The Durable Object class is split into an internal inheritance chain. Only `server/src/match-room/index.ts` defines and exports the final `MatchRoom` class; the root `server/src/index.ts` re-exports the class for Wrangler's existing `class_name: MatchRoom` binding and re-exports the default Worker fetch handler from `server/src/worker.ts`.

| Module | Responsibility | Preservation notes |
|---|---|---|
| `match-room/base.ts` | Shared room state and SQL handle; WebSocket close and broadcast primitives | Keeps the same mutable fields on one shared instance; no duplicated room state |
| `match-room/persistence.ts` | Claimed-item migration, DB initialization/schema setup and fallback level generation | SQL statements, table names, migration sequence and initialization order are retained |
| `match-room/combat.ts` | Pending combat reservation/cleanup, attacker reconciliation, geometry/LOS and FOV broadcast | Lock keys, 15-second stale reservation rule, target checks and FOV filtering retained |
| `match-room/snapshots.ts` | Current snapshot, transition finalization and match-end checks | Snapshot payload, sequence ordering and transition events retained |
| `match-room/actions.ts` | RECONNECT, LEVEL_DATA, LEVEL_READY and ACTION request handlers | Original branch bodies are moved intact; ACTION remains one ordered handler to preserve shared state mutations |
| `match-room/messages.ts` | WebSocket message admission/dispatch | Keeps the original outer parse/error boundary and awaits extracted handlers |
| `match-room/index.ts` | Single exported Durable Object class, constructor, alarm and per-room HTTP fetch | Class name remains `MatchRoom`; it extends internal layers and initializes the same database |

The only intended source changes are method relocation, changing internal `private` methods to `protected` where derived layers must call them, and replacing the monolithic message handler's four large branches with awaited handler calls. Message types, payload JSON, SQL mutations, request replay semantics, event/sequence behavior and Durable Object state ownership are not intentionally changed.

The root Worker entry and `wrangler.jsonc` main/binding remain stable. Stage 3 moved the unchanged default request handler into `server/src/worker.ts`, added entrypoint integration regressions and completed declaration-by-declaration parity checks.


## 1.3 Stage 2 exact-HEAD verification

The final Stage 2 source SHA `237577f1e8c68a3f052b36fcac64cd7efc07918d` passed [GitHub Actions run 42483052104](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42483052104):

| Job | Result |
|---|---|
| Backend TypeScript build and full tests | Success |
| Android JVM tests and debug APK compile | Success |

The 20 relocated MatchRoom method bodies and the four large WebSocket branch bodies were checked against the original Stage 2 parent source. The Worker default fetch body is retained. No Java sources, `protocol/schema.json`, `server/wrangler.jsonc`, SQLite schema or migration configuration were changed. This CI result is not a deployed Durable Object smoke test.

## 1.4 Stage 3 Worker integration and parity audit

- The original default Worker fetch implementation was relocated intact to `server/src/worker.ts`; the root `server/src/index.ts` remains the Wrangler `main` and re-exports that default handler.
- `server/src/entrypoint.test.ts` verifies the root `MatchRoom` export, room-code routing through `MATCH_ROOM.idFromName/get`, forwarding the exact original Request, empty-code fallback to `DEFAULT_ROOM`, and the unchanged non-room information response.
- The 200 original top-level declarations before `MatchRoom` were reconciled against the 15 destination modules; normalized declaration-text comparison found 200/200 matches and no text differences. All 118 original validator/protocol/helper exports plus the named `MatchRoom` export remain available.
- The final class remains uniquely defined in `match-room/index.ts`. `wrangler.jsonc` still uses `src/index.ts`, binding `MATCH_ROOM`, class name `MatchRoom` and migration tag `v1`. No protocol/schema or Java source changes were needed.
- This is source and automated-test evidence only; it is not a live Worker deployment, Durable Object runtime smoke test or physical multiplayer test.


---

## 8. Phase 10-B WebSocket ingress admission

**Live implementation:** `server/src/match-room/messages.ts` delegates the outer envelope to `server/src/protocol/message-admission.ts::validateWorkerInboundEnvelope` before any request handler is called.

The Worker now distinguishes three message-type classes:

- Eight implemented client inputs: RECONNECT, LEVEL_DATA, LEVEL_READY, ACTION, READY, RESYNC, PING and CHAT.
- Seventeen known canonical names that are not client-to-Worker routes. This includes server output types and declared-but-unimplemented placeholders; the names are deliberately not labelled all "server-only".
- Unknown names outside the canonical Java/schema vocabulary.

Admission is fail-closed. It requires an authenticated WebSocket attachment with non-empty playerId/sessionToken, a text frame, a JSON object envelope, required `protocolVersion/messageType/payloadJson`, correct optional requestId/sequence/senderId types, exact protocol version 1.0.0, a known implemented inbound type and syntactically valid JSON inside payloadJson. The Worker overwrites senderId only after this check, using the accepted socket attachment.

| Rejection | Wire error code | State effect |
|---|---|---|
| Missing/invalid attachment | SESSION_REQUIRED | No request is dispatched |
| Binary frame | UNSUPPORTED_FRAME_TYPE | No request is dispatched |
| Invalid outer JSON | MALFORMED_MESSAGE_ENVELOPE | No request is dispatched |
| Non-object/missing/wrong-typed fields | INVALID_MESSAGE_ENVELOPE | No request is dispatched |
| Protocol mismatch | UNSUPPORTED_PROTOCOL_VERSION | No request is dispatched |
| Unknown message type | UNKNOWN_MESSAGE_TYPE | No request is dispatched |
| Known but non-inbound type | UNSUPPORTED_MESSAGE_TYPE | No request is dispatched |
| Invalid nested payload JSON | MALFORMED_MESSAGE_PAYLOAD | No request is dispatched |
| Unexpected handler exception | MESSAGE_DISPATCH_FAILED | Error detail is not exposed; existing handler transaction/error behavior is retained |

When a non-empty requestId was parsed safely, the rejection echoes it; each error includes the current room sequence. Sending an error to a closed WebSocket is best-effort and does not affect room state.

This is an envelope-level gate only. It does not replace domain validators, change who may publish a level or resolve combat, loosen native action admission, or introduce a new action. The existing `handleActionInTransaction` still starts with `actionValid = false` and `INVALID_ACTION`; all 23 canonical action names are checked against explicit Worker branch tokens by `server/scripts/validate-phase10-routing.mjs`.

### 8.1 Sequence and persistence remain unchanged

- Valid ACTIONs retain their existing transaction/deduplication/event sequence path: accepted actions persist `processed_actions` and `events`, increment sequence only after validation, return ACTION_ACCEPTED and broadcast the accepted event.
- LEVEL_DATA remains publisher/native-snapshot and action-bound mutation ingress; existing authority, stable identity, snapshot completeness, native mutation lock and action-specific validators remain authoritative.
- LEVEL_READY validates the per-player destination state and updates the transition-ready record; the existing room barrier still decides when the destination can be committed.
- READY, PING and CHAT retain their existing lightweight SQL/broadcast behavior; RESYNC and RECONNECT retain their current SNAPSHOT/EVENT_BATCH paths.

No replay or resync algorithm was modified by the admission gate. Client parser/version parity and a single typed Android event path remain Phase 10 work.
