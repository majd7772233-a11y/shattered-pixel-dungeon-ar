# Multiplayer Protocol and Message Catalog

> Phase 10-A protocol contract source/test SHA: d8938190960af64d6efc70f4625a7411bfa3b7de; exact-head CI [43485367695 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43485367695). This catalog records the observed Java enums, JSON Schema, Worker routes and Android handlers. Phase 10 remains open: enum/schema parity is only the first bounded slice, not completion of the typed event path. Verify the live branch HEAD and its exact-head Actions run before editing.

## 1. Protocol version and envelope

protocol/schema.json declares JSON Schema Draft-07 and protocol version 1.0.0.

The top-level NetworkMessage envelope contains:

| Field | Type | Schema requirement | Observed role |
|---|---|---|---|
| protocolVersion | string | required | Wire compatibility marker |
| messageType | string enum | required | Outer message discriminator |
| requestId | string | optional | Idempotency/replay key for requests and responses |
| sequence | integer | optional | Room event/snapshot sequence |
| senderId | string | optional | Sender identity; server replaces inbound senderId with the player ID from the accepted WebSocket attachment |
| payloadJson | string | required | Serialized message-specific JSON body |

Important: payloadJson is itself a JSON string. A message therefore has a JSON envelope containing another encoded JSON payload. Preserve this two-level representation in tests and serializers.

NetworkMessage.java defaults messageType to ACTION, parses the outer JSON, reads optional requestId/sequence/senderId and returns MessageType.ERROR on malformed or unknown input. The server similarly parses the outer envelope before processing the typed branch.

## 2. Outer message-type enum

The Java MessageType enum and schema messageType enum currently contain **25 outer message names**:

| Message type | Intended direction / observed use |
|---|---|
| HELLO | Schema/enum message; no explicit top-level Worker inbound route identified |
| SESSION | Server → client initial session response; carries player/session token, sequence and publisher status |
| CREATE_ROOM | Schema/enum entry; no explicit top-level Worker inbound route identified |
| JOIN_ROOM | Schema/enum entry; no explicit top-level Worker inbound route identified |
| ROOM_STATE | Schema/enum entry; no explicit top-level Worker inbound route identified |
| PLAYER_JOINED | Server → room peers on a player joining |
| PLAYER_LEFT | Server → room peers when a WebSocket closes |
| READY | Client → server readiness; server marks the player ready and broadcasts readiness |
| MATCH_START | Schema/enum entry; no explicit top-level Worker inbound route identified |
| ACTION | Client → server gameplay request; payload includes action/action data and native state when required |
| LEVEL_DATA | Client → server native level snapshot or accepted native mutation snapshot |
| LEVEL_READY | Client → server destination-floor readiness report |
| LEVEL_PUBLISHER_CHANGED | Server → room peers after assignment/handoff; carries publisherId (or null), monotonic term and reason |
| ACTION_ACCEPTED | Server → requesting client after an accepted action; includes requestId and sequence |
| COMBAT_REQUEST | Server/client native authority request path supported by Java routing; no explicit inbound Worker branch at the baseline |
| EVENT_BATCH | Server → clients with ordered event records; message.sequence accompanies payload records |
| SNAPSHOT | Server → client full authoritative room/level state |
| ACK | Server → client acknowledgement, including stable entity mapping acknowledgements |
| RESYNC | Client → server request for a full authoritative snapshot |
| RECONNECT | Client → server session-token and last-sequence recovery request |
| MATCH_END | Schema/enum entry; current Worker usually sends match end inside an EVENT_BATCH event record |
| LEAVE | Schema/enum entry; no explicit top-level Worker inbound route identified |
| PING | Client/server liveness message |
| CHAT | Client → server; server broadcasts the chat envelope |
| ERROR | Server → client rejection or invalid-input response |

The following distinction is essential: a message being present in both enum and JSON Schema proves that a name is recognized by the contract, not that the Worker handles it in both directions or that a client path is complete.

### LEVEL_PUBLISHER_CHANGED and NativeLevelSnapshot.publisherRebase

`LEVEL_PUBLISHER_CHANGED` is a server-authored control message. Its payload contains `publisherId` (or null when no eligible replacement exists), a durable monotonic `term`, and the handoff/assignment `reason`. A client accepts only a non-stale term; an older message cannot restore obsolete authority, and a different owner under the same term is not accepted.

A replacement publisher's full `LEVEL_DATA` snapshot may carry `publisherRebase` and `publisherRebaseTerm`. This refreshes process-local Hero/Mob/RemoteHero Actor IDs while preserving shared world state, stable Mob entity IDs and native bundles. The Worker validates LifeLink and SnipersMark references against the trusted stable Mob mapping and does not open the publisher action gate until the current generation is committed. Invalid/stale rebase stays fail-closed.

