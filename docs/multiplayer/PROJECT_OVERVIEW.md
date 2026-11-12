# Multiplayer Project Overview

## 1. Project identity

| Field | Value |
|---|---|
| Repository | majd7772233-a11y/shattered-pixel-dungeon-ar |
| Working branch | multiplayer-framework-core-14118577486727081892 |
| Game foundation | Shattered Pixel Dungeon, Java and libGDX |
| Main game logic | core/ |
| Shared engine support | SPD-classes/ |
| Multiplayer Java package | core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/ |
| Backend | Cloudflare Workers + Durable Objects + SQLite storage |
| Protocol contract | protocol/schema.json |
| Roadmap | ROADMAP.md |
| Continuation guide | GPT.md |

This repository is the Arabic Shattered Pixel Dungeon codebase with a multiplayer implementation under active development. It is not the Mineclonia project and does not share Mineclonia's architecture, translation process, scripts, or progress state.

## 2. Product goal

Deliver genuine multiplayer Shattered Pixel Dungeon gameplay on two or more devices. Participants should enter the same match and experience one coherent native SPD run rather than separate local games that merely exchange player coordinates.

The complete product target includes:

- Shared run creation, room membership, player identity, readiness, and match lifecycle.
- A common native-generated dungeon world: tiles, transitions, Mobs, heaps, items, traps, plants, blobs, and level metadata.
- Player movement, doors, interactions, floor changes, and world mutations.
- Native SPD combat, including hit/miss, damage, armor, shields, buffs, death, revival, and secondary effects.
- Native Mob AI and Actor scheduling with a clear authority model.
- Stable identity for networked players, Mobs, heaps, and item instances.
- Inventory, equipment, quickslots, pickup/drop/throw, consumables, economy, rewards, and progression.
- Co-op and competitive rules enforced consistently by client and server.
- Ordered event delivery, replay resistance, durable recovery, reconnect, snapshots, and authority changes.
- Truthful setup/status UI for each available transport and mode.
- Localization and RTL/layout correctness for multiplayer screens.
- Automated cross-layer checks, deployed-service smoke checks, and a final physical-device playtest.

The original SPD Java engine is the gameplay specification. The implementation must preserve original formulas, RNG-sensitive behavior, callbacks, side effects, Actor clocks, Mob AI, item effects, and Level lifecycle. Server-side simplified calculations may validate bounded intents and state deltas, but must not be described as equivalent to the complete native game engine.

## 3. Product boundary: native game versus multiplayer coordination

### Native game engine

The SPD runtime is responsible for game semantics belonging to the original engine: level generation, native combat calculation, Mob behavior, item use, buff callbacks, Actor scheduling, rendering, and game-specific progression.

Multiplayer code adds controlled capture, publication, authorization metadata, reconciliation, and restoration around that native behavior. It does not replace the engine.

### Multiplayer coordination service

The Cloudflare Worker routes room requests to a Durable Object. The Durable Object maintains room/session state, persists selected world/player/event information in SQLite, validates client-submitted native outcomes against trusted state and bounded transition rules, sequences events, coordinates readiness/floor transitions, and broadcasts room updates.

The Worker does not execute the Java SPD engine. It cannot independently reproduce every native callback or RNG-dependent consequence. Where a complete server-side native simulation is unavailable, the design delegates native execution to an authorized publisher/owner and validates the resulting delta. This delegation is a trust boundary and must remain explicit.

## 4. Actors and authority vocabulary

- **Local Hero** — the player's actual native Dungeon.hero instance on that device.
- **RemoteHero** — a native Hero-like representation used to simulate another participant when the local device is the designated authority for a native interaction.
- **RemotePlayer** — multiplayer-side record linking a network player ID and metadata to a local remote Hero instance.
- **Level publisher** — the client currently authorized to publish shared native level/Mob state. This is not interchangeable with a server-generated Mob simulation.
- **Target owner** — the client responsible for resolving selected native effects against its own player character in the current authority model.
- **Room Durable Object** — the server-side per-room coordinator and durable storage owner.
- **Stable entity ID** — network-visible identity that persists across devices/reconnects. Native Actor.id() is a local scheduler/runtime ID and must not be the only network identity.
- **Request ID** — idempotency/replay key binding an action request and result.
- **Sequence** — monotonically increasing authoritative event position used to detect stale/gapped state and request resynchronization.
- **Full snapshot** — complete representation of a defined state domain. An empty collection in a full snapshot means no entities of that type; an omitted field is not automatically equivalent to an empty collection.
- **Resync** — recovery by obtaining and applying authoritative state after an invalid, missing, stale, ambiguous, or failed incremental transition.

## 5. Current implemented surface versus verified readiness

The source tree contains client classes for Internet, LAN, and Bluetooth transports; several game-mode descriptors; room/action code; native snapshot capture and restore; Worker validation; protocol definitions; and automated tests.

That presence does not mean all features have passed end-to-end acceptance.

