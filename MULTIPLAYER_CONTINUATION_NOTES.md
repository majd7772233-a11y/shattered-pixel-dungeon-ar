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

- Code checkpoint: `9402235c4e4ad87447bbc760ab13f80d21908823` on `multiplayer-framework-core-14118577486727081892`.
- Latest full validation workflow for this code checkpoint: [38876955077](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/38876955077), pending at note time. Older backend-only validation passed on an earlier SHA, but do not substitute it for the final workflow. CI now runs both JVM tests and Android `assembleDebug`.
- Stable mob identity is now server-assigned and stored in the authoritative native level snapshot. The publisher receives a `mobId -> entityId` ACK mapping; Java exports the mapping on later snapshots; `MessageRouter` and `WorldSnapshot` reconcile by stable ID before local Actor ID/class/position fallbacks; mob attack payloads carry `targetEntityId`, and the server resolves that ID against the authoritative snapshot rather than trusting the local Actor ID. Mapping cleanup runs when mobs disappear.
- Added server tests for stable ID persistence across movement/republish, changed local actor IDs, duplicate IDs, mismatched classes, repeated-snapshot idempotency and authoritative target lookup. Added JVM tests for forward/reverse mapping and stale-map cleanup behavior.
- Added a native level metadata bundle for custom tiles, custom walls, mob spawn classes and respawner state/cooldown. Metadata is preflighted before world mutation and custom visuals are rebuilt on the render thread after restore.
- Complete snapshots now require the native metadata bundle and explicit authoritative arrays. Snapshot validation rejects missing/duplicate stable IDs, and stale snapshots are rejected before mutation. A failed/malformed snapshot does not advance the acknowledged sequence; it requests a full RESYNC once per rejected sequence.
- Mob-death event reconciliation no longer calls `Mob.die()` on remote copies, which could duplicate loot/rewards. It removes the remote entity without generating loot and requests an authoritative snapshot; the legacy receiver was also hardened against duplicate death rewards.
- Phase 1 remains marked **In progress**, not Complete: the restore path now performs broad preflight and requests resync on application errors, but it does not yet provide a proven full rollback to the exact previous live state for every runtime exception. Native-world round-trip/idempotency tests covering all object types and physical two-device convergence have not been completed. Do not mark the phase Complete until those criteria are genuinely met.
