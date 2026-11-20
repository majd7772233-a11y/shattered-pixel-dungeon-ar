package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

public class MultiplayerErrorMessagesTest {

    @Test
    public void mapsBluetoothAdapterAndPermissionFailuresToLocalizedMessages() {
        Assert.assertEquals("bluetooth_unavailable",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_UNAVAILABLE"));
        Assert.assertEquals("bluetooth_unavailable",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_UNSUPPORTED"));
        Assert.assertEquals("bluetooth_disabled",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_DISABLED"));
        Assert.assertEquals("bluetooth_permission_required",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_PERMISSION_REQUIRED"));
        Assert.assertEquals("bluetooth_device_required",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_DEVICE_ADDRESS_INVALID"));
        Assert.assertEquals("bluetooth_connection_failed",
                MultiplayerErrorMessages.messageKey("java.net.SocketTimeoutException: BLUETOOTH_CONNECT_TIMEOUT"));
        Assert.assertEquals("bluetooth_connection_failed",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_PROVIDER_NOT_CONNECTED"));
        Assert.assertEquals("bluetooth_connection_failed",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_TRANSPORT_FAILED"));
        Assert.assertEquals("bluetooth_connection_failed",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_FRAME_INVALID_UTF8"));        Assert.assertEquals("bt_action_pending",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_ACTION_PENDING"));
        Assert.assertEquals("bt_host_visibility_failed",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_DISCOVERABILITY_REQUEST_FAILED"));
        Assert.assertEquals("bt_enable_failed",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_ENABLE_REQUEST_FAILED"));
        Assert.assertEquals("bt_location_required",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_LOCATION_REQUIRED"));
        Assert.assertEquals("bt_permission_denied",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_PERMISSION_DENIED"));
        Assert.assertEquals("bt_permission_permanent",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_PERMISSION_PERMANENTLY_DENIED"));
        Assert.assertEquals("bt_user_cancelled",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_DISCOVERABILITY_CANCELLED"));
        Assert.assertEquals("bt_user_cancelled",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_HOST_PREPARATION_CANCELLED"));
        Assert.assertEquals("bt_device_lost",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_DEVICE_NOT_FOUND"));
        Assert.assertEquals("bt_discovery_failed",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_DISCOVERY_START_FAILED"));
        Assert.assertEquals("bt_pairing_failed",
                MultiplayerErrorMessages.messageKey("BLUETOOTH_PAIRING_CANCELLED_OR_PEER_UNAVAILABLE"));
    }
    @Test
    public void mapsOfflineAndBackgroundStatesToLocalizedMessages() {
        Assert.assertEquals("connection_network_unavailable",
                MultiplayerErrorMessages.messageKey("NETWORK_UNAVAILABLE"));
        Assert.assertEquals("connection_background_paused",
                MultiplayerErrorMessages.messageKey("APP_BACKGROUND"));
    }

    @Test
    public void mapsHandshakeAndRoomTimeoutsToLocalizedMessages() {
        Assert.assertEquals("connection_session_timeout",
                MultiplayerErrorMessages.messageKey("SESSION_HANDSHAKE_TIMEOUT"));
        Assert.assertEquals("connection_room_timeout",
                MultiplayerErrorMessages.messageKey("ROOM_OPERATION_TIMEOUT:CREATE_ROOM"));
    }

    @Test
    public void mapsRejectedRoomsAndSessionCredentialsToLocalizedMessages() {
        Assert.assertEquals("connection_room_rejected",
                MultiplayerErrorMessages.messageKey("ROOM_OPERATION_REJECTED:JOIN_ROOM"));
        Assert.assertEquals("connection_room_rejected",
                MultiplayerErrorMessages.messageKey("ROOM_CLOSED"));
        Assert.assertEquals("connection_session_rejected",
                MultiplayerErrorMessages.messageKey("WebSocket Handshake Failed: HTTP/1.1 401 Unauthorized"));
        Assert.assertEquals("connection_session_rejected",
                MultiplayerErrorMessages.messageKey("SESSION_REPLACED"));
    }

    @Test
    public void mapsUnavailableServerAndUnknownErrorsSafely() {
        Assert.assertEquals("connection_server_unavailable",
                MultiplayerErrorMessages.messageKey("java.net.SocketTimeoutException: connect timed out"));
        Assert.assertEquals("connection_server_unavailable",
                MultiplayerErrorMessages.messageKey("java.net.UnknownHostException: host"));
        Assert.assertEquals("connection_start_failed",
                MultiplayerErrorMessages.messageKey("internal transport detail"));
        Assert.assertEquals("connection_start_failed", MultiplayerErrorMessages.messageKey(null));
        Assert.assertEquals("connection_start_failed", MultiplayerErrorMessages.messageKey(" "));
    }
}