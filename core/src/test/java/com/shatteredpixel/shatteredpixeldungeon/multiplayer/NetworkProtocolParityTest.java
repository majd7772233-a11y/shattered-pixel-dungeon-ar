package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroAction;
import org.junit.Assert;
import org.junit.Test;

import java.util.Optional;

public class NetworkProtocolParityTest {

    private static String envelope(String type, String payloadJson) {
        Json json = new Json();
        return "{\"protocolVersion\":\"1.0.0\",\"messageType\":"
                + json.toJson(type) + ",\"payloadJson\":" + json.toJson(payloadJson) + "}";
    }

    private static void assertError(String encoded, String expectedCode) {
        NetworkMessage message = NetworkMessage.parseJson(encoded);
        Assert.assertEquals("Rejected envelopes must never become a gameplay action", MessageType.ERROR, message.messageType);
        JsonValue error = new JsonReader().parse(message.payloadJson);
        Assert.assertEquals(expectedCode, error.getString("error", ""));
    }

    @Test
    public void parsesCompleteTypedEnvelopeAndEncodedNestedPayload() {
        String payload = "{\"action\":\"WAIT\",\"data\":{\"reason\":\"test\"}}";
        String encoded = "{\"protocolVersion\":\"1.0.0\",\"messageType\":\"ACTION\","
                + "\"requestId\":\"request-1\",\"senderId\":\"player-1\",\"sequence\":7,"
                + "\"payloadJson\":" + new Json().toJson(payload) + "}";
        NetworkMessage message = NetworkMessage.parseJson(encoded);
        Assert.assertEquals(MessageType.ACTION, message.messageType);
        Assert.assertEquals(NetworkMessage.PROTOCOL_VERSION, message.protocolVersion);
        Assert.assertEquals("request-1", message.requestId);
        Assert.assertEquals("player-1", message.senderId);
        Assert.assertEquals(7L, message.sequence);
        Assert.assertEquals(payload, message.payloadJson);
    }

    @Test
    public void acceptsOmittedOptionalFieldsWithTheDefinedSequenceDefault() {
        NetworkMessage message = NetworkMessage.parseJson(
                "{\"protocolVersion\":\"1.0.0\",\"messageType\":\"PING\",\"payloadJson\":\"{}\"}");
        Assert.assertEquals(MessageType.PING, message.messageType);
        Assert.assertNull(message.requestId);
        Assert.assertNull(message.senderId);
        Assert.assertEquals(0L, message.sequence);
    }

    @Test
    public void rejectsEveryMissingRequiredEnvelopeField() {
        assertError("{\"messageType\":\"PING\",\"payloadJson\":\"{}\"}", "INVALID_MESSAGE_ENVELOPE");
        assertError("{\"protocolVersion\":\"1.0.0\",\"payloadJson\":\"{}\"}", "INVALID_MESSAGE_ENVELOPE");
        assertError("{\"protocolVersion\":\"1.0.0\",\"messageType\":\"PING\"}", "INVALID_MESSAGE_ENVELOPE");
    }

    @Test
    public void rejectsWrongRequiredAndOptionalFieldTypesAndInvalidSequences() {
        assertError("{\"protocolVersion\":1,\"messageType\":\"PING\",\"payloadJson\":\"{}\"}", "INVALID_MESSAGE_ENVELOPE");
        assertError("{\"protocolVersion\":\"1.0.0\",\"messageType\":7,\"payloadJson\":\"{}\"}", "INVALID_MESSAGE_ENVELOPE");
        assertError("{\"protocolVersion\":\"1.0.0\",\"messageType\":\"PING\",\"payloadJson\":7}", "INVALID_MESSAGE_ENVELOPE");
        assertError(envelope("PING", "{}").replace("\"payloadJson\":", "\"requestId\":7,\"payloadJson\":"),
                "INVALID_MESSAGE_ENVELOPE");
        assertError(envelope("PING", "{}").replace("\"payloadJson\":", "\"senderId\":false,\"payloadJson\":"),
                "INVALID_MESSAGE_ENVELOPE");
        assertError(envelope("PING", "{}").replace("\"payloadJson\":", "\"sequence\":\"2\",\"payloadJson\":"),
                "INVALID_MESSAGE_ENVELOPE");
        assertError(envelope("PING", "{}").replace("\"payloadJson\":", "\"sequence\":-1,\"payloadJson\":"),
                "INVALID_MESSAGE_ENVELOPE");
        assertError(envelope("PING", "{}").replace("\"payloadJson\":", "\"sequence\":1.5,\"payloadJson\":"),
                "INVALID_MESSAGE_ENVELOPE");
        assertError(envelope("PING", "{}").replace("\"payloadJson\":", "\"sequence\":null,\"payloadJson\":"),
                "INVALID_MESSAGE_ENVELOPE");
        assertError(envelope("PING", "{}").replace("\"payloadJson\":", "\"sequence\":9007199254740992,\"payloadJson\":"),
                "INVALID_MESSAGE_ENVELOPE");
    }

