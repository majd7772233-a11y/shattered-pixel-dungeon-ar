package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Client-side duplicate-submit guard keyed by the exact floor loot instance.
 * Durable ownership claims are enforced by the room authority in the Worker database.
 */
public final class LootClaimManager {

    private static final Map<String, String> claimedOwners = new ConcurrentHashMap<>();

    private LootClaimManager() {}

    private static String key(int depth, String heapId, String itemId) {
        if (depth < 1 || depth > 100 || heapId == null || heapId.length() < 8 || heapId.length() > 80
                || itemId == null || itemId.length() < 8 || itemId.length() > 80) return null;
        return depth + ":" + heapId + ":" + itemId;
    }

    public static boolean tryClaimLoot(int depth, String heapId, String itemId, String playerId) {
        String key = key(depth, heapId, itemId);
        if (key == null || playerId == null || playerId.isEmpty()) return false;
        String owner = claimedOwners.putIfAbsent(key, playerId);
        return owner == null || owner.equals(playerId);
    }

    public static void releaseClaim(int depth, String heapId, String itemId, String playerId) {
        String key = key(depth, heapId, itemId);
        if (key != null && playerId != null) claimedOwners.remove(key, playerId);
    }

    public static void clearDepth(int depth) {
        String prefix = depth + ":";
        for (String key : claimedOwners.keySet()) if (key.startsWith(prefix)) claimedOwners.remove(key);
    }

    public static void clear() {
        claimedOwners.clear();
    }
}
