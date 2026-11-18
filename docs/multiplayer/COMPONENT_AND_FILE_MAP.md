# Multiplayer Component and File Map

## 1. How to use this map

This document identifies the main files that carry multiplayer behavior and explains relationships that matter when changing them. It is not a claim that every file in the 1,956-file repository has been documented at symbol level; Batch 2 adds a broader source-file reference.

All paths are repository-relative. Reopen each source file at the active branch HEAD before editing because this is a maintained index, not a replacement for code review.

## 2. Multiplayer Java package

Base path: core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/

The audited tree contains 36 Java files after the Phase 14-A transport split:

| File | Responsibility observed in source | Related components / change impact |
|---|---|---|
| BluetoothTransport.java | Core transport facade; NativeBluetoothProvider, provider setter/getter, server/client start, send, disconnect. | NetworkTransport, TransportCallback, AndroidBluetoothProvider; changes affect platform adapter and session startup. |
| CoopMode.java | Co-op GameMode rule descriptor. | GameMode, Worker rules, UI labels; descriptor alone does not enforce a room rule. |
| DeathmatchMode.java | Deathmatch GameMode rule descriptor. | GameMode, Worker match-end/scoring/FOV rules; validate all rules on server/client. |
| EmbeddedMatchAuthority.java | Small embedded/local authority with start() and processAction(...). | LAN/local host assumptions; not the Worker or a complete native authority. |
| GameMode.java | Common interface for mode descriptors. | All mode implementations and UI/serialization mappings. |
| InternetTransport.java | TCP/TLS WebSocket client implementing NetworkTransport; performs bounded connect/upgrade, verifies TLS hostname, validates the upgrade, reads/writes RFC 6455 frames and dispatches typed messages. | Worker endpoint and TransportCallback; 14-A covers wire correctness, while manager callback/retry/thread lifecycle stays in 14-B. |
| WebSocketHandshake.java | Strict HTTP/1.1 WebSocket upgrade request/response helper, request-target construction, Bearer header validation and Sec-WebSocket-Accept calculation. | InternetTransport, Worker `fetch()` room path and session-token admission; test positive and negative upgrade responses. |
| WebSocketFrameCodec.java | Bounded RFC 6455 server-frame parser, text-fragment assembler, strict UTF-8/close validation and masked client-frame writer. | InternetTransport; tests must cover lengths, masking, RSV/opcodes, fragmentation, interleaved controls, ping/pong and close. |
| LANTransport.java | TCP server/client and UDP host discovery; sends network messages and exposes connected state. | Setup scene, host/client topology, socket lifecycle, discovery, peer compatibility and multi-device tests. |
| LootClaimManager.java | In-memory claim/release/clear helper scoped by depth/branch and heap/item/player. | Server durable claims and pickup/drop logic; not a substitute for durable Worker claims. |
| MessageRouter.java | Exhaustive 25-value client message router; typed PLAYER_JOINED/PLAYER_LEFT/READY/PING handlers, render-thread ROOM_STATE and MATCH_START delivery, explicit non-inbound decisions |
| MessageType.java | Java message-type enum. | NetworkMessage, MessageRouter, Worker and protocol schema; additions/removals require cross-layer parity audit. |
| MultiHeroManager.java | Gets all active Heroes and nearest Hero for native behavior. | Dungeon, local Hero, remote Hero registry and Mob AI target selection. |
| MultiplayerActionDispatcher.java | Native Hero action hook and supported NPC/pickup/movement/pit-fall dispatch. | Hero, NetworkActionType, MultiplayerManager, Worker validators. |
| MultiplayerManager.java | Client session singleton, transport/reconnect lifecycle, room operations, sticky lifecycle gate, player/hero registry, sequence/resync, action sends and native level publication. | Broad client integration impact; room operations and local snapshot readiness must remain distinct and be regression-tested. |
| RoomLobbyState.java | Validated authoritative ROOM_STATE roster and revision shared by the lobby UI. | Keep parsing fail-closed; validate member count/capacity, unique IDs, owner identity and allReady consistency. |
| RoomMemberInfo.java | Immutable client-side room roster member data. | Do not treat roster state as local native snapshot application or infer authority from display data. |
| MultiplayerRunProgress.java | Serialize/validate/restore run progression: statistics, catalog, badges, generator/limited drops, rooms, ring identification, chapters, generated levels, dropped items and quickslot placeholders. | Snapshot/reconnect persistence; preserve native Bundle semantics. |
| NativeCombatAuthorityPolicy.java | Policy for native combat path selection. | Hero, MessageRouter, MultiplayerManager; align ownership rules with Worker authorization. |
| NativeCombatJson.java | Strict JSON writer/helper for native combat payloads. | Hero, Mob, combat schema and Worker parser; wire changes require schema and negative tests. |
| NativeHeroBuffTickPublisher.java | Captures native Hero timed-effect tick state and publishes before/after information. | Actor, Hero, Worker buff validators, NativeCombatRuntimeIntegrationTest; newly allowed effects need full side-effect coverage. |
| SpiritBow.java | Native SpiritArrow generation and asynchronous projectile completion; multiplayer callback context is optional so solo SPD remains native. | SnipersMark, Hero pending report, stable Bow/Mob IDs; publisher authority result, correlated event commit and stable-ID requester reconciliation are covered by Backend/JVM regressions. SPEED volleys and non-Mob targets remain fail-closed. |
| SnipersMark.java | Local mark action/expiry, SpiritBow selection, marked target selection and bonus. | `Hero.beginNativeSpiritArrowAttack`, `SpiritArrow.cast`, stable entity mapping, cancel/resync; expiry and action are separate behaviors. |
| NativeItemActionPublisher.java | Executes/wraps selected native item actions and publishes resulting state. | Hero, NativeItemUse, item classes, inventory and Worker mutation validators. |
| NativeItemUse.java | Multiplayer native item-action context, support allowlist, preflight/rejection/finalization. | Food/Potion/Scroll/Wand/Item actions, NativeItemActionPublisher, Worker; ambiguous side effects stay fail-closed. |
| NativeMobCombatDelta.java | Captures/serializes secondary Mob changes during native combat. | Hero, Mob, WorldSnapshot, Worker combat delta validators, rewards/loot. |
| NetworkActionBridge.java | Optional mapping for ten explicitly supported HeroAction classes; null/unmapped actions return empty. | MultiplayerActionDispatcher rejects an empty mapping through the native Hero warning/abort path; no WAIT fallback. Worker branch presence does not prove every action subcase. |
| NetworkActionType.java | Gameplay action enum. | Native hooks, Manager, schema, Worker dispatcher and tests; every action needs end-to-end mapping or explicit rejection. |
| NetworkMessage.java | Canonical protocol 1.0.0 envelope, strict generic parser/serializer and explicitly scoped LAN/Bluetooth legacy parsers. | Internet uses parseJson; LAN/Bluetooth use only their tested compatibility methods; Worker and schema remain canonical. |
| NetworkTransport.java | Common connect/send/disconnect/connected/type interface. | All transport implementations and MultiplayerManager; interface changes require every implementation and tests. |
| PlayerFOV.java | Calculates local player field of view. | Hero, Level, competitive visibility policy, server broadcastWithFOV. |
| PvPMode.java | PvP rule descriptor. | GameMode, server ownership/target rules, FOV and UI. |
| RemotePlayer.java | Remote participant model, native Hero replica and server-authored isReady room metadata |
| RemotePlayerActionReceiver.java | Retained native RemoteHero setup/legacy helper boundary; no longer the top-level default handler for unrelated outer messages |
| SPDLevelSnapshot.java | Captures native level, tiles, transitions, Mobs, buffs, items, inventory, quickslots, heaps, plants, traps and blobs. | Level, Hero, Mob, Worker full-snapshot validator, protocol definitions and WorldSnapshot. |
| SurvivalMode.java | Survival GameMode rule descriptor. | GameMode, Worker lifecycle/score/rules and UI; enforce rather than merely expose properties. |
| TransportCallback.java | Transport connected/disconnected/message/error callbacks. | Every transport and MultiplayerManager; callback threading/order must remain explicit. |
| WorldSnapshot.java | Native snapshot validation, world reconciliation, runtime identity preservation, rollback baseline and failure restore. | SPDLevelSnapshot, Level, Actor, Mobs, heaps, traps, plants, blobs and render thread; high-risk cross-cutting file. |

