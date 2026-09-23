package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;

import java.util.ArrayList;
import java.util.List;

public class MultiHeroManager {

    public static List<Char> getAllActiveHeroes() {
        List<Char> heroes = new ArrayList<>();
        if (Dungeon.hero != null && Dungeon.hero.isAlive()) {
            heroes.add(Dungeon.hero);
        }

        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (manager.isMultiplayerActive()) {
            for (RemotePlayer remote : manager.getRemotePlayers().values()) {
                if (remote.isAlive && remote.heroInstance != null) {
                    heroes.add(remote.heroInstance);
                }
            }
        }

        return heroes;
    }

    public static Char getClosestHero(int pos) {
        List<Char> heroes = getAllActiveHeroes();
        Char closest = null;
        int minDistance = Integer.MAX_VALUE;

        for (Char h : heroes) {
            int dist = Dungeon.level.distance(pos, h.pos);
            if (dist < minDistance) {
                minDistance = dist;
                closest = h;
            }
        }

        return closest;
    }
}
