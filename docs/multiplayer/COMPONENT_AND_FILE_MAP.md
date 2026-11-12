# Multiplayer Component and File Map

## 1. How to use this map

This document identifies the main files that carry multiplayer behavior and explains relationships that matter when changing them. It is not a claim that every file in the 1,956-file repository has been documented at symbol level; Batch 2 adds a broader source-file reference.

All paths are repository-relative. Reopen each source file at the active branch HEAD before editing because this is a maintained index, not a replacement for code review.

## 2. Multiplayer Java package

Base path: core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/

The audited tree contains 32 Java files:

| File | Responsibility observed in source | Related components / change impact |
|---|---|---|
| BluetoothTransport.java | Core transport facade; NativeBluetoothProvider, provider setter/getter, server/client start, send, disconnect. | NetworkTransport, TransportCallback, AndroidBluetoothProvider; changes affect platform adapter and session startup. |
| CoopMode.java | Co-op GameMode rule descriptor. | GameMode, Worker rules, UI labels; descriptor alone does not enforce a room rule. |
| DeathmatchMode.java | Deathmatch GameMode rule descriptor. | GameMode, Worker match-end/scoring/FOV rules; validate all rules on server/client. |
| EmbeddedMatchAuthority.java | Small embedded/local authority with start() and processAction(...). | LAN/local host assumptions; not the Worker or a complete native authority. |
| GameMode.java | Common interface for mode descriptors. | All mode implementations and UI/serialization mappings. |
| InternetTransport.java | Custom socket/TLS/WebSocket client implementing NetworkTransport. | Worker WebSocket endpoint, handshake/framing, manager callbacks; framing changes require server and integration tests. |
| LANTransport.java | TCP server/client and UDP host discovery; sends network messages and exposes connected state. | Setup scene, host/client topology, socket lifecycle, discovery, peer compatibility and multi-device tests. |
| LootClaimManager.java | In-memory claim/release/clear helper scoped by depth/branch and heap/item/player. | Server durable claims and pickup/drop logic; not a substitute for durable Worker claims. |
| MessageRouter.java | Central client message routing; handles session, snapshots, event batches, combat requests, accepted actions, acknowledgements, match end and errors. | NetworkMessage, MultiplayerManager, WorldSnapshot, RemotePlayerActionReceiver; default route to latter is a migration boundary. |
| MessageType.java | Java message-type enum. | NetworkMessage, MessageRouter, Worker and protocol schema; additions/removals require cross-layer parity audit. |
| MultiHeroManager.java | Gets all active Heroes and nearest Hero for native behavior. | Dungeon, local Hero, remote Hero registry and Mob AI target selection. |
| MultiplayerActionDispatcher.java | Native Hero action hook and supported NPC/pickup/movement/pit-fall dispatch. | Hero, NetworkActionType, MultiplayerManager, Worker validators. |
| MultiplayerManager.java | Client session singleton, mode, transport lifecycle, player/hero registry, sequence tracking, resync, stable Mob-ID mapping, action sends, seed and level publication. | Broad client integration impact; changes need lifecycle and cross-layer tests. |
| MultiplayerRunProgress.java | Serialize/validate/restore run progression: statistics, catalog, badges, generator/limited drops, rooms, ring identification, chapters, generated levels, dropped items and quickslot placeholders. | Snapshot/reconnect persistence; preserve native Bundle semantics. |
| NativeCombatAuthorityPolicy.java | Policy for native combat path selection. | Hero, MessageRouter, MultiplayerManager; align ownership rules with Worker authorization. |
| NativeCombatJson.java | Strict JSON writer/helper for native combat payloads. | Hero, Mob, combat schema and Worker parser; wire changes require schema and negative tests. |
| NativeHeroBuffTickPublisher.java | Captures native Hero timed-effect tick state and publishes before/after information. | Actor, Hero, Worker buff validators, NativeCombatRuntimeIntegrationTest; newly allowed effects need full side-effect coverage. |
| SpiritBow.java | Native SpiritArrow generation and asynchronous projectile completion; multiplayer callback context is optional so solo SPD remains native. | SnipersMark, Hero pending report, stable Bow/Mob IDs; local callback/target-moved cancellation JVM tests pass headlessly; authority result/requester reconciliation remains red. |
| SnipersMark.java | Local mark action/expiry, SpiritBow selection, marked target selection and bonus. | `Hero.beginNativeSpiritArrowAttack`, `SpiritArrow.cast`, stable entity mapping, cancel/resync; expiry and action are separate behaviors. |
| NativeItemActionPublisher.java | Executes/wraps selected native item actions and publishes resulting state. | Hero, NativeItemUse, item classes, inventory and Worker mutation validators. |
| NativeItemUse.java | Multiplayer native item-action context, support allowlist, preflight/rejection/finalization. | Food/Potion/Scroll/Wand/Item actions, NativeItemActionPublisher, Worker; ambiguous side effects stay fail-closed. |
| NativeMobCombatDelta.java | Captures/serializes secondary Mob changes during native combat. | Hero, Mob, WorldSnapshot, Worker combat delta validators, rewards/loot. |
| NetworkActionBridge.java | Maps native HeroAction types to NetworkActionType. | Hero, MultiplayerActionDispatcher, server action admission; enum mapping alone does not implement an action. |
| NetworkActionType.java | Gameplay action enum. | Native hooks, Manager, schema, Worker dispatcher and tests; every action needs end-to-end mapping or explicit rejection. |
| NetworkMessage.java | Protocol envelope fields, parser and version constant. | NetworkTransport, MessageRouter, Worker, schema; preserve typed validation and size/range rules. |
| NetworkTransport.java | Common connect/send/disconnect/connected/type interface. | All transport implementations and MultiplayerManager; interface changes require every implementation and tests. |
| PlayerFOV.java | Calculates local player field of view. | Hero, Level, competitive visibility policy, server broadcastWithFOV. |
| PvPMode.java | PvP rule descriptor. | GameMode, server ownership/target rules, FOV and UI. |
| RemotePlayer.java | Remote-player metadata and local Hero instance. | MultiplayerManager, RemotePlayerActionReceiver, MultiHeroManager, sprites and Mob targeting. |
| RemotePlayerActionReceiver.java | Legacy/general receiver and remote-Hero setup/state. | MessageRouter default route; overlapping with typed routing; remove/refactor only after every supported message has a tested typed handler. |
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
| core/.../scenes/GameScene.java | Publishes current level and sends LEVEL_READY when multiplayer active; refreshes remote Hero sprites and visuals. | Render-thread safety, scene recreation, FOV, map visuals and snapshot publication. |
| core/.../scenes/InterlevelScene.java | Completes a multiplayer unblessed-Ankh revival continuation in the inspected flow. | Death/revive and scene transition correctness. |
| android/.../multiplayer/AndroidBluetoothProvider.java | Android Bluetooth server/client socket adapter for core provider interface. | Permission flow, lifecycle, threading and provider registration must be checked together. |

