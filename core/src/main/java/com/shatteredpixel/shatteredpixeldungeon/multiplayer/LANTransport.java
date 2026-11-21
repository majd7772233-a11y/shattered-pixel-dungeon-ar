package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/** LAN TCP session transport with lifecycle-bound IPv4 UDP host discovery and advertisement. */
public class LANTransport implements NetworkTransport {
    public static final int DEFAULT_TCP_PORT = 8990;
    public static final int DEFAULT_UDP_PORT = 8991;
    public static final int DEFAULT_CONNECT_TIMEOUT_MS = 5000;
    public static final int DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;
    public static final int MAX_PLAYERS = 4;
    private static final int MAX_PENDING_HANDSHAKE_MESSAGES = 64;
    public static final String LOCAL_HOST_ENDPOINT = "LAN_HOST";

    private final Object stateLock = new Object();
    private final ConcurrentMap<String, ClientHandler> connectedClients = new ConcurrentHashMap<>();
    private final ConcurrentMap<Socket, Boolean> pendingPeers = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Socket> pendingPlayerIds = new ConcurrentHashMap<>();
    private volatile ServerSocket serverSocket;
    private volatile Socket clientSocket;
    private volatile OutputStream clientOutput;
    private volatile boolean isServer;
    private volatile boolean isConnected;
    private volatile TransportCallback callback;
    private volatile String localPlayerId;
    private volatile String remoteHostId;
    private volatile LanHostAnnouncer hostAnnouncer;
    private volatile String hostDisplayName = "HostDevice";
    private long lifecycleGeneration;

    public interface LANDiscoveryCallback {
        void onHostDiscovered(String hostName, String hostIp, int port);
        default void onDiscoveryFinished(boolean cancelled, int discoveredHostCount) { }
    }

    public interface LANDiscoverySession {
        void cancel();
        boolean isRunning();
    }

    /** Compatibility overload; creates a stable local host identity when the caller has none. */
    public void startServer(int tcpPort, String hostName, TransportCallback callback) throws Exception {
        startServer(tcpPort, hostName, UUID.randomUUID().toString(), callback);
    }

    /** Binds synchronously and starts the UDP announcer only after the TCP listener is ready. */
    public void startServer(int tcpPort, String hostName, String hostPlayerId,
                            TransportCallback callback) throws Exception {
        if (tcpPort < 0 || tcpPort > 65535) throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
        final String effectiveHostId = hostPlayerId == null ? UUID.randomUUID().toString() : hostPlayerId;
        if (!isValidPlayerId(effectiveHostId)) throw new IllegalArgumentException("LAN_PLAYER_ID_INVALID");

        final long generation;
        synchronized (stateLock) {
            if (isServer || clientSocket != null || isConnected) {
                throw new IllegalStateException("LAN_ALREADY_STARTED");
            }
            generation = ++lifecycleGeneration;
            this.callback = callback;
            this.localPlayerId = effectiveHostId;
            this.hostDisplayName = hostName == null ? "HostDevice" : hostName.trim();
            this.remoteHostId = null;
        }

        ServerSocket listener = new ServerSocket();
        try {
            listener.setReuseAddress(false);
            listener.bind(new InetSocketAddress(tcpPort), MAX_PLAYERS - 1);
        } catch (Exception bindFailure) {
            closeQuietly(listener);
            throw new IOException("LAN_SERVER_BIND_FAILED", bindFailure);
        }

        synchronized (stateLock) {
            if (generation != lifecycleGeneration) {
                closeQuietly(listener);
                throw new IOException("LAN_START_CANCELLED");
            }
            serverSocket = listener;
            isServer = true;
            isConnected = true;
            Thread acceptThread = new Thread(() -> acceptLoop(generation), "SPD-LAN-Accept");
            acceptThread.setDaemon(true);
            try {
                acceptThread.start();
            } catch (RuntimeException startFailure) {
                serverSocket = null;
                isServer = false;
                isConnected = false;
                closeQuietly(listener);
                throw new IOException("LAN_ACCEPT_START_FAILED", startFailure);
            }

            try {
                hostAnnouncer = new LanHostAnnouncer(this.hostDisplayName, effectiveHostId,
                        listener.getLocalPort());
                hostAnnouncer.start();
            } catch (Exception announcementUnavailable) {
                if (hostAnnouncer != null) hostAnnouncer.close();
                hostAnnouncer = null; // TCP remains usable through manual IP entry.
            }
        }
    }
    public void setLocalPlayerId(String playerId) {
        if (!isValidPlayerId(playerId)) throw new IllegalArgumentException("LAN_PLAYER_ID_INVALID");
        LanHostAnnouncer previous = null;
        synchronized (stateLock) {
            if (!connectedClients.isEmpty() && !playerId.equals(localPlayerId)) {
                throw new IllegalStateException("LAN_HOST_ID_ALREADY_IN_USE");
            }
            boolean changed = !playerId.equals(localPlayerId);
            localPlayerId = playerId;
            if (changed && isServer && serverSocket != null && !serverSocket.isClosed()) {
                previous = hostAnnouncer;
                try {
                    hostAnnouncer = new LanHostAnnouncer(hostDisplayName, playerId, serverSocket.getLocalPort());
                    hostAnnouncer.start();
                } catch (Exception announcementUnavailable) {
                    hostAnnouncer = null;
                }
            }
        }
        if (previous != null) previous.close();
    }

