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

    public static void restoreWorld(WorldSnapshot snapshot) {
        if (snapshot == null) return;

        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()) return;

        Dungeon.depth = snapshot.depth;

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

                if (!pId.equals(manager.getLocalPlayerId())) {
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

                        Game.runOnRenderThread(() -> {
                            if (GameScene.scene() != null) {
                                HeroSprite sprite = new HeroSprite();
                                remote.heroInstance.sprite = sprite;
                                sprite.link(remote.heroInstance);
                                GameScene.scene().add(sprite);
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
