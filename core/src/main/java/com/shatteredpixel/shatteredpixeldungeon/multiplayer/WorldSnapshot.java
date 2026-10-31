package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.QuickSlot;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.HeroSprite;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.noosa.Game;
import com.watabou.utils.Bundle;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Blob;
import com.shatteredpixel.shatteredpixeldungeon.plants.Plant;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.io.IOException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class WorldSnapshot {
    private static volatile WorldSnapshot lastAppliedSnapshot;
    private static volatile String lastRollbackCaptureDiagnostic = "not run";
    /** True only for a local rollback copy; never serialized on the wire. */
    private boolean localRollbackBaseline;

    public long sequence;
    /** Last server-accepted shared Actor turn; carried through reconnect/resync snapshots. */
    public long nativeWorldTurnCounter;
    public int depth = 1;
    public int branch;
    public long dungeonSeed;
    public boolean levelLocked;
    public String levelFeeling = "NONE";
    public String nativeLevelMetadataBundle = "";
    public List<Integer> visitedPositions = new ArrayList<>();
    public List<Integer> mappedPositions = new ArrayList<>();
    public String gameMode = "COOP_DUNGEON";
    /** True only when the payload explicitly contains the complete level snapshot contract. */
    public boolean completeWorldSnapshot;
    public int levelWidth;
    public int levelHeight;
    public int entrancePos = -1;
    public int exitPos = -1;
    public List<Map<String, Object>> tiles = new ArrayList<>();

    public Map<String, Integer> playerPositions = new HashMap<>();
    public Map<String, Integer> playerHp = new HashMap<>();
    public Map<String, Integer> playerHt = new HashMap<>();
    public Map<String, String> playerClasses = new HashMap<>();

    public List<Map<String, Object>> mobs = new ArrayList<>();
    public List<Map<String, Object>> heaps = new ArrayList<>();
    public List<Map<String, Object>> traps = new ArrayList<>();
    public List<Map<String, Object>> blobs = new ArrayList<>();
    public List<Map<String, Object>> plants = new ArrayList<>();
    public List<Map<String, Object>> transitions = new ArrayList<>();
    public Map<String, String> playerStateJson = new HashMap<>();

    public WorldSnapshot() {}

    public WorldSnapshot(long sequence, int depth, long dungeonSeed) {
        this.sequence = sequence;
        this.depth = depth;
        this.dungeonSeed = dungeonSeed;
    }

    @SuppressWarnings("unchecked")
    private static void restoreMobBuffs(Char mob, Map<String, Object> data) {
        Object raw = data.get("buffs");
        if (!(raw instanceof List)) return;
        for (Buff old : new java.util.ArrayList<>(mob.buffs())) old.detach();
        for (Object value : (List<?>) raw) {
            if (!(value instanceof Map)) continue;
            Map<String, Object> buffData = (Map<String, Object>) value;
            String encoded = String.valueOf(buffData.get("serializedBundle"));
            Bundle bundle = readBundle(encoded);
            if (bundle == null) continue;
            try {
                Buff buff = (Buff) bundle.get("buff");
                if (buff != null) {
                    buff.attachTo(mob);
                    buff.restoreMultiplayerCooldown(floatNumber(buffData.get("cooldown"), 0f));
                }
            } catch (RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
        }
    }

    /** Applies the exact native buff bundles captured after combat to a local replica. */
    public static void restoreNativeCombatBuffs(Char character, String encodedBuffs) {
        if (character == null || encodedBuffs == null || encodedBuffs.isEmpty()) return;
        if (encodedBuffs.length() > 200000) throw new IllegalArgumentException("Combat buff payload is oversized");
        JsonValue root = new JsonReader().parse(encodedBuffs);
        if (root == null || !root.isArray() || root.size > 256) {
            throw new IllegalArgumentException("Invalid native combat buff payload");
        }
        List<Buff> preparedBuffs = new ArrayList<>();
        List<Float> preparedCooldowns = new ArrayList<>();
        for (JsonValue value = root.child; value != null; value = value.next) {
            if (!value.isObject()) throw new IllegalArgumentException("Invalid native combat buff entry");
            JsonValue bundleValue = value.get("serializedBundle");
            JsonValue cooldownValue = value.get("cooldown");
            if (bundleValue == null || !bundleValue.isString() || bundleValue.asString().isEmpty()
                    || bundleValue.asString().length() > 200000 || cooldownValue == null
                    || !cooldownValue.isNumber() || cooldownValue.asFloat() < 0f
                    || cooldownValue.asFloat() > 100000f) {
                throw new IllegalArgumentException("Invalid native combat buff bundle");
            }
            Bundle buffBundle = readBundle(bundleValue.asString());
            Object decoded = buffBundle == null ? null : buffBundle.get("buff");
            if (!(decoded instanceof Buff)) throw new IllegalArgumentException("Native combat bundle did not contain a Buff");
            preparedBuffs.add((Buff) decoded);
            preparedCooldowns.add(cooldownValue.asFloat());
        }
        // Prepare every native object before mutating the current state.
        for (Buff old : new java.util.ArrayList<>(character.buffs())) old.detach();
        for (int i = 0; i < preparedBuffs.size(); i++) {
            Buff buff = preparedBuffs.get(i);
            buff.attachTo(character);
            buff.restoreMultiplayerCooldown(preparedCooldowns.get(i));
        }
    }

    /** Removes a replicated dead mob without re-running native death, rewards, or loot rolls. */
    public static void removeMobReplicaWithoutRewards(com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob) {
        if (mob == null) return;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.removeServerEntityIdForActor(mob.id());
        if (Dungeon.level != null) Dungeon.level.mobs.remove(mob);
        Actor.remove(mob);
        for (Buff oldBuff : new java.util.ArrayList<>(mob.buffs())) oldBuff.detach();
        if (mob.sprite != null) mob.sprite.remove();
    }

    /** Restores class/subclass, native combat stats, equipment, talents and buffs on a remote hero. */
    public static void restoreRemoteHeroState(Hero hero, String encodedState) {
        restoreHeroState(hero, encodedState);
    }

    private static final class QuickSlotRestoreEntry {
        final int slot;
        final String itemId;
        final String className;
        final Item decodedItem;
        QuickSlotRestoreEntry(int slot, String itemId, String className, Item decodedItem) {
            this.slot = slot;
            this.itemId = itemId;
            this.className = className;
            this.decodedItem = decodedItem;
        }
    }

    /** Parse and validate the slot set before mutating the live Hero. */
    private static List<QuickSlotRestoreEntry> parseQuickSlotEntries(Bundle heroState) {
        if (heroState == null || !heroState.contains("quickslotsJson")) return null; // legacy snapshot
        String encoded = heroState.getString("quickslotsJson");
        if (encoded == null || encoded.length() > 200000) throw new IllegalStateException("Invalid native quickslot state");
        JsonValue root;
        try { root = new JsonReader().parse(encoded); }
        catch (RuntimeException malformed) { throw new IllegalStateException("Invalid native quickslot JSON", malformed); }
        if (root == null || !root.isArray() || root.size > QuickSlot.SIZE) {
            throw new IllegalStateException("Invalid native quickslot array");
        }
        List<QuickSlotRestoreEntry> result = new ArrayList<>();
        boolean[] usedSlots = new boolean[QuickSlot.SIZE];
        java.util.HashSet<String> usedItems = new java.util.HashSet<>();
        for (JsonValue value = root.child; value != null; value = value.next) {
            if (!value.isObject()) throw new IllegalStateException("Invalid native quickslot entry");
            JsonValue slotValue = value.get("slot"), idValue = value.get("itemId");
            JsonValue classValue = value.get("className"), quantityValue = value.get("quantity");
            JsonValue bundleValue = value.get("serializedBundle");
            if (slotValue == null || !slotValue.isNumber() || idValue == null || !idValue.isString()
                    || classValue == null || !classValue.isString() || quantityValue == null || !quantityValue.isNumber()
                    || bundleValue == null || !bundleValue.isString()) {
                throw new IllegalStateException("Incomplete native quickslot entry"
                        + " [slot=" + jsonFieldType(slotValue) + ", itemId=" + jsonFieldType(idValue)
                        + ", className=" + jsonFieldType(classValue) + ", quantity=" + jsonFieldType(quantityValue)
                        + ", serializedBundle=" + jsonFieldType(bundleValue) + "]");
            }
            int slot = slotValue.asInt(), quantity = quantityValue.asInt();
            String id = idValue.asString(), className = classValue.asString(), bundleText = bundleValue.asString();
            if (slot < 0 || slot >= QuickSlot.SIZE || usedSlots[slot]
                    || id.length() < 8 || id.length() > 80 || !usedItems.add(id)
                    || className.isEmpty() || className.length() > 256 || quantity < 0 || quantity > 100000
                    || bundleText.isEmpty() || bundleText.length() > 200000 || !bundleText.contains(id)) {
                throw new IllegalStateException("Malformed native quickslot entry");
            }
            Bundle itemBundle = readBundle(bundleText);
            Object itemValue = itemBundle == null ? null : itemBundle.get("item");
            if (!(itemValue instanceof Item)) throw new IllegalStateException("Quickslot bundle did not contain an Item");
            Item decoded = (Item) itemValue;
            if (!id.equals(decoded.multiplayerItemId()) || !className.equals(decoded.getClass().getName())
                    || decoded.quantity() != quantity) {
                throw new IllegalStateException("Quickslot item identity does not match its native bundle");
            }
            usedSlots[slot] = true;
            result.add(new QuickSlotRestoreEntry(slot, id, className, decoded));
        }
        return result;
    }

    private static String jsonFieldType(JsonValue value) {
        if (value == null) return "missing";
        if (value.isString()) return "string";
        if (value.isNumber()) return "number";
        if (value.isBoolean()) return "boolean";
        if (value.isObject()) return "object";
        if (value.isArray()) return "array";
        return "other";
    }

    /** Rebind slots to restored inventory objects, retaining only real zero-quantity placeholders. */
    private static void restoreHeroQuickSlots(Hero hero, List<QuickSlotRestoreEntry> entries) {
        if (hero == null || hero != Dungeon.hero || entries == null || Dungeon.quickslot == null) return;
        Map<String, Item> ownedItems = new HashMap<>();
        for (Item item : hero.belongings.getAllItems(Item.class)) {
            if (item != null && item.quantity() > 0) ownedItems.put(item.multiplayerItemId(), item);
        }
        Item[] restored = new Item[QuickSlot.SIZE];
        for (QuickSlotRestoreEntry entry : entries) {
            Item item = ownedItems.get(entry.itemId);
            if (item != null) {
                if (!entry.className.equals(item.getClass().getName())) {
                    throw new IllegalStateException("Quickslot item class does not match inventory");
                }
                restored[entry.slot] = item;
            } else if (entry.decodedItem.quantity() == 0) {
                restored[entry.slot] = entry.decodedItem;
            } else {
                throw new IllegalStateException("Quickslot references an item absent from restored inventory");
            }
        }
        Dungeon.quickslot.reset();
        for (int slot = 0; slot < restored.length; slot++) {
            if (restored[slot] != null) Dungeon.quickslot.setSlot(slot, restored[slot]);
        }
    }

    private static void restoreHeroState(Hero hero, String encodedState) {
        if (hero == null || encodedState == null || encodedState.isEmpty()) return;
        Bundle heroState = readBundle(encodedState);
        if (heroState == null) return;
        List<QuickSlotRestoreEntry> quickslotEntries = hero == Dungeon.hero ? parseQuickSlotEntries(heroState) : null;
        hero.HT = Math.max(1, heroState.getInt("ht"));
        hero.HP = Math.max(0, Math.min(heroState.getInt("hp"), hero.HT));
        int nativePos = heroState.getInt("pos");
        if (Dungeon.level != null && nativePos >= 0 && nativePos < Dungeon.level.length()) {
            hero.pos = nativePos;
        }
        // ItemStatusHandlers are static in this native SPD process, while co-op knowledge
        // belongs to the local player. A remote Hero snapshot must never overwrite Dungeon.hero's
        // Potion/Scroll identification state.
        if (hero == Dungeon.hero) {
            Bundle potionStatus = readBundle(heroState.getString("potionStatusBundle"));
            if (potionStatus != null) {
                com.shatteredpixel.shatteredpixeldungeon.items.potions.Potion.restoreMultiplayerStatusBundle(potionStatus);
            }
            Bundle scrollStatus = readBundle(heroState.getString("scrollStatusBundle"));
            if (scrollStatus != null) {
                com.shatteredpixel.shatteredpixeldungeon.items.scrolls.Scroll.restoreMultiplayerStatusBundle(scrollStatus);
            }
            if (heroState.contains("runProgressBundle")) {
                MultiplayerRunProgress.restore(heroState.getString("runProgressBundle"));
            }
        }
        Bundle nativeHero = readBundle(heroState.getString("combatBundle"));
        if (nativeHero != null) hero.restoreMultiplayerCombatState(nativeHero);
        Bundle inventory = readBundle(heroState.getString("inventoryBundle"));
        if (inventory != null) hero.belongings.restoreFromBundle(inventory);
        if (hero == Dungeon.hero) {
            if (heroState.contains("gold")) Dungeon.gold = Math.max(0, heroState.getInt("gold"));
            if (heroState.contains("alchemyEnergy")) Dungeon.energy = Math.max(0, heroState.getInt("alchemyEnergy"));
            restoreHeroQuickSlots(hero, quickslotEntries);
        }
        for (Buff oldBuff : new java.util.ArrayList<>(hero.buffs())) oldBuff.detach();
        int buffCount = Math.max(0, Math.min(256, heroState.getInt("buffCount")));
        for (int i = 0; i < buffCount; i++) {
            Bundle encodedBuff = readBundle(heroState.getString("buff_" + i));
            if (encodedBuff == null) continue;
            try {
                Buff buff = (Buff) encodedBuff.get("buff");
                if (buff != null) {
                    buff.attachTo(hero);
                    buff.restoreMultiplayerCooldown(heroState.getFloat("buffCooldown_" + i));
                }
            } catch (RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
        }
        hero.restoreMultiplayerCooldown(heroState.getFloat("cooldown"));

        // Journal and NPC quest flags belong to the local run, not individual remote Hero replicas.
        if (hero == Dungeon.hero) {
            Bundle notes = readBundle(heroState.getString("notesBundle"));
            if (notes != null) com.shatteredpixel.shatteredpixeldungeon.journal.Notes.restoreFromBundle(notes);
            Bundle quests = readBundle(heroState.getString("questStateBundle"));
            if (quests != null) {
                com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Ghost.Quest.restoreFromBundle(quests);
                com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Wandmaker.Quest.restoreFromBundle(quests);
                com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Blacksmith.Quest.restoreFromBundle(quests);
                com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Imp.Quest.restoreFromBundle(quests);
            }
        }
    }

    private static Bundle readBundle(String json) {
        if (json == null || json.isEmpty() || "null".equals(json)) return null;
        try {
            return Bundle.read(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }

    private static boolean boolValue(Object value, boolean fallback) {
        if (value instanceof Boolean) return (Boolean) value;
        if (value instanceof Number) return ((Number) value).intValue() != 0;
        if (value == null) return fallback;
        if ("true".equalsIgnoreCase(String.valueOf(value))) return true;
        if ("false".equalsIgnoreCase(String.valueOf(value))) return false;
        return fallback;
    }

    private static int number(Object value, int fallback) {
        if (value instanceof Number) return ((Number) value).intValue();
        if (value != null) {
            try { return Integer.parseInt(String.valueOf(value)); } catch (RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
        }
        return fallback;
    }

    private static float floatNumber(Object value, float fallback) {
        if (value instanceof Number) return ((Number) value).floatValue();
        if (value != null) {
            try { return Float.parseFloat(String.valueOf(value)); } catch (RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
        }
        return fallback;
    }

    private static boolean isIntegralNumber(Object value) {
        if (!(value instanceof Number)) return false;
        double numericValue = ((Number) value).doubleValue();
        return Double.isFinite(numericValue) && numericValue == Math.rint(numericValue)
                && numericValue >= Integer.MIN_VALUE && numericValue <= Integer.MAX_VALUE;
    }

    /**
     * Validates every floor heap/item identity and native item bundle before the live dungeon
     * can be mutated. A class name or cell position is never used as item identity.
     */
    @SuppressWarnings("unchecked")
    public static boolean hasValidStableHeapItemIdentities(List<Map<String, Object>> heaps) {
        if (heaps == null || heaps.size() > 10000) return false;
        java.util.Set<String> heapIds = new java.util.HashSet<>();
        java.util.Set<String> itemIds = new java.util.HashSet<>();
        int totalItems = 0;
        for (Map<String, Object> heap : heaps) {
            if (heap == null) return false;
            Object heapIdValue = heap.get("heapId");
            if (!(heapIdValue instanceof String)
                    || !Heap.isValidMultiplayerHeapId((String) heapIdValue)
                    || !heapIds.add((String) heapIdValue)) return false;

            Object rawItems = heap.get("items");
            if (!(rawItems instanceof List) || ((List<?>) rawItems).size() > 512) return false;
            for (Object rawItem : (List<?>) rawItems) {
                if (!(rawItem instanceof Map) || ++totalItems > 8192) return false;
                Map<String, Object> itemData = (Map<String, Object>) rawItem;
                Object itemIdValue = itemData.get("itemId");
                Object classValue = itemData.get("className");
                Object quantityValue = itemData.get("quantity");
                Object levelValue = itemData.get("level");
                Object cursedValue = itemData.get("cursed");
                Object cursedKnownValue = itemData.get("cursedKnown");
                Object stackableValue = itemData.get("stackable");
                Object encodedValue = itemData.get("serializedBundle");
                if (!(itemIdValue instanceof String)
                        || !Item.isValidMultiplayerItemId((String) itemIdValue)
                        || !itemIds.add((String) itemIdValue)
                        || !(classValue instanceof String) || ((String) classValue).isEmpty()
                        || ((String) classValue).length() > 256
                        || !isIntegralNumber(quantityValue) || number(quantityValue, -1) < 1
                        || number(quantityValue, -1) > 100000
                        || !isIntegralNumber(levelValue) || number(levelValue, Integer.MIN_VALUE) < -100
                        || number(levelValue, Integer.MIN_VALUE) > 10000
                        || !(cursedValue instanceof Boolean)
                        || !(cursedKnownValue instanceof Boolean)
                        || !(stackableValue instanceof Boolean)
                        || !(encodedValue instanceof String) || ((String) encodedValue).isEmpty()
                        || ((String) encodedValue).length() > 200000) return false;

                Bundle itemBundle = readBundle((String) encodedValue);
                Object decodedValue = itemBundle == null ? null : itemBundle.get("item");
                if (!(decodedValue instanceof Item)) return false;
                Item decoded = (Item) decodedValue;
                if (!itemIdValue.equals(decoded.multiplayerItemId())
                        || !classValue.equals(decoded.getClass().getName())
                        || number(quantityValue, -1) != decoded.quantity()
                        || number(levelValue, Integer.MIN_VALUE) != decoded.level()
                        || ((Boolean) cursedValue).booleanValue() != decoded.cursed
                        || ((Boolean) cursedKnownValue).booleanValue() != decoded.cursedKnown
                        || ((Boolean) stackableValue).booleanValue() != decoded.stackable) return false;
            }
        }
        return true;
    }

    /**
     * Validate the complete world before mutating the live dungeon. Invalid snapshots must
     * not partially clear actors or advance the client's acknowledged sequence.
     */
    public static boolean validateForRestore(WorldSnapshot snapshot) {
        if (snapshot == null || !snapshot.completeWorldSnapshot || Dungeon.level == null) return rejectValidation("validator-check-1");
        if (snapshot.sequence < 0 || snapshot.depth < 1 || snapshot.depth > 100 || snapshot.branch != 0
                || snapshot.depth != Dungeon.depth || snapshot.branch != Dungeon.branch
                || snapshot.levelWidth <= 0 || snapshot.levelHeight <= 0
                || snapshot.levelWidth > 100 || snapshot.levelHeight > 100
                || snapshot.tiles == null || snapshot.tiles.size() != snapshot.levelWidth * snapshot.levelHeight) return rejectValidation("validator-check-2");
        int length = snapshot.levelWidth * snapshot.levelHeight;
        if (snapshot.entrancePos < 0 || snapshot.entrancePos >= length
                || snapshot.exitPos < 0 || snapshot.exitPos >= length) return rejectValidation("validator-check-3");
        boolean[] tileSeen = new boolean[length];
        for (Map<String, Object> tile : snapshot.tiles) {
            if (tile == null) return rejectValidation("validator-check-4");
            int pos = number(tile.get("pos"), -1);
            int terrain = number(tile.get("terrain"), -1);
            if (pos < 0 || pos >= length || terrain < 0 || terrain > 255 || tileSeen[pos]) return rejectValidation("validator-check-5");
            for (String flag : new String[]{"passable", "solid", "pit", "losBlocking", "flammable", "secret", "avoid", "water", "discoverable", "openSpace"}) {
                int value = number(tile.get(flag), -1);
                if (value != 0 && value != 1) return rejectValidation("validator-check-6");
            }
            tileSeen[pos] = true;
        }
        for (boolean seen : tileSeen) if (!seen) return rejectValidation("validator-check-7");
        if (snapshot.visitedPositions == null || snapshot.mappedPositions == null
                || snapshot.levelFeeling == null || snapshot.nativeLevelMetadataBundle == null
                || snapshot.nativeLevelMetadataBundle.isEmpty() || snapshot.nativeLevelMetadataBundle.length() > 200000) return rejectValidation("validator-check-8");
        Bundle nativeMetadata = readBundle(snapshot.nativeLevelMetadataBundle);
        if (nativeMetadata == null || !Dungeon.level.canRestoreMultiplayerMetadata(nativeMetadata)) return rejectValidation("validator-check-9");
        if (!java.util.Arrays.asList("NONE", "CHASM", "WATER", "GRASS", "DARK", "LARGE", "TRAPS", "SECRETS")
                .contains(snapshot.levelFeeling)) return rejectValidation("validator-check-10");
        if (!validCellList(snapshot.visitedPositions, length) || !validCellList(snapshot.mappedPositions, length)) return rejectValidation("validator-check-11");
        if (snapshot.transitions == null || snapshot.heaps == null || snapshot.traps == null
                || snapshot.blobs == null || snapshot.plants == null || snapshot.mobs == null
                || snapshot.playerPositions == null || snapshot.playerHp == null || snapshot.playerHt == null
                || snapshot.playerClasses == null || snapshot.playerStateJson == null) return rejectValidation("validator-check-12");
        if (!hasValidStableHeapItemIdentities(snapshot.heaps)) return rejectValidation("validator-check-32b");
        if (!validPositions(snapshot.transitions, length, "pos", false)
                || !validPositions(snapshot.heaps, length, "pos", true)
                || !validPositions(snapshot.traps, length, "pos", true)
                || !validPositions(snapshot.plants, length, "pos", true)) return rejectValidation("validator-check-13");
        for (Map<String, Object> transition : snapshot.transitions) {
            try {
                com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition.Type.valueOf(
                        String.valueOf(transition.get("type")));
                String targetType = String.valueOf(transition.get("targetType"));
                if (!targetType.isEmpty() && !"null".equals(targetType))
                    com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition.Type.valueOf(targetType);
            } catch (RuntimeException invalidTransition) { return rejectValidation("validator-check-14"); }
            int targetDepth = number(transition.get("targetDepth"), -1);
            int targetBranch = number(transition.get("targetBranch"), -1);
            String transitionType = String.valueOf(transition.get("type"));
            if (targetDepth < ("SURFACE".equals(transitionType) ? 0 : 1)
                    || targetDepth > 100 || targetBranch < 0 || targetBranch > 32) return rejectValidation("validator-check-15");
        }
        for (Map.Entry<String, Integer> player : snapshot.playerPositions.entrySet()) {
            if (player.getKey() == null || player.getKey().isEmpty() || player.getValue() == null
                    || player.getValue() < 0 || player.getValue() >= length) return rejectValidation("validator-check-16");
            int hp = snapshot.playerHp.containsKey(player.getKey()) ? snapshot.playerHp.get(player.getKey()) : 0;
            int ht = snapshot.playerHt.containsKey(player.getKey()) ? snapshot.playerHt.get(player.getKey()) : 1;
            if (hp < 0 || ht < 1 || hp > ht) return rejectValidation("validator-check-17");
            String heroState = snapshot.playerStateJson.get(player.getKey());
            if (heroState != null && !heroState.isEmpty()) {
                Bundle state = readBundle(heroState);
                if (state == null) return rejectValidation("validator-check-18");
                String combat = state.getString("combatBundle");
                String inventory = state.getString("inventoryBundle");
                if (combat == null || combat.isEmpty() || readBundle(combat) == null
                        || inventory == null || inventory.isEmpty() || readBundle(inventory) == null
                        || !state.contains("buffCount")) return rejectValidation("validator-check-19");
                if (state.contains("runProgressBundle")
                        && !MultiplayerRunProgress.isValid(state.getString("runProgressBundle"))) {
                    return rejectValidation("validator-check-37");
                }
                int heroBuffCount = state.getInt("buffCount");
                if (heroBuffCount < 0 || heroBuffCount > 256) return rejectValidation("validator-check-20");
                for (int i = 0; i < heroBuffCount; i++) {
                    String encodedBuff = state.getString("buff_" + i);
                    if (!state.contains("buff_" + i) || !bundleContains(encodedBuff, "buff", Buff.class)
                            || !state.contains("buffCooldown_" + i)) return rejectValidation("validator-check-21");
                    float buffCooldown = state.getFloat("buffCooldown_" + i);
                    if (!Float.isFinite(buffCooldown) || buffCooldown < 0f || buffCooldown > 100000f) return rejectValidation("validator-check-22");
                }
            }
        }
        java.util.Set<Integer> mobIds = new java.util.HashSet<>();
        java.util.Set<Integer> mobPositions = new java.util.HashSet<>();
        java.util.Set<String> serverEntityIds = new java.util.HashSet<>();
        for (Map<String, Object> mob : snapshot.mobs) {
            if (mob == null) return rejectValidation("validator-check-24");
            int id = number(mob.get("mobId"), -1);
            String entityId = String.valueOf(mob.get("entityId") == null ? "" : mob.get("entityId"));
            int pos = number(mob.get("pos"), -1);
            int hp = number(mob.get("hp"), -1);
            int ht = number(mob.get("ht"), -1);
            boolean stableIdentityPresent = entityId != null && !entityId.isEmpty();
            if (id < 0 || !mobIds.add(id)
                    || (!stableIdentityPresent && !snapshot.localRollbackBaseline)
                    || (stableIdentityPresent && (entityId.length() < 8 || entityId.length() > 80
                        || !serverEntityIds.add(entityId)))
                    || pos < 0 || pos >= length || !mobPositions.add(pos)
                    || hp < 0 || ht < 1 || hp > ht) return rejectValidation("validator-check-25");
            if (mob.containsKey("effectiveSpeed")) {
                float effectiveSpeed = floatNumber(mob.get("effectiveSpeed"), -1f);
                if (!Float.isFinite(effectiveSpeed) || effectiveSpeed <= 0f || effectiveSpeed > 1000f)
                    return rejectValidation("validator-check-26a");
            }
            if (mob.containsKey("baseSpeed")) {
                float baseSpeed = floatNumber(mob.get("baseSpeed"), -1f);
                if (!Float.isFinite(baseSpeed) || baseSpeed <= 0f || baseSpeed > 1000f)
                    return rejectValidation("validator-check-26b");
            }
            if (mob.containsKey("cooldown")) {
                float cooldown = floatNumber(mob.get("cooldown"), -1f);
                if (!Float.isFinite(cooldown) || cooldown < 0f || cooldown > 100000f)
                    return rejectValidation("validator-check-26c");
            }
            int targetCell = number(mob.get("targetCell"), -1);
            if (targetCell < -1 || targetCell >= length) return rejectValidation("validator-check-26d");
            String targetType = String.valueOf(mob.get("targetType") == null ? "NONE" : mob.get("targetType"));
            String targetEntity = String.valueOf(mob.get("targetEntityId") == null ? "" : mob.get("targetEntityId"));
            if (!java.util.Arrays.asList("NONE", "MOB", "PLAYER").contains(targetType)
                    || targetEntity.length() > 128
                    || (("MOB".equals(targetType) || "PLAYER".equals(targetType)) && targetEntity.isEmpty()))
                return rejectValidation("validator-check-26e");
            if (!bundleContains(mob.get("serializedBundle"), "mob", com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob.class)) return rejectValidation("validator-check-26");
            Object buffs = mob.get("buffs");
            if (!(buffs instanceof List)) return rejectValidation("validator-check-27");
            if (((List<?>) buffs).size() > 256) return rejectValidation("validator-check-28");
            for (Object raw : (List<?>) buffs) {
                if (!(raw instanceof Map) || !bundleContains(((Map<?, ?>) raw).get("serializedBundle"), "buff", Buff.class)) return rejectValidation("validator-check-29");
                float cooldown = floatNumber(((Map<?, ?>) raw).get("cooldown"), Float.NaN);
                if (!Float.isFinite(cooldown) || cooldown < 0f || cooldown > 100000f) return rejectValidation("validator-check-30");
            }
            float speed = floatNumber(mob.get("baseSpeed"), Float.NaN);
            float cooldown = floatNumber(mob.get("cooldown"), Float.NaN);
            if (!Float.isFinite(speed) || speed <= 0f || speed > 100f
                    || !Float.isFinite(cooldown) || cooldown < 0f || cooldown > 100000f) return rejectValidation("validator-check-31");
        }
        java.util.Set<String> stableHeapIds = new java.util.HashSet<>();
        java.util.Set<String> stableItemIds = new java.util.HashSet<>();
        for (Map<String, Object> heap : snapshot.heaps) {
            String heapId = String.valueOf(heap.get("heapId") == null ? "" : heap.get("heapId"));
            if (!heapId.isEmpty() && (heapId.length() < 8 || heapId.length() > 80 || !stableHeapIds.add(heapId))) return rejectValidation("validator-check-32a");
            try { Heap.Type.valueOf(String.valueOf(heap.get("type"))); }
            catch (RuntimeException invalidHeapType) { return rejectValidation("validator-check-32"); }
            Object items = heap.get("items");
            if (!(items instanceof List) || ((List<?>) items).size() > 512) return rejectValidation("validator-check-33");
            for (Object raw : (List<?>) items) {
                if (!(raw instanceof Map)) return rejectValidation("validator-check-34");
                Map<?, ?> item = (Map<?, ?>) raw;
                String itemId = String.valueOf(item.get("itemId") == null ? "" : item.get("itemId"));
                if (!itemId.isEmpty() && (itemId.length() < 8 || itemId.length() > 80 || !stableItemIds.add(itemId))) return rejectValidation("validator-check-34a");
                if (!bundleContains(item.get("serializedBundle"), "item", Item.class)) return rejectValidation("validator-check-35");
                int quantity = number(item.get("quantity"), -1);
                int itemLevel = number(item.get("level"), 0);
                if (quantity < 1 || quantity > 100000 || itemLevel < -100 || itemLevel > 10000) return rejectValidation("validator-check-36");
            }
        }
        for (Map<String, Object> trap : snapshot.traps)
            if (!bundleContains(trap.get("serializedBundle"), "trap", Trap.class)) return rejectValidation("validator-check-37");
        for (Map<String, Object> plant : snapshot.plants)
            if (!bundleContains(plant.get("serializedBundle"), "plant", Plant.class)) return rejectValidation("validator-check-38");
        java.util.Set<String> blobTypes = new java.util.HashSet<>();
        for (Map<String, Object> blob : snapshot.blobs) {
            if (!bundleContains(blob.get("serializedBundle"), "blob", Blob.class)) return rejectValidation("validator-check-39");
            String type = String.valueOf(blob.get("className"));
            float cooldown = floatNumber(blob.get("cooldown"), Float.NaN);
            if (type.isEmpty() || !blobTypes.add(type) || !Float.isFinite(cooldown)
                    || cooldown < 0f || cooldown > 100000f) return rejectValidation("validator-check-40");
        }
        return true;
    }

    private static boolean rejectValidation(String reason) {
        lastRollbackCaptureDiagnostic = reason;
        return false;
    }

    private static boolean validCellList(List<Integer> values, int length) {
        java.util.Set<Integer> cells = new java.util.HashSet<>();
        for (Integer pos : values) if (pos == null || pos < 0 || pos >= length || !cells.add(pos)) return false;
        return true;
    }

    private static boolean validPositions(List<Map<String, Object>> values, int length, String key, boolean unique) {
        if (values == null) return false;
        java.util.Set<Integer> positions = new java.util.HashSet<>();
        for (Map<String, Object> value : values) {
            if (value == null) return false;
            int pos = number(value.get(key), -1);
            if (pos < 0 || pos >= length || (unique && !positions.add(pos))) return false;
        }
        return true;
    }

    static boolean allowsLegacyMobIdentityFallback(String entityId) {
        return entityId == null || entityId.isEmpty();
    }

    private static boolean bundleContains(Object raw, String key, Class<?> expectedType) {
        if (!(raw instanceof String) || ((String) raw).isEmpty() || ((String) raw).length() > 200000) return false;
        Bundle bundle = readBundle((String) raw);
        if (bundle == null) return false;
        try { return expectedType.isInstance(bundle.get(key)); }
        catch (RuntimeException restoreError) { return false; }
    }

    public static void clearAppliedSnapshot() {
        lastAppliedSnapshot = null;
    }

    /**
     * Captures this device's currently playable world as a private first-snapshot rollback point.
     * Local Actor IDs are retained only inside this backup; the backup is never sent to the server.
     */
    public static WorldSnapshot captureLocalRollbackBaseline() {
        lastRollbackCaptureDiagnostic = "capture started";
        try {
            com.shatteredpixel.shatteredpixeldungeon.levels.Level level = Dungeon.level;
            Hero hero = Dungeon.hero;
            MultiplayerManager manager = MultiplayerManager.getInstance();
            String localId = manager.getLocalPlayerId();
            if (level == null || hero == null || localId == null || localId.isEmpty()) {
                lastRollbackCaptureDiagnostic = "missing current level, hero, or local player identity";
                return null;
            }

            WorldSnapshot baseline = new WorldSnapshot();
            baseline.localRollbackBaseline = true;
            baseline.sequence = Math.max(0L, manager.getLastSequence());
            baseline.depth = Dungeon.depth;
            baseline.branch = Dungeon.branch;
            baseline.dungeonSeed = Dungeon.seedCurDepth();
            baseline.levelWidth = level.width();
            baseline.levelHeight = level.height();
            baseline.entrancePos = level.entrance();
            baseline.exitPos = level.exit();
            baseline.levelLocked = level.locked;
            baseline.levelFeeling = level.multiplayerFeelingName();
            baseline.nativeLevelMetadataBundle = level.multiplayerMetadataBundle();
            baseline.completeWorldSnapshot = true;

            baseline.visitedPositions.clear();
            baseline.mappedPositions.clear();
            for (int pos = 0; pos < level.length(); pos++) {
                if (level.visited != null && level.visited[pos]) baseline.visitedPositions.add(pos);
                if (level.mapped != null && level.mapped[pos]) baseline.mappedPositions.add(pos);
                Map<String, Object> tile = new HashMap<>();
                tile.put("pos", pos);
                tile.put("terrain", level.map[pos]);
                tile.put("passable", level.passable[pos] ? 1 : 0);
                tile.put("solid", level.solid[pos] ? 1 : 0);
                tile.put("pit", level.pit[pos] ? 1 : 0);
                tile.put("losBlocking", level.losBlocking[pos] ? 1 : 0);
                tile.put("flammable", level.flamable[pos] ? 1 : 0);
                tile.put("secret", level.secret[pos] ? 1 : 0);
                tile.put("avoid", level.avoid[pos] ? 1 : 0);
                tile.put("water", level.water[pos] ? 1 : 0);
                tile.put("discoverable", level.discoverable != null && level.discoverable[pos] ? 1 : 0);
                tile.put("openSpace", level.openSpace[pos] ? 1 : 0);
                baseline.tiles.add(tile);
            }

            baseline.transitions.clear();
            if (level.transitions != null) {
                for (LevelTransition transition : level.transitions) {
                    Map<String, Object> row = new HashMap<>();
                    row.put("pos", transition.cell());
                    row.put("type", transition.type == null ? "" : transition.type.name());
                    row.put("targetDepth", transition.destDepth);
                    row.put("targetBranch", transition.destBranch);
                    row.put("targetType", transition.destType == null ? "" : transition.destType.name());
                    baseline.transitions.add(row);
                }
            }

            baseline.mobs.clear();
            for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob : level.mobs) {
                if (mob == null) continue;
                Map<String, Object> row = new HashMap<>();
                row.put("mobId", mob.id());
                // Local Actor IDs are private to this baseline and never serve as server identity.
                row.put("entityId", "");
                row.put("name", mob.getClass().getSimpleName());
                row.put("pos", mob.pos);
                row.put("hp", mob.HP);
                row.put("ht", mob.HT);
                row.put("shielding", Math.max(0, mob.shielding()));
                row.put("state", mob.state == null ? "" : mob.state.getClass().getSimpleName());
                row.put("defenseSkill", mob.defenseSkill);
                row.put("baseSpeed", mob.multiplayerBaseSpeed());
                row.put("cooldown", Math.max(0f, mob.cooldown()));
                row.put("serializedBundle", SPDLevelSnapshot.currentMobBundle(mob));
                List<Map<String, Object>> buffs = new ArrayList<>();
                for (Buff buff : mob.buffs()) {
                    Bundle buffBundle = new Bundle();
                    buffBundle.put("buff", buff);
                    Map<String, Object> buffRow = new HashMap<>();
                    buffRow.put("serializedBundle", buffBundle.toString());
                    buffRow.put("cooldown", Math.max(0f, buff.cooldown()));
                    buffs.add(buffRow);
                }
                row.put("buffs", buffs);
                baseline.mobs.add(row);
            }

            baseline.heaps.clear();
            for (Heap heap : level.heaps.valueList()) {
                if (heap == null) continue;
                Map<String, Object> row = new HashMap<>();
                row.put("heapId", heap.multiplayerHeapId());
                row.put("pos", heap.pos);
                row.put("type", heap.type == null ? "HEAP" : heap.type.name());
                row.put("seen", heap.seen);
                row.put("haunted", heap.haunted);
                row.put("hidden", heap.hidden);
                row.put("autoExplored", heap.autoExplored);
                List<Map<String, Object>> items = new ArrayList<>();
                for (Item item : heap.items) {
                    if (item == null) continue;
                    Bundle itemBundle = new Bundle();
                    itemBundle.put("item", item);
                    Map<String, Object> itemRow = new HashMap<>();
                    itemRow.put("itemId", item.multiplayerItemId());
                    itemRow.put("className", item.getClass().getName());
                    itemRow.put("quantity", item.quantity());
                    itemRow.put("level", item.level());
                    itemRow.put("cursed", item.cursed);
                    itemRow.put("cursedKnown", item.cursedKnown);
                    itemRow.put("stackable", item.stackable);
                    itemRow.put("serializedBundle", itemBundle.toString());
                    items.add(itemRow);
                }
                row.put("items", items);
                baseline.heaps.add(row);
            }

            baseline.traps.clear();
            for (Trap trap : level.traps.valueList()) {
                if (trap == null) continue;
                Bundle bundle = new Bundle();
                bundle.put("trap", trap);
                Map<String, Object> row = new HashMap<>();
                row.put("pos", trap.pos);
                row.put("className", trap.getClass().getName());
                row.put("active", trap.active);
                row.put("visible", trap.visible);
                row.put("reclaimed", trap.reclaimed);
                row.put("color", trap.color);
                row.put("shape", trap.shape);
                row.put("serializedBundle", bundle.toString());
                baseline.traps.add(row);
            }

            baseline.blobs.clear();
            for (Blob blob : level.blobs.values()) {
                if (blob == null) continue;
                Bundle bundle = new Bundle();
                bundle.put("blob", blob);
                Map<String, Object> row = new HashMap<>();
                row.put("className", blob.getClass().getName());
                row.put("serializedBundle", bundle.toString());
                row.put("cooldown", Math.max(0f, blob.cooldown()));
                baseline.blobs.add(row);
            }

            baseline.plants.clear();
            for (Plant plant : level.plants.valueList()) {
                if (plant == null) continue;
                Bundle bundle = new Bundle();
                bundle.put("plant", plant);
                Map<String, Object> row = new HashMap<>();
                row.put("pos", plant.pos);
                row.put("className", plant.getClass().getName());
                row.put("serializedBundle", bundle.toString());
                baseline.plants.add(row);
            }

            baseline.playerPositions.put(localId, hero.pos);
            baseline.playerHp.put(localId, hero.HP);
            baseline.playerHt.put(localId, hero.HT);
            baseline.playerClasses.put(localId, hero.heroClass.name());
            baseline.playerStateJson.put(localId, SPDLevelSnapshot.currentHeroStateJson(hero));

            for (Map.Entry<String, RemotePlayer> entry : manager.getRemotePlayers().entrySet()) {
                RemotePlayer remote = entry.getValue();
                if (remote == null || entry.getKey() == null || entry.getKey().isEmpty()
                        || remote.pos < 0 || remote.pos >= baseline.levelWidth * baseline.levelHeight) continue;
                baseline.playerPositions.put(entry.getKey(), remote.pos);
                baseline.playerHp.put(entry.getKey(), Math.max(0, remote.hp));
                baseline.playerHt.put(entry.getKey(), Math.max(1, remote.ht));
                baseline.playerClasses.put(entry.getKey(), remote.heroClass == null ? "WARRIOR" : remote.heroClass);
                if (remote.heroInstance != null) {
                    baseline.playerStateJson.put(entry.getKey(),
                            SPDLevelSnapshot.currentHeroStateJson(remote.heroInstance));
                }
            }

            if (!validateForRestore(baseline)) {
                String reason = lastRollbackCaptureDiagnostic;
                lastRollbackCaptureDiagnostic = "local native rollback snapshot failed validation: " + reason;
                GLog.w(lastRollbackCaptureDiagnostic);
                return null;
            }
            lastRollbackCaptureDiagnostic = "captured directly from live native objects and validated";
            return baseline;
        } catch (RuntimeException captureError) {
            lastRollbackCaptureDiagnostic = "exception " + captureError.getClass().getSimpleName()
                + ": " + captureError.getMessage();
            GLog.w("Unable to capture local rollback baseline: " + lastRollbackCaptureDiagnostic);
            return null;
        }
    }

    public static String lastRollbackCaptureDiagnostic() {
        return lastRollbackCaptureDiagnostic;
    }

    /** Reapplies the last known-good snapshot if a later reconciliation throws mid-apply. */
    public static boolean rollbackToLastApplied() {
        WorldSnapshot backup = lastAppliedSnapshot;
        if (backup == null) return false;
        try {
            return restoreWorld(backup, true);
        } catch (RuntimeException rollbackError) {
            GLog.w("Multiplayer snapshot rollback failed: " + rollbackError.getMessage());
            return false;
        }
    }

    /** Applies the authoritative Mob AI state after every player/Mob Actor has been restored. */
    public static void restoreNativeMobAiState(WorldSnapshot snapshot) {
        if (snapshot == null || snapshot.mobs == null) return;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        for (Map<String, Object> data : snapshot.mobs) {
            String entityId = String.valueOf(data.get("entityId") == null ? "" : data.get("entityId"));
            if (entityId.isEmpty() || number(data.get("hp"), 0) <= 0) continue;
            Integer localId = manager.getLocalActorIdForServerEntity(entityId);
            Actor localActor = localId == null ? null : Actor.findById(localId);
            if (!(localActor instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob)) continue;
            com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob =
                    (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) localActor;
            mob.restoreMultiplayerAiState(
                    String.valueOf(data.get("state")),
                    floatNumber(data.get("baseSpeed"), mob.multiplayerBaseSpeed()),
                    number(data.get("defenseSkill"), mob.defenseSkill),
                    floatNumber(data.get("cooldown"), 0f),
                    number(data.get("targetCell"), -1),
                    boolValue(data.get("enemySeen"), false),
                    boolValue(data.get("alerted"), false),
                    String.valueOf(data.get("targetType") == null ? "NONE" : data.get("targetType")),
                    String.valueOf(data.get("targetEntityId") == null ? "" : data.get("targetEntityId")));
            if (data.containsKey("effectiveSpeed")
                    && !mob.multiplayerEffectiveSpeedMatches(floatNumber(data.get("effectiveSpeed"), -1f))) {
                throw new IllegalStateException("Native mob effective-speed mismatch for stable entity " + entityId);
            }
        }
    }

    public static boolean restoreWorld(WorldSnapshot snapshot) {
        return restoreWorld(snapshot, false);
    }

    private static boolean restoreWorld(WorldSnapshot snapshot, boolean rollback) {
        if (!validateForRestore(snapshot)) {
            GLog.w("Rejected incomplete or invalid multiplayer world snapshot; live dungeon was left unchanged.");
            return false;
        }

        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()
                || (!rollback && snapshot.sequence < manager.getLastSequence())) return false;

        if (!rollback && !snapshot.localRollbackBaseline && lastAppliedSnapshot == null) {
            WorldSnapshot baseline = captureLocalRollbackBaseline();
            if (baseline == null) {
                GLog.w("Rejected first authoritative snapshot because a valid local rollback baseline could not be captured.");
                return false;
            }
            lastAppliedSnapshot = baseline;
        }

        WorldSnapshot rollbackBackup = lastAppliedSnapshot;
        try {
        boolean dimensionsChanged = Dungeon.level.width() != snapshot.levelWidth
                || Dungeon.level.height() != snapshot.levelHeight;
        if (dimensionsChanged) {
            // The active depth/branch is unchanged, so its native Level subclass remains valid.
            // Replace all parallel geometry/flag arrays before restoring the authoritative tiles.
            Dungeon.level.setSize(snapshot.levelWidth, snapshot.levelHeight);
        }
        Dungeon.depth = snapshot.depth;
        Dungeon.branch = snapshot.branch;
        if (snapshot.dungeonSeed != 0L) Dungeon.seed = snapshot.dungeonSeed;

        if (Dungeon.level != null) {
            Dungeon.level.locked = snapshot.levelLocked;
            if (!Dungeon.level.restoreMultiplayerFeeling(snapshot.levelFeeling)) {
                throw new IllegalStateException("Native level feeling restore failed after snapshot preflight");
            }
            java.util.Arrays.fill(Dungeon.level.visited, false);
            java.util.Arrays.fill(Dungeon.level.mapped, false);
            for (Integer pos : snapshot.visitedPositions) Dungeon.level.visited[pos] = true;
            for (Integer pos : snapshot.mappedPositions) Dungeon.level.mapped[pos] = true;
        }

        // Reconcile the complete authoritative tile geometry before applying actors.
        // The seeded SPD generator creates the Level instance; the snapshot then replaces
        // its mutable map/flags so reconnects do not keep stale doors, terrain or collision.
        if (Dungeon.level != null && snapshot.tiles != null
                && snapshot.levelWidth == Dungeon.level.width()
                && snapshot.levelHeight == Dungeon.level.height()
                && snapshot.tiles.size() == Dungeon.level.length()) {
            for (Map<String, Object> tile : snapshot.tiles) {
                int pos = number(tile.get("pos"), -1);
                int terrain = number(tile.get("terrain"), -1);
                if (pos < 0 || pos >= Dungeon.level.length() || terrain < 0) continue;
                Dungeon.level.map[pos] = terrain;
                Dungeon.level.passable[pos] = number(tile.get("passable"), 0) != 0;
                Dungeon.level.solid[pos] = number(tile.get("solid"), 0) != 0;
                Dungeon.level.pit[pos] = number(tile.get("pit"), 0) != 0;
                Dungeon.level.losBlocking[pos] = number(tile.get("losBlocking"), 0) != 0;
                Dungeon.level.flamable[pos] = number(tile.get("flammable"), 0) != 0;
                Dungeon.level.secret[pos] = number(tile.get("secret"), 0) != 0;
                Dungeon.level.avoid[pos] = number(tile.get("avoid"), 0) != 0;
                Dungeon.level.water[pos] = number(tile.get("water"), 0) != 0;
                Dungeon.level.discoverable[pos] = number(tile.get("discoverable"), 0) != 0;
                Dungeon.level.openSpace[pos] = number(tile.get("openSpace"), 0) != 0;
                if (!dimensionsChanged) GameScene.updateMap(pos);
            }
        }


        if (Dungeon.level != null) {
            Dungeon.level.entrance = snapshot.entrancePos >= 0 ? snapshot.entrancePos : Dungeon.level.entrance;
            Dungeon.level.exit = snapshot.exitPos >= 0 ? snapshot.exitPos : Dungeon.level.exit;
            if (snapshot.transitions != null) {
                Dungeon.level.transitions.clear();
                for (Map<String, Object> data : snapshot.transitions) {
                    int pos = number(data.get("pos"), -1);
                    if (pos < 0 || pos >= Dungeon.level.length()) continue;
                    try {
                        LevelTransition.Type type = LevelTransition.Type.valueOf(String.valueOf(data.get("type")));
                        LevelTransition.Type targetType = null;
                        String targetName = String.valueOf(data.get("targetType"));
                        if (!targetName.isEmpty() && !"null".equals(targetName)) targetType = LevelTransition.Type.valueOf(targetName);
                        Dungeon.level.transitions.add(new LevelTransition(Dungeon.level, pos, type,
                                number(data.get("targetDepth"), Dungeon.depth), number(data.get("targetBranch"), Dungeon.branch), targetType));
                    } catch (RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
                }
            }
        }

        // Reconcile mobs and instantiate authoritative mobs missing locally.
        if (Dungeon.level != null && snapshot.mobs != null) {
            java.util.Set<com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob> authoritativeMobs = new java.util.HashSet<>();
            for (Map<String, Object> data : snapshot.mobs) {
                int id = number(data.get("mobId"), -1);
                String entityId = String.valueOf(data.get("entityId") == null ? "" : data.get("entityId"));
                int pos = number(data.get("pos"), -1);
                int hp = number(data.get("hp"), 1);
                int ht = number(data.get("ht"), 1);
                if (id < 0 || pos < 0 || pos >= Dungeon.level.length()) continue;
                // Dead mobs are authoritative tombstones: never deserialize and kill them again,
                // because Mob.die() may create loot and award rewards a second time.
                if (hp <= 0) continue;
                com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob matched = null;
                Integer mappedActorId = entityId.isEmpty() ? null : manager.getLocalActorIdForServerEntity(entityId);
                if (mappedActorId != null) {
                    for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob : Dungeon.level.mobs) {
                        if (!authoritativeMobs.contains(mob) && mob.id() == mappedActorId) { matched = mob; break; }
                    }
                }
                String name = String.valueOf(data.get("name"));
                if (matched == null && allowsLegacyMobIdentityFallback(entityId)) {
                    // Local Actor.id() is a legacy-only fallback; never use it to reconcile a
                    // snapshot that already carries a stable server identity.
                    for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob : Dungeon.level.mobs) {
                        if (!authoritativeMobs.contains(mob) && mob.id() == id
                                && mob.getClass().getSimpleName().equals(name)) { matched = mob; break; }
                    }
                }
                if (matched == null && allowsLegacyMobIdentityFallback(entityId)) {
                    // Never bind a stable server entity to a different same-class mob merely
                    // because it currently occupies the same position. Missing stable IDs must
                    // be reconstructed from the authoritative native bundle instead.
                    for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob : Dungeon.level.mobs) {
                        if (!authoritativeMobs.contains(mob) && mob.pos == pos
                                && mob.getClass().getSimpleName().equals(name)) { matched = mob; break; }
                    }
                }
                if (matched == null && allowsLegacyMobIdentityFallback(entityId)) {
                    for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob : Dungeon.level.mobs) {
                        if (!authoritativeMobs.contains(mob) && mob.getClass().getSimpleName().equals(name)) { matched = mob; break; }
                    }
                }
                if (matched == null) {
                    try {
                        Object instance = null;
                        String encodedMob = String.valueOf(data.get("serializedBundle"));
                        if (!encodedMob.isEmpty() && !"null".equals(encodedMob)) {
                            Bundle mobBundle = readBundle(encodedMob);
                            if (mobBundle != null) instance = mobBundle.get("mob");
                        }
                        if (instance instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) {
                            matched = (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) instance;
                            matched.pos = pos;
                            matched.HT = Math.max(1, ht);
                            matched.HP = Math.min(Math.max(1, hp), matched.HT);
                            matched.restoreMultiplayerState(String.valueOf(data.get("state")),
                                    floatNumber(data.get("baseSpeed"), matched.multiplayerBaseSpeed()),
                                    number(data.get("defenseSkill"), matched.defenseSkill),
                                    floatNumber(data.get("cooldown"), 0f));
                            Dungeon.level.mobs.add(matched);
                            if (!dimensionsChanged) GameScene.add(matched);
                            // GameScene normally registers actors while placing their sprites.
                            // During initial reconnect/headless restoration there may be no scene;
                            // still register the reconstructed native mob with the Actor scheduler.
                            Actor scheduled = Actor.findById(matched.id());
                            if (scheduled == null) {
                                Actor.add(matched);
                            } else if (scheduled != matched) {
                                throw new IllegalStateException("Native mob Actor.id collision while restoring stable entity " + entityId);
                            }
                        } else {
                            GLog.w("Snapshot mob bundle did not contain a native Mob for entity " + id);
                        }
                    } catch (LinkageError | RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
                }
                if (matched != null) {
                    int oldPos = matched.pos;
                    String encodedMob = String.valueOf(data.get("serializedBundle"));
                    Bundle enclosingMobBundle = readBundle(encodedMob);
                    Bundle nativeMobBundle = enclosingMobBundle == null ? null : enclosingMobBundle.getBundle("mob");
                    String nativeMobClass = nativeMobBundle == null ? "" : nativeMobBundle.getString("__className");
                    if (nativeMobClass.isEmpty() || !matched.getClass().getName().equals(nativeMobClass)) {
                        throw new IllegalStateException("Stable mob identity resolved to a different native class: " + entityId);
                    }
                    // Preserve local Actor identity but restore subclass-specific native fields too.
                    // Existing matches must not be reduced to HP/position/AI fields alone.
                    for (Buff oldBuff : new java.util.ArrayList<>(matched.buffs())) oldBuff.detach();
                    matched.restoreFromBundlePreservingRuntimeIdentity(nativeMobBundle);
                    matched.HT = Math.max(1, ht);
                    if (hp <= 0) {
                        // An authoritative dead-mob tombstone is not a local kill. Calling
                        // Mob.die() here would award duplicate XP/statistics and roll local loot.
                        removeMobReplicaWithoutRewards(matched);
                        matched = null;
                    } else {
                        matched.HP = Math.min(hp, matched.HT);
                        matched.pos = pos;
                        matched.restoreMultiplayerState(
                                String.valueOf(data.get("state")),
                                floatNumber(data.get("baseSpeed"), matched.multiplayerBaseSpeed()),
                                number(data.get("defenseSkill"), matched.defenseSkill),
                                floatNumber(data.get("cooldown"), 0f));
                        if (!dimensionsChanged && matched.sprite != null && oldPos != pos) matched.sprite.place(pos);
                    }
                }
                if (matched != null) {
                    if (!entityId.isEmpty()) manager.registerServerEntityId(matched.id(), entityId);
                    authoritativeMobs.add(matched);
                    restoreMobBuffs(matched, data);
                }
            }
            for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob stale
                    : Dungeon.level.mobs.toArray(new com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob[0])) {
                if (!authoritativeMobs.contains(stale)) {
                    manager.removeServerEntityIdForActor(stale.id());
                    Dungeon.level.mobs.remove(stale);
                    Actor.remove(stale);
                    for (Buff oldBuff : new java.util.ArrayList<>(stale.buffs())) oldBuff.detach();
                    if (stale.sprite != null) stale.sprite.remove();
                }
            }
        }

        // Rebuild authoritative floor heaps and their dropped items with native SPD classes.
        if (Dungeon.level != null && snapshot.heaps != null) {
            java.util.Set<Integer> authoritativeHeapPositions = new java.util.HashSet<>();
            for (Map<String, Object> data : snapshot.heaps) {
                int pos = number(data.get("pos"), -1);
                if (pos < 0 || pos >= Dungeon.level.length()) continue;
                authoritativeHeapPositions.add(pos);
                Heap heap = new Heap();
                String serializedHeapId = String.valueOf(data.get("heapId") == null ? "" : data.get("heapId"));
                if (!serializedHeapId.isEmpty()) heap.setMultiplayerHeapId(serializedHeapId);
                heap.pos = pos;
                heap.type = Heap.Type.valueOf(String.valueOf(data.get("type")));
                heap.seen = Boolean.TRUE.equals(data.get("seen"));
                heap.haunted = Boolean.TRUE.equals(data.get("haunted"));
                heap.hidden = Boolean.TRUE.equals(data.get("hidden"));
                heap.autoExplored = Boolean.TRUE.equals(data.get("autoExplored"));
                Object itemList = data.get("items");
                if (itemList instanceof List) {
                    for (Object itemObject : (List<?>) itemList) {
                        if (!(itemObject instanceof Map)) continue;
                        Map<String, Object> itemData = (Map<String, Object>) itemObject;
                        try {
                            Item item = null;
                            String encoded = String.valueOf(itemData.get("serializedBundle"));
                            if (!encoded.isEmpty() && !"null".equals(encoded)) {
                                Bundle itemBundle = readBundle(encoded);
                                if (itemBundle != null) item = (Item) itemBundle.get("item");
                            }
                            if (item == null) {
                                throw new IllegalStateException("Snapshot item bundle did not contain a native Item at cell " + pos);
                            }
                            String serializedItemId = String.valueOf(itemData.get("itemId") == null ? "" : itemData.get("itemId"));
                            if (!Item.isValidMultiplayerItemId(serializedItemId)
                                    || !serializedItemId.equals(item.multiplayerItemId())
                                    || !serializedItemId.equals(itemData.get("itemId"))
                                    || !item.getClass().getName().equals(String.valueOf(itemData.get("className")))
                                    || number(itemData.get("quantity"), -1) != item.quantity()
                                    || number(itemData.get("level"), Integer.MIN_VALUE) != item.level()
                                    || !(itemData.get("cursed") instanceof Boolean)
                                    || ((Boolean) itemData.get("cursed")).booleanValue() != item.cursed
                                    || !(itemData.get("cursedKnown") instanceof Boolean)
                                    || ((Boolean) itemData.get("cursedKnown")).booleanValue() != item.cursedKnown
                                    || !(itemData.get("stackable") instanceof Boolean)
                                    || ((Boolean) itemData.get("stackable")).booleanValue() != item.stackable) {
                                throw new IllegalStateException("Item identity or metadata does not match its native bundle at cell " + pos);
                            }
                            // Snapshot order is already native top-to-bottom heap order.
                            // Heap.drop() inserts most items at the front and can reverse stacks,
                            // merge items or trigger side effects, so append the prepared native
                            // instances directly to preserve exact order and quantities.
                            heap.items.addLast(item);
                        } catch (RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
                    }
                }
                Dungeon.level.heaps.put(pos, heap);
                if (!dimensionsChanged) GameScene.updateMap(pos);
            }
            for (int pos : Dungeon.level.heaps.keyArray()) {
                if (!authoritativeHeapPositions.contains(pos)) {
                    Heap stale = Dungeon.level.heaps.get(pos);
                    if (stale != null && stale.sprite != null) stale.sprite.remove();
                    Dungeon.level.heaps.remove(pos);
                }
            }
        }

        // Rebuild trap instances and their mutable activation/reveal state.
        if (Dungeon.level != null && snapshot.traps != null) {
            Dungeon.level.traps.clear();
            for (Map<String, Object> data : snapshot.traps) {
                int pos = number(data.get("pos"), -1);
                if (pos < 0 || pos >= Dungeon.level.length()) continue;
                try {
                    Trap trap = null;
                    String encoded = String.valueOf(data.get("serializedBundle"));
                    if (!encoded.isEmpty() && !"null".equals(encoded)) {
                        Bundle trapBundle = readBundle(encoded);
                        if (trapBundle != null) trap = (Trap) trapBundle.get("trap");
                    }
                    if (trap == null) {
                        throw new IllegalStateException("Snapshot trap bundle did not contain a native Trap at cell " + pos);
                    }
                    trap.pos = pos;
                    trap.active = Boolean.TRUE.equals(data.get("active"));
                    trap.visible = Boolean.TRUE.equals(data.get("visible"));
                    trap.reclaimed = Boolean.TRUE.equals(data.get("reclaimed"));
                    trap.color = number(data.get("color"), trap.color);
                    trap.shape = number(data.get("shape"), trap.shape);
                    Dungeon.level.traps.put(pos, trap);
                    if (!dimensionsChanged) GameScene.updateMap(pos);
                } catch (RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
            }
        }

        // Restore plants as native SPD objects, not decorative placeholders.
        if (Dungeon.level != null && snapshot.plants != null) {
            Dungeon.level.plants.clear();
            for (Map<String, Object> data : snapshot.plants) {
                int pos = number(data.get("pos"), -1);
                if (pos < 0 || pos >= Dungeon.level.length()) continue;
                try {
                    Plant plant = null;
                    Bundle encoded = readBundle(String.valueOf(data.get("serializedBundle")));
                    if (encoded != null) plant = (Plant) encoded.get("plant");
                    if (plant == null) {
                        throw new IllegalStateException("Snapshot plant bundle did not contain a native Plant at cell " + pos);
                    }
                    plant.pos = pos;
                    Dungeon.level.plants.put(pos, plant);
                    if (!dimensionsChanged) GameScene.updateMap(pos);
                } catch (RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
            }
        }

        // Replace local blobs with the authoritative serialized blob instances and timing.
        if (Dungeon.level != null && snapshot.blobs != null) {
            for (Blob old : new java.util.ArrayList<>(Dungeon.level.blobs.values())) Actor.remove(old);
            Dungeon.level.blobs.clear();
            for (Map<String, Object> data : snapshot.blobs) {
                try {
                    Blob blob = null;
                    Bundle encoded = readBundle(String.valueOf(data.get("serializedBundle")));
                    if (encoded != null) blob = (Blob) encoded.get("blob");
                    if (blob == null) {
                        throw new IllegalStateException("Snapshot blob bundle did not contain a native Blob");
                    }
                    blob.restoreMultiplayerCooldown(floatNumber(data.get("cooldown"), 0f));
                    Dungeon.level.blobs.put(blob.getClass(), blob);
                    Actor.add(blob);
                } catch (RuntimeException restoreError) { throw new IllegalStateException("Native snapshot reconciliation failed", restoreError); }
            }
        }

        // Restore custom tilemaps, custom walls, spawn classes and native respawner timing.
        // Their bundles are preflighted before any live-world mutation above.
        if (Dungeon.level != null) {
            Bundle nativeMetadata = readBundle(snapshot.nativeLevelMetadataBundle);
            if (nativeMetadata == null || !Dungeon.level.restoreMultiplayerMetadata(nativeMetadata)) {
                GLog.w("Rejected native level metadata during restore.");
                return false;
            }
            if (!dimensionsChanged) GameScene.refreshMultiplayerCustomVisuals();
        }

        // Restore Remote Players
        String localPlayerId = manager.getLocalPlayerId();
        String localHeroState = localPlayerId == null ? null : snapshot.playerStateJson.get(localPlayerId);
        if (Dungeon.hero != null) restoreHeroState(Dungeon.hero, localHeroState);

        if (snapshot.playerPositions != null) {
            for (Map.Entry<String, Integer> entry : snapshot.playerPositions.entrySet()) {
                String pId = entry.getKey();
                int pos = entry.getValue();

                if (pId != null && entry.getValue() != null && entry.getValue() >= 0) {
                    if (pId.equals(manager.getLocalPlayerId())) {
                        if (Dungeon.hero != null && Dungeon.level != null && pos < Dungeon.level.length()) {
                            Dungeon.hero.pos = pos;
                            if (snapshot.playerHp.containsKey(pId)) Dungeon.hero.HP = Math.max(0, snapshot.playerHp.get(pId));
                            if (snapshot.playerHt.containsKey(pId)) Dungeon.hero.HT = Math.max(1, snapshot.playerHt.get(pId));
                            if (Dungeon.hero.sprite != null) Dungeon.hero.sprite.place(pos);
                        }
                        continue;
                    }
                    RemotePlayer remote = manager.getRemotePlayer(pId);
                    if (remote == null) {
                        String heroClass = snapshot.playerClasses.getOrDefault(pId, "WARRIOR");
                        remote = new RemotePlayer(pId, "Player", heroClass);
                        manager.addRemotePlayer(remote);
                    }

                    remote.pos = pos;
                    if (snapshot.playerHp.containsKey(pId)) remote.hp = snapshot.playerHp.get(pId);
                    if (snapshot.playerHt.containsKey(pId)) remote.ht = snapshot.playerHt.get(pId);

                    if (remote.heroInstance == null) {
                        remote.heroInstance = new RemoteHero();
                        remote.heroInstance.pos = remote.pos;
                        remote.heroInstance.HP = remote.hp;
                        remote.heroInstance.HT = remote.ht;

                        Actor.add(remote.heroInstance);

                        final RemotePlayer playerForRender = remote;
                        if (!dimensionsChanged) Game.runOnRenderThread(() -> {
                            if (playerForRender.heroInstance != null && playerForRender.heroInstance.sprite == null) {
                                HeroSprite sprite = new HeroSprite();
                                sprite.link(playerForRender.heroInstance);
                                if (GameScene.addRemoteHeroSprite(sprite)) {
                                    playerForRender.heroInstance.sprite = sprite;
                                    sprite.place(playerForRender.pos);
                                }
                            }
                        });
                    } else {
                        remote.heroInstance.pos = remote.pos;
                        remote.heroInstance.HP = remote.hp;
                        if (!dimensionsChanged && remote.heroInstance.sprite != null) {
                            remote.heroInstance.sprite.place(remote.pos);
                        }
                    }
                    restoreHeroState(remote.heroInstance, snapshot.playerStateJson.get(pId));
                }
            }
        }
        restoreNativeMobAiState(snapshot);

        // Recompute visibility only after authoritative terrain, hero position and entities
        // are in place; do not call Dungeon.observe(), which would invent extra visited cells.
        if (Dungeon.level != null && Dungeon.hero != null) {
            Dungeon.level.updateFieldOfView(Dungeon.hero, Dungeon.level.heroFOV);
            for (int pos = 0; pos < Dungeon.level.length(); pos++) if (!dimensionsChanged) GameScene.updateMap(pos);
        }

        lastAppliedSnapshot = snapshot;
        // The current scene owns tilemaps built for the former dimensions. Recreate it only
        // after the authoritative world is fully applied; rollback can then resize back too.
        if (dimensionsChanged && GameScene.hasActiveScene()) {
            Game.switchScene(GameScene.class);
        }
        return true;
        } catch (RuntimeException restoreError) {
            if (!rollback && rollbackBackup != null && rollbackBackup != snapshot) {
                lastAppliedSnapshot = rollbackBackup;
                if (!rollbackToLastApplied()) {
                    GLog.w("Failed to restore previous world after snapshot exception.");
                }
            }
            throw restoreError;
        }
    }
}
