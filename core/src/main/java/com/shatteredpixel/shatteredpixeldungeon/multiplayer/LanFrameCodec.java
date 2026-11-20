package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.Charset;

/** Bounded UTF-8 newline framing for LAN's canonical JSON envelopes. */
final class LanFrameCodec {
    private static final Charset UTF_8 = Charset.forName("UTF-8");
    static final int MAX_FRAME_BYTES = 16 * 1024 * 1024;

    private LanFrameCodec() {
    }

    static void writeFrame(OutputStream output, String frame) throws IOException {
        if (output == null || frame == null) throw new IllegalArgumentException("LAN_FRAME_INVALID");
        byte[] bytes = frame.getBytes(UTF_8);
        if (bytes.length == 0 || bytes.length > MAX_FRAME_BYTES
                || frame.indexOf('\n') >= 0 || frame.indexOf('\r') >= 0) {
            throw new IOException("LAN_FRAME_INVALID");
        }
        output.write(bytes);
        output.write('\n');
        output.flush();
    }

    /** Returns null only when EOF occurs before any byte of a new frame. */
    static String readFrame(InputStream input) throws IOException {
        if (input == null) throw new IllegalArgumentException("LAN_STREAM_REQUIRED");
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(256);
        while (true) {
            int value = input.read();
            if (value < 0) {
                if (bytes.size() == 0) return null;
                throw new EOFException("LAN_FRAME_TRUNCATED");
            }
            if (value == '\n') break;
            if (bytes.size() >= MAX_FRAME_BYTES) throw new IOException("LAN_FRAME_TOO_LARGE");
            bytes.write(value);
        }
        byte[] encoded = bytes.toByteArray();
        int length = encoded.length;
        if (length > 0 && encoded[length - 1] == '\r') length--;
        try {
            return UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(encoded, 0, length)).toString();
        } catch (CharacterCodingException malformed) {
            throw new IOException("LAN_FRAME_INVALID_UTF8", malformed);
        }
    }
}