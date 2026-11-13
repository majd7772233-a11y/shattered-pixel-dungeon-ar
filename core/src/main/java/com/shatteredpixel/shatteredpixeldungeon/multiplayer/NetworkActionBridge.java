package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroAction;

import java.util.Optional;

public class NetworkActionBridge {

    /** Maps only native HeroAction classes with an explicit multiplayer producer. */
    public static Optional<NetworkActionType> mapHeroActionToNetworkAction(HeroAction action) {
        if (action instanceof HeroAction.Move) return Optional.of(NetworkActionType.MOVE);
        if (action instanceof HeroAction.Attack) return Optional.of(NetworkActionType.ATTACK);
        if (action instanceof HeroAction.PickUp) return Optional.of(NetworkActionType.PICKUP);
        if (action instanceof HeroAction.OpenChest) return Optional.of(NetworkActionType.OPEN_CHEST);
        if (action instanceof HeroAction.Buy) return Optional.of(NetworkActionType.BUY);
        if (action instanceof HeroAction.Interact) return Optional.of(NetworkActionType.INTERACT);
        if (action instanceof HeroAction.Unlock) return Optional.of(NetworkActionType.UNLOCK);
        if (action instanceof HeroAction.LvlTransition) return Optional.of(NetworkActionType.LVL_TRANSITION);
        if (action instanceof HeroAction.Mine) return Optional.of(NetworkActionType.MINE);
        if (action instanceof HeroAction.Alchemy) return Optional.of(NetworkActionType.ALCHEMY);
        return Optional.empty();
    }
}
