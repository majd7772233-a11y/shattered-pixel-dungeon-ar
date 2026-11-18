package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;

/** Internet transport using a strictly validated RFC 6455 WebSocket connection. */
public class InternetTransport implements NetworkTransport {
    static final int CONNECT_TIMEOUT_MS = 10000;
    static final int HANDSHAKE_TIMEOUT_MS = 10000;
    private static final String DEFAULT_ENDPOINT =
            "wss://spd-multiplayer.majd7772233.workers.dev/room/DEFAULT_ROOM/websocket";

    private Socket socket;
    private DataInputStream in;
    private DataOutputStream out;
    private volatile boolean isConnected;
    private volatile TransportCallback callback;
    /** Incremented whenever an attempt is started or cancelled; stale workers cannot own state. */
    private long connectionGeneration;
    private boolean connectionAttemptActive;

    @Override
    public void connect(String endpoint, TransportCallback callback) throws Exception {
        connect(endpoint, callback, null);
    }

    void connect(String endpoint, TransportCallback callback, String sessionToken) throws Exception {
        URI uri = new URI(endpoint == null || endpoint.trim().isEmpty() ? DEFAULT_ENDPOINT : endpoint.trim());
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        boolean secure;
        if ("wss".equals(scheme) || "https".equals(scheme)) {
            secure = true;
        } else if ("ws".equals(scheme) || "http".equals(scheme)) {
            secure = false;
        } else {
            throw new IllegalArgumentException("Unsupported WebSocket endpoint scheme.");
        }
        String host = uri.getHost();
        if (host == null || host.isEmpty() || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("A valid WebSocket host is required.");
        }
        if (sessionToken != null && !secure) {
            throw new IllegalArgumentException("Session credentials require a secure WebSocket endpoint.");
        }
        int port = uri.getPort() != -1 ? uri.getPort() : (secure ? 443 : 80);
        if (port < 1 || port > 65535) throw new IllegalArgumentException("Invalid WebSocket endpoint port.");
        String requestTarget = WebSocketHandshake.buildRequestTarget(uri);
        String authorization = WebSocketHandshake.buildAuthorizationHeader(sessionToken);
        if (sessionToken != null && authorization == null) {
            throw new IllegalArgumentException("Invalid session token.");
        }
        ensureAsciiRequestTarget(requestTarget);
        String hostHeader = buildHostHeader(host, port, secure);
        byte[] nonce = new byte[16];
        new SecureRandom().nextBytes(nonce);
        String clientKey = Base64.getEncoder().encodeToString(nonce);
        String request = WebSocketHandshake.buildRequest(hostHeader, requestTarget, clientKey, authorization);
        final long generation;
        synchronized (this) {
            if (connectionAttemptActive) {
                throw new IllegalStateException("WEBSOCKET_CONNECTION_ALREADY_ACTIVE");
            }
            this.callback = callback;
            this.isConnected = false;
            this.connectionAttemptActive = true;
            generation = ++connectionGeneration;
        }

        Thread worker = new Thread(
                () -> runConnection(host, port, secure, request, clientKey, generation),
                "spd-internet-websocket");
        worker.setDaemon(true);
        worker.start();
    }

    private void runConnection(String host, int port, boolean secure, String request,
                               String clientKey, long generation) {
        try {
            Socket rawSocket = new Socket();
            if (!installSocket(generation, rawSocket)) {
                closeQuietly(rawSocket);
                return;
            }

            rawSocket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
            if (!isCurrentAttempt(generation)) return;
            rawSocket.setSoTimeout(HANDSHAKE_TIMEOUT_MS);
            rawSocket.setTcpNoDelay(true);

            Socket connectionSocket = rawSocket;
            if (secure) {
                SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
                SSLSocket sslSocket = (SSLSocket) factory.createSocket(rawSocket, host, port, true);
                if (!replaceSocket(generation, rawSocket, sslSocket)) {
                    closeQuietly(sslSocket);
                    return;
                }
                connectionSocket = sslSocket;
                SSLParameters parameters = sslSocket.getSSLParameters();
                parameters.setEndpointIdentificationAlgorithm("HTTPS");
                sslSocket.setSSLParameters(parameters);
                sslSocket.setUseClientMode(true);
                sslSocket.setSoTimeout(HANDSHAKE_TIMEOUT_MS);
                if (!isCurrentAttempt(generation)) return;
                sslSocket.startHandshake();
            }

            DataInputStream connectionIn = new DataInputStream(connectionSocket.getInputStream());
            DataOutputStream connectionOut = new DataOutputStream(connectionSocket.getOutputStream());
            if (!installStreams(generation, connectionSocket, connectionIn, connectionOut)) return;
            connectionOut.write(request.getBytes(StandardCharsets.US_ASCII));
            connectionOut.flush();
            WebSocketHandshake.validateUpgradeResponse(connectionIn, clientKey);

            TransportCallback connectedCallback;
            synchronized (this) {
                if (!isCurrentAttemptLocked(generation) || socket != connectionSocket) return;
                connectionSocket.setSoTimeout(0);
                isConnected = true;
                connectedCallback = callback;
            }
            if (connectedCallback != null) connectedCallback.onConnected();
            listen(generation, connectionIn);
        } catch (Exception failure) {
            TransportCallback current = callbackIfCurrent(generation);
            if (current != null) current.onError(failure);
        } finally {
            finishAttemptIfCurrent(generation);
        }
    }

