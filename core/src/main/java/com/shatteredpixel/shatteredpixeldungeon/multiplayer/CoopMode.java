package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public class CoopMode implements GameMode {

    @Override
    public String getModeName() {
        return "COOP_DUNGEON";
    }

    @Override
    public boolean isFriendlyFireAllowed() {
        return false;
    }

    @Override
    public boolean isReviveAllowed() {
        return true;
    }

    @Override
    public boolean isSharedMapEnabled() {
        return true;
    }

    @Override
    public int getMaxPlayers() {
        return 4;
    }
}
