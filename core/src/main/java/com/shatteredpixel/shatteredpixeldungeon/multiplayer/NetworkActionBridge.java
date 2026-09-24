package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroAction;

public class NetworkActionBridge {

    public static NetworkActionType mapHeroActionToNetworkAction(HeroAction action) {
        if (action instanceof HeroAction.Move) {
            return NetworkActionType.MOVE;
        } else if (action instanceof HeroAction.Attack) {
            return NetworkActionType.ATTACK;
        } else if (action instanceof HeroAction.PickUp) {
            return NetworkActionType.PICKUP;
        } else if (action instanceof HeroAction.OpenChest) {
            return NetworkActionType.OPEN_CHEST;
        } else if (action instanceof HeroAction.Buy) {
            return NetworkActionType.BUY;
        } else if (action instanceof HeroAction.Interact) {
            return NetworkActionType.INTERACT;
        } else if (action instanceof HeroAction.Unlock) {
            return NetworkActionType.UNLOCK;
        } else if (action instanceof HeroAction.LvlTransition) {
            return NetworkActionType.LVL_TRANSITION;
        } else if (action instanceof HeroAction.Mine) {
            return NetworkActionType.MINE;
        } else if (action instanceof HeroAction.Alchemy) {
            return NetworkActionType.ALCHEMY;
        }
        return NetworkActionType.WAIT;
    }
}
