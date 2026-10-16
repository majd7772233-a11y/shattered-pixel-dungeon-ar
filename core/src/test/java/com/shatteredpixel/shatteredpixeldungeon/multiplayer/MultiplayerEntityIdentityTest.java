package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

public class MultiplayerEntityIdentityTest {

    @Test
    public void serverEntityIdentityMapsToLocalActorWithoutTreatingIdsAsEqual() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        int localActorId = 987654;
        String serverEntityId = "server-entity-test-0001";

        manager.registerServerEntityId(localActorId, serverEntityId);

        Assert.assertEquals(serverEntityId, manager.getServerEntityId(localActorId));
        Assert.assertEquals(Integer.valueOf(localActorId), manager.getLocalActorIdForServerEntity(serverEntityId));
        Assert.assertNull(manager.getLocalActorIdForServerEntity(String.valueOf(localActorId)));
    }

    @Test
    public void reassignmentRemovesStaleForwardAndReverseMappings() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        int firstActorId = 987655;
        int secondActorId = 987656;
        String firstEntityId = "server-entity-test-0002";
        String secondEntityId = "server-entity-test-0003";

        manager.registerServerEntityId(firstActorId, firstEntityId);
        manager.registerServerEntityId(firstActorId, secondEntityId);
        Assert.assertNull(manager.getLocalActorIdForServerEntity(firstEntityId));
        Assert.assertEquals(secondEntityId, manager.getServerEntityId(firstActorId));

        manager.registerServerEntityId(secondActorId, secondEntityId);
        Assert.assertNull(manager.getServerEntityId(firstActorId));
        Assert.assertEquals(Integer.valueOf(secondActorId), manager.getLocalActorIdForServerEntity(secondEntityId));
    }

    @Test
    public void rejectsMalformedServerEntityIds() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        int actorId = 987657;
        manager.registerServerEntityId(actorId, "short");
        Assert.assertNull(manager.getServerEntityId(actorId));
    }
}
