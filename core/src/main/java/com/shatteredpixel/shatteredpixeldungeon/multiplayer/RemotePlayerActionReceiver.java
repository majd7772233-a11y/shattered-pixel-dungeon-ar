package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;

public class RemotePlayerActionReceiver {

    public static void handleNetworkMessage(NetworkMessage message) {
        if (message == null || message.payloadJson == null) return;

        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive()) return;

        if (message.senderId != null && !message.senderId.equals(manager.getLocalPlayerId())) {
            RemotePlayer remote = manager.getRemotePlayer(message.senderId);
            if (remote == null) {
                remote = new RemotePlayer(message.senderId, "Player", "WARRIOR");
                manager.addRemotePlayer(remote);
            }

            if (message.payloadJson.contains("\"pos\":")) {
                try {
                    int posIdx = message.payloadJson.indexOf("\"pos\":") + 6;
                    int endIdx = message.payloadJson.indexOf("}", posIdx);
                    if (endIdx == -1) endIdx = message.payloadJson.indexOf(",", posIdx);
                    if (endIdx != -1) {
                        String posStr = message.payloadJson.substring(posIdx, endIdx).trim();
                        int newPos = Integer.parseInt(posStr);
                        remote.pos = newPos;

                        if (remote.heroInstance != null) {
                            remote.heroInstance.pos = newPos;
                        }
                    }
                } catch (Exception ignored) {}
            }
        }
    }
}
