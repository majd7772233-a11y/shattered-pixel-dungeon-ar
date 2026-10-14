package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
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
                if (Dungeon.level != null) GameScene.updateMap();
            });
        }

        // Reconcile mobs already created by the local SPD level generation.
        if (Dungeon.level != null && snapshot.mobs != null) {
            java.util.Set<Integer> seenMobIds = new java.util.HashSet<>();
            for (Map<String, Object> data : snapshot.mobs) {
                int id = number(data.get("mobId"), -1);
                int pos = number(data.get("pos"), -1);
                int hp = number(data.get("hp"), 1);
                int ht = number(data.get("ht"), 1);
                if (id < 0 || pos < 0 || pos >= Dungeon.level.length()) continue;
                seenMobIds.add(id);
                for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob : Dungeon.level.mobs) {
                    if (mob.id() == id) {
                        int oldPos = mob.pos;
                        mob.pos = pos;
                        mob.HP = Math.max(0, Math.min(hp, Math.max(1, ht)));
                        mob.HT = Math.max(1, ht);
                        if (mob.sprite != null && oldPos != pos) mob.sprite.place(pos);
                        break;
                    }
                }
            }
        }

        // Restore Claimed Heaps / Items
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

                if (pId != null && !pId.equals(manager.getLocalPlayerId()) && entry.getValue() != null && entry.getValue() >= 0) {
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
