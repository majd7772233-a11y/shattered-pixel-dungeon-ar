/*
 * Shattered Pixel Dungeon multiplayer run progress persistence.
 *
 * This file is part of the Shattered Pixel Dungeon project and is distributed
 * under the GNU General Public License, version 3 or later.
 */
package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Badges;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.Statistics;
import com.shatteredpixel.shatteredpixeldungeon.items.Generator;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.rings.Ring;
import com.shatteredpixel.shatteredpixeldungeon.journal.Catalog;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.secret.SecretRoom;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.special.SpecialRoom;
import com.watabou.utils.Bundle;
import com.watabou.utils.SparseArray;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;

/**
 * Lossless, opaque-to-the-server native state that controls future run rewards and generation.
 * It is stored with a player Hero and restored only into Dungeon.hero; remote Hero replicas must
 * never overwrite the local device's static run state.
 */
public final class MultiplayerRunProgress {

    public static final int MAX_ENCODED_LENGTH = 200000;
    private static final int VERSION = 1;

    private static final String STATISTICS = "statistics";
    private static final String CATALOG = "catalog";
    private static final String BADGES = "badges";
    private static final String GENERATOR = "generator";
    private static final String LIMITED_DROPS = "limitedDrops";
    private static final String SPECIAL_ROOMS = "specialRooms";
    private static final String SECRET_ROOMS = "secretRooms";
    private static final String RING_STATUS = "ringStatus";
    private static final String CHAPTERS = "chapters";
    private static final String GENERATED_LEVELS = "generatedLevels";
    private static final String DROPPED_DEPTHS = "droppedDepths";
    private static final String DROPPED_ITEMS_PREFIX = "droppedItems_";
    private static final String QUICK_SLOT_PLACEHOLDERS = "quickslotPlaceholders";

    private MultiplayerRunProgress() {}

    /** Captures only native SPD run state; Hero equipment and inventory remain in Belongings. */
    public static String store() {
        Bundle state = new Bundle();
        state.put("version", VERSION);

        Bundle statistics = new Bundle();
        Statistics.storeInBundle(statistics);
        state.put(STATISTICS, statistics);

        Bundle catalog = new Bundle();
        Catalog.store(catalog);
        state.put(CATALOG, catalog);

        Bundle badges = new Bundle();
        Badges.saveLocal(badges);
        state.put(BADGES, badges);

        Bundle generator = new Bundle();
        Generator.storeInBundle(generator);
        state.put(GENERATOR, generator);

        Bundle limitedDrops = new Bundle();
        Dungeon.LimitedDrops.store(limitedDrops);
        state.put(LIMITED_DROPS, limitedDrops);

        Bundle specialRooms = new Bundle();
        SpecialRoom.storeRoomsInBundle(specialRooms);
        state.put(SPECIAL_ROOMS, specialRooms);

        Bundle secretRooms = new Bundle();
        SecretRoom.storeRoomsInBundle(secretRooms);
        state.put(SECRET_ROOMS, secretRooms);

        state.put(RING_STATUS, Ring.multiplayerStatusBundle());

        int[] chapterIds = new int[Dungeon.chapters == null ? 0 : Dungeon.chapters.size()];
        if (Dungeon.chapters != null) {
            int index = 0;
            for (Integer chapter : Dungeon.chapters) chapterIds[index++] = chapter;
        }
        state.put(CHAPTERS, chapterIds);

        int[] generated = new int[Dungeon.generatedLevels == null ? 0 : Dungeon.generatedLevels.size()];
        if (Dungeon.generatedLevels != null) {
            for (int i = 0; i < generated.length; i++) generated[i] = Dungeon.generatedLevels.get(i);
        }
        state.put(GENERATED_LEVELS, generated);

        int[] droppedDepths = Dungeon.droppedItems == null ? new int[0] : Dungeon.droppedItems.keyArray();
        state.put(DROPPED_DEPTHS, droppedDepths);
        if (Dungeon.droppedItems != null) {
            for (int depth : droppedDepths) {
                ArrayList<Item> items = Dungeon.droppedItems.get(depth);
                if (items != null) state.put(DROPPED_ITEMS_PREFIX + depth, items);
            }
        }

        Bundle placeholders = new Bundle();
        if (Dungeon.quickslot != null) Dungeon.quickslot.storePlaceholders(placeholders);
        state.put(QUICK_SLOT_PLACEHOLDERS, placeholders);

        return state.toString();
    }

