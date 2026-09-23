package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;

public class PlayerFOV {
    public String playerId;
    public boolean[] fieldOfView;

    public PlayerFOV(String playerId, int mapLength) {
        this.playerId = playerId;
        this.fieldOfView = new boolean[mapLength];
    }

    public void update(Hero hero) {
        if (hero != null && Dungeon.level != null) {
            Dungeon.level.updateFieldOfView(hero, fieldOfView);
        }
    }
}