## 3. Native engine integration points

These files are outside the multiplayer package but part of the feature.

| File | Multiplayer integration observed | Change impact |
|---|---|---|
| core/.../actors/Actor.java | Shared-actor classification, publisher/replica scheduler gates, deferred actor-result publication, multiplayer cooldown restoration, timed-buff hooks. | Any scheduler, spend, actor add/remove, cooldown or tick callback edit may change all shared turns/effects. Run runtime integration and server tick tests. |
| core/.../actors/Char.java | Base native combat, damage, shields, buffs and movement; Hero/Mob integrations extend its behavior. | Combat/buff changes can alter Hero and Mob side effects even without direct multiplayer imports in Char. |
| core/.../actors/hero/Hero.java | Native action execution, attack/player-state/world-mutation publication, before-state capture, dispatcher calls, multiplayer death/revival/Ankh and unsupported-action handling. | Very high impact across native actions, items, cooldown, inventory, combat, death and resync. Trace every callback. |
| core/.../actors/hero/RemoteHero.java | Native remote-Hero representation used for delegated native actions/combat. | Combat formulas, inventory bundle, scheduler and remote identity/restore. |
| core/.../actors/mobs/Mob.java | Native Mob AI/targeting includes remote Heroes; restore AI/timing; queue/flush Hero damage; publish combat/periodic changes. | High impact across AI, scheduler, damage authority, loot and secondary effects. |
| core/.../levels/Level.java | Native Level metadata export/restore and branch-level integration. | Geometry, metadata, custom visuals, respawner and floor progression affect snapshots. |
| core/.../Dungeon.java | Seed, run and level lifecycle are central despite no direct MultiplayerManager reference in inspected Dungeon.java. | Initialization, seed timing, depth/branch, save/load and switchLevel affect full session. |
| core/.../scenes/TitleScene.java | Multiplayer entry navigation. | Entry visibility, localization, scene navigation. |
| core/.../scenes/MultiplayerTransportScene.java | Internet/LAN/Bluetooth selection. | Visible availability and labels must match verified status. |
| core/.../scenes/MultiplayerSetupScene.java | Transport construction, room/IP defaults, discovery/manual IP, host/client selection, session start. | Connection state, permissions, input, false-success UI. It currently proceeds to HeroSelect immediately after startSession; inspected LAN/Bluetooth host-start exceptions are swallowed. |
| core/.../scenes/HeroSelectScene.java | Applies authoritative seed before native run generation. | Preserve ordering relative to Dungeon generation when startup changes. |
| core/.../scenes/GameScene.java | Publishes current level/LEVEL_READY, ticks `WndMultiplayerLobby`, and gates native turns/cell input until authoritative PLAYING. | Render-thread safety, scene recreation, FOV, map visuals, snapshot publication and gameplay gating. |
| core/.../windows/WndMultiplayerLobby.java | In-game room modal: roster/readiness, host Start/readiness reset, Leave, connection errors and retry/exit state. | Keep every action bound to manager requests and authoritative roster state; do not make client display state authoritative. |
| core/.../scenes/InterlevelScene.java | Completes a multiplayer unblessed-Ankh revival continuation in the inspected flow. | Death/revive and scene transition correctness. |
| android/.../multiplayer/AndroidBluetoothProvider.java | Android Bluetooth server/client socket adapter for core provider interface. | Permission flow, lifecycle, threading and provider registration must be checked together. |

