package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;

public class RemotePlayerActionReceiver {

    public static void handleNetworkMessage(NetworkMessage message) {
        if (message == null || message.payloadJson == null) return;

        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()) return;

        if (message.senderId != null && !message.senderId.equals(manager.getLocalPlayerId())) {
            RemotePlayer remote = manager.getRemotePlayer(message.senderId);
            if (remote == null) {
                remote = new RemotePlayer(message.senderId, "Player", "WARRIOR");
                remote.heroInstance = new Hero();
                remote.heroInstance.pos = remote.pos;
                manager.addRemotePlayer(remote);
            }

            String unescaped = unescapeJson(message.payloadJson);

            // Handle PLAYER_MOVED
            if (message.messageType == MessageType.EVENT_BATCH || unescaped.contains("PLAYER_MOVED") || unescaped.contains("\"action\":\"MOVE\"")) {
                int newPos = parsePositionKey(unescaped);
                if (newPos != -1) {
                    remote.pos = newPos;
                    if (remote.heroInstance == null) {
                        remote.heroInstance = new Hero();
                    }
                    remote.heroInstance.pos = newPos;
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
                }
            }

            if (unescaped.contains("PLAYER_REVIVED") || unescaped.contains("\"action\":\"REVIVE\"")) {
                remote.isAlive = true;
                remote.hp = remote.ht / 2;
                if (remote.heroInstance != null) {
                    remote.heroInstance.HP = remote.heroInstance.HT / 2;
                }
            }
        }
    }

    private static String unescapeJson(String input) {
        if (input == null) return "";
        return input.replace("\\\"", "\"").replace("\\\\", "\\");
    }

    private static int parsePositionKey(String json) {
        String[] keys = {"\"to\":", "\"itemPos\":", "\"stairsPos\":", "\"targetPos\":", "\"pos\":", "\"from\":"};
        for (String key : keys) {
            if (json.contains(key)) {
                try {
                    int posIdx = json.indexOf(key) + key.length();
                    int endIdx = json.indexOf("}", posIdx);
                    if (endIdx == -1) endIdx = json.indexOf(",", posIdx);
                    if (endIdx != -1) {
                        String posStr = json.substring(posIdx, endIdx).replace("\"", "").trim();
                        return Integer.parseInt(posStr);
                    }
                } catch (Exception ignored) {}
            }
        }
        return -1;
    }

    private static int parseHpKey(String json) {
        if (json.contains("\"hp\":")) {
            try {
                int posIdx = json.indexOf("\"hp\":") + 5;
                int endIdx = json.indexOf("}", posIdx);
                if (endIdx == -1) endIdx = json.indexOf(",", posIdx);
                if (endIdx != -1) {
                    String hpStr = json.substring(posIdx, endIdx).replace("\"", "").trim();
                    return Integer.parseInt(hpStr);
                }
            } catch (Exception ignored) {}
        }
        return -1;
    }
}
