# Phase 15 — LAN Transport Preflight

**Status:** Phase 15 is split into 15A (TCP host/guest session transport) and 15B (UDP discovery/network selection). 15A is implemented locally with targeted JVM acceptance; 15B has NOT started. The preflight findings below record the source state before the 15A implementation.
**Pre-implementation audit baseline:** `cb2364dab` plus the Phase 14 connection-feedback slice. The current implementation is being developed on `multiplayer-framework-core-14118577486727081892`.
**Pre-implementation audit scope:** source inspection only. At that historical audit point no LAN socket had been bound, no UDP discovery had been started, no Bluetooth adapter/device had been queried, and no real-device/network test had been run. The later 15A localhost TCP tests and full local build are recorded below.

## Existing implementation found before 15A (historical audit snapshot)

- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/LANTransport.java` already contains a TCP server/client, UDP announcement/discovery and basic message transfer. `MultiplayerSetupScene` starts a host on `LANTransport.DEFAULT_TCP_PORT`, or builds an address from the selected host IP.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/EmbeddedMatchAuthority.java` is a small local helper. It is not the deployed Worker, not a substitute for the authoritative native SPD gameplay contract, and must not be mistaken for a complete LAN match authority.
- `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/BluetoothTransport.java` exposes the core transport facade/provider interface. `android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/AndroidBluetoothProvider.java` contains an RFCOMM server/client adapter, but the inspected Android launcher/platform startup path does not register a real provider with the core facade.

## LAN blockers to resolve in Phase 15

1. **Host reports connected before bind is proven.** `LANTransport.startServer(...)` prepares server state and starts the accept loop asynchronously; the actual `ServerSocket` bind occurs on that worker. The host setup then passes `127.0.0.1:<port>` through `MultiplayerManager.startSession`. The server-mode `connect(...)` path can invoke `onConnected` without proving that the asynchronous bind succeeded. A port-in-use/bind failure can therefore race with a success-looking session state.
2. **Host topology is implicit.** The host path currently represents its own endpoint as loopback while the server owns the listening socket. Phase 15 must formalize one local authority plus peer sockets, not make the host behave like an ordinary remote guest or create a duplicate local socket/session.
3. **Discovery ownership/timeout is incomplete.** The UDP announcer's socket is not retained consistently in the transport's tracked socket field, so shutdown cannot reliably close that resource immediately. Discovery's receive loop stops on the first socket timeout even though its outer search window is longer; malformed/unexpected datagrams can also terminate discovery early.
4. **Discovery updates UI from a worker thread.** The discovery callback in `MultiplayerSetupScene` updates `BitmapText` and `StyledButton` state directly. Those mutations must be marshalled through the libGDX render thread and fenced against a scene that has already been destroyed/replaced.
5. **Client socket behavior needs deterministic bounds.** The inspected client path does not establish a bounded connect timeout and uses line-oriented `PrintWriter`/`BufferedReader` framing with default charset and no explicit message-size bound. `PrintWriter` can hide write failures unless its error state is checked. Phase 15 must align the LAN frame format with the shared transport/protocol contract and define bounded reads/writes and failure callbacks.
6. **Shutdown and duplicate-client handling need tests.** Verify server bind failure, listener cancellation, UDP announce cancellation, pending accepts, connected client closure, repeated start/stop, duplicate joins and stale callbacks. The current broad exception swallowing in setup is not acceptable for a final user-facing flow.
7. **Do not reuse placeholder gameplay authority as a second rules engine.** The product contract is one coherent native SPD run. Any LAN host authority must reuse the common session/protocol and preserve the same native gameplay/action validation model; `EmbeddedMatchAuthority`'s limited local action handling is not sufficient proof of a real shared game.

## Required Phase 15 implementation order

