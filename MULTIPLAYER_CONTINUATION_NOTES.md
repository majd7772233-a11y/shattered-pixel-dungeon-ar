# Multiplayer Continuation Checkpoint

Updated: 2026-10-20 (UTC)

## Repository / branch guardrails

- Repository: https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar
- Working branch: `multiplayer-framework-core-14118577486727081892`
- Do not merge to `main` or switch branches as part of this continuation.
- Code checkpoint: `b19693e81280003381c42003fb7928ff899ade98`
- Verified CI run for that exact code checkpoint: [39478567024](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/39478567024) — success. It passed backend TypeScript build/tests plus `./gradlew test assembleDebug` (JVM test suite and Android debug APK build).
- Latest result proves automated CI only. It does not prove physical two-device Android gameplay.

## Phase 2 — Native combat replication

**Implementation and automated CI acceptance: complete.** See the Phase 2 section of `ROADMAP.md`.

Key verified code paths/tests include:
- Native SPD hit/miss and true zero-damage/shield-only outcomes.
- Real defense/retaliation, attacker's post-combat state and native inventory changes.
- Blessed-Ankh revival and delegated kill XP attribution to the true attacker.
- Mob-to-player and periodic mob damage reports.
- PvP native combat and Ankh reconciliation.
- Secondary mob changes with stable entity IDs and complete native bundles.
- Stable-ID convergence across two simulated worlds with different local `Actor.id()` values.
- Stale/replayed events, duplicate death/loot prevention and authority-only result acceptance.
- Headless-safe native state/death processing when optional sprites/presentation are not attached.

Latest relevant fixes include:
- `NativeMobCombatDelta` now uses a typed native payload and sentinel primitive defaults so JSON explicitly carries `complete`, an empty/non-empty `deltas` array, and zero-valued shield/HP fields. Map-based JSON serialization was rejected because it inserted type metadata and broke runtime decoding.
- `Char.die()` keeps state/reward processing but skips sprite presentation when no sprite exists, enabling the actual native death path in headless integration tests.
- The tests initialize `Game.version` for debug catalog initialization and preserve useful stack traces on failures.
- Attacker after-state is validated against the server-trusted before-state before committing native retaliation, inventory, buffs or bounded legitimate level-up changes.
- Untrusted/incomplete secondary shared-mob deltas trigger authoritative resync instead of blindly committing client data.

### Explicit trust boundary

The Worker does not run the Java SPD engine or independently reproduce its RNG/damage formulas. The selected level publisher resolves native attacks against mobs; the PvP target owner resolves incoming player attacks. The Worker checks authority, pending request, identity, depth, legal geometry, saved pre-state, native transitions, bundles, loot and replay protection before it commits/broadcasts the result. Non-authoritative secondary mob changes/loot are rejected and require an authoritative resync.

## Remaining release verification (not falsely marked as passed)

1. Run a physical two-device Android smoke test for co-op combat, reconnect/resync and PvP.
2. Exercise unusual mod/class-specific combat effects not represented by the runtime test fixtures on real levels/devices.
3. Phase 1 world restoration still has separate risks: the current snapshot path rejects a level dimension mismatch rather than reconstructing a new-sized level; exhaustive live-world restore/idempotence for every native entity type has not been proven end-to-end. Revisit those before declaring the entire multiplayer foundation production-ready.
4. Phase 3 remains separate: native mob AI/pathing/actor-scheduler timing is not proven equivalent to the original Java scheduler. Do not infer Phase 3 completion from Phase 2 CI.

## User execution rule

When asked to finish a stage, directly implement and test the missing work, fix red tests, and verify the final code commit in CI. Do not report a stage as completed based only on a plan, a source review, or a successful older commit.
