package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

public class LanNetworkInterfacesTest {

    @Test
    public void acceptsOnlyUsableIpv4BroadcastPairs() throws Exception {
        Assert.assertNotNull(LanNetworkInterfaces.BroadcastAddress.create("wlan0",
                InetAddress.getByName("192.168.1.20"), InetAddress.getByName("192.168.1.255")));
        Assert.assertNull(LanNetworkInterfaces.BroadcastAddress.create("lo",
                InetAddress.getByName("127.0.0.1"), InetAddress.getByName("127.255.255.255")));
        Assert.assertNull(LanNetworkInterfaces.BroadcastAddress.create("any",
                InetAddress.getByName("0.0.0.0"), InetAddress.getByName("255.255.255.255")));
        Assert.assertNull(LanNetworkInterfaces.BroadcastAddress.create("multicast",
                InetAddress.getByName("192.168.1.20"), InetAddress.getByName("239.1.1.1")));
        Assert.assertNull(LanNetworkInterfaces.BroadcastAddress.create("ipv6",
                InetAddress.getByName("2001:db8::1"), InetAddress.getByName("2001:db8::ffff")));
        Assert.assertNull(LanNetworkInterfaces.BroadcastAddress.create("missing-broadcast",
                InetAddress.getByName("192.168.1.20"), null));
        Assert.assertNull(LanNetworkInterfaces.BroadcastAddress.create("same-address",
                InetAddress.getByName("192.168.1.20"), InetAddress.getByName("192.168.1.20")));
    }

    @Test
    public void enumeratedDestinationsAreIpv4BroadcastsAndDeterministicallyOrdered() throws Exception {
        List<LanNetworkInterfaces.BroadcastAddress> addresses = LanNetworkInterfaces.getBroadcastAddresses();
        String previous = null;
        for (LanNetworkInterfaces.BroadcastAddress address : addresses) {
            Assert.assertFalse(address.localAddress.isLoopbackAddress());
            Assert.assertFalse(address.broadcastAddress.isLoopbackAddress());
            Assert.assertTrue(address.localAddress instanceof java.net.Inet4Address);
            Assert.assertTrue(address.broadcastAddress instanceof java.net.Inet4Address);
            String current = address.interfaceName + ":" + address.localAddress.getHostAddress();
            if (previous != null) Assert.assertTrue(previous.compareTo(current) <= 0);
            previous = current;
        }
    }
}