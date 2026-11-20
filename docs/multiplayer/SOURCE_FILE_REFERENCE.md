# Multiplayer Repository Source-File Reference

> Inventory baseline: branch HEAD eb2075b3f09ca4779773140b7e6539a6655f6824. This document maps project areas and multiplayer-critical paths. It does not claim that every one of the repository's 1,963 tracked files has been manually reviewed line by line.

## 1. Repository structure

> The top-level counts below are the historical source-audit baseline, not a live recount of the current tree.

The audited Git tree contains 1,963 tracked blobs at the baseline. Main top-level areas:

| Path | Approx. tracked files | Responsibility |
|---|---:|---|
| SPD-classes/ | 81 | Shared game/engine support classes |
| android/ | 55 | Android application, launcher, platform adapter, resources and native dependencies |
| core/ | 1,695 | Main game engine, assets, multiplayer Java, and JVM tests |
| desktop/ | 16 | Desktop launcher/platform module |
| ios/ | 63 | iOS/RoboVM platform module |
| docs/ | 6 at the original source audit plus new multiplayer docs | Contributor/platform docs and this maintained engineering guide |
| gradle/ | 2 | Gradle wrapper support |
| protocol/ | 1 | Shared JSON Schema |
| server/ | 8 | Cloudflare Worker/Durable Object source, tests, package and deployment config |
| services/ | 17 | News/update service modules |
| .github/ | 3 | Workflow automation |

The directory counts are a repository-tree snapshot. Recalculate them after source additions, moves or removals.

## 2. Gradle and runtime modules

settings.gradle includes:
- :SPD-classes;
- :core;
- :android;
- :ios;
- :desktop;
- :services;
- :services:updates:debugUpdates;
- :services:updates:githubUpdates;
- :services:news:debugNews;
- :services:news:shatteredNews.

Root build variables at the audited commit:
- Android Gradle Plugin 9.1.0;
- Java compatibility 11;
- Android compile/target SDK 36 and minimum SDK 21;
- libGDX 1.14.0;
- Controllers extension 2.2.4;
- RoboVM 2.3.24;
- app ID com.magd.shatteredpixeldungeon.

These are observed baseline values. Re-check before modifying build configuration.

## 3. Root and project-memory Markdown files

At the pre-Batch-2 baseline there were 15 tracked Markdown files:

| Path | Role |
|---|---|
| GPT.md | AI continuation rules/checkpoint and historical implementation notes |
| ROADMAP.md | Authoritative 23-phase plan, dependencies and acceptance gates |
| MULTIPLAYER_CONTINUATION_NOTES.md | Superseded historical checkpoint; not current phase authority |
| docs/PULL_REQUEST_TEMPLATE.md | PR contribution template |
| docs/getting-started-android.md | Android build/setup instructions |
| docs/getting-started-desktop.md | Desktop build/setup instructions |
| docs/getting-started-ios.md | iOS build/setup instructions |
| docs/recommended-changes.md | App branding/version/translation customization guidance |
| docs/multiplayer/README.md | Multiplayer documentation index/source-of-truth contract |
| docs/multiplayer/PROJECT_OVERVIEW.md | Product scope and terminology |
| docs/multiplayer/SYSTEM_ARCHITECTURE.md | High-level project/runtime/server architecture |
| docs/multiplayer/COMPONENT_AND_FILE_MAP.md | Component responsibilities/change impact |
| docs/multiplayer/AUTHORITATIVE_DATA_FLOWS.md | Native-to-server-to-client paths |
| docs/multiplayer/BUILD_TEST_AND_CI.md | Build/test/deployment/CI evidence |


Batch 2 adds:
- ANDROID_NATIVE_INTEGRATION.md;
- SERVER_VALIDATION_AND_STORAGE.md;
- PROTOCOL_MESSAGE_CATALOG.md;
- TEST_MATRIX.md;
- SESSION_RECOVERY_AND_SECURITY.md;
- SOURCE_FILE_REFERENCE.md.

