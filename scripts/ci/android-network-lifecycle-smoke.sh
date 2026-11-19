#!/usr/bin/env bash
set -euo pipefail

# Deferred runtime acceptance only. Do not run before explicit user approval (after Phase 20).
if [[ "${ALLOW_DEFERRED_ANDROID_RUNTIME_SMOKE:-}" != "1" ]]; then
  echo "This Android Emulator smoke is deferred. Run only after explicit user approval." >&2
  exit 3
fi

APK_PATH="$1"
PACKAGE="com.magd.shatteredpixeldungeon.indev"
LOG_FILE="android-network-lifecycle.log"
ADB="adb"

if [[ ! -f "$APK_PATH" ]]; then echo "Debug APK not found: $APK_PATH" >&2; exit 2; fi
: > "$LOG_FILE"
adb_log() { "$ADB" logcat -d -s SPD_MULTIPLAYER_NETWORK:D SPD_MULTIPLAYER_LIFECYCLE:D; }
capture_logs() { adb_log >> "$LOG_FILE"; }
wait_for_log() {
  local needle="$1" timeout="$2" label="$3" i
  for ((i=0; i<timeout; i++)); do
    if adb_log | grep -Fq -- "$needle"; then echo "PASS: $label"; return 0; fi
    sleep 1
  done
  echo "FAIL: $label (missing log: $needle)" >&2
  adb_log | tail -n 80 >&2
  capture_logs
  return 1
}
cleanup() { "$ADB" shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$ADB" wait-for-device
"$ADB" shell input keyevent KEYCODE_WAKEUP
"$ADB" shell wm dismiss-keyguard >/dev/null 2>&1 || true
"$ADB" install -r "$APK_PATH"
"$ADB" shell am force-stop "$PACKAGE"
"$ADB" logcat -c
"$ADB" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null

wait_for_resumed_activity() {
  local timeout="$1" label="$2" i
  for ((i=0; i<timeout; i++)); do
    if "$ADB" shell dumpsys activity activities | grep -F "ResumedActivity:" | grep -Fq "$PACKAGE"; then
      echo "PASS: $label"
      return 0
    fi
    sleep 1
  done
  echo "FAIL: $label (the game is not the resumed Activity)" >&2
  "$ADB" shell dumpsys activity activities | tail -n 60 >&2
  return 1
}
wait_for_log "Registered default network callback" 30 "API 35 default network callback registered"
wait_for_log "Internet availability=true" 30 "Initial validated Internet state is available"
wait_for_log "Activity onResume" 30 "Launcher Activity reaches onResume"
wait_for_power_state() {
  local expected="$1" timeout="$2" label="$3" i
  for ((i=0; i<timeout; i++)); do
    if "$ADB" shell dumpsys power | grep -Fq "mWakefulness=$expected"; then
      echo "PASS: $label"
      return 0
    fi
    sleep 1
  done
  echo "FAIL: $label (expected wakefulness $expected)" >&2
  "$ADB" shell dumpsys power | grep -F "mWakefulness=" >&2 || true
  return 1
}
wait_for_resumed_activity 25 "Game is the foreground resumed Activity"
capture_logs
"$ADB" logcat -c
"$ADB" shell cmd connectivity airplane-mode enable >/dev/null
wait_for_log "Internet availability=false" 30 "Airplane mode publishes Internet unavailable"
if ! "$ADB" shell cmd connectivity airplane-mode | grep -Fq "enabled"; then echo "Airplane mode not enabled" >&2; exit 1; fi
capture_logs
"$ADB" logcat -c
"$ADB" shell cmd connectivity airplane-mode disable >/dev/null
wait_for_log "Internet availability=true" 35 "Validated network recovery publishes Internet available"
capture_logs

"$ADB" logcat -c
"$ADB" shell input keyevent KEYCODE_HOME
wait_for_log "Activity onPause" 20 "Background transition reaches Activity.onPause"
capture_logs
"$ADB" logcat -c
"$ADB" shell input keyevent KEYCODE_POWER
wait_for_power_state Asleep 20 "Screen is actually off"
"$ADB" shell input keyevent KEYCODE_WAKEUP
wait_for_power_state Awake 20 "Screen is awake again"
"$ADB" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null
wait_for_log "Activity onResume" 25 "Screen wake and app return reach Activity.onResume"
wait_for_resumed_activity 25 "Game is resumed after screen wake"
capture_logs

"$ADB" shell am force-stop "$PACKAGE"
sleep 2
"$ADB" logcat -c
"$ADB" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null
wait_for_log "Activity onCreate" 30 "Fresh process launch reaches Activity.onCreate"
wait_for_log "Registered default network callback" 30 "Network callback re-registers after process launch"
wait_for_log "Activity onResume" 30 "Fresh Activity reaches Activity.onResume"
wait_for_resumed_activity 25 "Relaunched game Activity is in the foreground"
capture_logs

echo "Android network/lifecycle runtime smoke passed."
echo "Filtered device log saved to: $LOG_FILE"
