package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroAction;

public class MultiplayerActionDispatcher {

    public static void onHeroPerformAction(HeroAction action) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive() || action == null) {
            return;
        }

        NetworkActionType actionType = NetworkActionBridge.mapHeroActionToNetworkAction(action);
        int currentPos = Dungeon.hero != null ? Dungeon.hero.pos : 0;
        int targetPos = action.dst;
        int currentDepth = Dungeon.depth;

        String actionDetailsJson;
        if (action instanceof HeroAction.Attack) {
            HeroAction.Attack attackAction = (HeroAction.Attack) action;
            int targetId = attackAction.target != null ? attackAction.target.id() : 0;
            actionDetailsJson = "{\"from\":" + currentPos + ",\"to\":" + targetPos + ",\"targetPos\":" + targetPos + ",\"targetId\":" + targetId + ",\"depth\":" + currentDepth + "}";
        } else if (action instanceof HeroAction.PickUp || action instanceof HeroAction.OpenChest) {
            actionDetailsJson = "{\"from\":" + currentPos + ",\"to\":" + targetPos + ",\"itemPos\":" + targetPos + ",\"depth\":" + currentDepth + "}";
        } else if (action instanceof HeroAction.LvlTransition) {
            actionDetailsJson = "{\"from\":" + currentPos + ",\"to\":" + targetPos + ",\"stairsPos\":" + targetPos + ",\"depth\":" + currentDepth + "}";
        } else {
            actionDetailsJson = "{\"from\":" + currentPos + ",\"to\":" + targetPos + ",\"targetPos\":" + targetPos + ",\"depth\":" + currentDepth + "}";
        }

        manager.sendAction(actionType, actionDetailsJson);
    }
}
