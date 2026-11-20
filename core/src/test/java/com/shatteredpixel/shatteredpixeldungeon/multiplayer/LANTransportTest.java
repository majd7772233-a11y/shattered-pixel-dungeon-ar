package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class LANTransportTest {

    private static final class RecordingCallback implements TransportCallback {
        final CountDownLatch connected = new CountDownLatch(1);
        final CountDownLatch disconnected = new CountDownLatch(1);
        final CountDownLatch error = new CountDownLatch(1);
        final BlockingQueue<NetworkMessage> messages = new LinkedBlockingQueue<>();
        final AtomicReference<Throwable> failure = new AtomicReference<>();

        @Override public void onConnected() { connected.countDown(); }
        @Override public void onDisconnected(String reason) { disconnected.countDown(); }
        @Override public void onMessageReceived(NetworkMessage message) { messages.offer(message); }
        @Override public void onError(Throwable throwable) { failure.set(throwable); error.countDown(); }
    }

    @Test
    public void hostAndGuestCompleteIdentityHandshakeAndExchangeMessages() throws Exception {
        LANTransport host = new LANTransport();
        LANTransport guest = new LANTransport();
        RecordingCallback hostCallback = new RecordingCallback();
        RecordingCallback guestCallback = new RecordingCallback();
        try {
            host.startServer(0, "test-host", "host-01", hostCallback);
            Assert.assertTrue(host.isHosting());
            Assert.assertTrue(host.isConnected());
            Assert.assertTrue(host.getLocalPort() > 0);

            guest.setLocalPlayerId("guest-01");
            guest.connect("127.0.0.1:" + host.getLocalPort(), guestCallback);
            Assert.assertTrue("guest transport did not connect", guestCallback.connected.await(5, TimeUnit.SECONDS));

            NetworkMessage session = guestCallback.messages.poll(5, TimeUnit.SECONDS);
            Assert.assertNotNull("host did not send SESSION", session);
            Assert.assertEquals(MessageType.SESSION, session.messageType);
            Assert.assertEquals("host-01", session.senderId);
            Assert.assertTrue(session.payloadJson.contains("guest-01"));
            Assert.assertTrue(guest.isConnected());

            NetworkMessage ready = new NetworkMessage(MessageType.READY, "{\"ready\":true}");
            ready.senderId = "guest-01";
            guest.send(ready);
            NetworkMessage receivedReady = hostCallback.messages.poll(5, TimeUnit.SECONDS);
            Assert.assertNotNull("host did not receive guest message", receivedReady);
            Assert.assertEquals(MessageType.READY, receivedReady.messageType);
            Assert.assertEquals("guest-01", receivedReady.senderId);
            Assert.assertTrue(host.getConnectedPlayerIds().contains("guest-01"));

            NetworkMessage roomState = new NetworkMessage(MessageType.ROOM_STATE, "{\"status\":\"LOBBY\"}");
            roomState.senderId = "host-01";
            host.send(roomState);
            NetworkMessage receivedState = guestCallback.messages.poll(5, TimeUnit.SECONDS);
            Assert.assertNotNull("guest did not receive host message", receivedState);
            Assert.assertEquals(MessageType.ROOM_STATE, receivedState.messageType);
            Assert.assertEquals("host-01", receivedState.senderId);
        } finally {
            guest.disconnect();
            host.disconnect();
        }
    }

    @Test
    public void rejectsDuplicatePlayerIdentityWithoutDisconnectingExistingGuest() throws Exception {
        LANTransport host = new LANTransport();
        LANTransport first = new LANTransport();
        LANTransport duplicate = new LANTransport();
        RecordingCallback firstCallback = new RecordingCallback();
        RecordingCallback duplicateCallback = new RecordingCallback();
        try {
            host.startServer(0, "test-host", "host-02", null);
            first.setLocalPlayerId("same-player");
            first.connect("127.0.0.1:" + host.getLocalPort(), firstCallback);
            Assert.assertTrue(firstCallback.connected.await(5, TimeUnit.SECONDS));

            duplicate.setLocalPlayerId("same-player");
            duplicate.connect("127.0.0.1:" + host.getLocalPort(), duplicateCallback);
            Assert.assertTrue("duplicate identity was not rejected", duplicateCallback.error.await(5, TimeUnit.SECONDS));
            Assert.assertTrue(first.isConnected());
            Assert.assertTrue(host.getConnectedPlayerIds().contains("same-player"));
            Assert.assertEquals(1, host.getConnectedPlayerIds().size());
        } finally {
            duplicate.disconnect();
            first.disconnect();
            host.disconnect();
        }
    }

    @Test
    public void enforcesFourPlayerRoomLimit() throws Exception {
        LANTransport host = new LANTransport();
        LANTransport[] guests = {new LANTransport(), new LANTransport(), new LANTransport(), new LANTransport()};
        RecordingCallback[] callbacks = {new RecordingCallback(), new RecordingCallback(),
                new RecordingCallback(), new RecordingCallback()};
        try {
            host.startServer(0, "test-host", "host-03", null);
            for (int i = 0; i < guests.length; i++) {
                guests[i].setLocalPlayerId("guest-" + i);
                guests[i].connect("127.0.0.1:" + host.getLocalPort(), callbacks[i]);
            }

            // TCP accept order is scheduler-dependent. Assert the capacity invariant rather than
            // assuming the first three client threads are the first three sockets accepted.
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            int resolved;
            do {
                resolved = 0;
                for (RecordingCallback callback : callbacks) {
                    if (callback.connected.getCount() == 0 || callback.error.getCount() == 0) resolved++;
                }
                if (resolved == guests.length) break;
                Thread.sleep(10);
            } while (System.nanoTime() < deadline);

            Assert.assertEquals("all four connection attempts should resolve", guests.length, resolved);
            int admitted = 0;
            int rejected = 0;
            for (int i = 0; i < guests.length; i++) {
                if (callbacks[i].connected.getCount() == 0) admitted++;
                if (callbacks[i].error.getCount() == 0) rejected++;
            }
            Assert.assertEquals("host should admit exactly three guests", 3, admitted);
            Assert.assertEquals("host should reject exactly one guest", 1, rejected);
            Assert.assertEquals(3, host.getConnectedPlayerIds().size());
            int connectedGuests = 0;
            for (LANTransport guest : guests) if (guest.isConnected()) connectedGuests++;
            Assert.assertEquals(3, connectedGuests);
        } finally {
            for (LANTransport guest : guests) guest.disconnect();
            host.disconnect();
        }
    }

    @Test
    public void refusesFakeHostEndpointAndReportsBindFailure() throws Exception {
        LANTransport notHosting = new LANTransport();
        try {
            notHosting.connect(LANTransport.LOCAL_HOST_ENDPOINT, new RecordingCallback());
            Assert.fail("A local host endpoint must not fake an active listener");
        } catch (IllegalStateException expected) {
            Assert.assertEquals("LAN_HOST_NOT_READY", expected.getMessage());
        }

        try (ServerSocket occupied = new ServerSocket(0)) {
            LANTransport failedHost = new LANTransport();
            try {
                failedHost.startServer(occupied.getLocalPort(), "test", "host-04", null);
                Assert.fail("The host must report bind conflicts instead of swallowing them");
            } catch (IOException expected) {
                Assert.assertEquals("LAN_SERVER_BIND_FAILED", expected.getMessage());
                Assert.assertFalse(failedHost.isHosting());
            } finally {
                failedHost.disconnect();
            }
        }
    }

    @Test
    public void peerDepartureIsBroadcastToRemainingGuests() throws Exception {
        LANTransport host = new LANTransport();
        LANTransport first = new LANTransport();
        LANTransport second = new LANTransport();
        RecordingCallback firstCallback = new RecordingCallback();
        RecordingCallback secondCallback = new RecordingCallback();
        try {
            host.startServer(0, "test-host", "host-06", null);
            first.setLocalPlayerId("peer-leaving");
            first.connect("127.0.0.1:" + host.getLocalPort(), firstCallback);
            Assert.assertTrue(firstCallback.connected.await(5, TimeUnit.SECONDS));
            Assert.assertNotNull(firstCallback.messages.poll(5, TimeUnit.SECONDS));

            second.setLocalPlayerId("peer-staying");
            second.connect("127.0.0.1:" + host.getLocalPort(), secondCallback);
            Assert.assertTrue(secondCallback.connected.await(5, TimeUnit.SECONDS));
            Assert.assertNotNull(secondCallback.messages.poll(5, TimeUnit.SECONDS));

            first.disconnect();
            NetworkMessage left = secondCallback.messages.poll(5, TimeUnit.SECONDS);
            Assert.assertNotNull("remaining guest did not receive PLAYER_LEFT", left);
            Assert.assertEquals(MessageType.PLAYER_LEFT, left.messageType);
            Assert.assertEquals("peer-leaving", left.senderId);
        } finally {
            first.disconnect();
            second.disconnect();
            host.disconnect();
        }
    }

    @Test
    public void rejectsClientMessagesThatImpersonateAnotherPlayer() throws Exception {
        LANTransport host = new LANTransport();
        LANTransport guest = new LANTransport();
        RecordingCallback guestCallback = new RecordingCallback();
        try {
            host.startServer(0, "test-host", "host-07", null);
            guest.setLocalPlayerId("real-guest");
            guest.connect("127.0.0.1:" + host.getLocalPort(), guestCallback);
            Assert.assertTrue(guestCallback.connected.await(5, TimeUnit.SECONDS));
            Assert.assertNotNull(guestCallback.messages.poll(5, TimeUnit.SECONDS));

            NetworkMessage forged = new NetworkMessage(MessageType.READY, "{\"ready\":true}");
            forged.senderId = "somebody-else";
            guest.send(forged);
            Assert.assertTrue("forged sender identity was not rejected",
                    guestCallback.error.await(5, TimeUnit.SECONDS));
        } finally {
            guest.disconnect();
            host.disconnect();
        }
    }
    @Test
    public void hostClosureDisconnectsAnAuthenticatedGuest() throws Exception {
        LANTransport host = new LANTransport();
        LANTransport guest = new LANTransport();
        RecordingCallback guestCallback = new RecordingCallback();
        try {
            host.startServer(0, "test-host", "host-close", null);
            guest.setLocalPlayerId("guest-close");
            guest.connect("127.0.0.1:" + host.getLocalPort(), guestCallback);
            Assert.assertTrue(guestCallback.connected.await(5, TimeUnit.SECONDS));
            NetworkMessage session = guestCallback.messages.poll(5, TimeUnit.SECONDS);
            Assert.assertNotNull(session);
            Assert.assertTrue(guest.isConnected());

            host.disconnect();
            Assert.assertTrue("guest did not observe host shutdown",
                    guestCallback.disconnected.await(5, TimeUnit.SECONDS));
            Assert.assertFalse(guest.isConnected());
        } finally {
            guest.disconnect();
            host.disconnect();
        }
    }

    @Test
    public void unavailableTcpPortReportsFailureWithoutConnectedState() throws Exception {
        int unusedPort;
        try (ServerSocket probe = new ServerSocket(0)) {
            unusedPort = probe.getLocalPort();
        }

        LANTransport guest = new LANTransport();
        RecordingCallback callback = new RecordingCallback();
        try {
            guest.setLocalPlayerId("guest-refused");
            guest.connect("127.0.0.1:" + unusedPort, callback);
            Assert.assertTrue("refused TCP connection did not report an error",
                    callback.error.await(5, TimeUnit.SECONDS));
            Assert.assertFalse(guest.isConnected());
        } finally {
            guest.disconnect();
        }
    }
    @Test
    public void hostAnnouncementStartsWithBoundTcpPortAndStopsOnDisconnect() throws Exception {
        LANTransport host = new LANTransport();
        try {
            host.startServer(0, "test-host", "host-advertised", null);
            Assert.assertTrue(host.isHosting());
            Assert.assertTrue(host.getLocalPort() > 0);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (!host.isHostAnnouncerRunningForTests() && System.nanoTime() < deadline) {
                Thread.sleep(5L);
            }
            Assert.assertTrue("host UDP announcement worker did not start", host.isHostAnnouncerRunningForTests());
        } finally {
            host.disconnect();
        }
        Assert.assertFalse("host UDP announcement worker survived transport disconnect",
                host.isHostAnnouncerRunningForTests());
    }
    @Test
    public void hostShutdownClosesUnauthenticatedPendingSockets() throws Exception {
        LANTransport host = new LANTransport();
        try (Socket pending = new Socket()) {
            host.startServer(0, "test-host", "host-05", null);
            pending.connect(new java.net.InetSocketAddress("127.0.0.1", host.getLocalPort()), 1000);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            while (host.getPendingPeerCountForTests() == 0 && System.nanoTime() < deadline) {
                Thread.sleep(10);
            }
            Assert.assertTrue("host did not register the unauthenticated socket", host.getPendingPeerCountForTests() > 0);
            host.disconnect();
            pending.setSoTimeout(2000);
            Assert.assertEquals("host shutdown should close the pending peer", -1, pending.getInputStream().read());
        } finally {
            host.disconnect();
        }
    }
}