- Define host/guest ownership and transport state transitions first. Server-ready must mean the TCP bind actually succeeded; failure must return a typed error before the manager/UI presents a connected session.
- Make startup atomic and cancellable: validate port/interface, bind, publish the actual selected local address, then accept peers. On any failure, close every acquired socket/thread/resource and return to a truthful disconnected state.
- Make UDP discovery bounded, cancellable and independently testable. Track and close every datagram socket, ignore malformed packets without ending the whole discovery window, validate advertised host/port, and marshal discoveries to the render thread.
- Give clients bounded connect/read/write behavior, explicit UTF-8 and bounded message framing, stable identity and deterministic disconnect/retry semantics.
- Integrate through `NetworkTransport`, `MultiplayerManager`, the shared session/message protocol and the same gameplay authorization/readiness gates. Do not create a parallel LAN-only gameplay event pipeline.
- Add deterministic JVM tests using injected bind/connect factories and localhost sockets: successful host bind, port-in-use, invalid address/port, connection timeout, peer disconnect, duplicate client, host shutdown, repeated start/stop, discovery timeout/cancellation, malformed announcements and cleanup after every failure.
- Keep real Wi-Fi/LAN discovery and two-device acceptance out of this preflight. They belong to the final runtime acceptance after the UI and code are complete.

## Phase 16 dependency warning — Bluetooth

- `BluetoothTransport` has a fallback path that can set its connected state/call `onConnected` when no native provider is registered. This is a fabricated-success risk and must be removed or made explicitly unavailable before Bluetooth is advertised as supported.
- The inspected `AndroidBluetoothProvider` starts RFCOMM work asynchronously; the wrapper can publish success before a peer socket is accepted. Adapter disabled/permission failure must not be followed by a success state.
- There is no complete discovery → explicit device selection → pairing/consent → version-specific permissions → connected-session UI path yet. Phase 16 must either implement and test that provider lifecycle or disable the selection with a truthful explanation.

## Phase 15A implementation checkpoint — 2026-11-20

The TCP slice now has these source-level behaviors:

- `LANTransport.startServer(...)` binds the TCP listener synchronously and reports bind failures before the setup scene advances. Host startup uses the internal `LAN_HOST` endpoint rather than a loopback guest socket.
- Guests connect with bounded connect/handshake timeouts, send `HELLO` with a stable ID and must receive a matching `SESSION` response from a valid host identity before the manager marks the guest session joined.
- `LanEndpoint` validates direct endpoints. `LanFrameCodec` uses strict UTF-8 newline framing, rejects malformed/truncated frames, and limits each frame to 16 MiB, matching `WebSocketFrameCodec`.
- The host reserves pending and authenticated guest slots under one capacity limit (four participants total), rejects duplicate IDs and sender spoofing, tracks pending sockets, broadcasts departures and closes tracked resources on shutdown.
- The manager and setup scene use the host-local endpoint and player identity. A synchronous setup failure closes a partially started LAN transport before presenting the localized error.
- New tests: `LanEndpointTest` (3), `LanFrameCodecTest` (4), `LANTransportTest` (9), and the existing `NetworkProtocolParityTest` (20). Latest targeted local run: **36 tests / 0 failures / 0 errors / 0 skipped; BUILD SUCCESSFUL**. Full forced `test assembleDebug --rerun-tasks`: **58/58 Gradle tasks, 15 JUnit reports / 192 tests / 0 failures / 0 errors / 0 skipped**; Debug APK 35,226,738 bytes, SHA-256 `FB719C5F4EB592E6E7A8952ADAD15AFAAB3EEAB6AA210C2E0DEFA1C991940626`.

**15A boundary:** this is a tested TCP transport/identity foundation, not a complete playable LAN match. It does not yet create a shared authoritative roster, ready-state/MATCH_START flow, or a complete native SPD gameplay authority. UDP advertisement/discovery is intentionally absent from the host startup path until 15B; manual IPv4 entry is the available interim join path. `EmbeddedMatchAuthority` remains a small legacy helper and is not the authority for this transport.

**15B remains open:** add tracked UDP announcements, cancellable discovery, interface selection, validation of advertised addresses and render-thread/scene-fenced UI callbacks. Bluetooth remains Phase 16.

## Remaining Phase 15 implementation and acceptance order

1. Commit/push the fully locally verified 15A source and documentation to the sole permitted branch, then verify exact-head Actions.
2. Implement 15B UDP advertisement/discovery and local interface selection with deterministic lifecycle and JVM tests.
3. Run supported same-network Wi-Fi/device acceptance only after the source and UI phases are ready. No physical-device or real Wi-Fi test is claimed by the localhost JVM tests.
4. Keep the complete host/join/lobby UX in Phase 20, localization/RTL/touch/layout in Phase 21, service smoke in Phase 22 and physical-device match in Phase 23.