These fields support Phase 9 authority handoff. Phase 10 still owns full enum/schema/handler parity and consolidation of the legacy client default route.

## 3. Explicit Worker inbound routes

MatchRoom.webSocketMessage() explicitly branches on these eight outer types:
1. RECONNECT
2. LEVEL_DATA
3. LEVEL_READY
4. ACTION
5. READY
6. RESYNC
7. PING
8. CHAT

The remaining values are used as server outputs, client-handled messages, schema/legacy entries, or authority-routing concepts. Do not add a message without defining its sender, exact envelope, body schema, authorization, sequence behavior, persistence, client handler, malformed behavior and tests.

## 4. Outer-message processing on Android

### MultiplayerManager

Relevant responsibilities:
- startSession(...), endSession();
- onConnected(), onMessageReceived(), onDisconnected(), onError();
- sessionToken and lastSequence management;
- sendReconnect();
- requestResync(...);
- sendAction(...), sendAuthorityAction(...);
- publishNativeWorldMutation(...), publishCurrentLevel(), sendLevelReady();
- publishNativeWorldActorResult(...);
- stable server entity ID registration and ACK mapping.

The manager removes pending actions when ACTION_ACCEPTED/ACK arrives, handles ERROR and can roll back/reconcile a rejected pending mutation/action. SESSION installs the received token and initial sequence. SNAPSHOT is not considered applied until native restore succeeds.

### MessageRouter

Outer routing at the baseline:
- SESSION → update manager sequence/session state;
- SNAPSHOT → handleSnapshotMessage(...);
- EVENT_BATCH → queue handleEventBatchMessage(...) on the render thread;
- COMBAT_REQUEST → queue native combat resolution on the render thread;
- ACTION_ACCEPTED → update sequence and apply accepted action on render thread;
- ACK → update sequence and resolve stable entity acknowledgement;
- MATCH_END → update sequence;
- ERROR → handle rejection/resync path;
- default → RemotePlayerActionReceiver.handleNetworkMessage(...).

The default route is a known transitional boundary. MessageRouter and RemotePlayerActionReceiver do not yet constitute one fully consolidated typed message path. Phase 10 owns this migration; do not silently describe it as complete.

## 5. Gameplay NetworkActionType enum

The 23 Java action values are:

| Action | High-level meaning |
|---|---|
| MOVE | Native Hero movement |
| ATTACK | Native Hero attack |
| PICKUP | Take one identified floor item |
| DROP | Drop full/partial native stack |
| THROW | Throw projectile and reconcile native impact |
| EQUIP | Native equipment transaction |
| UNEQUIP | Native equipment transaction |
| OPEN_CHEST | Claim/open a specific chest heap |
| BUY | Shopkeeper purchase |
| BUYBACK | Repurchase a sold item |
| SELL | Sell one exact item instance |
| INTERACT | Native NPC/world interaction |
| UNLOCK | Unlock native target such as a door |
| LVL_TRANSITION | Stair/fall floor transition intent |
| MINE | Native mining interaction |
| ALCHEMY | Native alchemy transaction |
| USE_ITEM | Supported native item consumption/use |
| USE_ABILITY | Native class armor ability |
| WAIT | Native Hero wait action |
| REVIVE | Native revival result |
| SYNC_HERO_STATE | Native Hero/combat state publication |
| SYNC_MOB_STATE | Native Mob state publication |
| SYNC_PLAYER_COMBAT | Native player-combat authority result/state synchronization |

NetworkActionBridge maps a subset of HeroAction classes directly: Move, Attack, PickUp, OpenChest, Buy, Interact, Unlock, LvlTransition, Mine and Alchemy. Unknown HeroAction classes fall back to WAIT in the inspected mapping; do not treat that fallback as an implementation of the missing action.

## 6. Worker action routing observed at baseline

Inside ACTION:
- SYNC_PLAYER_COMBAT;
- SYNC_MOB_STATE;
- SYNC_HERO_STATE;
- REVIVE;
- MOVE;
- LVL_TRANSITION;
- ATTACK;
- WAIT;
- USE_ABILITY;
- ALCHEMY;
- THROW;
- USE_ITEM;
- PICKUP;
- DROP;
- BUY;
- BUYBACK;
- SELL;
- EQUIP / UNEQUIP;
- OPEN_CHEST;
- generic validated native world actions, with the helper allowlist currently including UNLOCK, MINE, INTERACT and OPEN_CHEST.

Some action families have their own validator and inventory/heap/shop state checks. The generic action path is not a blanket permission to accept arbitrary NetworkActionType values. Any unsupported or ambiguous effect must fail closed.