## 4. Backend, protocol, build and CI map

| Path | Role | Change impact |
|---|---|---|
| server/src/index.ts | 35-line stable Wrangler Worker entry and compatibility facade; re-exports the default router, historical public API and final `MatchRoom` class. | Preserve root path, default/named exports and Wrangler `main`. |
| `server/src/worker.ts` | Default Cloudflare Worker fetch router; resolves `/room/{roomCode}/...` to the `MATCH_ROOM` Durable Object and preserves the default API response. | Keep the handler behavior aligned with `entrypoint.test.ts`; do not change the Wrangler main path. |
| `server/src/entrypoint.test.ts` | Worker entry integration tests for Durable Object routing, Request forwarding, default-room fallback and the root `MatchRoom` export. | Keep these separate from claims of live Worker/deployment testing. |
| server/src/protocol/types.ts | Env, NetworkMessage and SessionData declarations moved from the original entry. | Wire shape is unchanged; keep Java/schema/server contracts aligned if a future field changes. |
| server/src/protocol/message-admission.ts | Worker outer-message classifier and fail-closed envelope admission. | Keep the exact 12 inbound and 13 known non-inbound classifications, required/optional field checks, version check and nested payload validation aligned with live routes. |
| server/src/protocol/message-admission.test.ts | Focused tests for route classification, envelope shape/types, version, malformed payload and safe request correlation. | Add positive/negative cases whenever the admission contract changes. |
| server/src/match-room/base.ts | Shared room state/SQL fields and foundational WebSocket close/broadcast methods. | Do not duplicate room state between layers. |
| server/src/match-room/persistence.ts | SQLite schema/init, claimed item migration and fallback level generation. | Preserve schema, migrations, SQL and initialization order. |
| server/src/match-room/combat.ts | Pending combat reservation/reconciliation, combat position checks, LOS and FOV. | Preserve authority checks, lock expiry and FOV behavior. |
| server/src/match-room/snapshots.ts | Level snapshots, floor-transition finalization and match-end rules. | Preserve event sequencing and full snapshot contents. |
| server/src/match-room/actions.ts | Reconnect, level data/ready and native action request handlers. | ACTION remains sequential in one method; do not reorder SQL writes or event publication. |
| server/src/match-room/messages.ts | WebSocket frame/session checks, fail-closed envelope admission, message dispatch and error boundary. | Preserve the 12 explicit inbound routes, trusted attachment-derived senderId and existing handler-exception contract. |
| server/src/match-room/lifecycle.ts | Lifecycle-v1 room membership, create/join/leave/ready/start/cancel, room-state roster/snapshot delivery, capacity and owner/publisher handoff. | Preserve transactionSync boundaries, owner/publisher checks, seed/sequence/snapshot gates, legacy-room opt-in and room closure semantics. |
| server/src/match-room/index.ts | The single exported MatchRoom Durable Object class; owns constructor/alarm/HTTP fetch. | Preserve class export name and Wrangler `class_name: MatchRoom`.
| server/src/validators/entity-identity.ts and floor-transitions.ts | Stable entity mapping, movement and floor transition validation. | Keep the original fail-closed rules and native transition assumptions. |
| server/src/validators/equipment.ts, item-state.ts and abilities.ts | Quickslots, equipment, item/buff bundle safety, use/status and ability validation. | Shared helper imports are explicit; avoid weakening item ownership or mutation checks. |
| server/src/validators/shop.ts and world-actions.ts | Buy/sell/buyback/shopkeeper and world action admission validators. | Preserve exact inventory, heap and action-cost transitions. |
| server/src/validators/inventory-claims.ts and inventory-economy.ts | Stable item/heap identity, durable claim helpers, locks, inventory tree/economy and mining validation. | Preserve branch scope, request idempotency, locks and item conservation. |
| server/src/validators/world-items.ts | DROP/PICKUP/THROW/projectile/alchemy validation and mutation helpers. | Keep all before/after comparisons and native side-effect checks. |
| server/src/validators/hero-buffs.ts, world-state.ts and combat-state.ts | Hero/Mob Buff ticks, world snapshots/turns, HP/damage, Ankh and combat deltas/events. | Preserve fail-closed native state contracts and existing test coverage. |
| server/src/util/seeded-rng.ts | Original deterministic SeededRNG helper. | Keep deterministic sequence compatibility.
| server/scripts/validate-spirit-arrow-schema.mjs | Static contract test for `SPIRIT_ARROW`, strict `spiritArrow` metadata and conditional ranged Mob rules. | Run in `npm test`; proves schema structure, not local projectile runtime or authority roundtrip. |
| server/scripts/validate-phase10-protocol-enums.mjs | Static ordered parity check between Java `MessageType`/`NetworkActionType`, JSON Schema and protocol version. | Run in `npm test`; proves wire vocabulary/version parity only, not Worker route or client-handler support. |
| server/scripts/validate-phase10-routing.mjs | Static guard for 25 Android route decisions, eight Worker ingress types, 17 known non-inbound values and 23 Worker ACTION branches |
| server/scripts/validate-phase10-action-contracts.mjs | Static Java/schema/Worker contract guard for all 23 action field inventories, Java-source-referenced versus Worker-only fields and native snapshot required fields |
| server/src/index.test.ts | Main backend validator/contract test suite, retained on the root `./index` import path. | Add focused positive/negative cases beside the affected validator/action domain. |
| server/src/native-pickup-side-effect.test.ts | Focused pickup side-effect policy regressions. | Update for pickup preflight/side-effect changes. |
| server/scripts/validate-phase7-native-mutation-schema.mjs | Static action-metadata/schema validation. | Update alongside schema/validator contract when necessary. |
| server/package.json and package-lock.json | Backend scripts and dependency lock. | Lockfile changes must correspond to manifest changes; npm ci must work. |
| server/tsconfig.json | TypeScript compilation configuration. | Affects backend source/test typing. |
| server/wrangler.jsonc | Worker entry, Durable Object binding and SQLite migration config. | Class/binding/migration changes need deploy and storage compatibility review. |
| protocol/schema.json | Shared outer message envelope, NativeActionEnvelope.oneOf and 23 action-specific data-field schemas. | Schema changes require Java parser/serializer, Worker validator, tests and docs updates. |
| protocol/action-data-contracts.json | Source-backed per-action Worker field, validator, native producer and Java/Worker field-origin inventory. | Keep synchronized with the matching Worker branch, Java producer and schema definitions. |
| .github/workflows/multiplayer-ci.yml | Backend and Android branch-validation workflow. | Trigger path/toolchain/job changes affect exact commit evidence. |
| .github/workflows/deploy-server.yml | Cloudflare Worker deployment automation. | Auto-deploy currently only from master/main server changes or manual dispatch; not this branch push. |
| settings.gradle, build.gradle, core/build.gradle, android/build.gradle, gradle.properties, gradlew and wrapper files | Gradle module/toolchain/native dependency configuration. | Affects CI and all application targets. |
| android/src/main/AndroidManifest.xml | Android permissions and application entry. | Transport/permission work must update manifest and runtime permission handling where required. |