    public boolean isHosting() {
        return isServer && serverSocket != null && serverSocket.isBound() && !serverSocket.isClosed();
    }

    int getPendingPeerCountForTests() {
        return pendingPeers.size();
    }

    boolean isHostAnnouncerRunningForTests() {
        LanHostAnnouncer announcer = hostAnnouncer;
        return announcer != null && announcer.isRunning();
    }

    public int getLocalPort() {
        ServerSocket listener = serverSocket;
        return listener == null || listener.isClosed() ? -1 : listener.getLocalPort();
    }

    /** Returns a stable snapshot of peer identities that completed the LAN handshake. */
    public Set<String> getConnectedPlayerIds() {
        return Collections.unmodifiableSet(new LinkedHashSet<>(connectedClients.keySet()));
    }

    public String getRemoteHostId() {
        return remoteHostId;
    }

    @Override
    public void connect(String endpoint, TransportCallback callback) throws Exception {
        if (endpoint != null && LOCAL_HOST_ENDPOINT.equalsIgnoreCase(endpoint.trim())) {
            synchronized (stateLock) {
                if (!isHosting() || !isConnected) throw new IllegalStateException("LAN_HOST_NOT_READY");
                this.callback = callback;
            }
            if (callback != null) callback.onConnected();
            return;
        }

        final LanEndpoint target = LanEndpoint.parse(endpoint, DEFAULT_TCP_PORT);
        final long generation;
        final Socket socket = new Socket();
        final String playerId;
        synchronized (stateLock) {
            if (isConnected || clientSocket != null || isServer) {
                throw new IllegalStateException("LAN_ALREADY_STARTED");
            }
            if (!isValidPlayerId(localPlayerId)) throw new IllegalStateException("LAN_PLAYER_ID_REQUIRED");
            generation = ++lifecycleGeneration;
            playerId = localPlayerId;
            this.callback = callback;
            clientSocket = socket; // Publish the pending socket so disconnect() can cancel connect().
            isConnected = false;
        }

        Thread clientThread = new Thread(() -> connectAndListen(generation, socket, target, playerId),
                "SPD-LAN-Client");
        clientThread.setDaemon(true);
        try {
            clientThread.start();
        } catch (RuntimeException startFailure) {
            synchronized (stateLock) {
                if (generation == lifecycleGeneration && clientSocket == socket) clientSocket = null;
            }
            closeQuietly(socket);
            throw new IOException("LAN_CLIENT_START_FAILED", startFailure);
        }
    }

