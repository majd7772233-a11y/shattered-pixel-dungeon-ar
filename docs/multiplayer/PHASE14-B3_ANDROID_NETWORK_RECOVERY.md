# Phase 14-B3 — Android Network and Background Recovery

**Status:** IN PROGRESS. Local implementation/build/tests pass; hosted Worker room smoke and Android framework runtime validation remain open.
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
- Full local `gradlew.bat test assembleDebug`: **172 tests / 0 failures / 0 errors / 0 skipped** across 11 JUnit XML reports. Debug APK: 36,960,212 bytes; SHA-256 `758AB119002EE2E79D1DDFE1EBBA169570C5405FEA5DFA3194A7D15477613F56`.
- Backend was unchanged by B3: `npm test` passed 380 Vitest tests across 6 files; `npm run build` passed TypeScript.

## Hosted Worker blocker

The connected Cloudflare account reports Workers subdomain `magd`. Its script inventory contains no `spd-multiplayer-backend`. The similarly named deployed `spd-multiplayer` script is the stock Cloudflare Hello World template and returns `Hello World!`. The configured hostname `spd-multiplayer-backend.magd.workers.dev` resolves but the root currently returns HTTP 404. Therefore the intended `MatchRoom` Worker is not presently deployed under the project-configured name. No Cloudflare script, secret, domain, subdomain or deployment was changed from this task.

The client endpoint now matches the repository's Worker name/account subdomain, but successful URL construction is not proof of a live server. Do not claim hosted room creation, join, authenticated resume or service smoke until this Worker is deployed through the approved project deployment workflow and those operations pass against it.

## Remaining acceptance

- [ ] Verify the intended `spd-multiplayer-backend` is deployed from this repository's `server/wrangler.jsonc` and that root/room requests route to the project handler rather than a placeholder/404.
- [ ] Run hosted room create, second-client join, authenticated resume/token rotation, and explicit failure cases against the deployed Worker.
- [ ] Validate actual Android framework network callback behavior through a real API 21+ network handoff/background/screen-off cycle; the current evidence is source wiring plus JVM manager tests and APK compilation, not a physical Android run.
- [ ] Push the final code+documentation commit and verify exact-head Backend, Android and Durable Object SQLite CI.

Phase 14-B3 and parent Phase 14 remain OPEN until the relevant service/platform acceptance gates pass. Emulator-visible lobby/RTL checks remain Phases 20–21; physical two-device gameplay remains Phase 23.
