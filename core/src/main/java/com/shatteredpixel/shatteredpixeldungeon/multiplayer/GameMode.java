package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public interface GameMode {
    String getModeName();
    boolean isFriendlyFireAllowed();
    boolean isReviveAllowed();
    boolean isSharedMapEnabled();
    int getMaxPlayers();
}
