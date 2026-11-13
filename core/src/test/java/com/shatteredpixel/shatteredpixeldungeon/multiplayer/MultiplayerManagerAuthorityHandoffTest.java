package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

public class MultiplayerManagerAuthorityHandoffTest {

    @Test
    public void rejectedPublisherRebaseClearsItsGenerationMarkerAndRequestsResync() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        java.util.List<NetworkMessage> sent = new java.util.ArrayList<>();
        NetworkTransport transport = new NetworkTransport() {
            private boolean connected;
            @Override public void connect(String endpoint, TransportCallback callback) {
                connected = true;
                if (callback != null) callback.onConnected();
            }
            @Override public void send(NetworkMessage message) { sent.add(message); }
            @Override public void disconnect() { connected = false; }
            @Override public boolean isConnected() { return connected; }
            @Override public String getTransportType() { return "TEST"; }
        };
        manager.startSession("publisher-rebase-retry-test", "local-player", transport);
        try {
            manager.applyLevelPublisherChange("local-player", 4L);
            java.lang.reflect.Field sentTermField = MultiplayerManager.class.getDeclaredField("publisherRebaseSentTerm");
            sentTermField.setAccessible(true);
            sentTermField.setLong(manager, 4L);
            java.lang.reflect.Field rebaseRequestsField = MultiplayerManager.class.getDeclaredField("publisherRebaseRequests");
            rebaseRequestsField.setAccessible(true);
            @SuppressWarnings("unchecked")
            java.util.Map<String, Long> rebaseRequests =
                    (java.util.Map<String, Long>) rebaseRequestsField.get(manager);
            rebaseRequests.put("publisher-rebase-rejected-001", 4L);
            java.lang.reflect.Field pendingField = MultiplayerManager.class.getDeclaredField("pendingActions");
            pendingField.setAccessible(true);
            @SuppressWarnings("unchecked")
            java.util.Map<String, NetworkMessage> pending =
                    (java.util.Map<String, NetworkMessage>) pendingField.get(manager);
            NetworkMessage rejected = new NetworkMessage(MessageType.LEVEL_DATA, "{\"publisherRebase\":true}");
            rejected.requestId = "publisher-rebase-rejected-001";
            pending.put(rejected.requestId, rejected);

            NetworkMessage error = new NetworkMessage(MessageType.ERROR,
                    "{\"error\":\"INVALID_PUBLISHER_REBASE_SNAPSHOT\"}");
            error.requestId = rejected.requestId;
            error.sequence = 12L;
            manager.onMessageReceived(error);

            Assert.assertEquals(-1L, sentTermField.getLong(manager));
            Assert.assertFalse(rebaseRequests.containsKey(rejected.requestId));
            Assert.assertFalse(pending.containsKey(rejected.requestId));
            Assert.assertTrue("A rejected rebase must request an authoritative snapshot",
                    sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));
        } finally {
            manager.endSession();
        }
    }

    @Test
    public void publisherRoleMovesOnlyOnANewerServerGeneration() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        NetworkTransport transport = new NetworkTransport() {
            private boolean connected;

            @Override public void connect(String endpoint, TransportCallback callback) {
                connected = true;
                if (callback != null) callback.onConnected();
            }

            @Override public void send(NetworkMessage message) {}
            @Override public void disconnect() { connected = false; }
            @Override public boolean isConnected() { return connected; }
            @Override public String getTransportType() { return "TEST"; }
        };

        manager.startSession("publisher-handoff-test", "local-player", transport);
        try {
            manager.applyLevelPublisherChange("local-player", 4L);
            Assert.assertTrue(manager.isLevelPublisher());
            Assert.assertEquals("local-player", manager.getLevelPublisherId());
            Assert.assertEquals(4L, manager.getLevelPublisherTerm());

            // A delayed control packet from the previous generation cannot reclaim authority.
            manager.applyLevelPublisherChange("old-publisher", 3L);
            Assert.assertTrue(manager.isLevelPublisher());
            Assert.assertEquals(4L, manager.getLevelPublisherTerm());

            manager.applyLevelPublisherChange("replacement-publisher", 5L);
            Assert.assertFalse(manager.isLevelPublisher());
            Assert.assertEquals("replacement-publisher", manager.getLevelPublisherId());
            Assert.assertEquals(5L, manager.getLevelPublisherTerm());

            // A different owner cannot be installed under the same generation.
            manager.applyLevelPublisherChange("stale-same-term", 5L);
            Assert.assertEquals("replacement-publisher", manager.getLevelPublisherId());

            manager.applyLevelPublisherChange(null, 6L);
            Assert.assertFalse(manager.isLevelPublisher());
            Assert.assertNull(manager.getLevelPublisherId());
            Assert.assertEquals(6L, manager.getLevelPublisherTerm());
        } finally {
            manager.endSession();
        }
    }
}
