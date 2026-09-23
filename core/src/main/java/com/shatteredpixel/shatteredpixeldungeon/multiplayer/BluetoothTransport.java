package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public class BluetoothTransport implements NetworkTransport {
    private boolean isConnected = false;
    private TransportCallback callback;

    @Override
    public void connect(String endpoint, TransportCallback callback) throws Exception {
        this.callback = callback;
        // Mock / RFCOMM bluetooth socket abstraction setup
        this.isConnected = true;
        if (callback != null) callback.onConnected();
    }

    @Override
    public void send(NetworkMessage message) {
        // Send framing buffer over Bluetooth RFCOMM stream
    }

    @Override
    public void disconnect() {
        this.isConnected = false;
        if (callback != null) callback.onDisconnected("Bluetooth disconnected");
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
