package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;

import org.junit.After;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

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
    public void resumedMemberAppliesTransferredOwnerAndFreshRosterAfterNetworkHandoff() throws Exception {
        RecordingInternetTransport initial = new RecordingInternetTransport();
        RecordingInternetTransport reconnect = new RecordingInternetTransport();
        manager.setSessionTimingForTests(5000L, 5000L, 20L, 3);
        manager.setInternetTransportFactoryForTests(() -> reconnect);

        manager.startSession("https://example.invalid/room/handoff-room/websocket",
                "returning-owner", initial, false);
        initial.callback.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"returning-owner\",\"sessionToken\":\"initial-owner-session-token-0001\","
                        + "\"sequence\":12,\"seed\":12345,\"roomLifecycleVersion\":1,"
                        + "\"roomMembership\":true,\"roomOwnerId\":\"returning-owner\"}"));

        String beforeDisconnect = "{\"lifecycleVersion\":1,\"roomStatus\":\"LOBBY\","
                + "\"gameStatus\":\"LOBBY\",\"ownerId\":\"returning-owner\","
                + "\"memberCount\":2,\"maxPlayers\":4,\"allReady\":true,"
                + "\"worldSnapshotReady\":true,\"seed\":12345,\"sequence\":12,"
                + "\"members\":["
                + "{\"playerId\":\"returning-owner\",\"className\":\"HUNTRESS\","
                + "\"state\":\"ALIVE\",\"ready\":true,\"connected\":true},"
                + "{\"playerId\":\"successor-player\",\"className\":\"WARRIOR\","
                + "\"state\":\"ALIVE\",\"ready\":true,\"connected\":true}]}";
        manager.applyRoomState(new NetworkMessage(MessageType.ROOM_STATE, beforeDisconnect));
        manager.markWorldSynchronized();
        Assert.assertTrue(manager.isLocalRoomOwner());
        Assert.assertTrue(manager.isLocalRoomReady());
        Assert.assertTrue(manager.isRoomSnapshotReady());

        initial.simulateDisconnect();
        awaitConnected(reconnect);
        Assert.assertEquals(MultiplayerManager.SessionState.RECONNECTING, manager.getSessionState());
        Assert.assertEquals("initial-owner-session-token-0001", reconnect.presentedToken);
        awaitOnlyReconnectRequest(reconnect);

        reconnect.callback.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"returning-owner\",\"sessionToken\":\"rotated-owner-session-token-0002\","
                        + "\"sequence\":12,\"seed\":12345,\"roomLifecycleVersion\":1,"
                        + "\"roomMembership\":true,\"roomOwnerId\":\"successor-player\",\"resumed\":true}"));

        Assert.assertEquals("returning-owner", manager.getLocalPlayerId());
        Assert.assertEquals("rotated-owner-session-token-0002", manager.getSessionToken());
        Assert.assertTrue(manager.isRoomMember());
        Assert.assertEquals("successor-player", manager.getRoomOwnerId());
        Assert.assertFalse(manager.isLocalRoomOwner());
        Assert.assertFalse(manager.isRoomGameplayAllowed());

        String resumedRoster = "{\"lifecycleVersion\":1,\"reason\":\"SESSION_RESUMED\","
                + "\"roomStatus\":\"LOBBY\",\"gameStatus\":\"LOBBY\","
                + "\"ownerId\":\"successor-player\",\"memberCount\":3,\"maxPlayers\":4,"
                + "\"allReady\":false,\"worldSnapshotReady\":true,\"seed\":12345,\"sequence\":12,"
                + "\"members\":["
                + "{\"playerId\":\"successor-player\",\"className\":\"WARRIOR\","
                + "\"state\":\"ALIVE\",\"ready\":false,\"connected\":true},"
                + "{\"playerId\":\"returning-owner\",\"className\":\"HUNTRESS\","
                + "\"state\":\"ALIVE\",\"ready\":false,\"connected\":true},"
                + "{\"playerId\":\"offline-member\",\"className\":\"MAGE\","
                + "\"state\":\"ALIVE\",\"ready\":false,\"connected\":false}]}";
        manager.applyRoomState(new NetworkMessage(MessageType.ROOM_STATE, resumedRoster));

        Assert.assertNull(manager.getRoomLifecycleError());
        Assert.assertEquals(MultiplayerManager.SessionState.WORLD_SYNCED, manager.getSessionState());
        Assert.assertEquals("successor-player", manager.getRoomOwnerId());
        Assert.assertEquals(3, manager.getRoomMemberCount());
        Assert.assertFalse(manager.isLocalRoomReady());
        Assert.assertTrue(manager.isRoomSnapshotReady());
        Assert.assertFalse(manager.isRoomGameplayAllowed());

        RoomMemberInfo[] restoredMembers = manager.getRoomMembers();
        Assert.assertEquals(3, restoredMembers.length);
        Assert.assertEquals("successor-player", restoredMembers[0].getPlayerId());
        Assert.assertTrue(restoredMembers[0].isConnected());
        Assert.assertFalse(restoredMembers[0].isReady());
        Assert.assertEquals("returning-owner", restoredMembers[1].getPlayerId());
        Assert.assertTrue(restoredMembers[1].isConnected());
        Assert.assertFalse(restoredMembers[1].isReady());
        Assert.assertEquals("offline-member", restoredMembers[2].getPlayerId());
        Assert.assertFalse(restoredMembers[2].isConnected());
        Assert.assertFalse(restoredMembers[2].isReady());
        Assert.assertFalse(manager.isLocalRoomOwner());
        Assert.assertFalse(manager.areAllRoomMembersReady());
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
        NetworkMessage firstRequest = awaitOnlyReconnectRequest(firstReconnect);
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
        Assert.assertEquals("{\"lastSequence\":9}", awaitOnlyReconnectRequest(secondReconnect).payloadJson);

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
    public void roomStateKeepsServerSnapshotAvailabilitySeparateFromLocalSyncAndAllowsUnreadyAgain() {
        RecordingInternetTransport transport = new RecordingInternetTransport();
        manager.startSession("https://example.invalid/room/state-room/websocket", "host-player", transport, true);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"host-player\",\"sessionToken\":\"lifecycle-session-token-0001\",\"sequence\":0,\"seed\":12345,\"roomLifecycleVersion\":1,\"roomMembership\":false}"));

        String unreadyState = "{\"lifecycleVersion\":1,\"roomStatus\":\"LOBBY\",\"gameStatus\":\"LOBBY\",\"ownerId\":\"host-player\",\"memberCount\":2,\"maxPlayers\":4,\"allReady\":false,\"worldSnapshotReady\":true,\"seed\":12345,\"sequence\":0,\"members\":[{\"playerId\":\"host-player\",\"className\":\"HUNTRESS\",\"state\":\"ALIVE\",\"ready\":false,\"connected\":true},{\"playerId\":\"offline-player\",\"className\":\"WARRIOR\",\"state\":\"ALIVE\",\"ready\":false,\"connected\":false}]}";
        String readyState = unreadyState.replace("\"playerId\":\"host-player\",\"className\":\"HUNTRESS\",\"state\":\"ALIVE\",\"ready\":false",
                "\"playerId\":\"host-player\",\"className\":\"HUNTRESS\",\"state\":\"ALIVE\",\"ready\":true");

        manager.applyRoomState(new NetworkMessage(MessageType.ROOM_STATE, unreadyState));
        Assert.assertTrue(manager.isRoomMember());
        Assert.assertFalse("Server snapshot availability is not proof it was applied locally", manager.isRoomSnapshotReady());
        Assert.assertEquals(MultiplayerManager.SessionState.ROOM_JOINED, manager.getSessionState());
        Assert.assertEquals(2, manager.getRoomMembers().length);
        Assert.assertEquals("HUNTRESS", manager.getRoomMembers()[0].getClassName());
        Assert.assertFalse(manager.getRoomMembers()[1].isConnected());
        Assert.assertTrue(manager.isLocalRoomOwner());
        Assert.assertFalse(manager.isRoomGameplayAllowed());

        manager.markWorldSynchronized();
        Assert.assertTrue(manager.isRoomSnapshotReady());
        Assert.assertEquals(MultiplayerManager.SessionState.WORLD_SYNCED, manager.getSessionState());

        manager.applyRoomState(new NetworkMessage(MessageType.ROOM_STATE, readyState));
        Assert.assertTrue(manager.isLocalRoomReady());
        Assert.assertEquals(MultiplayerManager.SessionState.READY, manager.getSessionState());

        manager.applyRoomState(new NetworkMessage(MessageType.ROOM_STATE, unreadyState));
        Assert.assertFalse(manager.isLocalRoomReady());
        Assert.assertTrue("Unready must keep the already-applied snapshot reusable", manager.isRoomSnapshotReady());
        Assert.assertEquals(MultiplayerManager.SessionState.WORLD_SYNCED, manager.getSessionState());
        Assert.assertFalse(manager.isRoomGameplayAllowed());

        manager.applyMatchStart(new NetworkMessage(MessageType.MATCH_START, "{\"status\":\"PLAYING\"}"));
        Assert.assertTrue(manager.isRoomGameplayAllowed());
        Assert.assertEquals(MultiplayerManager.SessionState.PLAYING, manager.getSessionState());
    }
    @Test
    public void failedInternetLifecycleSessionRemainsBlockedUntilExplicitEndSession() {
        RecordingInternetTransport transport = new RecordingInternetTransport();
        manager.startSession("https://example.invalid/room/failed-lifecycle-room/websocket",
                "failed-player", transport, false);

        Assert.assertTrue(manager.isRoomLifecycleRequired());
        Assert.assertFalse(manager.isRoomGameplayAllowed());
        manager.onDisconnected("initial connection closed before SESSION");

        Assert.assertEquals(MultiplayerManager.SessionState.FAILED, manager.getSessionState());
        Assert.assertTrue("A failed online room remains fail-closed until the user exits it",
                manager.isRoomLifecycleRequired());
        Assert.assertFalse(manager.isRoomGameplayAllowed());

        manager.endSession();
        Assert.assertFalse(manager.isRoomLifecycleRequired());
        Assert.assertTrue(manager.isRoomGameplayAllowed());
    }

    @Test
    public void roomStateRejectsDuplicateMemberIdentitiesWithoutAcceptingPartialRoster() {
        RecordingInternetTransport transport = new RecordingInternetTransport();
        manager.startSession("https://example.invalid/room/duplicate-member-room/websocket",
                "host-player", transport, true);
        manager.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"host-player\",\"sessionToken\":\"lifecycle-session-token-0001\",\"sequence\":0,\"seed\":12345,\"roomLifecycleVersion\":1,\"roomMembership\":false}"));

        String duplicateMembers = "{\"lifecycleVersion\":1,\"roomStatus\":\"LOBBY\",\"gameStatus\":\"LOBBY\",\"ownerId\":\"host-player\",\"memberCount\":2,\"maxPlayers\":4,\"allReady\":false,\"worldSnapshotReady\":true,\"seed\":12345,\"sequence\":0,\"members\":[{\"playerId\":\"host-player\",\"className\":\"HUNTRESS\",\"state\":\"ALIVE\",\"ready\":false,\"connected\":true},{\"playerId\":\"host-player\",\"className\":\"WARRIOR\",\"state\":\"ALIVE\",\"ready\":false,\"connected\":true}]}";
        manager.applyRoomState(new NetworkMessage(MessageType.ROOM_STATE, duplicateMembers));

        Assert.assertFalse(manager.isRoomMember());
        Assert.assertEquals("INVALID_ROOM_MEMBER_FIELDS", manager.getRoomLifecycleError());
        Assert.assertEquals(0, manager.getRoomMembers().length);
    }

    @Test
    public void transportCallbackWaitsForSessionReplacementAndCannotReviveTheOldSession() throws Exception {
        long previousDungeonSeed = Dungeon.seed;
        try {
            RecordingInternetTransport initial = new RecordingInternetTransport();
            manager.startSession("https://example.invalid/room/old-generation/websocket", "old-player", initial);
            TransportCallback staleCallback = initial.callback;
            CountDownLatch callbackStarted = new CountDownLatch(1);
            CountDownLatch callbackFinished = new CountDownLatch(1);
            Thread lateCallback = new Thread(() -> {
                callbackStarted.countDown();
                staleCallback.onMessageReceived(new NetworkMessage(MessageType.SESSION,
                        "{\"playerId\":\"old-player\",\"sessionToken\":\"stale-session-token-0001\",\"sequence\":99,\"seed\":99999}"));
                callbackFinished.countDown();
            }, "test-stale-multiplayer-callback");
            RecordingInternetTransport replacement = new RecordingInternetTransport();
            synchronized (manager) {
                lateCallback.start();
                Assert.assertTrue("Callback thread did not start", callbackStarted.await(2, TimeUnit.SECONDS));
                long blockedDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
                while (lateCallback.getState() != Thread.State.BLOCKED
                        && System.nanoTime() < blockedDeadline) Thread.yield();
                Assert.assertEquals("Callback must block on the manager transition lock",
                        Thread.State.BLOCKED, lateCallback.getState());
                manager.endSession();
                manager.startSession("https://example.invalid/room/new-generation/websocket", "new-player", replacement);
                Assert.assertEquals(MultiplayerManager.SessionState.TRANSPORT_CONNECTED, manager.getSessionState());
            }
            Assert.assertTrue("Stale callback did not leave the generation gate", callbackFinished.await(2, TimeUnit.SECONDS));
            lateCallback.join(2000L);
            Assert.assertFalse(lateCallback.isAlive());
            Assert.assertTrue(manager.isCurrentTransportForTests(replacement));
            Assert.assertEquals("new-player", manager.getLocalPlayerId());
            Assert.assertNull("Old SESSION must not install its bearer token", manager.getSessionToken());
            Assert.assertEquals("Old SESSION must not advance the replacement sequence", 0L, manager.getLastSequence());
            Assert.assertEquals("Old SESSION must not replace the global dungeon seed", previousDungeonSeed, Dungeon.seed);
            Assert.assertEquals("Old SESSION must not change the replacement state",
                    MultiplayerManager.SessionState.TRANSPORT_CONNECTED, manager.getSessionState());
        } finally {
            Dungeon.seed = previousDungeonSeed;
        }
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
        Assert.assertTrue("Internet lifecycle gating must survive retry exhaustion",
                manager.isRoomLifecycleRequired());
        Assert.assertFalse("Retry exhaustion must never unlock native solo gameplay",
                manager.isRoomGameplayAllowed());

        manager.endSession();
        Assert.assertFalse(manager.isRoomLifecycleRequired());
        Assert.assertTrue(manager.isRoomGameplayAllowed());
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

    private static NetworkMessage awaitOnlyReconnectRequest(RecordingInternetTransport transport)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3000L;
        while (System.currentTimeMillis() < deadline) {
            synchronized (transport.sent) {
                if (transport.sent.size() == 1) {
                    Assert.assertEquals(MessageType.RECONNECT, transport.sent.get(0).messageType);
                    return transport.sent.get(0);
                }
                Assert.assertTrue("Reconnect must not send duplicate handshake requests", transport.sent.size() <= 1);
            }
            Thread.sleep(5L);
        }
        Assert.fail("Timed out waiting for the reconnect handshake request");
        return null;
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
            synchronized (sent) {
                sent.add(message);
            }
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
