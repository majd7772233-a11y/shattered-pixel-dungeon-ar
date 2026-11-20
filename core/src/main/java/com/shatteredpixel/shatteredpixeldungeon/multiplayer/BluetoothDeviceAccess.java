package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.List;

/** Android-owned operations that require adapter state, runtime permission or system consent. */
public interface BluetoothDeviceAccess {
    enum Mode { DISCOVERY, HOST_VISIBILITY }

    interface ResultCallback {
        void onResult(boolean success, String errorCode);
    }

    interface DiscoveryCallback {
        void onDeviceFound(BluetoothDeviceInfo device);
        void onDeviceRemoved(String address);
        void onDiscoveryFinished(String errorCode);
    }

    void prepare(Mode mode, ResultCallback callback);
    List<BluetoothDeviceInfo> getPairedDevices() throws Exception;
    void startDiscovery(DiscoveryCallback callback) throws Exception;
    void cancelDiscovery();
    void requestDiscoverable(int durationSeconds, ResultCallback callback);
}