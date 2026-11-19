package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;

public class InternetTransportProtocolTest {

    private static final String RFC_SAMPLE_KEY = "dGhlIHNhbXBsZSBub25jZQ==";
    private static final String RFC_SAMPLE_ACCEPT = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";

    @Test
    public void buildsRoomEndpointsFromTheConfiguredWorkerAndNormalizedRoomCode() {
        Assert.assertEquals("https://spd-multiplayer-backend.magd.workers.dev/room/ABC_123/websocket",
                InternetTransport.buildRoomEndpoint(" ABC_123 "));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsInvalidRoomCodesBeforeBuildingAWorkerEndpoint() {
        InternetTransport.buildRoomEndpoint("BAD ROOM");
    }

    @Test
    public void computesTheRfc6455AcceptDigest() throws Exception {
        Assert.assertEquals(RFC_SAMPLE_ACCEPT, WebSocketHandshake.expectedAccept(RFC_SAMPLE_KEY));
        Assert.assertEquals(RFC_SAMPLE_ACCEPT, InternetTransport.expectedWebSocketAccept(RFC_SAMPLE_KEY));
    }

    @Test
    public void buildsUpgradeRequestWithOnlyTheBearerHeaderForCredentials() {
        String request = InternetTransport.buildUpgradeRequest(
                "example.test:8443", "/room/ROOM-1/websocket?lifecycle=1&playerId=p1",
                RFC_SAMPLE_KEY, "Bearer session-token-0123456789");

        Assert.assertTrue(request.startsWith("GET /room/ROOM-1/websocket?lifecycle=1&playerId=p1 HTTP/1.1\r\n"));
        Assert.assertTrue(request.contains("Host: example.test:8443\r\n"));
        Assert.assertTrue(request.contains("Upgrade: websocket\r\n"));
        Assert.assertTrue(request.contains("Connection: Upgrade\r\n"));
        Assert.assertTrue(request.contains("Sec-WebSocket-Key: " + RFC_SAMPLE_KEY + "\r\n"));
        Assert.assertTrue(request.contains("Sec-WebSocket-Version: 13\r\n"));
        Assert.assertTrue(request.contains("Authorization: Bearer session-token-0123456789\r\n"));
        Assert.assertFalse(request.contains("sessionToken="));
    }

    @Test
    public void acceptsAValidUpgradeWithCaseInsensitiveHeadersAndTokenLists() throws Exception {
        String response = "HTTP/1.1 101 Switching Protocols\r\n"
                + "uPgRaDe: h2c, WebSocket\r\n"
                + "cOnNeCtIoN: keep-alive, Upgrade\r\n"
                + "Sec-WebSocket-Accept: " + RFC_SAMPLE_ACCEPT + "\r\n"
                + "\r\n";

        InternetTransport.validateUpgradeResponse(
                new ByteArrayInputStream(response.getBytes(StandardCharsets.US_ASCII)), RFC_SAMPLE_KEY);
    }

    @Test
    public void rejectsUpgradeResponsesThatDoNotProveTheWebSocketHandshake() {
        assertHandshakeRejected("HTTP/1.1 200 OK\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                + "Sec-WebSocket-Accept: " + RFC_SAMPLE_ACCEPT + "\r\n\r\n");
        assertHandshakeRejected("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\n"
                + "Sec-WebSocket-Accept: " + RFC_SAMPLE_ACCEPT + "\r\n\r\n");
        assertHandshakeRejected("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                + "Sec-WebSocket-Accept: " + RFC_SAMPLE_ACCEPT + "\r\n\r\n");
        assertHandshakeRejected("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                + "Connection: Upgrade\r\nSec-WebSocket-Accept: wrong\r\n\r\n");
        assertHandshakeRejected("HTTP/1.1 1011 Switching Protocols\r\nUpgrade: websocket\r\n"
                + "Connection: Upgrade\r\nSec-WebSocket-Accept: " + RFC_SAMPLE_ACCEPT + "\r\n\r\n");
    }

    @Test
    public void preservesHttpStatusForExpiredSessionAndConflictHandling() {
        assertHandshakeRejectedWithStatus("HTTP/1.1 401 Unauthorized\r\n\r\n", "HTTP/1.1 401");
        assertHandshakeRejectedWithStatus("HTTP/1.1 403 Forbidden\r\n\r\n", "HTTP/1.1 403");
        assertHandshakeRejectedWithStatus("HTTP/1.1 409 Conflict\r\n\r\n", "HTTP/1.1 409");
    }

    @Test
    public void rejectsDuplicateSecurityHeadersAndUnrequestedExtensions() {
        String validPrefix = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                + "Connection: Upgrade\r\nSec-WebSocket-Accept: " + RFC_SAMPLE_ACCEPT + "\r\n";
        assertHandshakeRejected(validPrefix + "Sec-WebSocket-Accept: " + RFC_SAMPLE_ACCEPT + "\r\n\r\n");
        assertHandshakeRejected(validPrefix + "Sec-WebSocket-Extensions: permessage-deflate\r\n\r\n");
        assertHandshakeRejected(validPrefix + "Sec-WebSocket-Protocol: spd-v2\r\n\r\n");
        assertHandshakeRejected(validPrefix + " Upgrade: websocket\r\n\r\n");
    }

    @Test
    public void rejectsMalformedAndOversizedUpgradeHeaders() {
        assertHandshakeRejected("HTTP/1.1 101 Switching Protocols\r\nnot-a-header\r\n\r\n");
        assertHandshakeRejected("HTTP/1.1 101 Switching Protocols\nUpgrade: websocket\n\r\n");
        StringBuilder oversized = new StringBuilder(
                "HTTP/1.1 101 Switching Protocols\r\nX-Test: ");
        for (int i = 0; i < 9000; i++) oversized.append('a');
        oversized.append("\r\n\r\n");
        assertHandshakeRejected(oversized.toString());
    }

    @Test
    public void rejectsMalformedClientKeysAndAuthorizationHeaderInjection() throws Exception {
        try {
            InternetTransport.buildUpgradeRequest("example.test", "/room/LOCAL/websocket", "not-a-client-key", null);
            Assert.fail("The client key must be canonical Base64 for exactly 16 random bytes");
        } catch (IllegalArgumentException expected) {
            // Invalid keys must not become part of an HTTP request.
        }
        try {
            InternetTransport.buildUpgradeRequest("example.test", "/room/LOCAL/websocket", RFC_SAMPLE_KEY,
                    "Bearer session-token-0123456789\r\nInjected: yes");
            Assert.fail("Authorization must reject HTTP header injection");
        } catch (IllegalArgumentException expected) {
            // Session credentials are restricted to the Worker token grammar.
        }
        try {
            new InternetTransport().connect("ws://example.test/room/LOCAL/websocket", null,
                    "session-token-0123456789");
            Assert.fail("Session credentials must never be sent over an insecure WebSocket endpoint");
        } catch (IllegalArgumentException expected) {
            // Credentials are accepted only over wss/https.
        }
    }

    @Test
    public void preservesEncodedEndpointPathAndQueryAndKeepsSessionSecretOutOfUrl() throws Exception {
        java.net.URI uri = new java.net.URI(
                "wss://example.test/room/ROOM%201/websocket?playerId=p%2B1&lifecycle=1");
        Assert.assertEquals("/room/ROOM%201/websocket?playerId=p%2B1&lifecycle=1",
                InternetTransport.buildRequestTarget(uri));
        Assert.assertEquals("Bearer session-token-0123456789",
                InternetTransport.buildAuthorizationHeader("session-token-0123456789"));
        Assert.assertNull(InternetTransport.buildAuthorizationHeader("short"));
        Assert.assertNull(InternetTransport.buildAuthorizationHeader("bad\r\nInjected: yes"));
    }

    @Test
    public void decodesServerFramesAtAllLengthEncodingBoundaries() throws Exception {
        assertServerFrameRoundTrip(125);
        assertServerFrameRoundTrip(126);
        assertServerFrameRoundTrip(65535);
        assertServerFrameRoundTrip(65536);
    }

    @Test
    public void rejectsMaskedNonCanonicalReservedAndOversizedServerFrames() throws Exception {
        assertFrameRejected(new byte[]{(byte) 0x81, (byte) 0x80});
        assertFrameRejected(new byte[]{(byte) 0xc1, 0});
        assertFrameRejected(new byte[]{(byte) 0x83, 0});
        assertFrameRejected(new byte[]{(byte) 0x81, 126, 0, 125});
        assertFrameRejected(new byte[]{(byte) 0x81, 127, 0, 0, 0, 0, 0, 0, 0, 125});
        assertFrameRejected(new byte[]{(byte) 0x09, 0});
        assertFrameRejected(new byte[]{(byte) 0x89, 126, 0, 126});
        assertFrameRejected(new byte[]{(byte) 0x81, 127, 0, 0, 0, 0, 1, 0, 0, 1});
    }

    @Test
    public void reassemblesFragmentedTextAndAllowsInterleavedControlFrames() throws Exception {
        WebSocketFrameCodec.MessageAssembler assembler = new WebSocketFrameCodec.MessageAssembler();
        byte[] first = "{\"protocolVersion\":\"1.0.0\",\"messageType\":\"PING\","
                .getBytes(StandardCharsets.UTF_8);
        byte[] second = "\"payloadJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8);

        Assert.assertNull(assembler.accept(new WebSocketFrameCodec.Frame(false, WebSocketFrameCodec.TEXT, first)));
        Assert.assertNull(assembler.accept(new WebSocketFrameCodec.Frame(true, WebSocketFrameCodec.PING,
                new byte[]{7, 8, 9})));
        Assert.assertEquals("{\"protocolVersion\":\"1.0.0\",\"messageType\":\"PING\","
                        + "\"payloadJson\":\"{}\"}",
                assembler.accept(new WebSocketFrameCodec.Frame(true, WebSocketFrameCodec.CONTINUATION, second)));
    }

    @Test
    public void rejectsInvalidFragmentSequencesAndBinaryMessages() throws Exception {
        WebSocketFrameCodec.MessageAssembler assembler = new WebSocketFrameCodec.MessageAssembler();
        assertProtocolFailure(1002, () -> assembler.accept(
                new WebSocketFrameCodec.Frame(true, WebSocketFrameCodec.CONTINUATION, new byte[0])));
        assertProtocolFailure(1003, () -> assembler.accept(
                new WebSocketFrameCodec.Frame(true, WebSocketFrameCodec.BINARY, new byte[0])));

        WebSocketFrameCodec.MessageAssembler unfinished = new WebSocketFrameCodec.MessageAssembler();
        unfinished.accept(new WebSocketFrameCodec.Frame(false, WebSocketFrameCodec.TEXT, new byte[]{'a'}));
        assertProtocolFailure(1002, () -> unfinished.accept(
                new WebSocketFrameCodec.Frame(true, WebSocketFrameCodec.TEXT, new byte[]{'b'})));
    }

    @Test
    public void rejectsMalformedUtf8AndInvalidUtf16Surrogates() throws Exception {
        assertProtocolFailure(1007, () -> WebSocketFrameCodec.decodeUtf8(new byte[]{(byte) 0xc3, 0x28}));
        assertProtocolFailure(1007, () -> WebSocketFrameCodec.encodeUtf8("\ud800"));
    }

    @Test
    public void clientFramesAreMaskedAndEncodeShortMediumAndLongLengths() throws Exception {
        assertMaskedClientFrame(125);
        assertMaskedClientFrame(126);
        assertMaskedClientFrame(65536);
    }

    @Test
    public void enforcesControlFrameLimitsAndValidCloseCodes() throws Exception {
        assertProtocolFailure(1002, () -> WebSocketFrameCodec.closePayload(1005, ""));
        assertProtocolFailure(1002, () -> WebSocketFrameCodec.closePayload(1006, ""));
        assertProtocolFailure(1002, () -> WebSocketFrameCodec.closePayload(1015, ""));
        assertProtocolFailure(1002, () -> WebSocketFrameCodec.closePayload(2000, ""));
        assertProtocolFailure(1002, () -> WebSocketFrameCodec.validateClosePayload(new byte[]{0}));
        assertProtocolFailure(1002, () -> WebSocketFrameCodec.validateClosePayload(new byte[]{0x03, (byte) 0xf7}));
        try {
            WebSocketFrameCodec.writeClientFrame(new DataOutputStream(new ByteArrayOutputStream()),
                    WebSocketFrameCodec.PING, new byte[126], new byte[]{1, 2, 3, 4});
            Assert.fail("Outgoing control frames over 125 bytes must be rejected");
        } catch (IOException expected) {
            // The local writer rejects an invalid control-frame size before writing any bytes.
        }
        Assert.assertArrayEquals(new byte[]{3, (byte) 0xe8}, WebSocketFrameCodec.closePayload(1000, ""));
    }

    @Test
    public void disconnectCancelsAnInFlightHttpUpgradeWithoutLateCallbacks() throws Exception {
        final ServerSocket server = new ServerSocket(0);
        server.setSoTimeout(5000);
        final CountDownLatch requestReceived = new CountDownLatch(1);
        final CountDownLatch peerObservedClose = new CountDownLatch(1);
        final AtomicReference<Throwable> serverFailure = new AtomicReference<>();
        final AtomicInteger connected = new AtomicInteger();
        final AtomicInteger disconnected = new AtomicInteger();
        final AtomicInteger messages = new AtomicInteger();
        final AtomicInteger errors = new AtomicInteger();

        Thread peerThread = new Thread(() -> {
            try (Socket peer = server.accept()) {
                peer.setSoTimeout(5000);
                BufferedReader requestReader = new BufferedReader(
                        new InputStreamReader(peer.getInputStream(), StandardCharsets.US_ASCII));
                Assert.assertNotNull("Upgrade request line must arrive", requestReader.readLine());
                String header;
                while ((header = requestReader.readLine()) != null && !header.isEmpty()) {
                    // Consume the complete request; deliberately do not send HTTP 101.
                }
                requestReceived.countDown();
                int endOfStream = peer.getInputStream().read();
                Assert.assertEquals("Cancellation must close the pending TCP socket", -1, endOfStream);
            } catch (Throwable failure) {
                serverFailure.set(failure);
            } finally {
                peerObservedClose.countDown();
            }
        }, "spd-cancelled-websocket-upgrade-peer");
        peerThread.setDaemon(true);
        peerThread.start();

        InternetTransport transport = new InternetTransport();
        transport.connect("ws://127.0.0.1:" + server.getLocalPort() + "/room/CANCEL/websocket",
                new TransportCallback() {
                    @Override public void onConnected() { connected.incrementAndGet(); }
                    @Override public void onDisconnected(String reason) { disconnected.incrementAndGet(); }
                    @Override public void onMessageReceived(NetworkMessage message) { messages.incrementAndGet(); }
                    @Override public void onError(Throwable error) { errors.incrementAndGet(); }
                });

        Assert.assertTrue("Client did not reach the deliberately stalled HTTP upgrade",
                requestReceived.await(5, TimeUnit.SECONDS));
        Assert.assertFalse("The WebSocket must not be connected before HTTP 101", transport.isConnected());
        transport.disconnect();
        Assert.assertTrue("Disconnect did not close the pending TCP connection",
                peerObservedClose.await(5, TimeUnit.SECONDS));
        peerThread.join(2000L);
        Assert.assertFalse("Mock peer did not terminate", peerThread.isAlive());
        Assert.assertNull("Mock peer failed: " + serverFailure.get(), serverFailure.get());

        // A cancelled pre-upgrade attempt was never a connected WebSocket, so it must not emit
        // onConnected, onDisconnected, onMessageReceived or a misleading retry-triggering error.
        Thread.sleep(50L);
        Assert.assertEquals(0, connected.get());
        Assert.assertEquals(0, disconnected.get());
        Assert.assertEquals(0, messages.get());
        Assert.assertEquals(0, errors.get());
        Assert.assertFalse(transport.isConnected());
        server.close();
    }

    @Test
    public void localWebSocketPeerExercisesHandshakePingFragmentationAndClose() throws Exception {
        final ServerSocket server = new ServerSocket(0);
        server.setSoTimeout(5000);
        final CountDownLatch connected = new CountDownLatch(1);
        final CountDownLatch messageReceived = new CountDownLatch(1);
        final CountDownLatch disconnected = new CountDownLatch(1);
        final AtomicReference<NetworkMessage> received = new AtomicReference<>();
        final AtomicReference<Throwable> serverFailure = new AtomicReference<>();
        final CountDownLatch serverDone = new CountDownLatch(1);

        Thread peerThread = new Thread(() -> {
            try (Socket peer = server.accept()) {
                peer.setSoTimeout(5000);
                BufferedReader requestReader = new BufferedReader(
                        new InputStreamReader(peer.getInputStream(), StandardCharsets.US_ASCII));
                String requestLine = requestReader.readLine();
                Assert.assertNotNull(requestLine);
                Assert.assertTrue(requestLine.startsWith("GET /room/LOCAL/websocket?lifecycle=1 HTTP/1.1"));
                String key = null;
                String header;
                while ((header = requestReader.readLine()) != null && !header.isEmpty()) {
                    if (header.regionMatches(true, 0, "Sec-WebSocket-Key:", 0, 18)) {
                        key = header.substring(header.indexOf(':') + 1).trim();
                    }
                }
                Assert.assertNotNull("Client must send Sec-WebSocket-Key", key);
                DataOutputStream output = new DataOutputStream(peer.getOutputStream());
                output.write(("HTTP/1.1 101 Switching Protocols\r\n"
                        + "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        + "Sec-WebSocket-Accept: " + WebSocketHandshake.expectedAccept(key) + "\r\n\r\n")
                        .getBytes(StandardCharsets.US_ASCII));
                output.flush();

                DataInputStream input = new DataInputStream(peer.getInputStream());
                writeServerFrame(output, WebSocketFrameCodec.PING, true, new byte[]{4, 5, 6});
                ClientFrame pong = readClientFrame(input);
                Assert.assertEquals(WebSocketFrameCodec.PONG, pong.opcode);
                Assert.assertArrayEquals(new byte[]{4, 5, 6}, pong.payload);

                byte[] text = new NetworkMessage(MessageType.SESSION, "{}").toJson()
                        .getBytes(StandardCharsets.UTF_8);
                int split = text.length / 2;
                writeServerFrame(output, WebSocketFrameCodec.TEXT, false, Arrays.copyOfRange(text, 0, split));
                writeServerFrame(output, WebSocketFrameCodec.PING, true, new byte[]{9, 8});
                ClientFrame secondPong = readClientFrame(input);
                Assert.assertEquals(WebSocketFrameCodec.PONG, secondPong.opcode);
                Assert.assertArrayEquals(new byte[]{9, 8}, secondPong.payload);
                writeServerFrame(output, WebSocketFrameCodec.CONTINUATION, true,
                        Arrays.copyOfRange(text, split, text.length));

                byte[] closePayload = WebSocketFrameCodec.closePayload(1000, "local-test");
                writeServerFrame(output, WebSocketFrameCodec.CLOSE, true, closePayload);
                ClientFrame closeReply = readClientFrame(input);
                Assert.assertEquals(WebSocketFrameCodec.CLOSE, closeReply.opcode);
                Assert.assertArrayEquals(closePayload, closeReply.payload);
            } catch (Throwable failure) {
                serverFailure.set(failure);
            } finally {
                try { server.close(); } catch (IOException ignored) {}
                serverDone.countDown();
            }
        }, "spd-local-websocket-test-peer");
        peerThread.setDaemon(true);
        peerThread.start();

        InternetTransport transport = new InternetTransport();
        transport.connect("ws://127.0.0.1:" + server.getLocalPort()
                + "/room/LOCAL/websocket?lifecycle=1", new TransportCallback() {
            @Override public void onConnected() { connected.countDown(); }
            @Override public void onDisconnected(String reason) { disconnected.countDown(); }
            @Override public void onMessageReceived(NetworkMessage message) {
                received.set(message);
                messageReceived.countDown();
            }
            @Override public void onError(Throwable error) { serverFailure.compareAndSet(null, error); }
        });

        Assert.assertTrue("Handshake callback did not arrive", connected.await(5, TimeUnit.SECONDS));
        Assert.assertTrue("Fragmented message did not arrive", messageReceived.await(5, TimeUnit.SECONDS));
        Assert.assertEquals(MessageType.SESSION, received.get().messageType);
        Assert.assertTrue("Close callback did not arrive", disconnected.await(5, TimeUnit.SECONDS));
        Assert.assertTrue("Local mock peer did not finish", serverDone.await(5, TimeUnit.SECONDS));
        Assert.assertNull("Mock peer/client failed: " + serverFailure.get(), serverFailure.get());
    }

    @Test
    public void heartbeatSendsApplicationPingAndClosesHalfOpenConnection() throws Exception {
        final ServerSocket server = new ServerSocket(0);
        server.setSoTimeout(5000);
        final CountDownLatch connected = new CountDownLatch(1);
        final CountDownLatch pingReceived = new CountDownLatch(1);
        final CountDownLatch pongReceived = new CountDownLatch(1);
        final CountDownLatch disconnected = new CountDownLatch(1);
        final CountDownLatch peerClosed = new CountDownLatch(1);
        final AtomicReference<Throwable> serverFailure = new AtomicReference<>();
        final AtomicReference<Throwable> callbackError = new AtomicReference<>();

        Thread peerThread = new Thread(() -> {
            try (Socket peer = server.accept()) {
                peer.setSoTimeout(5000);
                BufferedReader requestReader = new BufferedReader(
                        new InputStreamReader(peer.getInputStream(), StandardCharsets.US_ASCII));
                String requestLine = requestReader.readLine();
                Assert.assertNotNull(requestLine);
                String key = null;
                String header;
                while ((header = requestReader.readLine()) != null && !header.isEmpty()) {
                    if (header.regionMatches(true, 0, "Sec-WebSocket-Key:", 0, 18)) {
                        key = header.substring(header.indexOf(':') + 1).trim();
                    }
                }
                Assert.assertNotNull("Client must send Sec-WebSocket-Key", key);
                DataOutputStream output = new DataOutputStream(peer.getOutputStream());
                output.write(("HTTP/1.1 101 Switching Protocols\r\n"
                        + "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        + "Sec-WebSocket-Accept: " + WebSocketHandshake.expectedAccept(key) + "\r\n\r\n")
                        .getBytes(StandardCharsets.US_ASCII));
                output.flush();

                DataInputStream peerInput = new DataInputStream(peer.getInputStream());
                while (true) {
                    final ClientFrame pingFrame;
                    try {
                        pingFrame = readClientFrame(peerInput);
                    } catch (EOFException closed) {
                        break;
                    }
                    Assert.assertEquals(WebSocketFrameCodec.TEXT, pingFrame.opcode);
                    NetworkMessage ping = NetworkMessage.parseJson(new String(pingFrame.payload, StandardCharsets.UTF_8));
                    Assert.assertEquals(MessageType.PING, ping.messageType);
                    Assert.assertEquals("{}", ping.payloadJson);
                    pingReceived.countDown();
                    if (pongReceived.getCount() > 0) {
                        NetworkMessage pong = new NetworkMessage(MessageType.PING, "{\"pong\":true}");
                        writeServerTextFrame(output, pong.toJson());
                    }
                }
            } catch (Throwable failure) {
                serverFailure.set(failure);
            } finally {
                peerClosed.countDown();
                try { server.close(); } catch (IOException ignored) {}
            }
        }, "spd-half-open-websocket-peer");
        peerThread.setDaemon(true);
        peerThread.start();

        InternetTransport transport = new InternetTransport();
        transport.setHeartbeatTimingForTests(100L, 1200L);
        transport.connect("ws://127.0.0.1:" + server.getLocalPort() + "/room/HEARTBEAT/websocket",
                new TransportCallback() {
                    @Override public void onConnected() { connected.countDown(); }
                    @Override public void onDisconnected(String reason) {
                        Assert.assertTrue("Disconnect reason must identify heartbeat timeout", reason.contains("heartbeat"));
                        disconnected.countDown();
                    }
                    @Override public void onMessageReceived(NetworkMessage message) {
                        if (message != null && message.messageType == MessageType.PING
                                && message.payloadJson != null && message.payloadJson.contains("pong")) {
                            pongReceived.countDown();
                        }
                    }
                    @Override public void onError(Throwable error) { callbackError.set(error); }
                });

        Assert.assertTrue("WebSocket handshake did not complete", connected.await(5, TimeUnit.SECONDS));
        Assert.assertTrue("Client did not send its application heartbeat", pingReceived.await(5, TimeUnit.SECONDS));
        Assert.assertTrue("Client did not receive the server heartbeat response (serverFailure=" + serverFailure.get() + ", callbackError=" + callbackError.get() + ", heartbeatRuns=" + transport.getHeartbeatRunCountForTests() + ", lastIdleMs=" + transport.getLastHeartbeatIdleMsForTests() + ", heartbeatFailure=" + transport.getLastHeartbeatFailureForTests() + ")", pongReceived.await(5, TimeUnit.SECONDS));
        Assert.assertFalse("A valid PONG must reset the heartbeat idle timer", disconnected.await(75, TimeUnit.MILLISECONDS));
        Assert.assertTrue("Half-open connection was not detected (runs=" + transport.getHeartbeatRunCountForTests() + ", idleMs=" + transport.getLastHeartbeatIdleMsForTests() + ", timeoutMs=" + transport.getHeartbeatTimeoutForTests() + ", current=" + transport.isLastHeartbeatCurrentForTests() + ", error=" + transport.getLastHeartbeatFailureForTests() + ")", disconnected.await(5, TimeUnit.SECONDS));
        Assert.assertTrue("Server did not observe the closed socket", peerClosed.await(5, TimeUnit.SECONDS));
        peerThread.join(2000L);
        Assert.assertFalse("Half-open peer did not terminate", peerThread.isAlive());
        Assert.assertNull("Mock peer failed: " + serverFailure.get(), serverFailure.get());
        Assert.assertNull("Heartbeat should close via disconnect, not an unclassified error", callbackError.get());
        Assert.assertFalse(transport.isConnected());
    }
    @Test
    public void disconnectInterruptsABackpressuredApplicationWrite() throws Exception {
        final ServerSocket server = new ServerSocket(0);
        server.setReceiveBufferSize(1024);
        server.setSoTimeout(5000);
        final CountDownLatch connected = new CountDownLatch(1);
        final CountDownLatch frameStarted = new CountDownLatch(1);
        final CountDownLatch allowPeerClose = new CountDownLatch(1);
        final CountDownLatch disconnected = new CountDownLatch(1);
        final AtomicReference<Throwable> serverFailure = new AtomicReference<>();
        final AtomicReference<Throwable> callbackError = new AtomicReference<>();

        Thread peerThread = new Thread(() -> {
            try (Socket peer = server.accept()) {
                peer.setReceiveBufferSize(1024);
                BufferedReader requestReader = new BufferedReader(
                        new InputStreamReader(peer.getInputStream(), StandardCharsets.US_ASCII));
                Assert.assertNotNull(requestReader.readLine());
                String key = null;
                String header;
                while ((header = requestReader.readLine()) != null && !header.isEmpty()) {
                    if (header.regionMatches(true, 0, "Sec-WebSocket-Key:", 0, 18)) {
                        key = header.substring(header.indexOf(':') + 1).trim();
                    }
                }
                Assert.assertNotNull("Client must send Sec-WebSocket-Key", key);
                DataOutputStream output = new DataOutputStream(peer.getOutputStream());
                output.write(("HTTP/1.1 101 Switching Protocols\r\n"
                        + "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        + "Sec-WebSocket-Accept: " + WebSocketHandshake.expectedAccept(key) + "\r\n\r\n")
                        .getBytes(StandardCharsets.US_ASCII));
                output.flush();
                int firstFrameByte = peer.getInputStream().read();
                Assert.assertTrue("Client did not begin the large application frame", firstFrameByte >= 0);
                frameStarted.countDown();
                allowPeerClose.await(5, TimeUnit.SECONDS);
            } catch (Throwable failure) {
                serverFailure.set(failure);
            } finally {
                try { server.close(); } catch (IOException ignored) {}
            }
        }, "spd-backpressured-websocket-peer");
        peerThread.setDaemon(true);
        peerThread.start();

        InternetTransport transport = new InternetTransport();
        transport.connect("ws://127.0.0.1:" + server.getLocalPort() + "/room/BACKPRESSURE/websocket",
                new TransportCallback() {
                    @Override public void onConnected() { connected.countDown(); }
                    @Override public void onDisconnected(String reason) { disconnected.countDown(); }
                    @Override public void onMessageReceived(NetworkMessage message) {}
                    @Override public void onError(Throwable error) { callbackError.set(error); }
                });

        Assert.assertTrue("WebSocket handshake did not complete", connected.await(5, TimeUnit.SECONDS));
        final AtomicReference<Throwable> sendFailure = new AtomicReference<>();
        final String largePayload = "\"" + new String(new char[15 * 1024 * 1024]).replace('\0', 'x') + "\"";
        Thread sender = new Thread(() -> {
            try {
                transport.send(new NetworkMessage(MessageType.CHAT, largePayload));
            } catch (Throwable failure) {
                sendFailure.set(failure);
            }
        }, "spd-backpressured-application-sender");
        sender.setDaemon(true);
        sender.start();

        Assert.assertTrue("Large client frame did not reach the peer", frameStarted.await(5, TimeUnit.SECONDS));
        Thread.sleep(250L);
        Assert.assertTrue("Peer backpressure should keep the application write pending", sender.isAlive());

        long disconnectStarted = System.nanoTime();
        transport.disconnect();
        long disconnectDurationMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - disconnectStarted);
        allowPeerClose.countDown();
        sender.join(3000L);
        peerThread.join(3000L);

        Assert.assertTrue("disconnect() must not wait behind a blocked socket write: "
                + disconnectDurationMs + "ms", disconnectDurationMs < 1000L);
        Assert.assertFalse("Closing the socket must release the blocked sender", sender.isAlive());
        Assert.assertTrue("Disconnect callback must be delivered", disconnected.await(2, TimeUnit.SECONDS));
        Assert.assertNull("The send was cancelled by disconnect, not an application exception", sendFailure.get());
        Assert.assertNull("A stale blocked write must not report an active-session error", callbackError.get());
        Assert.assertFalse(transport.isConnected());
        Assert.assertNull("Mock peer failed: " + serverFailure.get(), serverFailure.get());
    }
    private static void writeServerTextFrame(DataOutputStream output, String text) throws IOException {
        byte[] payload = text.getBytes(StandardCharsets.UTF_8);
        output.writeByte(0x81);
        if (payload.length < 126) {
            output.writeByte(payload.length);
        } else {
            output.writeByte(126);
            output.writeShort(payload.length);
        }
        output.write(payload);
        output.flush();
    }
    private static void assertHandshakeRejectedWithStatus(String response, String expectedStatus) {
        try {
            InternetTransport.validateUpgradeResponse(
                    new ByteArrayInputStream(response.getBytes(StandardCharsets.US_ASCII)), RFC_SAMPLE_KEY);
            Assert.fail("A non-101 HTTP response must be rejected");
        } catch (IOException expected) {
            Assert.assertTrue("Expected status in error: " + expected.getMessage(),
                    expected.getMessage().contains(expectedStatus));
        }
    }

    private static void assertHandshakeRejected(String response) {
        try {
            InternetTransport.validateUpgradeResponse(
                    new ByteArrayInputStream(response.getBytes(StandardCharsets.US_ASCII)), RFC_SAMPLE_KEY);
            Assert.fail("Invalid WebSocket upgrade response must be rejected");
        } catch (IOException expected) {
            // Expected: the server has not proved a valid RFC 6455 upgrade.
        }
    }

    private static void assertServerFrameRoundTrip(int length) throws Exception {
        byte[] payload = new byte[length];
        for (int i = 0; i < payload.length; i++) payload[i] = (byte) (i * 31);
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        writeServerFrame(new DataOutputStream(encoded), WebSocketFrameCodec.TEXT, true, payload);
        WebSocketFrameCodec.Frame frame = WebSocketFrameCodec.readServerFrame(
                new DataInputStream(new ByteArrayInputStream(encoded.toByteArray())));
        Assert.assertEquals(WebSocketFrameCodec.TEXT, frame.opcode);
        Assert.assertTrue(frame.fin);
        Assert.assertArrayEquals(payload, frame.payload);
    }

    private static void assertFrameRejected(byte[] wire) throws Exception {
        try {
            WebSocketFrameCodec.readServerFrame(new DataInputStream(new ByteArrayInputStream(wire)));
            Assert.fail("Invalid server frame must be rejected");
        } catch (IOException expected) {
            // Expected: malformed or unsupported frame.
        }
    }

    private static void assertMaskedClientFrame(int length) throws Exception {
        byte[] payload = new byte[length];
        for (int i = 0; i < payload.length; i++) payload[i] = (byte) (i * 17);
        byte[] mask = new byte[]{0x12, 0x34, 0x56, 0x78};
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        WebSocketFrameCodec.writeClientFrame(new DataOutputStream(encoded),
                WebSocketFrameCodec.TEXT, payload, mask);

        DataInputStream input = new DataInputStream(new ByteArrayInputStream(encoded.toByteArray()));
        int first = input.readUnsignedByte();
        int second = input.readUnsignedByte();
        Assert.assertEquals(0x81, first);
        Assert.assertTrue((second & 0x80) != 0);
        long actualLength = second & 0x7f;
        if (actualLength == 126) actualLength = ((long) input.readUnsignedByte() << 8) | input.readUnsignedByte();
        else if (actualLength == 127) {
            actualLength = 0;
            for (int i = 0; i < 8; i++) actualLength = (actualLength << 8) | input.readUnsignedByte();
        }
        Assert.assertEquals(length, actualLength);
        byte[] actualMask = new byte[4];
        input.readFully(actualMask);
        Assert.assertArrayEquals(mask, actualMask);
        byte[] decoded = new byte[length];
        input.readFully(decoded);
        for (int i = 0; i < decoded.length; i++) decoded[i] ^= actualMask[i & 3];
        Assert.assertArrayEquals(payload, decoded);
    }

    private static void writeServerFrame(DataOutputStream output, int opcode, boolean fin, byte[] payload)
            throws IOException {
        output.writeByte((fin ? 0x80 : 0) | opcode);
        if (payload.length <= 125) {
            output.writeByte(payload.length);
        } else if (payload.length <= 65535) {
            output.writeByte(126);
            output.writeByte((payload.length >>> 8) & 0xff);
            output.writeByte(payload.length & 0xff);
        } else {
            output.writeByte(127);
            long length = payload.length;
            for (int shift = 56; shift >= 0; shift -= 8) {
                output.writeByte((int) (length >>> shift) & 0xff);
            }
        }
        output.write(payload);
        output.flush();
    }

    private static ClientFrame readClientFrame(DataInputStream input) throws IOException {
        int first = input.readUnsignedByte();
        int second = input.readUnsignedByte();
        Assert.assertTrue("Client frames must be masked", (second & 0x80) != 0);
        int opcode = first & 0x0f;
        long length = second & 0x7f;
        if (length == 126) length = ((long) input.readUnsignedByte() << 8) | input.readUnsignedByte();
        else if (length == 127) {
            length = 0;
            for (int i = 0; i < 8; i++) length = (length << 8) | input.readUnsignedByte();
        }
        if (length > 65536) throw new IOException("Unexpected client test frame size");
        byte[] mask = new byte[4];
        input.readFully(mask);
        byte[] payload = new byte[(int) length];
        input.readFully(payload);
        for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        return new ClientFrame(opcode, payload);
    }

    private static void assertProtocolFailure(int expectedCode, IoAction action) throws Exception {
        try {
            action.run();
            Assert.fail("Expected WebSocket protocol failure " + expectedCode);
        } catch (WebSocketFrameCodec.WebSocketProtocolException failure) {
            Assert.assertEquals(expectedCode, failure.closeCode);
        }
    }

    private interface IoAction {
        void run() throws Exception;
    }

    private static final class ClientFrame {
        final int opcode;
        final byte[] payload;
        ClientFrame(int opcode, byte[] payload) {
            this.opcode = opcode;
            this.payload = payload;
        }
    }
}
