# Multiplayer Continuation Notes — Phase 10-B (cross-layer routing and Worker ingress)

**Repository:** majd7772233-a11y/shattered-pixel-dungeon-ar  
**Only working branch:** multiplayer-framework-core-14118577486727081892  
**Starting HEAD for this slice:** fa5f7937eb55145345230de7930be8f860b74694  
**Exact starting-HEAD CI:** [43488066751 — all three required checks passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43488066751)  
**10-B implementation/fix SHA:** `d16be138d74bb9930777f5352efbeae3291070c6`  
**Exact-head CI:** [43494769215 — all three required checks passed](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43494769215). Backend build + 708 Vitest executions (10 files), Android JVM/Debug APK and three Durable Object SQLite tests passed.

## Verified starting point

- The live branch head exactly matched fa5f7937eb55145345230de7930be8f860b74694 before any write.
- All 21 Markdown files present in that starting commit were read, including GPT.md, ROADMAP.md and this continuation note.
- Starting-head CI passed Backend typecheck/tests, Android debug APK compile and Durable Object SQLite rollback/eviction.
- Phase 10-A was already complete; do not repeat its enum/schema changes.

## Phase 10-B work completed in this slice

### Cross-layer message/action inventory
- A source-backed matrix was added to docs/multiplayer/PROTOCOL_MESSAGE_CATALOG.md for all 25 outer messages and all 23 NetworkActionType values.
- Eight outer messages have explicit Worker input routes: RECONNECT, LEVEL_DATA, LEVEL_READY, ACTION, READY, RESYNC, PING and CHAT.
- The other 17 canonical outer names are known non-inbound at this Worker boundary. This intentionally includes server outputs and declared-but-unimplemented placeholders; they are not all "server-only".
- Each of the 23 action names is matched to a Worker ACTION branch token. The catalog records relevant source producers, validators, authority/persistence/sequence, follow-up LEVEL_DATA requirements and Android handling. Branch existence does not imply all item/effect subcases are enabled.
- The Android outer route was traced: MessageRouter explicitly handles SESSION, SNAPSHOT, LEVEL_PUBLISHER_CHANGED, EVENT_BATCH, COMBAT_REQUEST, ACTION_ACCEPTED, ACK, MATCH_END and ERROR. Its default route still points to RemotePlayerActionReceiver.

### Worker fail-closed ingress
- Added server/src/protocol/message-admission.ts and message-admission.test.ts.
- MatchRoomMessages.webSocketMessage now validates attachment/session, text frame, JSON object envelope, required/optional field types, exact protocol version 1.0.0, known inbound message type and syntactically valid nested payloadJson before dispatch.
- Unknown and known non-inbound types return UNKNOWN_MESSAGE_TYPE / UNSUPPORTED_MESSAGE_TYPE. Invalid envelope, protocol, frame or nested JSON have stable error codes; a safely parsed requestId is echoed.
- Unexpected handler exceptions preserve their original error-message payload to maintain the pre-existing transaction rollback contract; envelope admission errors detected before dispatch still use stable codes. Client senderId is overwritten from the accepted socket attachment only after admission.
- Added server/scripts/validate-phase10-routing.mjs to npm test. It checks Java/schema coverage for all 25 message types, exact eight Worker route branches, all 23 Worker ACTION branch tokens, and the unchanged fail-closed INVALID_ACTION default.

### Deliberately untouched
- No action validator semantics, native Java SPD gameplay, MessageRouter route, event ordering, sequence/persistence, replay/idempotency, reconnect or resync algorithm changed.
- RemotePlayerActionReceiver was not deleted, moved or rewritten. It still contains PLAYER_LEFT Actor/Mob cleanup and legacy event/snapshot handling; no migration is safe before equivalence tests.
- Android NetworkMessage.parseJson was not hardened in this slice; it still defaults some missing fields and accepts object/array payload values beyond the schema's string envelope.
- NetworkActionBridge still maps only a subset of HeroAction values and falls back to WAIT for an unmapped HeroAction. This is a client producer fail-closed gap, not proof that those actions are supported.

## Phase status

Phase 10 as a whole remains OPEN. 10-A enum/version parity and the bounded 10-B route-matrix/Worker-ingress slice are implemented and verified at `d16be138d74bb9930777f5352efbeae3291070c6`; exact-head CI `43494769215` passed all three jobs. Do not start Phase 11.

## Next bounded slice — Phase 10-C (Android envelope and producer parity)

Start only after re-reading all Markdown files and verifying the live branch HEAD/CI. Scope:

1. Harden/test Java NetworkMessage parsing against missing required fields, wrong optional field types, mismatched protocol version, malformed nested payload and unknown MessageType, while preserving documented backward-compatibility only when it is explicitly needed.
2. Trace all NetworkActionType producers and correct the NetworkActionBridge unmapped-HeroAction fallback so an unknown native HeroAction cannot silently become WAIT. Add focused JVM regressions for mapped and rejected actions.
3. Build behavior-specific parity tests for MessageRouter and RemotePlayerActionReceiver. Preserve PLAYER_LEFT native Actor/Mob target cleanup and every confirmed legacy behavior. Do not move/delete the receiver until equivalence is proven.
4. Keep the Worker routing matrix and routing-guard test synchronized with any verified changes.
5. Do not redesign replay/resync or start Phase 11; do not attempt the entire Phase 10 typed-path consolidation in one slice.

## Rules for the next conversation

- Re-read every Markdown file in the live branch, including newly added files; read GPT.md, ROADMAP.md and PROJECT_EXECUTION_PROTOCOL_AR.md fully.
- Verify the only permitted branch and live HEAD; compare exact-head CI before editing.
- Do not repeat Phase 10-A or this completed 10-B work.
- Do not create branches, work on master/main, merge, or open a PR.
- Keep Java/SPD as gameplay source of truth and preserve fail-closed validation.
- Run backend build/tests and Android JVM/debug APK tests; verify CI on the exact final HEAD.
- Update all affected docs with the implementation, record the next continuation point and stop.