## 7. Event records carried inside EVENT_BATCH

EVENT_BATCH is an outer envelope. Its payloadJson is an array of event records; each record may contain sequence, eventType, depth and action.

Observed server eventType assignments at the baseline include:
- PLAYER_MOVED;
- MOVE_INTENT_ACCEPTED;
- ITEM_PICKUP_INTENT_ACCEPTED;
- WORLD_ACTION_RESOLVED;
- PLAYER_ATTACKED;
- PLAYER_DAMAGED;
- CHAR_DAMAGED;
- HERO_BUFF_TICKED;
- LEVEL_TRANSITION;
- PLAYER_WAITED;
- MATCH_END.

The client router additionally contains handling for other native/legacy event names including MOB_MOVED, MOB_ATTACKED, PLAYER_REVIVED, CHAR_DIED, CHEST_OPENED and NATIVE_WORLD_MUTATION. Treat those as handler strings, not proof that every one is emitted by the current Worker path.

A snapshot or event record sequence must be applied monotonically. Stale/duplicate events are skipped or rejected according to the exact handler, and invalid/incomplete reconciliation must request resync.

## 8. Protocol schema definitions

`protocol/schema.json` is Draft-07 and currently defines the shared envelope, native snapshots/items and combat payloads, including the SpiritArrow-specific extension inside `NativeAttackPayload`.

| Definition | Purpose |
|---|---|
| NetworkActionType | Complete 23-value Java gameplay action vocabulary; declaration does not imply Worker acceptance. |
| NativeUseItemAction | DRINK, EAT, READ action discriminator |
| NativeMobEntity | Stable ID, native Mob state, AI and scheduler fields |
| NativeLevelSnapshot | Version, floor, dimensions, metadata, tiles, transitions and entity collections |
| NativeAttackPayload | Native Hero attack request/result fields, weapon context, secondary/projectile state and SpiritArrow extension |
| NativeTile | Full native traversal/terrain/visibility flags |
| NativeCombatOutcomeEvent | Sequenced combat outcome and native state |
| NativeMobDamagePayload | Native Mob → Hero or related damage transition |
| NativeBlessedAnkhRevivalPayload | Blessed revival before/after state and counts |
| NativeEnvironmentDamagePayload | Native environment damage and state transition |
| NativePeriodicMobDamagePayload | Periodic native Mob damage and full after-state |
| NativeUnblessedAnkhRevivalPayload | Unblessed revival and heap/state result |
| NativeHeap | Heap identity, state and items |
| NativeItem | Stable item ID, class, quantity, serialized bundle, stackability and economic metadata |

### 8.1 SpiritArrow contract inside NativeAttackPayload

SpiritArrow is **not** a new outer `MessageType` and is not a separate `NetworkActionType`. It is an attack weapon mode carried inside the existing native attack request/result contract:

- `attackWeaponMode: "SPIRIT_ARROW"` identifies the original native SpiritBow/SpiritArrow execution.
- `attackWeaponBundle` binds the submitted bow Bundle to the trusted equipped item.
- `engineRanged` must be `true`.
- `spiritArrow` is a strict object with no extra properties and requires `formatVersion`, `markBuffId`, `markBonus`, `targetEntityId` and `bowItemId`.
- The conditional schema requires a Mob target and `attackKind: "RANGED"`, and rejects `projectileMutation` for this mode. Other modes cannot carry `spiritArrow`.

The static contract is checked by `server/scripts/validate-spirit-arrow-schema.mjs`, included in backend `npm test`.

The Phase 10-A parity guard `server/scripts/validate-phase10-protocol-enums.mjs` compares the ordered Java `MessageType` and `NetworkActionType` enums with their JSON Schema definitions, checks `NetworkMessage.PROTOCOL_VERSION` against `schema.version` and the `protocolVersion` default, and ensures the narrower `NativeLevelSnapshot.nativeMutationAction` allowlist contains only declared actions. This proves vocabulary/version parity, not Worker route coverage or end-to-end support.

**Historical 9-C failure snapshot — 2026-11-12; superseded by Phase 9 completion on 2026-11-13.** At gameplay HEAD `9168284e67d353a956fc276e0ea8c00d1c685f1d`, [CI 43290836162](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43290836162) reported 654 passed / 4 failed mirrored Vitest executions. Those failures were subsequently resolved: publisher result commit and requester EVENT_BATCH are now covered, the forged-position negative test asserts the correlated ERROR, and Android accepted-event reconciliation is tested on two client worlds with different local Mob Actor IDs.