    @Test
    public void acceptsIntegralDecimalSequenceExactlyLikeWorkerSafeIntegerAdmission() {
        NetworkMessage message = NetworkMessage.parseJson(
                "{\"protocolVersion\":\"1.0.0\",\"messageType\":\"PING\",
                        + "\"sequence\":1.0,\"payloadJson\":\"{}\"}");
        Assert.assertEquals(MessageType.PING, message.messageType);
        Assert.assertEquals(1L, message.sequence);
    }

    @Test
    public void rejectsUnsupportedProtocolVersionsAndUnknownMessageTypes() {
        assertError("{\"protocolVersion\":\"2.0.0\",\"messageType\":\"PING\",\"payloadJson\":\"{}\"}",
                "UNSUPPORTED_PROTOCOL_VERSION");
        assertError(envelope("FUTURE_MESSAGE", "{}"), "UNKNOWN_MESSAGE_TYPE");
    }

    @Test
    public void rejectsMalformedOuterAndNestedJsonAndNonObjectEnvelopes() {
        assertError("{broken", "MALFORMED_JSON");
        assertError("[]", "INVALID_MESSAGE_OBJECT");
        assertError(envelope("ACTION", "{broken"), "MALFORMED_MESSAGE_PAYLOAD");
        assertError("{\"protocolVersion\":\"1.0.0\",\"messageType\":\"PING\",\"payloadJson\":12}",
                "INVALID_MESSAGE_ENVELOPE");
    }

    @Test
    public void preservesOnlyDocumentedLegacyLanEnvelopeForms() {
        NetworkMessage objectPayload = NetworkMessage.parseJson(
                "{\"protocolVersion\":\"1.0.0\",\"messageType\":\"ACTION\","
                        + "\"requestId\":null,\"senderId\":\"lan-player\","
                        + "\"sequence\":0,\"payloadJson\":{\"action\":\"WAIT\"}}");
        Assert.assertEquals(MessageType.ACTION, objectPayload.messageType);
        Assert.assertNull("Legacy LAN requestId:null is interpreted as absent", objectPayload.requestId);
        Assert.assertEquals("{\"action\":\"WAIT\"}", objectPayload.payloadJson);

        NetworkMessage arrayPayload = NetworkMessage.parseJson(
                "{\"protocolVersion\":\"1.0.0\",\"messageType\":\"EVENT_BATCH\","
                        + "\"senderId\":null,\"payloadJson\":[{\"sequence\":1}]}");
        Assert.assertEquals(MessageType.EVENT_BATCH, arrayPayload.messageType);
        Assert.assertEquals("[{\"sequence\":1}]", arrayPayload.payloadJson);
    }

    @Test
    public void legacyBluetoothEnvelopeIsAcceptedOnlyThroughBluetoothParser() {
        String legacy = "{\"messageType\":\"CHAT\",\"payloadJson\":{\"text\":\"old-peer\"}}";
        assertError(legacy, "INVALID_MESSAGE_ENVELOPE");

        NetworkMessage received = NetworkMessage.parseBluetoothJson(legacy);
        Assert.assertEquals(MessageType.CHAT, received.messageType);
        Assert.assertEquals(NetworkMessage.PROTOCOL_VERSION, received.protocolVersion);
        Assert.assertEquals("{\"text\":\"old-peer\"}", received.payloadJson);

        NetworkMessage extraField = NetworkMessage.parseBluetoothJson(
                "{\"messageType\":\"CHAT\",\"senderId\":\"old-peer\",
                        + "\"payloadJson\":{\"text\":\"old-peer\"}}");
        Assert.assertEquals(MessageType.ERROR, extraField.messageType);
    }

    @Test
    public void canonicalSerializerWritesVersionAndEscapedStringPayload() {
        String payload = "{\"note\":\"quote \\\" and slash \\\\\"}";
        NetworkMessage message = new NetworkMessage(MessageType.PING, payload);
        message.requestId = "request-2";
        message.senderId = "player-2";
        message.sequence = 9L;

        String encoded = message.toJson();
        JsonValue root = new JsonReader().parse(encoded);
        Assert.assertEquals("1.0.0", root.getString("protocolVersion"));
        Assert.assertEquals("PING", root.getString("messageType"));
        Assert.assertEquals("request-2", root.getString("requestId"));
        Assert.assertEquals("player-2", root.getString("senderId"));
        Assert.assertEquals(9L, root.getLong("sequence"));
        Assert.assertTrue(root.get("payloadJson").isString());
        Assert.assertEquals(payload, root.getString("payloadJson"));
        NetworkMessage roundTrip = NetworkMessage.parseJson(encoded);
        Assert.assertEquals(MessageType.PING, roundTrip.messageType);
        Assert.assertEquals(payload, roundTrip.payloadJson);
    }

    @Test
    public void serializerRejectsMissingTypeUnsupportedVersionAndMalformedPayload() {
        NetworkMessage missingType = new NetworkMessage();
        missingType.payloadJson = "{}";
        assertSerializationFailure(missingType);
        NetworkMessage unsupportedVersion = new NetworkMessage(MessageType.PING, "{}");
        unsupportedVersion.protocolVersion = "2.0.0";
        assertSerializationFailure(unsupportedVersion);
        NetworkMessage malformedPayload = new NetworkMessage(MessageType.PING, "{broken");
        assertSerializationFailure(malformedPayload);
    }

