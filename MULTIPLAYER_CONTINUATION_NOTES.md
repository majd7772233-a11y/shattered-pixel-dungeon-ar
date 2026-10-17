# Multiplayer Continuation Checkpoint

Updated: 2026-10-16 (UTC)

## Exact resume point

- Repository: https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar
- Required branch: `multiplayer-framework-core-14118577486727081892` (do not switch branches or merge into the default branch).
- Branch head when this checkpoint was written: `ba97f1b71605bec2e5642355fe0fcbc1add08f68`
- Head commit: https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/commit/ba97f1b71605bec2e5642355fe0fcbc1add08f68
- Latest gameplay-code commit before the documentation commits: `657ce010edb03b55707d2b6d496abbb07b36fa7a`
- Gameplay-code commit: https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/commit/657ce010edb03b55707d2b6d496abbb07b36fa7a
- The latest recorded CI run is `38759441278`, success for exact gameplay commit `657ce010edb03b55707d2b6d496abbb07b36fa7a`. This does NOT prove physical two-device gameplay. Recheck Actions for any newer run before further claims: https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions
- Do not assume that the most recent CI run tested the documentation-only head. Verify the latest code commit/run SHA first.

## User's exact active request

Continue implementing, not merely planning:
1. Complete snapshot restoration for entities absent locally.
2. Complete dropped item heaps and inventory restoration.
3. Complete traps and timed/temporary states, including correct actor scheduler timing.
4. Match hit/miss, defense, damage, native effects and action/turn costs to the original Java Shattered Pixel Dungeon engine.
5. Preserve and restore native object bundles; do not replace real state with constructor defaults or fake approximations.
6. Inspect, implement, run checks, fix failures, commit, and report honestly. User explicitly dislikes delay, excessive discussion, repeated plans and false claims.

## Work already present in the branch — verify before modifying

The following code is present by the gameplay-code commit `657ce010edb03b55707d2b6d496abbb07b36fa7a` and its ancestors. Extend it rather than duplicating it.

- `SPDLevelSnapshot.java` exports native level geometry, transitions, mob bundles/buffs/cooldowns, heap/item bundle data, traps, blobs, plants and hero state/inventory/buffs/cooldown.
- `WorldSnapshot.java` applies terrain and transitions; reconciles existing mobs, removes stale/dead mobs without rerunning loot rewards, restores mob buffs/cooldowns, rebuilds heaps/items and traps, restores plants/blobs, restores hero native combat attributes/inventory/buffs/cooldown, and reconciles remote heroes and claimed items. This is still not proven to be complete or fully idempotent.
- Snapshot parsing in `MessageRouter.java` reads native level dimensions/tiles, mobs, buffs and related arrays and routes snapshot restoration.
- Native attack replication has been added to `Hero.java`: report engine-resolved attack hit/miss and damage/HP data against mobs/remote heroes, rather than inventing server-side combat RNG.
- Hero damage synchronization uses `SYNC_HERO_STATE` / `PLAYER_DAMAGED` to publish native post-damage HP/HT.
- Server validates some reported target/range/HP values, persists hero HP/HT and broadcasts damage events.
- Server level snapshot storage includes native dropped heaps; pickup handling attempts to remove only one item from a heap and preserve the remaining items.
- Server mob timing reads native snapshot speed/cooldown where available, but `getNativeMobTurnDelay()` is still a reciprocal approximation and generic TypeScript mob pathing/turn simulation is NOT equivalent to native `Mob.act()` or the native `Actor` scheduler.
- Existing commit history includes:
  - `82d5ff186b8c111e712795dba03361d1d691915b` — expose authoritative dropped heap snapshots.
  - `8231965e368db7732f8a39842115dc10f92ae24f` — send native drops after killing mobs.
  - `3dfca349600198e5913423146767a532aaa67c11` — persist native item drops after authoritative combat.
  - `0dbf00433f03f7884863148a65d53f87b0bf9f32` — prevent dead mobs from respawning/duplicating loot on restore.
  - `b33fbf55ebaa945f5edded54c465f4a8dbaac870` — restore remote players' native inventory and temporary buffs.
  - `dd994518aa14e9d44cad28823180ba29030bc32f` — include plants and timed blobs in resync snapshots.
  - `3444575a5341fd8b94c6b6da07f4de562c094d66` — replicate native SPD combat outcomes against mobs and remote heroes.
  - `babf13b58fc06f39ecbfa19c8abecbfa2b236431` — use native SPD attack results without server RNG.
  - `b73c470390f258e7a2fd6af90b82c84d70b251ae`, `89b7b00a8aaa42c78b906114313458c0da6ac1be`, `79e04b1c00931ea7194337f579ca243472c0058b`, `657ce010edb03b55707d2b6d496abbb07b36fa7a` — native hero combat-state snapshot/restore fixes.