The Phase 9 gameplay/test baseline is `bc6c46b03fee040ff20311adb473b19ff78e9bb7`; exact code/test CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588). The source-level acceptance includes Backend 682/682 executions, Android JVM/Debug APK and three Workers-runtime Durable Object SQLite tests. Phase 9's support boundary and exclusions are recorded in `ROADMAP.md` and `TEST_MATRIX.md`. Phase 10-A source/test SHA `d8938190960af64d6efc70f4625a7411bfa3b7de` passed exact-head CI [43485367695](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43485367695), including the enum/version parity guard; verify any later documentation-only branch commits against their own Actions run.



## 9. Identity and sequence fields

- requestId binds one request/result and is used by processed_actions to prevent replay/conflicting reuse.
- sequence is the monotonically increasing room event/snapshot sequence.
- senderId on inbound client messages is not trusted; the Worker overwrites it from the WebSocket attachment.
- Mob server entityId is stable across clients; Mob mobId/Actor.id is a local publisher/runtime key.
- itemId is a stable item-instance identity; heapId scopes a collection of items.

## 10. Protocol change checklist

For every new message/action/event:
1. Update schema and version compatibility policy.
2. Update Java enum/serializer/parser.
3. Update NetworkActionBridge or native producer where relevant.
4. Add explicit Worker route/validator and define persistence/sequence behavior.
5. Add client typed handler; do not extend legacy string parsing as a shortcut.
6. Define rejection/error/resync behavior.
7. Add positive, negative, stale, replay and malformed payload tests.
8. Update all message/data-flow/security/test docs plus GPT.md and ROADMAP.md.


---

## 11. Phase 10-B cross-layer routing matrix — live source audit 2026-11-13

This section supersedes any earlier "at baseline" route descriptions above. It is grounded in the branch source at the Phase 10-B starting HEAD `fa5f7937eb55145345230de7930be8f860b74694`, not inferred from enum membership.

### 11.1 Outer messages — direction, Worker ingress and Android path

The Worker ingress is `server/src/match-room/messages.ts::webSocketMessage`. At the audited source, it has eight explicit client-input branches. The current Java client decoder is `NetworkMessage.parseJson`; `MultiplayerManager.onMessageReceived` owns session/pending-request/sequence bookkeeping and calls `MessageRouter.routeMessage`. The router explicitly handles nine server message kinds; the other 16 enum names fall through to `RemotePlayerActionReceiver`.

