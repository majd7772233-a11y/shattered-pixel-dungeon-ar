package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.HashSet;
import java.util.Set;

public class LootClaimManager {
    private static LootClaimManager instance;
    private final Set<Integer> claimedLootPositions = new HashSet<>();

    private LootClaimManager() {}

    public static synchronized LootClaimManager getInstance() {
        if (instance == null) {
            instance = new LootClaimManager();
        }
        return instance;
    }

    public synchronized boolean tryClaimLoot(int pos, String playerId) {
        if (claimedLootPositions.contains(pos)) {
            return false;
        }
        claimedLootPositions.add(pos);
        return true;
    }

    public synchronized void releaseClaim(int pos) {
        claimedLootPositions.remove(pos);
    }

    public synchronized void clear() {
        claimedLootPositions.clear();
    }
}
