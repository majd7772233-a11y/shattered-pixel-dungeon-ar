package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

public class NativeCombatAuthorityPolicyTest {
    @Test
    public void localAttackerPublishesMobAndRemoteHeroOutcomes() {
        Assert.assertTrue(NativeCombatAuthorityPolicy.shouldPublishAttackOutcome(true, true, false, true, false, false));
        Assert.assertTrue(NativeCombatAuthorityPolicy.shouldPublishAttackOutcome(true, true, false, false, true, false));
    }

    @Test
    public void targetOwnerPublishesAuthoritySimulationAgainstItsLocalHero() {
        Assert.assertTrue(NativeCombatAuthorityPolicy.shouldPublishAttackOutcome(true, false, true, false, false, true));
    }

    @Test
    public void unrelatedLocalTargetsAndInactiveSessionsDoNotPublish() {
        Assert.assertFalse(NativeCombatAuthorityPolicy.shouldPublishAttackOutcome(true, true, false, false, false, true));
        Assert.assertFalse(NativeCombatAuthorityPolicy.shouldPublishAttackOutcome(false, true, false, true, false, false));
        Assert.assertFalse(NativeCombatAuthorityPolicy.shouldPublishAttackOutcome(true, false, false, true, false, false));
    }
}
