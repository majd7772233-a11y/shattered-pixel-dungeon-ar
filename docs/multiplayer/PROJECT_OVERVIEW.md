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

## Current continuation checkpoint — 2026-11-19

Phase 14-A, 14-B1 and 14-B2 are closed. Phase 14-B3 Android connectivity/session code is locally verified, including a monitor-generation fence across Activity monitor teardown/restart. Latest forced Android build/test result: 172/172 JVM tests, 11 JUnit reports, zero failures/errors/skips, and Debug APK compilation SUCCESS. B3 and parent Phase 14 remain open until hosted Worker room-flow acceptance and an actual Android network/background runtime cycle are authorized and passed. No Emulator/ADB app run or hosted room test is claimed by this checkpoint. See `PHASE14-B3_ANDROID_NETWORK_RECOVERY.md` for the evidence and exact APK hash.
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

### Current verified checkpoint — 2026-11-15 — Phase 11-B implementation and CI verified

- Latest code/test SHA: `2574489ff25e6f1fedc1e21718161bc5a7a1b230`; exact-head CI [43731016036 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43731016036).
- Phase 9 remains complete within its explicit fail-closed support boundary; Phase 10-A through 10-E remain closed for the accepted implementation/automated-acceptance scope.
- Phase 11-A characterization tests remain as historical regressions. Phase 11-B corrected the behaviors those tests exposed: contiguous event application and commit-after-success watermarking on Android, request fingerprint replay binding on the Worker, and atomic ACTION transaction/after-commit delivery.
- Android EVENT_BATCH now accepts only the expected contiguous sequence range after ordering/deduplication, rejects conflicting duplicates and malformed/gapped batches into full recovery, and protects live state with per-event rollback. EVENT_SKIPPED advances only its sequence. Stale full snapshots remain rejected before live-world mutation.
- Worker processed_actions now persists canonical request fingerprints plus delegated completion identity. Exact same-player retries replay stored results; changed action/payload or cross-player reuse returns REQUEST_ID_CONFLICT. The relevant migration is idempotent and preserves legacy receipts.
- The ACTION transaction boundary couples persistent action state, claims, processed receipt, event, sequence and world time; outbound accepted/broadcast messages flush only after successful commit and rollback prevents a partial success.
- Reconnect still replays only a complete contiguous retained range of at most 50 events for an eligible non-current publisher; otherwise it falls back to full SNAPSHOT. RESYNC remains full SNAPSHOT.
- Historical Phase 11-B exact-head CI: Backend TypeScript build + 10 Vitest files / 740 reported executions, Android JVM tests + Debug APK, and Durable Object SQLite 4/4. At that baseline NativeCombatRuntimeIntegrationTest had 74 @Test methods and NetworkProtocolParityTest had 15. Current Phase 12-A local results are tracked in BUILD_TEST_AND_CI.md; mirrored/generated TS/JS executions are not unique source scenario counts.
- Protocol vocabulary remains 25 message types / 23 actions. No production Worker deployment smoke test or physical two-device multiplayer session is claimed; those remain later release gates.
- Phase 11 accepted scope is closed. Phase 12-A/B is CLOSED at dec3c0b6c66beb9d3a742ae4f12f6fd2160d56a8 / exact-head CI 43921670336. Phase 12 includes authenticated Bearer session binding, bounded Durable Object recovery, schema migrations 1-2, atomic LEVEL_DATA and token-fenced publisher handoff. Phase 13 is CLOSED for implementation and automated acceptance: lifecycle-v1 room authority, Android lobby, validated roster, render-thread routing, reconnect/exit UX and native gameplay gate are implemented. Current local evidence: backend 372 unique TypeScript source scenarios / 744 reported executions, Durable Object SQLite 17/17, Android core JVM 141/141 and forced Debug APK build PASS. Exact-head Actions run 1272 [https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44149425355] passed Backend, Android and Durable Object SQLite on fbf46ef15a1ec4554710a43894cfa4969c3176a7. Emulator-visible setup/lobby acceptance is deferred to Phase 20 and RTL/touch/layout to Phase 21. Production deployment and physical-device validation remain Phases 22-23.

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
