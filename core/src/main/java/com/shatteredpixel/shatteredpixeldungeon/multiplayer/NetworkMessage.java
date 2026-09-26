package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public class NetworkMessage {
    public static final String PROTOCOL_VERSION = "1.0.0";

    public String protocolVersion = PROTOCOL_VERSION;
    public MessageType messageType = MessageType.ACTION;
    public String requestId;
    public long sequence;
    public String senderId;
    public String payloadJson;

    public NetworkMessage() {}

    public NetworkMessage(MessageType type, String payloadJson) {
        this.messageType = type;
        this.payloadJson = payloadJson;
        this.protocolVersion = PROTOCOL_VERSION;
    }

    public static NetworkMessage parseJson(String jsonStr) {
        NetworkMessage msg = new NetworkMessage();
        if (jsonStr == null || jsonStr.trim().isEmpty()) return msg;

        msg.payloadJson = jsonStr;

        // Parse messageType
        if (jsonStr.contains("\"messageType\":\"SESSION\"")) msg.messageType = MessageType.SESSION;
        else if (jsonStr.contains("\"messageType\":\"PLAYER_JOINED\"")) msg.messageType = MessageType.PLAYER_JOINED;
        else if (jsonStr.contains("\"messageType\":\"PLAYER_LEFT\"")) msg.messageType = MessageType.PLAYER_LEFT;
        else if (jsonStr.contains("\"messageType\":\"ACTION_ACCEPTED\"")) msg.messageType = MessageType.ACTION_ACCEPTED;
        else if (jsonStr.contains("\"messageType\":\"EVENT_BATCH\"")) msg.messageType = MessageType.EVENT_BATCH;
        else if (jsonStr.contains("\"messageType\":\"SNAPSHOT\"")) msg.messageType = MessageType.SNAPSHOT;
        else if (jsonStr.contains("\"messageType\":\"READY\"")) msg.messageType = MessageType.READY;
        else if (jsonStr.contains("\"messageType\":\"CHAT\"")) msg.messageType = MessageType.CHAT;
        else if (jsonStr.contains("\"messageType\":\"ERROR\"")) msg.messageType = MessageType.ERROR;
        else if (jsonStr.contains("\"messageType\":\"PING\"")) msg.messageType = MessageType.PING;
        else msg.messageType = MessageType.ACTION;

        // Parse senderId
        msg.senderId = extractStringField(jsonStr, "\"senderId\":");

        // Parse requestId
        msg.requestId = extractStringField(jsonStr, "\"requestId\":");

        // Parse sequence
        String seqStr = extractNumberField(jsonStr, "\"sequence\":");
        if (seqStr != null) {
            try {
                msg.sequence = Long.parseLong(seqStr);
            } catch (Exception ignored) {}
        }

        return msg;
    }

    private static String extractStringField(String json, String key) {
        if (!json.contains(key)) return null;
        try {
            int start = json.indexOf(key) + key.length();
            while (start < json.length() && (json.charAt(start) == ' ' || json.charAt(start) == '"')) start++;
            int end = start;
            while (end < json.length() && json.charAt(end) != '"' && json.charAt(end) != ',' && json.charAt(end) != '}') end++;
            if (start < end) {
                return json.substring(start, end).replace("\"", "").trim();
            }
        } catch (Exception ignored) {}
        return null;
    }

    private static String extractNumberField(String json, String key) {
        if (!json.contains(key)) return null;
        try {
            int start = json.indexOf(key) + key.length();
            while (start < json.length() && (json.charAt(start) == ' ' || json.charAt(start) == ':')) start++;
            int end = start;
            while (end < json.length() && Character.isDigit(json.charAt(end))) end++;
            if (start < end) {
                return json.substring(start, end);
            }
        } catch (Exception ignored) {}
        return null;
    }
}
