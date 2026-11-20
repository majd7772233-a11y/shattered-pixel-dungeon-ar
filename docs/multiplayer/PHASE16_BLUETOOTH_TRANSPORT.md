# Phase 16 — Bluetooth transport foundation and device experience

**Parent status:** OPEN. **Current slice:** 16A RFCOMM transport foundation. **Next slice:** 16B discovery, pairing consent, permission UX and device selection.

## Scope split

### 16A — RFCOMM transport foundation

**Implemented locally; full forced build and JVM acceptance are green. Exact-head CI remains a closeout gate.**

1. Android app startup registers an application-context `AndroidBluetoothProvider` with the core `BluetoothTransport`; a missing provider fails closed instead of simulating connection.
2. Classic Bluetooth RFCOMM server and client use the same stable SPD multiplayer service UUID. The host starts a listening server socket but remains `CONNECTING`; `onConnected` is raised only after a peer is accepted and input/output streams are acquired. The client address is validated as a Bluetooth MAC before the platform call.
3. `BluetoothFrameCodec` writes newline-delimited strict UTF-8 frames, with the same 16 MiB maximum used by adjacent transports. Empty frames, embedded delimiters, malformed surrogate input, malformed incoming UTF-8, truncation and over-limit messages are rejected. Oversized Java strings are rejected before allocating a second large UTF-8 byte buffer.
4. `AndroidBluetoothProvider` owns its server, pending and active sockets and streams under a state lock. A monotonically increasing generation fences stale accept/connect/read/timeout callbacks. Client connection has a 15-second bound; clean peer EOF is a disconnect; all failure/cancel paths close owned resources; concurrent output writes are serialized.
5. Android API 31+ must already have `BLUETOOTH_CONNECT`; the provider checks before adapter access and returns a specific permission-required error. Adapter missing/disabled are distinct failures. Legacy Android permissions are declared through API 30. Bluetooth hardware is an optional feature so non-Bluetooth devices can install the app.
6. A raw socket is only `TRANSPORT_CONNECTED`. It is never `ROOM_JOINED`, `READY` or `PLAYING` just because an RFCOMM socket opened. Room roster, matchmaking, readiness and authoritative native actions are not implemented by this transport slice; those remain Phase 17.

### Automated test inventory

| Test | Methods | Result |
|---|---:|---|
| `BluetoothFrameCodecTest` | 7 | PASS |
| `BluetoothTransportTest` | 12 | PASS |
| `MultiplayerErrorMessagesTest` | 5 total, including Bluetooth mappings | PASS |
| `MultiplayerReconnectLifecycleTest.bluetoothSocketIsTransportConnectedButNotRoomJoined` | 1 selected method | PASS |
| `NetworkProtocolParityTest.bluetoothTransportWritesTheCanonicalVersionedEnvelope` | 1 selected method | PASS |
| `NativeCombatRuntimeIntegrationTest` | existing nested render callback generation regression | PASS |
| **Focused selected set** | **27** | **0 failures / 0 errors / 0 skipped** |

The codec tests verify strict UTF-8, Arabic/emoji, LF/CRLF, EOF versus truncation, malformed UTF-8/surrogate, delimiter injection, empty frames and exact/over-16-MiB bounds. Provider-facade tests cover provider absence, host listener not equalling peer connection, validated client MAC, UUID parity, false provider success, stale generation, send-before-ready, canonical envelope, error cleanup, startup rollback and a delayed old-send failure arriving after a replacement connection has started. The latter confirms a stale write error cannot close the new connection. The manager test confirms Bluetooth reaches `TRANSPORT_CONNECTED` only, not `ROOM_JOINED`.

### 16B — discovery, pairing, consent and user experience

Not started. It will add paired-device enumeration, bounded/cancellable classic discovery, explicit host discoverability where required, Android runtime permission requests (`BLUETOOTH_CONNECT` and scan/discovery permissions where APIs require them), system pairing consent, selected-peer state, device-disappearance handling, cancel/retry and Arabic/English error feedback. It must not treat the existing LAN IP input as a Bluetooth MAC selector. Full screen-state/lobby design remains aligned with Phase 20; RTL/LTR and accessibility with Phase 21.

## Android permissions and minimum SDK

The app minimum SDK is 21 and target/compile SDK is 36. Manifest state for 16A:

- `android.hardware.bluetooth` with `required="false"`.
- Legacy `BLUETOOTH` and `BLUETOOTH_ADMIN`, each capped at SDK 30.
- `BLUETOOTH_CONNECT` for Android 12+.

Runtime consent prompt is intentionally not presented yet; 16A fails clearly when permission has not already been granted. Phase 16B owns request/rationale/permanent-denial/settings-return behavior and discovery-related permissions. No `BLUETOOTH_SCAN`/`BLUETOOTH_ADVERTISE` flow is claimed in 16A.

## Trust and acceptance boundaries

- RFCOMM service UUID and system pairing are transport association mechanisms, not application-level authentication or room authority.
- A listener bind does not prove a guest exists. Only the accepted peer socket and acquired streams produce the transport callback.
- The two-player cap in this foundation is host + one peer; multi-guest RFCOMM hosting is out of scope.
- JVM fake-provider tests exercise facade state and wire behavior; they do not open Android Bluetooth hardware.
- Android `assembleDebug` compiles/packages the Android adapter and manifest; it does not launch the APK or prove API runtime permission behavior.
- **User-directed test schedule:** do not run Android app, emulator/ADB, adapter, Wi-Fi peer or two-device tests before Phase 22. Real hardware/network acceptance is postponed until after Phase 22; physical gameplay remains Phase 23.
- Phase 16 does not complete the playable shared native match. Phase 17 owns room/session authority and co-op lifecycle.

## Exact local verification — 2026-11-20

- Command: `gradlew.bat test assembleDebug --rerun-tasks --no-daemon --console=plain`.
- Result: **BUILD SUCCESSFUL; 58/58 actionable Gradle tasks executed; 21 JUnit XML reports / 229 tests / 0 failures / 0 errors / 0 skipped**.
- Debug APK: **35,241,088 bytes**; SHA-256 `09E3F58DB6EC115A3C352C00927517F5C42221973EDA7CA6E64A1664D22066CD`.
- Focused Bluetooth/failure/regression run: **27 selected test methods, 0 failures/errors/skips**.
- Exact-head CI for Phase16A commit `aa152e622ca2b99ad58e290abab184bd98dce2f1` passed **3/3 jobs** in [run 44725344597](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44725344597): Backend typecheck/tests, Durable Object SQLite rollback/eviction, and Android debug APK compile. This is remote CI for this exact source+documentation SHA; it does not run hardware tests.
- No Android app launch, emulator/ADB, physical Bluetooth, Wi-Fi peer or two-device test was run.