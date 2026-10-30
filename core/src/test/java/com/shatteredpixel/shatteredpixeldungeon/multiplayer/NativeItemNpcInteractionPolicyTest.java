package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Blacksmith;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Ghost;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Imp;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Shopkeeper;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Wandmaker;
import org.junit.Assert;
import org.junit.Test;

public class NativeItemNpcInteractionPolicyTest {
    @Test
    public void shopkeeperRemainsAvailableForItsDedicatedEconomyTransactions() {
        Assert.assertTrue(MultiplayerActionDispatcher.supportsMultiplayerNpcInteraction(Shopkeeper.class));
    }

    @Test
    public void questNpcInteractionsAreRejectedBeforeUnvalidatedItemRewardsOrTransforms() {
        Assert.assertFalse(MultiplayerActionDispatcher.supportsMultiplayerNpcInteraction(Blacksmith.class));
        Assert.assertFalse(MultiplayerActionDispatcher.supportsMultiplayerNpcInteraction(Ghost.class));
        Assert.assertFalse(MultiplayerActionDispatcher.supportsMultiplayerNpcInteraction(Wandmaker.class));
        Assert.assertFalse(MultiplayerActionDispatcher.supportsMultiplayerNpcInteraction(Imp.class));
        Assert.assertFalse(MultiplayerActionDispatcher.supportsMultiplayerNpcInteraction(null));
    }
}
