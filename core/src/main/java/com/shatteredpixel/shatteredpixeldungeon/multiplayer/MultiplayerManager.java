package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class MultiplayerManager implements TransportCallback {
    private static MultiplayerManager instance;

    private boolean isMultiplayerActive = false;
    private String roomCode;
    private String localPlayerId;
    private String sessionToken;
    private long lastSequence = 0;
    private NetworkTransport activeTransport;
    private GameMode currentGameMode = new CoopMode();

    private final Map<String, RemotePlayer> remotePlayers = new HashMap<>();
    private final Map<String, NetworkMessage> pendingActions = new ConcurrentHashMap<>();

    private MultiplayerManager() {}

    public static synchronized MultiplayerManager getInstance() {
        if (instance == null) {
            instance = new MultiplayerManager();
        }
        return instance;
    }

    public void setGameMode(GameMode mode) {
        if (mode != null) {
            this.currentGameMode = mode;
        }
    }

    public GameMode getGameMode() {
        return currentGameMode;
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
        this.pendingActions.clear();

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
        this.pendingActions.clear();
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

    public void updateLastSequence(long seq) {
        if (seq > this.lastSequence) {
            this.lastSequence = seq;
        }
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
        msg.requestId = UUID.randomUUID().toString();
        msg.payloadJson = "{\"action\":\"" + actionType.name() + "\", \"data\":" + actionDetailsJson + "}";

        if (msg.requestId != null) {
            pendingActions.put(msg.requestId, msg);
        }

        activeTransport.send(msg);
    }

    public void sendReconnect() {
        if (!isMultiplayerActive || activeTransport == null || sessionToken == null) return;

        NetworkMessage msg = new NetworkMessage();
        msg.messageType = MessageType.RECONNECT;
        msg.senderId = localPlayerId;
        msg.requestId = UUID.randomUUID().toString();
        msg.payloadJson = "{\"sessionToken\":\"" + sessionToken + "\", \"lastSequence\":" + lastSequence + "}";

        activeTransport.send(msg);
    }

    @Override
    public void onConnected() {
        if (sessionToken != null) {
            sendReconnect();
        }
    }

    @Override
    public void onDisconnected(String reason) {}

    @Override
    public void onMessageReceived(NetworkMessage message) {
        if (message == null) return;

        if (message.messageType == MessageType.ACTION_ACCEPTED && message.requestId != null) {
            pendingActions.remove(message.requestId);
        }

        if (message.messageType == MessageType.SESSION && message.payloadJson != null) {
            String unescaped = message.payloadJson.replace("\\\"", "\"").replace("\\\\", "\\");
            try {
                if (unescaped.contains("\"playerId\":")) {
                    int pIdx = unescaped.indexOf("\"playerId\":") + 11;
                    int startP = unescaped.indexOf("\"", pIdx);
                    if (startP != -1) {
                        int endP = unescaped.indexOf("\"", startP + 1);
                        if (endP != -1) {
                            this.localPlayerId = unescaped.substring(startP + 1, endP);
                        }
                    }
                }
                if (unescaped.contains("\"sessionToken\":")) {
                    int tIdx = unescaped.indexOf("\"sessionToken\":") + 15;
                    int startT = unescaped.indexOf("\"", tIdx);
                    if (startT != -1) {
                        int endT = unescaped.indexOf("\"", startT + 1);
                        if (endT != -1) {
                            this.sessionToken = unescaped.substring(startT + 1, endT);
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        if (message.sequence > this.lastSequence) {
            this.lastSequence = message.sequence;
        }

        MessageRouter.routeMessage(message);
    }

    @Override
    public void onError(Throwable error) {}
}
