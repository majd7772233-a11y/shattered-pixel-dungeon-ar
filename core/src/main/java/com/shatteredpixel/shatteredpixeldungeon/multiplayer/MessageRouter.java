package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;

public class MessageRouter {

    public static void routeMessage(NetworkMessage message) {
        if (message == null || message.messageType == null) return;

        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()) return;

        switch (message.messageType) {
            case SESSION:
                handleSessionMessage(message);
                break;
            case SNAPSHOT:
                handleSnapshotMessage(message);
                break;
            case EVENT_BATCH:
                handleEventBatchMessage(message);
                break;
            case ACTION_ACCEPTED:
                handleActionAccepted(message);
                break;
            case ERROR:
                handleErrorMessage(message);
                break;
            default:
                RemotePlayerActionReceiver.handleNetworkMessage(message);
                break;
        }
    }

    private static void handleSessionMessage(NetworkMessage message) {
        if (message.payloadJson != null) {
            MultiplayerManager.getInstance().updateLastSequence(message.sequence != null ? message.sequence : 0);
        }
    }

    private static void handleSnapshotMessage(NetworkMessage message) {
        if (message.payloadJson == null) return;
        WorldSnapshot snapshot = new WorldSnapshot();
        snapshot.sequence = message.sequence != null ? message.sequence : 0;

        String json = message.payloadJson;
        int depth = parseKey(json, "\"depth\":");
        if (depth != -1) snapshot.depth = depth;

        int pos = parseKey(json, "\"pos\":");
        if (pos != -1 && message.senderId != null) {
            snapshot.playerPositions.put(message.senderId, pos);
        }

        WorldSnapshot.restoreWorld(snapshot);
    }

    private static void handleEventBatchMessage(NetworkMessage message) {
        if (message.payloadJson == null) return;

        if ("SERVER".equalsIgnoreCase(message.senderId)) {
            if (message.payloadJson.contains("MOB_MOVED") || message.payloadJson.contains("MOB_ATTACKED")) {
                handleServerMobEvent(message.payloadJson);
            }
        } else {
            RemotePlayerActionReceiver.handleNetworkMessage(message);
        }
    }

    private static void handleActionAccepted(NetworkMessage message) {
        if (message.sequence != null) {
            MultiplayerManager.getInstance().updateLastSequence(message.sequence);
        }
    }

    private static void handleErrorMessage(NetworkMessage message) {
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
}
