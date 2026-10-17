package com.shatteredpixel.shatteredpixeldungeon.actors.hero;

import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager;

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
        // Only the native authority may resolve a blessed Ankh for a remote hero replica.
        if (MultiplayerManager.getInstance().isResolvingAuthorityCombat()
                && restoreBlessedAnkhForMultiplayerAuthority()) {
            ready = false;
            curAction = null;
            return;
        }
        HP = 0;
        ready = false;
        curAction = null;
    }
}
