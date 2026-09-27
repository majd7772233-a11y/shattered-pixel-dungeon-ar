package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public interface GameMode {
    String getModeName();
    boolean isFriendlyFireAllowed();
    boolean isReviveAllowed();
    boolean isAutoRespawnAllowed();
    boolean isSharedMapEnabled();
    String getDeathBehavior(); // "REVIVE_OR_GAMEOVER", "SPECTATOR", "AUTO_RESPAWN"
    int getMaxPlayers();
}
