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

    @Override
    public void die(Object cause) {
        // This is only a remote combat replica. Running Hero.die() here would consume a
        // remote Ankh, alter local statistics, show local resurrection UI, and duplicate
        // death side effects. The owning client/server outcome reconciles this replica.
        HP = 0;
        ready = false;
        curAction = null;
    }
}