| Outer type | Direction / sender | Worker ingress / persistence | Java / Android path and current status |
|---|---|---|---|
| HELLO | No active sender found | Not an inbound branch; no current Worker producer found | Enum/parser recognizes it; router default falls through to the legacy receiver. Declared placeholder, not an implemented handshake. |
| SESSION | Worker → newly connected socket; `MatchRoom.fetch` | Server-created welcome after WebSocket attachment/player row setup; carries playerId, sessionToken, seed, depth, game mode and publisher generation | `MultiplayerManager.onMessageReceived` installs session state; `MessageRouter` advances sequence. Not a client-input route. |
| CREATE_ROOM | No outer-message sender observed; room selection currently uses the HTTP/WebSocket room path | No `webSocketMessage` branch | Enum/parser only; default legacy receiver if received. No message-level room creation contract is implemented here. |
| JOIN_ROOM | No outer-message sender observed; connection joins through the room WebSocket URL/query | No `webSocketMessage` branch | Enum/parser only; default legacy receiver if received. No message-level join handler. |
| ROOM_STATE | No active sender found | No Worker input branch or current output found | Enum/parser only; default legacy receiver. Current room state arrives in SESSION/SNAPSHOT instead. |
| PLAYER_JOINED | Worker → existing room peers; `MatchRoom.fetch` | Broadcast after the joining socket/player row is established; no event sequence increment in this broadcast | Router default → legacy receiver, which may create a RemotePlayer from a non-local sender. No dedicated typed PLAYER_JOINED case. |
| PLAYER_LEFT | Worker → room peers; `MatchRoomBase.webSocketClose` | Marks the player disconnected and broadcasts the player ID/reason | Router default → `RemotePlayerActionReceiver.handlePlayerLeft`; that path removes the RemoteHero from Actor/Mob target references, detaches Buffs and removes its sprite. This is a real gameplay cleanup path and must not be dropped during migration. |
| READY | Client → Worker; Worker also broadcasts READY | Sets the authenticated player's ready flag in SQL and broadcasts the message with senderId overwritten from the WebSocket attachment | Router default → legacy receiver; no explicit READY handler in MessageRouter. |
| MATCH_START | No active outer-message producer found | No Worker ingress branch or current outer output found | Enum/parser only; default legacy receiver if received. Do not confuse with a future match-start event. |
| ACTION | Client → Worker; both local player and delegated combat authority send ACTION envelopes | `MatchRoomActions.handleAction` → transaction/validator dispatch. Valid actions increment room sequence, persist `processed_actions` and `events`, send ACTION_ACCEPTED to the request owner and broadcast the accepted event. Invalid actions return ERROR; unknown/unaccepted action names retain the `INVALID_ACTION` default. | `MultiplayerManager.sendAction/sendAuthorityAction` serialize `action`, `data` and `heroStateJson`; Worker result returns as ACTION_ACCEPTED and/or EVENT_BATCH. Android uses `MessageRouter.applyAcceptedAction/handleEventBatchMessage` and full SNAPSHOT recovery where required. |
| LEVEL_DATA | Level publisher client → Worker | `handleLevelData` validates the complete native floor, publisher authority/rebase or action-bound mutation, stable IDs, native metadata and required mutation lock before persistence; success uses ACK and/or authoritative SNAPSHOT/broadcast paths | `MultiplayerManager.publishCurrentLevel`, `publishNativeWorldActorResult` and `publishNativeWorldMutation` serialize the native SPD level/state. Android applies resulting SNAPSHOT/EVENT_BATCH through MessageRouter. Never treat arbitrary clients as publishers. |
| LEVEL_READY | Each connected living client → Worker, after constructing the destination floor | `handleLevelReady` validates destination depth/branch/seed and native Hero state, persists `transitionReady:{playerId}`; the room opens the barrier only when the publisher's destination snapshot and every living connected peer are valid | `MultiplayerManager.sendLevelReady`; resulting transition completion is communicated by authoritative SNAPSHOT. |
| LEVEL_PUBLISHER_CHANGED | Worker → room peers; `MatchRoomBase.levelPublisherStateMessage` | Server-generated control message with publisherId, monotonic term and reason; not a client route | `MessageRouter.handleLevelPublisherChanged` validates/applies generation and may publish a publisher rebase. |
| ACTION_ACCEPTED | Worker → request owner | Correlated accepted result with requestId and committed sequence; duplicate same-owner request can return its original accepted result | Manager clears pending request; MessageRouter advances sequence and applies immediate accepted result on the render thread. |
| COMBAT_REQUEST | Worker → selected authority client; senderId SERVER | Created by ATTACK delegation after checking attacker pre-state/target identity and reserving pendingCombat; it is not accepted as an outer inbound message | `MessageRouter.handleCombatRequest` dispatches original Java SPD combat on the render thread. Authority reports the result through ACTION with SYNC_MOB_STATE or SYNC_PLAYER_COMBAT; not through an outer COMBAT_REQUEST echo. |
| EVENT_BATCH | Worker → clients | Ordered persisted event rows, reconnect gap replay and FOV-broadcast accepted events; records carry sequence/eventType/action | `MessageRouter.handleEventBatchMessage` owns typed sequenced application on the render thread. Legacy receiver explicitly rejects this envelope and requests resync; it is not a second event parser. |
| SNAPSHOT | Worker → client | Full room/player/Mob/level state from reconnect, RESYNC or a publisher/transition snapshot | `MessageRouter.handleSnapshotMessage` restores native world state; sequence is marked applied only after successful restore. |
| ACK | Worker → requesting publisher/client | Acknowledges accepted level/entity publication and can include stable entity ID mappings | Manager removes pending requests and `MessageRouter` calls `handleServerEntityAck` to register trusted server entity IDs. |
| RESYNC | Client → Worker | Reads authoritative event/player/Mob/level state and responds with SNAPSHOT; no new gameplay event is committed by the request | `MultiplayerManager.requestResync` sends lastSequence and rejectedSnapshotSequence; MessageRouter/WorldSnapshot restore path consumes the response. This audit does not redesign replay/resync. |
| RECONNECT | Client → Worker | Validates the stored session token; if the exact bounded event gap is available, sends EVENT_BATCH plus publisher state; otherwise sends full SNAPSHOT plus publisher state | `MultiplayerManager.sendReconnect` sends sessionToken/lastSequence. The reconnect result follows existing EventBatch/Snapshot paths. |
| MATCH_END | No active top-level server sender observed; current Worker emits it as an EVENT_BATCH event record | Stored as an event with eventType MATCH_END; no dedicated outer MATCH_END response path is used by current code | MessageRouter handles MATCH_END as an event inside EVENT_BATCH; outer MATCH_END is only enum vocabulary in this implementation. |
| LEAVE | Client disconnect/close is the active leave mechanism, not this outer enum | No `webSocketMessage` branch; `webSocketClose` persists connected=false and emits PLAYER_LEFT | Enum/parser only; default legacy receiver if sent. Do not infer that sending LEAVE is supported. |
| PING | Client → Worker; Worker → same socket for pong | Explicit inbound branch returns PING with payload `{pong:true}`; no room event sequence/persistence | Network liveness envelope. Router default falls through to legacy receiver; no dedicated typed ping callback identified in MessageRouter. |
| CHAT | Client → Worker → room broadcast | Explicit inbound branch broadcasts the authenticated envelope; inbound senderId is replaced by attachment identity. No gameplay sequence/persistence branch | Router default falls through to legacy receiver; no dedicated typed chat UI handler identified in MessageRouter. |
| ERROR | Worker → request owner/client | Rejection paths carry a stable requestId where available and current sequence; action-specific validators supply error codes | Manager removes pending requests and may request resync for rejected stateful operations; `MessageRouter.handleErrorMessage` itself is intentionally empty. |

