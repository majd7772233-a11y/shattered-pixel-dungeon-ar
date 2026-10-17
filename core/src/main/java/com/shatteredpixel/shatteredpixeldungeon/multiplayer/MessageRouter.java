package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.watabou.noosa.Game;

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
                // Event batches update native actors, hero state, sprites and loot. Transport
                // callbacks may run off-thread, so serialize their application with game turns.
                Game.runOnRenderThread(() -> handleEventBatchMessage(message));
                break;
            case COMBAT_REQUEST:
                handleCombatRequest(message);
                break;
            case ACTION_ACCEPTED:
                Game.runOnRenderThread(() -> {
                    manager.updateLastSequence(message.sequence);
                    applyAcceptedAction(message);
                });
                break;
            case ACK:
                manager.updateLastSequence(message.sequence);
                manager.handleServerEntityAck(message);
                break;
            case MATCH_END:
                manager.updateLastSequence(message.sequence);
                break;
            case ERROR:
                handleErrorMessage(message);
                break;
            default:
                Game.runOnRenderThread(() -> RemotePlayerActionReceiver.handleNetworkMessage(message));
                break;
        }
    }

    private static void handleCombatRequest(NetworkMessage message) {
        if (message == null || message.payloadJson == null) return;
        // Network transports deliver callbacks on their own thread. Native SPD combat touches
        // Actor scheduling, Dungeon state, sprites and inventory; run it only on the game thread.
        Game.runOnRenderThread(() -> handleCombatRequestOnRenderThread(message));
    }

    private static void handleCombatRequestOnRenderThread(NetworkMessage message) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive() || Dungeon.level == null || Dungeon.hero == null) return;
        try {
            JsonValue payload = new JsonReader().parse(message.payloadJson);
            String requestId = stringValue(payload.get("requestId"), message.requestId);
            String attackerId = stringValue(payload.get("attackerId"), null);
            String targetType = stringValue(payload.get("targetType"), "MOB");
            String targetEntityId = stringValue(payload.get("targetEntityId"), null);
            String targetPlayerId = stringValue(payload.get("targetPlayerId"), null);
            String attackerStateBefore = stringValue(payload.get("attackerStateBefore"), null);
            String attackWeaponMode = stringValue(payload.get("attackWeaponMode"), "EQUIPPED");
            String attackWeaponBundle = stringValue(payload.get("attackWeaponBundle"), "");
            float damageMultiplier = floatValue(payload.get("damageMultiplier"), 1f);
            float damageBonus = floatValue(payload.get("damageBonus"), 0f);
            float accuracyMultiplier = floatValue(payload.get("accuracyMultiplier"), 1f);
            int attackerPos = intValue(payload.get("attackerPos"), -1);
            if (requestId == null || attackerId == null || attackerStateBefore == null
                    || attackerPos < 0 || attackerPos >= Dungeon.level.length()
                    || ("MOB".equals(targetType) && (!manager.isLevelPublisher() || targetEntityId == null))
                    || ("PLAYER".equals(targetType) && (!manager.getLocalPlayerId().equals(targetPlayerId)
                        || Dungeon.hero == null || Dungeon.hero.HP <= 0))
                    || (!"MOB".equals(targetType) && !"PLAYER".equals(targetType))) {
                manager.requestResync(manager.getLastSequence());
                return;
            }
            com.shatteredpixel.shatteredpixeldungeon.actors.Char target;
            if ("PLAYER".equals(targetType)) {
                target = Dungeon.hero;
            } else {
                Integer localMobId = manager.getLocalActorIdForServerEntity(targetEntityId);
                if (localMobId == null) {
                    manager.requestResync(manager.getLastSequence());
                    return;
                }
                Mob mobTarget = null;
                for (Mob candidate : Dungeon.level.mobs) {
                    if (candidate.id() == localMobId) { mobTarget = candidate; break; }
                }
                target = mobTarget;
            }
            if (target == null || target.HP <= 0) {
                manager.requestResync(manager.getLastSequence());
                return;
            }
            RemotePlayer remote = manager.getRemotePlayer(attackerId);
            if (remote == null) {
                remote = new RemotePlayer(attackerId, "Player", "WARRIOR");
                manager.addRemotePlayer(remote);
            }
            RemotePlayerActionReceiver.setupRemoteHeroInstance(remote);
            com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero remoteHero =
                    (com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero) remote.heroInstance;
            WorldSnapshot.restoreRemoteHeroState(remoteHero, attackerStateBefore);
            remoteHero.pos = attackerPos;
            com.shatteredpixel.shatteredpixeldungeon.items.weapon.KindOfWeapon chosenWeapon = null;
            if ("THROWN".equals(attackWeaponMode) || "ABILITY".equals(attackWeaponMode)) {
                chosenWeapon = SPDLevelSnapshot.findOwnedAttackWeapon(remoteHero, attackWeaponBundle);
                if (chosenWeapon == null || ("THROWN".equals(attackWeaponMode)
                        && !(chosenWeapon instanceof com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon))) {
                    manager.requestResync(manager.getLastSequence());
                    return;
                }
            } else if (!"EQUIPPED".equals(attackWeaponMode) && !"UNARMED".equals(attackWeaponMode)) {
                manager.requestResync(manager.getLastSequence());
                return;
            } else if ("EQUIPPED".equals(attackWeaponMode)) {
                com.shatteredpixel.shatteredpixeldungeon.items.weapon.KindOfWeapon equipped =
                        remoteHero.belongings == null ? null : remoteHero.belongings.weapon();
                String equippedBundle = equipped == null ? "" : SPDLevelSnapshot.currentItemBundle(equipped);
                if (!equippedBundle.equals(attackWeaponBundle)) {
                    manager.requestResync(manager.getLastSequence());
                    return;
                }
            } else if ("UNARMED".equals(attackWeaponMode)
                    && remoteHero.belongings != null && remoteHero.belongings.weapon() != null) {
                manager.requestResync(manager.getLastSequence());
                return;
            }
            com.shatteredpixel.shatteredpixeldungeon.items.weapon.KindOfWeapon previousThrown = remoteHero.belongings.thrownWeapon;
            com.shatteredpixel.shatteredpixeldungeon.items.weapon.KindOfWeapon previousAbility = remoteHero.belongings.abilityWeapon;
            manager.beginAuthorityCombat(requestId);
            try {
                remoteHero.belongings.thrownWeapon = null;
                remoteHero.belongings.abilityWeapon = null;
                if ("THROWN".equals(attackWeaponMode)) {
                    remoteHero.shoot(target,
                            (com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon) chosenWeapon);
                } else {
                    if ("ABILITY".equals(attackWeaponMode)) remoteHero.belongings.abilityWeapon = chosenWeapon;
                    remoteHero.attack(target, damageMultiplier, damageBonus, accuracyMultiplier);
                }
            } finally {
                remoteHero.belongings.thrownWeapon = previousThrown;
                remoteHero.belongings.abilityWeapon = previousAbility;
                manager.endAuthorityCombat();
            }
        } catch (RuntimeException error) {
            manager.requestResync(manager.getLastSequence());
        }
    }

    private static void applyAcceptedAction(NetworkMessage message) {
        if (message.payloadJson == null) return;
        try {
            JsonValue payload = new JsonReader().parse(message.payloadJson);
            String eventType = stringValue(payload.get("eventType"), "");
            JsonValue action = payload.get("action");
            if (action == null || !action.isObject()) return;

            // The native authority also resolves attacker-side procs, cooldown and reactive
            // damage. Replace the attacker's optimistic state with that accepted native result.
            String eventAttackerId = stringValue(action.get("attackerId"), null);
            String attackerStateJson = stringValue(action.get("attackerStateJson"), "");
            if (eventAttackerId != null && !attackerStateJson.isEmpty() && !"null".equals(attackerStateJson)) {
                MultiplayerManager manager = MultiplayerManager.getInstance();
                if (eventAttackerId.equals(manager.getLocalPlayerId()) && Dungeon.hero != null) {
                    int oldHeroPos = Dungeon.hero.pos;
                    WorldSnapshot.restoreRemoteHeroState(Dungeon.hero, attackerStateJson);
                    if (Dungeon.hero.sprite != null && oldHeroPos != Dungeon.hero.pos) {
                        Dungeon.hero.sprite.move(oldHeroPos, Dungeon.hero.pos);
                    }
                } else {
                    RemotePlayer remoteAttacker = manager.getRemotePlayer(eventAttackerId);
                    if (remoteAttacker == null) {
                        remoteAttacker = new RemotePlayer(eventAttackerId, "Player", "WARRIOR");
                        RemotePlayerActionReceiver.setupRemoteHeroInstance(remoteAttacker);
                        manager.addRemotePlayer(remoteAttacker);
                    }
                    if (remoteAttacker.heroInstance != null) {
                        int oldHeroPos = remoteAttacker.heroInstance.pos;
                        WorldSnapshot.restoreRemoteHeroState(remoteAttacker.heroInstance, attackerStateJson);
                        remoteAttacker.hp = remoteAttacker.heroInstance.HP;
                        remoteAttacker.ht = remoteAttacker.heroInstance.HT;
                        remoteAttacker.pos = remoteAttacker.heroInstance.pos;
                        if (remoteAttacker.heroInstance.sprite != null && oldHeroPos != remoteAttacker.heroInstance.pos) {
                            remoteAttacker.heroInstance.sprite.move(oldHeroPos, remoteAttacker.heroInstance.pos);
                        }
                    } else {
                        manager.requestResync(message.sequence);
                    }
                }
                String attackerStatus = stringValue(action.get("attackerState"), "ALIVE");
                if ("DEAD".equals(attackerStatus) || "SPECTATOR".equals(attackerStatus)) {
                    applyPlayerDeath(eventAttackerId);
                }
            }

            if ("PLAYER_MOVED".equals(eventType)) {
                String playerId = stringValue(action.get("playerId"), null);
                int pos = intValue(action.get("pos"), -1);
                if (playerId != null && playerId.equals(MultiplayerManager.getInstance().getLocalPlayerId())
                        && pos >= 0 && Dungeon.hero != null && Dungeon.level != null && pos < Dungeon.level.length()) {
                    int oldPos = Dungeon.hero.pos;
                    Dungeon.hero.pos = pos;
                    if (Dungeon.hero.sprite != null && oldPos != pos) Dungeon.hero.sprite.move(oldPos, pos);
                }
            } else if ("PLAYER_ATTACKED".equals(eventType) || "PLAYER_DAMAGED".equals(eventType)) {
                String targetType = stringValue(action.get("targetType"), "MOB");
                String targetId = stringValue(action.get("targetId"), null);
                int hp = intValue(action.get("targetHp"), -1);
                if ("PLAYER".equals(targetType) && targetId != null && hp >= 0) {
                    applyPlayerHp(targetId, hp);
                    String state = stringValue(action.get("targetState"), "ALIVE");
                    if ("DEAD".equals(state) || "SPECTATOR".equals(state)) applyPlayerDeath(targetId);

                    // The accepted outcome carries the full native defender bundle. Apply it to
                    // remote replicas so class, equipment, talents, buffs, cooldown and Ankh state
                    // do not remain at the optimistic pre-combat state.
                    String nativeHeroState = stringValue(action.get("targetHeroStateJson"), "");
                    if (!targetId.equals(MultiplayerManager.getInstance().getLocalPlayerId())) {
                        RemotePlayer remote = MultiplayerManager.getInstance().getRemotePlayer(targetId);
                        if (remote == null) {
                            remote = new RemotePlayer(targetId, "Player", "WARRIOR");
                            RemotePlayerActionReceiver.setupRemoteHeroInstance(remote);
                            MultiplayerManager.getInstance().addRemotePlayer(remote);
                        }
                        remote.hp = hp;
                        remote.ht = Math.max(1, intValue(action.get("targetHt"), remote.ht));
                        remote.pos = intValue(action.get("targetPosAfter"), remote.pos);
                        if (remote.heroInstance != null && !nativeHeroState.isEmpty() && !"null".equals(nativeHeroState)) {
                            int oldPos = remote.heroInstance.pos;
                            WorldSnapshot.restoreRemoteHeroState(remote.heroInstance, nativeHeroState);
                            remote.hp = remote.heroInstance.HP;
                            remote.ht = remote.heroInstance.HT;
                            remote.pos = remote.heroInstance.pos;
                            if (remote.heroInstance.sprite != null && oldPos != remote.heroInstance.pos) {
                                remote.heroInstance.sprite.move(oldPos, remote.heroInstance.pos);
                            }
                        } else if (!nativeHeroState.isEmpty() && !"null".equals(nativeHeroState)) {
                            MultiplayerManager.getInstance().requestResync(message.sequence);
                        }
                    }

                    // Thorns, retaliation and defensive procs may also mutate the source mob.
                    // The server's full native snapshot is the reconciliation source.
                    if ("MOB".equals(stringValue(action.get("sourceType"), ""))
                            && action.get("sourceEntityId") != null) {
                        int sourceHpBefore = intValue(action.get("sourceMobHpBefore"), -1);
                        int sourceHpAfter = intValue(action.get("sourceMobHpAfter"), -1);
                        int sourceShieldBefore = intValue(action.get("sourceMobShieldBefore"), -1);
                        int sourceShieldAfter = intValue(action.get("sourceMobShieldAfter"), -1);
                        int sourcePosBefore = intValue(action.get("sourceMobPosBefore"), -1);
                        int sourcePosAfter = intValue(action.get("sourceMobPosAfter"), -1);
                        String sourceBuffsBefore = stringValue(action.get("sourceMobBuffsBefore"), "");
                        String sourceBuffsAfter = stringValue(action.get("sourceMobBuffs"), "");
                        if (boolValue(action.get("sourceMobResyncRequired"), false)
                                || sourceHpBefore != sourceHpAfter || sourceShieldBefore != sourceShieldAfter
                                || sourcePosBefore != sourcePosAfter || !sourceBuffsBefore.equals(sourceBuffsAfter)) {
                            MultiplayerManager.getInstance().requestResync(message.sequence);
                        }
                    }
                } else if ("MOB".equals(targetType) && targetId != null && hp >= 0 && Dungeon.level != null) {
                    Integer localActorId = MultiplayerManager.getInstance().getLocalActorIdForServerEntity(targetId);
                    if (localActorId != null) {
                        for (Mob mob : Dungeon.level.mobs.toArray(new Mob[0])) {
                            if (mob.id() == localActorId) {
                                mob.HP = hp;
                                int targetHt = intValue(action.get("targetHt"), mob.HT);
                                mob.HT = Math.max(1, targetHt);
                                String buffs = stringValue(action.get("targetBuffs"), "");
                                if (!buffs.isEmpty()) WorldSnapshot.restoreNativeCombatBuffs(mob, buffs);
                                if (hp <= 0) {
                                    // The authoritative attack already ran native death/loot logic on
                                    // its owner. Remove the remote copy without firing rewards or drops.
                                    WorldSnapshot.removeMobReplicaWithoutRewards(mob);
                                }
                                break;
                            }
                        }
                    }
                    // A scalar event cannot restore native Mob state-machine data, cooldowns,
                    // all secondary procs and heaps exactly. Always reconcile from the accepted
                    // authoritative level snapshot after mob combat/damage.
                    MultiplayerManager.getInstance().requestResync(message.sequence);
                }
            } else if ("CHAR_DAMAGED".equals(eventType)) {
                // Periodic, trap, blob, item and spell effects carry native deltas; restore the
                // complete authoritative level rather than replaying a partial damage event.
                MultiplayerManager.getInstance().requestResync(message.sequence);
            } else if ("ITEM_PICKED_UP".equals(eventType)) {
                // The local SPD engine already removed the picked item from this player's heap.
            } else if ("CHEST_OPENED".equals(eventType)) {
                // The local SPD engine has already opened the chest.
            }
        } catch (RuntimeException ignored) {
            // A malformed or partially un-restorable combat event must never be silently
            // treated as applied; recover from the last authoritative world snapshot.
            MultiplayerManager.getInstance().requestResync(message.sequence);
        }
    }

    private static float floatValue(JsonValue value, float fallback) {
        if (value == null || !value.isNumber()) return fallback;
        return value.asFloat();
    }

    private static int intFlag(JsonValue value) {
        if (value == null) return 0;
        if (value.isBoolean()) return value.asBoolean() ? 1 : 0;
        return value.isNumber() ? value.asInt() : 0;
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

    private static void readIntegerArray(JsonValue array, java.util.List<Integer> target) {
        if (array == null || !array.isArray()) return;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (value.isNumber()) target.add(value.asInt());
            else target.add(-1);
        }
    }

    private static boolean hasArray(JsonValue object, String name) {
        JsonValue value = object == null ? null : object.get(name);
        return value != null && value.isArray();
    }

    private static void handleSnapshotMessage(NetworkMessage message) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (message.payloadJson == null) {
            manager.requestResync(message.sequence);
            return;
        }
        try {
            JsonValue root = new JsonReader().parse(message.payloadJson);
            if (root == null || !root.isObject()) {
                manager.requestResync(message.sequence);
                return;
            }

            WorldSnapshot snapshot = new WorldSnapshot();
            snapshot.sequence = longValue(root.get("sequence"), message.sequence);
            snapshot.depth = intValue(root.get("depth"), 1);
            snapshot.dungeonSeed = longValue(root.get("seed"), 0L);
            snapshot.gameMode = stringValue(root.get("gameMode"), "COOP_DUNGEON");

            JsonValue level = root.get("level");
            if (level != null && level.isObject()) {
                // Treat this as a full snapshot only when all authoritative collections are
                // explicitly present. Missing arrays must never be interpreted as empty worlds.
                snapshot.completeWorldSnapshot = intValue(level.get("schemaVersion"), -1) == 1
                        && hasArray(level, "tiles")
                        && hasArray(level, "transitions") && hasArray(level, "heaps")
                        && hasArray(level, "traps") && hasArray(level, "blobs")
                        && hasArray(level, "plants") && hasArray(level, "mobs")
                        && hasArray(level, "visitedPositions") && hasArray(level, "mappedPositions")
                        && level.get("nativeLevelMetadataBundle") != null
                        && level.get("nativeLevelMetadataBundle").isString()
                        && !level.get("nativeLevelMetadataBundle").asString().isEmpty();
                snapshot.levelWidth = intValue(level.get("width"), 0);
                snapshot.levelHeight = intValue(level.get("height"), 0);
                snapshot.branch = intValue(level.get("branch"), -1);
                snapshot.entrancePos = intValue(level.get("entrancePos"), -1);
                snapshot.exitPos = intValue(level.get("exitPos"), -1);
                snapshot.levelLocked = level.get("locked") != null && level.get("locked").asBoolean();
                snapshot.levelFeeling = stringValue(level.get("feeling"), "");
                snapshot.nativeLevelMetadataBundle = stringValue(level.get("nativeLevelMetadataBundle"), "");
                readIntegerArray(level.get("visitedPositions"), snapshot.visitedPositions);
                readIntegerArray(level.get("mappedPositions"), snapshot.mappedPositions);
                JsonValue tiles = level.get("tiles");
                if (tiles != null && tiles.isArray()) {
                    for (JsonValue tile = tiles.child; tile != null; tile = tile.next) {
                        java.util.Map<String, Object> row = new java.util.HashMap<>();
                        row.put("pos", intValue(tile.get("pos"), -1));
                        row.put("terrain", intValue(tile.get("terrain"), -1));
                        row.put("passable", intFlag(tile.get("passable")));
                        row.put("solid", intFlag(tile.get("solid")));
                        row.put("pit", intFlag(tile.get("pit")));
                        row.put("losBlocking", intFlag(tile.get("los_blocking") == null ? tile.get("losBlocking") : tile.get("los_blocking")));
                        row.put("flammable", intFlag(tile.get("flammable")));
                        row.put("secret", intFlag(tile.get("secret")));
                        row.put("avoid", intFlag(tile.get("avoid")));
                        row.put("water", intFlag(tile.get("water")));
                        row.put("discoverable", intFlag(tile.get("discoverable")));
                        row.put("openSpace", intFlag(tile.get("openSpace")));
                        snapshot.tiles.add(row);
                    }
                }
                readObjectArray(level.get("transitions"), snapshot.transitions);
                readObjectArray(level.get("heaps"), snapshot.heaps);
                readObjectArray(level.get("traps"), snapshot.traps);
                readObjectArray(level.get("blobs"), snapshot.blobs);
                readObjectArray(level.get("plants"), snapshot.plants);
                JsonValue levelMobs = level.get("mobs");
                if (levelMobs != null && levelMobs.isArray()) {
                    snapshot.mobs.clear();
                    for (JsonValue mob = levelMobs.child; mob != null; mob = mob.next) {
                        java.util.Map<String, Object> row = new java.util.HashMap<>();
                        row.put("mobId", intValue(mob.get("mob_id"), intValue(mob.get("mobId"), -1)));
                        row.put("entityId", stringValue(mob.get("entityId"), ""));
                        row.put("name", stringValue(mob.get("name"), "Mob"));
                        row.put("pos", intValue(mob.get("pos"), -1));
                        row.put("hp", intValue(mob.get("hp"), 1));
                        row.put("ht", intValue(mob.get("ht"), 1));
                        row.put("state", stringValue(mob.get("state"), ""));
                        row.put("defenseSkill", intValue(mob.get("defenseSkill"), 0));
                        row.put("baseSpeed", floatValue(mob.get("baseSpeed"), 1f));
                        row.put("cooldown", floatValue(mob.get("cooldown"), 0f));
                        row.put("serializedBundle", stringValue(mob.get("serializedBundle"), ""));
                        java.util.List<java.util.Map<String, Object>> mobBuffs = new java.util.ArrayList<>();
                        readObjectArray(mob.get("buffs"), mobBuffs);
                        row.put("buffs", mobBuffs);
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
                    int id = intValue(mob.get("mob_id"), intValue(mob.get("mobId"), -1));
                    java.util.Map<String, Object> matched = null;
                    for (java.util.Map<String, Object> candidate : snapshot.mobs) {
                        if (((Number) candidate.get("mobId")).intValue() == id) {
                            matched = candidate;
                            break;
                        }
                    }
                    // SQL rows carry live HP/position but not the native serialized bundle.
                    // Merge them into the exported native entity; never append bundle-less
                    // duplicates that make a complete snapshot ambiguous or unrestorable.
                    if (matched == null) {
                        snapshot.completeWorldSnapshot = false;
                        continue;
                    }
                    matched.put("name", stringValue(mob.get("name"), String.valueOf(matched.get("name"))));
                    matched.put("pos", intValue(mob.get("pos"), ((Number) matched.get("pos")).intValue()));
                    matched.put("hp", intValue(mob.get("hp"), ((Number) matched.get("hp")).intValue()));
                    matched.put("ht", intValue(mob.get("ht"), ((Number) matched.get("ht")).intValue()));
                }
            }

            // All live-world mutations must run on the game/render thread. Parsing and
            // structural preflight above are safe on the transport thread.
            Game.runOnRenderThread(() -> {
                try {
                    if (WorldSnapshot.restoreWorld(snapshot)) {
                        manager.markSnapshotApplied(snapshot.sequence);
                    } else {
                        WorldSnapshot.rollbackToLastApplied();
                        manager.requestResync(snapshot.sequence);
                    }
                } catch (RuntimeException restoreError) {
                    WorldSnapshot.rollbackToLastApplied();
                    manager.requestResync(snapshot.sequence);
                }
            });
        } catch (RuntimeException ignored) {
            // A malformed envelope is never acknowledged; request a clean authoritative snapshot.
            manager.requestResync(message.sequence);
        }
    }

    private static void handleEventBatchMessage(NetworkMessage message) {
        if (message.payloadJson == null) return;
        try {
            JsonValue events = new JsonReader().parse(message.payloadJson);
            if (events == null || !events.isArray()) {
                // Combat/world events have one typed, sequence-aware path. Substring parsing
                // can apply damage or death effects twice and can resolve the wrong target.
                MultiplayerManager.getInstance().requestResync(message.sequence);
                return;
            }

            for (JsonValue event = events.child; event != null; event = event.next) {
                long seq = longValue(event.get("sequence"), message.sequence);
                MultiplayerManager.getInstance().updateLastSequence(seq);
                String type = stringValue(event.get("eventType"), stringValue(event.get("event_type"), ""));
                JsonValue action = event.get("action");
                if (action == null) {
                    JsonValue storedPayload = event.get("payload");
                    if (storedPayload != null && storedPayload.isString()) {
                        action = new JsonReader().parse(storedPayload.asString());
                    } else if (storedPayload != null && storedPayload.isObject()) {
                        action = storedPayload;
                    }
                }
                if (action == null || !action.isObject()) {
                    MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
                    continue;
                }

                if ("PLAYER_ATTACKED".equals(type)) {
                    String attackerId = stringValue(action.get("attackerId"), null);
                    String attackerState = stringValue(action.get("attackerStateJson"), null);
                    if (attackerId != null && attackerState != null && !attackerState.isEmpty()) {
                        if (attackerId.equals(MultiplayerManager.getInstance().getLocalPlayerId())) {
                            if (Dungeon.hero != null) WorldSnapshot.restoreRemoteHeroState(Dungeon.hero, attackerState);
                        } else {
                            applyRemoteHeroState(attackerId, attackerState);
                        }
                    }
                }

                if ("MOB_MOVED".equals(type) || "MOB_ATTACKED".equals(type) || "CHAR_DAMAGED".equals(type)) {
                    applyMobEvent(type, action);
                    if ("CHAR_DAMAGED".equals(type)
                            && "MOB".equals(stringValue(action.get("targetType"), ""))
                            && action.get("targetMobBundleAfter") != null
                            && action.get("targetMobBundleAfter").isString()
                            && !action.get("targetMobBundleAfter").asString().isEmpty()) {
                        // Periodic effects may change native AI/alert/cooldown state in addition
                        // to the scalar combat fields; restore the publisher's complete snapshot.
                        MultiplayerManager.getInstance().requestResync(seq);
                    }
                } else if ("PLAYER_MOVED".equals(type)) {
                    String playerId = stringValue(action.get("playerId"), message.senderId);
                    int pos = intValue(action.get("pos"), -1);
                    if (playerId != null && pos >= 0) {
                        WorldSnapshot delta = new WorldSnapshot(seq, intValue(event.get("depth"), Dungeon.depth), 0L);
                        delta.playerPositions.put(playerId, pos);
                        WorldSnapshot.restoreWorld(delta);
                    }
                } else if ("PLAYER_ATTACKED".equals(type) || "PLAYER_DAMAGED".equals(type)) {
                    String targetType = stringValue(action.get("targetType"), "MOB");
                    String targetId = stringValue(action.get("targetId"), null);
                    int hp = intValue(action.get("targetHp"), -1);
                    if ("PLAYER".equals(targetType) && targetId != null && hp >= 0) {
                        String targetHeroState = stringValue(action.get("targetHeroStateJson"), null);
                        if (targetHeroState != null && !targetHeroState.isEmpty()) {
                            if (targetId.equals(MultiplayerManager.getInstance().getLocalPlayerId())) {
                                int oldPos = Dungeon.hero == null ? -1 : Dungeon.hero.pos;
                                WorldSnapshot.restoreRemoteHeroState(Dungeon.hero, targetHeroState);
                                if (Dungeon.hero != null && Dungeon.hero.sprite != null && oldPos >= 0 && oldPos != Dungeon.hero.pos) {
                                    Dungeon.hero.sprite.move(oldPos, Dungeon.hero.pos);
                                }
                            } else {
                                applyRemoteHeroState(targetId, targetHeroState);
                            }
                        } else {
                            applyPlayerHp(targetId, hp);
                            int targetPosAfter = intValue(action.get("targetPosAfter"), -1);
                            if (targetPosAfter >= 0) applyPlayerPosition(targetId, targetPosAfter);
                            String targetBuffs = stringValue(action.get("targetBuffs"), null);
                            if (targetBuffs != null) applyPlayerCombatBuffs(targetId, targetBuffs);
                        }
                        String state = stringValue(action.get("targetState"), "ALIVE");
                        if ("SPECTATOR".equals(state) || "DEAD".equals(state)) applyPlayerDeath(targetId);
                    } else if ("MOB".equals(targetType) && targetId != null && hp >= 0) {
                        applyMobEvent(type, action);
                    }
                    if ("PLAYER_ATTACKED".equals(type) && "MOB".equals(targetType)) {
                        JsonValue secondary = action.get("secondaryMobDeltas");
                        JsonValue secondaryDeltas = secondary == null ? null : secondary.get("deltas");
                        JsonValue nativeMobBundle = action.get("targetMobBundleAfter");
                        if ((secondaryDeltas != null && secondaryDeltas.isArray() && secondaryDeltas.size > 0)
                                || (nativeMobBundle != null && nativeMobBundle.isString()
                                    && !nativeMobBundle.asString().isEmpty())) {
                            // Combat can alter native AI state, alerting, cooldowns and proc state
                            // beyond the HP fields. Reconcile the authoritative full snapshot
                            // rather than applying a partial replica of the Java combat result.
                            MultiplayerManager.getInstance().requestResync(seq);
                        }
                    }
                    if ("PLAYER_DAMAGED".equals(type)
                            && "MOB".equals(stringValue(action.get("sourceType"), ""))
                            && intValue(action.get("sourceMobHpAfter"), -1) >= 0) {
                        applyMobEvent(type, action);
                        JsonValue sourceBundle = action.get("sourceMobBundleAfter");
                        if (sourceBundle != null && sourceBundle.isString() && !sourceBundle.asString().isEmpty()) {
                            // Defensive procs may mutate the mob's full native state, not just HP.
                            MultiplayerManager.getInstance().requestResync(seq);
                        }
                    }
                } else if ("CHAR_DIED".equals(type)) {
                    String playerId = stringValue(action.get("playerId"), stringValue(action.get("targetPlayerId"), null));
                    if (playerId != null) applyPlayerDeath(playerId);
                } else if ("PLAYER_REVIVED".equals(type)) {
                    String playerId = stringValue(action.get("playerId"), null);
                    int hp = intValue(action.get("hp"), -1);
                    String heroStateJson = stringValue(action.get("heroStateJson"), null);
                    if (playerId != null && heroStateJson != null && !heroStateJson.isEmpty()) {
                        if (playerId.equals(MultiplayerManager.getInstance().getLocalPlayerId())) {
                            WorldSnapshot.restoreRemoteHeroState(Dungeon.hero, heroStateJson);
                        } else {
                            applyRemoteHeroState(playerId, heroStateJson);
                        }
                    } else if (playerId != null && hp >= 0) {
                        applyPlayerHp(playerId, hp);
                    }
                } else if ("ITEM_PICKED_UP".equals(type)) {
                    int itemPos = intValue(action.get("itemPos"), -1);
                    if (itemPos >= 0 && Dungeon.level != null) {
                        com.shatteredpixel.shatteredpixeldungeon.items.Heap heap = Dungeon.level.heaps.get(itemPos);
                        if (heap != null) {
                            String itemClass = stringValue(action.get("itemClass"), "");
                            Item picked = null;
                            for (Item item : new java.util.ArrayList<>(heap.items)) {
                                if (itemClass.isEmpty() || item.getClass().getName().equals(itemClass)) { picked = item; break; }
                            }
                            if (picked == null) picked = heap.peek();
                            if (picked != null) heap.items.remove(picked);
                            int remaining = intValue(action.get("remainingItemCount"), heap.items.size());
                            if (remaining <= 0 || heap.items.isEmpty()) {
                                Dungeon.level.heaps.remove(itemPos);
                                if (heap.sprite != null) heap.sprite.remove();
                            } else {
                                GameScene.updateMap(itemPos);
                            }
                        }
                    }
                } else if ("CHEST_OPENED".equals(type)) {
                    int itemPos = intValue(action.get("itemPos"), -1);
                    if (itemPos >= 0 && Dungeon.level != null) GameScene.updateMap(itemPos);
                } else if ("LEVEL_TRANSITION".equals(type)) {
                    // The authoritative level snapshot that follows a transition is required
                    // before changing local geometry; never synthesize a floor from depth alone.
                    MultiplayerManager.getInstance().updateLastSequence(seq);
                } else if ("MATCH_END".equals(type)) {
                    MultiplayerManager.getInstance().updateLastSequence(seq);
                }
            }
        } catch (RuntimeException ignored) {
            // Do not keep using a partially reconciled combat state.
            MultiplayerManager.getInstance().requestResync(message.sequence);
        }
    }

    private static void applyRemoteHeroState(String playerId, String encodedState) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        RemotePlayer remote = manager.getRemotePlayer(playerId);
        if (remote == null) {
            remote = new RemotePlayer(playerId, "Player", "WARRIOR");
            manager.addRemotePlayer(remote);
        }
        RemotePlayerActionReceiver.setupRemoteHeroInstance(remote);
        int oldPos = remote.pos;
        WorldSnapshot.restoreRemoteHeroState(remote.heroInstance, encodedState);
        if (remote.heroInstance.sprite != null && oldPos != remote.heroInstance.pos) {
            remote.heroInstance.sprite.move(oldPos, remote.heroInstance.pos);
        }
        remote.hp = remote.heroInstance.HP;
        remote.ht = remote.heroInstance.HT;
        remote.pos = remote.heroInstance.pos;
        remote.isAlive = remote.hp > 0;
        remote.heroClass = remote.heroInstance.heroClass == null ? remote.heroClass : remote.heroInstance.heroClass.name();
    }

    private static void applyPlayerCombatBuffs(String playerId, String encodedBuffs) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (playerId.equals(manager.getLocalPlayerId())) {
            WorldSnapshot.restoreNativeCombatBuffs(Dungeon.hero, encodedBuffs);
            return;
        }
        RemotePlayer remote = manager.getRemotePlayer(playerId);
        if (remote == null) {
            remote = new RemotePlayer(playerId, "Player", "WARRIOR");
            manager.addRemotePlayer(remote);
        }
        RemotePlayerActionReceiver.setupRemoteHeroInstance(remote);
        WorldSnapshot.restoreNativeCombatBuffs(remote.heroInstance, encodedBuffs);
        remote.hp = remote.heroInstance.HP;
        remote.ht = remote.heroInstance.HT;
        remote.pos = remote.heroInstance.pos;
        remote.isAlive = remote.hp > 0;
    }

    private static void applyPlayerPosition(String playerId, int pos) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (playerId.equals(manager.getLocalPlayerId())) {
            if (Dungeon.hero != null && Dungeon.level != null && pos < Dungeon.level.length()) {
                int oldPos = Dungeon.hero.pos;
                Dungeon.hero.pos = pos;
                if (Dungeon.hero.sprite != null && oldPos != pos) Dungeon.hero.sprite.move(oldPos, pos);
            }
            return;
        }
        RemotePlayer remote = manager.getRemotePlayer(playerId);
        if (remote == null) {
            remote = new RemotePlayer(playerId, "Player", "WARRIOR");
            manager.addRemotePlayer(remote);
        }
        int oldPos = remote.pos;
        remote.pos = pos;
        if (remote.heroInstance != null) {
            remote.heroInstance.pos = pos;
            if (remote.heroInstance.sprite != null && oldPos != pos) remote.heroInstance.sprite.move(oldPos, pos);
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
        boolean sourceMobDamage = "PLAYER_DAMAGED".equals(type)
                && "MOB".equals(stringValue(action.get("sourceType"), ""));
        boolean nativeMobDamage = "CHAR_DAMAGED".equals(type)
                && "MOB".equals(stringValue(action.get("targetType"), ""));
        int mobId = intValue(action.get("mobId"), -1);
        if (mobId < 0 && (("PLAYER_ATTACKED".equals(type)
                && "MOB".equals(stringValue(action.get("targetType"), ""))) || sourceMobDamage || nativeMobDamage)) {
            String stableEntityId = sourceMobDamage
                    ? stringValue(action.get("sourceEntityId"), null)
                    : stringValue(action.get("targetId"), null);
            Integer mappedActorId = MultiplayerManager.getInstance().getLocalActorIdForServerEntity(stableEntityId);
            if (mappedActorId != null) mobId = mappedActorId;
            else mobId = intValue(action.get("targetId"), -1);
        }
        if (mobId < 0) {
            if (sourceMobDamage || nativeMobDamage || "PLAYER_ATTACKED".equals(type)) {
                MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
            }
            return;
        }

        boolean foundMob = false;
        for (Mob mob : Dungeon.level.mobs) {
            if (mob.id() != mobId) continue;
            foundMob = true;
            int toPos = sourceMobDamage
                    ? intValue(action.get("sourceMobPosAfter"), -1)
                    : intValue(action.get("targetPosAfter"), intValue(action.get("toPos"), -1));
            if (toPos >= 0 && toPos < Dungeon.level.length()) {
                int fromPos = mob.pos;
                mob.pos = toPos;
                if (mob.sprite != null && fromPos != toPos) mob.sprite.move(fromPos, toPos);
            }
            if (sourceMobDamage) {
                int hp = intValue(action.get("sourceMobHpAfter"), mob.HP);
                mob.HT = Math.max(1, intValue(action.get("sourceMobHtAfter"), mob.HT));
                if (hp <= 0) {
                    WorldSnapshot.removeMobReplicaWithoutRewards(mob);
                    MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
                } else {
                    mob.HP = Math.min(hp, mob.HT);
                    String sourceBuffs = stringValue(action.get("sourceMobBuffs"), null);
                    if (sourceBuffs != null) WorldSnapshot.restoreNativeCombatBuffs(mob, sourceBuffs);
                }
            } else if (nativeMobDamage) {
                int hp = intValue(action.get("targetHp"), mob.HP);
                mob.HT = Math.max(1, intValue(action.get("targetHt"), mob.HT));
                if (hp <= 0) {
                    WorldSnapshot.removeMobReplicaWithoutRewards(mob);
                    MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
                } else {
                    mob.HP = Math.min(hp, mob.HT);
                    String buffs = stringValue(action.get("targetBuffs"), null);
                    if (buffs != null) WorldSnapshot.restoreNativeCombatBuffs(mob, buffs);
                }
            } else if ("PLAYER_ATTACKED".equals(type) && "MOB".equals(stringValue(action.get("targetType"), ""))) {
                int hp = intValue(action.get("targetHp"), mob.HP);
                mob.HT = Math.max(1, intValue(action.get("targetHt"), mob.HT));
                if (hp <= 0) {
                    // The native attacker already ran SPD's death/proc/loot pipeline. Do not
                    // invoke Mob.die() or Mob.destroy() on remote replicas: they award local
                    // kill rewards and may roll a second copy of the loot.
                    WorldSnapshot.removeMobReplicaWithoutRewards(mob);
                    // A death can create multiple native drops or trigger secondary effects.
                    // Pull the authoritative full snapshot so every client receives exact heaps.
                    MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
                } else {
                    mob.HP = Math.min(hp, mob.HT);
                    String targetBuffs = stringValue(action.get("targetBuffs"), null);
                    if (targetBuffs != null) WorldSnapshot.restoreNativeCombatBuffs(mob, targetBuffs);
                }
            } else if ("MOB_ATTACKED".equals(type)) {
                // Player damage is represented in the event; player HP is reconciled separately.
            } else if ("CHAR_DAMAGED".equals(type)) {
                int damage = intValue(action.get("damage"), 0);
                if (damage > 0) {
                    // Legacy damage-only events cannot prove a native SPD outcome. Do not
                    // rerun armor/buff/death logic or accept unauthenticated damage deltas.
                    MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
                }
            }
            return;
        }
        if (nativeMobDamage && !foundMob) {
            MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
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

    private static boolean boolValue(JsonValue value, boolean fallback) {
        return value == null || !value.isBoolean() ? fallback : value.asBoolean();
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