### Current verified checkpoint — 2026-11-12

- Current branch: `multiplayer-framework-core-14118577486727081892`; latest gameplay code/test SHA: `377fa362772fb5367b548f44686e129493b1be14`. See GPT.md and ROADMAP.md for the latest documentation HEAD.
- Exact-head CI for the current code/test SHA: [43231618201 — FAILURE](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43231618201).
- Backend: TypeScript build, Phase 7 schema, SpiritArrow schema and 652 executions across 8 Vitest files passed.
- Android: 88 JVM tests with two SpiritArrow failures at `:core:test`; `assembleDebug` was not reached.
- Failing tests: `nativeSnipersMarkSpiritArrowTargetDisappearingBeforeMissileCompletionCancelsAndResyncs` and `nativeSnipersMarkSpiritArrowCompletesFromTheRealMissileCallbackExactlyOnce`; both fail after `SnipersMark.doAction()` before test MissileSprite creation.
- Last green pre-9-C baseline: `0a70053addd976fc6d4330af52330d7593ee1bc4` / [CI 43198856325](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43198856325); historical only.
- Phases 1–8 complete for implementation/automated acceptance; Phase 9 partial/open; Phases 10–23 open.
- 9-C is the only active slice. Schema/metadata and separate backend reservation/forwarding pieces exist; the local async lifecycle and complete authority-result/requester reconciliation remain unaccepted.
- Root cause is unknown: distinguish `beginNativeSpiritArrowAttack()` returning false from `SpiritArrow.cast()` throwing/cancelling. Do not weaken guards.
- No live Worker deployment smoke test or physical two-device match is claimed.

The detailed current Phase 9 accepted/rejected behavior and exact next action remain in the authoritative current checkpoint in GPT.md and the Phase 9 section of ROADMAP.md.

## 6. Modes and transports: do not infer readiness

The Java source contains mode descriptor classes for Co-op, PvP, Deathmatch, and Survival. The Worker has a game-mode field and competitive field-of-view broadcast behavior. Mode-specific enforcement remains a separate acceptance concern; the presence of a class or server enum is not proof that scoring, revive, death, visibility, team, or end-condition rules are complete.

The UI exposes Internet, LAN, and Bluetooth choices. The existence of InternetTransport, LANTransport, BluetoothTransport, or AndroidBluetoothProvider does not prove successful handshake, host discovery, peer compatibility, reconnection, Android permission flow, lifecycle correctness, or real-device data transfer.

The current setup code starts the session and proceeds to Hero selection without an explicit visible connection-success gate. LAN/Bluetooth host-start exceptions are caught and ignored in the inspected setup path. Treat these as known audit targets, not supported-product guarantees.

## 7. Non-negotiable engineering constraints

1. Preserve original native SPD gameplay semantics; do not substitute approximate TypeScript combat or item formulas.
2. Establish one authority for each state transition. Prediction must be acknowledged and reconciled or rolled back.
3. Use stable network IDs; never assume device-local Actor IDs are portable.
4. Validate untrusted payloads using authenticated player, request identity, trusted pre-state, action scope, geometry, cooldown/action cost, native bundles, and allowed post-state.
5. Make snapshots complete, bounded, validated, idempotent, and recoverable with rollback/resync.
6. Reject unsupported or ambiguous multi-side-effect operations until all consequences can be validated.
7. Keep protocol schema, Java serializers/parsers, server validators, tests, and documentation synchronized.
8. Never claim a mode, transport, deployment, test, or phase is complete without matching evidence.
9. Preserve the requested working branch and never merge to main unless explicitly instructed.
10. Update documentation continuously, including one-character edits.

## 8. Key source entry points

| Concern | Primary files |
|---|---|
| Application entry / title / multiplayer navigation | TitleScene.java, MultiplayerTransportScene.java, MultiplayerSetupScene.java |
| Session ownership and local client state | MultiplayerManager.java |
| Transport contracts and implementations | NetworkTransport.java, InternetTransport.java, LANTransport.java, BluetoothTransport.java |
| Android Bluetooth provider | android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/AndroidBluetoothProvider.java |
| Native action capture | Hero.java, MultiplayerActionDispatcher.java, NativeItemActionPublisher.java, NativeItemUse.java, NativeHeroBuffTickPublisher.java |
| Native turn/scheduler bridge | Actor.java, Mob.java |
| World export and import | SPDLevelSnapshot.java, WorldSnapshot.java, Level.java |
| Client message reconciliation | MessageRouter.java, RemotePlayerActionReceiver.java |
| Backend room/validation/storage | server/src/index.ts |
| Shared wire schema | protocol/schema.json |
| Tests and automation | core/src/test/..., server/src/*.test.ts, .github/workflows/multiplayer-ci.yml |

Read SYSTEM_ARCHITECTURE.md, COMPONENT_AND_FILE_MAP.md, and AUTHORITATIVE_DATA_FLOWS.md before modifying cross-layer behavior.
