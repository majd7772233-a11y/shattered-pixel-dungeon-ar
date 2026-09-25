package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class MultiplayerManager implements TransportCallback {
    private static MultiplayerManager instance;

    private boolean isMultiplayerActive = false;
    private String roomCode;
    private String localPlayerId;
    private String sessionToken;
    private long lastSequence = 0;
    private NetworkTransport activeTransport;

    private final Map<String, RemotePlayer> remotePlayers = new HashMap<>();

    private MultiplayerManager() {}

    public static synchronized MultiplayerManager getInstance() {
        if (instance == null) {
            instance = new MultiplayerManager();
        }
        return instance;
    }

    public void startSession(String roomCode, String initialPlayerId, NetworkTransport transport) throws IllegalArgumentException {
        if ("BLUETOOTH".equalsIgnoreCase(transport.getTransportType()) && remotePlayers.size() >= BluetoothTransport.MAX_BLUETOOTH_PLAYERS) {
            throw new IllegalArgumentException("Bluetooth supports a maximum of 2 players.");
        }

        this.roomCode = roomCode;
        this.localPlayerId = initialPlayerId;
        this.activeTransport = transport;
        this.isMultiplayerActive = true;
        this.remotePlayers.clear();

        try {
            this.activeTransport.connect(roomCode, this);
        } catch (Exception ignored) {}
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

    public String getSessionToken() {
        return sessionToken;
    }

    public long getLastSequence() {
        return lastSequence;
    }

    public Map<String, RemotePlayer> getRemotePlayers() {
        return Collections.unmodifiableMap(remotePlayers);
    }

    public void addRemotePlayer(RemotePlayer player) {
        if (activeTransport != null && "BLUETOOTH".equalsIgnoreCase(activeTransport.getTransportType())
                && remotePlayers.size() >= (BluetoothTransport.MAX_BLUETOOTH_PLAYERS - 1)) {
            throw new IllegalStateException("Bluetooth multiplayer allows only 2 players max.");
        }
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

    @Override
    public void onConnected() {}

    @Override
    public void onDisconnected(String reason) {}

    @Override
    public void onMessageReceived(NetworkMessage message) {
        if (message == null) return;

        if (message.messageType == MessageType.SESSION && message.payloadJson != null) {
            // Process authoritative SESSION handshake response
            try {
                if (message.payloadJson.contains("\"playerId\":")) {
                    int pIdx = message.payloadJson.indexOf("\"playerId\":") + 12;
                    int endP = message.payloadJson.indexOf("\"", pIdx);
                    if (endP != -1) {
                        this.localPlayerId = message.payloadJson.substring(pIdx, endP);
                    }
                }
                if (message.payloadJson.contains("\"sessionToken\":")) {
                    int tIdx = message.payloadJson.indexOf("\"sessionToken\":") + 16;
                    int endT = message.payloadJson.indexOf("\"", tIdx);
                    if (endT != -1) {
                        this.sessionToken = message.payloadJson.substring(tIdx, endT);
                    }
                }
            } catch (Exception ignored) {}
        }

        if (message.sequence > this.lastSequence) {
            this.lastSequence = message.sequence;
        }

        RemotePlayerActionReceiver.handleNetworkMessage(message);
    }

    @Override
    public void onError(Throwable error) {}
}
