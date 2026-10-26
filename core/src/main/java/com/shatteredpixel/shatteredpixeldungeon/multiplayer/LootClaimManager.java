package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Client-side duplicate-submit guard keyed by a concrete floor item instance.
 * Durable ownership is enforced atomically by the room authority.
 */
public final class LootClaimManager {
    private static final Map<String, String> claimedOwners = new ConcurrentHashMap<>();
    private LootClaimManager() {}

    private static boolean isValidStableId(String value) {
        return value != null && value.matches("[A-Za-z0-9._:-]{8,80}");
    }

    private static String key(int depth, int branch, String heapId, String itemId) {
        if (depth < 1 || depth > 100 || branch < 0 || branch > 32
                || !isValidStableId(heapId) || !isValidStableId(itemId)) return null;
        return depth + ":" + branch + ":" + heapId.length() + ":" + heapId
                + ":" + itemId.length() + ":" + itemId;
    }

    /** Compatibility overload for the only currently playable branch. */
    public static boolean tryClaimLoot(int depth, String heapId, String itemId, String playerId) {
        return tryClaimLoot(depth, 0, heapId, itemId, playerId);
    }

    public static boolean tryClaimLoot(int depth, int branch, String heapId, String itemId, String playerId) {
        String key = key(depth, branch, heapId, itemId);
        if (key == null || playerId == null || playerId.isEmpty() || playerId.length() > 80) return false;
        String owner = claimedOwners.putIfAbsent(key, playerId);
        return owner == null || owner.equals(playerId);
    }

    /** Compatibility overload for branch zero. */
    public static void releaseClaim(int depth, String heapId, String itemId, String playerId) {
        releaseClaim(depth, 0, heapId, itemId, playerId);
    }

    public static void releaseClaim(int depth, int branch, String heapId, String itemId, String playerId) {
        String key = key(depth, branch, heapId, itemId);
        if (key != null && playerId != null) claimedOwners.remove(key, playerId);
    }

    public static void clearDepth(int depth) {
        String prefix = depth + ":";
        for (String key : claimedOwners.keySet()) if (key.startsWith(prefix)) claimedOwners.remove(key);
    }

    public static void clearBranch(int depth, int branch) {
        String prefix = depth + ":" + branch + ":";
        for (String key : claimedOwners.keySet()) if (key.startsWith(prefix)) claimedOwners.remove(key);
    }

    public static void clear() {
        claimedOwners.clear();
    }
}