    private void connectAndListen(long generation, Socket socket, LanEndpoint target, String playerId) {
        boolean sessionEstablished = false;
        try {
            socket.connect(new InetSocketAddress(target.host, target.port), DEFAULT_CONNECT_TIMEOUT_MS);
            socket.setTcpNoDelay(true);
            socket.setSoTimeout(DEFAULT_HANDSHAKE_TIMEOUT_MS);
            InputStream input = new BufferedInputStream(socket.getInputStream());
            OutputStream output = new BufferedOutputStream(socket.getOutputStream());

            NetworkMessage hello = new NetworkMessage(MessageType.HELLO, "{}");
            hello.senderId = playerId;
            synchronized (output) {
                LanFrameCodec.writeFrame(output, hello.toJson());
            }

            String responseFrame = LanFrameCodec.readFrame(input);
            if (responseFrame == null) throw new IOException("LAN_SESSION_REJECTED");
            NetworkMessage session = NetworkMessage.parseLanJson(responseFrame);
            if (session.messageType != MessageType.SESSION || !isValidPlayerId(session.senderId)
                    || !sessionMatchesPlayer(session.payloadJson, playerId)) {
                throw new IOException("LAN_SESSION_REJECTED");
            }
            if (!isCurrentGeneration(generation)) return;

            synchronized (stateLock) {
                if (generation != lifecycleGeneration || clientSocket != socket) return;
                clientOutput = output;
                remoteHostId = session.senderId;
                isConnected = true;
            }
            socket.setSoTimeout(0);
            sessionEstablished = true;

            TransportCallback current = callback;
            if (current != null) {
                current.onConnected();
                current.onMessageReceived(session);
            }

            while (isCurrentGeneration(generation) && isConnected) {
                String frame = LanFrameCodec.readFrame(input);
                if (frame == null) break;
                NetworkMessage message = NetworkMessage.parseLanJson(frame);
                if (message.messageType == MessageType.ERROR) {
                    throw new IOException("LAN_REMOTE_REJECTED_MESSAGE");
                }
                if (message.messageType == null || !isValidServerMessage(message.messageType)
                        || message.senderId != null && !isValidPlayerId(message.senderId)) {
                    throw new IOException("LAN_INVALID_SERVER_MESSAGE");
                }
                TransportCallback currentCallback = callback;
                if (currentCallback != null) currentCallback.onMessageReceived(message);
            }
            finishClientConnection(generation, socket, "LAN_CONNECTION_CLOSED", true);
        } catch (Exception failure) {
            if (isCurrentGeneration(generation)) {
                TransportCallback current = callback;
                if (current != null) current.onError(failure);
                finishClientConnection(generation, socket,
                        sessionEstablished ? "LAN_CONNECTION_FAILED" : "LAN_CONNECT_FAILED", false);
            } else {
                closeQuietly(socket);
            }
        }
    }

    private void acceptLoop(long generation) {
        while (isCurrentHost(generation)) {
            try {
                Socket socket = serverSocket.accept();
                socket.setTcpNoDelay(true);
                if (!trackPendingPeer(socket, generation)) {
                    if (isCurrentHost(generation)) {
                        rejectPeer(new BufferedOutputStream(socket.getOutputStream()), "LAN_ROOM_FULL");
                    }
                    closeQuietly(socket);
                    continue;
                }
                Thread handler = new Thread(new ClientHandler(generation, socket), "SPD-LAN-Peer");
                handler.setDaemon(true);
                try {
                    handler.start();
                } catch (RuntimeException startFailure) {
                    synchronized (stateLock) {
                        pendingPeers.remove(socket);
                    }
                    closeQuietly(socket);
                    notifyHostError(startFailure);
                }
            } catch (SocketException closed) {
                if (isCurrentHost(generation)) notifyHostError(closed);
                return;
            } catch (Exception failure) {
                if (isCurrentHost(generation)) notifyHostError(failure);
                return;
            }
        }
    }

    /** Reserves one of the three guest slots before creating a handshake worker. */
    private boolean trackPendingPeer(Socket socket, long generation) {
        synchronized (stateLock) {
            if (!isServer || !isConnected || generation != lifecycleGeneration
                    || serverSocket == null || serverSocket.isClosed()
                    || connectedClients.size() + pendingPeers.size() >= MAX_PLAYERS - 1) {
                return false;
            }
            pendingPeers.put(socket, Boolean.TRUE);
            return true;
        }
    }

    private final class ClientHandler implements Runnable {
        private final long generation;
        private final Socket socket;
        private String playerId;
        private OutputStream output;
        private boolean registered;
        private boolean sessionWritten;
        private final List<String> pendingSessionMessages = new ArrayList<>();

        ClientHandler(long generation, Socket socket) {
            this.generation = generation;
            this.socket = socket;
        }

