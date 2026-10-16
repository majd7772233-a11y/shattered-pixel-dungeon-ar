package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;

public class MultiplayerManager implements TransportCallback {
    private static MultiplayerManager instance;

    private boolean isMultiplayerActive = false;
    private String roomCode;
    private String localPlayerId;
    private String sessionToken;
    private long lastSequence = 0;
    private long lastResyncRequestedSequence = -1L;
    private String lastPublishedLevelKey;
    private Long authoritativeSeed;
    private NetworkTransport activeTransport;
    private GameMode currentGameMode = new CoopMode();

    private final Map<String, RemotePlayer> remotePlayers = new ConcurrentHashMap<>();
    private final Map<String, NetworkMessage> pendingActions = new ConcurrentHashMap<>();
    // Server entity identity is distinct from SPD's device-local Actor.id().
    private final Map<Integer, String> actorToServerEntityId = new ConcurrentHashMap<>();
    private final Map<String, Integer> serverEntityIdToActor = new ConcurrentHashMap<>();

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
        this.sessionToken = null;
        this.lastSequence = 0L;
        this.lastResyncRequestedSequence = -1L;
        this.lastPublishedLevelKey = null;
        this.authoritativeSeed = null;
        this.activeTransport = transport;
        this.isMultiplayerActive = true;
        this.remotePlayers.clear();
        this.pendingActions.clear();
        this.actorToServerEntityId.clear();
        this.serverEntityIdToActor.clear();

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
        this.actorToServerEntityId.clear();
        this.serverEntityIdToActor.clear();
        this.sessionToken = null;
        this.localPlayerId = null;
        this.roomCode = null;
        this.lastSequence = 0L;
        this.lastResyncRequestedSequence = -1L;
        this.lastPublishedLevelKey = null;
        this.authoritativeSeed = null;
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
            this.lastResyncRequestedSequence = -1L;
        }
    }

    /** Requests a full authoritative snapshot after a failed restore, once per bad sequence. */
    public void requestResync(long rejectedSnapshotSequence) {
        if (!isMultiplayerActive || activeTransport == null
                || lastResyncRequestedSequence == rejectedSnapshotSequence) return;
        lastResyncRequestedSequence = rejectedSnapshotSequence;
        NetworkMessage msg = new NetworkMessage();
        msg.messageType = MessageType.RESYNC;
        msg.senderId = localPlayerId;
        msg.requestId = UUID.randomUUID().toString();
        msg.payloadJson = "{\"lastSequence\":" + lastSequence
                + ",\"rejectedSnapshotSequence\":" + rejectedSnapshotSequence + "}";
        activeTransport.send(msg);
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

    public String getServerEntityId(int localActorId) {
        return actorToServerEntityId.get(localActorId);
    }

    public Integer getLocalActorIdForServerEntity(String entityId) {
        return entityId == null ? null : serverEntityIdToActor.get(entityId);
    }

    public void registerServerEntityId(int localActorId, String entityId) {
        if (localActorId < 0 || entityId == null || entityId.length() < 8 || entityId.length() > 80) return;
        String oldEntity = actorToServerEntityId.put(localActorId, entityId);
        if (oldEntity != null && !oldEntity.equals(entityId)) serverEntityIdToActor.remove(oldEntity, localActorId);
        Integer oldActor = serverEntityIdToActor.put(entityId, localActorId);
        if (oldActor != null && oldActor != localActorId) actorToServerEntityId.remove(oldActor, entityId);
    }

    public void handleServerEntityAck(NetworkMessage message) {
        if (message == null || message.payloadJson == null) return;
        try {
            JsonValue payload = new JsonReader().parse(message.payloadJson);
            JsonValue entities = payload == null ? null : payload.get("entities");
            if (entities == null || !entities.isArray()) return;
            for (JsonValue entity = entities.child; entity != null; entity = entity.next) {
                JsonValue mobId = entity.get("mobId");
                JsonValue entityId = entity.get("entityId");
                if (mobId != null && mobId.isNumber() && entityId != null && entityId.isString()) {
                    registerServerEntityId(mobId.asInt(), entityId.asString());
                }
            }
        } catch (RuntimeException ignored) {
            // Ignore malformed identity acknowledgements; the next full snapshot can resync.
        }
    }

    public void sendAction(NetworkActionType actionType, String actionDetailsJson) {
        if (!isMultiplayerActive || activeTransport == null) return;

        NetworkMessage msg = new NetworkMessage();
        msg.messageType = MessageType.ACTION;
        msg.senderId = localPlayerId;
        msg.requestId = UUID.randomUUID().toString();
        String heroStateJson = SPDLevelSnapshot.currentHeroStateJson();
        msg.payloadJson = "{\"action\":\"" + actionType.name() + "\", \"data\":" + actionDetailsJson
                + ",\"heroStateJson\":" + new Json().toJson(heroStateJson) + "}";

        if (msg.requestId != null) {
            pendingActions.put(msg.requestId, msg);
        }

        activeTransport.send(msg);
    }

    /** Sends the exact level generated by SPD's Java builders and painters to the room authority. */
    public void applyAuthoritativeSeed() {
        if (isMultiplayerActive && authoritativeSeed != null) {
            Dungeon.seed = authoritativeSeed;
        }
    }

    public void publishCurrentLevel() {
        if (!isMultiplayerActive || activeTransport == null || Dungeon.level == null) return;
        String levelKey = Dungeon.seed + ":" + Dungeon.branch + ":" + Dungeon.depth;
        if (levelKey.equals(lastPublishedLevelKey)) return;
        String snapshot = SPDLevelSnapshot.currentLevelJson();
        if (snapshot == null) return;
        NetworkMessage msg = new NetworkMessage();
        msg.messageType = MessageType.LEVEL_DATA;
        msg.senderId = localPlayerId;
        msg.requestId = UUID.randomUUID().toString();
        msg.payloadJson = snapshot;
        activeTransport.send(msg);
        lastPublishedLevelKey = levelKey;
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
            try {
                JsonValue payload = new JsonReader().parse(message.payloadJson);
                JsonValue playerIdValue = payload.get("playerId");
                JsonValue tokenValue = payload.get("sessionToken");
                if (playerIdValue != null && !playerIdValue.isNull()) {
                    this.localPlayerId = playerIdValue.asString();
                }
                if (tokenValue != null && !tokenValue.isNull()) {
                    this.sessionToken = tokenValue.asString();
                }
                JsonValue seqValue = payload.get("sequence");
                if (seqValue != null && !seqValue.isNull()) {
                    updateLastSequence(seqValue.asLong());
                }
                JsonValue seedValue = payload.get("seed");
                if (seedValue != null && !seedValue.isNull()) {
                    // SESSION arrives before HeroSelectScene starts the run, so all clients
                    // initialize Dungeon with the same seed before SPD builds its first floor.
                    authoritativeSeed = seedValue.asLong();
                    Dungeon.seed = authoritativeSeed;
                }
            } catch (RuntimeException ignored) {
                // A malformed SESSION must not overwrite an existing valid token.
            }
        }

        // A snapshot sequence is acknowledged only after its full native world is restored.
        if (message.messageType != MessageType.SNAPSHOT && message.sequence > this.lastSequence) {
            this.lastSequence = message.sequence;
        }

        MessageRouter.routeMessage(message);
    }

    @Override
    public void onError(Throwable error) {}
}
