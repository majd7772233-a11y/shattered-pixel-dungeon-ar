package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroAction;

public class MultiplayerActionDispatcher {

    public static void onHeroPerformAction(HeroAction action) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()) {
            return;
        }

        NetworkActionType actionType = NetworkActionBridge.mapHeroActionToNetworkAction(action);
        String actionDetailsJson = "{\"pos\":" + (Dungeon.hero != null ? Dungeon.hero.pos : 0) + "}";

        manager.sendAction(actionType, actionDetailsJson);
    }
}
