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
    private volatile boolean levelPublisher = false;
    private volatile boolean resolvingAuthorityCombat = false;
    private volatile String authorityCombatRequestId;
    private String roomCode;
    private String localPlayerId;
    private String sessionToken;
    private long lastSequence = 0;
    private long lastResyncRequestedSequence = -1L;
    private String lastPublishedLevelKey;
    private Long authoritativeSeed;
    private String pendingUnblessedAnkhBeforeHeroStateJson;
    private String pendingUnblessedAnkhBeforeBuffsJson;
    private int pendingUnblessedAnkhDepth = -1;
    private int pendingUnblessedAnkhBranch = -1;
    private boolean pendingUnblessedAnkhWasLevelLocked;
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
        this.levelPublisher = false;
        this.endAuthorityCombat();
        this.lastSequence = 0L;
        this.lastResyncRequestedSequence = -1L;
        this.lastPublishedLevelKey = null;
        this.authoritativeSeed = null;
        clearPendingUnblessedAnkhRevival();
        WorldSnapshot.clearAppliedSnapshot();
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
        this.levelPublisher = false;
        this.endAuthorityCombat();
        this.localPlayerId = null;
        this.roomCode = null;
        this.lastSequence = 0L;
        this.lastResyncRequestedSequence = -1L;
        this.lastPublishedLevelKey = null;
        this.authoritativeSeed = null;
        clearPendingUnblessedAnkhRevival();
        WorldSnapshot.clearAppliedSnapshot();
    }

    public boolean isLevelPublisher() { return levelPublisher; }

    public boolean isResolvingAuthorityCombat() { return resolvingAuthorityCombat; }

    public String getAuthorityCombatRequestId() { return authorityCombatRequestId; }

    public void beginAuthorityCombat(String requestId) {
        authorityCombatRequestId = requestId;
        resolvingAuthorityCombat = requestId != null && !requestId.isEmpty();
    }

    public void endAuthorityCombat() {
        resolvingAuthorityCombat = false;
        authorityCombatRequestId = null;
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

    /** Capture the server-committed dead state before the user confirms an unblessed Ankh. */
    public void beginUnblessedAnkhRevival() {
        clearPendingUnblessedAnkhRevival();
        if (!isMultiplayerActive || Dungeon.hero == null || Dungeon.level == null) return;
        try {
            String stateJson = SPDLevelSnapshot.currentHeroStateJson();
            JsonValue state = new JsonReader().parse(stateJson);
            int ankhCount = state.getInt("ankhCount", 0);
            int blessedCount = state.getInt("blessedAnkhCount", 0);
            if (state.getInt("hp", 1) != 0 || ankhCount - blessedCount < 1) return;
            pendingUnblessedAnkhBeforeHeroStateJson = stateJson;
            pendingUnblessedAnkhBeforeBuffsJson = SPDLevelSnapshot.currentCombatBuffsJson(Dungeon.hero);
            pendingUnblessedAnkhDepth = Dungeon.depth;
            pendingUnblessedAnkhBranch = Dungeon.branch;
            pendingUnblessedAnkhWasLevelLocked = Dungeon.level.locked;
        } catch (RuntimeException ignored) {
            clearPendingUnblessedAnkhRevival();
        }
    }

    /** Commits the native RESURRECT result on the render thread after InterlevelScene finishes. */
    public void finishPendingUnblessedAnkhRevival() {
        String beforeJson = pendingUnblessedAnkhBeforeHeroStateJson;
        String beforeBuffs = pendingUnblessedAnkhBeforeBuffsJson;
        int beforeDepth = pendingUnblessedAnkhDepth;
        int beforeBranch = pendingUnblessedAnkhBranch;
        boolean wasLevelLocked = pendingUnblessedAnkhWasLevelLocked;
        clearPendingUnblessedAnkhRevival();
        if (beforeJson == null || beforeBuffs == null || !isMultiplayerActive
                || Dungeon.hero == null || Dungeon.level == null) return;
        try {
            String afterJson = SPDLevelSnapshot.currentHeroStateJson();
            JsonValue before = new JsonReader().parse(beforeJson);
            JsonValue after = new JsonReader().parse(afterJson);
            if (beforeDepth != Dungeon.depth || beforeBranch != Dungeon.branch
                    || before.getInt("ankhCount", 0) - after.getInt("ankhCount", 0) != 1
                    || before.getInt("blessedAnkhCount", 0) != after.getInt("blessedAnkhCount", 0)
                    || after.getInt("hp", 0) <= 0 || after.getInt("hp", 0) != after.getInt("ht", 0)) {
                requestResync(getLastSequence());
                return;
            }
            java.util.Map<String, Object> data = new HashMap<>();
            data.put("revivalKind", "UNBLESSED_ANKH");
            data.put("combatDepth", Dungeon.depth);
            data.put("targetHpBefore", before.getInt("hp", 0));
            data.put("targetHtBefore", before.getInt("ht", 1));
            data.put("targetHp", after.getInt("hp", 1));
            data.put("targetHt", after.getInt("ht", 1));
            data.put("targetPosBefore", before.getInt("pos", -1));
            data.put("targetPosAfter", after.getInt("pos", -1));
            data.put("targetShieldBefore", before.getInt("shielding", 0));
            data.put("targetShieldAfter", after.getInt("shielding", 0));
            data.put("targetBuffsBefore", beforeBuffs);
            data.put("targetBuffs", SPDLevelSnapshot.currentCombatBuffsJson(Dungeon.hero));
            data.put("ankhCountBefore", before.getInt("ankhCount", 0));
            data.put("ankhCountAfter", after.getInt("ankhCount", 0));
            data.put("blessedAnkhCountBefore", before.getInt("blessedAnkhCount", 0));
            data.put("blessedAnkhCountAfter", after.getInt("blessedAnkhCount", 0));
            data.put("heaps", new Json().fromJson(java.util.ArrayList.class, SPDLevelSnapshot.currentHeapsJson()));
            data.put("levelWasLocked", wasLevelLocked);
            sendAction(NetworkActionType.REVIVE, new Json().toJson(data), afterJson);
        } catch (RuntimeException error) {
            requestResync(getLastSequence());
        }
    }

    private void clearPendingUnblessedAnkhRevival() {
        pendingUnblessedAnkhBeforeHeroStateJson = null;
        pendingUnblessedAnkhBeforeBuffsJson = null;
        pendingUnblessedAnkhDepth = -1;
        pendingUnblessedAnkhBranch = -1;
        pendingUnblessedAnkhWasLevelLocked = false;
    }

    public String getSessionToken() {
        return sessionToken;
    }

    public long getLastSequence() {
        return lastSequence;
    }

    public void updateLastSequence(long seq) {
        if (seq > this.lastSequence) this.lastSequence = seq;
    }

    public void markSnapshotApplied(long seq) {
        if (seq > this.lastSequence) this.lastSequence = seq;
        lastResyncRequestedSequence = -1L;
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

    public void removeServerEntityIdForActor(int localActorId) {
        String entityId = actorToServerEntityId.remove(localActorId);
        if (entityId != null) serverEntityIdToActor.remove(entityId, localActorId);
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
        sendAction(actionType, actionDetailsJson, SPDLevelSnapshot.currentHeroStateJson());
    }

    /** Sends an action together with the exact native hero state affected by it. */
    public void sendAction(NetworkActionType actionType, String actionDetailsJson, String nativeHeroStateJson) {
        if (!isMultiplayerActive || activeTransport == null) return;

        NetworkMessage msg = new NetworkMessage();
        msg.messageType = MessageType.ACTION;
        msg.senderId = localPlayerId;
        msg.requestId = UUID.randomUUID().toString();
        String heroStateJson = nativeHeroStateJson == null ? "" : nativeHeroStateJson;
        msg.payloadJson = "{\"action\":\"" + actionType.name() + "\", \"data\":" + actionDetailsJson
                + ",\"heroStateJson\":" + new Json().toJson(heroStateJson) + "}";

        if (msg.requestId != null) {
            pendingActions.put(msg.requestId, msg);
        }

        activeTransport.send(msg);
    }

    public void sendAuthorityAction(String requestId, NetworkActionType actionType,
                                    String actionDetailsJson, String heroStateJson) {
        if (!isMultiplayerActive || activeTransport == null || requestId == null || requestId.isEmpty()) return;
        NetworkMessage msg = new NetworkMessage();
        msg.messageType = MessageType.ACTION;
        msg.senderId = localPlayerId;
        msg.requestId = requestId;
        msg.payloadJson = "{\"action\":\"" + actionType.name() + "\",\"data\":" + actionDetailsJson
                + ",\"heroStateJson\":" + new Json().toJson(heroStateJson) + "}";
        pendingActions.put(requestId, msg);
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

        // Native combat accepted by another player's authority returns to the attacker in
        // EVENT_BATCH. Clear its optimistic request from that sequenced result.
        if (message.messageType == MessageType.EVENT_BATCH && message.payloadJson != null) {
            try {
                JsonValue events = new JsonReader().parse(message.payloadJson);
                if (events != null && events.isArray()) {
                    for (JsonValue event = events.child; event != null; event = event.next) {
                        JsonValue action = event.get("action");
                        if (action == null || !action.isObject()) {
                            JsonValue stored = event.get("payload");
                            if (stored != null && stored.isString()) action = new JsonReader().parse(stored.asString());
                            else if (stored != null && stored.isObject()) action = stored;
                        }
                        JsonValue combatRequestId = action == null ? null : action.get("combatRequestId");
                        if (combatRequestId != null && combatRequestId.isString()) {
                            pendingActions.remove(combatRequestId.asString());
                        }
                    }
                }
            } catch (RuntimeException ignored) {}
        }

        if (message.messageType == MessageType.ACTION_ACCEPTED && message.requestId != null) {
            pendingActions.remove(message.requestId);
        } else if (message.messageType == MessageType.ERROR && message.requestId != null) {
            NetworkMessage rejected = pendingActions.remove(message.requestId);
            if (rejected != null && rejected.payloadJson != null
                    && (rejected.payloadJson.contains("\"action\":\"ATTACK\"")
                        || rejected.payloadJson.contains("\"action\":\"SYNC_MOB_STATE\"")
                        || rejected.payloadJson.contains("\"action\":\"SYNC_PLAYER_COMBAT\"")
                    || rejected.payloadJson.contains("\"action\":\"SYNC_HERO_STATE\"")
                    || rejected.payloadJson.contains("\"action\":\"REVIVE\""))) {
                // Native combat may already have applied secondary procs locally. If the
                // authoritative server rejects an incomplete/stale delta, restore the exact
                // server world instead of leaving this device in a speculative state.
                requestResync(message.sequence);
            }
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
                JsonValue publisherValue = payload.get("isLevelPublisher");
                this.levelPublisher = publisherValue != null && !publisherValue.isNull() && publisherValue.asBoolean();
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
