package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

public class MultiplayerManagerAuthorityHandoffTest {

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
