package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public enum MessageType {
    HELLO,
    SESSION,
    CREATE_ROOM,
    JOIN_ROOM,
    ROOM_STATE,
    PLAYER_JOINED,
    PLAYER_LEFT,
    READY,
    MATCH_START,
    ACTION,
    LEVEL_DATA,
    LEVEL_READY,
    ACTION_ACCEPTED,
    COMBAT_REQUEST,
    EVENT_BATCH,
    SNAPSHOT,
    ACK,
    RESYNC,
    RECONNECT,
    MATCH_END,
    LEAVE,
    PING,
    CHAT,
    ERROR
}
