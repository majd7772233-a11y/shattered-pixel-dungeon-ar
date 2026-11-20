# Phase 16 — Bluetooth Classic RFCOMM transport and device experience

**Parent status:** implementation and local automated acceptance complete; exact-head CI for the current follow-up commit is pending. Physical-device acceptance is deliberately deferred until after Phase 22. **Scope:** two-player Bluetooth Classic (host + one peer), not a multi-peer mesh.

## Scope split

### 16A — RFCOMM transport foundation

**16A is complete and committed** at `aa152e622ca2b99ad58e290abab184bd98dce2f1` (`Implement Phase 16A Bluetooth RFCOMM transport`).

1. Android startup registers the real `AndroidBluetoothProvider`; a missing provider fails closed as `BLUETOOTH_UNAVAILABLE`.
2. Classic RFCOMM host and guest use one stable SPD multiplayer service UUID. A host listener stays `CONNECTING`; `onConnected` is emitted only after a real peer socket is accepted and both streams are acquired. Guest MAC addresses are validated.
3. `BluetoothFrameCodec` uses strict UTF-8 newline framing capped at 16 MiB. Empty, truncated, malformed, injected-delimiter and over-limit frames are rejected. Outbound messages retain the canonical versioned envelope.
4. Server, pending and active sockets/streams have one owned lifecycle. A generation fence rejects stale accept/connect/read/timeout callbacks; guest connection has a 15-second timeout; clean EOF disconnects; failures close owned resources; output writes are serialized.
5. Android checks adapter availability/enabled state and API 31+ `BLUETOOTH_CONNECT`. Bluetooth hardware is an optional manifest feature; legacy permissions are limited to API 30.
6. A connected socket means `TRANSPORT_CONNECTED`, not `ROOM_JOINED`, `READY` or `PLAYING`. Authoritative room roster/readiness/MATCH_START/native action lifecycle remains Phase 17.

### 16B — Discovery, runtime consent, pairing and peer selection

**16B implementation and local automated acceptance are complete.** The exact-head CI for the follow-up implementation/documentation commit is not yet recorded.

#### Core flow and ownership

- `BluetoothDeviceAccess` is the platform boundary for runtime preparation, paired-device enumeration, discovery, cancellation and host discoverability. `BluetoothDeviceAccessRegistry` exposes the current Android Activity-owned implementation to Core.
- `BluetoothDeviceInfo` validates/canonicalizes Bluetooth MAC addresses, removes control characters from display names and falls back to the MAC when Android has no readable device name.
- `BluetoothDeviceDiscoveryController` owns a generation-fenced search/selection state machine. It merges paired devices with nearby discoveries, keeps paired metadata canonical, sorts paired entries first, limits the list to 32 unique peers, snapshots the list immutably, ignores stale callbacks and clears a selected peer when that entry is removed.
- `AndroidBluetoothDeviceManager` owns Android permissions, adapter enable consent, paired-device enumeration, system pairing/discoverability result callbacks, the dynamic discovery receiver, timeout and cleanup. It forwards callbacks through the Android main thread; `MultiplayerSetupScene` forwards UI changes to the libGDX render thread and fences them by scene generation.
- RFCOMM only supports Classic/Dual devices. Paired BLE-only or unknown-type devices are excluded from the picker rather than offered a transport that cannot connect over RFCOMM.
- Nearby discovery is bounded to 20 seconds. It listens for found devices, bond-state changes, discovery completion and adapter state changes. Timeout/error cancels the actual adapter discovery operation and unregisters the receiver. Android 13+ uses `Context.RECEIVER_EXPORTED` for Bluetooth broadcasts emitted by the privileged Bluetooth companion app; older releases use the compatible two-argument registration.
- Android system pairing consent is used when an unpaired peer's RFCOMM connection requires bonding; the app does not implement a custom PIN-entry or substitute pairing protocol. `BOND_NONE` removes a device from the active list and invalidates a selected peer. A peer that goes out of radio range is ultimately rejected by the bounded RFCOMM connection path; the app does not claim continuous proximity tracking.

#### Android permission and consent matrix

| Android API | Guest discovery | Host visibility |
|---|---|---|
| 21–22 | Legacy Bluetooth permissions; no runtime permission prompt | Android system discoverability consent |
| 23–30 | Runtime `ACCESS_FINE_LOCATION` plus Location services enabled; then adapter enable if needed | Android system discoverability consent |
| 31+ | Runtime `BLUETOOTH_CONNECT` + `BLUETOOTH_SCAN`; adapter enable if needed | Runtime `BLUETOOTH_CONNECT` + `BLUETOOTH_ADVERTISE`, then system discoverability consent |