## Known incomplete or risky items — do not mark finished

### Full world reconstruction
- Stable network entity IDs are still needed; local `Actor.id()` and class-name fallback are not unique across clients or for multiple mobs of one class.
- Audit all fields in current `WorldSnapshot.java` and `SPDLevelSnapshot.java`; verify whether missing objects are instantiated with exact native bundles and whether stale objects are removed without duplicate rewards.
- Check native bundle serialization survives the JSON path. Avoid silent catch-and-continue behavior; report restore errors and request resync.
- Verify traps are rebuilt as exact native objects, blobs/plants are registered in the correct level collections and scheduler, and cooldown/timing is restored correctly.
- Verify empty snapshot arrays clear stale objects; missing fields versus explicit empty arrays must have a documented full/partial snapshot contract.
- Still audit level exploration/visited/mapped state, level lock/feeling, custom tiles/walls, respawner/inter-level metadata and any other gameplay-relevant native level state.
- Confirm render-thread updates, map refresh, FOV/pathfinding, actor scheduler and sprites after geometry/object replacement.
- Repeated snapshot application must be idempotent and must not duplicate actors, inventory, buffs, drops or effects.

### Items and inventory
- Pickup currently identifies a picked item using position/class name, which is not a stable unique item ID (especially for multiple items of the same class or stacks). Replace with stable heap/item IDs, depth-aware durable ownership and atomic/idempotent inventory/heap updates.
- Check `claimed_items` database primary key: it was previously position-only and can collide between floors. Add safe migration or stable depth+heap/item identity.
- Complete drop, throw/missile, consume, equipment, gold, shop, chest/key consumption, quickslot, alchemy, quest-item and special heap behavior.
- Make the inventory state server-persisted per player, not just opportunistically included in a hero payload.
- Preserve stack quantities, upgrades, enchantments, curses/knowledge, glyphs, container contents and unique-item properties via exact native bundles.
- Do not remove a whole heap when one item is picked up. Test same-class duplicates, multi-item heaps, stacks, competing pickups and floor changes.

### Native combat and timing
- Native hero attack outcomes are now reported, but server still trusts client-reported engine results to some degree. `engineHit`/`engineDamageResult` flags are not proof. Validate stable attacker/target identity, depth, pre/post HP, action/request sequence, replay resistance and possible transitions.
- Make hit/miss, zero-damage hits, armor/shield changes, procs, buffs/debuffs, knockback, death and drops exactly-once events.
- Confirm native ranged detection and legal range rules, especially weapon-specific range and thrown weapons.
- Ensure action costs/cooldowns for misses, attacks, special attacks and delayed actions match native engine values; do not infer every mob turn as `1 / baseSpeed`.
- Mob AI and timing are still generic server simulation. Choose a single authority for mob execution; do not claim native AI parity until native per-mob `act()`, effects and Actor scheduler behavior are represented or executed by an engine-backed authority.
- Check all `Actor.add/remove`, `spend`, cooldown, delayed action, buffs and mob death/drop paths.
- Remove/resolve duplicate state changes between typed `MessageRouter` and legacy `RemotePlayerActionReceiver`.

## Required immediate continuation sequence

