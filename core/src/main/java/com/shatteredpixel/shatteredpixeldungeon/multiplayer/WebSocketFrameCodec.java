package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

/** Bounded RFC 6455 frame reader, fragmented-text assembler and masked client writer. */
final class WebSocketFrameCodec {
    static final int MAX_FRAME_PAYLOAD = 16 * 1024 * 1024;
    static final int MAX_MESSAGE_PAYLOAD = 16 * 1024 * 1024;
    private static final SecureRandom RANDOM = new SecureRandom();

    static final int CONTINUATION = 0x0;
    static final int TEXT = 0x1;
    static final int BINARY = 0x2;
    static final int CLOSE = 0x8;
    static final int PING = 0x9;
    static final int PONG = 0xA;

    private WebSocketFrameCodec() {}

    static final class Frame {
        final boolean fin;
        final int opcode;
        final byte[] payload;
        Frame(boolean fin, int opcode, byte[] payload) {
            this.fin = fin;
            this.opcode = opcode;
            this.payload = payload;
        }
    }

    static Frame readServerFrame(DataInputStream input) throws IOException {
        int first = input.readUnsignedByte();
        int second = input.readUnsignedByte();
        boolean fin = (first & 0x80) != 0;
        if ((first & 0x70) != 0) throw protocolError("WebSocket RSV bits must be zero without negotiated extensions");
        int opcode = first & 0x0f;
        if (opcode != CONTINUATION && opcode != TEXT && opcode != BINARY
                && opcode != CLOSE && opcode != PING && opcode != PONG) {
            throw protocolError("Reserved WebSocket opcode");
        }
        if ((second & 0x80) != 0) throw protocolError("Server-to-client WebSocket frames must not be masked");

        long length = second & 0x7f;
        if (length == 126) {
            length = ((long) input.readUnsignedByte() << 8) | input.readUnsignedByte();
            if (length < 126) throw protocolError("Non-canonical WebSocket payload length");
        } else if (length == 127) {
            int high = input.readUnsignedByte();
            if ((high & 0x80) != 0) throw protocolError("Invalid 64-bit WebSocket payload length");
            length = high;
            for (int i = 0; i < 7; i++) length = (length << 8) | input.readUnsignedByte();
            if (length < 65536) throw protocolError("Non-canonical WebSocket payload length");
        }
        if (length > MAX_FRAME_PAYLOAD) throw tooBigError("WebSocket frame exceeds the 16 MiB limit");
        boolean control = (opcode & 0x8) != 0;
        if (control && (!fin || length > 125)) {
            throw protocolError("WebSocket control frames must be final and at most 125 bytes");
        }
        byte[] payload = new byte[(int) length];
        input.readFully(payload);
        if (opcode == CLOSE) validateClosePayload(payload);
        return new Frame(fin, opcode, payload);
    }

    static final class MessageAssembler {
        private ByteArrayOutputStream fragmented;

        /** Returns a complete UTF-8 text message, or null for an incomplete/control frame. */
        String accept(Frame frame) throws IOException {
            switch (frame.opcode) {
                case PING:
                case PONG:
                case CLOSE:
                    return null;
                case BINARY:
                    throw new WebSocketProtocolException(1003, "Binary WebSocket messages are not supported");
                case TEXT:
                    if (fragmented != null) throw protocolError("New data frame received before fragmented message completed");
                    if (frame.fin) return decodeUtf8(frame.payload);
                    fragmented = new ByteArrayOutputStream(frame.payload.length);
                    appendFragment(frame.payload);
                    return null;
                case CONTINUATION:
                    if (fragmented == null) throw protocolError("Unexpected WebSocket continuation frame");
                    appendFragment(frame.payload);
                    if (!frame.fin) return null;
                    byte[] complete = fragmented.toByteArray();
                    fragmented = null;
                    return decodeUtf8(complete);
                default:
                    throw protocolError("Unsupported WebSocket opcode");
            }
        }

        private void appendFragment(byte[] payload) throws IOException {
            if ((long) fragmented.size() + payload.length > MAX_MESSAGE_PAYLOAD) {
                fragmented = null;
                throw tooBigError("Fragmented WebSocket message exceeds the 16 MiB limit");
            }
            fragmented.write(payload);
        }
    }

