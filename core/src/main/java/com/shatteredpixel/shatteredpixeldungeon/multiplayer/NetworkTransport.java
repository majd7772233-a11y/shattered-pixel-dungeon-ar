package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public interface NetworkTransport {
    void connect(String endpoint, TransportCallback callback) throws Exception;
    void send(NetworkMessage message);
    void disconnect();
    boolean isConnected();
    String getTransportType();
}
