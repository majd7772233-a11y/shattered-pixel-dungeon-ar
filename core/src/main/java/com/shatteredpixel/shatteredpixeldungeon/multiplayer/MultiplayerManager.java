package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

public class MultiplayerManager implements TransportCallback {
   private static final ScheduledExecutorService SESSION_SCHEDULER = Executors.newSingleThreadScheduledExecutor(runnable -> {
      Thread thread = new Thread(runnable, "spd-multiplayer-session-timeouts");
      thread.setDaemon(true);
      return thread;
   });
   private static final long DEFAULT_SESSION_HANDSHAKE_TIMEOUT_MS = 15000L;
   private static final long DEFAULT_ROOM_OPERATION_TIMEOUT_MS = 12000L;
   private static final long DEFAULT_RECONNECT_BASE_DELAY_MS = 250L;
   private static final int DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;
   private static MultiplayerManager instance;
   private volatile boolean isMultiplayerActive = false;
   private volatile boolean levelPublisher = false;
   private volatile String levelPublisherId;
   private volatile long levelPublisherTerm = -1L;
   private volatile long publisherRebaseSentTerm = -1L;
   private final Map<String, Long> publisherRebaseRequests = new ConcurrentHashMap();
   private volatile boolean floorTransitionPending = false;
   private volatile boolean resolvingAuthorityCombat = false;
   private volatile String authorityCombatRequestId;
   private String roomCode;
   private volatile String localPlayerId;
   private volatile String sessionToken;
   private volatile boolean reconnectHandshakePending = false;
   private volatile boolean initialSessionHandshakePending = false;
   private volatile long lastSequence = 0L;
   private volatile long lastResyncRequestedSequence = -1L;
   private String lastPublishedLevelKey;
   private long nativeWorldTurnCounter;
   private Long authoritativeSeed;
   private String pendingUnblessedAnkhBeforeHeroStateJson;
   private String pendingUnblessedAnkhBeforeBuffsJson;
   private int pendingUnblessedAnkhDepth = -1;
   private int pendingUnblessedAnkhBranch = -1;
   private boolean pendingUnblessedAnkhWasLevelLocked;
   private volatile NetworkTransport activeTransport;
   private Supplier<InternetTransport> internetTransportFactory = InternetTransport::new;
   private GameMode currentGameMode = new CoopMode();
   private volatile SessionState sessionState;
   private volatile String sessionError;
   private volatile int roomLifecycleVersion;
   private volatile boolean roomLifecycleSession;
   private volatile boolean createRoomOnConnect;
   private volatile boolean roomMembership;
   private volatile String roomOwnerId;
   private volatile String roomStatus;
   private volatile String roomLifecycleError;
   private volatile int roomMemberCount;
   private volatile int roomMaxPlayers;
   private volatile boolean roomAllReady;
   private volatile boolean roomSnapshotReady;
   private volatile boolean localRoomReady;
   private volatile long roomSequence;
   private volatile long roomSeed;
   private final Map<String, MessageType> pendingRoomOperations;
   private final Map<String, ScheduledFuture<?>> pendingRoomOperationTimeouts = new ConcurrentHashMap<>();
   private volatile long sessionGeneration;
   private volatile ScheduledFuture<?> sessionHandshakeTimeoutTask;
   private volatile ScheduledFuture<?> reconnectRetryTask;
   private volatile int reconnectAttemptCount;
   private volatile long sessionHandshakeTimeoutMs = DEFAULT_SESSION_HANDSHAKE_TIMEOUT_MS;
   private volatile long roomOperationTimeoutMs = DEFAULT_ROOM_OPERATION_TIMEOUT_MS;
   private volatile long reconnectBaseDelayMs = DEFAULT_RECONNECT_BASE_DELAY_MS;
   private volatile int maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS;
   private volatile boolean networkAvailable = true;
   private volatile boolean appInForeground = true;
   private final Map<String, RemotePlayer> remotePlayers;
   private final Map<String, NetworkMessage> pendingActions;
   private final Map<Integer, String> actorToServerEntityId;
   private final Map<String, Integer> serverEntityIdToActor;

