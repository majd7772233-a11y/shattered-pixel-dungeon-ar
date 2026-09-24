package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.ServerSocket;
import java.net.Socket;

public class BluetoothTransport implements NetworkTransport {
    public static final int MAX_BLUETOOTH_PLAYERS = 2;

    private ServerSocket bluetoothServerSocket;
    private Socket bluetoothSocket;
    private PrintWriter out;
    private BufferedReader in;
    private boolean isConnected = false;
    private TransportCallback callback;

    public void startBluetoothServer(int port, TransportCallback callback) throws Exception {
        this.callback = callback;
        new Thread(() -> {
            try {
                bluetoothServerSocket = new ServerSocket(port);
                bluetoothSocket = bluetoothServerSocket.accept();
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
        int port = parts.length > 1 ? Integer.parseInt(parts[1]) : 8990;

        new Thread(() -> {
            try {
                bluetoothSocket = new Socket(host, port);
                setupStreams();
                listen();
            } catch (Exception e) {
                if (callback != null) callback.onError(e);
            }
        }).start();
    }

    private void setupStreams() throws Exception {
        out = new PrintWriter(bluetoothSocket.getOutputStream(), true);
        in = new BufferedReader(new InputStreamReader(bluetoothSocket.getInputStream()));
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
                    msg.messageType = MessageType.ACTION;
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
            out.println("{\"messageType\":\"" + (message.messageType != null ? message.messageType.name() : "ACTION") +
                    "\",\"payloadJson\":" + (message.payloadJson != null ? message.payloadJson : "{}") + "}");
        }
    }

    @Override
    public void disconnect() {
        this.isConnected = false;
        try {
            if (in != null) in.close();
            if (out != null) out.close();
            if (bluetoothSocket != null) bluetoothSocket.close();
            if (bluetoothServerSocket != null) bluetoothServerSocket.close();
        } catch (Exception ignored) {}
        if (callback != null) callback.onDisconnected("Bluetooth disconnected");
    }

    @Override
    public boolean isConnected() {
        return isConnected;
    }

    @Override
    public String getTransportType() {
        return "BLUETOOTH";
    }
}