The temporary rollout tracker is retained while Batch 3 is pending; it must be deleted after that plan has been reviewed and the permanent reference index/checkpoint are finalized.

## 4. Multiplayer Java package inventory

Base path: core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/

The package has 34 Java files:

| File | Main responsibility |
|---|---|
| BluetoothTransport.java | Core Bluetooth facade/provider interface |
| CoopMode.java | Co-op rule descriptor |
| DeathmatchMode.java | Deathmatch rule descriptor |
| EmbeddedMatchAuthority.java | Small embedded/local authority helper; not a Worker replacement |
| GameMode.java | Mode descriptor interface |
| InternetTransport.java | Generation-fenced TCP/TLS/WebSocket client; cancellable in-flight HTTP Upgrade; synchronized socket/stream ownership and generation-scoped control frames |
| LANTransport.java | Phase 15A TCP host/guest plus lifecycle-bound Phase 15B UDP announcement/discovery API |
| LanEndpoint.java | LAN direct endpoint parser |
| LanFrameCodec.java | Bounded strict UTF-8 TCP frame codec |
| LanDiscoveryPacket.java | Versioned bounded UDP discovery packet codec |
| LanNetworkInterfaces.java | Usable IPv4 local/directed-broadcast interface selection |
| LanHostAnnouncer.java | Host UDP advertisement lifecycle worker |
| LanHostDiscovery.java | Bounded cancellable UDP discovery receiver |
| LootClaimManager.java | In-memory claim helper |
| MessageRouter.java | Exhaustive 25-value outer-message router; typed PLAYER_JOINED/PLAYER_LEFT/READY/PING, render-thread ROOM_STATE/MATCH_START and snapshot readiness restore |
| MessageType.java | Outer protocol enum |
| MultiHeroManager.java | Native Hero enumeration/nearest-hero helper |
| MultiplayerActionDispatcher.java | Native Hero action dispatch bridge |
| MultiplayerManager.java | Client session/reconnect, lifecycle gate, room operations, sequence, identities and publication |
| RoomLobbyState.java | Validated authoritative ROOM_STATE roster and revision for the lobby |
| RoomMemberInfo.java | Immutable member identity/class/state/readiness/connectivity model |
| MultiplayerRunProgress.java | Run progress state serialization/restore |
| NativeCombatAuthorityPolicy.java | Authority selection helper for native combat |
| NativeCombatJson.java | Strict JSON writer for combat payloads |
| NativeHeroBuffTickPublisher.java | Native Hero Buff tick capture/publish |
| SpiritBow.java | Native SpiritArrow projectile and optional multiplayer completion context; verify asynchronous `MissileSprite.onComplete()` and native Hero report lifecycle. |
| SnipersMark.java | Native SnipersMark expiry and `doAction()` Bow/marked-target selection. |
| NativeItemActionPublisher.java | Selected native item action publication |
| NativeItemUse.java | Item-use preflight and fail-closed allowlist |
| NativeMobCombatDelta.java | Secondary native Mob delta capture |
| NetworkActionBridge.java | Native HeroAction → network action mapping |
| NetworkActionType.java | Gameplay action enum |
| NetworkMessage.java | Outer envelope and parser |
| NetworkTransport.java | Common transport interface |
| PlayerFOV.java | Local field-of-view calculation |
| PvPMode.java | PvP rule descriptor |
| RemotePlayer.java | Remote participant model, local Hero replica and server-authored isReady room metadata |
| RemotePlayerActionReceiver.java | Explicit RemoteHero setup/legacy helper; no longer a generic top-level default receiver for outer message kinds |
| SPDLevelSnapshot.java | Native snapshot exporter |
| SurvivalMode.java | Survival rule descriptor |
| TransportCallback.java | Transport callback interface |
| WorldSnapshot.java | Snapshot validation, restore, entity reconciliation and rollback |

For line/method responsibilities, use COMPONENT_AND_FILE_MAP.md and the Phase 10-E protocol, Android and test closeout references.


## 4.1 Phase 10-C JVM protocol/receiver tests

