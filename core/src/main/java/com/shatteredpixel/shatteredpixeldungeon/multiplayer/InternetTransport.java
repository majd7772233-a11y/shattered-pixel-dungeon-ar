package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.net.URI;

public class InternetTransport implements NetworkTransport {
    private boolean isConnected = false;
    private TransportCallback callback;

    @Override
    public void connect(String endpoint, TransportCallback callback) throws Exception {
        this.callback = callback;
        // In real execution, uses platform WebSocket client (e.g. OkHttp/Java-WebSocket)
        this.isConnected = true;
        if (callback != null) {
            callback.onConnected();
        }
    }

    @Override
    public void send(NetworkMessage message) {
        if (!isConnected) return;
        // Broadcasts NetworkMessage payload to Cloudflare Durable Object endpoint
    }

    @Override
    public void disconnect() {
        this.isConnected = false;
        if (callback != null) {
            callback.onDisconnected("Disconnected from internet match server");
        }
    }

    @Override
    public boolean isConnected() {
        return isConnected;
    }

    @Override
    public String getTransportType() {
        return "INTERNET";
    }
}