    static void writeClientFrame(DataOutputStream output, int opcode, byte[] payload) throws IOException {
        byte[] mask = new byte[4];
        RANDOM.nextBytes(mask);
        writeClientFrame(output, opcode, payload, mask);
    }

    static void writeClientFrame(DataOutputStream output, int opcode, byte[] payload, byte[] mask) throws IOException {
        if (payload == null) payload = new byte[0];
        if (mask == null || mask.length != 4) throw new IllegalArgumentException("A four-byte WebSocket mask is required");
        if (opcode != CONTINUATION && opcode != TEXT && opcode != BINARY
                && opcode != CLOSE && opcode != PING && opcode != PONG) {
            throw new IllegalArgumentException("Reserved WebSocket opcode");
        }
        boolean control = (opcode & 0x8) != 0;
        if (payload.length > MAX_FRAME_PAYLOAD || control && payload.length > 125) {
            throw new IOException("Outgoing WebSocket frame exceeds its limit");
        }
        output.writeByte(0x80 | opcode);
        if (payload.length <= 125) {
            output.writeByte(0x80 | payload.length);
        } else if (payload.length <= 65535) {
            output.writeByte(0x80 | 126);
            output.writeByte((payload.length >>> 8) & 0xff);
            output.writeByte(payload.length & 0xff);
        } else {
            output.writeByte(0x80 | 127);
            long length = payload.length;
            for (int shift = 56; shift >= 0; shift -= 8) output.writeByte((int) (length >>> shift) & 0xff);
        }
        output.write(mask);
        for (int i = 0; i < payload.length; i++) output.writeByte(payload[i] ^ mask[i & 3]);
        output.flush();
    }

    static byte[] closePayload(int statusCode, String reason) throws IOException {
        validateCloseCode(statusCode);
        byte[] reasonBytes = encodeUtf8(reason == null ? "" : reason);
        if (reasonBytes.length > 123) throw new IOException("WebSocket close reason exceeds 123 UTF-8 bytes");
        byte[] payload = new byte[2 + reasonBytes.length];
        payload[0] = (byte) (statusCode >>> 8);
        payload[1] = (byte) statusCode;
        System.arraycopy(reasonBytes, 0, payload, 2, reasonBytes.length);
        return payload;
    }

    static void validateClosePayload(byte[] payload) throws IOException {
        if (payload.length == 1) throw protocolError("WebSocket close payload cannot contain a single byte");
        if (payload.length >= 2) {
            int code = ((payload[0] & 0xff) << 8) | (payload[1] & 0xff);
            validateCloseCode(code);
            byte[] reason = new byte[payload.length - 2];
            System.arraycopy(payload, 2, reason, 0, reason.length);
            decodeUtf8(reason);
        }
    }

    private static void validateCloseCode(int code) throws IOException {
        boolean valid = code >= 1000 && code <= 1014 && code != 1004 && code != 1005 && code != 1006
                || code >= 3000 && code <= 4999;
        if (!valid) throw protocolError("Invalid or reserved WebSocket close status code");
    }

    static byte[] encodeUtf8(String value) throws IOException {
        try {
            ByteBuffer encoded = StandardCharsets.UTF_8.newEncoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .encode(CharBuffer.wrap(value));
            byte[] result = new byte[encoded.remaining()];
            encoded.get(result);
            return result;
        } catch (CharacterCodingException invalidUtf16) {
            throw new WebSocketProtocolException(1007, "Text contains an invalid Unicode surrogate");
        }
    }

    static String decodeUtf8(byte[] bytes) throws IOException {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException invalidUtf8) {
            throw new WebSocketProtocolException(1007, "WebSocket text payload is not valid UTF-8");
        }
    }

    private static WebSocketProtocolException protocolError(String message) {
        return new WebSocketProtocolException(1002, message);
    }

    private static WebSocketProtocolException tooBigError(String message) {
        return new WebSocketProtocolException(1009, message);
    }

    static final class WebSocketProtocolException extends IOException {
        final int closeCode;
        WebSocketProtocolException(int closeCode, String message) {
            super(message);
            this.closeCode = closeCode;
        }
    }
}