1. Fetch current branch head and inspect recent commits; do not assume this checkpoint's SHA is still current.
2. Read `ROADMAP.md`, `GPT.md`, this file and the current implementations of `WorldSnapshot.java`, `SPDLevelSnapshot.java`, `MessageRouter.java`, `RemotePlayerActionReceiver.java`, `Hero.java`, `Char.java`, `Mob.java`, `Actor.java`, `Level.java`, and `server/src/index.ts`.
3. Run/inspect the latest GitHub Actions run for the latest code SHA. The last known green run was `38759441278` for `657ce010edb03b55707d2b6d496abbb07b36fa7a`; do not treat it as proof for any later code commit.
4. Continue fixing Phase 1 snapshot/entity reconstruction and Phase 2 native combat, then Phase 3 native mob AI/scheduler per `ROADMAP.md`. These phases are NOT complete merely because scaffolding exists.
5. Add tests for missing/stale entities, idempotent snapshots, explicit empty arrays, bundle failures, multiple items per heap, duplicate/replayed combat events, native miss, damage/armor/death and cooldown/timing.
6. Run backend typecheck/tests and Android `assembleDebug` on the exact final code SHA. Fix failures and rerun. Do not claim physical two-device validation unless actually performed.
7. Commit on the required branch with an English message and update `GPT.md`, `ROADMAP.md` and this checkpoint with exact SHA, workflow URL/status and remaining gaps.

## Copy-paste prompt for the next conversation

“@GitHub اقرأ `GPT.md` و`ROADMAP.md` و`MULTIPLAYER_CONTINUATION_NOTES.md` من فرع `multiplayer-framework-core-14118577486727081892`، وافحص آخر commit وActions أولًا، ثم أكمل مباشرة من نقطة التوقف: استكمال إعادة بناء العالم من snapshot، الكائنات المفقودة، heaps/items/inventory، traps/plants/blobs والبفات والحالات المؤقتة، ثم مطابقة القتال والتوقيت مع محرك SPD Java الأصلي. لا تعِد تنفيذ الموجود ولا تعتبر Phase 1/2/3 مكتملة بلا تحقق. نفّذ التعديلات والاختبارات وأصلح الفشل، ثم حدّث ملفات التوثيق وسجّل commit ونتيجة CI الدقيقة. لا تدمج إلى main، لا تقترح Wrangler CLI، ولا تطل الكلام أو تدّعِ اختبار جهازين لم يحدث.”


## 2026-10-16 implementation progress — incomplete

- Code commit: `25955a6d8e21f1947a4ac5c7afe7d3971cc76c4c`.
- Verification run: [38809893294](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38809893294), **pending when this note was written**. Recheck this run and verify its `head_sha` before reporting tests.
- Snapshot restore no longer creates constructor-default fallback objects for missing/invalid native bundles for mobs, items, traps, plants and blobs. Previously empty catch blocks now log restore diagnostics.
- Native attack validation now rejects HP increases and damage values inconsistent with the reported HP delta; focused unit tests were added for hit, miss, impossible healing, mismatched damage and invalid numbers.
- These changes are a partial safety improvement, not completion of snapshot reconstruction or native combat parity. The live-world restore still needs all-or-nothing preflight and resync behavior, stable entity/item identities, full level metadata, correct scheduler/effect restoration and durable item/inventory transactions. The server's generic mob turn simulation remains non-native.
- Phases 1–3 remain open. No real two-device verification has been performed.


## Verification correction — 2026-10-16

- A first Android compilation of the strict-bundle/logging changes failed because five catch clauses still listed `ReflectiveOperationException` after constructor fallback code had been removed. This failure was inspected from Actions logs, and the obsolete checked exception types were removed in commit `63da31501485255c4ebae7b9f6bd04f4ae511fdb`.
- The new validation run for that fix is [38810085987](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38810085987), pending at the time of this update. Do not report the Android build as passing until that exact run completes.
- The earlier backend job passed on code SHA `25955a6d8e21f1947a4ac5c7afe7d3971cc76c4c`, including TypeScript build and tests; that is not a passing full-workflow result for the latest code SHA.


### 2026-10-16 — Phase 1 snapshot-contract hardening (not complete)

- Code checkpoint: `906199d90ce28dbf878a32786930d409dd338df8`.
- Added strict native snapshot completeness checks on the Worker side and focused tests for missing collections, missing native bundles, unsupported schema versions and oversized bundles.
- Tightened Android preflight validation for tile geometry, transition enums/targets, player state, mob/buff cooldowns, heap types/items, traps, plants, blobs, claimed cells and bundle-size bounds before restoration.
- Extended the native level snapshot with visited/mapped cell state, level locked/feeling metadata and heap `autoExplored`; added the `LEVEL_DATA` message type to `protocol/schema.json`. Recorded the user's permanent rule in `GPT.md`: a requested phase must be implemented end-to-end, not treated as done from scaffolding or status reporting.
- GitHub Actions run [38815013651](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38815013651) passed for the exact code SHA above: backend TypeScript build/tests and Android `assembleDebug` both succeeded.
- **Phase 1 remains incomplete.** This commit does not yet implement server-assigned entity IDs end-to-end, prepared native-object staging/rollback, custom tile/wall and respawner metadata, or Java round-trip/idempotency tests. Do not mark Phase 1 complete or start Phase 2 until those criteria are actually implemented and tested. No physical two-device test was performed.


