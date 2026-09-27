package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public class SurvivalMode implements GameMode {

    @Override
    public String getModeName() {
        return "SURVIVAL";
    }

    @Override
    public boolean isFriendlyFireAllowed() {
        return false;
    }

    @Override
    public boolean isReviveAllowed() {
        return false;
    }

    @Override
    public boolean isAutoRespawnAllowed() {
        return false;
    }

    @Override
    public boolean isSharedMapEnabled() {
        return true;
    }

    @Override
    public String getDeathBehavior() {
        return "SPECTATOR";
    }

    @Override
    public int getMaxPlayers() {
        return 4;
    }
}