## 5. Test-file map

- `core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/InternetTransportProtocolTest.java` — Phase 14-A strict upgrade/status/credential and frame-boundary suite plus localhost mock WebSocket exchange; 17 tests PASS locally (17/17). Full core test run: 158/158 across 11 JUnit XML reports.

### Core JVM tests

- core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MultiplayerEntityIdentityTest.java — stable entity identity.
- .../MultiplayerItemIdentityTest.java — stable item identity.
- .../MultiplayerLevelMetadataTest.java — level metadata export/restore.
- .../NativeCombatAuthorityPolicyTest.java — native combat authority policy.
- .../NativeCombatRuntimeIntegrationTest.java — large native runtime integration suite; inspect individual tests and fixtures rather than treating the file-level pass as proof of every possible runtime path.
- .../NativeItemNpcInteractionPolicyTest.java — native item/NPC interaction policy.
- core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/messages/ArabicHandlerTest.java — Arabic handler regression tests, not general multiplayer acceptance.

### Backend tests

- server/src/index.test.ts — broad validation/combat/world snapshot/item/economy/claims/Mob state tests.
- server/src/native-pickup-side-effect.test.ts — focused native pickup side-effect policy.
- server/src/protocol/message-admission.test.ts — focused Worker envelope admission and message-direction tests.
- server/scripts/validate-phase7-native-mutation-schema.mjs, `validate-phase10-protocol-enums.mjs` and `validate-phase10-routing.mjs` — static native/schema/protocol/route contracts run before Vitest.