    /** Performs native Bundle and collection preflight before any live run state is changed. */
    public static boolean isValid(String encoded) {
        if (encoded == null || encoded.isEmpty() || encoded.length() > MAX_ENCODED_LENGTH) return false;
        Bundle state = read(encoded);
        if (state == null || state.getInt("version") != VERSION) return false;

        for (String key : new String[]{STATISTICS, CATALOG, BADGES, GENERATOR, LIMITED_DROPS,
                SPECIAL_ROOMS, SECRET_ROOMS, QUICK_SLOT_PLACEHOLDERS}) {
            if (!state.contains(key) || state.getBundle(key) == null || state.getBundle(key).isNull()) return false;
        }
        String ringStatus = state.getString(RING_STATUS);
        if (ringStatus == null || ringStatus.length() > 20000) return false;
        if (!ringStatus.isEmpty() && read(ringStatus) == null) return false;

        int[] chapters = state.getIntArray(CHAPTERS);
        int[] generated = state.getIntArray(GENERATED_LEVELS);
        int[] droppedDepths = state.getIntArray(DROPPED_DEPTHS);
        if (chapters == null || chapters.length > 128
                || generated == null || generated.length > 256
                || droppedDepths == null || droppedDepths.length > 26) return false;

        HashSet<Integer> seenDepths = new HashSet<>();
        for (int depth : droppedDepths) {
            if (depth < 1 || depth > 26 || !seenDepths.add(depth)
                    || !state.contains(DROPPED_ITEMS_PREFIX + depth)) return false;
            Collection<?> items = state.getCollection(DROPPED_ITEMS_PREFIX + depth);
            if (items == null || items.size() > 512) return false;
        }
        return true;
    }

    /** Applies a preflighted run-state bundle. Repeated restoration replaces state, never adds rewards. */
    public static void restore(String encoded) {
        if (!isValid(encoded)) throw new IllegalStateException("Invalid native multiplayer run progress bundle");
        Bundle state = read(encoded);

        Statistics.restoreFromBundle(state.getBundle(STATISTICS));
        Catalog.restore(state.getBundle(CATALOG));
        Badges.loadLocal(state.getBundle(BADGES));
        Generator.restoreFromBundle(state.getBundle(GENERATOR));
        Dungeon.LimitedDrops.restore(state.getBundle(LIMITED_DROPS));
        SpecialRoom.restoreRoomsFromBundle(state.getBundle(SPECIAL_ROOMS));
        SecretRoom.restoreRoomsFromBundle(state.getBundle(SECRET_ROOMS));

        String ringStatus = state.getString(RING_STATUS);
        if (!ringStatus.isEmpty()) Ring.restoreMultiplayerStatusBundle(read(ringStatus));

        Dungeon.chapters = new HashSet<>();
        for (int chapter : state.getIntArray(CHAPTERS)) Dungeon.chapters.add(chapter);

        Dungeon.generatedLevels = new ArrayList<>();
        for (int depth : state.getIntArray(GENERATED_LEVELS)) Dungeon.generatedLevels.add(depth);

        Dungeon.droppedItems = new SparseArray<>();
        for (int depth : state.getIntArray(DROPPED_DEPTHS)) {
            ArrayList<Item> items = new ArrayList<>();
            for (Object value : state.getCollection(DROPPED_ITEMS_PREFIX + depth)) {
                if (!(value instanceof Item)) {
                    throw new IllegalStateException("Invalid dropped native item in run progress");
                }
                items.add((Item)value);
            }
            if (!items.isEmpty()) Dungeon.droppedItems.put(depth, items);
        }

        Bundle placeholders = state.getBundle(QUICK_SLOT_PLACEHOLDERS);
        if (Dungeon.quickslot != null) Dungeon.quickslot.restorePlaceholders(placeholders);
    }

    private static Bundle read(String encoded) {
        if (encoded == null || encoded.isEmpty()) return null;
        try {
            return Bundle.read(new ByteArrayInputStream(encoded.getBytes(StandardCharsets.UTF_8)));
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }
}
