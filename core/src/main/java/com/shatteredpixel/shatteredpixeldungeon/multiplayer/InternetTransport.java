package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URI;
import java.security.SecureRandom;

public class InternetTransport implements NetworkTransport {
    private Socket socket;
    private InputStream in;
    private OutputStream out;
    private boolean isConnected = false;
    private TransportCallback callback;

    @Override
    public void connect(String endpoint, TransportCallback callback) throws Exception {
        this.callback = callback;
        URI uri = new URI(endpoint != null ? endpoint : "http://spd-multiplayer.majd7772233.workers.dev/room/DEFAULT_ROOM/websocket");
        String host = uri.getHost() != null ? uri.getHost() : "spd-multiplayer.majd7772233.workers.dev";
        int port = uri.getPort() != -1 ? uri.getPort() : 80;
        String path = uri.getPath() != null ? uri.getPath() : "/room/DEFAULT_ROOM/websocket";

        new Thread(() -> {
            try {
                socket = new Socket(host, port);
                in = socket.getInputStream();
                out = socket.getOutputStream();

                // Perform WebSocket Upgrade Handshake
                String handshake = "GET " + path + " HTTP/1.1\r\n" +
                        "Host: " + host + "\r\n" +
                        "Upgrade: websocket\r\n" +
                        "Connection: Upgrade\r\n" +
                        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
                        "Sec-WebSocket-Version: 13\r\n\r\n";
                out.write(handshake.getBytes("UTF-8"));
                out.flush();

                // Read HTTP response status line
                StringTextBuilder sb = new StringTextBuilder();
                String statusLine = readLine(in, sb);
                if (statusLine != null && (statusLine.contains("101") || statusLine.contains("200"))) {
                    while (true) {
                        String header = readLine(in, sb);
                        if (header == null || header.isEmpty()) break;
                    }

                    isConnected = true;
                    if (callback != null) {
                        callback.onConnected();
                    }

                    listen();
                } else {
                    if (callback != null) callback.onError(new Exception("WebSocket Handshake Failed: " + statusLine));
                }
            } catch (Exception e) {
                if (callback != null) callback.onError(e);
            }
        }).start();
    }

    private String readLine(InputStream is, StringTextBuilder sb) throws Exception {
        sb.clear();
        int b;
        while ((b = is.read()) != -1) {
            if (b == '\r') {
                int next = is.read();
                if (next == '\n' || next == -1) break;
                sb.append((char) b);
                sb.append((char) next);
            } else if (b == '\n') {
                break;
            } else {
                sb.append((char) b);
            }
        }
        return sb.toString();
    }

    private void listen() {
        try {
            while (isConnected) {
                int b1 = in.read();
                if (b1 == -1) break;
                int b2 = in.read();
                if (b2 == -1) break;

                int payloadLen = b2 & 0x7F;
                if (payloadLen == 126) {
                    payloadLen = (in.read() << 8) | in.read();
                } else if (payloadLen == 127) {
                    for (int i = 0; i < 8; i++) in.read();
                }

                boolean masked = (b2 & 0x80) != 0;
                byte[] maskingKey = new byte[4];
                if (masked) {
                    in.read(maskingKey);
                }

                byte[] payload = new byte[payloadLen];
                int bytesRead = 0;
                while (bytesRead < payloadLen) {
                    int r = in.read(payload, bytesRead, payloadLen - bytesRead);
                    if (r == -1) break;
                    bytesRead += r;
                }

                if (masked) {
                    for (int i = 0; i < payloadLen; i++) {
                        payload[i] ^= maskingKey[i % 4];
                    }
                }

                String jsonStr = new String(payload, "UTF-8");
                if (callback != null) {
                    NetworkMessage msg = parseMessage(jsonStr);
                    callback.onMessageReceived(msg);
                }
            }
        } catch (Exception e) {
            if (callback != null && isConnected) callback.onError(e);
        } finally {
            disconnect();
        }
    }

    private NetworkMessage parseMessage(String jsonStr) {
        NetworkMessage msg = new NetworkMessage();
        msg.payloadJson = jsonStr;

        if (jsonStr.contains("\"messageType\":\"SESSION\"")) msg.messageType = MessageType.SESSION;
        else if (jsonStr.contains("\"messageType\":\"PLAYER_JOINED\"")) msg.messageType = MessageType.PLAYER_JOINED;
        else if (jsonStr.contains("\"messageType\":\"PLAYER_LEFT\"")) msg.messageType = MessageType.PLAYER_LEFT;
        else if (jsonStr.contains("\"messageType\":\"ACTION_ACCEPTED\"")) msg.messageType = MessageType.ACTION_ACCEPTED;
        else if (jsonStr.contains("\"messageType\":\"EVENT_BATCH\"")) msg.messageType = MessageType.EVENT_BATCH;
        else if (jsonStr.contains("\"messageType\":\"PING\"")) msg.messageType = MessageType.PING;
        else msg.messageType = MessageType.ACTION;

        return msg;
    }

    @Override
    public void send(NetworkMessage message) {
        if (!isConnected || out == null) return;
        try {
            String json = "{\"messageType\":\"" + (message.messageType != null ? message.messageType.name() : "ACTION") +
                    "\",\"senderId\":\"" + (message.senderId != null ? message.senderId : "") +
                    "\",\"payloadJson\":" + (message.payloadJson != null ? message.payloadJson : "{}") + "}";

            byte[] payload = json.getBytes("UTF-8");
            byte[] mask = new byte[4];
            new SecureRandom().nextBytes(mask);

            out.write(0x81); // Text frame
            if (payload.length <= 125) {
                out.write(0x80 | payload.length);
            } else if (payload.length <= 65535) {
                out.write(0x80 | 126);
                out.write((payload.length >> 8) & 0xFF);
                out.write(payload.length & 0xFF);
            }

            out.write(mask);
            for (int i = 0; i < payload.length; i++) {
                out.write(payload[i] ^ mask[i % 4]);
            }
            out.flush();
        } catch (Exception e) {
            if (callback != null) callback.onError(e);
        }
    }

    @Override
    public void disconnect() {
        this.isConnected = false;
        try {
            if (in != null) in.close();
            if (out != null) out.close();
            if (socket != null) socket.close();
        } catch (Exception ignored) {}
        if (callback != null) {
            callback.onDisconnected("Disconnected from internet match server");
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

    private static class StringTextBuilder {
        private final StringBuilder sb = new StringBuilder();
        public void append(char c) { sb.append(c); }
        public void clear() { sb.setLength(0); }
        public String toString() { return sb.toString(); }
    }
}
