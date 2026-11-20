package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;

public class BluetoothFrameCodecTest {

    @Test
    public void roundTripsStrictUtf8AndAcceptsCrLfTerminators() throws Exception {
        String json = "{\"text\":\"مرحبا — hello 😃\"}";
        byte[] encoded = BluetoothFrameCodec.encodeFrame(json);
        Assert.assertEquals('\n', encoded[encoded.length - 1]);
        Assert.assertEquals(json, BluetoothFrameCodec.readFrame(new ByteArrayInputStream(encoded)));

        byte[] crlf = (json + "\r\n").getBytes("UTF-8");
        Assert.assertEquals(json, BluetoothFrameCodec.readFrame(new ByteArrayInputStream(crlf)));
    }

    @Test
    public void distinguishesCleanEofFromTruncatedFrame() throws Exception {
        Assert.assertNull(BluetoothFrameCodec.readFrame(new ByteArrayInputStream(new byte[0])));
        try {
            BluetoothFrameCodec.readFrame(new ByteArrayInputStream("partial".getBytes("UTF-8")));
            Assert.fail("A partial frame must not be accepted at EOF");
        } catch (EOFException expected) {
            Assert.assertEquals("BLUETOOTH_FRAME_TRUNCATED", expected.getMessage());
        }
    }

    @Test
    public void rejectsMalformedUtf8AndEmptyFrames() throws Exception {
        try {
            BluetoothFrameCodec.readFrame(new ByteArrayInputStream(new byte[] {(byte) 0xC3, '\n'}));
            Assert.fail("Malformed UTF-8 must fail closed");
        } catch (IOException expected) {
            Assert.assertEquals("BLUETOOTH_FRAME_INVALID_UTF8", expected.getMessage());
        }
        try {
            BluetoothFrameCodec.readFrame(new ByteArrayInputStream(new byte[] {'\n'}));
            Assert.fail("Empty frames must fail closed");
        } catch (IOException expected) {
            Assert.assertEquals("BLUETOOTH_FRAME_EMPTY", expected.getMessage());
        }
    }

    @Test
    public void rejectsFrameInjectionAndMalformedSurrogates() throws Exception {
        assertEncodeFailure("one\ntwo", "BLUETOOTH_FRAME_INVALID");
        assertEncodeFailure("one\rtwo", "BLUETOOTH_FRAME_INVALID");
        assertEncodeFailure("\uD800", "BLUETOOTH_FRAME_INVALID_UTF8");
        assertEncodeFailure("", "BLUETOOTH_FRAME_INVALID");
    }

    @Test
    public void enforcesSixteenMibUtf8FrameLimit() throws Exception {
        char[] maximum = new char[BluetoothFrameCodec.MAX_FRAME_BYTES];
        java.util.Arrays.fill(maximum, 'x');
        byte[] encoded = BluetoothFrameCodec.encodeFrame(new String(maximum));
        Assert.assertEquals(BluetoothFrameCodec.MAX_FRAME_BYTES + 1, encoded.length);
        char[] oversized = new char[BluetoothFrameCodec.MAX_FRAME_BYTES + 1];
        java.util.Arrays.fill(oversized, 'x');
        assertEncodeFailure(new String(oversized), "BLUETOOTH_FRAME_TOO_LARGE");
    }

    @Test
    public void readRejectsAnOverLimitFrameBeforeTerminator() throws Exception {
        InputStreamLike input = new InputStreamLike(BluetoothFrameCodec.MAX_FRAME_BYTES + 1);
        try {
            BluetoothFrameCodec.readFrame(input);
            Assert.fail("Over-limit frame must fail before an unbounded allocation");
        } catch (IOException expected) {
            Assert.assertEquals("BLUETOOTH_FRAME_TOO_LARGE", expected.getMessage());
        }
    }

    @Test
    public void writerFlushesOneNewlineDelimitedFrame() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        BluetoothFrameCodec.writeFrame(output, "{\"ok\":true}");
        Assert.assertEquals("{\"ok\":true}\n", new String(output.toByteArray(), "UTF-8"));
    }

    private static void assertEncodeFailure(String value, String code) throws Exception {
        try {
            BluetoothFrameCodec.encodeFrame(value);
            Assert.fail("Expected " + code);
        } catch (IOException expected) {
            Assert.assertEquals(code, expected.getMessage());
        }
    }

    private static final class InputStreamLike extends java.io.InputStream {
        private final int count;
        private int read;
        InputStreamLike(int count) { this.count = count; }
        @Override public int read() {
            return read++ < count ? 'x' : -1;
        }
    }
}