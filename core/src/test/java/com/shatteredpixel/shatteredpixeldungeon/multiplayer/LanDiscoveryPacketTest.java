package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.nio.charset.Charset;
import java.util.Arrays;

public class LanDiscoveryPacketTest {

    @Test
    public void roundTripsVersionedUtf8HostAdvertisement() throws Exception {
        byte[] encoded = LanDiscoveryPacket.encode("مضيف 🌐", "host-01", 8997);
        Assert.assertTrue(encoded.length <= LanDiscoveryPacket.MAX_PACKET_BYTES);

        LanDiscoveryPacket decoded = LanDiscoveryPacket.decode(encoded, 0, encoded.length);
        Assert.assertNotNull(decoded);
        Assert.assertEquals("مضيف 🌐", decoded.hostName);
        Assert.assertEquals("host-01", decoded.hostId);
        Assert.assertEquals(8997, decoded.tcpPort);
    }

    @Test
    public void rejectsUnknownVersionTypeExtraFieldsAndFractionalNumbers() {
        String[] invalid = {
                "{",
                "[]",
                "{\"type\":\"OTHER\",\"version\":1,\"hostName\":\"Host\",\"hostId\":\"host-01\",\"tcpPort\":8990}",
                "{\"type\":\"SPD_LAN_HOST\",\"version\":2,\"hostName\":\"Host\",\"hostId\":\"host-01\",\"tcpPort\":8990}",
                "{\"type\":\"SPD_LAN_HOST\",\"version\":1.5,\"hostName\":\"Host\",\"hostId\":\"host-01\",\"tcpPort\":8990}",
                "{\"type\":\"SPD_LAN_HOST\",\"version\":1,\"hostName\":\"Host\",\"hostId\":\"host-01\",\"tcpPort\":8990.5}",
                "{\"type\":\"SPD_LAN_HOST\",\"version\":1,\"hostName\":\"Host\",\"hostId\":\"host-01\",\"tcpPort\":8990,\"extra\":true}"
        };
        for (String value : invalid) {
            byte[] bytes = value.getBytes(Charset.forName("UTF-8"));
            Assert.assertNull("Should reject " + value,
                    LanDiscoveryPacket.decode(bytes, 0, bytes.length));
        }
    }

    @Test
    public void rejectsInvalidUtf8AndDatagramLengths() {
        Assert.assertNull(LanDiscoveryPacket.decode(new byte[]{(byte) 0xC3}, 0, 1));
        Assert.assertNull(LanDiscoveryPacket.decode(new byte[]{1, 2}, 0, 0));
        Assert.assertNull(LanDiscoveryPacket.decode(new byte[]{1, 2}, -1, 1));
        Assert.assertNull(LanDiscoveryPacket.decode(new byte[]{1, 2}, 1, 2));
        Assert.assertNull(LanDiscoveryPacket.decode(new byte[LanDiscoveryPacket.MAX_PACKET_BYTES + 1],
                0, LanDiscoveryPacket.MAX_PACKET_BYTES + 1));
        Assert.assertNull(LanDiscoveryPacket.decode(null, 0, 1));
    }

    @Test
    public void encoderRejectsInvalidNamesIdentitiesAndPorts() throws Exception {
        Object[][] invalid = {
                {"", "host-01", 8990},
                {"   ", "host-01", 8990},
                {"bad\nname", "host-01", 8990},
                {repeat('x', 41), "host-01", 8990},
                {"Host", "bad identity", 8990},
                {"Host", "host-01", 0},
                {"Host", "host-01", 65536}
        };
        for (Object[] value : invalid) {
            try {
                LanDiscoveryPacket.encode((String) value[0], (String) value[1], (int) value[2]);
                Assert.fail("Expected invalid announcement data to be rejected");
            } catch (IllegalArgumentException expected) {
                Assert.assertEquals("LAN_DISCOVERY_PACKET_INVALID", expected.getMessage());
            }
        }
    }

    private static String repeat(char value, int count) {
        char[] chars = new char[count];
        Arrays.fill(chars, value);
        return new String(chars);
    }
}