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

        String actionDetailsJson = "{\"from\":" + currentPos + ",\"to\":" + targetPos + ",\"targetPos\":" + targetPos + "}";

        manager.sendAction(actionType, actionDetailsJson);
    }
}
