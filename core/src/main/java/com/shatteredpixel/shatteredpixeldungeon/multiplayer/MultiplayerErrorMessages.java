package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.Locale;

/** Converts internal transport/session error codes into safe, localized UI message keys. */
public final class MultiplayerErrorMessages {

    private MultiplayerErrorMessages() { }

    public static String messageKey(String error) {
        if (error == null || error.trim().isEmpty()) return "connection_start_failed";
        String code = error.toUpperCase(Locale.ROOT);

        if (code.contains("NETWORK_UNAVAILABLE")) return "connection_network_unavailable";
        if (code.contains("BLUETOOTH_PAIRING_CANCELLED_OR_PEER_UNAVAILABLE")) return "bt_pairing_failed";
        if (code.contains("BLUETOOTH_PERMISSION_REQUEST_FAILED")) return "bt_permission_denied";
        if (code.contains("BLUETOOTH_PERMISSION_REQUIRED")) return "bluetooth_permission_required";
        if (code.contains("BLUETOOTH_PERMISSION_PERMANENTLY_DENIED")) return "bt_permission_permanent";
        if (code.contains("BLUETOOTH_PERMISSION_DENIED")) return "bt_permission_denied";
        if (code.contains("BLUETOOTH_DISCOVERABILITY_CANCELLED")
                || code.contains("BLUETOOTH_ENABLE_CANCELLED")
                || code.contains("BLUETOOTH_HOST_PREPARATION_CANCELLED")) return "bt_user_cancelled";
        if (code.contains("BLUETOOTH_DEVICE_NOT_FOUND")) return "bt_device_lost";
        if (code.contains("BLUETOOTH_ACTION_PENDING")) return "bt_action_pending";
        if (code.contains("BLUETOOTH_DISCOVERABILITY_REQUEST_FAILED")) return "bt_host_visibility_failed";
        if (code.contains("BLUETOOTH_ENABLE_REQUEST_FAILED")) return "bt_enable_failed";
        if (code.contains("BLUETOOTH_DISCOVERY") || code.contains("BLUETOOTH_DEVICE_LIST_FAILED")) return "bt_discovery_failed";
        if (code.contains("BLUETOOTH_LOCATION_REQUIRED")) return "bt_location_required";
        if (code.contains("BLUETOOTH_DISABLED")) return "bluetooth_disabled";
        if (code.contains("BLUETOOTH_UNSUPPORTED") || code.contains("BLUETOOTH_UNAVAILABLE")) return "bluetooth_unavailable";
        if (code.contains("BLUETOOTH_DEVICE_REQUIRED") || code.contains("BLUETOOTH_DEVICE_ADDRESS_INVALID")) return "bluetooth_device_required";
        if (code.contains("BLUETOOTH_CONNECT_TIMEOUT") || code.contains("BLUETOOTH_NOT_CONNECTED")
                || code.contains("BLUETOOTH_PROVIDER_NOT_CONNECTED")
                || code.contains("BLUETOOTH_TRANSPORT_FAILED") || code.contains("BLUETOOTH_DISCONNECTED")
                || code.contains("BLUETOOTH_PEER_CLOSED") || code.contains("BLUETOOTH_FRAME_")) {
            return "bluetooth_connection_failed";
        }
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