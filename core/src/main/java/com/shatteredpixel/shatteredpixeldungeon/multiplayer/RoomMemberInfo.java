package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

/** Immutable, server-authored room roster entry. */
public final class RoomMemberInfo {

    private final String playerId;
    private final String className;
    private final String state;
    private final boolean ready;
    private final boolean connected;

    public RoomMemberInfo(String playerId, String className, String state, boolean ready, boolean connected) {
        if (playerId == null || playerId.isEmpty()) throw new IllegalArgumentException("PLAYER_ID_REQUIRED");
        this.playerId = playerId;
        this.className = className == null || className.isEmpty() ? "WARRIOR" : className;
        this.state = state == null || state.isEmpty() ? "ALIVE" : state;
        this.ready = ready;
        this.connected = connected;
    }

    public String getPlayerId() { return playerId; }
    public String getClassName() { return className; }
    public String getState() { return state; }
    public boolean isReady() { return ready; }
    public boolean isConnected() { return connected; }
}