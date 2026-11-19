# Phase 14-B3 — Android Network and Background Recovery

**Status:** IN PROGRESS. Android connectivity/recovery implementation, monitor-generation fencing and local JVM/build verification pass. Hosted Worker room smoke and Android framework runtime validation remain open.
**Repository/branch:** `majd7772233-a11y/shattered-pixel-dungeon-ar` / `multiplayer-framework-core-14118577486727081892`.
**Start HEAD:** `9fbad79cbecf69c75413e7f01d187fff25befc3c`.

## Implementation

- `android/src/main/java/com/shatteredpixel/shatteredpixeldungeon/android/AndroidPlatformSupport.java` owns the connectivity monitor. On API 24+ it registers `registerDefaultNetworkCallback`; API 21–23 use `registerNetworkCallback` with an INTERNET capability request. On API 23+ the active network must also be VALIDATED. The project `minSdk` is 21 and `ACCESS_NETWORK_STATE` already exists in `android/src/main/AndroidManifest.xml`.
- `AndroidLauncher` starts the monitor during activity creation, refreshes the active-network state on resume, informs `MultiplayerManager` on pause/resume, and unregisters the callback on destruction.
- `MultiplayerManager` now models `networkAvailable` and `appInForeground` explicitly. Temporary loss after an authenticated SESSION retains the current session token and game session while disconnecting the stale InternetTransport. Reconnect attempts and handshake timers pause while offline/backgrounded and resume only after their corresponding availability transition. An initial SESSION handshake has its own pending flag; `endSession`, initial failure and successful SESSION admission clear it.
- Room lobby invalidation is marshalled to the libGDX render thread and fenced by the captured session generation when the render queue exists.
- `InternetTransport` uses a 15-second heartbeat interval and 45-second inbound-idle timeout. The heartbeat scheduler never performs socket writes itself; a separate sender executor and one-pending-send gate keep a backpressured write from starving timeout detection. `disconnect()` invalidates the generation and closes the socket without waiting for a graceful CLOSE frame to acquire a blocked write path.
- Room URL construction is centralized in `InternetTransport.buildRoomEndpoint`. The Worker host is derived from `server/wrangler.jsonc`'s script name (`spd-multiplayer-backend`) and the observed Cloudflare account subdomain (`magd`). Codes are trimmed and restricted to 3–32 ASCII letters, digits, `_` or `-`.

## Regression coverage

- `MultiplayerReconnectLifecycleTest`: ending a session during the initial handshake clears its pending state; temporary network loss preserves the authenticated session/token and does not consume retries; background transitions pause retries and resume them in foreground; initial SESSION handshake timeout is paused in the background; a known-offline state prevents a new Internet session.
- `InternetTransportProtocolTest`: validates the configured Worker room URL and rejects invalid room codes; a localhost peer deliberately stops reading during a large client application frame and proves `disconnect()` returns promptly, closes the blocked sender and does not deliver a stale send error.
- Full local `gradlew.bat test assembleDebug`: **172 tests / 0 failures / 0 errors / 0 skipped** across 11 JUnit XML reports. Debug APK from the first B3 baseline: 36,960,212 bytes; SHA-256 `758AB119002EE2E79D1DDFE1EBBA169570C5405FEA5DFA3194A7D15477613F56`.
- Backend was unchanged by B3: `npm test` passed 380 Vitest tests across 6 files; `npm run build` passed TypeScript.


## 2026-11-19 follow-on — Android callback fencing and deferred runtime harness

