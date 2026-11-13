package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;

public class NetworkMessage {
    public static final String PROTOCOL_VERSION = "1.0.0";
    private static final long MAX_SAFE_SEQUENCE = 9007199254740991L;

    public String protocolVersion = PROTOCOL_VERSION;
    /** Null until an outgoing message explicitly chooses a type; never infer ACTION. */
    public MessageType messageType;
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

    /**
     * Parses protocol 1.0.0. Required and optional types match Worker admission. The retained
     * compatibility cases are raw object/array payloadJson and nullable optional IDs from
     * the legacy LAN envelope; new senders always emit the canonical string form.
     */
    public static NetworkMessage parseJson(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) return error("EMPTY_MESSAGE", null);
        String requestId = null;
        try {
            JsonValue root = new JsonReader().parse(jsonStr);
            if (root == null || !root.isObject()) return error("INVALID_MESSAGE_OBJECT", null);

            JsonValue requestIdValue = root.get("requestId");
            if (requestIdValue != null && !requestIdValue.isString()) {
                return error("INVALID_MESSAGE_ENVELOPE", null);
            }
            if (requestIdValue != null && requestIdValue.isString()) requestId = requestIdValue.asString();

            JsonValue versionValue = root.get("protocolVersion");
            JsonValue typeValue = root.get("messageType");
            JsonValue payloadValue = root.get("payloadJson");
            if (versionValue == null || !versionValue.isString()
                    || typeValue == null || !typeValue.isString()
                    || payloadValue == null || payloadValue.isNull()) {
                return error("INVALID_MESSAGE_ENVELOPE", requestId);
            }
            String version = versionValue.asString();
            if (!PROTOCOL_VERSION.equals(version)) return error("UNSUPPORTED_PROTOCOL_VERSION", requestId);

            String typeName = typeValue.asString();
            if (typeName.isEmpty()) return error("INVALID_MESSAGE_ENVELOPE", requestId);
            MessageType type;
            try {
                type = MessageType.valueOf(typeName);
            } catch (IllegalArgumentException unknownType) {
                return error("UNKNOWN_MESSAGE_TYPE", requestId);
            }

            JsonValue senderValue = root.get("senderId");
            if (senderValue != null && !senderValue.isString()) {
                return error("INVALID_MESSAGE_ENVELOPE", requestId);
            }
            long parsedSequence = 0L;
            JsonValue sequenceValue = root.get("sequence");
            if (sequenceValue != null) {
                if (!sequenceValue.isNumber()) return error("INVALID_MESSAGE_ENVELOPE", requestId);
                double numericSequence = sequenceValue.asDouble();
                if (Double.isNaN(numericSequence) || Double.isInfinite(numericSequence)
                        || numericSequence < 0d || numericSequence > MAX_SAFE_SEQUENCE
                        || numericSequence != Math.floor(numericSequence)) {
                    return error("INVALID_MESSAGE_ENVELOPE", requestId);
                }
                parsedSequence = (long) numericSequence;
            }

            String decodedPayload;
            if (payloadValue.isString()) {
                decodedPayload = payloadValue.asString();
                if (decodedPayload.trim().isEmpty()) return error("MALFORMED_MESSAGE_PAYLOAD", requestId);
                try {
                    new JsonReader().parse(decodedPayload);
                } catch (RuntimeException malformedPayload) {
                    return error("MALFORMED_MESSAGE_PAYLOAD", requestId);
                }
            } else {
                return error("INVALID_MESSAGE_ENVELOPE", requestId);
            }

            NetworkMessage message = new NetworkMessage();
            message.protocolVersion = version;
            message.messageType = type;
            message.requestId = requestId;
            message.senderId = senderValue == null || senderValue.isNull() ? null : senderValue.asString();
            message.sequence = parsedSequence;
            message.payloadJson = decodedPayload;
            return message;
        } catch (RuntimeException malformedEnvelope) {
            return error("MALFORMED_JSON", requestId);
        }
    }

    /**
     * Accepts only the exact legacy LAN serializer shape: protocol/message/sender/request/sequence
     * plus a raw object-or-array payloadJson. The generic parser and Worker contract stay strict.
     */
    public static NetworkMessage parseLanJson(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) return parseJson(jsonStr);
        try {
            JsonValue root = new JsonReader().parse(jsonStr);
            if (root != null && root.isObject() && root.size == 6) {
                JsonValue version = root.get("protocolVersion");
                JsonValue type = root.get("messageType");
                JsonValue requestId = root.get("requestId");
                JsonValue senderId = root.get("senderId");
                JsonValue sequence = root.get("sequence");
                JsonValue payload = root.get("payloadJson");
                boolean legacyShape = version != null && version.isString()
                        && PROTOCOL_VERSION.equals(version.asString())
                        && type != null && type.isString()
                        && (requestId == null || requestId.isNull() || requestId.isString())
                        && senderId != null && senderId.isString()
                        && sequence != null && sequence.isNumber()
                        && payload != null && (payload.isObject() || payload.isArray());
                if (legacyShape) {
                    double numericSequence = sequence.asDouble();
                    if (Double.isNaN(numericSequence) || Double.isInfinite(numericSequence)
                            || numericSequence < 0d || numericSequence > MAX_SAFE_SEQUENCE
                            || numericSequence != Math.floor(numericSequence)) {
                        return error("INVALID_MESSAGE_ENVELOPE",
                                requestId != null && requestId.isString() ? requestId.asString() : null);
                    }

                    Json json = new Json();
                    StringBuilder normalized = new StringBuilder(128 + payload.toString().length());
                    normalized.append("{\"protocolVersion\":").append(json.toJson(PROTOCOL_VERSION));
                    normalized.append(",\"messageType\":").append(json.toJson(type.asString()));
                    if (requestId != null && requestId.isString()) {
                        normalized.append(",\"requestId\":").append(json.toJson(requestId.asString()));
                    }
                    normalized.append(",\"senderId\":").append(json.toJson(senderId.asString()));
                    normalized.append(",\"sequence\":").append((long) numericSequence);
                    normalized.append(",\"payloadJson\":").append(json.toJson(payload.toString())).append('}');
                    return parseJson(normalized.toString());
                }
            }
        } catch (RuntimeException malformedEnvelope) {
            return parseJson(jsonStr);
        }
        return parseJson(jsonStr);
    }

    /**
     * Reads the one proven legacy Bluetooth envelope. Older BluetoothTransport versions wrote
     * only messageType plus a raw object/array payloadJson, without protocolVersion or optional
     * metadata. This compatibility is deliberately transport-scoped; generic Worker/Internet
     * parsing remains strict.
     */
    public static NetworkMessage parseBluetoothJson(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) return parseJson(jsonStr);
        try {
            JsonValue root = new JsonReader().parse(jsonStr);
            if (root != null && root.isObject() && root.get("protocolVersion") == null) {
                JsonValue type = root.get("messageType");
                JsonValue payload = root.get("payloadJson");
                boolean legacyShape = root.size == 2 && type != null && type.isString()
                        && payload != null && (payload.isObject() || payload.isArray());
                if (!legacyShape) return error("INVALID_MESSAGE_ENVELOPE", null);

                Json json = new Json();
                String normalized = "{\"protocolVersion\":" + json.toJson(PROTOCOL_VERSION)
                        + ",\"messageType\":" + json.toJson(type.asString())
                        + ",\"payloadJson\":" + json.toJson(payload.toString()) + "}";
                return parseJson(normalized);
            }
        } catch (RuntimeException malformedEnvelope) {
            return error("MALFORMED_JSON", null);
        }
        return parseJson(jsonStr);
    }

    /** Emits the canonical envelope used by both transports and accepted by Worker 10-B. */
    public String toJson() {
        if (!PROTOCOL_VERSION.equals(protocolVersion)) throw new IllegalStateException("UNSUPPORTED_PROTOCOL_VERSION");
        if (messageType == null) throw new IllegalStateException("MISSING_MESSAGE_TYPE");
        if (sequence < 0L || sequence > MAX_SAFE_SEQUENCE) throw new IllegalStateException("INVALID_MESSAGE_SEQUENCE");

        String payload = payloadJson == null || payloadJson.trim().isEmpty() ? "{}" : payloadJson;
        try {
            new JsonReader().parse(payload);
        } catch (RuntimeException malformedPayload) {
            throw new IllegalArgumentException("MALFORMED_MESSAGE_PAYLOAD", malformedPayload);
        }

        Json json = new Json();
        StringBuilder envelope = new StringBuilder(128 + payload.length());
        envelope.append("{\"protocolVersion\":").append(json.toJson(protocolVersion));
        envelope.append(",\"messageType\":").append(json.toJson(messageType.name()));
        if (requestId != null) envelope.append(",\"requestId\":").append(json.toJson(requestId));
        if (senderId != null) envelope.append(",\"senderId\":").append(json.toJson(senderId));
        envelope.append(",\"sequence\":").append(sequence);
        envelope.append(",\"payloadJson\":").append(json.toJson(payload)).append('}');
        return envelope.toString();
    }

    private static NetworkMessage error(String code, String requestId) {
        NetworkMessage message = new NetworkMessage();
        message.messageType = MessageType.ERROR;
        message.requestId = requestId;
        message.payloadJson = "{\"error\":\"" + code + "\"}";
        return message;
    }
}
