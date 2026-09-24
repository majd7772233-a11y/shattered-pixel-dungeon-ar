package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.Socket;

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

        new Thread(() -> {
            try {
                socket = new Socket(host, port);
                in = socket.getInputStream();
                out = socket.getOutputStream();
                isConnected = true;

                if (callback != null) {
                    callback.onConnected();
                }
            } catch (Exception e) {
                if (callback != null) callback.onError(e);
            }
        }).start();
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
}
