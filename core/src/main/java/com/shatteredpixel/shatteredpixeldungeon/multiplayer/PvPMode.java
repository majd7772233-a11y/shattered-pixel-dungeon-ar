package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public class PvPMode implements GameMode {

    @Override
    public String getModeName() {
        return "PVP_ARENA";
    }

    @Override
    public boolean isFriendlyFireAllowed() {
        return true;
    }

    @Override
    public boolean isReviveAllowed() {
        return false;
    }

    @Override
    public boolean isSharedMapEnabled() {
        return false;
    }

    @Override
    public int getMaxPlayers() {
        return 4;
    }
}