| Test path | Current source evidence |
|---|---|
| core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NetworkProtocolParityTest.java | 15 JVM tests for canonical envelope parser/serializer, strict required and optional fields, version/sequence, malformed JSON, unknown types, scoped LAN/Bluetooth legacy compatibility, HeroAction Optional mapping and transport framing/action parsing. |
| core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NativeCombatRuntimeIntegrationTest.java | 74 @Test methods at Phase 11-B code/test SHA `2574489`. Includes the typed player/control paths, native combat/snapshot coverage, contiguous EVENT_BATCH ordering and recovery, watermark safety, stale/incomplete snapshots and duplicate ACTION_ACCEPTED/EVENT_BATCH handling. |

These are automated JVM tests. They do not prove a production Worker deployment or a physical two-device session.

## 5. Native engine integration paths

| File | Why it matters |
|---|---|
| actors/Actor.java | Scheduler, Actor time/cooldown, shared actor gating and deferred result publication |
| actors/Char.java | Native shared combat/buff/damage behavior inherited by Hero and Mob |
| actors/hero/Hero.java | Main local player action, native combat, item mutation, death/revival and action publisher hooks |
| actors/hero/RemoteHero.java | Delegated native Hero simulation for another player |
| actors/mobs/Mob.java | Native AI, Mob scheduling, Hero target ownership and Mob damage reports |
| levels/Level.java | Native world geometry, metadata, respawner, terrain and floor fall behavior |
| Dungeon.java | Run seed, generation, depth and floor lifecycle; seed is injected before generation through HeroSelectScene |
| scenes/TitleScene.java | Multiplayer entry point |
| scenes/MultiplayerTransportScene.java | Transport selection |
| scenes/MultiplayerSetupScene.java | Host/client and endpoint setup/session start |
| scenes/HeroSelectScene.java | Applies the authoritative seed before native game creation |
| scenes/GameScene.java | Publishes current native level, ticks the lobby and gates native turns/cell input until PLAYING |
| windows/WndMultiplayerLobby.java | In-game lifecycle lobby: authoritative roster/readiness, owner Start/readiness reset, Leave and reconnect/failure exit |
| scenes/InterlevelScene.java | Native floor and revival transition lifecycle |

## 6. Android platform files

| Path | Role / current finding |
|---|---|
| android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/android/AndroidLauncher.java | Android application startup; no direct Bluetooth provider registration was found |
| android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/android/AndroidPlatformSupport.java | Platform support utilities; no Bluetooth provider registration was found |
| android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/AndroidBluetoothProvider.java | RFCOMM adapter class implementing NativeBluetoothProvider |
| android/src/main/AndroidManifest.xml | At baseline declares VIBRATE, INTERNET and ACCESS_NETWORK_STATE; no Bluetooth permission declarations were present |

BluetoothTransport provider registration and runtime permissions remain open. See ANDROID_NATIVE_INTEGRATION.md and Phase 16.

## 7. Backend file inventory after the three-stage source refactor

`server/src/index.ts` remains the official 35-line Cloudflare Worker entry and compatibility facade; it re-exports the default router from `server/src/worker.ts`, all original public named exports, and `MatchRoom`, whose single class definition is in `server/src/match-room/index.ts`. Its moved implementations are under:

- `server/src/protocol/types.ts`;
- `server/src/validators/` — entity identity, floor transitions, equipment, item state, abilities, shop, world actions, inventory claims/economy, world items, Hero buffs, world state and combat state;
- `server/src/util/seeded-rng.ts`.

The original `server/src/index.test.ts` and `server/src/native-pickup-side-effect.test.ts` remain on the existing `./index` import path. `server/src/entrypoint.test.ts` covers Worker routing through the root facade. The Worker handler is in `server/src/worker.ts`; the root `index.ts` keeps the original Wrangler main path and re-exports the default handler. Wrangler `main`, `MATCH_ROOM` binding, `MatchRoom` class name and migration tag remain unchanged. Historical sizes: 3,635 lines after Stage 1; 51 lines after Stage 2; 35 lines after Stage 3.



