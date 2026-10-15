package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.HeroSprite;
import com.watabou.noosa.Game;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class WorldSnapshot {
    public long sequence;
    public int depth = 1;
    public long dungeonSeed;
    public String gameMode = "COOP_DUNGEON";
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
    public List<Map<String, Object>> transitions = new ArrayList<>();
    public List<Integer> claimedItemPositions = new ArrayList<>();

    public WorldSnapshot() {}

    public WorldSnapshot(long sequence, int depth, long dungeonSeed) {
        this.sequence = sequence;
        this.depth = depth;
        this.dungeonSeed = dungeonSeed;
    }

    private static int number(Object value, int fallback) {
        if (value instanceof Number) return ((Number) value).intValue();
        if (value != null) {
            try { return Integer.parseInt(String.valueOf(value)); } catch (RuntimeException ignored) {}
        }
        return fallback;
    }

    public static void restoreWorld(WorldSnapshot snapshot) {
        if (snapshot == null) return;

        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()) return;

        Dungeon.depth = snapshot.depth;
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
            if (snapshot.transitions != null && !snapshot.transitions.isEmpty()) {
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
                    } catch (RuntimeException ignored) { }
                }
            }
        }

        // Reconcile mobs and instantiate authoritative mobs missing locally.
        if (Dungeon.level != null && snapshot.mobs != null) {
            java.util.Set<Integer> seenMobIds = new java.util.HashSet<>();
            for (Map<String, Object> data : snapshot.mobs) {
                int id = number(data.get("mobId"), -1);
                int pos = number(data.get("pos"), -1);
                int hp = number(data.get("hp"), 1);
                int ht = number(data.get("ht"), 1);
                if (id < 0 || pos < 0 || pos >= Dungeon.level.length()) continue;
                seenMobIds.add(id);
                com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob matched = null;
                for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob : Dungeon.level.mobs) {
                    if (mob.id() == id) { matched = mob; break; }
                }
                if (matched == null) {
                    String name = String.valueOf(data.get("name"));
                    for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob : Dungeon.level.mobs) {
                        if (mob.getClass().getSimpleName().equals(name)) { matched = mob; break; }
                    }
                }
                if (matched == null) {
                    try {
                        Object instance = Class.forName("com.shatteredpixel.shatteredpixeldungeon.actors.mobs."
                                + String.valueOf(data.get("name"))).getDeclaredConstructor().newInstance();
                        if (instance instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) {
                            matched = (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) instance;
                            matched.pos = pos;
                            matched.HT = Math.max(1, ht);
                            matched.HP = Math.min(Math.max(1, hp), matched.HT);
                            Dungeon.level.mobs.add(matched);
                            GameScene.add(matched);
                        }
                    } catch (ReflectiveOperationException | LinkageError ignored) { }
                }
                if (matched != null) {
                    int oldPos = matched.pos;
                    matched.HT = Math.max(1, ht);
                    if (hp <= 0) {
                        if (matched.isAlive() && Dungeon.hero != null) matched.die(Dungeon.hero);
                    } else {
                        matched.HP = Math.min(hp, matched.HT);
                        matched.pos = pos;
                        if (matched.sprite != null && oldPos != pos) matched.sprite.place(pos);
                    }
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
                            Item item = (Item) Class.forName(String.valueOf(itemData.get("className"))).getDeclaredConstructor().newInstance();
                            int itemLevel = number(itemData.get("level"), 0);
                            if (itemLevel > 0) item.upgrade(itemLevel);
                            else if (itemLevel < 0) item.degrade(-itemLevel);
                            item.quantity(Math.max(1, number(itemData.get("quantity"), 1)));
                            item.cursed = Boolean.TRUE.equals(itemData.get("cursed"));
                            item.cursedKnown = Boolean.TRUE.equals(itemData.get("cursedKnown"));
                            heap.drop(item);
                        } catch (ReflectiveOperationException | ClassCastException ignored) { }
                    }
                }
                Dungeon.level.heaps.put(pos, heap);
                GameScene.updateMap(pos);
            }
            for (int i = Dungeon.level.heaps.size() - 1; i >= 0; i--) {
                int pos = Dungeon.level.heaps.keyAt(i);
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
                    Trap trap = (Trap) Class.forName(String.valueOf(data.get("className"))).getDeclaredConstructor().newInstance();
                    trap.pos = pos;
                    trap.active = Boolean.TRUE.equals(data.get("active"));
                    trap.visible = Boolean.TRUE.equals(data.get("visible"));
                    trap.reclaimed = Boolean.TRUE.equals(data.get("reclaimed"));
                    trap.color = number(data.get("color"), trap.color);
                    trap.shape = number(data.get("shape"), trap.shape);
                    Dungeon.level.traps.put(pos, trap);
                    GameScene.updateMap(pos);
                } catch (ReflectiveOperationException | ClassCastException ignored) { }
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
                }
            }
        }
    }
}
