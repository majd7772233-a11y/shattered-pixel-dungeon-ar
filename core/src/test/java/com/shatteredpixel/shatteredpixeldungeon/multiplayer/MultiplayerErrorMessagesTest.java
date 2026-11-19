package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

public class MultiplayerErrorMessagesTest {

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