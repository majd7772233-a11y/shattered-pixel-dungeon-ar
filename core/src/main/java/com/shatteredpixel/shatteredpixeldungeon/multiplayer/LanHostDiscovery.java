package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetSocketAddress;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** One bounded, cancellable UDP search session. Callbacks run on its worker thread. */
final class LanHostDiscovery implements LANTransport.LANDiscoverySession {
    static final long DEFAULT_SEARCH_WINDOW_MS = 5000L;
    static final int RECEIVE_POLL_TIMEOUT_MS = 250;
    static final int MAX_DISCOVERED_HOSTS = 32;

    private final DatagramSocket socket;
    private final LANTransport.LANDiscoveryCallback callback;
    private final long durationMs;
    private volatile boolean running;
    private volatile boolean cancelled;
    private Thread worker;

    private LanHostDiscovery(DatagramSocket socket, LANTransport.LANDiscoveryCallback callback,
                             long durationMs) {
        this.socket = socket;
        this.callback = callback;
        this.durationMs = durationMs;
    }

    static LanHostDiscovery start(LANTransport.LANDiscoveryCallback callback,
                                  int port, long durationMs) throws SocketException {
        if (port < 1 || port > 65535 || durationMs < 1L) {
            throw new IllegalArgumentException("LAN_DISCOVERY_CONFIGURATION_INVALID");
        }
        DatagramSocket receiver = new DatagramSocket(null);
        try {
            receiver.setReuseAddress(true);
            receiver.bind(new InetSocketAddress(port));
            receiver.setSoTimeout(RECEIVE_POLL_TIMEOUT_MS);
            return startWithSocket(receiver, callback, durationMs);
        } catch (Exception startupFailure) {
            receiver.close();
            if (startupFailure instanceof SocketException) throw (SocketException) startupFailure;
            SocketException failure = new SocketException("LAN_DISCOVERY_START_FAILED");
            failure.initCause(startupFailure);
            throw failure;
        }
    }

    /** Package-private seam for localhost datagram tests; production binds the shared UDP port above. */
    static LanHostDiscovery startWithSocket(DatagramSocket socket,
                                            LANTransport.LANDiscoveryCallback callback,
                                            long durationMs) {
        if (socket == null || durationMs < 1L || socket.isClosed() || !socket.isBound()) {
            throw new IllegalArgumentException("LAN_DISCOVERY_CONFIGURATION_INVALID");
        }
        try {
            socket.setSoTimeout(RECEIVE_POLL_TIMEOUT_MS);
        } catch (SocketException unavailable) {
            socket.close();
            throw new IllegalArgumentException("LAN_DISCOVERY_SOCKET_UNAVAILABLE", unavailable);
        }
        LanHostDiscovery discovery = new LanHostDiscovery(socket, callback, durationMs);
        discovery.startWorker();
        return discovery;
    }

    private synchronized void startWorker() {
        running = true;
        worker = new Thread(this::receiveLoop, "SPD-LAN-Discovery");
        worker.setDaemon(true);
        try {
            worker.start();
        } catch (RuntimeException startFailure) {
            running = false;
            socket.close();
            throw startFailure;
        }
    }

    private void receiveLoop() {
        final long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(durationMs);
        final byte[] buffer = new byte[LanDiscoveryPacket.MAX_PACKET_BYTES + 1];
        final Set<String> discovered = new HashSet<>();
        try {
            while (running && System.nanoTime() < deadline && discovered.size() < MAX_DISCOVERED_HOSTS) {
                long remainingNanos = deadline - System.nanoTime();
                if (remainingNanos <= 0L) break;
                int pollTimeout = (int) Math.max(1L, Math.min(RECEIVE_POLL_TIMEOUT_MS,
                        TimeUnit.NANOSECONDS.toMillis(remainingNanos)));
                try {
                    socket.setSoTimeout(pollTimeout);
                    DatagramPacket datagram = new DatagramPacket(buffer, buffer.length);
                    socket.receive(datagram);
                    if (datagram.getLength() < 1 || datagram.getLength() > LanDiscoveryPacket.MAX_PACKET_BYTES
                            || !(datagram.getAddress() instanceof Inet4Address)) continue;

                    LanDiscoveryPacket host = LanDiscoveryPacket.decode(
                            datagram.getData(), datagram.getOffset(), datagram.getLength());
                    if (host == null) continue;

                    String address = datagram.getAddress().getHostAddress();
                    String key = host.hostId + "|" + address + "|" + host.tcpPort;
                    if (!discovered.add(key)) continue;
                    if (callback != null) {
                        try {
                            callback.onHostDiscovered(host.hostName, address, host.tcpPort);
                        } catch (RuntimeException callbackFailure) {
                            // A faulty consumer must not terminate the bounded socket receive loop.
                        }
                    }
                } catch (SocketTimeoutException timeout) {
                    // A poll timeout is not the end of the total bounded search window.
                } catch (SocketException closedSocket) {
                    // Socket closure is also the cancellation signal; no socket error should escape the worker.
                    break;
                } catch (IOException malformedDatagram) {
                    // Ignore a malformed/short datagram and keep listening for valid hosts.
                }
            }
        } finally {
            running = false;
            socket.close();
            if (callback != null) {
                try {
                    callback.onDiscoveryFinished(cancelled, discovered.size());
                } catch (RuntimeException callbackFailure) {
                    // Completion notification is best-effort and must not escape the worker.
                }
            }
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public void cancel() {
        final Thread current;
        synchronized (this) {
            if (cancelled) return;
            cancelled = true;
            running = false;
            current = worker;
            socket.close();
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