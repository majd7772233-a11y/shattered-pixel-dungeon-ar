package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.UUID;

public class AndroidBluetoothProvider implements BluetoothTransport.NativeBluetoothProvider {

    private BluetoothServerSocket serverSocket;
    private BluetoothSocket activeSocket;
    private InputStream inputStream;
    private OutputStream outputStream;
    private BufferedReader reader;
    private boolean isConnected = false;

    @Override
    public void startServer(UUID serviceUuid, TransportCallback callback) throws Exception {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            if (callback != null) callback.onError(new IllegalStateException("Bluetooth is not enabled on device."));
            return;
        }

        new Thread(() -> {
            try {
                serverSocket = adapter.listenUsingRfcommWithServiceRecord("SPD_MULTIPLAYER", serviceUuid);
                activeSocket = serverSocket.accept();
                setupStreams();
                if (callback != null) callback.onConnected();
                listen(callback);
            } catch (Exception e) {
                if (callback != null) callback.onError(e);
            }
        }).start();
    }

    @Override
    public void connectDevice(String deviceAddress, UUID serviceUuid, TransportCallback callback) throws Exception {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            if (callback != null) callback.onError(new IllegalStateException("Bluetooth is not enabled on device."));
            return;
        }

        new Thread(() -> {
            try {
                BluetoothDevice device = adapter.getRemoteDevice(deviceAddress);
                activeSocket = device.createRfcommSocketToServiceRecord(serviceUuid);
                adapter.cancelDiscovery();
                activeSocket.connect();
                setupStreams();
                if (callback != null) callback.onConnected();
                listen(callback);
            } catch (Exception e) {
                if (callback != null) callback.onError(e);
            }
        }).start();
    }

    private void setupStreams() throws Exception {
        if (activeSocket != null) {
            inputStream = activeSocket.getInputStream();
            outputStream = activeSocket.getOutputStream();
            reader = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"));
            isConnected = true;
        }
    }

    private void listen(TransportCallback callback) {
        try {
            String line;
            while (isConnected && reader != null && (line = reader.readLine()) != null) {
                if (callback != null) {
                    NetworkMessage msg = NetworkMessage.parseJson(line);
                    if (msg != null) {
                        callback.onMessageReceived(msg);
                    }
                }
            }
        } catch (Exception e) {
            if (callback != null) callback.onError(e);
        } finally {
            disconnect();
        }
    }

    @Override
    public synchronized void sendData(byte[] data) throws Exception {
        if (outputStream != null && isConnected) {
            outputStream.write(data);
            outputStream.flush();
        }
    }

    @Override
    public synchronized void disconnect() {
        isConnected = false;
        try {
            if (reader != null) reader.close();
            if (inputStream != null) inputStream.close();
            if (outputStream != null) outputStream.close();
            if (activeSocket != null) activeSocket.close();
            if (serverSocket != null) serverSocket.close();
        } catch (Exception ignored) {}
    }

    @Override
    public boolean isConnected() {
        return isConnected;
    }
}
