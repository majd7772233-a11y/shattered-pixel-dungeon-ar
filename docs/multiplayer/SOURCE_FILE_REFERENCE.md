# Multiplayer Repository Source-File Reference

> Inventory baseline: branch HEAD eb2075b3f09ca4779773140b7e6539a6655f6824. This document maps project areas and multiplayer-critical paths. It does not claim that every one of the repository's 1,963 tracked files has been manually reviewed line by line.

## 1. Repository structure

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
| docs/multiplayer/DOCUMENTATION_ROLLOUT_PLAN.md | Temporary documentation batch tracker |

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

The package has 32 Java files:

| File | Main responsibility |
|---|---|
| BluetoothTransport.java | Core Bluetooth facade/provider interface |
| CoopMode.java | Co-op rule descriptor |
| DeathmatchMode.java | Deathmatch rule descriptor |
| EmbeddedMatchAuthority.java | Small embedded/local authority helper; not a Worker replacement |
| GameMode.java | Mode descriptor interface |
| InternetTransport.java | Custom TCP/TLS/WebSocket client |
| LANTransport.java | TCP server/client and UDP host discovery |
| LootClaimManager.java | In-memory claim helper |
| MessageRouter.java | Structured client message/event/snapshot/combat router |
| MessageType.java | Outer protocol enum |
| MultiHeroManager.java | Native Hero enumeration/nearest-hero helper |
| MultiplayerActionDispatcher.java | Native Hero action dispatch bridge |
| MultiplayerManager.java | Client session, transport, sequence, identities and publication |
| MultiplayerRunProgress.java | Run progress state serialization/restore |
| NativeCombatAuthorityPolicy.java | Authority selection helper for native combat |
| NativeCombatJson.java | Strict JSON writer for combat payloads |
| NativeHeroBuffTickPublisher.java | Native Hero Buff tick capture/publish |
| NativeItemActionPublisher.java | Selected native item action publication |
| NativeItemUse.java | Item-use preflight and fail-closed allowlist |
| NativeMobCombatDelta.java | Secondary native Mob delta capture |
| NetworkActionBridge.java | Native HeroAction → network action mapping |
| NetworkActionType.java | Gameplay action enum |
| NetworkMessage.java | Outer envelope and parser |
| NetworkTransport.java | Common transport interface |
| PlayerFOV.java | Local field-of-view calculation |
| PvPMode.java | PvP rule descriptor |
| RemotePlayer.java | Remote participant model and local Hero instance |
| RemotePlayerActionReceiver.java | Legacy/general remote-player receiver |
| SPDLevelSnapshot.java | Native snapshot exporter |
| SurvivalMode.java | Survival rule descriptor |
| TransportCallback.java | Transport callback interface |
| WorldSnapshot.java | Snapshot validation, restore, entity reconciliation and rollback |

For line/method responsibilities, use COMPONENT_AND_FILE_MAP.md and the Batch 2 native/protocol/server references.

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
| scenes/GameScene.java | Publishes current native level and updates sprites/visuals |
| scenes/InterlevelScene.java | Native floor and revival transition lifecycle |

## 6. Android platform files

| Path | Role / current finding |
|---|---|
| android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/android/AndroidLauncher.java | Android application startup; no direct Bluetooth provider registration was found |
| android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/android/AndroidPlatformSupport.java | Platform support utilities; no Bluetooth provider registration was found |
| android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/AndroidBluetoothProvider.java | RFCOMM adapter class implementing NativeBluetoothProvider |
| android/src/main/AndroidManifest.xml | At baseline declares VIBRATE, INTERNET and ACCESS_NETWORK_STATE; no Bluetooth permission declarations were present |

BluetoothTransport provider registration and runtime permissions remain open. See ANDROID_NATIVE_INTEGRATION.md and Phase 16.

## 7. Backend file inventory after source-refactor Stage 1

`server/src/index.ts` remains the official Cloudflare Worker entry, `MatchRoom` class owner and compatibility facade. Its original public named exports are preserved. The moved implementations are under:

- `server/src/protocol/types.ts`;
- `server/src/validators/` — entity identity, floor transitions, equipment, item state, abilities, shop, world actions, inventory claims/economy, world items, Hero buffs, world state and combat state;
- `server/src/util/seeded-rng.ts`.

The original `server/src/index.test.ts` and `server/src/native-pickup-side-effect.test.ts` remain on the existing `./index` import path. MatchRoom remains in `server/src/index.ts` until Stage 2. Wrangler `main`, `MATCH_ROOM` binding, `MatchRoom` class name and migration tag remain unchanged. On the verified Stage 1 HEAD, `index.ts` is 3,635 lines / 254,668 bytes; it retains the whole MatchRoom class and default Worker fetch implementation.



server/ contains:
- package.json and package-lock.json;
- tsconfig.json;
- wrangler.jsonc;
- scripts/validate-phase7-native-mutation-schema.mjs;
- src/index.ts (Worker entry + compatibility facade);
- src/match-room/ (base, persistence, combat, snapshots, actions, messages, final MatchRoom class);
- src/protocol/types.ts;
- src/validators/ (14 domain modules);
- src/util/seeded-rng.ts;
- src/index.test.ts;
- src/native-pickup-side-effect.test.ts.

`server/src/index.ts` is the Worker entry and compatibility facade, while the complete MatchRoom class and default Worker fetch remain there until later stages. Pure validator implementations now live in the focused modules listed above. See SERVER_VALIDATION_AND_STORAGE.md.

## 8. Protocol and automation files

| Path | Responsibility |
|---|---|
| protocol/schema.json | Draft-07 schema, protocol 1.0.0, envelope and native payload definitions |
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
| server/src/index.ts | Historical baseline: 658,825 bytes / 10,095 lines | Stage 1 moved the original validator/type/helper declarations; the file remains the Worker/MatchRoom entry and compatibility facade pending Stages 2–3 |
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

### Stage 3 — Worker integration and parity
- Complete remaining Worker routing/entry integration; remove transitional glue only when proven unused.
- Reconcile every moved declaration with the original source inventory.
- Recheck Java/client call sites, schema, tests, Wrangler, workflows, deployment docs and import/export compatibility.
- Keep Hero.java, Mob.java and WorldSnapshot.java untouched throughout.

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

All layers share one instance through inheritance. This is not a new Durable Object per layer.
