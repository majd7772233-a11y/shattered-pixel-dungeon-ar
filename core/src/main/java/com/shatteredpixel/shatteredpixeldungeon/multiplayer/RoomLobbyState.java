package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;

import java.util.HashSet;
import java.util.Set;

/** Server-authored, immutable roster projection used by the lobby UI. */
public final class RoomLobbyState {

    private static volatile RoomMemberInfo[] members = new RoomMemberInfo[0];
    private static volatile long revision;
    private static volatile boolean snapshotAvailable;
    private static volatile String error;

    private RoomLobbyState() {}

    public static synchronized void apply(NetworkMessage message) {
        if (message == null || message.payloadJson == null) return;
        try {
            JsonValue payload = new JsonReader().parse(message.payloadJson);
            JsonValue lifecycle = payload == null ? null : payload.get("lifecycleVersion");
            JsonValue sourceMembers = payload == null ? null : payload.get("members");
            JsonValue count = payload == null ? null : payload.get("memberCount");
            JsonValue capacity = payload == null ? null : payload.get("maxPlayers");
            JsonValue snapshot = payload == null ? null : payload.get("worldSnapshotReady");
            JsonValue owner = payload == null ? null : payload.get("ownerId");
            JsonValue allReady = payload == null ? null : payload.get("allReady");
            JsonValue roomStatus = payload == null ? null : payload.get("roomStatus");
            JsonValue gameStatus = payload == null ? null : payload.get("gameStatus");
            if (payload == null || !payload.isObject() || lifecycle == null || !lifecycle.isNumber()
                    || lifecycle.asInt() != 1 || sourceMembers == null || !sourceMembers.isArray()
                    || count == null || !count.isNumber() || capacity == null || !capacity.isNumber()
                    || snapshot == null || !snapshot.isBoolean() || allReady == null || !allReady.isBoolean()
                    || roomStatus == null || !roomStatus.isString()
                    || gameStatus == null || !gameStatus.isString()
                    || (owner != null && !owner.isNull() && !owner.isString())) {
                throw new IllegalArgumentException("INCOMPLETE_ROOM_ROSTER");
            }

            int memberCount = count.asInt();
            int maxPlayers = capacity.asInt();
            if (count.asDouble() != memberCount || capacity.asDouble() != maxPlayers
                    || memberCount < 0 || maxPlayers < 1 || memberCount > maxPlayers) {
                throw new IllegalArgumentException("INVALID_ROOM_CAPACITY");
            }
            String roomState = roomStatus.asString();
            String gameState = gameStatus.asString();
            boolean validRoomState = "LOBBY".equals(roomState) || "READY".equals(roomState)
                    || "PLAYING".equals(roomState) || "SUSPENDED".equals(roomState)
                    || "RECOVERING".equals(roomState) || "ENDED".equals(roomState)
                    || "CLOSED".equals(roomState);
            boolean validGameState = "LOBBY".equals(gameState) || "PLAYING".equals(gameState)
                    || "ENDED".equals(gameState);
            if (!validRoomState || !validGameState
                    || (("LOBBY".equals(roomState) || "READY".equals(roomState)) && !"LOBBY".equals(gameState))
                    || (("PLAYING".equals(roomState) || "SUSPENDED".equals(roomState)
                        || "RECOVERING".equals(roomState)) && !"PLAYING".equals(gameState))
                    || ("ENDED".equals(roomState) && !"ENDED".equals(gameState))) {
                throw new IllegalArgumentException("INVALID_ROOM_LIFECYCLE_STATE");
            }
            if ("READY".equals(roomState) && (!allReady.asBoolean() || !snapshot.asBoolean())) {
                throw new IllegalArgumentException("ROOM_READY_STATUS_MISMATCH");
            }
            if ("PLAYING".equals(roomState) && !snapshot.asBoolean()) {
                throw new IllegalArgumentException("ROOM_PLAYING_SNAPSHOT_MISSING");
            }
            RoomMemberInfo[] next = new RoomMemberInfo[sourceMembers.size];
            Set<String> seenPlayerIds = new HashSet<>();
            int index = 0;
            for (JsonValue member = sourceMembers.child; member != null; member = member.next) {
                if (!member.isObject()) throw new IllegalArgumentException("INVALID_ROOM_MEMBER");
                JsonValue id = member.get("playerId");
                JsonValue className = member.get("className");
                JsonValue state = member.get("state");
                JsonValue ready = member.get("ready");
                JsonValue connected = member.get("connected");
                if (id == null || !id.isString() || id.asString().trim().isEmpty()
                        || ready == null || !ready.isBoolean() || connected == null || !connected.isBoolean()
                        || !seenPlayerIds.add(id.asString())) {
                    throw new IllegalArgumentException("INVALID_ROOM_MEMBER_FIELDS");
                }
                next[index++] = new RoomMemberInfo(id.asString(),
                        className != null && className.isString() ? className.asString() : "WARRIOR",
                        state != null && state.isString() ? state.asString() : "ALIVE",
                        ready.asBoolean(), connected.asBoolean());
            }
            if (index != memberCount || index > maxPlayers) {
                throw new IllegalArgumentException("ROOM_MEMBER_COUNT_MISMATCH");
            }
            String ownerId = owner != null && owner.isString() ? owner.asString() : null;
            if ((memberCount == 0 && ownerId != null) || (memberCount > 0
                    && (ownerId == null || !seenPlayerIds.contains(ownerId)))) {
                throw new IllegalArgumentException("INVALID_ROOM_OWNER");
            }
            boolean expectedAllReady = memberCount > 0;
            for (RoomMemberInfo member : next) {
                expectedAllReady &= member.isConnected() && member.isReady();
            }
            if (expectedAllReady != allReady.asBoolean()) {
                throw new IllegalArgumentException("ROOM_READINESS_MISMATCH");
            }

            members = next;
            snapshotAvailable = snapshot.asBoolean();
            error = null;
            revision++;
        } catch (RuntimeException invalid) {
            error = invalid.getMessage() == null ? "INVALID_ROOM_ROSTER" : invalid.getMessage();
            revision++;
        }
    }

    public static synchronized void touch() {
        revision++;
    }

    public static RoomMemberInfo[] getMembers() {
        return members.clone();
    }

    public static long getRevision() {
        return revision;
    }

    public static boolean isSnapshotAvailable() {
        return snapshotAvailable;
    }

    public static String getError() {
        return error;
    }

    public static synchronized void clear() {
        members = new RoomMemberInfo[0];
        snapshotAvailable = false;
        error = null;
        revision++;
    }
}