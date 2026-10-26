package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.watabou.utils.Bundle;
import org.junit.Assert;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MultiplayerItemIdentityTest {
    private static Bundle readBundle(String encoded) throws Exception {
        return Bundle.read(new ByteArrayInputStream(encoded.getBytes(StandardCharsets.UTF_8)));
    }

    private static Map<String, Object> floorItem(Item item, String rowId) {
        Bundle bundle = new Bundle();
        bundle.put("item", item);
        Map<String, Object> row = new HashMap<>();
        row.put("itemId", rowId);
        row.put("className", item.getClass().getName());
        row.put("quantity", item.quantity());
        row.put("level", item.level());
        row.put("cursed", item.cursed);
        row.put("cursedKnown", item.cursedKnown);
        row.put("stackable", item.stackable);
        row.put("serializedBundle", bundle.toString());
        return row;
    }

    private static Map<String, Object> floorHeap(String heapId, int pos, List<Map<String, Object>> items) {
        Map<String, Object> heap = new HashMap<>();
        heap.put("heapId", heapId);
        heap.put("pos", pos);
        heap.put("type", "HEAP");
        heap.put("seen", false);
        heap.put("haunted", false);
        heap.put("hidden", false);
        heap.put("autoExplored", false);
        heap.put("items", items);
        return heap;
    }

    @Test
    public void itemIdSurvivesNativeBundleRoundTripAndSplitCreatesDistinctInstances() throws Exception {
        Item source = new Item();
        source.stackable = true;
        source.quantity(5);
        String originalId = source.multiplayerItemId();
        Bundle wrapper = new Bundle();
        wrapper.put("item", source);
        Item restored = (Item) readBundle(wrapper.toString()).get("item");
        Assert.assertEquals(originalId, restored.multiplayerItemId());

        Item duplicate = source.duplicate();
        Assert.assertNotEquals(originalId, duplicate.multiplayerItemId());
        Item split = source.split(2);
        Assert.assertEquals(originalId, source.multiplayerItemId());
        Assert.assertEquals(3, source.quantity());
        Assert.assertEquals(2, split.quantity());
        Assert.assertNotEquals(source.multiplayerItemId(), split.multiplayerItemId());
        Assert.assertTrue(Item.isValidMultiplayerItemId(source.multiplayerItemId()));
        Assert.assertFalse(Item.isValidMultiplayerItemId("bad/id"));
        Assert.assertFalse(Item.isValidMultiplayerItemId("short"));
    }

    @Test
    public void heapIdSurvivesBundleRoundTripAndMalformedIdCannotReplaceIt() throws Exception {
        Heap heap = new Heap();
        heap.type = Heap.Type.HEAP;
        heap.pos = 9;
        heap.setMultiplayerHeapId("stable-heap-0001");
        String id = heap.multiplayerHeapId();
        heap.setMultiplayerHeapId("bad/id");
        Assert.assertEquals(id, heap.multiplayerHeapId());

        Bundle wrapper = new Bundle();
        wrapper.put("heap", heap);
        Heap restored = (Heap) readBundle(wrapper.toString()).get("heap");
        Assert.assertEquals(id, restored.multiplayerHeapId());
        Assert.assertTrue(Heap.isValidMultiplayerHeapId(id));
        Assert.assertFalse(Heap.isValidMultiplayerHeapId("short"));
    }

    @Test
    public void completeNativeFloorSnapshotRequiresUniqueHeapAndItemIdsMatchingNativeBundles() {
        Item first = new Item();
        first.quantity(2);
        first.setMultiplayerItemId("stable-item-0001");
        Map<String, Object> firstRow = floorItem(first, first.multiplayerItemId());
        Assert.assertTrue(WorldSnapshot.hasValidStableHeapItemIdentities(Arrays.asList(
                floorHeap("stable-heap-0001", 9, Arrays.asList(firstRow)))));

        Item second = new Item();
        second.setMultiplayerItemId("stable-item-0002");
        Map<String, Object> secondRow = floorItem(second, second.multiplayerItemId());
        Assert.assertFalse(WorldSnapshot.hasValidStableHeapItemIdentities(Arrays.asList(
                floorHeap("stable-heap-0001", 9, Arrays.asList(firstRow)),
                floorHeap("stable-heap-0001", 10, Arrays.asList(secondRow)))));
        Assert.assertFalse(WorldSnapshot.hasValidStableHeapItemIdentities(Arrays.asList(
                floorHeap("stable-heap-0001", 9, Arrays.asList(firstRow)),
                floorHeap("stable-heap-0002", 10, Arrays.asList(floorItem(second, first.multiplayerItemId()))))));

        Map<String, Object> missingItemId = new HashMap<>(firstRow);
        missingItemId.remove("itemId");
        Assert.assertFalse(WorldSnapshot.hasValidStableHeapItemIdentities(Arrays.asList(
                floorHeap("stable-heap-0001", 9, Arrays.asList(missingItemId)))));
        Assert.assertFalse(WorldSnapshot.hasValidStableHeapItemIdentities(Arrays.asList(
                floorHeap("bad/id", 9, Arrays.asList(firstRow)))));

        Item substringItem = new Item();
        substringItem.setMultiplayerItemId("stable-item-0001-extra");
        Map<String, Object> substringMismatch = floorItem(substringItem, "stable-item-0001");
        Assert.assertTrue(((String) substringMismatch.get("serializedBundle")).contains("stable-item-0001"));
        Assert.assertFalse(WorldSnapshot.hasValidStableHeapItemIdentities(Arrays.asList(
                floorHeap("stable-heap-0001", 9, Arrays.asList(substringMismatch)))));
    }

    @Test
    public void clientLootClaimsAreScopedToDepthBranchHeapAndItemAndReleaseOnlyTheirOwner() {
        LootClaimManager.clear();
        String heapId = "stable-heap-0001", itemId = "stable-item-0001";
        Assert.assertTrue(LootClaimManager.tryClaimLoot(4, 0, heapId, itemId, "player-a"));
        Assert.assertTrue(LootClaimManager.tryClaimLoot(4, 0, heapId, itemId, "player-a"));
        Assert.assertFalse(LootClaimManager.tryClaimLoot(4, 0, heapId, itemId, "player-b"));
        Assert.assertTrue(LootClaimManager.tryClaimLoot(5, 0, heapId, itemId, "player-b"));
        Assert.assertTrue(LootClaimManager.tryClaimLoot(4, 1, heapId, itemId, "player-b"));

        LootClaimManager.releaseClaim(4, 0, heapId, itemId, "player-b");
        Assert.assertFalse(LootClaimManager.tryClaimLoot(4, 0, heapId, itemId, "player-b"));
        LootClaimManager.clearBranch(4, 0);
        Assert.assertTrue(LootClaimManager.tryClaimLoot(4, 0, heapId, itemId, "player-b"));
        LootClaimManager.clearDepth(4);
        Assert.assertTrue(LootClaimManager.tryClaimLoot(4, 0, heapId, itemId, "player-b"));
        LootClaimManager.clear();
    }
}
