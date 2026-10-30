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
    public void ringPickupKnowledgePolicyIsFailClosedAtThiefIntuitionTierTwo() {
        String ring = "com.shatteredpixel.shatteredpixeldungeon.items.rings.RingOfMight";
        String potion = "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
        Assert.assertTrue(MultiplayerActionDispatcher.supportsNativePickupKnowledge(ring, 0));
        Assert.assertTrue(MultiplayerActionDispatcher.supportsNativePickupKnowledge(ring, 1));
        Assert.assertFalse(MultiplayerActionDispatcher.supportsNativePickupKnowledge(ring, 2));
        Assert.assertTrue(MultiplayerActionDispatcher.supportsNativePickupKnowledge(potion, 2));
    }

    @Test
    public void unsupportedPotionSideEffectsAreRejectedBeforeLocalConsumption() {
        String invisibility = "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility";
        String levitation = "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation";
        String healing = "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
        Assert.assertFalse(NativeItemUse.supportsNativePotionUseState(invisibility,
                com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroSubClass.ASSASSIN,
                false, false, false, false, false));
        Assert.assertFalse(NativeItemUse.supportsNativePotionUseState(invisibility,
                null, true, false, false, false, false));
        Assert.assertTrue(NativeItemUse.supportsNativePotionUseState(invisibility,
                null, false, false, false, false, false));
        Assert.assertFalse(NativeItemUse.supportsNativePotionUseState(levitation,
                null, false, true, false, false, false));
        Assert.assertTrue(NativeItemUse.supportsNativePotionUseState(levitation,
                null, false, false, false, false, false));
        Assert.assertFalse(NativeItemUse.supportsNativePotionUseState(healing,
                null, false, false, true, false, false));
        Assert.assertFalse(NativeItemUse.supportsNativePotionUseState(healing,
                null, false, false, false, true, false));
        Assert.assertFalse(NativeItemUse.supportsNativePotionUseState(healing,
                null, false, false, false, false, true));
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