server/ contains:
- package.json and package-lock.json;
- tsconfig.json;
- wrangler.jsonc;
- scripts/validate-phase7-native-mutation-schema.mjs;
- scripts/validate-spirit-arrow-schema.mjs (strict NativeAttackPayload SpiritArrow metadata/conditional schema parity);
- scripts/validate-publisher-handoff-schema.mjs (publisher handoff/rebase schema contract);
- scripts/validate-phase10-protocol-enums.mjs (ordered Java/schema enum and protocol-version parity);
- scripts/validate-phase10-routing.mjs (25-message classification, eight actual Worker ingress routes and 23 explicit ACTION branch guard).
- src/index.ts (35-line Worker entry + compatibility facade);\n- src/worker.ts (default Worker request router);
- src/match-room/ (base, persistence, combat, snapshots, actions, messages, final MatchRoom class);
- src/protocol/types.ts;
- src/protocol/message-admission.ts and src/protocol/message-admission.test.ts (Worker envelope classification, fail-closed admission and regressions);
- src/validators/ (14 domain modules);
- src/util/seeded-rng.ts;
- src/index.test.ts;
- src/native-pickup-side-effect.test.ts;
- src/protocol/message-admission.test.ts;\n- src/entrypoint.test.ts (Worker root-entry/routing integration).

`server/src/index.ts` is the Worker entry and compatibility facade; `server/src/worker.ts` owns default request routing; the complete `MatchRoom` class lives in `server/src/match-room/index.ts`. Pure validator implementations live in the focused modules listed above. See SERVER_VALIDATION_AND_STORAGE.md.

## 8. Protocol and automation files

| Path | Responsibility |
|---|---|
| protocol/schema.json | Draft-07 schema, protocol 1.0.0, envelope and native payload definitions, including `SPIRIT_ARROW`/`spiritArrow` conditional contract |
| .github/workflows/multiplayer-ci.yml | Backend build/tests and Android JVM tests/debug APK compile |
| .github/workflows/deploy-server.yml | Cloudflare Worker deployment from master/main or manual dispatch |
| .github/workflows/release.yml | Release workflow; inspect before release changes |
| server/wrangler.jsonc | Worker main entry, Durable Object binding and SQLite migration tag |
| build.gradle / settings.gradle | Shared app metadata, toolchain and included Gradle projects |
| core/build.gradle / android/build.gradle | Core and Android module dependencies/build configuration |
| gradle.properties / gradlew / gradlew.bat / gradle/wrapper | Gradle runtime/tooling |

## 9. Large source files and remaining refactor scope

The following sizes are historical source-baseline values. The approved three-stage source refactor is limited to `server/src/index.ts`. `Hero.java`, `Mob.java` and `WorldSnapshot.java` are explicitly protected and must remain unchanged; their rows below are inventory only.

| File | Historical bytes | Historical responsibility / current decision |
|---|---:|---|
| server/src/index.ts | Historical baseline: 658,825 bytes / 10,095 lines | Stage 1 extracted validator/type/helper declarations; after Stage 2 it is the 51-line Worker entry and compatibility facade, not the MatchRoom class owner |
| core/.../actors/hero/Hero.java | 117,061 | Protected by the user: do not split or modify as part of this work |
| core/.../multiplayer/WorldSnapshot.java | 83,795 | Protected by the user: do not split or modify as part of this work |
| core/.../multiplayer/MessageRouter.java | 68,021 | Message parsing, combat, snapshot, accepted action and event application |
| core/.../actors/mobs/Mob.java | 66,010 | Protected by the user: do not split or modify as part of this work |
| core/.../scenes/GameScene.java | 60,874 | Scene lifecycle, render-thread integration, sprites and game UI |
| core/.../levels/Level.java | 55,788 | Geometry, generation, native metadata, transitions and shared world state |
| core/.../multiplayer/MultiplayerManager.java | 30,457 | Session, transport, sequence, identity and publication coordinator |
| server/src/index.test.ts | 337,158 | 5,556-line test file with 57 describe groups and 277 test declarations |
| core/.../NativeCombatRuntimeIntegrationTest.java | See Git tree/source | 2,648-line integration test with 46 methods |

