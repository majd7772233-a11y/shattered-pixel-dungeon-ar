package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
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
    public long sequence;
    public int depth = 1;
    public int branch;
    public long dungeonSeed;
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
    public List<Integer> claimedItemPositions = new ArrayList<>();

    public WorldSnapshot() {}

    public WorldSnapshot(long sequence, int depth, long dungeonSeed) {
        this.sequence = sequence;
        this.depth = depth;
        this.dungeonSeed = dungeonSeed;
    }

    @SuppressWarnings("unchecked")
    private static void restoreMobBuffs(com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob,
                                        Map<String, Object> data) {
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
            } catch (RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
        }
    }

    private static void restoreHeroState(Hero hero, String encodedState) {
        if (hero == null || encodedState == null || encodedState.isEmpty()) return;
        Bundle heroState = readBundle(encodedState);
        if (heroState == null) return;
        Bundle nativeHero = readBundle(heroState.getString("combatBundle"));
        if (nativeHero != null) hero.restoreMultiplayerCombatState(nativeHero);
        Bundle inventory = readBundle(heroState.getString("inventoryBundle"));
        if (inventory != null) hero.belongings.restoreFromBundle(inventory);
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
            } catch (RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
        }
        hero.restoreMultiplayerCooldown(heroState.getFloat("cooldown"));
    }

    private static Bundle readBundle(String json) {
        if (json == null || json.isEmpty() || "null".equals(json)) return null;
        try {
            return Bundle.read(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }

    private static int number(Object value, int fallback) {
        if (value instanceof Number) return ((Number) value).intValue();
        if (value != null) {
            try { return Integer.parseInt(String.valueOf(value)); } catch (RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
        }
        return fallback;
    }

    private static float floatNumber(Object value, float fallback) {
        if (value instanceof Number) return ((Number) value).floatValue();
        if (value != null) {
            try { return Float.parseFloat(String.valueOf(value)); } catch (RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
        }
        return fallback;
    }

    /**
     * Validate the complete world before mutating the live dungeon. Invalid snapshots must
     * not partially clear actors or advance the client's acknowledged sequence.
     */
    public static boolean validateForRestore(WorldSnapshot snapshot) {
        if (snapshot == null || !snapshot.completeWorldSnapshot || Dungeon.level == null) return false;
        if (snapshot.depth < 1 || snapshot.branch != 0 || snapshot.levelWidth != Dungeon.level.width()
                || snapshot.levelHeight != Dungeon.level.height()
                || snapshot.levelWidth <= 0 || snapshot.levelHeight <= 0
                || snapshot.tiles == null || snapshot.tiles.size() != snapshot.levelWidth * snapshot.levelHeight) return false;
        int length = snapshot.levelWidth * snapshot.levelHeight;
        boolean[] tileSeen = new boolean[length];
        for (Map<String, Object> tile : snapshot.tiles) {
            if (tile == null) return false;
            int pos = number(tile.get("pos"), -1);
            int terrain = number(tile.get("terrain"), -1);
            if (pos < 0 || pos >= length || terrain < 0 || tileSeen[pos]) return false;
            tileSeen[pos] = true;
        }
        for (boolean seen : tileSeen) if (!seen) return false;
        if (!validPositions(snapshot.transitions, length, "pos", false)
                || !validPositions(snapshot.heaps, length, "pos", true)
                || !validPositions(snapshot.traps, length, "pos", true)
                || !validPositions(snapshot.plants, length, "pos", true)) return false;
        java.util.Set<Integer> mobIds = new java.util.HashSet<>();
        for (Map<String, Object> mob : snapshot.mobs) {
            if (mob == null) return false;
            int id = number(mob.get("mobId"), -1);
            int pos = number(mob.get("pos"), -1);
            int hp = number(mob.get("hp"), -1);
            int ht = number(mob.get("ht"), -1);
            if (id < 0 || !mobIds.add(id) || pos < 0 || pos >= length || hp < 0 || ht < 1 || hp > ht) return false;
            if (!bundleContains(mob.get("serializedBundle"), "mob", com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob.class)) return false;
            Object buffs = mob.get("buffs");
            if (buffs instanceof List) for (Object raw : (List<?>) buffs) {
                if (!(raw instanceof Map) || !bundleContains(((Map<?, ?>) raw).get("serializedBundle"), "buff", Buff.class)) return false;
            }
        }
        for (Map<String, Object> heap : snapshot.heaps) {
            Object items = heap.get("items");
            if (!(items instanceof List)) return false;
            for (Object raw : (List<?>) items) {
                if (!(raw instanceof Map) || !bundleContains(((Map<?, ?>) raw).get("serializedBundle"), "item", Item.class)) return false;
            }
        }
        for (Map<String, Object> trap : snapshot.traps)
            if (!bundleContains(trap.get("serializedBundle"), "trap", Trap.class)) return false;
        for (Map<String, Object> plant : snapshot.plants)
            if (!bundleContains(plant.get("serializedBundle"), "plant", Plant.class)) return false;
        for (Map<String, Object> blob : snapshot.blobs)
            if (!bundleContains(blob.get("serializedBundle"), "blob", Blob.class)) return false;
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

    private static boolean bundleContains(Object raw, String key, Class<?> expectedType) {
        if (!(raw instanceof String) || ((String) raw).isEmpty()) return false;
        Bundle bundle = readBundle((String) raw);
        if (bundle == null) return false;
        try { return expectedType.isInstance(bundle.get(key)); }
        catch (RuntimeException restoreError) { return false; }
    }

    public static boolean restoreWorld(WorldSnapshot snapshot) {
        if (!validateForRestore(snapshot)) {
            GLog.w("Rejected incomplete or invalid multiplayer world snapshot; live dungeon was left unchanged.");
            return false;
        }

        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()) return false;

        Dungeon.depth = snapshot.depth;
        Dungeon.branch = snapshot.branch;
        if (snapshot.dungeonSeed != 0L) Dungeon.seed = snapshot.dungeonSeed;

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
            }
            Game.runOnRenderThread(() -> {
                if (Dungeon.level != null) {
                    for (Map<String, Object> tile : snapshot.tiles) {
                        int pos = number(tile.get("pos"), -1);
                        if (pos >= 0 && pos < Dungeon.level.length()) GameScene.updateMap(pos);
                    }
                }
            });
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
                    } catch (RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
                }
            }
        }

        // Reconcile mobs and instantiate authoritative mobs missing locally.
        if (Dungeon.level != null && snapshot.mobs != null) {
            java.util.Set<com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob> authoritativeMobs = new java.util.HashSet<>();
            for (Map<String, Object> data : snapshot.mobs) {
                int id = number(data.get("mobId"), -1);
                int pos = number(data.get("pos"), -1);
                int hp = number(data.get("hp"), 1);
                int ht = number(data.get("ht"), 1);
                if (id < 0 || pos < 0 || pos >= Dungeon.level.length()) continue;
                // Dead mobs are authoritative tombstones: never deserialize and kill them again,
                // because Mob.die() may create loot and award rewards a second time.
                if (hp <= 0) continue;
                com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob matched = null;
                for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob : Dungeon.level.mobs) {
                    if (!authoritativeMobs.contains(mob) && mob.id() == id) { matched = mob; break; }
                }
                if (matched == null) {
                    String name = String.valueOf(data.get("name"));
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
                            GameScene.add(matched);
                        } else {
                            GLog.w("Snapshot mob bundle did not contain a native Mob for entity " + id);
                        }
                    } catch (LinkageError | RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
                }
                if (matched != null) {
                    int oldPos = matched.pos;
                    matched.HT = Math.max(1, ht);
                    if (hp <= 0) {
                        if (matched.isAlive() && Dungeon.hero != null) matched.die(Dungeon.hero);
                    } else {
                        matched.HP = Math.min(hp, matched.HT);
                        matched.pos = pos;
                        matched.restoreMultiplayerState(
                                String.valueOf(data.get("state")),
                                floatNumber(data.get("baseSpeed"), matched.multiplayerBaseSpeed()),
                                number(data.get("defenseSkill"), matched.defenseSkill),
                                floatNumber(data.get("cooldown"), 0f));
                        if (matched.sprite != null && oldPos != pos) matched.sprite.place(pos);
                    }
                }
                if (matched != null) {
                    authoritativeMobs.add(matched);
                    restoreMobBuffs(matched, data);
                }
            }
            for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob stale
                    : Dungeon.level.mobs.toArray(new com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob[0])) {
                if (!authoritativeMobs.contains(stale)) {
                    Dungeon.level.mobs.remove(stale);
                    stale.destroy();
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
                heap.pos = pos;
                try { heap.type = Heap.Type.valueOf(String.valueOf(data.get("type"))); }
                catch (RuntimeException ignored) { heap.type = Heap.Type.HEAP; }
                heap.seen = Boolean.TRUE.equals(data.get("seen"));
                heap.haunted = Boolean.TRUE.equals(data.get("haunted"));
                heap.hidden = Boolean.TRUE.equals(data.get("hidden"));
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
                                GLog.w("Snapshot item bundle did not contain a native Item at cell " + pos);
                                continue;
                            }
                            heap.drop(item);
                        } catch (RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
                    }
                }
                Dungeon.level.heaps.put(pos, heap);
                GameScene.updateMap(pos);
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
                        GLog.w("Snapshot trap bundle did not contain a native Trap at cell " + pos);
                        continue;
                    }
                    trap.pos = pos;
                    trap.active = Boolean.TRUE.equals(data.get("active"));
                    trap.visible = Boolean.TRUE.equals(data.get("visible"));
                    trap.reclaimed = Boolean.TRUE.equals(data.get("reclaimed"));
                    trap.color = number(data.get("color"), trap.color);
                    trap.shape = number(data.get("shape"), trap.shape);
                    Dungeon.level.traps.put(pos, trap);
                    GameScene.updateMap(pos);
                } catch (RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
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
                        GLog.w("Snapshot plant bundle did not contain a native Plant at cell " + pos);
                        continue;
                    }
                    plant.pos = pos;
                    Dungeon.level.plants.put(pos, plant);
                    GameScene.updateMap(pos);
                } catch (RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
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
                        GLog.w("Snapshot blob bundle did not contain a native Blob");
                        continue;
                    }
                    blob.restoreMultiplayerCooldown(floatNumber(data.get("cooldown"), 0f));
                    Dungeon.level.blobs.put(blob.getClass(), blob);
                    Actor.add(blob);
                } catch (RuntimeException restoreError) { GLog.w("Multiplayer snapshot restore failed: " + restoreError.getMessage()); }
            }
        }

        // Remove heaps already claimed by the authoritative server.
        if (Dungeon.level != null && snapshot.claimedItemPositions != null) {
            for (Integer itemPos : snapshot.claimedItemPositions) {
                if (itemPos != null && itemPos >= 0) {
                    Heap heap = Dungeon.level.heaps.get(itemPos);
                    if (heap != null) {
                        Dungeon.level.heaps.remove(itemPos);
                        if (heap.sprite != null) {
                            heap.sprite.remove();
                        }
                    }
                }
            }
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
                        Game.runOnRenderThread(() -> {
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
                        if (remote.heroInstance.sprite != null) {
                            remote.heroInstance.sprite.place(remote.pos);
                        }
                    }
                    restoreHeroState(remote.heroInstance, snapshot.playerStateJson.get(pId));
                }
            }
        }
        return true;
    }
}
