package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;
import java.net.SocketException;
import java.util.Collections;
import java.util.List;

/** Repeatedly advertises a bound TCP host to each usable IPv4 broadcast network. */
final class LanHostAnnouncer implements AutoCloseable {
    static final long DEFAULT_INTERVAL_MS = 1000L;

    interface DatagramSender {
        void send(byte[] payload, LanNetworkInterfaces.BroadcastAddress destination) throws IOException;
    }

    private final byte[] payload;
    private final LanNetworkInterfaces.Provider addressProvider;
    private final DatagramSender datagramSender;
    private final long intervalMs;
    private volatile boolean running;
    private volatile boolean closed;
    private Thread worker;

    LanHostAnnouncer(String hostName, String hostId, int tcpPort) throws IOException {
        this(hostName, hostId, tcpPort, LanNetworkInterfaces::getBroadcastAddresses,
                LanHostAnnouncer::sendBroadcast, DEFAULT_INTERVAL_MS);
    }

    LanHostAnnouncer(String hostName, String hostId, int tcpPort,
                     LanNetworkInterfaces.Provider addressProvider,
                     DatagramSender datagramSender, long intervalMs) throws IOException {
        if (addressProvider == null || datagramSender == null || intervalMs < 10L) {
            throw new IllegalArgumentException("LAN_ANNOUNCER_CONFIGURATION_INVALID");
        }
        this.payload = LanDiscoveryPacket.encode(hostName, hostId, tcpPort);
        this.addressProvider = addressProvider;
        this.datagramSender = datagramSender;
        this.intervalMs = intervalMs;
    }

    synchronized void start() {
        if (closed) throw new IllegalStateException("LAN_ANNOUNCER_CLOSED");
        if (running) return;
        running = true;
        worker = new Thread(this::runLoop, "SPD-LAN-Announcer");
        worker.setDaemon(true);
        try {
            worker.start();
        } catch (RuntimeException startFailure) {
            running = false;
            worker = null;
            throw startFailure;
        }
    }

    boolean isRunning() {
        return running;
    }

    private void runLoop() {
        try {
            while (running) {
                announceOnce();
                if (!running) break;
                try {
                    Thread.sleep(intervalMs);
                } catch (InterruptedException interrupted) {
                    if (!running) break;
                }
            }
        } finally {
            running = false;
        }
    }

    private void announceOnce() {
        final List<LanNetworkInterfaces.BroadcastAddress> destinations;
        try {
            List<LanNetworkInterfaces.BroadcastAddress> available = addressProvider.getBroadcastAddresses();
            destinations = available == null ? Collections.emptyList() : available;
        } catch (SocketException | SecurityException unavailable) {
            return;
        }

        for (LanNetworkInterfaces.BroadcastAddress destination : destinations) {
            if (!running) return;
            try {
                datagramSender.send(payload, destination);
            } catch (IOException | RuntimeException unavailableInterface) {
                // One disappearing/blocked interface must not stop announcements on other networks.
            }
        }
    }

    private static void sendBroadcast(byte[] payload,
                                      LanNetworkInterfaces.BroadcastAddress destination) throws IOException {
        try (DatagramSocket socket = new DatagramSocket(null)) {
            socket.setBroadcast(true);
            socket.bind(new InetSocketAddress(destination.localAddress, 0));
            DatagramPacket packet = new DatagramPacket(payload, payload.length,
                    destination.broadcastAddress, LANTransport.DEFAULT_UDP_PORT);
            socket.send(packet);
        }
    }

    @Override
    public void close() {
        final Thread current;
        synchronized (this) {
            if (closed) return;
            closed = true;
            running = false;
            current = worker;
            if (current != null) current.interrupt();
        }
        if (current != null && current != Thread.currentThread()) {
            try {
                current.join(1000L);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }
}