    private static void assertSerializationFailure(NetworkMessage message) {
        try {
            message.toJson();
            Assert.fail("Invalid outgoing envelopes must not be serialized");
        } catch (IllegalArgumentException | IllegalStateException expected) {
            // Expected: invalid messages are never silently converted to ACTION or WAIT.
        }
    }

    @Test
    public void mapsEveryKnownNativeHeroActionWithoutInventingWaitFallback() {
        assertAction(new HeroAction.Move(1), NetworkActionType.MOVE);
        assertAction(new HeroAction.Attack(null), NetworkActionType.ATTACK);
        assertAction(new HeroAction.PickUp(1), NetworkActionType.PICKUP);
        assertAction(new HeroAction.OpenChest(1), NetworkActionType.OPEN_CHEST);
        assertAction(new HeroAction.Buy(1), NetworkActionType.BUY);
        assertAction(new HeroAction.Interact(null), NetworkActionType.INTERACT);
        assertAction(new HeroAction.Unlock(1), NetworkActionType.UNLOCK);
        assertAction(new HeroAction.LvlTransition(1), NetworkActionType.LVL_TRANSITION);
        assertAction(new HeroAction.Mine(1), NetworkActionType.MINE);
        assertAction(new HeroAction.Alchemy(1), NetworkActionType.ALCHEMY);
        Assert.assertEquals(Optional.empty(), NetworkActionBridge.mapHeroActionToNetworkAction(null));
        Assert.assertEquals(Optional.empty(), NetworkActionBridge.mapHeroActionToNetworkAction(new HeroAction() {}));
    }

    private static void assertAction(HeroAction action, NetworkActionType expected) {
        Assert.assertEquals(Optional.of(expected), NetworkActionBridge.mapHeroActionToNetworkAction(action));
    }

    @Test
    public void bluetoothTransportWritesTheCanonicalVersionedEnvelope() throws Exception {
        final byte[][] captured = new byte[1][];
        BluetoothTransport.NativeBluetoothProvider provider = new BluetoothTransport.NativeBluetoothProvider() {
            @Override public void startServer(java.util.UUID serviceUuid, TransportCallback callback) {}
            @Override public void connectDevice(String deviceAddress, java.util.UUID serviceUuid, TransportCallback callback) {}
            @Override public void sendData(byte[] data) { captured[0] = data.clone(); }
            @Override public void disconnect() {}
            @Override public boolean isConnected() { return true; }
        };
        BluetoothTransport.setNativeProvider(provider);
        try {
            NetworkMessage message = new NetworkMessage(MessageType.CHAT, "{\"text\":\"hello\"}");
            message.senderId = "bluetooth-player";
            message.requestId = "bluetooth-request";
            message.sequence = 4L;
            new BluetoothTransport().send(message);

            Assert.assertNotNull("Bluetooth must write through the canonical envelope serializer", captured[0]);
            String wire = new String(captured[0], "UTF-8");
            Assert.assertTrue("Bluetooth keeps newline-delimited RFCOMM framing", wire.endsWith("\n"));
            JsonValue root = new JsonReader().parse(wire.substring(0, wire.length() - 1));
            Assert.assertEquals("1.0.0", root.getString("protocolVersion"));
            Assert.assertEquals("CHAT", root.getString("messageType"));
            Assert.assertEquals("bluetooth-player", root.getString("senderId"));
            Assert.assertEquals("bluetooth-request", root.getString("requestId"));
            Assert.assertEquals(4L, root.getLong("sequence"));
            Assert.assertTrue(root.get("payloadJson").isString());
            Assert.assertEquals("{\"text\":\"hello\"}", root.getString("payloadJson"));
        } finally {
            BluetoothTransport.setNativeProvider(null);
        }
    }

    @Test
    public void lanActionParserRejectsMissingMalformedAndUnknownActions() {
        Assert.assertEquals(Optional.of(NetworkActionType.MOVE), LANTransport.parseActionType("{\"action\":\"MOVE\"}"));
        Assert.assertEquals(Optional.of(NetworkActionType.WAIT),
                LANTransport.parseActionType("{\"data\":{\"action\":\"WAIT\"}}"));
        Assert.assertEquals(Optional.empty(), LANTransport.parseActionType(null));
        Assert.assertEquals(Optional.empty(), LANTransport.parseActionType("{}"));
        Assert.assertEquals(Optional.empty(), LANTransport.parseActionType("{broken"));
        Assert.assertEquals(Optional.empty(), LANTransport.parseActionType("{\"action\":\"NOT_A_REAL_ACTION\"}"));
        Assert.assertEquals(Optional.empty(), LANTransport.parseActionType("{\"action\":7}"));
        Assert.assertEquals(Optional.empty(), LANTransport.parseActionType("[]"));
    }
}
