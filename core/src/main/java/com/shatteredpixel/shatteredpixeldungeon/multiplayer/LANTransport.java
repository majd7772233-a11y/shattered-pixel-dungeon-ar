package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;

public class LANTransport implements NetworkTransport {
    private ServerSocket serverSocket;
    private final List<ClientHandler> connectedClients = new ArrayList<>();
    private Socket clientSocket;
    private PrintWriter out;
    private BufferedReader in;
    private boolean isServer = false;
    private boolean isConnected = false;
    private TransportCallback callback;

    public void startServer(int port, TransportCallback callback) throws Exception {
        this.callback = callback;
        this.isServer = true;
        this.isConnected = true;

        new Thread(() -> {
            try {
                serverSocket = new ServerSocket(port);
                if (callback != null) callback.onConnected();

                while (isConnected && !serverSocket.isClosed()) {
                    Socket socket = serverSocket.accept();
                    ClientHandler handler = new ClientHandler(socket);
                    synchronized (connectedClients) {
                        connectedClients.add(handler);
                    }
                    new Thread(handler).start();
                }
            } catch (Exception e) {
                if (callback != null && isConnected) callback.onError(e);
            }
        }).start();
    }

    @Override
    public void connect(String endpoint, TransportCallback callback) throws Exception {
        this.callback = callback;
        this.isServer = false;
        String[] parts = endpoint.split(":");
        String host = parts[0];
        int port = parts.length > 1 ? Integer.parseInt(parts[1]) : 8080;

        new Thread(() -> {
            try {
                clientSocket = new Socket(host, port);
                setupStreams();
                listen();
            } catch (Exception e) {
                if (callback != null) callback.onError(e);
            }
        }).start();
    }

    private void setupStreams() throws Exception {
        out = new PrintWriter(clientSocket.getOutputStream(), true);
        in = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
        isConnected = true;
        if (callback != null) callback.onConnected();
    }

    private void listen() {
        try {
            String inputLine;
            while (isConnected && (inputLine = in.readLine()) != null) {
                if (callback != null) {
                    NetworkMessage msg = parseMessage(inputLine);
                    callback.onMessageReceived(msg);
                }
            }
        } catch (Exception e) {
            if (callback != null) callback.onError(e);
        } finally {
            disconnect();
        }
    }

    @Override
    public void send(NetworkMessage message) {
        String jsonStr = serializeMessage(message);
        if (isServer) {
            broadcastToClients(jsonStr);
        } else if (out != null && isConnected) {
            out.println(jsonStr);
        }
    }

    private synchronized void broadcastToClients(String jsonStr) {
        synchronized (connectedClients) {
            for (ClientHandler client : connectedClients) {
                client.send(jsonStr);
            }
        }
    }

    private String serializeMessage(NetworkMessage msg) {
        return "{\"messageType\":\"" + (msg.messageType != null ? msg.messageType.name() : "ACTION") +
                "\",\"senderId\":\"" + (msg.senderId != null ? msg.senderId : "") +
                "\",\"payloadJson\":" + (msg.payloadJson != null ? msg.payloadJson : "{}") + "}";
    }

    private NetworkMessage parseMessage(String jsonStr) {
        NetworkMessage msg = new NetworkMessage();
        msg.payloadJson = jsonStr;

        if (jsonStr.contains("\"messageType\":\"HELLO\"")) msg.messageType = MessageType.HELLO;
        else if (jsonStr.contains("\"messageType\":\"SESSION\"")) msg.messageType = MessageType.SESSION;
        else if (jsonStr.contains("\"messageType\":\"ACTION\"")) msg.messageType = MessageType.ACTION;
        else if (jsonStr.contains("\"messageType\":\"ACTION_ACCEPTED\"")) msg.messageType = MessageType.ACTION_ACCEPTED;
        else if (jsonStr.contains("\"messageType\":\"EVENT_BATCH\"")) msg.messageType = MessageType.EVENT_BATCH;
        else if (jsonStr.contains("\"messageType\":\"PING\"")) msg.messageType = MessageType.PING;
        else msg.messageType = MessageType.ACTION;

        return msg;
    }

    @Override
    public void disconnect() {
        isConnected = false;
        try {
            if (in != null) in.close();
            if (out != null) out.close();
            if (clientSocket != null) clientSocket.close();
            if (serverSocket != null) serverSocket.close();
            synchronized (connectedClients) {
                for (ClientHandler client : connectedClients) {
                    client.close();
                }
                connectedClients.clear();
            }
        } catch (Exception ignored) {}
        if (callback != null) callback.onDisconnected("LAN Disconnected");
    }

    @Override
    public boolean isConnected() {
        return isConnected;
    }

    @Override
    public String getTransportType() {
        return "LAN";
    }

    private class ClientHandler implements Runnable {
        private final Socket socket;
        private PrintWriter writer;

        public ClientHandler(Socket socket) {
            this.socket = socket;
        }

        @Override
        public void run() {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream()))) {
                writer = new PrintWriter(socket.getOutputStream(), true);
                String line;
                while (isConnected && (line = reader.readLine()) != null) {
                    NetworkMessage msg = parseMessage(line);
                    if (callback != null) {
                        callback.onMessageReceived(msg);
                    }
                    broadcastToClients(line);
                }
            } catch (Exception ignored) {
            } finally {
                close();
            }
        }

        public void send(String msg) {
            if (writer != null) {
                writer.println(msg);
            }
        }

        public void close() {
            try {
                if (socket != null && !socket.isClosed()) socket.close();
            } catch (Exception ignored) {}
        }
    }
}