## 2026-10-16 — Phase 1 continuation: stable IDs, metadata and failed-restore recovery

- Code checkpoint: `70c8b6e3de9258f0bed1a977def0d71c371338ce` on `multiplayer-framework-core-14118577486727081892`.
- Latest full validation workflow: [38878127239](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38878127239) — **success**. Backend TypeScript build/tests passed; JVM unit tests and Android `assembleDebug` passed.
- Stable mob identity is now server-assigned and stored in the authoritative native level snapshot. The publisher receives a `mobId -> entityId` ACK mapping; Java exports the mapping on later snapshots; `MessageRouter` and `WorldSnapshot` reconcile by stable ID before local Actor ID/class/position fallbacks; mob attack payloads carry `targetEntityId`, and the server resolves that ID against the authoritative snapshot rather than trusting the local Actor ID. Mapping cleanup runs when mobs disappear.
- Added server tests for stable ID persistence across movement/republish, changed local actor IDs, duplicate IDs, mismatched classes, repeated-snapshot idempotency and authoritative target lookup. Added JVM tests for forward/reverse mapping and stale-map cleanup behavior.
- Added a native level metadata bundle for custom tiles, custom walls, mob spawn classes, pending items, level view distance/colors and respawner state/cooldown. Snapshots include all native tile flags (flammable, secret, avoid, water, discoverable and openSpace), preserve exact heap item order, and refresh custom visuals/map cells/FOV on the game thread.
- Complete snapshots now require the native metadata bundle and explicit authoritative arrays. Snapshot validation rejects missing/duplicate stable IDs, and stale snapshots are rejected before mutation. A failed/malformed snapshot does not advance the acknowledged sequence; it requests a full RESYNC once per rejected sequence.
- Mob-death event reconciliation no longer calls `Mob.die()` on remote copies, which could duplicate loot/rewards. It removes the remote entity without generating loot and requests an authoritative snapshot; the legacy receiver was also hardened against duplicate death rewards.
- A last-known-good snapshot cache now rolls the world back when a later restore returns false or throws, then requests resync without advancing the acknowledged sequence. This is a best-effort rollback for the active level, not yet a proof of rollback across every possible level-dimension transition/runtime failure.
- Added JVM coverage for custom tile/wall metadata Bundle serialization, deserialization, restoration and explicit-empty collection behavior. The first run exposed test-level pathfinder initialization; the fixture now calls native `Level.setSize(8, 8)`, and the complete CI run passes.
- Phase 1 remains marked **In progress**, not Complete: full `WorldSnapshot.restoreWorld` round-trip/idempotency across every live entity type, rollback through all level-dimension transitions, and physical two-device convergence have not been verified. The latest code checkpoint passed backend tests, JVM tests and Android debug compilation; do not claim a physical two-device test was run.


## 2026-10-16 — Phase 2 native combat replication hardening (still in progress)

