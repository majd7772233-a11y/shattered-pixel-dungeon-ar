# GPT.md — Internal Project Operating Notes

> This file is the working memory and implementation guide for the AI continuing this repository. It is intentionally open-ended: append new findings, decisions, rules, verification results and user requirements as the project evolves. Do not treat it as a user-facing README.

## 1. Project Identity and Main Goal

- **Repository:** `majd7772233-a11y/shattered-pixel-dungeon-ar`
- **Working branch:** `multiplayer-framework-core-14118577486727081892`
- **Game:** Arabic Shattered Pixel Dungeon codebase, based on the original Java/libGDX SPD engine.
- **Primary objective:** real multiplayer gameplay between two or more devices. Players should share a coherent match and world, perform actions, fight native mobs/other players, collect and drop items, preserve inventory and temporary effects, move between floors, and recover from disconnects without duplicated/lost actions.
- **Target transports represented in code:** Internet/WebSocket, LAN, and Bluetooth. Do not advertise any transport as working until it is actually wired and verified.
- **Internet Worker endpoint currently hardcoded in setup:** `https://spd-multiplayer.majd7772233.workers.dev/room/{roomName}/websocket`.
- **Current audited commit when these notes were written:** `657ce010edb03b55707d2b6d496abbb07b36fa7a`.
- **Roadmap:** read `ROADMAP.md` before starting a task. Its Phase 1 is the next completion phase from the current code state.

## 2. Non-Negotiable Product and Engineering Rules

1. **Original SPD Java gameplay is the specification.** Combat hit chance, damage, defense, weapon/armor behavior, procs, buffs, actor timing, mob AI, item behavior and level generation must come from the original engine. Do not invent a TypeScript formula and call it SPD-equivalent.
2. **Do not lie to the player.** Never display placeholder maps/mobs as real game data, fake connection success, or report a transport/mode as functional without evidence.
3. **One authority per state transition.** Every movement, attack, mob turn, item transfer, death, floor change and temporary effect must have a single authoritative outcome. Local prediction is acceptable only with acknowledgement/reconciliation and rollback.
4. **No duplicate event pipelines.** There must be one typed parser and one sequence-aware state application path. Do not keep legacy string parsing alive alongside the structured router once migrated.
5. **No silent corruption.** Empty catch blocks around network, serialization or restoration errors are a defect. Preserve the last known-good state, emit diagnostics, and request resync when appropriate.
6. **Snapshots must be idempotent and complete.** Applying the same full snapshot twice must not duplicate actors, buffs, drops, inventory or visuals. An explicit empty collection means “remove all entities of this category”; a missing field must be handled according to a documented partial/full-snapshot contract.
7. **Use stable network entity identities.** Native `Actor.id()` is a local runtime/scheduler identity and must not be the sole cross-device mob identity. Use stable server/entity IDs and maintain a local ID mapping.
8. **Validate all untrusted payloads.** A client flag such as `engineResult: true` does not prove the reported combat outcome is honest. Validate action identity, target, range, state transition, sequence, request freshness and replay resistance.
9. **Keep the user’s requested branch.** Continue on `multiplayer-framework-core-14118577486727081892` unless explicitly told otherwise. Do not merge to the default branch or create unrelated branches as a workaround.
10. **Execute directly.** Avoid unnecessary questions, overlong preambles and repeating plans instead of doing the work. Inspect the latest code, implement the requested task, run the appropriate validation, commit with an English message, and report concrete results and remaining limitations.
11. **Phase means the whole phase.** When the user says “Phase N”, complete every subtask and acceptance criterion for that phase in `ROADMAP.md`; do not return halfway through it.
12. **Update project memory.** Keep `GPT.md` and `ROADMAP.md` synchronized when code findings, phase status, architecture or acceptance criteria change.
13. **No Wrangler CLI suggestions for Android.** The user has explicitly said `npx wrangler` does not work on their Android environment and does not want it suggested. Use GitHub-based edits/Actions and the available Cloudflare dashboard/workflows where appropriate.
14. **Do not claim unperformed tests.** Distinguish static review, backend tests, Android compilation, deployment smoke tests and real two-device play. A green compile is not proof of working multiplayer.
15. **Avoid unrelated rewrites.** Respect the existing SPD architecture and the smallest coherent set of files needed for the phase. If a cross-cutting redesign is necessary, explain the concrete reason in the code/docs and keep it aligned with the roadmap.

