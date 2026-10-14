package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;

public final class MessageRouter {

    private MessageRouter() {}

    public static void routeMessage(NetworkMessage message) {
        if (message == null || message.messageType == null) return;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()) return;

        switch (message.messageType) {
            case SESSION:
                manager.updateLastSequence(message.sequence);
                break;
            case SNAPSHOT:
                handleSnapshotMessage(message);
                break;
            case EVENT_BATCH:
                handleEventBatchMessage(message);
                break;
            case ACTION_ACCEPTED:
            case ACK:
                manager.updateLastSequence(message.sequence);
                break;
            case MATCH_END:
                manager.updateLastSequence(message.sequence);
                break;
            case ERROR:
                handleErrorMessage(message);
                break;
            default:
                RemotePlayerActionReceiver.handleNetworkMessage(message);
                break;
        }
    }

    private static void handleSnapshotMessage(NetworkMessage message) {
        if (message.payloadJson == null) return;
        try {
            JsonValue root = new JsonReader().parse(message.payloadJson);
            if (root == null || !root.isObject()) return;

            WorldSnapshot snapshot = new WorldSnapshot();
            snapshot.sequence = longValue(root.get("sequence"), message.sequence);
            snapshot.depth = intValue(root.get("depth"), 1);
            snapshot.dungeonSeed = longValue(root.get("seed"), 0L);
            snapshot.gameMode = stringValue(root.get("gameMode"), "COOP_DUNGEON");

            JsonValue players = root.get("players");
            if (players != null && players.isArray()) {
                for (JsonValue player = players.child; player != null; player = player.next) {
                    String id = stringValue(player.get("player_id"), stringValue(player.get("playerId"), null));
                    if (id == null || id.length() == 0) continue;
                    snapshot.playerPositions.put(id, intValue(player.get("pos"), -1));
                    snapshot.playerHp.put(id, intValue(player.get("hp"), 20));
                    snapshot.playerHt.put(id, intValue(player.get("ht"), 20));
                    snapshot.playerClasses.put(id, stringValue(player.get("class_name"), "WARRIOR"));
                }
            } else {
                // SESSION-style snapshots from protocol 1.0 may contain one player at the root.
                String id = message.senderId;
                int pos = intValue(root.get("pos"), -1);
                if (id != null && pos >= 0) {
                    snapshot.playerPositions.put(id, pos);
                    snapshot.playerHp.put(id, intValue(root.get("hp"), 20));
                    snapshot.playerHt.put(id, intValue(root.get("ht"), 20));
                }
            }

            JsonValue claims = root.get("claims");
            if (claims != null && claims.isArray()) {
                for (JsonValue claim = claims.child; claim != null; claim = claim.next) {
                    int pos = intValue(claim.get("item_pos"), -1);
                    if (pos >= 0) snapshot.claimedItemPositions.add(pos);
                }
            }

            JsonValue mobs = root.get("mobs");
            if (mobs != null && mobs.isArray()) {
                for (JsonValue mob = mobs.child; mob != null; mob = mob.next) {
                    java.util.Map<String, Object> row = new java.util.HashMap<>();
                    row.put("mobId", intValue(mob.get("mob_id"), intValue(mob.get("mobId"), -1)));
                    row.put("name", stringValue(mob.get("name"), "Mob"));
                    row.put("pos", intValue(mob.get("pos"), -1));
                    row.put("hp", intValue(mob.get("hp"), 1));
                    row.put("ht", intValue(mob.get("ht"), 1));
                    snapshot.mobs.add(row);
                }
            }

            MultiplayerManager.getInstance().updateLastSequence(snapshot.sequence);
            WorldSnapshot.restoreWorld(snapshot);
        } catch (RuntimeException ignored) {
            // Ignore malformed snapshots; the transport can request RESYNC rather than corrupt state.
        }
    }

    private static void handleEventBatchMessage(NetworkMessage message) {
        if (message.payloadJson == null) return;
        try {
            JsonValue events = new JsonReader().parse(message.payloadJson);
            if (events == null || !events.isArray()) {
                RemotePlayerActionReceiver.handleNetworkMessage(message);
                return;
            }

            for (JsonValue event = events.child; event != null; event = event.next) {
                long seq = longValue(event.get("sequence"), message.sequence);
                MultiplayerManager.getInstance().updateLastSequence(seq);
                String type = stringValue(event.get("eventType"), "");
                JsonValue action = event.get("action");
                if (action == null || !action.isObject()) continue;

                if ("MOB_MOVED".equals(type) || "MOB_ATTACKED".equals(type) || "CHAR_DAMAGED".equals(type)) {
                    applyMobEvent(type, action);
                } else if ("PLAYER_MOVED".equals(type) || "PLAYER_ATTACKED".equals(type)
                        || "CHAR_DIED".equals(type) || "PLAYER_REVIVED".equals(type)
                        || "ITEM_PICKED_UP".equals(type) || "CHEST_OPENED".equals(type)
                        || "LEVEL_TRANSITION".equals(type)) {
                    // Reuse the established event adapter only after structurally identifying
                    // the event envelope. Server messages are not gated on senderId being a player.
                    NetworkMessage eventMessage = new NetworkMessage();
                    eventMessage.messageType = MessageType.EVENT_BATCH;
                    eventMessage.senderId = stringValue(action.get("playerId"),
                            stringValue(action.get("targetPlayerId"), message.senderId));
                    eventMessage.sequence = seq;
                    eventMessage.payloadJson = action.toString().replace("\\", "\\\\").replace("\"", "\\\"");
                    RemotePlayerActionReceiver.handleNetworkMessage(eventMessage);
                } else if ("MATCH_END".equals(type)) {
                    MultiplayerManager.getInstance().updateLastSequence(seq);
                }
            }
        } catch (RuntimeException ignored) {
            // Keep the last known good world; caller can request a fresh snapshot.
        }
    }

    private static void applyMobEvent(String type, JsonValue action) {
        if (Dungeon.level == null) return;
        int mobId = intValue(action.get("mobId"), -1);
        if (mobId < 0) return;

        for (Mob mob : Dungeon.level.mobs) {
            if (mob.id != mobId) continue;
            int toPos = intValue(action.get("toPos"), -1);
            if (toPos >= 0 && toPos < Dungeon.level.length()) {
                int fromPos = mob.pos;
                mob.pos = toPos;
                if (mob.sprite != null && fromPos != toPos) mob.sprite.move(fromPos, toPos);
            }
            if ("MOB_ATTACKED".equals(type)) {
                // Player damage is represented in the event; do not damage the mob for a mob attack.
                // HP reconciliation for players is handled by the player event adapter.
            } else if ("CHAR_DAMAGED".equals(type)) {
                int damage = intValue(action.get("damage"), 0);
                if (damage > 0) mob.damage(damage, "SERVER");
            }
            return;
        }
    }

    private static void handleErrorMessage(NetworkMessage message) {
        // Keep the action pending state in MultiplayerManager available for retry/resync policy.
    }

    private static String stringValue(JsonValue value, String fallback) {
        if (value == null || value.isNull()) return fallback;
        try { return value.asString(); } catch (RuntimeException ignored) { return fallback; }
    }

    private static int intValue(JsonValue value, int fallback) {
        if (value == null || value.isNull()) return fallback;
        try { return value.asInt(); } catch (RuntimeException ignored) { return fallback; }
    }

    private static long longValue(JsonValue value, long fallback) {
        if (value == null || value.isNull()) return fallback;
        try { return value.asLong(); } catch (RuntimeException ignored) { return fallback; }
    }
}