Manifest declares `BLUETOOTH_SCAN` with `neverForLocation`, `BLUETOOTH_ADVERTISE`, and `ACCESS_FINE_LOCATION` capped at API 30, while preserving the optional Bluetooth hardware feature and the existing API<=30 legacy permissions. The Android manager distinguishes first denial, permanent denial, permission request failure, Location services disabled, adapter disabled/unavailable and user cancellation. Permanent-denial feedback directs the user to the app's Nearby devices permission in system settings; the user can retry after returning to the app.

Host startup is gated on both platform permission/adapter readiness and the result of `ACTION_REQUEST_DISCOVERABLE`. Requested discoverability is clamped to 60–300 seconds. A scene-generation continuation guard prevents a delayed permission result from opening the system discoverability prompt after the setup scene has been destroyed or replaced.

#### Setup UI and transport boundaries

- The Bluetooth guest screen has separate **Search**, **Choose device** and selected-peer status controls. Device rows show a sanitized name, paired marker and shortened MAC suffix; the picker displays six peers per page with previous/next navigation.
- The Bluetooth MAC is held in dedicated `targetBluetoothAddress` state. It never reuses the LAN IPv4 address or TCP port fields.
- Search can be cancelled and retried. Permission/adapter/system cancellation, no-device results, device removal, pairing/peer failure and connection failure receive separate Arabic and English messages.
- The host does not start its RFCOMM server until the user accepts Android's visibility prompt. The guest does not start until an extant selected Bluetooth device is present.
- The current scene still switches to HeroSelect after `startSession`; it does not wait for an accepted peer/authoritative `SESSION`. Full connection states/lobby behavior remains in Phase 20, and responsive RTL/LTR/touch/accessibility work remains Phase 21.
- Bluetooth remains a two-player transport (`host + one peer`). Opening a raw RFCOMM socket still does not create an authoritative shared match; Phase 17 owns that contract.

## Automated test inventory

| Test class | Methods | Result |
|---|---:|---|
| `BluetoothDeviceDiscoveryControllerTest` | 8 | PASS |
| `BluetoothDeviceInfoTest` | 2 | PASS |
| `BluetoothHostPreparationControllerTest` | 5 | PASS |
| `BluetoothFrameCodecTest` | 7 | PASS |
| `BluetoothTransportTest` | 12 | PASS |
| `MultiplayerErrorMessagesTest` | 5 | PASS |
| **Bluetooth-focused classes** | **39** | **0 failures / 0 errors / 0 skipped** |

Additional existing manager-state, canonical-envelope and native render-callback regressions remain in the full suite. The 16B controller tests cover permission denial, cancellation while permission preparation is pending, stale callbacks after cancel/restart, paired/discovered deduplication, selected-device removal, discovery failure, the 32-device bound, device metadata/MAC validation, discoverability denial/success/duration bounds, missing provider and cancellation between permission success and host visibility. Android framework broadcast delivery, actual system permission sheets, pairing dialogs and physical RFCOMM are not JVM-testable in this suite.

## Exact local verification — 2026-11-20

- Command: `gradlew.bat test assembleDebug --rerun-tasks --no-daemon --console=plain` with `ANDROID_HOME` and `ANDROID_SDK_ROOT` set to `C:\Users\Magd\AppData\Local\Android\Sdk` and `JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true`.
- Result: **BUILD SUCCESSFUL; 58/58 actionable Gradle tasks executed; 24 JUnit XML reports / 244 tests / 0 failures / 0 errors / 0 skipped**.
- Debug APK: **35,261,178 bytes**; SHA-256 `83E2F714EE4738F5AF4E325EB463C1F048C24F8631DB72D9F8AD1D7FC4509A0B`.
- `git diff --check` passed. PowerShell resource-key comparison found identical English/Arabic multiplayer key sets, 75 keys each, with no duplicates.
- Exact-head CI for the current Phase 16B follow-up commit: **PENDING**. The 16A parent CI result is historical and is not evidence for these changes.

## Acceptance boundaries and deferred checks

- JVM tests exercise platform-neutral state/controller logic. `assembleDebug` compiles/packages the Android provider, permission manager and merged manifest; neither result proves runtime Android permission sheets, discovery broadcasts, pairing prompts or Bluetooth hardware behavior.
- No Android app launch, emulator/ADB, physical Bluetooth adapter, physical two-device session, Wi-Fi peer or gameplay test was run during this phase. Per the user's schedule, all Android/device/network acceptance waits until **after Phase 22**; physical gameplay remains Phase 23.
- Bluetooth Classic and its service UUID/system bonding are association/transport mechanisms, not application-level authentication or room authority.
- Phase 16 is considered implementation/automated-acceptance complete only after exact-head CI passes for the implementation and final documentation commits. Physical hardware acceptance remains a separately deferred gate.