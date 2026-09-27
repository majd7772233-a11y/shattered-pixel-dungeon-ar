package com.shatteredpixel.shatteredpixeldungeon.actors.hero;

public class RemoteHero extends Hero {

    public RemoteHero() {
        super();
        ready = false;
    }

    @Override
    public boolean act() {
        spend(TICK);
        return true;
    }
}
