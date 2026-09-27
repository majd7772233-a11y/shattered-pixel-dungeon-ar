package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class EmbeddedMatchAuthority {

    private final LANTransport transport;
    private long currentSequence = 0;
    private double worldTime = 0.0;
    private int currentDepth = 1;
    private final Map<String, Integer> playerPositions = new ConcurrentHashMap<>();

    public EmbeddedMatchAuthority(LANTransport transport) {
        this.transport = transport;
    }

    public void start() {
        this.currentSequence = 0;
        this.worldTime = 0.0;
        this.currentDepth = Dungeon.depth > 0 ? Dungeon.depth : 1;
    }

    public synchronized void processAction(String playerId, NetworkActionType actionType, int targetPos) {
        if (playerId == null || actionType == null) return;

        boolean valid = true;
        double actionCost = 1.0;

        if (Dungeon.level != null && targetPos >= 0 && targetPos < Dungeon.level.length()) {
            if (actionType == NetworkActionType.MOVE && !Dungeon.level.passable[targetPos]) {
                valid = false;
            }
        }

        if (valid) {
            currentSequence++;
            worldTime += actionCost;

            if (targetPos >= 0) {
                playerPositions.put(playerId, targetPos);
            }

            NetworkMessage eventMsg = new NetworkMessage();
            eventMsg.messageType = MessageType.EVENT_BATCH;
            eventMsg.senderId = playerId;
            eventMsg.sequence = currentSequence;
            eventMsg.payloadJson = "{\"sequence\":" + currentSequence + ",\"action\":\"" + actionType.name() + "\",\"pos\":" + targetPos + "}";

            if (transport != null) {
                transport.sendAuthorityEvent(eventMsg);
            }

            processMobTurns();
        }
    }

    private void processMobTurns() {
        if (Dungeon.level == null) return;

        for (Mob mob : Dungeon.level.mobs) {
            if (mob.isAlive()) {
                currentSequence++;
                NetworkMessage mobMsg = new NetworkMessage();
                mobMsg.messageType = MessageType.EVENT_BATCH;
                mobMsg.senderId = "SERVER";
                mobMsg.sequence = currentSequence;
                mobMsg.payloadJson = "{\"sequence\":" + currentSequence + ",\"eventType\":\"MOB_MOVED\",\"mobId\":" + mob.id + ",\"toPos\":" + mob.pos + "}";

                if (transport != null) {
                    transport.sendAuthorityEvent(mobMsg);
                }
            }
        }
    }
}