## 4. Backend, protocol, build and CI map

| Path | Role | Change impact |
|---|---|---|
| server/src/index.ts | 35-line stable Wrangler Worker entry and compatibility facade; re-exports the default router, historical public API and final `MatchRoom` class. | Preserve root path, default/named exports and Wrangler `main`. |
| `server/src/worker.ts` | Default Cloudflare Worker fetch router; resolves `/room/{roomCode}/...` to the `MATCH_ROOM` Durable Object and preserves the default API response. | Keep the handler behavior aligned with `entrypoint.test.ts`; do not change the Wrangler main path. |
| `server/src/entrypoint.test.ts` | Worker entry integration tests for Durable Object routing, Request forwarding, default-room fallback and the root `MatchRoom` export. | Keep these separate from claims of live Worker/deployment testing. |
| server/src/protocol/types.ts | Env, NetworkMessage and SessionData declarations moved from the original entry. | Wire shape is unchanged; keep Java/schema/server contracts aligned if a future field changes. |
| server/src/match-room/base.ts | Shared room state/SQL fields and foundational WebSocket close/broadcast methods. | Do not duplicate room state between layers. |
| server/src/match-room/persistence.ts | SQLite schema/init, claimed item migration and fallback level generation. | Preserve schema, migrations, SQL and initialization order. |
| server/src/match-room/combat.ts | Pending combat reservation/reconciliation, combat position checks, LOS and FOV. | Preserve authority checks, lock expiry and FOV behavior. |
| server/src/match-room/snapshots.ts | Level snapshots, floor-transition finalization and match-end rules. | Preserve event sequencing and full snapshot contents. |
| server/src/match-room/actions.ts | Reconnect, level data/ready and native action request handlers. | ACTION remains sequential in one method; do not reorder SQL writes or event publication. |
| server/src/match-room/messages.ts | WebSocket message parsing and dispatch/error boundary. | Keep dispatcher awaiting extracted handlers within the original try/catch. |
| server/src/match-room/index.ts | The single exported MatchRoom Durable Object class; owns constructor/alarm/HTTP fetch. | Preserve class export name and Wrangler `class_name: MatchRoom`.
| server/src/validators/entity-identity.ts and floor-transitions.ts | Stable entity mapping, movement and floor transition validation. | Keep the original fail-closed rules and native transition assumptions. |
| server/src/validators/equipment.ts, item-state.ts and abilities.ts | Quickslots, equipment, item/buff bundle safety, use/status and ability validation. | Shared helper imports are explicit; avoid weakening item ownership or mutation checks. |
| server/src/validators/shop.ts and world-actions.ts | Buy/sell/buyback/shopkeeper and world action admission validators. | Preserve exact inventory, heap and action-cost transitions. |
| server/src/validators/inventory-claims.ts and inventory-economy.ts | Stable item/heap identity, durable claim helpers, locks, inventory tree/economy and mining validation. | Preserve branch scope, request idempotency, locks and item conservation. |
| server/src/validators/world-items.ts | DROP/PICKUP/THROW/projectile/alchemy validation and mutation helpers. | Keep all before/after comparisons and native side-effect checks. |
| server/src/validators/hero-buffs.ts, world-state.ts and combat-state.ts | Hero/Mob Buff ticks, world snapshots/turns, HP/damage, Ankh and combat deltas/events. | Preserve fail-closed native state contracts and existing test coverage. |
| server/src/util/seeded-rng.ts | Original deterministic SeededRNG helper. | Keep deterministic sequence compatibility.
| server/scripts/validate-spirit-arrow-schema.mjs | Static contract test for `SPIRIT_ARROW`, strict `spiritArrow` metadata and conditional ranged Mob rules. | Run in `npm test`; proves schema structure, not local projectile runtime or authority roundtrip. |
| server/src/index.test.ts | Main backend validator/contract test suite, retained on the root `./index` import path. | Add focused positive/negative cases beside the affected validator/action domain. |
| server/src/native-pickup-side-effect.test.ts | Focused pickup side-effect policy regressions. | Update for pickup preflight/side-effect changes. |
| server/scripts/validate-phase7-native-mutation-schema.mjs | Static action-metadata/schema validation. | Update alongside schema/validator contract when necessary. |
| server/package.json and package-lock.json | Backend scripts and dependency lock. | Lockfile changes must correspond to manifest changes; npm ci must work. |
| server/tsconfig.json | TypeScript compilation configuration. | Affects backend source/test typing. |
| server/wrangler.jsonc | Worker entry, Durable Object binding and SQLite migration config. | Class/binding/migration changes need deploy and storage compatibility review. |
| protocol/schema.json | Shared message envelope and native payload schema. | Schema changes require Java parser/serializer, Worker validator, tests and docs updates. |
| .github/workflows/multiplayer-ci.yml | Backend and Android branch-validation workflow. | Trigger path/toolchain/job changes affect exact commit evidence. |
| .github/workflows/deploy-server.yml | Cloudflare Worker deployment automation. | Auto-deploy currently only from master/main server changes or manual dispatch; not this branch push. |
| settings.gradle, build.gradle, core/build.gradle, android/build.gradle, gradle.properties, gradlew and wrapper files | Gradle module/toolchain/native dependency configuration. | Affects CI and all application targets. |
| android/src/main/AndroidManifest.xml | Android permissions and application entry. | Transport/permission work must update manifest and runtime permission handling where required. |

## 5. Test-file map

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
- server/scripts/validate-phase7-native-mutation-schema.mjs — static schema/action validation run before Vitest.

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
- MessageRouter.java plus RemotePlayerActionReceiver.java — transitional routing overlap.
- Hero.java, Mob.java, Actor.java, Level.java — native engine callbacks and scheduler behavior.
- protocol/schema.json — contracts can drift unless parser/validator tests enforce parity.

Do not make a large refactor of these files merely to improve documentation. Plan structural refactors separately and preserve active gameplay phase scope.