        @Override
        public void run() {
            try {
                if (!isCurrentHost(generation)) return;
                socket.setSoTimeout(DEFAULT_HANDSHAKE_TIMEOUT_MS);
                InputStream input = new BufferedInputStream(socket.getInputStream());
                output = new BufferedOutputStream(socket.getOutputStream());
                String firstFrame = LanFrameCodec.readFrame(input);
                NetworkMessage hello = firstFrame == null ? null : NetworkMessage.parseLanJson(firstFrame);
                if (hello == null || hello.messageType != MessageType.HELLO
                        || !isValidPlayerId(hello.senderId) || hello.senderId.equals(localPlayerId)) {
                    rejectPeer(output, "LAN_IDENTITY_REJECTED");
                    return;
                }

                playerId = hello.senderId;
                if (!reservePlayerIdentity(this)) {
                    rejectPeer(output, connectedClients.containsKey(playerId)
                            || pendingPlayerIds.containsKey(playerId)
                            ? "LAN_DUPLICATE_PLAYER" : "LAN_ROOM_FULL");
                    return;
                }

                // Register before SESSION, but queue broadcasts until SESSION is flushed so a peer
                // cannot observe the handshake and then miss an immediate departure event.
                if (!completePeerRegistration(this)) return;
                registered = true;
                sendSession(buildSessionMessage(playerId).toJson());
                socket.setSoTimeout(0);

                while (isCurrentHost(generation) && !socket.isClosed()) {
                    String frame = LanFrameCodec.readFrame(input);
                    if (frame == null) break;
                    NetworkMessage message = NetworkMessage.parseLanJson(frame);
                    if (message.messageType == null || message.messageType == MessageType.ERROR
                            || !playerId.equals(message.senderId) || !isAllowedClientMessage(message.messageType)) {
                        rejectPeer(output, "LAN_MESSAGE_REJECTED");
                        break;
                    }
                    if (message.messageType == MessageType.LEAVE) break;
                    TransportCallback current = callback;
                    if (current != null) current.onMessageReceived(message);
                }
            } catch (Exception ignored) {
                // An invalid or disconnected peer is isolated; it must not tear down the host listener.
            } finally {
                synchronized (stateLock) {
                    pendingPeers.remove(socket);
                    if (playerId != null) pendingPlayerIds.remove(playerId, socket);
                    if (registered) connectedClients.remove(playerId, this);
                }
                if (registered && sessionWritten) notifyPeerLeft(playerId, generation);
                closeQuietly(socket);
            }
        }

        synchronized void sendSession(String frame) throws IOException {
            writeFrame(frame);
            sessionWritten = true;
            while (!pendingSessionMessages.isEmpty()) {
                writeFrame(pendingSessionMessages.remove(0));
            }
        }

        synchronized void send(String frame) throws IOException {
            if (!sessionWritten) {
                if (pendingSessionMessages.size() >= MAX_PENDING_HANDSHAKE_MESSAGES) {
                    throw new IOException("LAN_HANDSHAKE_BACKLOG");
                }
                pendingSessionMessages.add(frame);
                return;
            }
            writeFrame(frame);
        }

        private void writeFrame(String frame) throws IOException {
            OutputStream target = output;
            if (target == null || socket.isClosed()) throw new IOException("LAN_PEER_NOT_READY");
            synchronized (target) {
                LanFrameCodec.writeFrame(target, frame);
            }
        }

        void close() {
            closeQuietly(socket);
        }
    }

    /** Reserves the claimed identity while the SESSION response is being written. */
    private boolean reservePlayerIdentity(ClientHandler peer) {
        synchronized (stateLock) {
            if (!isServer || !isConnected || peer.generation != lifecycleGeneration
                    || !pendingPeers.containsKey(peer.socket) || peer.playerId.equals(localPlayerId)
                    || connectedClients.containsKey(peer.playerId) || pendingPlayerIds.containsKey(peer.playerId)) {
                return false;
            }
            pendingPlayerIds.put(peer.playerId, peer.socket);
            return true;
        }
    }

