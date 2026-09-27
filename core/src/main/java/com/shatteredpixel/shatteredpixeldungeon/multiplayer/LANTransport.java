package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;

public class LANTransport implements NetworkTransport {
    public static final int DEFAULT_TCP_PORT = 8990;
    public static final int DEFAULT_UDP_PORT = 8991;

    private ServerSocket serverSocket;
    private DatagramSocket udpSocket;
    private final List<ClientHandler> connectedClients = new ArrayList<>();
    private Socket clientSocket;
    private PrintWriter out;
    private BufferedReader in;
    private boolean isServer = false;
    private boolean isConnected = false;
    private TransportCallback callback;
    private EmbeddedMatchAuthority hostAuthority;

    public interface LANDiscoveryCallback {
        void onHostDiscovered(String hostName, String hostIp, int port);
    }

    public void startServer(int tcpPort, String hostName, TransportCallback callback) throws Exception {
        this.callback = callback;
        this.isServer = true;
        this.isConnected = true;
        this.hostAuthority = new EmbeddedMatchAuthority(this);
        this.hostAuthority.start();

        new Thread(() -> {
            try {
                serverSocket = new ServerSocket(tcpPort);
                if (callback != null) callback.onConnected();

                startUDPAnnouncer(hostName, tcpPort);

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

    private void startUDPAnnouncer(String hostName, int tcpPort) {
        new Thread(() -> {
            try (DatagramSocket socket = new DatagramSocket()) {
                socket.setBroadcast(true);
                String announceMsg = "SPD_HOST:" + hostName + ":" + tcpPort;
                byte[] buffer = announceMsg.getBytes("UTF-8");

                while (isConnected) {
                    DatagramPacket packet = new DatagramPacket(
                            buffer,
                            buffer.length,
                            InetAddress.getByName("255.255.255.255"),
                            DEFAULT_UDP_PORT
                    );
                    socket.send(packet);
                    Thread.sleep(2000);
                }
            } catch (Exception ignored) {}
        }).start();
    }

    public static void discoverHosts(LANDiscoveryCallback discoveryCallback) {
        new Thread(() -> {
            try (DatagramSocket socket = new DatagramSocket(DEFAULT_UDP_PORT)) {
                socket.setSoTimeout(3000);
                byte[] buffer = new byte[512];
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);

                long startTime = System.currentTimeMillis();
                while (System.currentTimeMillis() - startTime < 5000) {
                    try {
                        socket.receive(packet);
                        String msg = new String(packet.getData(), 0, packet.getLength(), "UTF-8");
                        if (msg.startsWith("SPD_HOST:")) {
                            String[] parts = msg.split(":");
                            String hostName = parts.length > 1 ? parts[1] : "Host";
                            int port = parts.length > 2 ? Integer.parseInt(parts[2]) : DEFAULT_TCP_PORT;
                            String ip = packet.getAddress().getHostAddress();

                            if (discoveryCallback != null) {
                                discoveryCallback.onHostDiscovered(hostName, ip, port);
                            }
                        }
                    } catch (Exception timeoutOrErr) {
                        break;
                    }
                }
            } catch (Exception ignored) {}
        }).start();
    }

    @Override
    public void connect(String endpoint, TransportCallback callback) throws Exception {
        this.callback = callback;
        if (this.isServer) {
            if (callback != null) callback.onConnected();
            return;
        }

        String host = endpoint;
        int port = DEFAULT_TCP_PORT;
        if (endpoint.contains(":")) {
            String[] parts = endpoint.split(":");
            host = parts[0];
            port = Integer.parseInt(parts[1]);
        }

        final String finalHost = host;
        final int finalPort = port;

        new Thread(() -> {
            try {
                clientSocket = new Socket(finalHost, finalPort);
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

    public void sendAuthorityEvent(NetworkMessage eventMsg) {
        String jsonStr = serializeMessage(eventMsg);
        broadcastToClients(jsonStr);
        if (callback != null) {
            callback.onMessageReceived(eventMsg);
        }
    }

    @Override
    public void send(NetworkMessage message) {
        String jsonStr = serializeMessage(message);
        if (isServer) {
            if (hostAuthority != null && message.messageType == MessageType.ACTION) {
                int pos = parsePositionFromAction(message.payloadJson);
                hostAuthority.processAction(message.senderId, NetworkActionType.MOVE, pos);
            } else {
                broadcastToClients(jsonStr);
                if (callback != null) {
                    callback.onMessageReceived(message);
                }
            }
        } else if (out != null && isConnected) {
            out.println(jsonStr);
        }
    }

    private int parsePositionFromAction(String json) {
        if (json != null && json.contains("\"pos\":")) {
            try {
                int pIdx = json.indexOf("\"pos\":") + 6;
                int endP = json.indexOf("}", pIdx);
                if (endP == -1) endP = json.indexOf(",", pIdx);
                if (endP != -1) {
                    return Integer.parseInt(json.substring(pIdx, endP).replace("\"", "").trim());
                }
            } catch (Exception ignored) {}
        }
        return -1;
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
            if (udpSocket != null) udpSocket.close();
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
                    if (isServer && hostAuthority != null && msg.messageType == MessageType.ACTION) {
                        int pos = parsePositionFromAction(msg.payloadJson);
                        hostAuthority.processAction(msg.senderId, NetworkActionType.MOVE, pos);
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
