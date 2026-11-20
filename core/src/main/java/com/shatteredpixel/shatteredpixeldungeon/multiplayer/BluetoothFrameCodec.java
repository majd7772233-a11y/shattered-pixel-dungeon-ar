package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;

/** Bounded, strict UTF-8 newline framing for Bluetooth RFCOMM JSON messages. */
public final class BluetoothFrameCodec {
    public static final int MAX_FRAME_BYTES = 16 * 1024 * 1024;
    private static final Charset UTF_8 = Charset.forName("UTF-8");

    private BluetoothFrameCodec() {
    }

    /** Encodes one non-empty JSON frame and its terminating newline. */
    public static byte[] encodeFrame(String frame) throws IOException {
        if (frame == null || frame.length() == 0 || frame.indexOf('\n') >= 0 || frame.indexOf('\r') >= 0) {
        // UTF-8 needs at least one byte per UTF-16 code unit; reject clearly oversized input before allocation.
        if (frame.length() > MAX_FRAME_BYTES) throw new IOException("BLUETOOTH_FRAME_TOO_LARGE");
            throw new IOException("BLUETOOTH_FRAME_INVALID");
        }
        final ByteBuffer encoded;
        try {
            encoded = UTF_8.newEncoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .encode(CharBuffer.wrap(frame));
        } catch (CharacterCodingException malformed) {
            throw new IOException("BLUETOOTH_FRAME_INVALID_UTF8", malformed);
        }
        if (encoded.remaining() == 0 || encoded.remaining() > MAX_FRAME_BYTES) {
            throw new IOException("BLUETOOTH_FRAME_TOO_LARGE");
        }
        byte[] payload = new byte[encoded.remaining()];
        encoded.get(payload);
        byte[] result = new byte[payload.length + 1];
        System.arraycopy(payload, 0, result, 0, payload.length);
        result[payload.length] = '\n';
        return result;
    }

    /** Writes exactly one bounded frame. The caller owns stream synchronization. */
    public static void writeFrame(OutputStream output, String frame) throws IOException {
        if (output == null) throw new IllegalArgumentException("BLUETOOTH_STREAM_REQUIRED");
        output.write(encodeFrame(frame));
        output.flush();
    }

    /** Returns null only for clean EOF before a frame; truncated or malformed data rejects. */
    public static String readFrame(InputStream input) throws IOException {
        if (input == null) throw new IllegalArgumentException("BLUETOOTH_STREAM_REQUIRED");
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(256);
        while (true) {
            int value = input.read();
            if (value < 0) {
                if (bytes.size() == 0) return null;
                throw new EOFException("BLUETOOTH_FRAME_TRUNCATED");
            }
            if (value == '\n') break;
            if (bytes.size() >= MAX_FRAME_BYTES) throw new IOException("BLUETOOTH_FRAME_TOO_LARGE");
            bytes.write(value);
        }

        byte[] encoded = bytes.toByteArray();
        int length = encoded.length;
        if (length > 0 && encoded[length - 1] == '\r') length--;
        if (length == 0) throw new IOException("BLUETOOTH_FRAME_EMPTY");
        try {
            return UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(encoded, 0, length)).toString();
        } catch (CharacterCodingException malformed) {
            throw new IOException("BLUETOOTH_FRAME_INVALID_UTF8", malformed);
        }
    }
}