**Ingress classification at the 10-B baseline:** inbound = RECONNECT, LEVEL_DATA, LEVEL_READY, ACTION, READY, RESYNC, PING and CHAT. Known but non-inbound = the other 17 names above. The latter set intentionally mixes server outputs and declared-but-unimplemented client message placeholders; it must not be described as 17 server-only messages.

### 11.2 Envelope serializer/parser and rejection behavior

The schema requires `protocolVersion`, `messageType` and `payloadJson`; requestId, sequence and senderId are optional. The outer payload remains an encoded JSON string.

- Java `NetworkMessage.parseJson` maps malformed JSON to ERROR/MALFORMED_JSON, a non-object root to ERROR/INVALID_MESSAGE_OBJECT and an unknown enum name to ERROR/UNKNOWN_MESSAGE_TYPE. It currently defaults a missing protocolVersion/messageType/payloadJson and tolerates object/array payload values for compatibility; it does not yet enforce the full required envelope contract or reject a mismatched protocol version. These are client-parser parity tasks, not proof of schema compliance.
- At the Worker baseline, malformed outer JSON was caught and returned an ERROR containing the runtime exception text; an invalid/no session attachment and binary frames were silently ignored; unknown or known-but-unhandled message types fell through without a response; protocolVersion and nested payload JSON were not checked before dispatch.
- The 10-B Worker admission gate now performs runtime checks before the existing dispatch: authenticated attachment, text frame, object envelope, required field/optional field types, exact protocol 1.0.0, known/inbound message classification and syntactically valid payloadJson. It overwrites senderId only after admission.
- Stable admission errors are SESSION_REQUIRED, UNSUPPORTED_FRAME_TYPE, MALFORMED_MESSAGE_ENVELOPE, INVALID_MESSAGE_ENVELOPE, UNSUPPORTED_PROTOCOL_VERSION, UNKNOWN_MESSAGE_TYPE, UNSUPPORTED_MESSAGE_TYPE and MALFORMED_MESSAGE_PAYLOAD. Unexpected handler exceptions retain their existing exception-message ERROR contract because the rollback/transaction tests assert it; all envelope admission errors are intercepted earlier. A non-empty requestId is echoed on validation errors where it was safely parsed.
- This gate does not replace action-specific validators, authorize the sender beyond the accepted WebSocket attachment, or add any new message/action support. All existing ACTION/LEVEL_DATA/LEVEL_READY handlers keep their existing fail-closed validation and persistence rules.

### 11.3 NetworkActionType — all 23 Worker branches

All actions travel inside the outer ACTION envelope unless noted otherwise. `MultiplayerManager.sendAction/sendAuthorityAction` serialize action name/data/heroStateJson. The server's `handleActionInTransaction` starts with `actionValid = false` and `INVALID_ACTION`; each action branch must prove its own pre-state, owner, target and native result. Many stateful world actions are only intents: they require the matching follow-up LEVEL_DATA native mutation snapshot before the pending native mutation can be committed.

