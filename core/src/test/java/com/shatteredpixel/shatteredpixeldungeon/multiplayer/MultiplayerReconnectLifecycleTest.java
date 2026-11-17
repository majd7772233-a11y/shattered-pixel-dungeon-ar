package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;

import org.junit.After;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MultiplayerReconnectLifecycleTest {

    private MultiplayerManager manager;

    @Before
    public void setUp() {
        manager = MultiplayerManager.getInstance();
        manager.endSession();
    }

    @After
    public void tearDown() {
        manager.endSession();
        manager.setInternetTransportFactoryForTests(null);
    }

    @Test
    public void internetDisconnectAndErrorStartAuthenticatedReconnectWithoutRetryLoops() throws Exception {
        RecordingInternetTransport initial = new RecordingInternetTransport();
        RecordingInternetTransport firstReconnect = new RecordingInternetTransport();
        RecordingInternetTransport secondReconnect = new RecordingInternetTransport();
        List<RecordingInternetTransport> replacements =
                new ArrayList<>(Arrays.asList(firstReconnect, secondReconnect));
        final int[] factoryCalls = {0};
        manager.setSessionTimingForTests(5000L, 5000L, 20L, 3);
        manager.setInternetTransportFactoryForTests(() -> {
            factoryCalls[0]++;
            return replacements.remove(0);
        });

        manager.startSession("https://example.invalid/room/reconnect-room/websocket",
                "stable-player-id", initial);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"stable-player-id\",\"sessionToken\":\"initial-session-token-0001\",\"sequence\":7}"));
        manager.updateLastSequence(9L);

        initial.simulateDisconnect();
        awaitConnected(firstReconnect);

        // Late callbacks from the retired transport generation must be ignored.
        initial.simulateError(new IllegalStateException("stale predecessor transport error"));

        Assert.assertEquals(1, factoryCalls[0]);
        Assert.assertFalse("An in-flight reconnect handshake must suppress duplicate attempts",
                manager.reconnectInternetSession());
        Assert.assertEquals("initial-session-token-0001", firstReconnect.presentedToken);
        Assert.assertTrue(firstReconnect.endpoint.contains("playerId=stable-player-id"));
        Assert.assertFalse(firstReconnect.endpoint.contains("initial-session-token-0001"));
        NetworkMessage firstRequest = onlyReconnectRequest(firstReconnect);
        Assert.assertEquals("{\"lastSequence\":9}", firstRequest.payloadJson);
        Assert.assertFalse("The old socket must be disconnected after replacement is installed",
                initial.connected);

        // A failed replacement upgrade ends this attempt but does not recurse immediately.
        firstReconnect.simulateError(new IllegalStateException("temporary upgrade failure"));
        Assert.assertEquals(1, factoryCalls[0]);

        // A later transport error can start another attempt using the still-current credential.
        firstReconnect.simulateError(new IllegalStateException("network available again"));
        awaitConnected(secondReconnect);
        Assert.assertEquals(2, factoryCalls[0]);
        Assert.assertEquals("initial-session-token-0001", secondReconnect.presentedToken);
        Assert.assertEquals("{\"lastSequence\":9}", onlyReconnectRequest(secondReconnect).payloadJson);

        NetworkMessage resumed = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"stable-player-id\",\"sessionToken\":\"rotated-session-token-0002\",\"sequence\":40}");
        manager.onMessageReceived(resumed);

        Assert.assertEquals("A resumed SESSION cannot skip unapplied events", 9L, manager.getLastSequence());
        Assert.assertEquals("rotated-session-token-0002", manager.getSessionToken());
        Assert.assertEquals(2, factoryCalls[0]);
    }

    @Test
    public void rejectedCredentialAndReplacedSocketClearTheStaleSession() throws Exception {
        RecordingInternetTransport initial = new RecordingInternetTransport();
        RecordingInternetTransport reconnect = new RecordingInternetTransport();
        manager.setSessionTimingForTests(5000L, 5000L, 20L, 3);
        manager.setInternetTransportFactoryForTests(() -> reconnect);
        manager.startSession("https://example.invalid/room/reconnect-room/websocket",
                "stable-player-id", initial);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"stable-player-id\",\"sessionToken\":\"initial-session-token-0001\",\"sequence\":3}"));
        initial.simulateDisconnect();
        awaitConnected(reconnect);
        reconnect.simulateError(new IllegalStateException(
                "WebSocket Handshake Failed (Requires HTTP 101): HTTP/1.1 401 Unauthorized"));

        Assert.assertFalse(manager.isMultiplayerActive());
        Assert.assertNull(manager.getSessionToken());

        RecordingInternetTransport secondInitial = new RecordingInternetTransport();
        manager.startSession("https://example.invalid/room/reconnect-room/websocket",
                "stable-player-id", secondInitial);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"stable-player-id\",\"sessionToken\":\"initial-session-token-0002\",\"sequence\":3}"));
        manager.onMessageReceived(new NetworkMessage(MessageType.ERROR,
                "{\"error\":\"SESSION_REPLACED\"}"));

        Assert.assertFalse(manager.isMultiplayerActive());
        Assert.assertNull(manager.getSessionToken());
    }

    @Test
    public void concurrentResumeConflictClearsTheNowSupersededCredential() throws Exception {
        RecordingInternetTransport initial = new RecordingInternetTransport();
        RecordingInternetTransport reconnect = new RecordingInternetTransport();
        manager.setSessionTimingForTests(5000L, 5000L, 20L, 3);
        manager.setInternetTransportFactoryForTests(() -> reconnect);
        manager.startSession("https://example.invalid/room/reconnect-room/websocket",
                "stable-player-id", initial);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"stable-player-id\",\"sessionToken\":\"initial-session-token-0003\",\"sequence\":5}"));

        initial.simulateDisconnect();
        awaitConnected(reconnect);
        reconnect.simulateError(new IllegalStateException(
                "WebSocket Handshake Failed (Requires HTTP 101): HTTP/1.1 409 Conflict"));

        Assert.assertFalse("A concurrent reconnect winner invalidates the previous bearer token",
                manager.isMultiplayerActive());
        Assert.assertNull(manager.getSessionToken());
    }

    @Test
    public void internetSessionNegotiatesLifecycleAndChoosesCreateOrJoinExplicitly() throws Exception {
        String endpoint = "https://example.invalid/room/lifecycle-room/websocket";
        RecordingInternetTransport host = new RecordingInternetTransport();
        manager.startSession(endpoint, "host-player", host, true);
        Assert.assertTrue(host.endpoint.contains("lifecycle=1"));
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"host-player\",\"sessionToken\":\"lifecycle-session-token-0001\",\"sequence\":0,\"seed\":12345,\"roomLifecycleVersion\":1,\"roomMembership\":false}"));
        Assert.assertEquals(MultiplayerManager.SessionState.SESSION_BOUND, manager.getSessionState());
        Assert.assertEquals(1, host.sent.size());
        Assert.assertEquals(MessageType.CREATE_ROOM, host.sent.get(0).messageType);
        Assert.assertTrue(host.sent.get(0).payloadJson.contains("COOP_DUNGEON"));

        manager.endSession();
        RecordingInternetTransport guest = new RecordingInternetTransport();
        manager.startSession(endpoint, "guest-player", guest, false);
        Assert.assertTrue(guest.endpoint.contains("lifecycle=1"));
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"guest-player\",\"sessionToken\":\"lifecycle-session-token-0002\",\"sequence\":0,\"seed\":12345,\"roomLifecycleVersion\":1,\"roomMembership\":false}"));
        Assert.assertEquals(1, guest.sent.size());
        Assert.assertEquals(MessageType.JOIN_ROOM, guest.sent.get(0).messageType);
    }
    @Test
    public void initialSessionHandshakeTimeoutFailsCleanlyAndLateCallbacksStayIgnored() throws Exception {
        RecordingInternetTransport initial = new RecordingInternetTransport();
        manager.setSessionTimingForTests(30L, 30L, 5L, 1);
        manager.startSession("https://example.invalid/room/timeout-room/websocket", "timeout-player", initial);
        TransportCallback staleCallback = initial.callback;

        awaitSessionState(MultiplayerManager.SessionState.FAILED);
        Assert.assertEquals("SESSION_HANDSHAKE_TIMEOUT", manager.getSessionError());
        Assert.assertFalse(manager.isMultiplayerActive());
        Assert.assertNull(manager.getSessionToken());

        manager.endSession();
        long endedGeneration = manager.getSessionGenerationForTests();
        staleCallback.onConnected();
        Assert.assertEquals(endedGeneration, manager.getSessionGenerationForTests());
        Assert.assertEquals(MultiplayerManager.SessionState.DISCONNECTED, manager.getSessionState());
    }

    @Test
    public void reconnectHandshakeTimeoutExhaustsTheConfiguredRetryBudget() throws Exception {
        RecordingInternetTransport initial = new RecordingInternetTransport();
        RecordingInternetTransport reconnect = new RecordingInternetTransport();
        final int[] factoryCalls = {0};
        manager.setSessionTimingForTests(35L, 25L, 5L, 1);
        manager.setInternetTransportFactoryForTests(() -> {
            factoryCalls[0]++;
            return reconnect;
        });
        manager.startSession("https://example.invalid/room/retry-room/websocket", "retry-player", initial);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"retry-player\",\"sessionToken\":\"retry-session-token-0001\",\"sequence\":0}"));

        initial.simulateDisconnect();
        awaitConnected(reconnect);
        awaitSessionState(MultiplayerManager.SessionState.FAILED);

        Assert.assertEquals(1, factoryCalls[0]);
        Assert.assertEquals("RECONNECT_ATTEMPTS_EXHAUSTED", manager.getSessionError());
        Assert.assertFalse(manager.isMultiplayerActive());
    }

    @Test
    public void roomOperationTimeoutRemovesThePendingOperationAndExposesARecoverableError() throws Exception {
        RecordingInternetTransport transport = new RecordingInternetTransport();
        manager.setSessionTimingForTests(5000L, 25L, 5L, 1);
        manager.startSession("https://example.invalid/room/operation-timeout/websocket", "operation-player", transport);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"operation-player\",\"sessionToken\":\"operation-session-token-0001\",\"sequence\":0,\"seed\":12345,\"roomLifecycleVersion\":1,\"roomMembership\":false}"));

        Assert.assertEquals(1, transport.sent.size());
        Assert.assertEquals(MessageType.CREATE_ROOM, transport.sent.get(0).messageType);
        awaitRoomLifecycleError("ROOM_OPERATION_TIMEOUT:CREATE_ROOM");
        Assert.assertTrue(manager.isMultiplayerActive());
        Assert.assertEquals(MultiplayerManager.SessionState.SESSION_BOUND, manager.getSessionState());
    }

    @Test
    public void readyPayloadIncludesTheEscapedNativeHeroStateAndClassRequiredByTheWorker() {
        String heroStateJson = "{\"combatBundle\":\"quoted \\\"hero\\\" and \\\\ path\",\"hp\":18,\"ht\":20,\"pos\":7,\"shielding\":3}";
        String payloadJson = MultiplayerManager.buildRoomReadyPayload(true, 12345L, 27L, "HUNTRESS", heroStateJson);
        JsonValue payload = new JsonReader().parse(payloadJson);

        Assert.assertTrue(payload.getBoolean("ready"));
        Assert.assertEquals(12345L, payload.getLong("seed"));
        Assert.assertEquals(27L, payload.getLong("sequence"));
        Assert.assertEquals("HUNTRESS", payload.getString("className"));
        Assert.assertEquals("The nested hero JSON must survive outer JSON escaping", heroStateJson,
                payload.getString("heroStateJson"));
        JsonValue restoredHero = new JsonReader().parse(payload.getString("heroStateJson"));
        Assert.assertEquals(18, restoredHero.getInt("hp"));
        Assert.assertEquals(7, restoredHero.getInt("pos"));
        Assert.assertEquals(3, restoredHero.getInt("shielding"));

        JsonValue unready = new JsonReader().parse(
                MultiplayerManager.buildRoomReadyPayload(false, 12345L, 27L, null, null));
        Assert.assertFalse(unready.getBoolean("ready"));
        Assert.assertNull(unready.get("className"));
        Assert.assertNull(unready.get("heroStateJson"));
        Assert.assertNull(MultiplayerManager.buildRoomReadyPayload(true, 12345L, 27L, "HUNTRESS", null));
    }
    private void awaitSessionState(MultiplayerManager.SessionState expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3000L;
        while (manager.getSessionState() != expected && System.currentTimeMillis() < deadline) Thread.sleep(5L);
        Assert.assertEquals("Timed out waiting for session state " + expected, expected, manager.getSessionState());
    }

    private void awaitRoomLifecycleError(String expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3000L;
        while (!expected.equals(manager.getRoomLifecycleError()) && System.currentTimeMillis() < deadline) Thread.sleep(5L);
        Assert.assertEquals("Timed out waiting for room operation error", expected, manager.getRoomLifecycleError());
    }
    private static void awaitConnected(RecordingInternetTransport transport) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3000L;
        while (!transport.connected && System.currentTimeMillis() < deadline) Thread.sleep(5L);
        Assert.assertTrue("Timed out waiting for reconnect transport", transport.connected);
    }

    private static NetworkMessage onlyReconnectRequest(RecordingInternetTransport transport) {
        Assert.assertEquals(1, transport.sent.size());
        Assert.assertEquals(MessageType.RECONNECT, transport.sent.get(0).messageType);
        return transport.sent.get(0);
    }

    private static final class RecordingInternetTransport extends InternetTransport {
        private volatile TransportCallback callback;
        private volatile boolean connected;
        private String endpoint;
        private String presentedToken;
        private final List<NetworkMessage> sent = new ArrayList<>();

        @Override
        public void connect(String endpoint, TransportCallback callback) {
            this.endpoint = endpoint;
            this.callback = callback;
            connected = true;
            callback.onConnected();
        }

        @Override
        void connect(String endpoint, TransportCallback callback, String sessionToken) {
            this.endpoint = endpoint;
            this.callback = callback;
            this.presentedToken = sessionToken;
            connected = true;
            callback.onConnected();
        }

        @Override
        public void send(NetworkMessage message) {
            sent.add(message);
        }

        @Override
        public void disconnect() {
            boolean wasConnected = connected;
            connected = false;
            if (wasConnected && callback != null) {
                callback.onDisconnected("test transport disconnected");
            }
        }

        void simulateDisconnect() {
            if (callback != null) callback.onDisconnected("simulated network disconnect");
        }

        void simulateError(Throwable error) {
            if (callback != null) callback.onError(error);
        }

        @Override
        public boolean isConnected() {
            return connected;
        }

        @Override
        public String getTransportType() {
            return "INTERNET";
        }
    }
}