- `AndroidPlatformSupport` now captures `connectivityMonitorGeneration` in each registered `NetworkCallback` and verifies both generation and callback identity before applying `onAvailable`, `onLost` or `onCapabilitiesChanged` state. `stopConnectivityMonitoring()` advances the generation before unregistering, clears the tracked default/per-network state, and prevents callbacks queued by an old Activity monitor from becoming current again.
- State publication is synchronized with monitor start/stop as well as callback state updates, so teardown cannot interleave between the final generation check and `MultiplayerManager.onNetworkAvailabilityChanged(...)`.
- API 24+ uses only the exact default network announced by `registerDefaultNetworkCallback`, and requires INTERNET + VALIDATED capabilities. API 21–23 use an INTERNET `NetworkRequest`; API 23+ checks that the currently active Network itself is VALIDATED. API 21–22 retains the connected active-NetworkInfo fallback.
- `AndroidLauncher` and the platform adapter add DEBUG-only Activity/network diagnostic tags. `android/build.gradle` explicitly generates `BuildConfig`; release logging remains disabled by `BuildConfig.DEBUG`.
- Forced local command: `gradlew.bat test assembleDebug --rerun-tasks --no-daemon --console=plain`. Result: **BUILD SUCCESSFUL; 58/58 actionable tasks executed; 11 JUnit XML reports / 172 tests / 0 failures / 0 errors / 0 skipped**. Current Debug APK: 35,219,222 bytes; SHA-256 `F31514F7D57573CAEEBD9633848AF9201DFA364AFD1E2A3CD67E5FD532D8951A`.
- The default multiplayer CI workflow no longer contains an Android Emulator runtime job. The script `scripts/ci/android-network-lifecycle-smoke.sh` is kept as a later manual acceptance helper and exits unless `ALLOW_DEFERRED_ANDROID_RUNTIME_SMOKE=1` is explicitly provided. It has NOT been run; no app launch, ADB use, network toggle, screen-off or Activity runtime result is claimed. The generated `android-network-lifecycle.log` is ignored by Git.
- Base exact-head CI before this follow-on: [run 44550669826](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44550669826) passed Backend, Durable Object SQLite and Android APK jobs on parent `9904aa120b60f195a2df76b48f901862254ce65f`. It does not verify the follow-on changes; exact-head CI must run after the code+documentation commit is pushed.
## Hosted Worker deployment — SUCCESS

- GitHub Actions deployment run: [44549387460](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/44549387460) — SUCCESS on `7a4b95c9f260d6cf820b96a78cc771c116fa3f32`.
- Deployed URL: `https://spd-multiplayer-backend.magd.workers.dev`.
- Deployed Worker: `spd-multiplayer-backend`; Cloudflare script inventory confirms it exists and was modified at `2026-11-19T14:58:11Z`.
- Durable Object binding: `MATCH_ROOM` (`MatchRoom` class).
- Wrangler deployment version: `0285e269-b4fb-415b-bf78-03587851ba6c`.
- Secret provisioning succeeded: `MAGD_JWT_SECRET` was uploaded from GitHub Actions Secrets. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` were used only as environment secrets. No secret values were printed or committed.
- The successful workflow ran `npm ci`, TypeScript build and **380/380 Vitest tests across 6 files** before provisioning the secret and deploying.
- **Authentication caveat:** the current application does not consume `MAGD_JWT_SECRET`. Session credentials remain opaque `crypto.randomUUID()` tokens persisted in the Durable Object and rotated on reconnect. JWT signing/verification is not implemented by this deployment.

## Deferred live tests — per user instruction

No live room creation, second-client join, authenticated resume/token rotation, game WebSocket session, or hosted failure-path smoke was run. Deployment success and Worker inventory do not prove those flows. They are intentionally deferred until the user asks. Actual Android network handoff/background/screen-off/Activity recreation remains untested on a physical Android runtime.

## Remaining acceptance

- [x] Verify the intended `spd-multiplayer-backend` is deployed from this repository's `server/wrangler.jsonc`; Cloudflare inventory confirms the script exists and deployment output confirms the `MATCH_ROOM` Durable Object binding.
- [ ] Run hosted room create, second-client join, authenticated resume/token rotation, room WebSocket and explicit failure cases against the deployed Worker (intentionally deferred until requested by the user).
- [ ] Validate actual Android framework network callback behavior through a real API 21+ network handoff/background/screen-off cycle; current evidence is source wiring plus JVM manager tests and APK compilation, not a physical Android run.
- [ ] Push the final code+documentation commit and verify exact-head Backend, Android and Durable Object SQLite CI.

Phase 14-B3 and parent Phase 14 remain OPEN until the relevant service/platform acceptance gates pass. Emulator-visible lobby/RTL checks remain Phases 20–21; physical two-device gameplay remains Phase 23.