- Code checkpoint: `74237e04f6f64c8bb3f1464bcf0c5cc382f38ca5` on `multiplayer-framework-core-14118577486727081892`.
- Validation workflow for that exact code checkpoint: [38885399886](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38885399886) — **success**. Backend TypeScript build/tests, JVM unit tests, and Android `assembleDebug` all passed for code SHA `74237e04f6f64c8bb3f1464bcf0c5cc382f38ca5`.
- Added a versioned native combat outcome contract with server-stamped match ID, depth, sequence and request ID; stable attacker/target IDs; pre/post HP/HT/positions; shields, native buff bundles, action cost and target hero state.
- Hardened attack validation for stable target resolution, current depth, native melee/ranged geometry, HP/HT transitions, shield/buff payload bounds, knockback destination occupancy, request-ID replay/cross-player collision, and loot snapshots. A kill snapshot may alter heaps only at confirmed dead-mob cells; death replication requests a full authoritative snapshot to avoid duplicate loot generation.
- Added native target shield/buff serialization, sanitized PvP hero-state merging that preserves the defender's previously trusted class/equipment/talents, and safe remote-hero death handling so a replica does not run local Ankh/statistics/resurrection side effects.
- Added a native mob-to-hero damage event carrying pre/post player HP/HT/position/shield/buffs and source-mob pre/post HP/HT/position/buffs. The server validates the mob identity and position, then persists reactive mob damage/knockback and its loot snapshot when a native proc kills that mob.
- Added server contract tests for strict native damage fields, hero-state merge safety, request-ID replay classification, native buff payloads, bounded loot snapshots, armor-reduced/zero-damage/lethal transitions, and stable entity identity.
- **Phase 2 remains in progress.** The Worker still does not execute the original Java combat engine or reproduce its RNG, so a malicious client can submit a plausible but forged in-range damage amount. Secondary multi-target/periodic effects and PvP death/Ankh outcomes also lack complete end-to-end Java verification. Do not mark Phase 2 complete, and do not describe this client-resolved protocol as cheat-proof.
- No physical two-device test was performed.


## 2026-10-16 — Phase 2 continuation checkpoint (not complete)

- Latest gameplay-code commit: `e911d7a7e76f85a1c3a7b10675715f2ee62d1ef1`. Validation: [38937930225](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38937930225); backend typecheck/tests passed, Android JVM tests and debug APK compilation were still running when checked. Recheck the exact run before claiming overall success.
- `Hero.damage` now captures `targetBuffsBefore` before mob damage/defensive procs. The Worker compares that pre-state against the previously saved hero state and rejects absent/malformed/stale buff snapshots.
- PvP attack validation now compares the target's reported pre-attack buff state against the defender's saved native hero bundle.
- Server-broadcast combat outcomes include target buff pre-state. `protocol/schema.json` now has a typed `NativeMobDamagePayload`, requires `targetBuffsBefore`, and uses conditional fields for MOB-vs-PLAYER attack targets and mob-sourced outcomes. This fixes the previous mismatch where player-sourced events were required to contain mob-only state.
- Added backend coverage for native hero buff pre-state matching, mismatches, malformed snapshots, invalid cooldowns, and missing pre-state fields.
- **Phase 2 remains incomplete.** The Worker still validates client-reported results rather than independently executing original SPD Java RNG, hit/damage calculations, weapon/armor procs and secondary effects. A plausible but forged in-range damage result remains possible. Secondary/periodic effect and PvP death/Ankh end-to-end convergence are not verified. No physical two-device test was performed.
- Continue on `multiplayer-framework-core-14118577486727081892`; do not merge to `main`. Do not mark Phase 2 complete until the authoritative-outcome gap and the remaining listed acceptance criteria are actually resolved.


## Phase 2 continuation checkpoint — native secondary and periodic mob state (2026-10-17)

- Code checkpoint: `c02b5a7e48ac8ded1e3bd9dbf4a77c425774901b` on `multiplayer-framework-core-14118577486727081892`.
- Validation: [GitHub Actions run 38980763580](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38980763580) completed successfully: TypeScript build/backend tests and Java unit tests/debug APK build passed.
- Added native secondary-mob combat delta capture around `Hero.attack`: stable entity IDs, pre/post HP/HT/position/shield/buff state, tombstones for native removals, and heap snapshots when secondary mobs die. The Worker validates each delta against its saved pre-state and only commits bounded state transitions and loot changes at native death cells.
- Secondary effects are included in the accepted mob attack outcome. Peers request the authoritative snapshot when secondary deltas exist instead of trying to partially replay multi-entity effects; rejected optimistic attacks also trigger resync.
- Added `SYNC_MOB_STATE` for publisher-owned native mob damage from periodic buffs, blobs, traps, items, and spell sources outside the `Hero.attack` pipeline. The Worker accepts it only from the server-designated level publisher, verifies exact saved pre-state, validates bounded post-state and death loot, and broadcasts `CHAR_DAMAGED` without causing duplicate local mob rewards.
- Session handshake now exposes the server-designated level publisher. Added tests for secondary mob delta pre-state, stale/unknown/duplicate/oversized deltas, death heap requirements, bounded publisher-only HP/shield gains, and publisher identity authorization.
- **Phase 2 is still not complete.** The core blocker remains: an attacking client can submit an internally consistent, plausible native attack result, and the Worker does not independently run SPD's Java RNG/damage pipeline or require an independent target-owner native combat confirmation. Full end-to-end secondary effect and player death/Ankh convergence tests are also still missing. Do not mark Phase 2 complete or begin Phase 3 until those acceptance criteria are actually closed.

