package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.nio.charset.Charset;

public class LanFrameCodecTest {

    @Test
    public void roundTripsUtf8FramesAndMultipleMessages() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        LanFrameCodec.writeFrame(output, "{\"message\":\"hello\"}");
        LanFrameCodec.writeFrame(output, "{\"message\":\"مرحبا 🌟\"}");

        ByteArrayInputStream input = new ByteArrayInputStream(output.toByteArray());
        Assert.assertEquals("{\"message\":\"hello\"}", LanFrameCodec.readFrame(input));
        Assert.assertEquals("{\"message\":\"مرحبا 🌟\"}", LanFrameCodec.readFrame(input));
        Assert.assertNull(LanFrameCodec.readFrame(input));
    }

    @Test
    public void acceptsCrLfAndRejectsTruncatedFrames() throws Exception {
        Assert.assertEquals("frame", LanFrameCodec.readFrame(
                new ByteArrayInputStream("frame\r\n".getBytes(Charset.forName("UTF-8")))));
        try {
            LanFrameCodec.readFrame(new ByteArrayInputStream(new byte[]{'{', '}'}));
            Assert.fail("A partial frame must not be accepted as a complete message");
        } catch (EOFException expected) {
            Assert.assertEquals("LAN_FRAME_TRUNCATED", expected.getMessage());
        }
    }

    @Test
    public void rejectsInvalidUtf8AndOversizedFrames() throws Exception {
        try {
            LanFrameCodec.readFrame(new ByteArrayInputStream(new byte[]{(byte) 0xC3, '\n'}));
            Assert.fail("Malformed UTF-8 must be rejected");
        } catch (IOException expected) {
            Assert.assertEquals("LAN_FRAME_INVALID_UTF8", expected.getMessage());
        }

        byte[] oversized = new byte[LanFrameCodec.MAX_FRAME_BYTES + 2];
        oversized[oversized.length - 1] = '\n';
        try {
            LanFrameCodec.readFrame(new ByteArrayInputStream(oversized));
            Assert.fail("Oversized frames must be rejected before unbounded allocation");
        } catch (IOException expected) {
            Assert.assertEquals("LAN_FRAME_TOO_LARGE", expected.getMessage());
        }
    }

    @Test
    public void writerRejectsLineBreaksAndEmptyFrames() throws Exception {
        for (String value : new String[]{"", "a\nb", "a\rb"}) {
            try {
                LanFrameCodec.writeFrame(new ByteArrayOutputStream(), value);
                Assert.fail("Invalid frame should be rejected");
            } catch (IOException expected) {
                Assert.assertEquals("LAN_FRAME_INVALID", expected.getMessage());
            }
        }
    }
}