package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;

public class NetworkMessage {
    public static final String PROTOCOL_VERSION = "1.0.0";

    public String protocolVersion = PROTOCOL_VERSION;
    public MessageType messageType = MessageType.ACTION;
    public String requestId;
    public long sequence;
    public String senderId;
    /** The decoded JSON payload. It remains a string for wire compatibility with server 1.0.0. */
    public String payloadJson;

    public NetworkMessage() {}

    public NetworkMessage(MessageType type, String payloadJson) {
        this.messageType = type;
        this.payloadJson = payloadJson;
        this.protocolVersion = PROTOCOL_VERSION;
    }

    public static NetworkMessage parseJson(String jsonStr) {
        NetworkMessage msg = new NetworkMessage();
        if (jsonStr == null || jsonStr.trim().isEmpty()) {
            msg.messageType = MessageType.ERROR;
            msg.payloadJson = "{\"error\":\"EMPTY_MESSAGE\"}";
            return msg;
        }

        try {
            JsonValue root = new JsonReader().parse(jsonStr);
            if (root == null || !root.isObject()) {
                msg.messageType = MessageType.ERROR;
                msg.payloadJson = "{\"error\":\"INVALID_MESSAGE_OBJECT\"}";
                return msg;
            }

            msg.protocolVersion = stringField(root, "protocolVersion", PROTOCOL_VERSION);
            String type = stringField(root, "messageType", "ERROR");
            try {
                msg.messageType = MessageType.valueOf(type);
            } catch (IllegalArgumentException ignored) {
                msg.messageType = MessageType.ERROR;
                msg.payloadJson = "{\"error\":\"UNKNOWN_MESSAGE_TYPE\"}";
                return msg;
            }

            msg.senderId = nullableString(root.get("senderId"));
            msg.requestId = nullableString(root.get("requestId"));
            JsonValue sequenceValue = root.get("sequence");
            if (sequenceValue != null && !sequenceValue.isNull()) {
                try {
                    msg.sequence = sequenceValue.asLong();
                } catch (RuntimeException ignored) {
                    msg.sequence = 0L;
                }
            }

            JsonValue payload = root.get("payloadJson");
            if (payload == null || payload.isNull()) {
                msg.payloadJson = "{}";
            } else if (payload.isString()) {
                msg.payloadJson = payload.asString();
            } else {
                // Accept object/array payloads from newer peers without double-encoding them.
                msg.payloadJson = payload.toString();
            }
        } catch (RuntimeException ex) {
            msg.messageType = MessageType.ERROR;
            msg.payloadJson = "{\"error\":\"MALFORMED_JSON\"}";
        }
        return msg;
    }

    private static String stringField(JsonValue root, String key, String fallback) {
        JsonValue value = root.get(key);
        if (value == null || value.isNull()) return fallback;
        try {
            return value.asString();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static String nullableString(JsonValue value) {
        if (value == null || value.isNull()) return null;
        try {
            return value.asString();
        } catch (RuntimeException ignored) {
            return null;
        }
    }
}
