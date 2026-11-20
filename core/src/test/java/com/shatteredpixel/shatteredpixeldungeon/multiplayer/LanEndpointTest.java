package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

public class LanEndpointTest {

    @Test
    public void parsesIpv4AndExplicitPorts() {
        LanEndpoint endpoint = LanEndpoint.parse("192.168.1.25:9000", 8990);
        Assert.assertEquals("192.168.1.25", endpoint.host);
        Assert.assertEquals(9000, endpoint.port);

        LanEndpoint defaultPort = LanEndpoint.parse(" 192.168.1.25 ", 8990);
        Assert.assertEquals(8990, defaultPort.port);
    }

    @Test
    public void parsesBracketedAndUnbracketedIpv6() {
        LanEndpoint explicit = LanEndpoint.parse("[fe80::1]:9001", 8990);
        Assert.assertEquals("fe80::1", explicit.host);
        Assert.assertEquals(9001, explicit.port);

        LanEndpoint defaultPort = LanEndpoint.parse("2001:db8::5", 8990);
        Assert.assertEquals("2001:db8::5", defaultPort.host);
        Assert.assertEquals(8990, defaultPort.port);
    }

    @Test
    public void rejectsMalformedHostsAndPorts() {
        String[] invalid = {"", "   ", ":8990", "host:", "host:abc", "host:0",
                "host:65536", "host:123456", "bad host", "host/path", "[::1", "[]:80"};
        for (String value : invalid) {
            try {
                LanEndpoint.parse(value, 8990);
                Assert.fail("Expected invalid endpoint: " + value);
            } catch (IllegalArgumentException expected) {
                Assert.assertEquals("LAN_ENDPOINT_INVALID", expected.getMessage());
            }
        }
        try {
            LanEndpoint.parse(null, 8990);
            Assert.fail("Null endpoint must be rejected");
        } catch (IllegalArgumentException expected) {
            Assert.assertEquals("LAN_ENDPOINT_INVALID", expected.getMessage());
        }
    }
}