package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public interface TransportCallback {
    void onConnected();
    void onDisconnected(String reason);
    void onMessageReceived(NetworkMessage message);
    void onError(Throwable error);
}