    /** Publishes a peer only after its SESSION handshake has been flushed to the socket. */
    private boolean completePeerRegistration(ClientHandler peer) {
        synchronized (stateLock) {
            if (!isServer || !isConnected || peer.generation != lifecycleGeneration
                    || !pendingPeers.containsKey(peer.socket)
                    || pendingPlayerIds.get(peer.playerId) != peer.socket) {
                return false;
            }
            pendingPeers.remove(peer.socket);
            pendingPlayerIds.remove(peer.playerId, peer.socket);
            return connectedClients.putIfAbsent(peer.playerId, peer) == null;
        }
    }

    private void notifyPeerLeft(String playerId, long generation) {
        if (playerId == null || !isCurrentHost(generation)) return;
        NetworkMessage left = new NetworkMessage(MessageType.PLAYER_LEFT,
                "{\"playerId\":" + new Json().toJson(playerId) + "}");
        left.senderId = playerId;
        String frame = left.toJson();
        for (ClientHandler peer : new ArrayList<>(connectedClients.values())) {
            try {
                peer.send(frame);
            } catch (IOException failedPeer) {
                peer.close();
            }
        }
        TransportCallback current = callback;
        if (current != null) current.onMessageReceived(left);
    }

    private NetworkMessage buildSessionMessage(String playerId) {
        String hostId = localPlayerId;
        if (!isValidPlayerId(hostId)) throw new IllegalStateException("LAN_HOST_ID_REQUIRED");
        Json json = new Json();
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":" + json.toJson(playerId) + "}");
        session.senderId = hostId;
        return session;
    }

    private static boolean sessionMatchesPlayer(String payloadJson, String playerId) {
        try {
            JsonValue payload = new JsonReader().parse(payloadJson);
            JsonValue id = payload == null ? null : payload.get("playerId");
            return payload != null && payload.isObject() && id != null && id.isString()
                    && playerId.equals(id.asString());
        } catch (RuntimeException malformed) {
            return false;
        }
    }

    /** Parses the legacy action shape for protocol-parity tests; it does not execute gameplay. */
    public static Optional<NetworkActionType> parseActionType(String json) {
        if (json == null || json.trim().isEmpty()) return Optional.empty();
        try {
            JsonValue root = new JsonReader().parse(json);
            if (root == null || !root.isObject()) return Optional.empty();
            JsonValue action = root.get("action");
            JsonValue data = root.get("data");
            if ((action == null || !action.isString()) && data != null && data.isObject()) {
                action = data.get("action");
            }
            if (action == null || !action.isString()) return Optional.empty();
            return Optional.of(NetworkActionType.valueOf(action.asString()));
        } catch (RuntimeException invalidAction) {
            return Optional.empty();
        }
    }

    private static boolean isValidPlayerId(String value) {
        return value != null && value.matches("[A-Za-z0-9._~-]{1,80}");
    }

    private static boolean isAllowedClientMessage(MessageType type) {
        return type == MessageType.ACTION || type == MessageType.LEVEL_DATA
                || type == MessageType.LEVEL_READY || type == MessageType.RESYNC
                || type == MessageType.RECONNECT || type == MessageType.READY
                || type == MessageType.PING || type == MessageType.CHAT
                || type == MessageType.COMBAT_REQUEST || type == MessageType.LEAVE;
    }

    private static boolean isValidServerMessage(MessageType type) {
        switch (type) {
            case ROOM_STATE:
            case PLAYER_JOINED:
            case PLAYER_LEFT:
            case READY:
            case MATCH_START:
            case LEVEL_PUBLISHER_CHANGED:
            case ACTION_ACCEPTED:
            case EVENT_BATCH:
            case SNAPSHOT:
            case ACK:
            case MATCH_END:
            case PING:
            case CHAT:
                return true;
            default:
                return false;
        }
    }

    private static void rejectPeer(OutputStream output, String code) {
        try {
            NetworkMessage error = new NetworkMessage(MessageType.ERROR,
                    "{\"error\":" + new Json().toJson(code) + "}");
            synchronized (output) {
                LanFrameCodec.writeFrame(output, error.toJson());
            }
        } catch (Exception ignored) {
        }
    }

    private void notifyHostError(Throwable failure) {
        TransportCallback current = callback;
        if (current != null) current.onError(failure);
    }

    private boolean isCurrentGeneration(long generation) {
        synchronized (stateLock) {
            return generation == lifecycleGeneration;
        }
    }

    private boolean isCurrentHost(long generation) {
        synchronized (stateLock) {
            return isServer && isConnected && generation == lifecycleGeneration
                    && serverSocket != null && !serverSocket.isClosed();
        }
    }

    private void finishClientConnection(long generation, Socket socket, String reason, boolean notify) {
        TransportCallback current = null;
        synchronized (stateLock) {
            if (generation != lifecycleGeneration || clientSocket != socket) {
                closeQuietly(socket);
                return;
            }
            isConnected = false;
            clientSocket = null;
            clientOutput = null;
            if (notify) current = callback;
        }
        closeQuietly(socket);
        if (current != null) current.onDisconnected(reason);
    }

    @Override
    public void send(NetworkMessage message) {
        if (message == null) return;
        final String frame;
        try {
            frame = message.toJson();
        } catch (RuntimeException invalidMessage) {
            TransportCallback current = callback;
            if (current != null) current.onError(invalidMessage);
            return;
        }

        if (isServer) {
            for (ClientHandler peer : new ArrayList<>(connectedClients.values())) {
                try {
                    peer.send(frame);
                } catch (IOException failedPeer) {
                    peer.close();
                }
            }
            return;
        }

        OutputStream output = clientOutput;
        if (!isConnected || output == null) {
            TransportCallback current = callback;
            if (current != null) current.onError(new IOException("LAN_NOT_CONNECTED"));
            return;
        }
        try {
            synchronized (output) {
                LanFrameCodec.writeFrame(output, frame);
            }
        } catch (IOException failure) {
            TransportCallback current = callback;
            if (current != null) current.onError(failure);
        }
    }

    /** Compatibility bridge for the retired embedded helper; it uses the ordinary TCP broadcast. */
    public void sendAuthorityEvent(NetworkMessage message) {
        send(message);
    }

    @Override
    public void disconnect() {
        final ServerSocket closingServer;
        final Socket closingClient;
        final List<ClientHandler> closingPeers;
        final List<Socket> closingPendingPeers;
        final LanHostAnnouncer closingAnnouncer;
        final TransportCallback notify;
        final boolean wasActive;
        synchronized (stateLock) {
            wasActive = isConnected || clientSocket != null || serverSocket != null;
            if (!wasActive && !isServer) return;
            lifecycleGeneration++;
            closingServer = serverSocket;
            closingClient = clientSocket;
            closingPeers = new ArrayList<>(connectedClients.values());
            closingPendingPeers = new ArrayList<>(pendingPeers.keySet());
            closingAnnouncer = hostAnnouncer;
            hostAnnouncer = null;
            notify = callback;
            serverSocket = null;
            clientSocket = null;
            clientOutput = null;
            connectedClients.clear();
            pendingPeers.clear();
            pendingPlayerIds.clear();
            isServer = false;
            isConnected = false;
            remoteHostId = null;
        }
        if (closingAnnouncer != null) closingAnnouncer.close();
        for (ClientHandler peer : closingPeers) peer.close();
        for (Socket pending : closingPendingPeers) closeQuietly(pending);
        closeQuietly(closingClient);
        closeQuietly(closingServer);
        if (wasActive && notify != null) notify.onDisconnected("LAN_DISCONNECTED");
    }

    @Override
    public boolean isConnected() {
        return isConnected;
    }

    @Override
    public String getTransportType() {
        return "LAN";
    }

    private static void closeQuietly(Socket socket) {
        if (socket != null) try { socket.close(); } catch (IOException ignored) { }
    }

    private static void closeQuietly(ServerSocket socket) {
        if (socket != null) try { socket.close(); } catch (IOException ignored) { }
    }

    /** Starts a five-second UDP broadcast search. The returned handle must be cancelled with its screen. */
    public static LANDiscoverySession discoverHosts(LANDiscoveryCallback discoveryCallback) throws SocketException {
        return LanHostDiscovery.start(discoveryCallback, DEFAULT_UDP_PORT,
                LanHostDiscovery.DEFAULT_SEARCH_WINDOW_MS);
    }

    public static LANDiscoverySession discoverHosts(LANDiscoveryCallback discoveryCallback,
                                                     long timeoutMs) throws SocketException {
        return LanHostDiscovery.start(discoveryCallback, DEFAULT_UDP_PORT, timeoutMs);
    }
}