    private void listen(long generation, DataInputStream connectionIn) {
        WebSocketFrameCodec.MessageAssembler assembler = new WebSocketFrameCodec.MessageAssembler();
        try {
            while (isCurrentConnection(generation)) {
                WebSocketFrameCodec.Frame frame = WebSocketFrameCodec.readServerFrame(connectionIn);
                if (!isCurrentConnection(generation)) return;
                if (frame.opcode == WebSocketFrameCodec.PING) {
                    sendControlFrame(generation, WebSocketFrameCodec.PONG, frame.payload);
                    continue;
                }
                if (frame.opcode == WebSocketFrameCodec.PONG) continue;
                if (frame.opcode == WebSocketFrameCodec.CLOSE) {
                    sendControlFrame(generation, WebSocketFrameCodec.CLOSE, frame.payload);
                    closeSocketAndNotify(generation, "WebSocket closed by server" + closeReason(frame.payload));
                    return;
                }
                String completeText = assembler.accept(frame);
                if (completeText != null) {
                    TransportCallback current = callbackIfCurrent(generation);
                    if (current != null) current.onMessageReceived(NetworkMessage.parseJson(completeText));
                }
            }
        } catch (WebSocketFrameCodec.WebSocketProtocolException protocolFailure) {
            try {
                sendControlFrame(generation, WebSocketFrameCodec.CLOSE,
                        WebSocketFrameCodec.closePayload(protocolFailure.closeCode, "Protocol error"));
            } catch (IOException ignored) {}
            TransportCallback current = callbackIfCurrent(generation);
            if (current != null) current.onError(protocolFailure);
        } catch (IOException failure) {
            TransportCallback current = callbackIfConnected(generation);
            if (current != null) current.onError(failure);
        } finally {
            closeSocketAndNotify(generation, "WebSocket connection closed");
        }
    }

    private boolean isCurrentAttempt(long generation) {
        synchronized (this) {
            return isCurrentAttemptLocked(generation);
        }
    }

    private boolean isCurrentAttemptLocked(long generation) {
        return connectionAttemptActive && connectionGeneration == generation;
    }

    private boolean isCurrentConnection(long generation) {
        synchronized (this) {
            return isCurrentAttemptLocked(generation) && isConnected;
        }
    }

    private boolean installSocket(long generation, Socket candidate) {
        synchronized (this) {
            if (!isCurrentAttemptLocked(generation)) return false;
            socket = candidate;
            return true;
        }
    }

    private boolean replaceSocket(long generation, Socket expected, Socket replacement) {
        synchronized (this) {
            if (!isCurrentAttemptLocked(generation) || socket != expected) return false;
            socket = replacement;
            return true;
        }
    }

    private boolean installStreams(long generation, Socket owner,
                                   DataInputStream input, DataOutputStream output) {
        synchronized (this) {
            if (!isCurrentAttemptLocked(generation) || socket != owner) return false;
            in = input;
            out = output;
            return true;
        }
    }

    private TransportCallback callbackIfCurrent(long generation) {
        synchronized (this) {
            return isCurrentAttemptLocked(generation) ? callback : null;
        }
    }

    private TransportCallback callbackIfConnected(long generation) {
        synchronized (this) {
            return isCurrentAttemptLocked(generation) && isConnected ? callback : null;
        }
    }

    private void finishAttemptIfCurrent(long generation) {
        synchronized (this) {
            if (!isCurrentAttemptLocked(generation)) return;
            connectionAttemptActive = false;
            isConnected = false;
            closeSocketResources();
        }
    }

    private static void closeQuietly(Socket value) {
        if (value == null) return;
        try { value.close(); } catch (IOException ignored) {}
    }

    private synchronized void sendControlFrame(long generation, int opcode, byte[] payload) throws IOException {
        if (!isCurrentAttemptLocked(generation) || !isConnected || out == null) return;
        WebSocketFrameCodec.writeClientFrame(out, opcode, payload);
    }