## Phase 2 continuation — native mob bundles and render-thread safety (2026-10-17)

- Verified code SHA: `dac97070ee6f11410604a61afb5aeade8873f446`.
- CI run [38984614970](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38984614970) passed both jobs on that exact SHA: backend TypeScript build/tests and Android JVM tests/debug APK compile.
- Native combat request resolution is now dispatched to the game/render thread. Event batches, accepted actions, and remote native action messages are also applied on the game thread.
- PvP target damage and blessed-Ankh outcomes are committed as one native combat transaction; Hero.damage no longer emits competing environment/REVIVE messages during a native attack.
- Complete native mob bundles are captured for direct targets, secondary combat deltas, publisher-owned periodic mob damage, and source-mob defensive-proc changes. The Worker validates bounded bundle strings and stores them in the authoritative level snapshot; peers request a full snapshot when scalar event replay cannot reproduce the mob's native state.
- Schema and tests were updated for native mob bundle fields. Recent commits include `48f51f4`, `c84afe7`, `d9bc948`, `612b3fb`, `de68260`, `4b960de`, `cec1358`, `e86dde7`, `276e0c2`, `0507993`, `c63cc56`, `78b83b1`, `70c4778`, `59c6f3e`, `7c7de9e`, `71407f8`, `dd956dc`, `58423cb`, `7af5c55`, and `dac9707` (abbreviated SHAs).
- **Phase 2 is not complete yet.** The mob-to-player damage path is still reported by the damaged player's local simulation without independent level-publisher resolution; unblessed-Ankh resurrection and complete PvP death/resurrection convergence lack end-to-end verification; comprehensive Java native combat integration tests and physical two-device convergence have not been performed. Do not mark Phase 2 complete or begin Phase 3 until those are resolved.
- Continue on `multiplayer-framework-core-14118577486727081892`; do not merge to `main`.


## Phase 2 continuation — authority routing and state reconciliation (2026-10-17)

- Verified code SHA: `8ed14c7b891255ac8948be99c1b20d3cb822c957`.
- CI run [39014294483](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39014294483) passed on that exact SHA: backend TypeScript build/tests and Android JVM tests/debug APK compilation.
- Non-publisher mob attacks are routed to the designated level publisher; if no publisher is available, the Worker rejects the attack instead of falling through to client-reported damage. PvP outcomes are resolved by the target player's native simulation through a pending authority request.
- Reactive source-mob HP/shield/buff/position/bundle/loot writes are committed only when the sender is the designated level publisher. Non-publisher side effects are discarded, the accepted target-hero state is merged from trusted state, and clients are told to resync the level.
- The server now persists and broadcasts the authority-merged attacker state after mob and PvP combat, including accepted native inventory consumption and cooldown changes. Clients reconcile both attacker and target hero bundles; failed native event restoration requests an authoritative snapshot.
- Legacy damage-only packets are no longer replayed through `Mob.damage()`, avoiding duplicate local armor, buff, death, reward, and loot processing. Mob combat and periodic `CHAR_DAMAGED` events request full authoritative snapshot reconciliation where scalar event replay is insufficient.
- Added/expanded backend tests for target-buff pre-state binding, publisher-only reactive mob state ownership, inventory reconciliation, and Ankh counter protection. An attempted direct `Char.attack` JVM test could not initialize the full game-global combat runtime in the headless unit-test environment, so it was removed; no false claim of native end-to-end test coverage is made.
- **Phase 2 is still in progress.** Remaining acceptance gaps are full game-runtime tests for native hit/miss, secondary/thorns/retaliation effects, player death/resurrection/Ankh convergence, multi-client state convergence, and physical two-device verification. Do not begin Phase 3 or mark Phase 2 complete until those are verified.
- Continue on `multiplayer-framework-core-14118577486727081892`; do not merge to `main`.
