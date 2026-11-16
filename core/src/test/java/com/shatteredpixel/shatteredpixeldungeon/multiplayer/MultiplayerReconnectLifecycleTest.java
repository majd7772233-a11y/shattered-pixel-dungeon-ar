package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

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
        manager.setInternetTransportFactoryForTests(() -> reconnect);
        manager.startSession("https://example.invalid/room/reconnect-room/websocket",
                "stable-player-id", initial);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"stable-player-id\",\"sessionToken\":\"initial-session-token-0001\",\"sequence\":3}"));
        initial.simulateDisconnect();
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
        manager.setInternetTransportFactoryForTests(() -> reconnect);
        manager.startSession("https://example.invalid/room/reconnect-room/websocket",
                "stable-player-id", initial);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"stable-player-id\",\"sessionToken\":\"initial-session-token-0003\",\"sequence\":5}"));

        initial.simulateDisconnect();
        reconnect.simulateError(new IllegalStateException(
                "WebSocket Handshake Failed (Requires HTTP 101): HTTP/1.1 409 Conflict"));

        Assert.assertFalse("A concurrent reconnect winner invalidates the previous bearer token",
                manager.isMultiplayerActive());
        Assert.assertNull(manager.getSessionToken());
    }

    private static NetworkMessage onlyReconnectRequest(RecordingInternetTransport transport) {
        Assert.assertEquals(1, transport.sent.size());
        Assert.assertEquals(MessageType.RECONNECT, transport.sent.get(0).messageType);
        return transport.sent.get(0);
    }

    private static final class RecordingInternetTransport extends InternetTransport {
        private TransportCallback callback;
        private boolean connected;
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