Mirrored TypeScript/JavaScript outputs may execute the same source cases more than once. Report executions separately from unique source scenarios.

## 6. Dependency/change-impact map

| If changing… | At minimum inspect… |
|---|---|
| Message envelope/type | NetworkMessage, MessageType, NetworkActionType, MessageRouter, transport serializers, Worker message branches, protocol schema, server tests |
| Transport connect/framing | NetworkTransport, all transports, TransportCallback, MultiplayerManager, MultiplayerSetupScene, server fetch/WebSocket methods, platform permission/provider setup |
| Snapshot fields | SPDLevelSnapshot, WorldSnapshot, Level/Hero/Mob bundles, Worker full-snapshot validator/storage, schema, snapshot tests |
| Native combat | Char, Hero, Mob, Actor, combat authority helpers, MessageRouter, Worker pending-combat/validators, runtime integration tests |
| Buff/timed effect | Native Buff class, Actor, Char/Mob/Hero tick path, NativeHeroBuffTickPublisher, serialization, Worker buff validators, positive/negative runtime tests |
| Inventory/item/economy | Native item class/action hook, NativeItemUse, NativeItemActionPublisher, MultiplayerActionDispatcher, SPDLevelSnapshot, Worker intent/delta validators, stable IDs/claims, schema/tests |
| Floor transition | Hero, Level, Dungeon, InterlevelScene, MultiplayerManager, MessageRouter, Worker pending-transition/alarm, schema/tests |
| Player visibility/PvP | PlayerFOV, Hero, Mob, broadcastWithFOV, mode descriptors, Worker rule admission, scene updates, FOV tests |
| Setup/UX | TitleScene, transport/setup scenes, message resources, transports, connection callbacks, platform permissions, physical multi-device evidence |
| Persistence/reconnect | MultiplayerRunProgress, SPDLevelSnapshot, WorldSnapshot, Worker SQL/migrations, event/sequence logic, reconnect/snapshot handlers, idempotency/restore tests |
| Gradle/platform build | settings.gradle, root build.gradle, core/platform module build files, manifest/native packaging, CI workflow, platform setup docs |

