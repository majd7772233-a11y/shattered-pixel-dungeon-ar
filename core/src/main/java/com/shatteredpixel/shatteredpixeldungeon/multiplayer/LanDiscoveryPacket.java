package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.Charset;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.util.regex.Pattern;

/** Versioned, bounded UDP host-advertisement packet. */
final class LanDiscoveryPacket {
    static final String TYPE = "SPD_LAN_HOST";
    static final int VERSION = 1;
    static final int MAX_PACKET_BYTES = 512;
    private static final Charset UTF_8 = Charset.forName("UTF-8");
    private static final Pattern PLAYER_ID = Pattern.compile("[A-Za-z0-9._~-]{1,80}");

    final String hostName;
    final String hostId;
    final int tcpPort;

    private LanDiscoveryPacket(String hostName, String hostId, int tcpPort) {
        this.hostName = hostName;
        this.hostId = hostId;
        this.tcpPort = tcpPort;
    }

    static byte[] encode(String hostName, String hostId, int tcpPort) throws IOException {
        if (!isValidHostName(hostName) || !isValidPlayerId(hostId) || tcpPort < 1 || tcpPort > 65535) {
            throw new IllegalArgumentException("LAN_DISCOVERY_PACKET_INVALID");
        }
        Json json = new Json();
        String payload = "{\"type\":" + json.toJson(TYPE)
                + ",\"version\":" + VERSION
                + ",\"hostName\":" + json.toJson(hostName)
                + ",\"hostId\":" + json.toJson(hostId)
                + ",\"tcpPort\":" + tcpPort + "}";
        byte[] bytes = payload.getBytes(UTF_8);
        if (bytes.length == 0 || bytes.length > MAX_PACKET_BYTES) {
            throw new IOException("LAN_DISCOVERY_PACKET_TOO_LARGE");
        }
        return bytes;
    }

    static LanDiscoveryPacket decode(byte[] bytes, int offset, int length) {
        if (bytes == null || offset < 0 || length < 1 || length > MAX_PACKET_BYTES
                || offset > bytes.length - length) return null;
        try {
            String json = UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes, offset, length)).toString();
            JsonValue root = new JsonReader().parse(json);
            if (root == null || !root.isObject() || root.size != 5) return null;

            JsonValue type = root.get("type");
            JsonValue version = root.get("version");
            JsonValue name = root.get("hostName");
            JsonValue id = root.get("hostId");
            JsonValue port = root.get("tcpPort");
            if (type == null || !type.isString() || !TYPE.equals(type.asString())
                    || version == null || !version.isNumber()
                    || name == null || !name.isString()
                    || id == null || !id.isString()
                    || port == null || !port.isNumber()) return null;

            double versionValue = version.asDouble();
            double portValue = port.asDouble();
            if (versionValue != VERSION || portValue != Math.rint(portValue)
                    || portValue < 1 || portValue > 65535) return null;

            String hostName = name.asString();
            String hostId = id.asString();
            int tcpPort = (int) portValue;
            if (!isValidHostName(hostName) || !isValidPlayerId(hostId)) return null;
            return new LanDiscoveryPacket(hostName, hostId, tcpPort);
        } catch (CharacterCodingException | RuntimeException malformed) {
            return null;
        }
    }

    private static boolean isValidHostName(String value) {
        if (value == null || value.trim().isEmpty() || value.length() > 40) return false;
        for (int i = 0; i < value.length(); i++) {
            if (Character.isISOControl(value.charAt(i))) return false;
        }
        return true;
    }

    private static boolean isValidPlayerId(String value) {
        return value != null && PLAYER_ID.matcher(value).matches();
    }
}