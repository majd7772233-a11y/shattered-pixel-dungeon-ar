package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

public class NetworkMessage {
    public static final String PROTOCOL_VERSION = "1.0.0";

    public String protocolVersion = PROTOCOL_VERSION;
    public MessageType messageType;
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
}