## 3. Architecture Map — Read These Before Editing

### Android / Java game engine

- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/Char.java`
  - Native hit calculation, attack pipeline, damage mitigation, defense, actor speed and base combat semantics. This is essential before changing combat replication.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/hero/Hero.java`
  - Player action execution, inventory/equipment, hero stats/talents/buffs, native attack result replication and hero damage sync.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/mobs/Mob.java`
  - Native mob AI states and transitions, native speed, attack/damage behavior, death and drop/reward lifecycle.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/Actor.java`
  - Actor IDs, scheduler ordering, cooldowns, `Actor.add/remove`, `spend`, `timeToNow`. Do not restore a scheduler object without understanding these semantics.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/levels/Level.java`
  - Native tile arrays and mutable world collections: transitions, mobs, heaps, blobs, plants, traps, custom tiles/walls, level lock and other level metadata.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/Dungeon.java`
  - Run seed, depth/branch, initialization and level switching. Multiplayer seed changes must happen before native generation, and floor switching must follow native lifecycle rules.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/GameScene.java`
  - Multiplayer level publishing is currently hooked into scene creation. This is also where render-thread/UI and map updates matter.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/TitleScene.java`
  - Multiplayer entry button.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/MultiplayerTransportScene.java`
  - Internet/LAN/Bluetooth transport choice.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/MultiplayerSetupScene.java`
  - Current transport setup, host/join assumptions, room/IP defaults and start-session behavior. Review this before claiming a transport is usable.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/scenes/HeroSelectScene.java`
  - Applies the authoritative seed before run generation; verify ordering whenever seed/session startup changes.

### Multiplayer Java package

Path: `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/`

- `MultiplayerManager.java`: session lifecycle, transport ownership, player registry, sequence tracking, pending requests, sending actions, seed reception and level publishing.
- `NetworkTransport.java`, `TransportCallback.java`, `NetworkMessage.java`, `MessageType.java`, `NetworkActionType.java`: protocol and transport contracts.
- `InternetTransport.java`: custom socket/TLS/WebSocket implementation; verify handshake, framing, fragmentation, ping/pong, timeouts and close handling.
- `LANTransport.java`: LAN discovery and socket host/client behavior; host setup currently needs correction/real-device verification.
- `BluetoothTransport.java`: provider interface and 2-player limit. It is not a complete native Bluetooth integration merely because the class exists.
- `EmbeddedMatchAuthority.java`: legacy/simple LAN authority; current behavior is only a rudimentary approximation and must not be treated as native SPD authority.
- `MultiplayerActionDispatcher.java` and `NetworkActionBridge.java`: convert native hero actions to network actions. An enum mapping alone does not mean the server implements that action.
- `MessageRouter.java`: structured message parsing and application of accepted actions/events/snapshots. This should become the sole typed event reconciliation path.
- `RemotePlayerActionReceiver.java`: legacy receiver with substring/unescape parsing. It overlaps with `MessageRouter` and is a known source of duplicate/wrong state changes; remove or refactor only after all behavior is covered by the typed path.
- `RemotePlayer.java` and `MultiHeroManager.java`: remote player model/instances. Remote hero identity and state must not be inferred from string fragments.
- `PlayerFOV.java`: local calculation of a hero's field of view; shared/competitive visibility policy needs mode-specific verification.
- `SPDLevelSnapshot.java`: exports state from the actual native SPD world. Extend this as the native snapshot schema evolves.
- `WorldSnapshot.java`: restores/reconciles the snapshot into a locally generated SPD level. This is a critical P0 subsystem.
- `CoopMode.java`, `PvPMode.java`, `DeathmatchMode.java`, `SurvivalMode.java`: rule descriptors. Check server enforcement as well; these classes alone do not implement a mode.
- `LootClaimManager.java`: in-memory position-only claim helper; do not rely on it as durable or depth-safe item ownership.

### Server, protocol and CI

- `server/src/index.ts`: Cloudflare Worker/Durable Object room authority, SQL schema, sessions, snapshot/level storage, actions, event log, reconnect, broadcast/FOV and simplified mob movement. Read the whole affected method before changing it.
- `server/src/index.test.ts`: current tests are mostly isolated examples and toy calculations; they do not yet exercise the actual Durable Object action lifecycle.
- `server/package.json`, `server/tsconfig.json`, `server/wrangler.jsonc`: backend scripts/build/deployment configuration.
- `protocol/schema.json`: protocol schema; it must match `MessageType` and actual payloads. Current schema is stale because the Java enum includes `LEVEL_DATA`, while the schema's message type list does not.
- `.github/workflows/multiplayer-ci.yml`: on relevant pushes, runs backend dependency install/typecheck/tests and Android `assembleDebug`. Docs-only commits may not trigger it because of the path filters.
- `.github/workflows/deploy-server.yml`, `.github/workflows/release.yml`: inspect before changing deployment/release behavior.

## 4. Current System Behavior and What Is Already Present

At audit commit `657ce010edb03b55707d2b6d496abbb07b36fa7a`:

- The title screen has a multiplayer button and leads to a transport selector.
- Setup can select Internet, LAN or Bluetooth and starts a manager session; however, startup does not wait for a robust room-ready/world-ready handshake.
- `MultiplayerManager` sends action payloads with the hero-state bundle, handles session tokens/sequence values, accepts the authoritative seed and publishes a native level snapshot.
- `GameScene.create()` calls `publishCurrentLevel()`.
- `SPDLevelSnapshot` exports tile geometry and collision flags, transitions, mobs and their serialized bundles/buffs/cooldowns, heap contents/items, traps, blobs, plants, and hero state including combat bundle, inventory, HP/HT/position, buffs and cooldown.
- `WorldSnapshot` already tries to apply tiles/transitions, create missing mobs, remove stale mobs without re-awarding their loot, restore mob buffs/timing, rebuild native heaps/items, traps, plants, blobs, hero state, remote players and claimed items.
- Native Java attack code reports hit/damage/HP results for local hero attacks against mobs/remote heroes. The server validates some range and state fields, persists HP and emits events.
- Hero damage synchronization exists to report the native post-damage HP/HT.
- Server has basic movement/pathfinding, a simplified mob movement loop, level snapshot storage, action/event sequencing and reconnect snapshot/event replay.
- CI passed for the audit baseline commit. This means only that the workflow's current tests and debug compilation passed.

Do not redo these features blindly. Read their current implementations, identify the missing acceptance criteria, and complete them.

## 5. Known Gaps / Defects to Track

### Snapshot and world reconstruction

- Full snapshot restoration must be validated as a contract; many restoration branches currently catch errors and continue, which can make two clients silently diverge.
- Mob matching by native actor ID/class-name fallback is not stable enough across devices or same-class mobs. Introduce stable network entity IDs.
- Ensure complete snapshots distinguish missing fields from intentionally empty collections, and reapply the same snapshot idempotently.
- Audit all gameplay-relevant level state beyond tiles/transitions/heaps/traps/blobs/plants: exploration/visited/mapped/fog, level lock/feeling, custom tiles/walls, respawner and inter-level state as applicable.
- Verify every native bundle survives the JSON/protocol path and that class loading is restricted/validated. Constructor fallbacks must not silently replace unique items or special mob states.
- Ensure render-thread updates and actor scheduler state are correct after restoring objects, especially blobs, buffs, mobs and heaps.
- Ensure death tombstones and kill-generated loot are exactly-once.

### Combat and AI

- Native player attack results are reported, but a client-controlled `engineResult` flag is not cryptographic proof of a valid engine result. Validate impossible HP transitions, target identity, duplicate/replayed events and attacker/target state.
- Do not add server-side random combat to “match SPD”; original SPD combat depends on native stats, RNG, weapon/armor mechanics, buffs, talents, challenges and subclass behavior.
- `MatchRoom.processMobTurns()` is simplified TypeScript pathing/target selection, not native `Mob.act()`. It does not fully implement mob-specific AI, attacks, special abilities or actual actor scheduler ordering.
- The server's `getNativeMobTurnDelay()` currently derives delay from `baseSpeed` and a reciprocal approximation; it omits effective speed modifiers and actor-specific turn costs.
- Choose one authority for mob turns. Local native simulation plus server generic simulation can create duplicate or conflicting actions.
- Misses, zero-damage attacks, native effects, shield changes, buffs, death and drops must all be represented as exact outcomes.

### Event routing and actions

- `MessageRouter` and `RemotePlayerActionReceiver` overlap. The legacy receiver uses substring matching and can remove an entire heap on pickup; a single item picked up must not make other items disappear.
- `NetworkActionBridge` maps actions such as BUY, INTERACT, UNLOCK, MINE, ALCHEMY, USE_ITEM, USE_ABILITY and REVIVE, but the server's explicit ACTION handler currently covers only a subset (including MOVE, LVL_TRANSITION, ATTACK, WAIT, PICKUP, OPEN_CHEST and SYNC_HERO_STATE). Unhandled actions must not appear functional.
- The server validates native combat fields but still relies on client-reported results; add state-transition checks, replay protection and authority design.
- Action rejection/timeout/prediction rollback and pending action cleanup need to be consistent.
- Sequence gaps should trigger event replay only when the entire contiguous range is present; otherwise request/apply a full snapshot.
- All messages must be parsed structurally and bounded by schema/size/count/range limits.

### Transport and session lifecycle

- `MultiplayerSetupScene.startMultiplayerSession()` switches to HeroSelect immediately after `startSession`, not after a confirmed connection/session/world-ready state.
- LAN host code starts a local server and then invokes the ordinary connect path using a loopback endpoint. This needs a correct host-authority path and physical-device verification.
- `BluetoothTransport` depends on an injected `NativeBluetoothProvider`. Without a provider, current paths can report connected without a real link. Wire a real Android implementation or disable the option honestly.
- Internet transport is a custom socket/WebSocket implementation; verify its protocol details against the Cloudflare Durable Object endpoint.
- Handle disconnect cleanup, reconnect token identity, host/publisher handoff, room lifetime and restart/recovery.
- The level publisher is a client. Ensure a disconnected publisher cannot leave the room without a valid world snapshot/authority.

### Level lifecycle, persistence and mode rules

- Server initializes a fallback rectangular placeholder level and dummy mobs before native `LEVEL_DATA` arrives. Never treat this fallback as playable authoritative SPD content.
- `LEVEL_DATA` currently validates branch 0 only; keep that limitation explicit until other branches are truly supported.
- Snapshot replacement and multi-table actions need atomic persistence/transactions.
- `claimed_items` is keyed by `item_pos` as its primary key despite also storing `depth`; identical positions on different floors can collide. Use stable depth-aware heap/item IDs and migrate existing data safely.
- Complete level transitions must transfer the native level and player state together; do not switch clients on depth-only events.
- Game mode classes describe intended rules but server/session enforcement for ready/start, death, revive, respawn, spectators, score and match end needs end-to-end tests.

### UI and testing

- The multiplayer UI exists but needs robust host/join/ready/connect/sync/retry/leave/error states. A button and a scene are not proof of a working flow.
- Localization keys and Arabic/RTL layout must be checked for every new UI string.
- Backend tests are currently shallow. Add tests against the actual Durable Object/action state and snapshot handling, then a physical two-device matrix.
- Keep unsupported transports disabled/clearly unavailable instead of displaying false success.

The complete phase-by-phase execution list and acceptance criteria are in `ROADMAP.md`. Keep that file as the authoritative task checklist and this file as implementation context.

## 6. Recommended Work Method

1. Fetch the current branch head and verify it is still `multiplayer-framework-core-14118577486727081892`. Never assume the audit SHA is still current.
2. Read `ROADMAP.md` and identify the requested phase. Fetch the latest version of every affected file, including helper classes and tests.
3. Trace the flow end-to-end: native action -> dispatcher -> protocol payload -> server validation/persistence -> sequenced event -> typed client router -> native state reconciliation -> reconnect snapshot.
4. Before changing code, identify which existing implementation should be extended and which legacy path conflicts with it.
5. Implement the complete phase, including dependent code paths, schema, migration and tests. Do not stop after adding an enum, field or event name.
6. Run appropriate validation. For server changes, run the workflow's TypeScript build and tests. For Java changes, run Android debug compilation. For protocol/world changes, add focused tests and perform two-device tests when available.
7. Inspect the latest GitHub Actions run for the exact final SHA. If it fails, fetch the failing job logs, fix the cause and rerun. Do not report a prior commit's green status as proof for a newer commit.
8. Commit with a concise English message on `multiplayer-framework-core-14118577486727081892`.
9. Update phase status in `ROADMAP.md` and add a dated note here with changed files, exact commit, test status and remaining gaps.
10. In the final user response, report what actually changed, exact commit link, actual CI status, and what remains. Be direct; do not pad the answer with a long plan or claim unperformed real-device testing.

## 7. Definition of “Done”

The project is not done when it compiles or when two clients merely connect. Done means:

- Two physical devices can join the same real room and initialize a consistent native SPD run.
- Each gameplay action has one accepted/rejected result, one sequence, and consistent reconciliation.
- Native SPD combat, mob AI, actor timing, items, buffs and floor transitions remain correct.
- Snapshots reconstruct the complete gameplay-relevant world after reconnect or local divergence without duplicates or missing objects.
- Inventory/loot/death/revive/mode rules are consistent and exactly-once.
- Each advertised transport works on real devices; unsupported transports do not fake success.
- Backend integration tests, Java/build checks and the two-device acceptance matrix pass for the exact release commit.
- The roadmap has no unresolved P0 items and known limitations are documented honestly.

## 8. Append-Only Working Log (Keep This Section Open)

### 2026-10-16 — Baseline audit and roadmap creation

- Audited the branch tree (2,174 entries; 1,320 Java files, 2 TypeScript files, 6 XML files, 35 paths matching test/spec naming) and reviewed the multiplayer package, key SPD engine integration points, server action/snapshot code, protocol schema, setup/title scenes, backend tests and CI workflow.
- Baseline commit: `657ce010edb03b55707d2b6d496abbb07b36fa7a`.
- GitHub Actions run `38759441278` succeeded for that exact SHA. This is compile/current-check evidence only, not real-device proof.
- Created `ROADMAP.md` with ten phases beginning with snapshot/reconstruction correctness and proceeding through native combat, native AI/scheduling, movement/transitions, inventory/effects, transport, game modes, protocol/recovery, UI and final end-to-end validation.
- Key confirmed risks: generic server mob AI does not equal native SPD AI; overlapping legacy/typed event handlers; shallow backend tests; stale protocol schema (`LEVEL_DATA` missing); LAN host flow and Bluetooth provider wiring need correction/verification; item claim key is not depth-safe; server trusts client-reported native combat fields too much; setup launches before a confirmed ready state.
- Next work starts at **ROADMAP Phase 1**. Do not restart previously implemented exporter/restore/combat scaffolding without checking the latest code and acceptance criteria.

### Future notes

Append new dated sections here whenever a phase starts/completes, architecture changes, the user gives a durable rule, or verification reveals a new issue. Keep this file open-ended; do not replace this log with a closed summary.
