# Multiplayer Protocol and Message Catalog

> Protocol/gameplay source-test baseline: bc6c46b03fee040ff20311adb473b19ff78e9bb7; exact code/test CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588). This catalog records the observed Java enums, JSON Schema, Worker routes and Android handlers. Phase 10 will complete the one typed event path; enum/schema parity alone does not mean consolidation is complete. Verify the live branch HEAD and its exact-head Actions run before editing.

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

The 22 Java action values are:

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

**Historical 9-C failure snapshot — 2026-11-12; superseded by Phase 9 completion on 2026-11-13.** At gameplay HEAD `9168284e67d353a956fc276e0ea8c00d1c685f1d`, [CI 43290836162](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43290836162) reported 654 passed / 4 failed mirrored Vitest executions. Those failures were subsequently resolved: publisher result commit and requester EVENT_BATCH are now covered, the forged-position negative test asserts the correlated ERROR, and Android accepted-event reconciliation is tested on two client worlds with different local Mob Actor IDs.

The gameplay/test baseline is `bc6c46b03fee040ff20311adb473b19ff78e9bb7`; exact code/test CI [43472587588 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43472587588). The source-level acceptance includes Backend 682/682 executions, Android JVM/Debug APK and three Workers-runtime Durable Object SQLite tests. Phase 9's support boundary and exclusions are recorded in `ROADMAP.md` and `TEST_MATRIX.md`; verify any later documentation-only branch commits against their own Actions run.



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