The user explicitly excluded Hero.java, Mob.java and WorldSnapshot.java from splitting; leave them unchanged. Their sizes are retained as historical inventory only. Stage 2 and Stage 3 focus on MatchRoom and Worker/storage integration. Do not move gameplay engine files into this refactor.

## 10. Three-stage source refactor

### Stage 1 — validators/types/helpers
- Move every original declaration before MatchRoom into focused TypeScript modules.
- Keep all original public exports available through index.ts.
- Keep the full MatchRoom class and Worker default fetch code in index.ts.
- Preserve function bodies, validators, comments, constants and type definitions; promote only cross-module private helpers to internal exports.
- **State:** complete. Exact source SHA `4119263d9cc4dd5b230c551897b37dc4391417cf`; [CI run 42479978278](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42479978278) passed both backend and Android jobs.

### Stage 2 — MatchRoom responsibilities
- Split storage/schema helpers, session lifecycle, message routing/action handlers, combat coordination, snapshots/transitions and broadcasts into cohesive modules.
- Preserve one MatchRoom class export and its Cloudflare identity.
- Preserve SQLite SQL, migrations, alarms, replay/locks, event sequencing and WebSocket protocol exactly.
- **State:** complete for source extraction and automated acceptance. Exact source SHA `237577f1e8c68a3f052b36fcac64cd7efc07918d`; [CI run 42483052104](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42483052104) passed Backend typecheck/tests and Android JVM/debug APK compile.

### Stage 3 — Worker integration and parity
- Relocate the unchanged default Worker request handler to `server/src/worker.ts` and retain `server/src/index.ts` as Wrangler's stable 35-line main and compatibility facade.
- Add `server/src/entrypoint.test.ts` to exercise root exports, room routing, exact Request forwarding, default-room fallback and the non-room response.
- Reconcile all 200 original declarations before `MatchRoom` to the 15 owner modules; normalized text comparison found 200/200 matches without differences.
- Preserve all 118 original validator/protocol/helper named exports and the named `MatchRoom` export (119 named exports total).
- Recheck Java/client call sites, schema, tests, Wrangler, workflows, deployment docs and import/export compatibility.
- Keep Hero.java, Mob.java and WorldSnapshot.java untouched throughout.
- **Exact-HEAD acceptance:** [GitHub Actions run 42486485451](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/42486485451) passed on `a513327caf7e500d8416befae8c04a984a4bbc18`: Backend typecheck/full tests and Android JVM/debug-APK CI both succeeded.
- **State:** complete for implementation, source parity and automated acceptance; no live Worker deployment or physical-device session is implied.

These stages are source organization only. They do not change or renumber gameplay phases 1–23.


## 11. MatchRoom Stage 2 modules

| Path | Responsibility |
|---|---|
| `server/src/match-room/base.ts` | Authoritative shared Durable Object instance state and foundational WebSocket close/broadcast |
| `server/src/match-room/persistence.ts` | SQLite initialization, item-claim migration, fallback level generation |
| `server/src/match-room/combat.ts` | Pending combat reservation/reconciliation, geometry, LOS and FOV |
| `server/src/match-room/snapshots.ts` | Snapshot reads/broadcasts, floor transition commit and match-end rules |
| `server/src/match-room/actions.ts` | RECONNECT, LEVEL_DATA, LEVEL_READY and ACTION handlers |
| `server/src/match-room/messages.ts` | WebSocket envelope parsing/dispatch/error handling |
| `server/src/match-room/index.ts` | Final single exported MatchRoom class; constructor, alarm and room HTTP fetch |

