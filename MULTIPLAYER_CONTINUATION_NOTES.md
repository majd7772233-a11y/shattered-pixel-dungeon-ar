# Multiplayer Continuation Notes — Phase 10-C complete; Phase 10-D handoff

**Repository:** majd7772233-a11y/shattered-pixel-dungeon-ar  
**Only working branch:** multiplayer-framework-core-14118577486727081892  
**Live code/test HEAD audited for 10-C:** 2d9a36d6c90ae95a91e6d08dca7a5bc4861c7fa5  
**Exact-HEAD CI:** [43512831773 — all three jobs passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43512831773)

## Verified starting point

- The user-supplied c8998912005e458fac7a8776618b073f33f4d642 was not the live HEAD. The branch had advanced to 2d9a36d6c90ae95a91e6d08dca7a5bc4861c7fa5; do not reset or overwrite newer commits.
- All 21 Markdown files in the live tree were re-read before the audit, including GPT.md, ROADMAP.md, this continuation note and PROJECT_EXECUTION_PROTOCOL_AR.md.
- Exact-HEAD CI passed all three jobs: Backend typecheck/build + 10 Vitest files / 708 executions; Android JVM tests + Debug APK; and three Durable Object SQLite runtime tests. Workers tests are local runtime evidence, not a production deployment test.
- Phase 10-A and 10-B remain complete and unchanged.

## Phase 10-C verified result

### Android envelope

- NetworkMessage.parseJson is the strict canonical decoder for protocol 1.0.0. It requires an object root and string protocolVersion, messageType and payloadJson; it rejects unsupported versions, unknown message types, malformed outer/nested JSON, wrong-typed present optional fields, and invalid/unsafe sequence values.
- requestId and senderId are optional strings; sequence is optional and defaults to zero. When supplied, sequence must be a non-negative safe integer (an integral JSON decimal such as 1.0 is accepted consistently with Worker safe-integer admission).
- The generic parser rejects raw object/array payloadJson, missing required fields and JSON null for optional string fields. Invalid envelopes become ERROR envelopes with explicit codes; they are never coerced into ACTION.
- Compatibility is transport-scoped and source-backed: parseLanJson accepts only the historical six-field versioned LAN raw-object/array payload shape; parseBluetoothJson accepts only the historical two-field unversioned Bluetooth shape. Extra fields reject. Both normalize to the canonical envelope and invoke the strict parser. Internet uses only parseJson.

### Action producer

- NetworkActionBridge.mapHeroActionToNetworkAction returns Optional values for ten explicitly mapped native HeroAction classes; null and all other classes produce Optional.empty().
- Its only production caller is MultiplayerActionDispatcher. An empty mapping calls Hero.rejectUnsupportedMultiplayerWorldAction(), which clears the pending native world mutation, displays the unsupported-action warning and returns without sending a fabricated WAIT.
- Direct native producers for other action families remain described in docs/multiplayer/PROTOCOL_MESSAGE_CATALOG.md; neither enum membership nor a Worker ACTION branch proves every action subcase is supported.

### Router/receiver behavior and preserved responsibilities

- MessageRouter explicitly routes SESSION, SNAPSHOT, LEVEL_PUBLISHER_CHANGED, EVENT_BATCH, COMBAT_REQUEST, ACTION_ACCEPTED, ACK, MATCH_END and ERROR. Its default still dispatches remaining message kinds to RemotePlayerActionReceiver on the render thread.
- PLAYER_LEFT remains in the legacy receiver. The tested path removes the RemotePlayer, detaches RemoteHero Buffs, removes the Hero from Actor scheduling, clears Mob target references, removes its sprite and clears the registry entry.
- Existing legacy RemoteHero position/HP update behavior remains covered.
- EVENT_BATCH remains owned by MessageRouter. The legacy receiver refuses to parse/apply it and requests the existing recovery path. A duplicate typed sequence does not apply Mob state a second time.
- Neither MessageRouter nor RemotePlayerActionReceiver was moved, deleted or broadly refactored. The receiver's other legacy responsibilities have not all been proven redundant.

### Tests and CI evidence

- NetworkProtocolParityTest.java: 15 JVM tests covering canonical envelope fields/types/version/sequence, malformed JSON, unknown message types, serializer behavior, LAN/Bluetooth legacy scoping, mapped/unmapped HeroActions and transport parsing/serialization.
- NativeCombatRuntimeIntegrationTest.java: 62 test methods at the audited HEAD; 10-C adds targeted PLAYER_LEFT cleanup, legacy RemoteHero update and EVENT_BATCH no-double-application coverage.
- Exact HEAD 2d9a36d6c90ae95a91e6d08dca7a5bc4861c7fa5: [CI 43512831773](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43512831773) passed Backend, Android and Durable Object SQLite jobs.
- No Worker route/action allowlist, native gameplay validator, message ordering, replay or resync algorithm was changed. No physical two-device match or deployed production Worker test is claimed.

## Phase status

- Phase 9: complete for implementation and automated acceptance under its documented fail-closed support boundary.
- Phase 10-A: complete (canonical 25-message / 23-action enum/version parity).
- Phase 10-B: complete (all message/action routing inventory; eight Worker inputs versus 17 known non-inputs; fail-closed Worker admission and guards).
- Phase 10-C: complete for Android envelope/parser/producer parity and the behavior-specific receiver regressions listed above.
- Parent Phase 10: **OPEN**. Phase 11 has not started.

## Next bounded slice — Phase 10-D (do not start in this conversation)

Begin with a fresh branch/HEAD/CI verification and reread every Markdown file. Then audit the remaining actual behaviors that still pass through MessageRouter's default route and the legacy receiver. Pick only one cohesive, evidenced subset for a typed MessageRouter path:

1. Inventory real message senders/receivers and distinguish active payloads from enum-only placeholders.
2. For each candidate behavior, record source, direction, payload shape, thread ownership, actor/world side effects and failure/recovery path.
3. Add focused behavioral equivalence tests before changing routing. Keep PLAYER_LEFT cleanup intact until a typed replacement test proves every native Mob-target, Buff, Actor scheduler, sprite and registry effect.
4. Move only a narrow behavior whose typed implementation and tests are complete. Do not rewrite or delete the receiver wholesale.
5. Preserve EVENT_BATCH as the sole typed sequenced event application path; its legacy receiver guard must continue preventing double application.
6. Do not redesign replay/resync, sequence ordering, persistence, Worker admission, action validators or gameplay formulas. Do not start Phase 11.

**Stop condition for 10-D:** the selected legacy message behavior has one proven typed route with equivalent state/thread/cleanup semantics, or the audit shows that no safe cohesive migration is ready—in that case document the blocker and stop rather than forcing a broad refactor.