| Action | Java producer / wire path observed | Worker ACTION branch and authority/validation boundary | Android result path |
|---|---|---|---|
| MOVE | `MultiplayerActionDispatcher.onNativeMovementStep` → sendAction(MOVE), followed by `publishNativeWorldMutation` | `isValidNativeMoveIntent` checks geometry/occupancy/root/pre-state; MOVE_INTENT_ACCEPTED is only an intent. Final floor/Hero mutation is checked by native world-mutation and action-cost validators under the player's mutation lock. | ACTION_ACCEPTED then EVENT_BATCH; publisher/native snapshot reconcile through MessageRouter. |
| ATTACK | Native Hero combat path → sendAction(ATTACK); remote-target requests can be delegated to publisher/defender | `isValidNativeAttackIntent`, trusted attacker/target pre-state and pendingCombat authority. Worker sends COMBAT_REQUEST to selected authority; SYNC_MOB_STATE/SYNC_PLAYER_COMBAT result branches validate native outcomes, stable target identity, owner and native bundles. | MessageRouter resolves COMBAT_REQUEST through original SPD Java combat; ACTION_ACCEPTED/EVENT_BATCH apply accepted outcomes; incomplete native Mob/world results request existing SNAPSHOT resync. |
| PICKUP | `MultiplayerActionDispatcher.onHeroPerformAction` queues native PICKUP mutation with heap/item IDs and item bundle | `isValidNativePickupIntent`, complete level snapshot, exact heap/item identity, owner and durable `reserveNativeLootClaim`; accepted pickup intent is finalized by matching LEVEL_DATA inventory/heap mutation validation. | Native local SPD action plus ACTION_ACCEPTED/EVENT_BATCH; MessageRouter applies authoritative world result or snapshot. |
| DROP | Native Item drop/split callback → ACTION(DROP) and native mutation snapshot | `isValidNativeDropIntent` checks source inventory instance, quantity, result identity and destination heap; native mutation lock and follow-up LEVEL_DATA verify final inventory/heap delta. | ACTION_ACCEPTED/EVENT_BATCH and native snapshot reconciliation. |
| THROW | Native MissileWeapon projectile callback → ACTION(THROW), optionally with native impact combat data | `isValidNativeThrowIntent`; projectile hit/impact uses strict projectile combat intent/result, target/heap identity and loot/bundle validation. Publisher/authority rules apply for Mob damage. | Native projectile callback and accepted event; snapshot resync when an exact native world delta cannot be applied. |
| EQUIP | Native equipment action → ACTION(EQUIP) with complete Hero state/equipment identity | Shared EQUIP/UNEQUIP branch calls `isValidNativeEquipmentIntent`; trusted previous Hero bundle, item identity/slot/quickslot and resulting native state must match. | ACTION_ACCEPTED/EVENT_BATCH; native Hero state is reconciled by accepted state/snapshot. |
| UNEQUIP | Native equipment action → ACTION(UNEQUIP) | Same explicit equipment branch and strict native equipment/quickslot validator as EQUIP; not a generic inventory toggle. | ACTION_ACCEPTED/EVENT_BATCH; native Hero state reconciliation. |
| OPEN_CHEST | Dispatcher validates the chest heap and queues a native world mutation | Dedicated OPEN_CHEST validation plus `isValidNativeWorldActionIntent`, exact chest identity and durable `claimed_chest_instances` ownership; final LEVEL_DATA mutation verifies heap/loot state. | ACTION_ACCEPTED/EVENT_BATCH; native snapshot recovery for un-restorable world effects. |
| BUY | Native WndTradeItem result submits ACTION(BUY) after native price/inventory outcome is known | `isValidNativeBuyIntent`, trusted Hero/level state and stable item claim via `reserveNativeLootClaim`; claimed item instance cannot be concurrently purchased. | ACTION_ACCEPTED/EVENT_BATCH and native inventory/heap reconciliation. |
| BUYBACK | Native Shopkeeper buyback result → ACTION(BUYBACK) | `isValidNativeBuybackIntent`; exact shop entity/item identity, quantity/value and durable item claim. | ACTION_ACCEPTED/EVENT_BATCH and native inventory/economy reconciliation. |
| SELL | Native Shopkeeper sale result → ACTION(SELL) | `isValidNativeSellIntent`; exact item instance/quantity/value and result item/shop state are checked against trusted saved inventory/economy state. | ACTION_ACCEPTED/EVENT_BATCH and native inventory/economy reconciliation. |
| INTERACT | `MultiplayerActionDispatcher` native interaction path; only approved Shopkeeper NPC interaction is enabled | Grouped world-action branch calls `isValidNativeWorldActionIntent`; target range/type and restricted inventory side effects are enforced. | ACTION_ACCEPTED/EVENT_BATCH; unsupported NPC/inventory effects reject before native execution or fail closed. |
| UNLOCK | `MultiplayerActionDispatcher` queues the native unlock mutation | Grouped world-action branch calls `isValidNativeWorldActionIntent`; native mutation metadata and post-state snapshot must match. | ACTION_ACCEPTED/EVENT_BATCH and native world snapshot. |
| LVL_TRANSITION | Dispatcher stair transition and `onNativePitFall` send ACTION(LVL_TRANSITION) | `canStartNativeFloorTransition` and `resolveNativeTransitionIntent`; durable pending barrier, publisher destination LEVEL_DATA and per-player LEVEL_READY gate. | ACTION_ACCEPTED/EVENT_BATCH plus authoritative destination SNAPSHOT. |
| MINE | Dispatcher verifies supported native terrain and queues sourceTerrain mutation | Grouped world-action branch calls `isValidNativeWorldActionIntent`; branch/terrain and mutation inventory/buff/heap deltas are validated. Unsupported branch transitions reject. | ACTION_ACCEPTED/EVENT_BATCH and matching native LEVEL_DATA snapshot. |
| ALCHEMY | AlchemyScene/native resolved recipe publisher sends ACTION(ALCHEMY) | `isValidNativeAlchemyIntent` checks ingredients, alchemy energy, output identity/location and inventory/heap mutation. | ACTION_ACCEPTED/EVENT_BATCH; native alchemy result and snapshot. |
| USE_ITEM | `NativeItemActionPublisher.execute` sends only supported native EAT/DRINK consumptions as USE_ITEM; unsupported item effects reject locally | `isValidNativeUseItemIntent` checks supported action, item instance/class/quantity and trusted Hero/level inventory state. | ACTION_ACCEPTED/EVENT_BATCH; supported item consumption only. |
| USE_ABILITY | Native class armor-ability callback sends ACTION(USE_ABILITY) | `isValidNativeAbilityIntent` checks class/armor identity, charge before/after and native action cost. | ACTION_ACCEPTED/EVENT_BATCH and native Hero state reconciliation. |
| WAIT | Mapped by `NetworkActionBridge` for HeroAction classes not otherwise mapped; this fallback currently means an unrecognized action can become WAIT | Explicit WAIT branch requires an ALIVE player and assigns the native action cost. It does not prove an arbitrary unmapped HeroAction was a genuine native wait. | ACTION_ACCEPTED/EVENT_BATCH. The Java fallback-to-WAIT is a fail-closed mapping risk to test and resolve before claiming complete producer parity. |
| REVIVE | `MultiplayerManager.finishPendingUnblessedAnkhRevival` and native Ankh callbacks send ACTION(REVIVE) | Blessed/Unblessed Ankh state checks, HP/HT/position/shield/Buff pre-state, `isValidNativeHeroStateJson`, loot snapshot validation for Unblessed Ankh and exactly-once state update. | ACTION_ACCEPTED/EVENT_BATCH; restore the authoritative Hero/loot result. |
| SYNC_HERO_STATE | `NativeHeroBuffTickPublisher.publish` emits native BUFF_TICK state; lethal Poison may be enriched with LifeLink deltas | `isValidNativeHeroBuffTick`, source Buff allowlist, actor clock/pre-state, trusted Hero snapshot and LifeLink Mob deltas. Buff/Poison batch uses the atomic native-action transaction wrapper. | ACTION_ACCEPTED/EVENT_BATCH and authoritative Hero/Mob state; invalid or incomplete restoration uses existing resync. |
| SYNC_MOB_STATE | Native Mob damage/combat authority publisher sends the post-SPD Mob result | Validates pending combat identity/authority, stable Mob entity ID, trusted before/after Mob bundle, geometry, Buff/shield state, loot/rewards and secondary Mob deltas. Combat authority result is committed atomically. | ACTION_ACCEPTED/EVENT_BATCH; MessageRouter applies accepted state or requests a full snapshot where scalar data is insufficient. |
| SYNC_PLAYER_COMBAT | Defender/authority client reports native PvP result through sendAuthorityAction/sendAction | Validates pending request and defender authority, attacker/defender trusted Hero before-state, HP/shield/Ankh transitions, Buffs and merged native Hero state. Atomic transaction wrapper applies to delegated combat result. | ACTION_ACCEPTED/EVENT_BATCH applied by MessageRouter to local/remote Hero replicas. |

