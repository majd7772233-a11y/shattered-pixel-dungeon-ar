package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.UUID;

public class BluetoothTransport implements NetworkTransport {
    public static final String SPD_MULTIPLAYER_UUID_STR = "7f3a9d42-6c81-4e55-b7d2-3e9a1f64c820";
    public static final UUID SPD_MULTIPLAYER_UUID = UUID.fromString(SPD_MULTIPLAYER_UUID_STR);
    public static final int MAX_BLUETOOTH_PLAYERS = 2;

    public interface NativeBluetoothProvider {
        void startServer(UUID serviceUuid, TransportCallback callback) throws Exception;
        void connectDevice(String deviceAddress, UUID serviceUuid, TransportCallback callback) throws Exception;
        void sendData(byte[] data) throws Exception;
        void disconnect();
        boolean isConnected();
    }

    private static NativeBluetoothProvider nativeProvider;
    private boolean isConnected = false;
    private TransportCallback callback;

    public static void setNativeProvider(NativeBluetoothProvider provider) {
        nativeProvider = provider;
    }

    public static NativeBluetoothProvider getNativeProvider() {
        return nativeProvider;
    }

    public void startBluetoothServer(TransportCallback callback) throws Exception {
        this.callback = callback;
        if (nativeProvider != null) {
            nativeProvider.startServer(SPD_MULTIPLAYER_UUID, callback);
            this.isConnected = true;
        } else {
            this.isConnected = true;
            if (callback != null) callback.onConnected();
        }
    }

    @Override
    public void connect(String deviceAddress, TransportCallback callback) throws Exception {
        this.callback = callback;
        if ("SERVER".equalsIgnoreCase(deviceAddress) || isConnected) {
            if (callback != null) callback.onConnected();
            return;
        }

        if (nativeProvider != null) {
            nativeProvider.connectDevice(deviceAddress, SPD_MULTIPLAYER_UUID, callback);
            this.isConnected = true;
        } else {
            this.isConnected = true;
            if (callback != null) callback.onConnected();
        }
    }

    @Override
    public void send(NetworkMessage message) {
        if (nativeProvider != null && nativeProvider.isConnected()) {
            try {
                String serialized = "{\"messageType\":\"" + (message.messageType != null ? message.messageType.name() : "ACTION") +
                        "\",\"payloadJson\":" + (message.payloadJson != null ? message.payloadJson : "{}") + "}\n";
                nativeProvider.sendData(serialized.getBytes("UTF-8"));
            } catch (Exception e) {
                if (callback != null) callback.onError(e);
            }
        }
    }

    @Override
    public void disconnect() {
        this.isConnected = false;
        if (nativeProvider != null) {
            nativeProvider.disconnect();
        }
        if (callback != null) {
            callback.onDisconnected("Bluetooth disconnected");
        }
    }

    @Override
    public boolean isConnected() {
        return isConnected;
    }

    @Override
    public String getTransportType() {
        return "BLUETOOTH";
    }
}