- `server/src/match-room/index.ts` — handshake/reconnect session admission; preflights the canonical recovery snapshot before changing session tokens or accepting a socket and returns HTTP 413 on `SNAPSHOT_TOO_LARGE`.
- `server/src/match-room/snapshot-size.ts` — JSON.stringify-compatible UTF-8 byte counter and bounded serialization for the 15.5 MiB complete SNAPSHOT envelope and 16 MiB inbound text guard.
- `server/src/match-room/snapshot-size.test.ts` — exact JSON/UTF-8 parity, escaping, Unicode, exact limit, one-byte-over and pre-allocation rejection.
- `server/src/match-room/lifelink-death.integration.test.ts` — replay retention, ACTION preflight rollback and explicit RECONNECT oversize errors.
- `server/src/match-room/durable-object-sqlite.integration.do.mjs` — real Workers SQLite lifecycle/recovery and room-member snapshot checks.

All layers share one instance through inheritance. This is not a new Durable Object per layer.

## 4.2 Historical Phase 10-D typed PLAYER_LEFT lifecycle regression

| Test/source path | Current source evidence |
|---|---|
| core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MessageRouter.java | Explicit PLAYER_LEFT route and render-thread cleanup handler; actual Worker producer is MatchRoomBase.webSocketClose. |
| core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/RemotePlayerActionReceiver.java | No longer owns PLAYER_LEFT cleanup; direct duplicate delivery is refused through the existing resync request path. The class remains for explicitly invoked native Hero setup and legacy helper behavior; it is no longer the top-level catch-all route. |
| core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NativeCombatRuntimeIntegrationTest.java | 64 @Test methods at implementation/test SHA cc61c68625f587576ca530aef3354bfaffe9e140. PLAYER_LEFT tests prove old-route baseline, typed-path equivalence, Mob target/Actor/Buff/sprite/registry cleanup, invalid payload fallback, local-player no-op and legacy duplicate rejection. |
| server/src/match-room/base.ts | Real PLAYER_LEFT producer in webSocketClose; not modified by the client migration. |

Exact implementation/test SHA `cc61c68625f587576ca530aef3354bfaffe9e140` passed CI 43522055301. That was the bounded 10-D state; Phase 10-E subsequently closed the parent phase.


## 4.3 Phase 10-E typed routing and payload contract closeout

| Test/source path | Current source evidence |
|---|---|
| core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MessageRouter.java | Exact 25-value switch, typed PLAYER_JOINED/PLAYER_LEFT/READY/PING handlers, snapshot readiness restoration and explicit CHAT/non-inbound decisions; no generic default-to-legacy receiver. |
| core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/RemotePlayer.java | Server-authored isReady metadata for the remote participant. |
| core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/RemotePlayerActionReceiver.java | setupRemoteHeroInstanceOnRenderThread creates the native Actor and attaches HeroSprite only in GameScene; receiver retained, not a generic outer-message route. |
| protocol/schema.json | NativeActionEnvelope.oneOf plus 23 NativeActionData_<ACTION> definitions; required NativeLevelSnapshot fields remain declared. |
| protocol/action-data-contracts.json | 23 action rows; 361 Worker field names, 346 source-referenced in listed Java producer sources and 15 Worker-only (static name presence is not proof of runtime serialization on every branch); per-action validators and producer references. |
| server/scripts/validate-phase10-action-contracts.mjs | CI static parity guard for action enums, schema field inventories, Worker fields, Java-source-referenced/Worker-only split and native snapshot required fields. |
| core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NativeCombatRuntimeIntegrationTest.java | 67 @Test methods at SHA f2d79038d1e420461be7a1956471324de5c1ef74; join identity, duplicate join, READY, CHAT/PING/non-inbound rejection and snapshot readiness regression coverage. |

Exact source/test SHA f2d79038d1e420461be7a1956471324de5c1ef74 passed CI 43618725089 across Backend (six guards + 708 executions), Android JVM/Debug APK and three Durable Object SQLite tests. WAIT and USE_ABILITY remain explicitly non-emitted by Android; CHAT remains non-routed without a client UI. This closeout does not claim production deployment or physical-device validation.

## Phase 11-B source references — current verified inventory

