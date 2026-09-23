package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class MultiplayerManager {
    private static MultiplayerManager instance;

    private boolean isMultiplayerActive = false;
    private String roomCode;
    private String localPlayerId;
    private NetworkTransport activeTransport;

    private final Map<String, RemotePlayer> remotePlayers = new HashMap<>();

    private MultiplayerManager() {}

    public static synchronized MultiplayerManager getInstance() {
        if (instance == null) {
            instance = new MultiplayerManager();
        }
        return instance;
    }

    public void startSession(String roomCode, String localPlayerId, NetworkTransport transport) {
        this.roomCode = roomCode;
        this.localPlayerId = localPlayerId;
        this.activeTransport = transport;
        this.isMultiplayerActive = true;
        this.remotePlayers.clear();
    }

    public void endSession() {
        this.isMultiplayerActive = false;
        if (activeTransport != null) {
            activeTransport.disconnect();
            activeTransport = null;
        }
        this.remotePlayers.clear();
    }

    public boolean isMultiplayerActive() {
        return isMultiplayerActive;
    }

    public String getRoomCode() {
        return roomCode;
    }

    public String getLocalPlayerId() {
        return localPlayerId;
    }

    public Map<String, RemotePlayer> getRemotePlayers() {
        return Collections.unmodifiableMap(remotePlayers);
    }

    public void addRemotePlayer(RemotePlayer player) {
        remotePlayers.put(player.playerId, player);
    }

    public void removeRemotePlayer(String playerId) {
        remotePlayers.remove(playerId);
    }

    public RemotePlayer getRemotePlayer(String playerId) {
        return remotePlayers.get(playerId);
    }

    public void sendAction(NetworkActionType actionType, String actionDetailsJson) {
        if (!isMultiplayerActive || activeTransport == null) return;

        NetworkMessage msg = new NetworkMessage();
        msg.messageType = MessageType.ACTION;
        msg.senderId = localPlayerId;
        msg.payloadJson = "{\"action\":\"" + actionType.name() + "\", \"data\":" + actionDetailsJson + "}";

        activeTransport.send(msg);
    }
}
