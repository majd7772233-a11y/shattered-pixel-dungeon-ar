package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.HeroSprite;
import com.watabou.noosa.Game;

public class RemotePlayerActionReceiver {

    public static void handleNetworkMessage(NetworkMessage message) {
        if (message == null || message.payloadJson == null) return;

        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()) return;

        String unescaped = unescapeJson(message.payloadJson);

        // Handle Server Mob Events
        if ("SERVER".equalsIgnoreCase(message.senderId) || unescaped.contains("MOB_MOVED") || unescaped.contains("MOB_ATTACKED")) {
            handleServerMobEvent(unescaped);
            return;
        }

        // Handle Remote Hero Events
        if (message.senderId != null && !message.senderId.equals(manager.getLocalPlayerId())) {
            RemotePlayer remote = manager.getRemotePlayer(message.senderId);
            if (remote == null) {
                remote = new RemotePlayer(message.senderId, "Player", "WARRIOR");
                setupRemoteHeroInstance(remote);
                manager.addRemotePlayer(remote);
            }

            // Handle SNAPSHOT
            if (message.messageType == MessageType.SNAPSHOT || unescaped.contains("\"snapshot\"") || unescaped.contains("\"missingEvents\"")) {
                parseAndApplySnapshot(unescaped, remote);
            }

            // Handle PLAYER_MOVED
            if (message.messageType == MessageType.EVENT_BATCH || unescaped.contains("PLAYER_MOVED") || unescaped.contains("\"action\":\"MOVE\"")) {
                int newPos = parsePositionKey(unescaped);
                if (newPos != -1) {
                    int oldPos = remote.pos;
                    remote.pos = newPos;
                    if (remote.heroInstance != null) {
                        remote.heroInstance.pos = newPos;
                        if (remote.heroInstance.sprite != null) {
                            remote.heroInstance.sprite.move(oldPos, newPos);
                        }
                    }
                }
            }

            // Handle ITEM_PICKED_UP / CHEST_OPENED
            if (unescaped.contains("ITEM_PICKED_UP") || unescaped.contains("CHEST_OPENED") || unescaped.contains("\"action\":\"PICKUP\"")) {
                int itemPos = parsePositionKey(unescaped);
                if (itemPos != -1 && Dungeon.level != null) {
                    Heap heap = Dungeon.level.heaps.get(itemPos);
                    if (heap != null) {
                        Dungeon.level.heaps.remove(itemPos);
                        if (heap.sprite != null) {
                            heap.sprite.remove();
                        }
                    }
                }
            }

            // Handle CHAR_DAMAGED / CHAR_DIED / PLAYER_REVIVED
            if (unescaped.contains("CHAR_DAMAGED") || unescaped.contains("\"hp\":")) {
                int hp = parseHpKey(unescaped);
                if (hp != -1) {
                    remote.hp = hp;
                    if (remote.heroInstance != null) {
                        remote.heroInstance.HP = hp;
                    }
                }
            }

            if (unescaped.contains("CHAR_DIED")) {
                remote.isAlive = false;
                if (remote.heroInstance != null) {
                    remote.heroInstance.HP = 0;
                    if (remote.heroInstance.sprite != null) {
                        remote.heroInstance.sprite.die();
                    }
                }
            }

            if (unescaped.contains("PLAYER_REVIVED") || unescaped.contains("\"action\":\"REVIVE\"")) {
                remote.isAlive = true;
                remote.hp = remote.ht / 2;
                if (remote.heroInstance != null) {
                    remote.heroInstance.HP = remote.heroInstance.HT / 2;
                    if (remote.heroInstance.sprite != null) {
                        remote.heroInstance.sprite.idle();
                    }
                }
            }
        }
    }

    private static void handleServerMobEvent(String json) {
        if (Dungeon.level == null) return;

        int mobId = parseKey(json, "\"mobId\":");
        int toPos = parseKey(json, "\"toPos\":");
        int damage = parseKey(json, "\"damage\":");

        if (mobId != -1) {
            for (Mob mob : Dungeon.level.mobs) {
                if (mob.id == mobId) {
                    if (toPos != -1) {
                        int fromPos = mob.pos;
                        mob.pos = toPos;
                        if (mob.sprite != null) {
                            mob.sprite.move(fromPos, toPos);
                        }
                    }
                    if (damage > 0) {
                        mob.damage(damage, "SERVER");
                    }
                    break;
                }
            }
        }
    }

    private static void setupRemoteHeroInstance(RemotePlayer remote) {
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
        }
    }

    private static void parseAndApplySnapshot(String json, RemotePlayer remote) {
        int pos = parsePositionKey(json);
        if (pos != -1) {
            remote.pos = pos;
            if (remote.heroInstance != null) {
                remote.heroInstance.pos = pos;
            }
        }
        int hp = parseHpKey(json);
        if (hp != -1) {
            remote.hp = hp;
            if (remote.heroInstance != null) {
                remote.heroInstance.HP = hp;
            }
        }
    }

    private static String unescapeJson(String input) {
        if (input == null) return "";
        return input.replace("\\\"", "\"").replace("\\\\", "\\");
    }

    private static int parseKey(String json, String key) {
        if (json != null && json.contains(key)) {
            try {
                int posIdx = json.indexOf(key) + key.length();
                int endIdx = json.indexOf("}", posIdx);
                if (endIdx == -1) endIdx = json.indexOf(",", posIdx);
                if (endIdx != -1) {
                    String str = json.substring(posIdx, endIdx).replace("\"", "").trim();
                    return Integer.parseInt(str);
                }
            } catch (Exception ignored) {}
        }
        return -1;
    }

    private static int parsePositionKey(String json) {
        String[] keys = {"\"to\":", "\"itemPos\":", "\"stairsPos\":", "\"targetPos\":", "\"pos\":", "\"from\":"};
        for (String key : keys) {
            int val = parseKey(json, key);
            if (val != -1) return val;
        }
        return -1;
    }

    private static int parseHpKey(String json) {
        return parseKey(json, "\"hp\":");
    }
}
