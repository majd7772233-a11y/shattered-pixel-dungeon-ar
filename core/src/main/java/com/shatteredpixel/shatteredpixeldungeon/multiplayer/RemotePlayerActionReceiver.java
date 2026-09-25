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
                remote.heroInstance = new Hero();
                remote.heroInstance.pos = remote.pos;
                manager.addRemotePlayer(remote);
            }

            int newPos = parsePositionKey(message.payloadJson);
            if (newPos != -1) {
                remote.pos = newPos;
                if (remote.heroInstance == null) {
                    remote.heroInstance = new Hero();
                }
                remote.heroInstance.pos = newPos;
            }
        }
    }

    private static int parsePositionKey(String json) {
        String[] keys = {"\"to\":", "\"targetPos\":", "\"pos\":", "\"from\":"};
        for (String key : keys) {
            if (json.contains(key)) {
                try {
                    int posIdx = json.indexOf(key) + key.length();
                    int endIdx = json.indexOf("}", posIdx);
                    if (endIdx == -1) endIdx = json.indexOf(",", posIdx);
                    if (endIdx != -1) {
                        String posStr = json.substring(posIdx, endIdx).trim();
                        return Integer.parseInt(posStr);
                    }
                } catch (Exception ignored) {}
            }
        }
        return -1;
    }
}
