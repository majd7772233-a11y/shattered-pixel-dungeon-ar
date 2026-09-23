package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.HashMap;
import java.util.Map;

public class WorldSnapshot {
    public long sequence;
    public int depth;
    public long dungeonSeed;
    public Map<String, Integer> playerPositions = new HashMap<>();
    public Map<String, Integer> playerHp = new HashMap<>();

    public WorldSnapshot() {}

    public WorldSnapshot(long sequence, int depth, long dungeonSeed) {
        this.sequence = sequence;
        this.depth = depth;
        this.dungeonSeed = dungeonSeed;
    }
}