    @Override
    public void send(NetworkMessage message) {
        TransportCallback notify = null;
        Exception sendFailure = null;
        synchronized (this) {
            if (!isConnected || out == null) return;
            try {
                if (message == null) throw new IllegalArgumentException("Network message is required");
                byte[] payload = WebSocketFrameCodec.encodeUtf8(message.toJson());
                if (payload.length > WebSocketFrameCodec.MAX_MESSAGE_PAYLOAD) {
                    throw new IOException("Outgoing WebSocket message exceeds the 16 MiB limit");
                }
                WebSocketFrameCodec.writeClientFrame(out, WebSocketFrameCodec.TEXT, payload);
            } catch (Exception failure) {
                sendFailure = failure;
                notify = callback;
            }
        }
        if (notify != null) notify.onError(sendFailure);
    }

    @Override
    public void disconnect() {
        TransportCallback notify = null;
        Socket closingSocket;
        boolean wasConnected;
        synchronized (this) {
            wasConnected = isConnected;
            if (wasConnected && out != null) {
                try {
                    WebSocketFrameCodec.writeClientFrame(out, WebSocketFrameCodec.CLOSE,
                            WebSocketFrameCodec.closePayload(1000, ""));
                } catch (Exception ignored) {}
            }
            // Invalidate the pending TCP/TLS/upgrade worker even when no WebSocket is connected yet.
            connectionGeneration++;
            connectionAttemptActive = false;
            isConnected = false;
            notify = wasConnected ? callback : null;
            closingSocket = socket;
            in = null;
            out = null;
            socket = null;
        }
        closeQuietly(closingSocket);
        // External callbacks must never execute while holding the transport monitor. Manager
        // reconnect/close operations acquire locks in the opposite order.
        if (notify != null) notify.onDisconnected("Disconnected from internet match server");
    }

    private void closeSocketAndNotify(long generation, String reason) {
        TransportCallback notify;
        Socket closingSocket;
        boolean wasConnected;
        synchronized (this) {
            if (!isCurrentAttemptLocked(generation)) return;
            wasConnected = isConnected;
            isConnected = false;
            connectionAttemptActive = false;
            notify = wasConnected ? callback : null;
            closingSocket = socket;
            in = null;
            out = null;
            socket = null;
        }
        closeQuietly(closingSocket);
        if (notify != null) notify.onDisconnected(reason);
    }

    private synchronized void closeSocketResources() {
        try { if (in != null) in.close(); } catch (Exception ignored) {}
        try { if (out != null) out.close(); } catch (Exception ignored) {}
        try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        in = null;
        out = null;
        socket = null;
    }

    static String buildAuthorizationHeader(String sessionToken) {
        return WebSocketHandshake.buildAuthorizationHeader(sessionToken);
    }

    static String buildRequestTarget(URI uri) {
        return WebSocketHandshake.buildRequestTarget(uri);
    }

    static String expectedWebSocketAccept(String key) throws IOException {
        return WebSocketHandshake.expectedAccept(key);
    }

    static String buildUpgradeRequest(String hostHeader, String requestTarget, String key, String authorization) {
        return WebSocketHandshake.buildRequest(hostHeader, requestTarget, key, authorization);
    }

    static void validateUpgradeResponse(java.io.InputStream input, String key) throws IOException {
        WebSocketHandshake.validateUpgradeResponse(input, key);
    }

    private static String buildHostHeader(String host, int port, boolean secure) {
        String formattedHost = host.indexOf(':') >= 0 && !host.startsWith("[") ? "[" + host + "]" : host;
        int defaultPort = secure ? 443 : 80;
        return port == defaultPort ? formattedHost : formattedHost + ":" + port;
    }

    private static void ensureAsciiRequestTarget(String target) {
        for (int i = 0; i < target.length(); i++) {
            char value = target.charAt(i);
            if (value <= 0x20 || value >= 0x7f || value == '#') {
                throw new IllegalArgumentException("WebSocket request target must be URI-escaped ASCII.");
            }
        }
    }

    private static String closeReason(byte[] payload) {
        if (payload.length < 2) return "";
        int code = ((payload[0] & 0xff) << 8) | (payload[1] & 0xff);
        try {
            String reason = WebSocketFrameCodec.decodeUtf8(
                    java.util.Arrays.copyOfRange(payload, 2, payload.length));
            return " (" + code + (reason.isEmpty() ? "" : ": " + reason) + ")";
        } catch (IOException impossibleAfterValidation) {
            return " (" + code + ")";
        }
    }

    @Override
    public boolean isConnected() {
        return isConnected;
    }

    @Override
    public String getTransportType() {
        return "INTERNET";
    }
}
