package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public class DeathmatchMode implements GameMode {

    @Override
    public String getModeName() {
        return "DEATHMATCH";
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
    public boolean isAutoRespawnAllowed() {
        return true;
    }

    @Override
    public boolean isSharedMapEnabled() {
        return false;
    }

    @Override
    public String getDeathBehavior() {
        return "AUTO_RESPAWN";
    }

    @Override
    public int getMaxPlayers() {
        return 6;
    }
}
