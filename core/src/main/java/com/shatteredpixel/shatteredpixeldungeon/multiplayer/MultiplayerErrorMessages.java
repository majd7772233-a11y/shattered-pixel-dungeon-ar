package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.Locale;

/** Converts internal transport/session error codes into safe, localized UI message keys. */
public final class MultiplayerErrorMessages {

    private MultiplayerErrorMessages() {
    }

    public static String messageKey(String error) {
        if (error == null || error.trim().isEmpty()) return "connection_start_failed";
        String code = error.toUpperCase(Locale.ROOT);

        if (code.contains("NETWORK_UNAVAILABLE")) return "connection_network_unavailable";
        if (code.contains("APP_BACKGROUND")) return "connection_background_paused";
        if (code.contains("SESSION_HANDSHAKE_TIMEOUT")) return "connection_session_timeout";
        if (code.contains("ROOM_OPERATION_TIMEOUT")) return "connection_room_timeout";
        if (code.contains("ROOM_OPERATION_REJECTED") || code.contains("ROOM_CLOSED")
                || code.contains("INVALID_ROOM_STATE") || code.contains("INVALID_MATCH_START")) {
            return "connection_room_rejected";
        }
        if (code.contains("HTTP/1.1 401") || code.contains("HTTP/1.1 403")
                || code.contains("HTTP/1.1 409") || code.contains("SESSION_REPLACED")) {
            return "connection_session_rejected";
        }
        if (code.contains("HTTP/1.1 404") || code.contains("HTTP/1.1 5")
                || code.contains("RECONNECT_ATTEMPTS_EXHAUSTED") || code.contains("UNKNOWNHOST")
                || code.contains("CONNECTEXCEPTION") || code.contains("SOCKETTIMEOUT")) {
            return "connection_server_unavailable";
        }
        return "connection_start_failed";
    }
}