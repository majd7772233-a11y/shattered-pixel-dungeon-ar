package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URI;

public class InternetTransport implements NetworkTransport {
    private Socket socket;
    private BufferedReader reader;
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
                out = socket.getOutputStream();
                reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), "UTF-8"));

                // Perform WebSocket Upgrade Handshake
                String handshake = "GET " + path + " HTTP/1.1\r\n" +
                        "Host: " + host + "\r\n" +
                        "Upgrade: websocket\r\n" +
                        "Connection: Upgrade\r\n" +
                        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
                        "Sec-WebSocket-Version: 13\r\n\r\n";
                out.write(handshake.getBytes("UTF-8"));
                out.flush();

                // Read HTTP response headers
                String statusLine = reader.readLine();
                if (statusLine != null && (statusLine.contains("101") || statusLine.contains("200"))) {
                    String line;
                    while ((line = reader.readLine()) != null && !line.isEmpty()) {
                        // Consume remaining response headers
                    }

                    isConnected = true;
                    if (callback != null) {
                        callback.onConnected();
                    }

                    // Start background receive loop
                    listen();
                } else {
                    if (callback != null) callback.onError(new Exception("WebSocket Handshake Failed: " + statusLine));
                }
            } catch (Exception e) {
                if (callback != null) callback.onError(e);
            }
        }).start();
    }

    private void listen() {
        try {
            String line;
            while (isConnected && (line = reader.readLine()) != null) {
                if (callback != null) {
                    NetworkMessage msg = parseMessage(line);
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
                    "\",\"payloadJson\":" + (message.payloadJson != null ? message.payloadJson : "{}") + "}\n";
            out.write(json.getBytes("UTF-8"));
            out.flush();
        } catch (Exception e) {
            if (callback != null) callback.onError(e);
        }
    }

    @Override
    public void disconnect() {
        this.isConnected = false;
        try {
            if (reader != null) reader.close();
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
}