## 7. High-risk files

- `server/src/index.ts` — stable Wrangler entry and compatibility facade; `server/src/worker.ts` owns default request routing; `server/src/match-room/` owns the shared Durable Object class layers.
- WorldSnapshot.java — complex native restore, entity reconciliation and rollback.
- MultiplayerManager.java — session, authority, sequence and stable player/entity identity hub.
- MessageRouter.java — exhaustive 25-value typed outer-message route; RemotePlayerActionReceiver.java — explicit native Hero setup/legacy helper only, not a generic message fallback.
- Hero.java, Mob.java, Actor.java, Level.java — native engine callbacks and scheduler behavior.
- protocol/schema.json — contracts can drift unless parser/validator tests enforce parity.

Do not make a large refactor of these files merely to improve documentation. Plan structural refactors separately and preserve active gameplay phase scope.


## Phase 10-E closeout (2026-11-14)

At SHA f2d79038d1e420461be7a1956471324de5c1ef74 / CI 43618725089, MessageRouter has 25 explicit route decisions and no catch-all forwarding to RemotePlayerActionReceiver. PLAYER_JOINED, PLAYER_LEFT, READY and PING are typed; CHAT is explicitly not routed to game state. RemotePlayer adds server-backed isReady metadata. The receiver remains available for explicit native Hero setup and legacy helper duties, including the render-thread-only setup helper that defers HeroSprite creation until GameScene exists.

The ACTION schema now has 23 action-specific field definitions. The source inventory tracks 361 Worker-consumed field names (346 source-referenced in the listed Java producer files, 15 Worker-only; static name presence is not proof of runtime serialization on every branch) and checks 18 required NativeLevelSnapshot fields. The ordinary npm test path runs the new validate-phase10-action-contracts.mjs guard. WAIT and USE_ABILITY remain declared but non-emitted by Android and fail-closed.

## Phase 11-B current responsibility map (2026-11-15)

- core/.../multiplayer/MessageRouter.java: render-thread EVENT_BATCH ordering, duplicate/conflict detection, contiguous watermark checks, per-event rollback and sequenced ACTION_ACCEPTED handling.
- core/.../multiplayer/MultiplayerManager.java: owns the last-applied sequence and contiguous commit API; RESYNC gates further incremental application until recovery.
- core/.../multiplayer/WorldSnapshot.java: validates/restores full world state and rejects stale snapshots before live mutation.
- server/src/match-room/actions.ts: canonical request fingerprinting, replay classification and ACTION transaction orchestration.
- server/src/match-room/persistence.ts: idempotent processed-action schema migration and request/authority receipt persistence.
- server/src/match-room/messages.ts and snapshots.ts: reconnect/RESYNC recovery paths and authoritative snapshot generation.
- server/src/match-room/lifelink-death.integration.test.ts: deterministic MatchRoom request replay/conflict/rollback tests, including regression constraints for reconnect behavior.

Phase 11-B remains closed at SHA `2574489ff25e6f1fedc1e21718161bc5a7a1b230` / CI 43731016036. Phase 12-A/B is CLOSED at `dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8` / CI 43921670336. Phase 13 is ACTIVE/PARTIAL: lifecycle-v1 room membership, Android session state, in-game `WndMultiplayerLobby`, validated roster, render-thread routing and native gameplay gate until PLAYING are implemented locally. Current evidence: backend 372 unique TypeScript source scenarios / 744 reported Vitest executions, real Durable Object SQLite 16/16, Android core JVM 140/140 and full Debug APK PASS. Remaining owner WebSocket-loss/member-rejoin and rendered emulator UI acceptance are open, as is exact-head CI for the next commit. Historical CI [44100890572](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44100890572) applies only to `7a75b493124f99a773b23d089a2ee8d3ded2ebd6`; Phase 22/23 production/device checks remain separate.
