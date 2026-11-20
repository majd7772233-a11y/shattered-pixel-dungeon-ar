package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.net.InetAddress;
import java.net.SocketException;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public class LanHostAnnouncerTest {

    @Test
    public void repeatsVersionedAnnouncementsToEachBroadcastInterface() throws Exception {
        LanNetworkInterfaces.BroadcastAddress first = address("wlan0", "192.168.1.2", "192.168.1.255");
        LanNetworkInterfaces.BroadcastAddress second = address("eth0", "10.0.0.2", "10.0.0.255");
        CountDownLatch sent = new CountDownLatch(4);
        AtomicInteger count = new AtomicInteger();
        AtomicReference<LanDiscoveryPacket> last = new AtomicReference<>();
        AtomicReference<String> lastDestination = new AtomicReference<>();

        LanHostAnnouncer announcer = new LanHostAnnouncer("Test Host", "stable-host", 8997,
                () -> java.util.Arrays.asList(first, second), (payload, destination) -> {
                    LanDiscoveryPacket packet = LanDiscoveryPacket.decode(payload, 0, payload.length);
                    Assert.assertNotNull(packet);
                    last.set(packet);
                    lastDestination.set(destination.toString());
                    count.incrementAndGet();
                    sent.countDown();
                }, 25L);
        try {
            announcer.start();
            Assert.assertTrue("announcer did not repeat to both interfaces", sent.await(3, TimeUnit.SECONDS));
            Assert.assertTrue(count.get() >= 4);
            Assert.assertEquals("stable-host", last.get().hostId);
            Assert.assertEquals(8997, last.get().tcpPort);
            Assert.assertTrue(lastDestination.get().startsWith("wlan0:")
                    || lastDestination.get().startsWith("eth0:"));
        } finally {
            announcer.close();
        }
    }

    @Test
    public void oneUnavailableInterfaceDoesNotStopOtherInterfaces() throws Exception {
        LanNetworkInterfaces.BroadcastAddress failing = address("bad0", "192.168.2.2", "192.168.2.255");
        LanNetworkInterfaces.BroadcastAddress working = address("wlan0", "192.168.1.2", "192.168.1.255");
        CountDownLatch sent = new CountDownLatch(1);
        LanHostAnnouncer announcer = new LanHostAnnouncer("Host", "host-02", 8990,
                () -> java.util.Arrays.asList(failing, working), (payload, destination) -> {
                    if (destination == failing) throw new SocketException("interface vanished");
                    sent.countDown();
                }, 20L);
        try {
            announcer.start();
            Assert.assertTrue("working interface was starved by another interface failure",
                    sent.await(2, TimeUnit.SECONDS));
        } finally {
            announcer.close();
        }
    }

    @Test
    public void unavailableInterfaceEnumerationDoesNotKillAnnouncerWorker() throws Exception {
        CountDownLatch retried = new CountDownLatch(1);
        AtomicInteger attempts = new AtomicInteger();
        LanHostAnnouncer announcer = new LanHostAnnouncer("Host", "host-security", 8990,
                () -> {
                    if (attempts.incrementAndGet() == 1) throw new SecurityException("interface access denied");
                    retried.countDown();
                    return Collections.emptyList();
                }, (payload, destination) -> { }, 20L);
        try {
            announcer.start();
            Assert.assertTrue("announcer should retry interface enumeration after a transient denial",
                    retried.await(2, TimeUnit.SECONDS));
            Assert.assertTrue(announcer.isRunning());
        } finally {
            announcer.close();
        }
    }
    @Test
    public void closeStopsFutureAnnouncements() throws Exception {
        CountDownLatch firstSend = new CountDownLatch(1);
        AtomicInteger count = new AtomicInteger();
        LanNetworkInterfaces.BroadcastAddress destination = address("wlan0", "192.168.1.2", "192.168.1.255");
        LanHostAnnouncer active = new LanHostAnnouncer("Host", "host-03", 8990,
                () -> Collections.singletonList(destination),
                (payload, target) -> {
                    count.incrementAndGet();
                    firstSend.countDown();
                }, 20L);
        try {
            active.start();
            Assert.assertTrue(firstSend.await(2, TimeUnit.SECONDS));
            active.close();
            int stoppedAt = count.get();
            Thread.sleep(100L);
            Assert.assertEquals(stoppedAt, count.get());
            Assert.assertFalse(active.isRunning());
        } finally {
            active.close();
        }
    }

    private static LanNetworkInterfaces.BroadcastAddress address(String name, String local, String broadcast)
            throws Exception {
        return LanNetworkInterfaces.BroadcastAddress.create(name, InetAddress.getByName(local),
                InetAddress.getByName(broadcast));
    }
}