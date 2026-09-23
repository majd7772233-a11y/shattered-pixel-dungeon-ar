package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import java.util.HashMap;
import java.util.Map;

public class RemotePlayer {
    public String playerId;
    public String name;
    public String heroClass;
    public int pos;
    public int hp;
    public int ht;
    public boolean isAlive = true;

    public Hero heroInstance;

    public RemotePlayer(String playerId, String name, String heroClass) {
        this.playerId = playerId;
        this.name = name;
        this.heroClass = heroClass;
    }
}
