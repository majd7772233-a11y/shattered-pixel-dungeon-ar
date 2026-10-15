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
            // Combat is sent after Hero.attack resolves it through the native SPD engine.
            // Sending the target intent here would cause the server to resolve a second, generic attack.
            return;
        } else if (action instanceof HeroAction.PickUp || action instanceof HeroAction.OpenChest) {
            actionDetailsJson = "{\"from\":" + currentPos + ",\"to\":" + targetPos + ",\"itemPos\":" + targetPos + ",\"depth\":" + currentDepth + "}";
        } else if (action instanceof HeroAction.LvlTransition) {
            actionDetailsJson = "{\"from\":" + currentPos + ",\"to\":" + targetPos + ",\"stairsPos\":" + targetPos + ",\"depth\":" + currentDepth + "}";
        } else {
            actionDetailsJson = "{\"from\":" + currentPos + ",\"to\":" + targetPos + ",\"targetPos\":" + targetPos + ",\"depth\":" + currentDepth + "}";
        }

        if (actionType == NetworkActionType.MOVE && Dungeon.hero != null && Dungeon.hero.speed() > 0f) {
            actionDetailsJson = actionDetailsJson.substring(0, actionDetailsJson.length() - 1)
                    + ",\"engineActionCost\":" + (1f / Dungeon.hero.speed()) + "}";
        }
        manager.sendAction(actionType, actionDetailsJson);
    }
}
