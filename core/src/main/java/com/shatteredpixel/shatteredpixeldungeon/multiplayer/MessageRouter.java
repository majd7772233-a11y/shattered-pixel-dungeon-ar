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
                manager.updateLastSequence(message.sequence);
                applyAcceptedAction(message);
                break;
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

    private static void applyAcceptedAction(NetworkMessage message) {
        if (message.payloadJson == null) return;
        try {
            JsonValue payload = new JsonReader().parse(message.payloadJson);
            String eventType = stringValue(payload.get("eventType"), "");
            JsonValue action = payload.get("action");
            if (action == null || !action.isObject()) return;

            if ("PLAYER_MOVED".equals(eventType)) {
                String playerId = stringValue(action.get("playerId"), null);
                int pos = intValue(action.get("pos"), -1);
                if (playerId != null && playerId.equals(MultiplayerManager.getInstance().getLocalPlayerId())
                        && pos >= 0 && Dungeon.hero != null && Dungeon.level != null && pos < Dungeon.level.length()) {
                    int oldPos = Dungeon.hero.pos;
                    Dungeon.hero.pos = pos;
                    if (Dungeon.hero.sprite != null && oldPos != pos) Dungeon.hero.sprite.move(oldPos, pos);
                }
            } else if ("PLAYER_ATTACKED".equals(eventType)) {
                String targetType = stringValue(action.get("targetType"), "MOB");
                String targetId = stringValue(action.get("targetId"), null);
                int hp = intValue(action.get("targetHp"), -1);
                if ("PLAYER".equals(targetType) && targetId != null && hp >= 0) {
                    applyPlayerHp(targetId, hp);
                    String state = stringValue(action.get("targetState"), "ALIVE");
                    if ("DEAD".equals(state) || "SPECTATOR".equals(state)) applyPlayerDeath(targetId);
                } else if ("MOB".equals(targetType) && targetId != null && hp >= 0 && Dungeon.level != null) {
                    int mobId;
                    try { mobId = Integer.parseInt(targetId); } catch (NumberFormatException ignored) { return; }
                    for (Mob mob : Dungeon.level.mobs) {
                        if (mob.id() == mobId) {
                            mob.HP = hp;
                            if (hp <= 0) mob.die(Dungeon.hero);
                            break;
                        }
                    }
                }
            } else if ("ITEM_PICKED_UP".equals(eventType) || "CHEST_OPENED".equals(eventType)) {
                int itemPos = intValue(action.get("itemPos"), -1);
                if (itemPos >= 0 && Dungeon.level != null) {
                    com.shatteredpixel.shatteredpixeldungeon.items.Heap heap = Dungeon.level.heaps.get(itemPos);
                    if (heap != null) {
                        Dungeon.level.heaps.remove(itemPos);
                        if (heap.sprite != null) heap.sprite.remove();
                    }
                }
            }
        } catch (RuntimeException ignored) {
            // Keep local state intact if an acknowledgement payload is malformed.
        }
    }

    private static float floatValue(JsonValue value, float fallback) {
        if (value == null || !value.isNumber()) return fallback;
        return value.asFloat();
    }

    private static void readObjectArray(JsonValue array, java.util.List<java.util.Map<String, Object>> target) {
        if (array == null || !array.isArray()) return;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (!value.isObject()) continue;
            java.util.Map<String, Object> row = new java.util.HashMap<>();
            for (JsonValue field = value.child; field != null; field = field.next) {
                if (field.isNumber()) row.put(field.name, field.asDouble());
                else if (field.isBoolean()) row.put(field.name, field.asBoolean());
                else if (field.isString()) row.put(field.name, field.asString());
                else if (field.isNull()) row.put(field.name, null);
                else if (field.isArray()) {
                    java.util.List<java.util.Map<String, Object>> nested = new java.util.ArrayList<>();
                    readObjectArray(field, nested);
                    row.put(field.name, nested);
                }
            }
            target.add(row);
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

            JsonValue level = root.get("level");
            if (level != null && level.isObject()) {
                snapshot.levelWidth = intValue(level.get("width"), 0);
                snapshot.levelHeight = intValue(level.get("height"), 0);
                snapshot.entrancePos = intValue(level.get("entrancePos"), -1);
                snapshot.exitPos = intValue(level.get("exitPos"), -1);
                JsonValue tiles = level.get("tiles");
                if (tiles != null && tiles.isArray()) {
                    for (JsonValue tile = tiles.child; tile != null; tile = tile.next) {
                        java.util.Map<String, Object> row = new java.util.HashMap<>();
                        row.put("pos", intValue(tile.get("pos"), -1));
                        row.put("terrain", intValue(tile.get("terrain"), -1));
                        row.put("passable", intValue(tile.get("passable"), 0));
                        row.put("solid", intValue(tile.get("solid"), 0));
                        row.put("pit", intValue(tile.get("pit"), 0));
                        row.put("losBlocking", intValue(tile.get("los_blocking"), intValue(tile.get("losBlocking"), 0)));
                        snapshot.tiles.add(row);
                    }
                }
                readObjectArray(level.get("transitions"), snapshot.transitions);
                readObjectArray(level.get("heaps"), snapshot.heaps);
                readObjectArray(level.get("traps"), snapshot.traps);
                JsonValue levelMobs = level.get("mobs");
                if (levelMobs != null && levelMobs.isArray()) {
                    snapshot.mobs.clear();
                    for (JsonValue mob = levelMobs.child; mob != null; mob = mob.next) {
                        java.util.Map<String, Object> row = new java.util.HashMap<>();
                        row.put("mobId", intValue(mob.get("mob_id"), intValue(mob.get("mobId"), -1)));
                        row.put("name", stringValue(mob.get("name"), "Mob"));
                        row.put("pos", intValue(mob.get("pos"), -1));
                        row.put("hp", intValue(mob.get("hp"), 1));
                        row.put("ht", intValue(mob.get("ht"), 1));
                        row.put("state", stringValue(mob.get("state"), ""));
                        row.put("defenseSkill", intValue(mob.get("defenseSkill"), 0));
                        row.put("baseSpeed", floatValue(mob.get("baseSpeed"), 1f));
                        row.put("cooldown", floatValue(mob.get("cooldown"), 0f));
                        snapshot.mobs.add(row);
                    }
                }
            }

            JsonValue players = root.get("players");
            if (players != null && players.isArray()) {
                for (JsonValue player = players.child; player != null; player = player.next) {
                    String id = stringValue(player.get("player_id"), stringValue(player.get("playerId"), null));
                    if (id == null || id.length() == 0) continue;
                    snapshot.playerPositions.put(id, intValue(player.get("pos"), -1));
                    snapshot.playerHp.put(id, intValue(player.get("hp"), 20));
                    snapshot.playerHt.put(id, intValue(player.get("ht"), 20));
                    snapshot.playerClasses.put(id, stringValue(player.get("class_name"), "WARRIOR"));
                    String heroState = stringValue(player.get("hero_state_json"), "");
                    if (!heroState.isEmpty()) snapshot.playerStateJson.put(id, heroState);
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
                } else if ("PLAYER_MOVED".equals(type)) {
                    String playerId = stringValue(action.get("playerId"), message.senderId);
                    int pos = intValue(action.get("pos"), -1);
                    if (playerId != null && pos >= 0) {
                        WorldSnapshot delta = new WorldSnapshot(seq, intValue(event.get("depth"), 1), 0L);
                        delta.playerPositions.put(playerId, pos);
                        WorldSnapshot.restoreWorld(delta);
                    }
                } else if ("PLAYER_ATTACKED".equals(type)) {
                    String targetType = stringValue(action.get("targetType"), "MOB");
                    String targetId = stringValue(action.get("targetId"), null);
                    int hp = intValue(action.get("targetHp"), -1);
                    if ("PLAYER".equals(targetType) && targetId != null && hp >= 0) {
                        applyPlayerHp(targetId, hp);
                        String state = stringValue(action.get("targetState"), "ALIVE");
                        if ("SPECTATOR".equals(state) || "DEAD".equals(state)) applyPlayerDeath(targetId);
                    }
                } else if ("CHAR_DIED".equals(type)) {
                    String playerId = stringValue(action.get("playerId"), stringValue(action.get("targetPlayerId"), null));
                    if (playerId != null) applyPlayerDeath(playerId);
                } else if ("PLAYER_REVIVED".equals(type)) {
                    String playerId = stringValue(action.get("playerId"), null);
                    int hp = intValue(action.get("hp"), -1);
                    if (playerId != null && hp >= 0) applyPlayerHp(playerId, hp);
                } else if ("ITEM_PICKED_UP".equals(type) || "CHEST_OPENED".equals(type)) {
                    int itemPos = intValue(action.get("itemPos"), -1);
                    if (itemPos >= 0 && Dungeon.level != null) {
                        com.shatteredpixel.shatteredpixeldungeon.items.Heap heap = Dungeon.level.heaps.get(itemPos);
                        if (heap != null) {
                            Dungeon.level.heaps.remove(itemPos);
                            if (heap.sprite != null) heap.sprite.remove();
                        }
                    }
                } else if ("LEVEL_TRANSITION".equals(type)) {
                    // The authoritative level snapshot that follows a transition is required
                    // before changing local geometry; never synthesize a floor from depth alone.
                    MultiplayerManager.getInstance().updateLastSequence(seq);
                } else if ("MATCH_END".equals(type)) {
                    MultiplayerManager.getInstance().updateLastSequence(seq);
                }
            }
        } catch (RuntimeException ignored) {
            // Keep the last known good world; caller can request a fresh snapshot.
        }
    }

    private static void applyPlayerHp(String playerId, int hp) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (playerId.equals(manager.getLocalPlayerId())) {
            if (Dungeon.hero != null) Dungeon.hero.HP = Math.max(0, hp);
            return;
        }
        RemotePlayer remote = manager.getRemotePlayer(playerId);
        if (remote == null) {
            remote = new RemotePlayer(playerId, "Player", "WARRIOR");
            manager.addRemotePlayer(remote);
        }
        remote.hp = Math.max(0, hp);
        if (remote.heroInstance != null) remote.heroInstance.HP = remote.hp;
    }

    private static void applyPlayerDeath(String playerId) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (playerId.equals(manager.getLocalPlayerId())) {
            if (Dungeon.hero != null) Dungeon.hero.HP = 0;
            return;
        }
        RemotePlayer remote = manager.getRemotePlayer(playerId);
        if (remote == null) {
            remote = new RemotePlayer(playerId, "Player", "WARRIOR");
            manager.addRemotePlayer(remote);
        }
        remote.isAlive = false;
        remote.hp = 0;
        if (remote.heroInstance != null) {
            remote.heroInstance.HP = 0;
            if (remote.heroInstance.sprite != null) remote.heroInstance.sprite.die();
        }
    }

    private static void applyMobEvent(String type, JsonValue action) {
        if (Dungeon.level == null) return;
        int mobId = intValue(action.get("mobId"), -1);
        if (mobId < 0) return;

        for (Mob mob : Dungeon.level.mobs) {
            if (mob.id() != mobId) continue;
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
        try { return value.asString(); } catch (RuntimeException ignored) {
            return value.isNumber() ? value.toString() : fallback;
        }
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
