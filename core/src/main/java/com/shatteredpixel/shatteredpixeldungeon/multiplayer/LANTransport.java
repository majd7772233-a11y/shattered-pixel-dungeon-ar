package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.ServerSocket;
import java.net.Socket;

public class LANTransport implements NetworkTransport {
    private ServerSocket serverSocket;
    private Socket clientSocket;
    private PrintWriter out;
    private BufferedReader in;
    private boolean isConnected = false;
    private TransportCallback callback;

    public void startServer(int port, TransportCallback callback) throws Exception {
        this.callback = callback;
        new Thread(() -> {
            try {
                serverSocket = new ServerSocket(port);
                clientSocket = serverSocket.accept();
                setupStreams();
                listen();
            } catch (Exception e) {
                if (callback != null) callback.onError(e);
            }
        }).start();
    }

    @Override
    public void connect(String endpoint, TransportCallback callback) throws Exception {
        this.callback = callback;
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
                    NetworkMessage msg = new NetworkMessage();
                    msg.payloadJson = inputLine;
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
        if (out != null && isConnected) {
            out.println(message.payloadJson);
        }
    }

    @Override
    public void disconnect() {
        isConnected = false;
        try {
            if (in != null) in.close();
            if (out != null) out.close();
            if (clientSocket != null) clientSocket.close();
            if (serverSocket != null) serverSocket.close();
        } catch (Exception ignored) {}
        if (callback != null) callback.onDisconnected("Disconnected");
    }

    @Override
    public boolean isConnected() {
        return isConnected;
    }

    @Override
    public String getTransportType() {
        return "LAN";
    }
}