   private MultiplayerManager() {
      this.sessionState = MultiplayerManager.SessionState.DISCONNECTED;
      this.createRoomOnConnect = true;
      this.roomStatus = "LOBBY";
      this.pendingRoomOperations = new ConcurrentHashMap();
      this.remotePlayers = new ConcurrentHashMap();
      this.pendingActions = new ConcurrentHashMap();
      this.actorToServerEntityId = new ConcurrentHashMap();
      this.serverEntityIdToActor = new ConcurrentHashMap();
   }

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
      return this.currentGameMode;
   }

   void setInternetTransportFactoryForTests(Supplier<InternetTransport> factory) {
      this.internetTransportFactory = factory != null ? factory : InternetTransport::new;
   }

   private synchronized void cancelSessionHandshakeTimeout() {
      ScheduledFuture<?> pending = sessionHandshakeTimeoutTask;
      sessionHandshakeTimeoutTask = null;
      if (pending != null) pending.cancel(false);
   }

   private synchronized void cancelReconnectRetry() {
      ScheduledFuture<?> pending = reconnectRetryTask;
      reconnectRetryTask = null;
      if (pending != null) pending.cancel(false);
   }

   private void cancelRoomOperationTimeout(String requestId) {
      if (requestId == null) return;
      ScheduledFuture<?> pending = pendingRoomOperationTimeouts.remove(requestId);
      if (pending != null) pending.cancel(false);
   }

   private void clearPendingRoomOperations() {
      pendingRoomOperations.clear();
      RoomLobbyState.clear();
      for (ScheduledFuture<?> pending : pendingRoomOperationTimeouts.values()) {
         if (pending != null) pending.cancel(false);
      }
      pendingRoomOperationTimeouts.clear();
   }

   private synchronized void scheduleSessionHandshakeTimeout(long generation, NetworkTransport transport, boolean reconnecting) {
      cancelSessionHandshakeTimeout();
      sessionHandshakeTimeoutTask = SESSION_SCHEDULER.schedule(
              () -> onSessionHandshakeTimeout(generation, transport, reconnecting),
              sessionHandshakeTimeoutMs, TimeUnit.MILLISECONDS);
   }

   private synchronized void onSessionHandshakeTimeout(long generation, NetworkTransport transport, boolean reconnecting) {
      if (generation != sessionGeneration || activeTransport != transport) return;
      sessionHandshakeTimeoutTask = null;
      if (!networkAvailable || !appInForeground) return;
       if (reconnecting) {
         if (!reconnectHandshakePending || sessionToken == null) return;
         reconnectHandshakePending = false;
         scheduleReconnectRetry("RECONNECT_HANDSHAKE_TIMEOUT");
         return;
      }
      if (sessionToken != null || (sessionState != SessionState.CONNECTING
              && sessionState != SessionState.TRANSPORT_CONNECTED)) return;
      failInitialSession("SESSION_HANDSHAKE_TIMEOUT");
   }

   private synchronized void scheduleReconnectRetry(String reason) {
      if (!networkAvailable || !appInForeground) {
         cancelReconnectRetry();
         reconnectHandshakePending = false;
         cancelSessionHandshakeTimeout();
         sessionState = SessionState.RECONNECTING;
         sessionError = networkAvailable ? "APP_BACKGROUND" : "NETWORK_UNAVAILABLE";
        notifyRoomLobbyStateChanged();
         return;
      }
      if (!isMultiplayerActive || sessionToken == null || sessionGeneration <= 0L) return;
      if (reconnectRetryTask != null && !reconnectRetryTask.isDone()) return;
      if (reconnectAttemptCount >= maxReconnectAttempts) {
         cancelSessionHandshakeTimeout();
         reconnectHandshakePending = false;
         clearPendingRoomOperations();
         isMultiplayerActive = false;
         sessionState = SessionState.FAILED;
         sessionError = "RECONNECT_ATTEMPTS_EXHAUSTED";
         notifyRoomLobbyStateChanged();
         NetworkTransport failed = activeTransport;
         activeTransport = null;
         if (failed != null) {
            try { failed.disconnect(); } catch (RuntimeException ignored) {}
         }
         return;
      }
      final long generation = sessionGeneration;
      final int attempt = ++reconnectAttemptCount;
      final long multiplier = 1L << Math.min(attempt - 1, 4);
      final long delay = Math.min(reconnectBaseDelayMs * multiplier, 4000L);
      reconnectHandshakePending = false;
      sessionState = SessionState.RECONNECTING;
       notifyRoomLobbyStateChanged();
      reconnectRetryTask = SESSION_SCHEDULER.schedule(() -> {
         synchronized (MultiplayerManager.this) {
            if (generation != sessionGeneration || !isMultiplayerActive
                    || sessionState != SessionState.RECONNECTING) return;
            reconnectRetryTask = null;
            if (!reconnectInternetSession()) scheduleReconnectRetry("RECONNECT_START_FAILED");
         }
      }, delay, TimeUnit.MILLISECONDS);
   }

   void setSessionTimingForTests(long handshakeTimeoutMs, long operationTimeoutMs, long reconnectDelayMs, int retries) {
      sessionHandshakeTimeoutMs = Math.max(1L, handshakeTimeoutMs);
      roomOperationTimeoutMs = Math.max(1L, operationTimeoutMs);
      reconnectBaseDelayMs = Math.max(1L, reconnectDelayMs);
      maxReconnectAttempts = Math.max(0, retries);
   }
   long getSessionGeneration() { return sessionGeneration; }
   long getSessionGenerationForTests() { return getSessionGeneration(); }

   private void notifyRoomLobbyStateChanged() {
      final long generation = sessionGeneration;
      if (com.badlogic.gdx.Gdx.app == null) {
         RoomLobbyState.touch();
      } else {
         com.watabou.noosa.Game.runOnRenderThread(() -> com.watabou.noosa.Game.runWithRenderThreadGuard(
                 () -> generation == sessionGeneration, RoomLobbyState::touch));
      }
   }

   public void onNetworkAvailabilityChanged(boolean available) {
      NetworkTransport disconnect = null;
      synchronized (this) {
         if (networkAvailable == available) return;
         networkAvailable = available;
         if (!available) {
            if (activeTransport instanceof InternetTransport && sessionToken != null && isMultiplayerActive) {
               cancelReconnectRetry();
               cancelSessionHandshakeTimeout();
               reconnectHandshakePending = false;
               sessionState = SessionState.RECONNECTING;
               sessionError = "NETWORK_UNAVAILABLE";
               disconnect = activeTransport;
       notifyRoomLobbyStateChanged();
            } else if (activeTransport instanceof InternetTransport && sessionToken == null
                    && (sessionState == SessionState.CONNECTING || sessionState == SessionState.TRANSPORT_CONNECTED)) {
               failInitialSession("NETWORK_UNAVAILABLE");
            }
         } else if (sessionToken != null && isMultiplayerActive && activeTransport instanceof InternetTransport
                 && !activeTransport.isConnected() && appInForeground) {
            reconnectAttemptCount = 0;
            scheduleReconnectRetry("NETWORK_AVAILABLE");
         }
      }
      if (disconnect != null) {
         try { disconnect.disconnect(); } catch (RuntimeException ignored) {}
      }
   }

   public synchronized void onAppBackgrounded() {
      if (!appInForeground) return;
      appInForeground = false;
      cancelReconnectRetry();
      if (reconnectHandshakePending || initialSessionHandshakePending) cancelSessionHandshakeTimeout();
   }

   public void onAppForegrounded() {
      NetworkTransport transport;
      boolean retry;
      boolean resumeHandshake;
      synchronized (this) {
         if (appInForeground) return;
         appInForeground = true;
         if (!networkAvailable || !(activeTransport instanceof InternetTransport)) return;
         transport = activeTransport;
         if (initialSessionHandshakePending && !transport.isConnected()) {
            failInitialSession("NETWORK_UNAVAILABLE");
            return;
         }
         if (sessionToken == null && !initialSessionHandshakePending) return;
         if (!isMultiplayerActive && !initialSessionHandshakePending) return;
         resumeHandshake = (reconnectHandshakePending || initialSessionHandshakePending) && transport.isConnected();
         if (reconnectHandshakePending && !transport.isConnected()) {
            cancelSessionHandshakeTimeout();
            reconnectHandshakePending = false;
         }
         retry = !reconnectHandshakePending && !initialSessionHandshakePending
                 && (!transport.isConnected() || sessionState == SessionState.RECONNECTING);
         if (retry) reconnectAttemptCount = 0;
         if (resumeHandshake) scheduleSessionHandshakeTimeout(sessionGeneration, transport, reconnectHandshakePending);
      }
      if (resumeHandshake) {
         ((InternetTransport) transport).probeNow();
         return;
      }
      if (retry) {
         if (transport.isConnected()) {
            try { transport.disconnect(); } catch (RuntimeException ignored) {}
         }
         synchronized (this) {
            if (activeTransport == transport && sessionToken != null && isMultiplayerActive
                    && networkAvailable && appInForeground && !reconnectHandshakePending) {
               scheduleReconnectRetry("APP_FOREGROUND");
            }
         }
      } else if (transport.isConnected()) {
         ((InternetTransport) transport).probeNow();
      }
   }

   boolean isNetworkAvailableForTests() { return networkAvailable; }
   boolean isAppInForegroundForTests() { return appInForeground; }
   boolean isInitialSessionHandshakePendingForTests() { return initialSessionHandshakePending; }
   int getReconnectAttemptCountForTests() { return reconnectAttemptCount; }
   synchronized boolean isSessionGenerationCurrent(long generation) {
      return isMultiplayerActive && activeTransport != null && sessionGeneration == generation;
   }

   boolean isReconnectHandshakePendingForTests() { return reconnectHandshakePending; }
   boolean isCurrentTransportForTests(NetworkTransport transport) { return activeTransport == transport; }
   boolean isRejectedCredentialForTests(Throwable error) { return isRejectedSessionCredential(error); }

   private void dispatchTransportMessage(final NetworkTransport transport, final long generation,
                                         final NetworkMessage message) {
      synchronized (this) {
         if (activeTransport != transport || sessionGeneration != generation) return;
      }
      Runnable applyMessage = () -> {
         synchronized (MultiplayerManager.this) {
            if (activeTransport != transport || sessionGeneration != generation) return;
            if (!(transport instanceof InternetTransport) || transport.isConnected()) {
               MultiplayerManager.this.onMessageReceived(message);
            }
         }
      };
      if (com.badlogic.gdx.Gdx.app == null) {
         // Pure JVM lifecycle tests have no LibGDX application; production always dispatches.
         applyMessage.run();
      } else {
         com.watabou.noosa.Game.runOnRenderThread(applyMessage::run);
      }
   }

   private void dispatchTransportStateCallback(final NetworkTransport transport, final long generation,
                                               final Runnable action) {
      synchronized (this) {
         if (activeTransport != transport || sessionGeneration != generation) return;
      }
      Runnable applyCallback = () -> {
         synchronized (MultiplayerManager.this) {
            if (activeTransport != transport || sessionGeneration != generation) return;
            action.run();
         }
      };
      if (com.badlogic.gdx.Gdx.app == null) {
         // Pure JVM lifecycle tests have no LibGDX application; production always dispatches.
         applyCallback.run();
      } else {
         com.watabou.noosa.Game.runOnRenderThread(applyCallback::run);
      }
   }

   private void dispatchTransportCallback(NetworkTransport transport, long generation, Runnable action) {
      synchronized (this) {
         if (activeTransport != transport || sessionGeneration != generation) return;
         action.run();
      }
   }
   private TransportCallback callbackFor(final NetworkTransport transport, final long generation) {
      return new TransportCallback() {
         public void onConnected() {
            dispatchTransportCallback(transport, generation, () -> {
               if (!(transport instanceof InternetTransport) || transport.isConnected()) MultiplayerManager.this.onConnected();
            });
         }

         public void onDisconnected(String reason) {
            dispatchTransportStateCallback(transport, generation, () -> MultiplayerManager.this.onDisconnected(reason));
         }

         public void onMessageReceived(NetworkMessage message) {
            dispatchTransportMessage(transport, generation, message);
         }

         public void onError(Throwable error) {
            dispatchTransportStateCallback(transport, generation, () -> MultiplayerManager.this.onError(error));
         }
      };
   }
   public void startSession(String roomCode, String initialPlayerId, NetworkTransport transport) {
      this.startSession(roomCode, initialPlayerId, transport, true);
   }

   public synchronized void startSession(String roomCode, String initialPlayerId, NetworkTransport transport, boolean createRoom) {
      if (transport == null) throw new IllegalArgumentException("TRANSPORT_REQUIRED");
      if (transport instanceof InternetTransport && !networkAvailable) {
         throw new IllegalStateException("NETWORK_UNAVAILABLE");
      }
      if (roomCode == null || roomCode.trim().isEmpty()) throw new IllegalArgumentException("ROOM_ENDPOINT_REQUIRED");
      if (initialPlayerId == null || initialPlayerId.trim().isEmpty()) throw new IllegalArgumentException("PLAYER_ID_REQUIRED");
      if (sessionState != SessionState.DISCONNECTED && sessionState != SessionState.FAILED) {
         throw new IllegalStateException("SESSION_ALREADY_ACTIVE");
      }
      if ("BLUETOOTH".equalsIgnoreCase(transport.getTransportType())
              && remotePlayers.size() >= BluetoothTransport.MAX_BLUETOOTH_PLAYERS) {
         throw new IllegalArgumentException("Bluetooth supports a maximum of 2 players.");
      }

      sessionGeneration++;
      cancelSessionHandshakeTimeout();
      cancelReconnectRetry();
      clearPendingRoomOperations();
      reconnectAttemptCount = 0;

      boolean internet = "INTERNET".equalsIgnoreCase(transport.getTransportType());
      this.roomLifecycleSession = internet;
      this.roomCode = internet ? buildRoomLifecycleEndpoint(roomCode.trim()) : roomCode.trim();
      this.localPlayerId = initialPlayerId.trim();
      this.sessionToken = null;
      this.initialSessionHandshakePending = false;
      this.reconnectHandshakePending = false;
      this.levelPublisher = false;
      this.levelPublisherId = null;
      this.levelPublisherTerm = -1L;
      this.publisherRebaseSentTerm = -1L;
      this.publisherRebaseRequests.clear();
      this.floorTransitionPending = false;
      this.endAuthorityCombat();
      this.lastSequence = 0L;
      this.lastResyncRequestedSequence = -1L;
      this.lastPublishedLevelKey = null;
      this.nativeWorldTurnCounter = 0L;
      this.authoritativeSeed = null;
      this.clearPendingUnblessedAnkhRevival();
      WorldSnapshot.clearAppliedSnapshot();
      this.activeTransport = transport;
      if (transport instanceof LANTransport) ((LANTransport) transport).setLocalPlayerId(this.localPlayerId);
      this.createRoomOnConnect = createRoom;
      this.sessionError = null;
      this.roomLifecycleError = null;
      this.roomLifecycleVersion = 0;
      this.roomMembership = false;
      this.roomOwnerId = null;
      this.roomStatus = "LOBBY";
      this.roomMemberCount = 0;
      this.roomMaxPlayers = 0;
      this.roomAllReady = false;
      this.roomSnapshotReady = false;
      this.localRoomReady = false;
      this.roomSequence = 0L;
      this.roomSeed = 0L;
      this.isMultiplayerActive = !internet;
      this.sessionState = SessionState.CONNECTING;
      this.initialSessionHandshakePending = internet;
      if (internet) scheduleSessionHandshakeTimeout(sessionGeneration, transport, false);

      try {
         transport.connect(this.roomCode, callbackFor(transport, sessionGeneration));
      } catch (Exception failure) {
         failInitialSession(failure.getMessage() == null ? "CONNECTION_START_FAILED" : failure.getMessage());
      }
   }
   public synchronized boolean reconnectInternetSession() {
      if (!networkAvailable || !appInForeground || !isMultiplayerActive || reconnectHandshakePending || localPlayerId == null || localPlayerId.isEmpty()
              || sessionToken == null || sessionToken.isEmpty() || roomCode == null
              || !(activeTransport instanceof InternetTransport)) return false;
      String endpoint = buildReconnectEndpoint(roomCode, localPlayerId);
      if (endpoint == null) return false;

      NetworkTransport previous = activeTransport;
      InternetTransport replacement = internetTransportFactory.get();
      if (replacement == null) return false;
      activeTransport = replacement;
      reconnectHandshakePending = true;
      sessionState = SessionState.RECONNECTING;
      try {
         if (previous != null) previous.disconnect();
         replacement.connect(endpoint, callbackFor(replacement, sessionGeneration), sessionToken);
         if (reconnectHandshakePending) {
            scheduleSessionHandshakeTimeout(sessionGeneration, replacement, true);
         }
         return true;
      } catch (Exception failure) {
         cancelSessionHandshakeTimeout();
         reconnectHandshakePending = false;
         if (activeTransport == replacement) activeTransport = previous;
         return false;
      }
   }
   static String buildRoomLifecycleEndpoint(String endpoint) {
      if (endpoint != null && !endpoint.trim().isEmpty()) {
         String value = endpoint.trim();
         return !value.contains("?lifecycle=") && !value.contains("&lifecycle=") ? value + (value.contains("?") ? "&" : "?") + "lifecycle=1" : value;
      } else {
         return null;
      }
   }

   static String buildReconnectEndpoint(String endpoint, String playerId) {
      if (endpoint != null && !endpoint.isEmpty() && playerId != null && !playerId.isEmpty()) {
         try {
            String encodedPlayer = URLEncoder.encode(playerId, "UTF-8");
            int fragmentAt = endpoint.indexOf(35);
            String base = fragmentAt >= 0 ? endpoint.substring(0, fragmentAt) : endpoint;
            String fragment = fragmentAt >= 0 ? endpoint.substring(fragmentAt) : "";
            String separator = base.contains("?") ? "&" : "?";
            return base + separator + "playerId=" + encodedPlayer + fragment;
         } catch (Exception var7) {
            return null;
         }
      } else {
         return null;
      }
   }

   public synchronized void endSession() {
      sessionGeneration++;
      cancelSessionHandshakeTimeout();
      cancelReconnectRetry();
      clearPendingRoomOperations();
      isMultiplayerActive = false;
      sessionState = SessionState.DISCONNECTED;
      sessionError = null;
      roomMembership = false;
      roomLifecycleVersion = 0;
       roomLifecycleSession = false;
      roomOwnerId = null;
      roomStatus = "LOBBY";
      roomLifecycleError = null;
      roomMemberCount = 0;
      roomMaxPlayers = 0;
      roomAllReady = false;
      roomSnapshotReady = false;
      localRoomReady = false;
      roomSequence = 0L;
      roomSeed = 0L;

      NetworkTransport previous = activeTransport;
      activeTransport = null;
      if (previous != null) {
         try { previous.disconnect(); } catch (RuntimeException ignored) {}
      }
      remotePlayers.clear();
      pendingActions.clear();
      actorToServerEntityId.clear();
      serverEntityIdToActor.clear();
      sessionToken = null;
      initialSessionHandshakePending = false;
      reconnectHandshakePending = false;
      reconnectAttemptCount = 0;
      levelPublisher = false;
      levelPublisherId = null;
      levelPublisherTerm = -1L;
      publisherRebaseSentTerm = -1L;
      publisherRebaseRequests.clear();
      floorTransitionPending = false;
      endAuthorityCombat();
      localPlayerId = null;
      roomCode = null;
      lastSequence = 0L;
      lastResyncRequestedSequence = -1L;
      lastPublishedLevelKey = null;
      nativeWorldTurnCounter = 0L;
      authoritativeSeed = null;
      clearPendingUnblessedAnkhRevival();
      WorldSnapshot.clearAppliedSnapshot();
   }
   public boolean isLevelPublisher() {
      return this.levelPublisher;
   }

   public String getLevelPublisherId() {
      return this.levelPublisherId;
   }

   public long getLevelPublisherTerm() {
      return this.levelPublisherTerm;
   }

   public synchronized void applyLevelPublisherChange(String publisherId, long term) {
      if (term >= 0L && term >= this.levelPublisherTerm) {
         if (term != this.levelPublisherTerm || this.levelPublisherTerm < 0L || Objects.equals(this.levelPublisherId, publisherId)) {
            boolean changed = term > this.levelPublisherTerm || !Objects.equals(this.levelPublisherId, publisherId);
            this.levelPublisherTerm = term;
            this.levelPublisherId = publisherId;
            this.levelPublisher = publisherId != null && publisherId.equals(this.localPlayerId);
            if (changed && this.levelPublisher) {
               this.publisherRebaseSentTerm = -1L;
            }

         }
      }
   }

   public boolean isFloorTransitionPending() {
      return this.floorTransitionPending;
   }

   public void markFloorTransitionPending() {
      this.floorTransitionPending = true;
   }

   public void markFloorTransitionComplete() {
      this.floorTransitionPending = false;
   }

   public void invalidateCurrentLevelPublication() {
      this.lastPublishedLevelKey = null;
   }

   public synchronized void synchronizeNativeWorldTurnCounter(long acceptedTurn) {
      if (acceptedTurn >= 0L) {
         this.nativeWorldTurnCounter = acceptedTurn;
      }

   }

   public synchronized long getNativeWorldTurnCounter() {
      return this.nativeWorldTurnCounter;
   }

   public synchronized void publishPublisherRebase(boolean force) {
      if (this.isMultiplayerActive && this.levelPublisher && this.activeTransport != null && Dungeon.level != null && Dungeon.branch == 0 && !this.floorTransitionPending && !this.resolvingAuthorityCombat && this.levelPublisherTerm >= 0L) {
         if (force || this.publisherRebaseSentTerm != this.levelPublisherTerm) {
            String snapshot = SPDLevelSnapshot.currentLevelJson();
            if (snapshot != null && snapshot.length() >= 2 && snapshot.charAt(snapshot.length() - 1) == '}') {
               String var10000 = snapshot.substring(0, snapshot.length() - 1);
               String payload = var10000 + ",\"publisherRebase\":true,\"publisherRebaseTerm\":" + this.levelPublisherTerm + "}";
               NetworkMessage message = new NetworkMessage();
               message.messageType = MessageType.LEVEL_DATA;
               message.senderId = this.localPlayerId;
               message.requestId = UUID.randomUUID().toString();
               message.payloadJson = payload;
               this.publisherRebaseRequests.put(message.requestId, this.levelPublisherTerm);
               this.pendingActions.put(message.requestId, message);
               this.publisherRebaseSentTerm = this.levelPublisherTerm;
               this.activeTransport.send(message);
            } else {
               this.requestResync(this.lastSequence);
            }
         }
      }
   }

   public boolean isResolvingAuthorityCombat() {
      return this.resolvingAuthorityCombat;
   }

   public String getAuthorityCombatRequestId() {
      return this.authorityCombatRequestId;
   }

   public void beginAuthorityCombat(String requestId) {
      this.authorityCombatRequestId = requestId;
      this.resolvingAuthorityCombat = requestId != null && !requestId.isEmpty();
   }

   public void endAuthorityCombat() {
      this.resolvingAuthorityCombat = false;
      this.authorityCombatRequestId = null;
   }

   public boolean isMultiplayerActive() {
      return this.isMultiplayerActive;
   }

   public SessionState getSessionState() {
      return this.sessionState;
   }

   public String getSessionError() {
      return this.sessionError;
   }

   public int getRoomLifecycleVersion() {
      return this.roomLifecycleVersion;
   }

   public boolean isRoomMember() {
      return this.roomMembership;
   }

   public boolean isRoomLifecycleRequired() {
      return this.roomLifecycleSession || this.roomLifecycleVersion >= 1
              || (this.activeTransport != null && "INTERNET".equalsIgnoreCase(this.activeTransport.getTransportType()));
   }

   public boolean isRoomGameplayAllowed() {
      return !this.isRoomLifecycleRequired() || this.sessionState == SessionState.PLAYING;
   }

   public RoomMemberInfo[] getRoomMembers() {
      return RoomLobbyState.getMembers();
   }

   public long getRoomStateRevision() {
      return RoomLobbyState.getRevision();
   }

   public boolean isLocalRoomOwner() {
      return this.localPlayerId != null && this.localPlayerId.equals(this.roomOwnerId);
   }
   public boolean hasPendingRoomOperations() {
      return !this.pendingRoomOperations.isEmpty();
   }

   public String getRoomOwnerId() {
      return this.roomOwnerId;
   }

   public String getRoomStatus() {
      return this.roomStatus;
   }

   public String getRoomLifecycleError() {
      return this.roomLifecycleError;
   }

   public int getRoomMemberCount() {
      return this.roomMemberCount;
   }

   public int getRoomMaxPlayers() {
      return this.roomMaxPlayers;
   }

   public boolean areAllRoomMembersReady() {
      return this.roomAllReady;
   }

   public boolean isRoomSnapshotReady() {
      return this.roomSnapshotReady;
   }

   public boolean isLocalRoomReady() {
      return this.localRoomReady;
   }

   private void scheduleRoomOperationTimeout(final String requestId, final long generation) {
      ScheduledFuture<?> timeout = SESSION_SCHEDULER.schedule(() -> {
         if (generation != sessionGeneration) return;
         MessageType expired = pendingRoomOperations.remove(requestId);
         pendingRoomOperationTimeouts.remove(requestId);
         if (expired != null) {
            roomLifecycleError = "ROOM_OPERATION_TIMEOUT:" + expired.name();
         notifyRoomLobbyStateChanged();
         }
      }, roomOperationTimeoutMs, TimeUnit.MILLISECONDS);
      ScheduledFuture<?> previous = pendingRoomOperationTimeouts.put(requestId, timeout);
      if (previous != null) previous.cancel(false);
      if (timeout.isDone()) pendingRoomOperationTimeouts.remove(requestId, timeout);
   }
   private boolean sendRoomLifecycleOperation(MessageType type, String payload) {
      NetworkTransport transport = this.activeTransport;
      if (!this.isMultiplayerActive || transport == null || this.roomLifecycleVersion < 1
              || this.sessionToken == null || type == null || payload == null) return false;
      NetworkMessage message = new NetworkMessage();
      message.messageType = type;
      message.senderId = this.localPlayerId;
      message.requestId = UUID.randomUUID().toString();
      message.payloadJson = payload;
      this.pendingRoomOperations.put(message.requestId, type);
       notifyRoomLobbyStateChanged();
      this.scheduleRoomOperationTimeout(message.requestId, this.sessionGeneration);
      try {
         transport.send(message);
         return true;
      } catch (RuntimeException failure) {
         this.pendingRoomOperations.remove(message.requestId);
         this.cancelRoomOperationTimeout(message.requestId);
         this.roomLifecycleError = failure.getMessage() == null ? "ROOM_OPERATION_SEND_FAILED" : failure.getMessage();
        notifyRoomLobbyStateChanged();
         return false;
      }
   }
   public boolean createRoom() {
      return this.roomLifecycleVersion >= 1 && !this.roomMembership ? this.sendRoomLifecycleOperation(MessageType.CREATE_ROOM, "{\"gameMode\":\"" + this.currentGameMode.getModeName() + "\"}") : false;
   }

   public boolean joinRoom() {
      return this.roomLifecycleVersion >= 1 && !this.roomMembership ? this.sendRoomLifecycleOperation(MessageType.JOIN_ROOM, "{}") : false;
   }

   public static String buildRoomReadyPayload(boolean ready, long seed, long sequence, String className, String heroStateJson) {
      StringBuilder payload = new StringBuilder(ready ? 192 : 64);
      payload.append("{\"ready\":").append(ready)
              .append(",\"seed\":").append(seed)
              .append(",\"sequence\":").append(sequence);
      if (ready) {
         if (className == null || className.isEmpty() || heroStateJson == null || heroStateJson.isEmpty()) return null;
         Json json = new Json();
         payload.append(",\"className\":").append(json.toJson(className))
                 .append(",\"heroStateJson\":").append(json.toJson(heroStateJson));
      }
      return payload.append('}').toString();
   }

   public boolean setRoomReady(boolean ready) {
      if (!this.roomMembership || !this.roomSnapshotReady || this.roomSequence != this.lastSequence
              || (this.sessionState != MultiplayerManager.SessionState.WORLD_SYNCED
                  && this.sessionState != MultiplayerManager.SessionState.READY)) return false;
      String className = null;
      String heroStateJson = null;
      if (ready) {
         if (Dungeon.hero == null || Dungeon.level == null || Dungeon.hero.heroClass == null) return false;
         className = Dungeon.hero.heroClass.name();
         heroStateJson = SPDLevelSnapshot.currentHeroStateJson();
      }
      String payload = buildRoomReadyPayload(ready, this.roomSeed, this.roomSequence, className, heroStateJson);
      return payload != null && this.sendRoomLifecycleOperation(MessageType.READY, payload);
   }
   public boolean requestRoomMatchStart() {
      return this.roomMembership && this.localPlayerId.equals(this.roomOwnerId) && this.localRoomReady && this.roomAllReady && this.roomSnapshotReady && this.sessionState == MultiplayerManager.SessionState.READY ? this.sendRoomLifecycleOperation(MessageType.MATCH_START, "{\"operation\":\"START\",\"seed\":" + this.roomSeed + ",\"sequence\":" + this.roomSequence + "}") : false;
   }

   public boolean cancelRoomMatchStart() {
      return this.roomMembership && this.localPlayerId.equals(this.roomOwnerId) && "LOBBY".equals(this.roomStatus) ? this.sendRoomLifecycleOperation(MessageType.MATCH_START, "{\"operation\":\"CANCEL\"}") : false;
   }

   public boolean leaveRoom() {
      return !this.roomMembership ? false : this.sendRoomLifecycleOperation(MessageType.LEAVE, "{}");
   }

   public void markWorldSynchronized() {
      if (this.roomMembership && this.roomLifecycleVersion >= 1
              && this.sessionState != MultiplayerManager.SessionState.PLAYING) {
         if (this.authoritativeSeed != null && this.roomSeed != this.authoritativeSeed) {
            this.roomLifecycleError = "ROOM_SEED_MISMATCH";
         notifyRoomLobbyStateChanged();
         } else if (this.roomSequence == this.lastSequence) {
            this.roomSnapshotReady = true;
            this.sessionState = this.localRoomReady
                    ? MultiplayerManager.SessionState.READY
                    : MultiplayerManager.SessionState.WORLD_SYNCED;
         notifyRoomLobbyStateChanged();
         }
      }
   }

   public void applyRoomState(NetworkMessage message) {
      if (message != null && message.payloadJson != null) {
         RoomLobbyState.apply(message);
         if (RoomLobbyState.getError() != null) {
            this.roomLifecycleError = RoomLobbyState.getError();
            return;
         }
         this.roomLifecycleError = null;
         try {
            JsonValue payload = (new JsonReader()).parse(message.payloadJson);
            if (payload == null || !payload.isObject()) {
               return;
            }

            JsonValue lifecycle = payload.get("lifecycleVersion");
            if (lifecycle != null && lifecycle.isNumber()) {
               this.roomLifecycleVersion = lifecycle.asInt();
            }

            JsonValue created = payload.get("roomCreated");
            JsonValue closed = payload.get("roomClosed");
            JsonValue status = payload.get("roomStatus");
            JsonValue game = payload.get("gameStatus");
            JsonValue owner = payload.get("ownerId");
            JsonValue count = payload.get("memberCount");
            JsonValue capacity = payload.get("maxPlayers");
            JsonValue allReady = payload.get("allReady");
            JsonValue snapshot = payload.get("worldSnapshotReady");
            JsonValue seed = payload.get("seed");
            JsonValue sequence = payload.get("sequence");
            JsonValue members = payload.get("members");
            this.roomStatus = status != null && status.isString() ? status.asString() : "LOBBY";
            this.roomOwnerId = owner != null && owner.isString() ? owner.asString() : null;
            this.roomMemberCount = count != null && count.isNumber() ? count.asInt() : 0;
            this.roomMaxPlayers = capacity != null && capacity.isNumber() ? capacity.asInt() : 0;
            this.roomAllReady = allReady != null && allReady.isBoolean() && allReady.asBoolean();
            long previousRoomSeed = this.roomSeed;
            long previousRoomSequence = this.roomSequence;
            boolean serverSnapshotAvailable = snapshot != null && snapshot.isBoolean() && snapshot.asBoolean();
            if (!serverSnapshotAvailable) this.roomSnapshotReady = false;
            if (seed != null && seed.isNumber()) {
               this.roomSeed = seed.asLong();
            }

            if (sequence != null && sequence.isNumber()) {
               this.roomSequence = sequence.asLong();
            }
            if (previousRoomSeed != this.roomSeed || previousRoomSequence != this.roomSequence || this.roomSequence != this.lastSequence) {
               this.roomSnapshotReady = false;
            }

            this.roomMembership = false;
            this.localRoomReady = false;
            if (members != null && members.isArray()) {
               for(JsonValue member = members.child; member != null; member = member.next) {
                  JsonValue playerId = member.get("playerId");
                  if (playerId != null && playerId.isString() && playerId.asString().equals(this.localPlayerId)) {
                     this.roomMembership = true;
                     JsonValue ready = member.get("ready");
                     this.localRoomReady = ready != null && ready.isBoolean() && ready.asBoolean();
                     break;
                  }
               }
            }

            if (closed != null && closed.isBoolean() && closed.asBoolean()) {
               this.sessionState = MultiplayerManager.SessionState.FAILED;
               this.roomLifecycleError = "ROOM_CLOSED";
            } else if (game != null && game.isString() && "PLAYING".equals(game.asString())) {
               this.roomStatus = "PLAYING";
               this.sessionState = MultiplayerManager.SessionState.PLAYING;
             notifyRoomLobbyStateChanged();
            } else if (!this.roomMembership) {
               this.sessionState = MultiplayerManager.SessionState.SESSION_BOUND;
            } else if (this.localRoomReady) {
               this.sessionState = MultiplayerManager.SessionState.READY;
            } else if (this.roomSnapshotReady && this.roomSequence == this.lastSequence) {
               this.sessionState = MultiplayerManager.SessionState.WORLD_SYNCED;
            } else {
               this.sessionState = MultiplayerManager.SessionState.ROOM_JOINED;
            }
         } catch (RuntimeException var19) {
            this.roomLifecycleError = "INVALID_ROOM_STATE";
         }

      }
   }

   public void applyMatchStart(NetworkMessage message) {
      if (message != null && message.payloadJson != null) {
         try {
            JsonValue payload = (new JsonReader()).parse(message.payloadJson);
            JsonValue status = payload == null ? null : payload.get("status");
            if (status != null && status.isString() && "PLAYING".equals(status.asString())) {
               this.roomStatus = "PLAYING";
               this.sessionState = MultiplayerManager.SessionState.PLAYING;
            notifyRoomLobbyStateChanged();
            }
         } catch (RuntimeException var4) {
            this.roomLifecycleError = "INVALID_MATCH_START";
          notifyRoomLobbyStateChanged();
         }

      }
   }

   public String getRoomCode() {
      return this.roomCode;
   }

   public String getLocalPlayerId() {
      return this.localPlayerId;
   }

   public void beginUnblessedAnkhRevival() {
      this.clearPendingUnblessedAnkhRevival();
      if (this.isMultiplayerActive && Dungeon.hero != null && Dungeon.level != null) {
         try {
            String stateJson = SPDLevelSnapshot.currentHeroStateJson();
            JsonValue state = (new JsonReader()).parse(stateJson);
            int ankhCount = state.getInt("ankhCount", 0);
            int blessedCount = state.getInt("blessedAnkhCount", 0);
            if (state.getInt("hp", 1) != 0 || ankhCount - blessedCount < 1) {
               return;
            }

            this.pendingUnblessedAnkhBeforeHeroStateJson = stateJson;
            this.pendingUnblessedAnkhBeforeBuffsJson = SPDLevelSnapshot.currentCombatBuffsJson(Dungeon.hero);
            this.pendingUnblessedAnkhDepth = Dungeon.depth;
            this.pendingUnblessedAnkhBranch = Dungeon.branch;
            this.pendingUnblessedAnkhWasLevelLocked = Dungeon.level.locked;
         } catch (RuntimeException var5) {
            this.clearPendingUnblessedAnkhRevival();
         }

      }
   }

   public void finishPendingUnblessedAnkhRevival() {
      String beforeJson = this.pendingUnblessedAnkhBeforeHeroStateJson;
      String beforeBuffs = this.pendingUnblessedAnkhBeforeBuffsJson;
      int beforeDepth = this.pendingUnblessedAnkhDepth;
      int beforeBranch = this.pendingUnblessedAnkhBranch;
      boolean wasLevelLocked = this.pendingUnblessedAnkhWasLevelLocked;
      this.clearPendingUnblessedAnkhRevival();
      if (beforeJson != null && beforeBuffs != null && this.isMultiplayerActive && Dungeon.hero != null && Dungeon.level != null) {
         try {
            String afterJson = SPDLevelSnapshot.currentHeroStateJson();
            JsonValue before = (new JsonReader()).parse(beforeJson);
            JsonValue after = (new JsonReader()).parse(afterJson);
            if (beforeDepth != Dungeon.depth || beforeBranch != Dungeon.branch || before.getInt("ankhCount", 0) - after.getInt("ankhCount", 0) != 1 || before.getInt("blessedAnkhCount", 0) != after.getInt("blessedAnkhCount", 0) || after.getInt("hp", 0) <= 0 || after.getInt("hp", 0) != after.getInt("ht", 0)) {
               this.requestResync(this.getLastSequence());
               return;
            }

            Map<String, Object> data = new HashMap();
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
            data.put("heaps", (new Json()).fromJson(ArrayList.class, SPDLevelSnapshot.currentHeapsJson()));
            data.put("levelWasLocked", wasLevelLocked);
            this.sendAction(NetworkActionType.REVIVE, NativeCombatJson.strictWriter().toJson(data), afterJson);
         } catch (RuntimeException var10) {
            this.requestResync(this.getLastSequence());
         }

      }
   }

   private void clearPendingUnblessedAnkhRevival() {
      this.pendingUnblessedAnkhBeforeHeroStateJson = null;
      this.pendingUnblessedAnkhBeforeBuffsJson = null;
      this.pendingUnblessedAnkhDepth = -1;
      this.pendingUnblessedAnkhBranch = -1;
      this.pendingUnblessedAnkhWasLevelLocked = false;
   }

   public String getSessionToken() {
      return this.sessionToken;
   }

   public long getLastSequence() {
      return this.lastSequence;
   }

   public boolean hasPendingResync() {
      return this.lastResyncRequestedSequence >= 0L;
   }

   public boolean commitAppliedSequence(long sequence) {
      if (sequence > this.lastSequence && sequence == this.lastSequence + 1L) {
         this.lastSequence = sequence;
         return true;
      } else {
         return false;
      }
   }

   public boolean rollbackAppliedSequence(long sequence, long previousSequence) {
      if (this.lastSequence == sequence && previousSequence == sequence - 1L) {
         this.lastSequence = previousSequence;
         return true;
      } else {
         return false;
      }
   }

   public void updateLastSequence(long seq) {
      if (seq > this.lastSequence) {
         this.lastSequence = seq;
      }

   }

   public void markSnapshotApplied(long seq) {
      if (seq > this.lastSequence) {
         this.lastSequence = seq;
      }

      this.lastResyncRequestedSequence = -1L;
   }

   public void requestResync(long rejectedSnapshotSequence) {
      if (this.isMultiplayerActive && this.activeTransport != null) {
         long rejectedSequence = rejectedSnapshotSequence < 0L ? this.lastSequence : rejectedSnapshotSequence;
         if (this.lastResyncRequestedSequence != rejectedSequence) {
            this.lastResyncRequestedSequence = rejectedSequence;
            NetworkMessage msg = new NetworkMessage();
            msg.messageType = MessageType.RESYNC;
            msg.senderId = this.localPlayerId;
            msg.requestId = UUID.randomUUID().toString();
            msg.payloadJson = "{\"lastSequence\":" + this.lastSequence + ",\"rejectedSnapshotSequence\":" + rejectedSequence + "}";
            this.activeTransport.send(msg);
         }
      }
   }

   public Map<String, RemotePlayer> getRemotePlayers() {
      return Collections.unmodifiableMap(this.remotePlayers);
   }

   public void addRemotePlayer(RemotePlayer player) {
      if (this.activeTransport != null && "BLUETOOTH".equalsIgnoreCase(this.activeTransport.getTransportType()) && this.remotePlayers.size() >= 1) {
         throw new IllegalStateException("Bluetooth multiplayer allows only 2 players max.");
      } else {
         this.remotePlayers.put(player.playerId, player);
      }
   }

   public void removeRemotePlayer(String playerId) {
      this.remotePlayers.remove(playerId);
   }

   public RemotePlayer getRemotePlayer(String playerId) {
      return (RemotePlayer)this.remotePlayers.get(playerId);
   }

   public String getPlayerIdForHero(Hero hero) {
      if (hero == null) {
         return null;
      } else if (hero == Dungeon.hero) {
         return this.localPlayerId;
      } else {
         for(RemotePlayer player : this.remotePlayers.values()) {
            if (player != null && player.heroInstance == hero) {
               return player.playerId;
            }
         }

         return null;
      }
   }

   public Hero getHeroForPlayerId(String playerId) {
      if (playerId != null && !playerId.isEmpty()) {
         if (playerId.equals(this.localPlayerId)) {
            return Dungeon.hero;
         } else {
            RemotePlayer player = (RemotePlayer)this.remotePlayers.get(playerId);
            return player == null ? null : player.heroInstance;
         }
      } else {
         return null;
      }
   }

   public String getServerEntityId(int localActorId) {
      return (String)this.actorToServerEntityId.get(localActorId);
   }

   public Integer getLocalActorIdForServerEntity(String entityId) {
      return entityId == null ? null : (Integer)this.serverEntityIdToActor.get(entityId);
   }

   public void registerServerEntityId(int localActorId, String entityId) {
      if (localActorId >= 0 && entityId != null && entityId.length() >= 8 && entityId.length() <= 80) {
         String oldEntity = (String)this.actorToServerEntityId.put(localActorId, entityId);
         if (oldEntity != null && !oldEntity.equals(entityId)) {
            this.serverEntityIdToActor.remove(oldEntity, localActorId);
         }

         Integer oldActor = (Integer)this.serverEntityIdToActor.put(entityId, localActorId);
         if (oldActor != null && oldActor != localActorId) {
            this.actorToServerEntityId.remove(oldActor, entityId);
         }

      }
   }

   public void removeServerEntityIdForActor(int localActorId) {
      String entityId = (String)this.actorToServerEntityId.remove(localActorId);
      if (entityId != null) {
         this.serverEntityIdToActor.remove(entityId, localActorId);
      }

   }

   public void handleServerEntityAck(NetworkMessage message) {
      if (message != null && message.payloadJson != null) {
         try {
            JsonValue payload = (new JsonReader()).parse(message.payloadJson);
            JsonValue turnCounter = payload == null ? null : payload.get("nativeWorldTurnCounter");
            if (turnCounter != null && turnCounter.isNumber() && turnCounter.asLong() >= 0L) {
               this.nativeWorldTurnCounter = Math.max(this.nativeWorldTurnCounter, turnCounter.asLong());
            }

            Long rebaseTerm = message.requestId == null ? null : (Long)this.publisherRebaseRequests.remove(message.requestId);
            if (rebaseTerm != null && rebaseTerm == this.levelPublisherTerm && this.levelPublisher) {
               this.publisherRebaseSentTerm = this.levelPublisherTerm;
            }

            if (message.requestId != null) {
               this.pendingActions.remove(message.requestId);
            }

            JsonValue entities = payload == null ? null : payload.get("entities");
            if (entities == null || !entities.isArray()) {
               return;
            }

            for(JsonValue entity = entities.child; entity != null; entity = entity.next) {
               JsonValue mobId = entity.get("mobId");
               JsonValue entityId = entity.get("entityId");
               if (mobId != null && mobId.isNumber() && entityId != null && entityId.isString()) {
                  this.registerServerEntityId(mobId.asInt(), entityId.asString());
               }
            }
         } catch (RuntimeException var9) {
         }

      }
   }

   public String sendAction(NetworkActionType actionType, String actionDetailsJson) {
      return this.sendAction(actionType, actionDetailsJson, SPDLevelSnapshot.currentHeroStateJson());
   }

   public String sendAction(NetworkActionType actionType, String actionDetailsJson, String nativeHeroStateJson) {
      if (this.isMultiplayerActive && this.activeTransport != null && actionType != null && actionDetailsJson != null) {
         if (actionType == NetworkActionType.SYNC_MOB_STATE && NativeHeroBuffTickPublisher.shouldBufferLifeLinkMobDamage(actionDetailsJson)) {
            return null;
         } else {
            if (actionType == NetworkActionType.SYNC_HERO_STATE) {
               String batchedDeath = NativeHeroBuffTickPublisher.enrichLethalPoisonEnvironmentDamage(actionDetailsJson);
               if (batchedDeath != null) {
                  actionDetailsJson = batchedDeath;
               }
            }

            NetworkMessage msg = new NetworkMessage();
            msg.messageType = MessageType.ACTION;
            msg.senderId = this.localPlayerId;
            msg.requestId = UUID.randomUUID().toString();
            String heroStateJson = nativeHeroStateJson == null ? "" : nativeHeroStateJson;
            msg.payloadJson = "{\"action\":\"" + actionType.name() + "\", \"data\":" + actionDetailsJson + ",\"heroStateJson\":" + (new Json()).toJson(heroStateJson) + "}";
            this.pendingActions.put(msg.requestId, msg);
            this.activeTransport.send(msg);
            return msg.requestId;
         }
      } else {
         return null;
      }
   }

   public void publishNativeWorldMutation(String actionRequestId, String actionName, int from, int targetPos) {
      this.publishNativeWorldMutation(actionRequestId, actionName, from, targetPos, (String)null);
   }

   public void publishNativeWorldMutation(String actionRequestId, String actionName, int from, int targetPos, String nativeMutationDetailsJson) {
      if (this.isMultiplayerActive && this.activeTransport != null && actionRequestId != null && !actionRequestId.isEmpty() && Dungeon.level != null && Dungeon.branch == 0 && actionName != null) {
         String snapshot = SPDLevelSnapshot.currentLevelJson();
         if (snapshot != null && snapshot.length() >= 2 && snapshot.charAt(snapshot.length() - 1) == '}') {
            String var10000 = snapshot.substring(0, snapshot.length() - 1);
            String mutation = var10000 + ",\"nativeWorldMutation\":true,\"nativeMutationAction\":" + (new Json()).toJson(actionName) + ",\"nativeMutationRequestId\":" + (new Json()).toJson(actionRequestId) + ",\"nativeMutationFrom\":" + from + ",\"nativeMutationTargetPos\":" + targetPos + (nativeMutationDetailsJson != null && nativeMutationDetailsJson.startsWith("{") && nativeMutationDetailsJson.endsWith("}") ? ",\"nativeMutationDetails\":" + nativeMutationDetailsJson : "") + "}";
            NetworkMessage message = new NetworkMessage();
            message.messageType = MessageType.LEVEL_DATA;
            message.senderId = this.localPlayerId;
            message.requestId = UUID.randomUUID().toString();
            message.payloadJson = mutation;
            this.pendingActions.put(message.requestId, message);
            this.activeTransport.send(message);
         } else {
            this.requestResync(this.lastSequence);
         }
      }
   }

   public void sendLevelReady() {
      if (this.isMultiplayerActive && this.activeTransport != null && Dungeon.level != null && Dungeon.branch == 0) {
         NetworkMessage message = new NetworkMessage();
         message.messageType = MessageType.LEVEL_READY;
         message.senderId = this.localPlayerId;
         message.requestId = UUID.randomUUID().toString();
         String heroStateJson = SPDLevelSnapshot.currentHeroStateJson();
         message.payloadJson = "{\"depth\":" + Dungeon.depth + ",\"branch\":" + Dungeon.branch + ",\"seed\":" + Dungeon.seedCurDepth() + ",\"heroStateJson\":" + (new Json()).toJson(heroStateJson) + "}";
         this.activeTransport.send(message);
      }
   }

   public void sendAuthorityAction(String requestId, NetworkActionType actionType, String actionDetailsJson, String heroStateJson) {
      if (this.isMultiplayerActive && this.activeTransport != null && requestId != null && !requestId.isEmpty()) {
         NetworkMessage msg = new NetworkMessage();
         msg.messageType = MessageType.ACTION;
         msg.senderId = this.localPlayerId;
         msg.requestId = requestId;
         msg.payloadJson = "{\"action\":\"" + actionType.name() + "\",\"data\":" + actionDetailsJson + ",\"heroStateJson\":" + (new Json()).toJson(heroStateJson) + "}";
         this.pendingActions.put(requestId, msg);
         this.activeTransport.send(msg);
      }
   }

   public void applyAuthoritativeSeed() {
      if (this.isMultiplayerActive && this.authoritativeSeed != null) {
         Dungeon.seed = this.authoritativeSeed;
      }

   }

   public void publishCurrentLevel() {
      if (this.isMultiplayerActive && this.levelPublisher && this.activeTransport != null && Dungeon.level != null && Dungeon.branch == 0) {
         String levelKey = Dungeon.seed + ":" + Dungeon.branch + ":" + Dungeon.depth;
         if (!levelKey.equals(this.lastPublishedLevelKey) || this.floorTransitionPending) {
            String snapshot = SPDLevelSnapshot.currentLevelJson();
            if (snapshot != null) {
               NetworkMessage msg = new NetworkMessage();
               msg.messageType = MessageType.LEVEL_DATA;
               msg.senderId = this.localPlayerId;
               msg.requestId = UUID.randomUUID().toString();
               msg.payloadJson = snapshot;
               this.activeTransport.send(msg);
               this.lastPublishedLevelKey = levelKey;
            }
         }
      }
   }

   public synchronized void publishNativeWorldActorResult(Actor actor) {
      if (this.isMultiplayerActive && this.levelPublisher && this.activeTransport != null && Dungeon.level != null && Actor.isMultiplayerSharedActor(actor)) {
         long nextCounter = this.nativeWorldTurnCounter + 1L;
         String snapshot = SPDLevelSnapshot.currentNativeWorldTurnJson(actor, nextCounter);
         if (snapshot != null && !snapshot.isEmpty()) {
            NetworkMessage message = new NetworkMessage();
            message.messageType = MessageType.LEVEL_DATA;
            message.senderId = this.localPlayerId;
            message.requestId = UUID.randomUUID().toString();
            message.payloadJson = snapshot;
            this.nativeWorldTurnCounter = nextCounter;
            this.pendingActions.put(message.requestId, message);
            this.activeTransport.send(message);
         }
      }
   }

   public void sendReconnect() {
      if (this.isMultiplayerActive && this.activeTransport != null && this.sessionToken != null) {
         NetworkMessage msg = new NetworkMessage();
         msg.messageType = MessageType.RECONNECT;
         msg.senderId = this.localPlayerId;
         msg.requestId = UUID.randomUUID().toString();
         msg.payloadJson = "{\"lastSequence\":" + this.lastSequence + "}";
         this.activeTransport.send(msg);
      }
   }

   public synchronized void onConnected() {
      if (this.sessionToken != null) {
         this.sessionState = MultiplayerManager.SessionState.RECONNECTING;
         this.sendReconnect();
      } else if (this.activeTransport != null && "INTERNET".equalsIgnoreCase(this.activeTransport.getTransportType())) {
         this.sessionState = MultiplayerManager.SessionState.TRANSPORT_CONNECTED;
      } else if (this.activeTransport instanceof LANTransport
              && !((LANTransport) this.activeTransport).isHosting()) {
         this.sessionState = MultiplayerManager.SessionState.TRANSPORT_CONNECTED;
      } else {
         this.sessionState = MultiplayerManager.SessionState.ROOM_JOINED;
      }

   }
   public synchronized void onDisconnected(String reason) {
      if (sessionToken != null) {
         cancelSessionHandshakeTimeout();
         reconnectHandshakePending = false;
         scheduleReconnectRetry(reason == null ? "RECONNECT_DISCONNECTED" : reason);
         return;
      }
      failInitialSession(reason == null ? "CONNECTION_CLOSED_BEFORE_SESSION" : reason);
   }
   public synchronized void onMessageReceived(NetworkMessage message) {
      if (message != null) {
         if (this.isMultiplayerActive || message.messageType == MessageType.SESSION && this.sessionState == MultiplayerManager.SessionState.TRANSPORT_CONNECTED) {
            if (message.messageType == MessageType.ERROR && message.payloadJson != null && message.payloadJson.contains("\"SESSION_REPLACED\"")) {
               this.endSession();
            } else {
               if (message.messageType == MessageType.EVENT_BATCH && message.payloadJson != null) {
                  try {
                     JsonValue events = (new JsonReader()).parse(message.payloadJson);
                     if (events != null && events.isArray()) {
                        for(JsonValue event = events.child; event != null; event = event.next) {
                           JsonValue action = event.get("action");
                           if (action == null || !action.isObject()) {
                              JsonValue stored = event.get("payload");
                              if (stored != null && stored.isString()) {
                                 action = (new JsonReader()).parse(stored.asString());
                              } else if (stored != null && stored.isObject()) {
                                 action = stored;
                              }
                           }

                           JsonValue combatRequestId = action == null ? null : action.get("combatRequestId");
                           if (combatRequestId != null && combatRequestId.isString()) {
                              this.pendingActions.remove(combatRequestId.asString());
                           }
                        }
                     }
                  } catch (RuntimeException var20) {
                  }
               }

               if (message.requestId != null && (message.messageType == MessageType.ACK || message.messageType == MessageType.ERROR)) {
                  MessageType completedRoomOperation = this.pendingRoomOperations.remove(message.requestId);
                  this.cancelRoomOperationTimeout(message.requestId);
                  if (completedRoomOperation != null) {
                     if (message.messageType == MessageType.ERROR) {
                        this.roomLifecycleError = "ROOM_OPERATION_REJECTED:" + completedRoomOperation.name();
                     } else {
                        this.roomLifecycleError = null;
                     }
                  notifyRoomLobbyStateChanged();
                  }
               }

               if ((message.messageType == MessageType.ACTION_ACCEPTED || message.messageType == MessageType.ACK) && message.requestId != null) {
                  this.pendingActions.remove(message.requestId);
               } else if (message.messageType == MessageType.ERROR && message.requestId != null) {
                  Long rejectedRebaseTerm = (Long)this.publisherRebaseRequests.remove(message.requestId);
                  boolean rejectedPublisherRebase = rejectedRebaseTerm != null && rejectedRebaseTerm == this.levelPublisherTerm && this.levelPublisher;
                  if (rejectedPublisherRebase) {
                     this.publisherRebaseSentTerm = -1L;
                     this.requestResync(message.sequence);
                  }

                  NetworkMessage rejected = (NetworkMessage)this.pendingActions.remove(message.requestId);
                  boolean rejectedNativeTurn = false;
                  if (rejected != null && rejected.messageType == MessageType.LEVEL_DATA && rejected.payloadJson != null) {
                     try {
                        JsonValue rejectedSnapshot = (new JsonReader()).parse(rejected.payloadJson);
                        JsonValue tick = rejectedSnapshot == null ? null : rejectedSnapshot.get("nativeWorldTick");
                        rejectedNativeTurn = tick != null && tick.asBoolean();
                     } catch (RuntimeException var19) {
                     }
                  }

                  boolean rejectedNativeWorldMutation = false;
                  boolean rejectedWorldAction = false;
                  if (rejected != null && rejected.messageType == MessageType.LEVEL_DATA && rejected.payloadJson != null) {
                     try {
                        JsonValue rejectedSnapshot = (new JsonReader()).parse(rejected.payloadJson);
                        JsonValue mutation = rejectedSnapshot == null ? null : rejectedSnapshot.get("nativeWorldMutation");
                        rejectedNativeWorldMutation = mutation != null && mutation.asBoolean();
                     } catch (RuntimeException var18) {
                     }
                  }

                  if (rejected != null && rejected.messageType == MessageType.ACTION && rejected.payloadJson != null) {
                     try {
                        JsonValue intent = (new JsonReader()).parse(rejected.payloadJson);
                        JsonValue action = intent == null ? null : intent.get("action");
                        String name = action == null ? "" : action.asString();
                        rejectedWorldAction = "MOVE".equals(name) || "UNLOCK".equals(name) || "MINE".equals(name) || "INTERACT".equals(name) || "OPEN_CHEST".equals(name) || "LVL_TRANSITION".equals(name) || "PICKUP".equals(name) || "DROP".equals(name) || "EQUIP".equals(name) || "UNEQUIP".equals(name) || "BUY".equals(name) || "BUYBACK".equals(name) || "SELL".equals(name) || "USE_ITEM".equals(name) || "THROW".equals(name) || "ALCHEMY".equals(name) || "USE_ABILITY".equals(name);
                     } catch (RuntimeException var17) {
                     }
                  }

                  boolean rejectedTransition = rejected != null && rejected.payloadJson != null && rejected.payloadJson.contains("\"action\":\"LVL_TRANSITION\"");
                  boolean transitionAlreadyPending = message.payloadJson != null && message.payloadJson.contains("TRANSITION_PENDING");
                  if (rejectedTransition && !transitionAlreadyPending) {
                     this.floorTransitionPending = false;
                  }

                  if (rejectedNativeTurn || rejectedNativeWorldMutation || rejectedWorldAction || rejectedTransition && !transitionAlreadyPending || rejected != null && rejected.payloadJson != null && (rejected.payloadJson.contains("\"action\":\"ATTACK\"") || rejected.payloadJson.contains("\"action\":\"SYNC_MOB_STATE\"") || rejected.payloadJson.contains("\"action\":\"SYNC_PLAYER_COMBAT\"") || rejected.payloadJson.contains("\"action\":\"SYNC_HERO_STATE\"") || rejected.payloadJson.contains("\"action\":\"REVIVE\""))) {
                     this.requestResync(message.sequence);
                  }
               }

               if (message.messageType == MessageType.SESSION && message.payloadJson != null) {
                  final boolean resumingExistingSession = this.reconnectHandshakePending;
                  final boolean initialHandshakePending = this.sessionToken == null;
                  this.cancelSessionHandshakeTimeout();
                  try {
                     JsonValue payload = new JsonReader().parse(message.payloadJson);
                     if (payload == null || !payload.isObject()) throw new IllegalArgumentException("INVALID_SESSION_RESPONSE");
                     JsonValue playerIdValue = payload.get("playerId");
                     JsonValue tokenValue = payload.get("sessionToken");
                     boolean validRotatedToken = tokenValue != null && !tokenValue.isNull() && tokenValue.isString()
                             && tokenValue.asString().matches("[A-Za-z0-9._~-]{16,256}");
                     boolean internetSession = this.activeTransport != null
                             && "INTERNET".equalsIgnoreCase(this.activeTransport.getTransportType());

                     if (internetSession && !resumingExistingSession
                             && (playerIdValue == null || !playerIdValue.isString()
                                 || playerIdValue.asString().isEmpty() || !validRotatedToken)) {
                        this.failInitialSession("INVALID_SESSION_RESPONSE");
                        return;
                     }
                     if (resumingExistingSession && (playerIdValue == null || playerIdValue.isNull()
                             || !this.localPlayerId.equals(playerIdValue.asString()) || !validRotatedToken)) {
                        this.endSession();
                        return;
                     }

                     if (playerIdValue != null && !playerIdValue.isNull()) this.localPlayerId = playerIdValue.asString();
                     if (tokenValue != null && !tokenValue.isNull()) this.sessionToken = tokenValue.asString();

                     JsonValue publisherValue = payload.get("isLevelPublisher");
                     JsonValue publisherIdValue = payload.get("levelPublisherId");
                     JsonValue publisherTermValue = payload.get("publisherTerm");
                     if (publisherTermValue != null && !publisherTermValue.isNull()) {
                        this.applyLevelPublisherChange(
                                publisherIdValue == null || publisherIdValue.isNull() ? null : publisherIdValue.asString(),
                                publisherTermValue.asLong());
                     } else {
                        this.levelPublisher = publisherValue != null && !publisherValue.isNull() && publisherValue.asBoolean();
                        this.levelPublisherId = this.levelPublisher ? this.localPlayerId : null;
                     }

                     JsonValue sequenceValue = payload.get("sequence");
                     if (!resumingExistingSession && sequenceValue != null && !sequenceValue.isNull()
                             && sequenceValue.isNumber() && sequenceValue.asDouble() >= 0d
                             && sequenceValue.asDouble() == Math.floor(sequenceValue.asDouble())) {
                        this.updateLastSequence(sequenceValue.asLong());
                     }
                     JsonValue seedValue = payload.get("seed");
                     if (seedValue != null && !seedValue.isNull()) {
                        this.authoritativeSeed = seedValue.asLong();
                        Dungeon.seed = this.authoritativeSeed;
                     }

                     this.initialSessionHandshakePending = false;
                      this.reconnectHandshakePending = false;
                     this.cancelSessionHandshakeTimeout();
                     this.cancelReconnectRetry();
                     this.reconnectAttemptCount = 0;
                     if (internetSession) {
                        this.isMultiplayerActive = true;
                        this.sessionError = null;
                        JsonValue lifecycleVersionValue = payload.get("roomLifecycleVersion");
                        this.roomLifecycleVersion = lifecycleVersionValue != null && lifecycleVersionValue.isNumber()
                                ? lifecycleVersionValue.asInt() : 0;
                        JsonValue membershipValue = payload.get("roomMembership");
                        this.roomMembership = membershipValue != null && membershipValue.isBoolean() && membershipValue.asBoolean();
                        JsonValue ownerValue = payload.get("roomOwnerId");
                        this.roomOwnerId = ownerValue != null && ownerValue.isString() ? ownerValue.asString() : null;
                        this.roomSequence = this.lastSequence;
                        this.roomSeed = this.authoritativeSeed == null ? 0L : this.authoritativeSeed;
                        this.sessionState = !this.roomMembership && this.roomLifecycleVersion != 0
                                ? MultiplayerManager.SessionState.SESSION_BOUND : MultiplayerManager.SessionState.ROOM_JOINED;
                        if (this.roomLifecycleVersion == 0) this.roomMembership = true;
                        else if (!resumingExistingSession && !this.roomMembership) {
                           if (this.createRoomOnConnect) this.createRoom();
                           else this.joinRoom();
                        }
                     }
                  } catch (RuntimeException malformedSession) {
                     if (resumingExistingSession) this.endSession();
                     else if (initialHandshakePending) this.failInitialSession("INVALID_SESSION_RESPONSE");
                  }
               }
               if (message.messageType == MessageType.SESSION && this.activeTransport instanceof LANTransport) {
                  this.isMultiplayerActive = true;
                  this.sessionError = null;
                  this.sessionState = MultiplayerManager.SessionState.ROOM_JOINED;
               }
               MessageRouter.routeMessage(message);
            }
         }
      }
   }

   private synchronized void failInitialSession(String errorCode) {
      initialSessionHandshakePending = false;
      cancelSessionHandshakeTimeout();
      cancelReconnectRetry();
      clearPendingRoomOperations();
      reconnectHandshakePending = false;
      isMultiplayerActive = false;
      sessionState = SessionState.FAILED;
      sessionError = errorCode == null || errorCode.isEmpty() ? "INITIAL_SESSION_FAILED" : errorCode;
      sessionToken = null;
      roomMembership = false;
      roomLifecycleVersion = 0;
      roomOwnerId = null;
      roomStatus = "LOBBY";
      roomLifecycleError = null;
      localRoomReady = false;
      roomSnapshotReady = false;
      roomAllReady = false;
      remotePlayers.clear();
      pendingActions.clear();
      NetworkTransport failed = activeTransport;
      activeTransport = null;
      if (failed != null) {
         try { failed.disconnect(); } catch (RuntimeException ignored) {}
      }
   }
   private boolean isRejectedSessionCredential(Throwable error) {
      if (error != null && error.getMessage() != null) {
         String message = error.getMessage();
         return message.contains("HTTP/1.1 401") || message.contains("HTTP/1.1 403") || message.contains("HTTP/1.1 409");
      } else {
         return false;
      }
   }

   public synchronized void onError(Throwable error) {
      String reason = error == null || error.getMessage() == null ? "TRANSPORT_ERROR" : error.getMessage();
      if (reconnectHandshakePending) {
         if (isRejectedSessionCredential(error)) {
            endSession();
            return;
         }
         cancelSessionHandshakeTimeout();
         reconnectHandshakePending = false;
         scheduleReconnectRetry(reason);
         return;
      }
      if (sessionToken == null) {
         failInitialSession(reason);
         return;
      }
      scheduleReconnectRetry(reason);
   }
   public static enum SessionState {
      DISCONNECTED,
      CONNECTING,
      TRANSPORT_CONNECTED,
      RECONNECTING,
      SESSION_BOUND,
      ROOM_JOINED,
      WORLD_SYNCED,
      READY,
      PLAYING,
      FAILED;

      // $FF: synthetic method
      private static SessionState[] $values() {
         return new SessionState[]{DISCONNECTED, CONNECTING, TRANSPORT_CONNECTED, RECONNECTING, SESSION_BOUND, ROOM_JOINED, WORLD_SYNCED, READY, PLAYING, FAILED};
      }
   }
}