| File | Phase 11-B responsibility |
|---|---|
| core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MessageRouter.java | EVENT_BATCH sequence validation, duplicate/order normalization, render-thread application, rollback and commit-after-success; ACTION_ACCEPTED contiguous handling. |
| core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MultiplayerManager.java | Last-applied sequence commit and pending recovery gate. |
| core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/WorldSnapshot.java | Full snapshot validation/restore and stale sequence rejection. |
| server/src/match-room/actions.ts | Canonical request fingerprint, NEW/REPLAY/CONFLICT classification and ACTION transaction boundary. |
| server/src/match-room/persistence.ts | Idempotent processed_actions migration with request and delegated-completion identity fields. |
| server/src/match-room/messages.ts | Reconnect and RESYNC routing. |
| server/src/match-room/lifelink-death.integration.test.ts | Request replay identity, concurrent retries, migration and transaction rollback regressions. |

Exact code/test SHA `2574489ff25e6f1fedc1e21718161bc5a7a1b230` passed [CI 43731016036](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036). Current integration test inventory is 74 Android @Test methods; the separate parity suite remains at 15.

| core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MultiplayerReconnectLifecycleTest.java | Phase 12-A/B1: authenticated reconnect lifecycle, generation-atomic manager callback dispatch, stale-session replacement race and retry/timeout behavior. |

## Phase 12-B source additions/ownership — 2026-11-16

| File | Phase 12-B responsibility |
|---|---|
| `server/src/match-room/base.ts` | Defines replay/evidence retention limits and `persistEventLogState()` for durable sequence/status checkpoints plus protected LifeLink/player-damage event evidence. |
| `server/src/match-room/persistence.ts` | Restores/validates persisted room metadata, derives legacy terminal status, performs bounded event compaction on initialization and rejects a missing current level when related durable state remains. |
| `server/src/match-room/actions.ts` | Persists cursor/status and runs event retention after accepted ACTION and native world turn/mutation event inserts. ACTION path remains within the existing `transactionSync` boundary. |
| `server/src/match-room/combat.ts` | Persists sequence/status after the level-transition-abort event. |
| `server/src/match-room/snapshots.ts` | Persists the terminal `ENDED` status and MATCH_END sequence for both supported match-end paths. |
| `server/src/match-room/lifelink-death.integration.test.ts` | Keeps the in-memory MatchRoom SQL adapter behavior aligned with UPSERT and evidence-aware retention SQL. |
| `server/src/match-room/durable-object-sqlite.integration.do.mjs` | Real Workers SQLite eviction/restart, replay, snapshot, retention, legacy terminal status and missing-level regression tests. |

No Android or protocol-schema source changed for the final Phase 12-B closeout. `protocol/schema.json` remains at 25 messages / 23 actions. The multi-table LEVEL_DATA write path is covered by a single Durable Object `transactionSync` boundary with rollback tests; the 14-test real SQLite suite verifies no partial level state or publisher ACK escapes a failed commit.


## Phase 13 lobby integration source map (2026-11-17)

- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MultiplayerManager.java`: sticky Internet lifecycle gate, validated roster access, local snapshot synchronization, room-operation correlation/timeouts and reconnect-exhaustion cleanup.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/RoomLobbyState.java`: sole ROOM_STATE parser/store/revision; validates count/capacity, unique IDs, owner reference and allReady consistency.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/RoomMemberInfo.java`: immutable member identity/class/state/readiness/connectivity model.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MessageRouter.java`: render-thread ROOM_STATE and MATCH_START handling; ROOM_STATE is applied once.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/windows/WndMultiplayerLobby.java`: modal room/ready UI, owner Start/readiness reset, Leave and reconnect/failure exit.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/GameScene.java`: modal tick seam and native turn/cell-input gate before PLAYING.
- `core/src/test/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MultiplayerReconnectLifecycleTest.java`: lifecycle regressions for failed Internet gate and duplicate roster rejection.
- `server/src/match-room/durable-object-sqlite.integration.do.mjs`: real SQLite race, cancel/reset, successful-start, late-join and post-start-cancel acceptance.

No Android instrumentation/UI automation currently proves rendered layout or touch behavior; manual emulator acceptance remains open.