**Important distinctions:** the 23 rows establish explicit Worker ACTION branches and the validators they call; they do not promise every item, NPC, Buff, class ability, weapon mode or native side effect is supported. The Java source gates unsupported subcases; the server must continue to reject them. `NetworkActionBridge` currently maps only a subset of HeroAction classes and falls back to WAIT for the rest, so a branch in the Worker does not establish a legitimate Java producer.

### 11.4 Phase 10-B implementation and remaining client parity

The Worker admission gate is implemented in `server/src/protocol/message-admission.ts` and applied at the top of `MatchRoomMessages.webSocketMessage`. `server/scripts/validate-phase10-routing.mjs` and `message-admission.test.ts` verify the 25-way message classification, exact eight Worker route branches, all 23 explicit Worker action branch names and rejection behavior for malformed/unsupported/unknown envelopes.

This does **not** yet consolidate the client path. `MessageRouter` still has a default route to `RemotePlayerActionReceiver`; that receiver contains required PLAYER_LEFT Actor/Mob cleanup and legacy Mob/snapshot parsing. Do not delete or relocate it before behavior-specific parity tests exist. The Android `NetworkMessage.parseJson` permissive required-field/version defaults and the NetworkActionBridge fallback-to-WAIT remain separate typed-producer/parser parity work. Do not change replay/resync semantics here.

