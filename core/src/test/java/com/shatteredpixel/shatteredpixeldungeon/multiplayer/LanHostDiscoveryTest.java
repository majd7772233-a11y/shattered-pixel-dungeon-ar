package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.Charset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public class LanHostDiscoveryTest {

    @Test
    public void ignoresMalformedDatagramsAndDeduplicatesValidHosts() throws Exception {
        DatagramSocket receiver = new DatagramSocket(null);
        receiver.setReuseAddress(true);
        receiver.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
        CountDownLatch found = new CountDownLatch(2);
        AtomicInteger count = new AtomicInteger();
        AtomicReference<String> lastAddress = new AtomicReference<>();
        LanHostDiscovery discovery = LanHostDiscovery.startWithSocket(receiver, (name, ip, port) -> {
            count.incrementAndGet();
            lastAddress.set(ip);
            found.countDown();
        }, 1000L);

        try (DatagramSocket sender = new DatagramSocket()) {
            send(sender, receiver, "not-json".getBytes(Charset.forName("UTF-8")));
            byte[] first = LanDiscoveryPacket.encode("Host A", "host-a", 8990);
            byte[] second = LanDiscoveryPacket.encode("Host B", "host-b", 8998);
            send(sender, receiver, first);
            send(sender, receiver, first); // Duplicate announcement must not duplicate the callback.
            send(sender, receiver, second);

            Assert.assertTrue("valid announcements were not delivered", found.await(2, TimeUnit.SECONDS));
            Assert.assertEquals(2, count.get());
            Assert.assertEquals("127.0.0.1", lastAddress.get());
        } finally {
            discovery.cancel();
        }
    }

    @Test
    public void searchEndsAfterItsBoundedWindow() throws Exception {
        DatagramSocket receiver = new DatagramSocket(null);
        receiver.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
        LanHostDiscovery discovery = LanHostDiscovery.startWithSocket(receiver, null, 120L);
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (discovery.isRunning() && System.nanoTime() < deadline) Thread.sleep(10L);
        Assert.assertFalse("discovery exceeded its bounded search window", discovery.isRunning());
        Assert.assertTrue(receiver.isClosed());
    }

    @Test
    public void notifiesWhenBoundedSearchFinishesWithoutHosts() throws Exception {
        DatagramSocket receiver = new DatagramSocket(null);
        receiver.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
        CountDownLatch finished = new CountDownLatch(1);
        AtomicInteger discovered = new AtomicInteger(-1);
        AtomicReference<Boolean> wasCancelled = new AtomicReference<>();
        LanHostDiscovery discovery = LanHostDiscovery.startWithSocket(receiver,
                new LANTransport.LANDiscoveryCallback() {
                    @Override
                    public void onHostDiscovered(String name, String ip, int port) {
                        Assert.fail("empty search must not report a host");
                    }

                    @Override
                    public void onDiscoveryFinished(boolean cancelled, int count) {
                        wasCancelled.set(cancelled);
                        discovered.set(count);
                        finished.countDown();
                    }
                }, 120L);

        Assert.assertTrue("discovery completion callback was not delivered",
                finished.await(2, TimeUnit.SECONDS));
        Assert.assertFalse(wasCancelled.get());
        Assert.assertEquals(0, discovered.get());
        Assert.assertFalse(discovery.isRunning());
        Assert.assertTrue(receiver.isClosed());
    }
    @Test
    public void cancelledSearchReportsCancellationNotEmptyResults() throws Exception {
        DatagramSocket receiver = new DatagramSocket(null);
        receiver.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
        CountDownLatch finished = new CountDownLatch(1);
        AtomicReference<Boolean> wasCancelled = new AtomicReference<>();
        AtomicInteger discovered = new AtomicInteger(-1);
        LanHostDiscovery discovery = LanHostDiscovery.startWithSocket(receiver,
                new LANTransport.LANDiscoveryCallback() {
                    @Override
                    public void onHostDiscovered(String name, String ip, int port) {
                        Assert.fail("cancelled empty search must not report a host");
                    }

                    @Override
                    public void onDiscoveryFinished(boolean cancelled, int count) {
                        wasCancelled.set(cancelled);
                        discovered.set(count);
                        finished.countDown();
                    }
                }, 5000L);

        discovery.cancel();
        Assert.assertTrue("cancellation completion callback was not delivered",
                finished.await(1, TimeUnit.SECONDS));
        Assert.assertTrue(wasCancelled.get());
        Assert.assertEquals(0, discovered.get());
        Assert.assertFalse(discovery.isRunning());
        Assert.assertTrue(receiver.isClosed());
    }
    @Test
    public void cancelClosesTheBlockedReceiverImmediately() throws Exception {
        DatagramSocket receiver = new DatagramSocket(null);
        receiver.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
        LanHostDiscovery discovery = LanHostDiscovery.startWithSocket(receiver, null, 5000L);
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
        while (!discovery.isRunning() && System.nanoTime() < deadline) Thread.sleep(5L);
        long started = System.nanoTime();
        discovery.cancel();
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        Assert.assertFalse(discovery.isRunning());
        Assert.assertTrue(receiver.isClosed());
        Assert.assertTrue("cancel should not wait for the full search window", elapsedMs < 1000L);
    }

    private static void send(DatagramSocket sender, DatagramSocket receiver, byte[] data) throws Exception {
        sender.send(new DatagramPacket(data, data.length,
                InetAddress.getByName("127.0.0.1"), receiver.getLocalPort()));
    }
}