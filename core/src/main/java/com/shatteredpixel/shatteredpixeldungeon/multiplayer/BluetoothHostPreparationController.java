package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

/** Ensures runtime consent and Android discoverability have both succeeded before host startup. */
public final class BluetoothHostPreparationController {

    public interface ContinueCheck {
        boolean shouldContinue();
    }

    private BluetoothHostPreparationController() { }

    public static void requestVisibility(BluetoothDeviceAccess access, int durationSeconds,
                                         BluetoothDeviceAccess.ResultCallback callback) {
        requestVisibility(access, durationSeconds, null, callback);
    }

    public static void requestVisibility(BluetoothDeviceAccess access, int durationSeconds,
                                         ContinueCheck continueCheck,
                                         BluetoothDeviceAccess.ResultCallback callback) {
        if (callback == null) throw new IllegalArgumentException("BLUETOOTH_CALLBACK_REQUIRED");
        if (access == null) {
            callback.onResult(false, "BLUETOOTH_UNAVAILABLE");
            return;
        }
        access.prepare(BluetoothDeviceAccess.Mode.HOST_VISIBILITY,
                new BluetoothDeviceAccess.ResultCallback() {
                    @Override public void onResult(boolean success, String errorCode) {
                        if (!success) {
                            callback.onResult(false, errorCode == null
                                    ? "BLUETOOTH_PERMISSION_REQUIRED" : errorCode);
                            return;
                        }
                        if (continueCheck != null && !continueCheck.shouldContinue()) {
                            callback.onResult(false, "BLUETOOTH_HOST_PREPARATION_CANCELLED");
                            return;
                        }
                        access.requestDiscoverable(Math.max(60, Math.min(300, durationSeconds)),
                                new BluetoothDeviceAccess.ResultCallback() {
                                    @Override public void onResult(boolean visible, String visibilityError) {
                                        callback.onResult(visible, visible ? null : visibilityError == null
                                                ? "BLUETOOTH_DISCOVERABILITY_CANCELLED" : visibilityError);
                                    }
                                });
                    }
                });
    }
}