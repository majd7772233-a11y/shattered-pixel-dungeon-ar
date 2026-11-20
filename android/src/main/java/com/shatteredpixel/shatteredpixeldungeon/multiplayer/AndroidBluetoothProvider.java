package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.SocketTimeoutException;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;

/** Android Classic Bluetooth RFCOMM provider. It never reports connection before socket setup. */
public final class AndroidBluetoothProvider implements BluetoothTransport.NativeBluetoothProvider {

    private static final long CONNECT_TIMEOUT_MS = 15000L;
    private static final ScheduledExecutorService TIMEOUTS = Executors.newSingleThreadScheduledExecutor(
            new ThreadFactory() {
                @Override public Thread newThread(Runnable runnable) {
                    Thread thread = new Thread(runnable, "SPD-Bluetooth-Timeouts");
                    thread.setDaemon(true);
                    return thread;
                }
            });

    private final Context appContext;
    private final Object stateLock = new Object();

    private long generation;
    private boolean operationActive;
    private volatile boolean connected;
    private BluetoothServerSocket serverSocket;
    private BluetoothSocket pendingSocket;
    private BluetoothSocket activeSocket;
    private InputStream inputStream;
    private OutputStream outputStream;
    private ScheduledFuture<?> connectTimeout;
    private TransportCallback callback;

    public AndroidBluetoothProvider(Context context) {
        if (context == null) throw new IllegalArgumentException("BLUETOOTH_CONTEXT_REQUIRED");
        Context applicationContext = context.getApplicationContext();
        this.appContext = applicationContext == null ? context : applicationContext;
    }

    @Override
    public void startServer(UUID serviceUuid, TransportCallback transportCallback) throws Exception {
        if (serviceUuid == null) throw new IllegalArgumentException("BLUETOOTH_SERVICE_UUID_REQUIRED");
        final long attempt = beginOperation(transportCallback);
        BluetoothServerSocket listener = null;
        try {
            BluetoothAdapter adapter = requireEnabledAdapter();
            listener = adapter.listenUsingRfcommWithServiceRecord("SPD_MULTIPLAYER", serviceUuid);
            synchronized (stateLock) {
                if (!isCurrentLocked(attempt)) {
                    closeQuietly(listener);
                    throw new IOException("BLUETOOTH_START_CANCELLED");
                }
                serverSocket = listener;
            }
            final BluetoothServerSocket ownedListener = listener;
            startDaemon("SPD-Bluetooth-Accept", () -> acceptPeer(attempt, ownedListener));
        } catch (Exception failure) {
            closeQuietly(listener);
            rollbackStart(attempt);
            throw normalizeStartFailure(failure);
        }
    }

    @Override
    public void connectDevice(String deviceAddress, UUID serviceUuid, TransportCallback transportCallback) throws Exception {
        if (serviceUuid == null) throw new IllegalArgumentException("BLUETOOTH_SERVICE_UUID_REQUIRED");
        if (deviceAddress == null || !BluetoothAdapter.checkBluetoothAddress(deviceAddress.trim())) {
            throw new IllegalArgumentException("BLUETOOTH_DEVICE_ADDRESS_INVALID");
        }
        final long attempt = beginOperation(transportCallback);
        BluetoothSocket socket = null;
        try {
            BluetoothAdapter adapter = requireEnabledAdapter();
            BluetoothDevice device = adapter.getRemoteDevice(deviceAddress.trim());
            socket = device.createRfcommSocketToServiceRecord(serviceUuid);
            synchronized (stateLock) {
                if (!isCurrentLocked(attempt)) {
                    closeQuietly(socket);
                    throw new IOException("BLUETOOTH_CONNECT_CANCELLED");
                }
                pendingSocket = socket;
                final BluetoothSocket timedSocket = socket;
                connectTimeout = TIMEOUTS.schedule(
                        () -> failOperation(attempt, timedSocket,
                                new SocketTimeoutException("BLUETOOTH_CONNECT_TIMEOUT")),
                        CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS);
            }
            final BluetoothSocket targetSocket = socket;
            startDaemon("SPD-Bluetooth-Connect", () -> connectPeer(attempt, targetSocket));
        } catch (Exception failure) {
            closeQuietly(socket);
            rollbackStart(attempt);
            throw normalizeStartFailure(failure);
        }
    }

    private long beginOperation(TransportCallback transportCallback) {
        synchronized (stateLock) {
            if (operationActive) throw new IllegalStateException("BLUETOOTH_ALREADY_STARTED");
            operationActive = true;
            connected = false;
            callback = transportCallback;
            return ++generation;
        }
    }

    private BluetoothAdapter requireEnabledAdapter() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && appContext.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("BLUETOOTH_PERMISSION_REQUIRED");
        }
        BluetoothManager manager = (BluetoothManager) appContext.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? BluetoothAdapter.getDefaultAdapter() : manager.getAdapter();
        if (adapter == null) throw new UnsupportedOperationException("BLUETOOTH_UNSUPPORTED");
        if (!adapter.isEnabled()) throw new IllegalStateException("BLUETOOTH_DISABLED");
        return adapter;
    }

    private Exception normalizeStartFailure(Exception failure) {
        if (failure instanceof SecurityException
                && !"BLUETOOTH_PERMISSION_REQUIRED".equals(failure.getMessage())) {
            return new SecurityException("BLUETOOTH_PERMISSION_REQUIRED", failure);
        }
        return failure;
    }

    private void acceptPeer(long attempt, BluetoothServerSocket listener) {
        BluetoothSocket accepted = null;
        try {
            accepted = listener.accept();
            if (activateConnection(attempt, accepted)) readLoop(attempt, accepted);
            else closeQuietly(accepted);
        } catch (Exception failure) {
            if (isCurrent(attempt)) failOperation(attempt, accepted, failure);
        } finally {
            closeServerSocket(attempt, listener);
        }
    }

    private void connectPeer(long attempt, BluetoothSocket socket) {
        try {
            socket.connect();
            if (activateConnection(attempt, socket)) readLoop(attempt, socket);
            else closeQuietly(socket);
        } catch (Exception failure) {
            failOperation(attempt, socket, failure);
        }
    }

    private boolean activateConnection(long attempt, BluetoothSocket socket) throws IOException {
        InputStream input = new BufferedInputStream(socket.getInputStream());
        OutputStream output = new BufferedOutputStream(socket.getOutputStream());
        final TransportCallback notify;
        final BluetoothServerSocket acceptedListener;
        synchronized (stateLock) {
            if (!isCurrentLocked(attempt)
                    || (pendingSocket != null && pendingSocket != socket)
                    || (serverSocket == null && pendingSocket == null)) {
                closeQuietly(input);
                closeQuietly(output);
                return false;
            }
            cancelConnectTimeoutLocked();
            acceptedListener = serverSocket;
            serverSocket = null;
            pendingSocket = null;
            activeSocket = socket;
            inputStream = input;
            outputStream = output;
            connected = true;
            notify = callback;
        }
        closeQuietly(acceptedListener);
        if (notify != null) notify.onConnected();
        return true;
    }

    private void readLoop(long attempt, BluetoothSocket socket) {
        final InputStream input;
        final TransportCallback receiver;
        synchronized (stateLock) {
            if (!isCurrentLocked(attempt) || activeSocket != socket) return;
            input = inputStream;
            receiver = callback;
        }
        try {
            while (isCurrent(attempt)) {
                String frame = BluetoothFrameCodec.readFrame(input);
                if (frame == null) {
                    finishDisconnected(attempt, socket, "BLUETOOTH_PEER_CLOSED");
                    return;
                }
                NetworkMessage message = NetworkMessage.parseBluetoothJson(frame);
                if (message == null) throw new IOException("BLUETOOTH_MESSAGE_INVALID");
                if (receiver != null && isCurrent(attempt)) receiver.onMessageReceived(message);
            }
        } catch (Exception failure) {
            failOperation(attempt, socket, failure);
        }
    }

    @Override
    public void sendData(byte[] data) throws Exception {
        if (data == null || data.length < 2 || data.length > BluetoothFrameCodec.MAX_FRAME_BYTES + 1
                || data[data.length - 1] != '\n') {
            throw new IOException("BLUETOOTH_FRAME_INVALID");
        }
        for (int i = 0; i < data.length - 1; i++) {
            if (data[i] == '\n' || data[i] == '\r') throw new IOException("BLUETOOTH_FRAME_INVALID");
        }
        final OutputStream output;
        synchronized (stateLock) {
            if (!connected || activeSocket == null || outputStream == null) {
                throw new IOException("BLUETOOTH_NOT_CONNECTED");
            }
            output = outputStream;
        }
        synchronized (output) {
            output.write(data);
            output.flush();
        }
    }

    @Override
    public void disconnect() {
        final BluetoothServerSocket listener;
        final BluetoothSocket pending;
        final BluetoothSocket active;
        final InputStream input;
        final OutputStream output;
        synchronized (stateLock) {
            generation++;
            operationActive = false;
            connected = false;
            listener = serverSocket;
            pending = pendingSocket;
            active = activeSocket;
            input = inputStream;
            output = outputStream;
            serverSocket = null;
            pendingSocket = null;
            activeSocket = null;
            inputStream = null;
            outputStream = null;
            callback = null;
            cancelConnectTimeoutLocked();
        }
        closeQuietly(input);
        closeQuietly(output);
        closeQuietly(active);
        closeQuietly(pending);
        closeQuietly(listener);
    }

    @Override
    public boolean isConnected() {
        return connected;
    }

    private void finishDisconnected(long attempt, BluetoothSocket socket, String reason) {
        final TransportCallback notify;
        final InputStream input;
        final OutputStream output;
        synchronized (stateLock) {
            if (!isCurrentLocked(attempt) || activeSocket != socket) return;
            generation++;
            operationActive = false;
            connected = false;
            activeSocket = null;
            input = inputStream;
            output = outputStream;
            inputStream = null;
            outputStream = null;
            notify = callback;
            callback = null;
        }
        closeQuietly(input);
        closeQuietly(output);
        closeQuietly(socket);
        if (notify != null) notify.onDisconnected(reason);
    }

    private void failOperation(long attempt, BluetoothSocket failedSocket, Throwable failure) {
        final BluetoothServerSocket listener;
        final BluetoothSocket pending;
        final BluetoothSocket active;
        final InputStream input;
        final OutputStream output;
        final TransportCallback notify;
        synchronized (stateLock) {
            if (!isCurrentLocked(attempt)) return;
            generation++;
            operationActive = false;
            connected = false;
            listener = serverSocket;
            pending = pendingSocket;
            active = activeSocket;
            input = inputStream;
            output = outputStream;
            serverSocket = null;
            pendingSocket = null;
            activeSocket = null;
            inputStream = null;
            outputStream = null;
            notify = callback;
            callback = null;
            cancelConnectTimeoutLocked();
        }
        closeQuietly(input);
        closeQuietly(output);
        closeQuietly(active);
        if (pending != failedSocket) closeQuietly(pending);
        closeQuietly(failedSocket);
        closeQuietly(listener);
        if (notify != null) notify.onError(failure == null
                ? new IOException("BLUETOOTH_TRANSPORT_FAILED") : failure);
    }

    private void rollbackStart(long attempt) {
        synchronized (stateLock) {
            if (!isCurrentLocked(attempt)) return;
            generation++;
            operationActive = false;
            connected = false;
            serverSocket = null;
            pendingSocket = null;
            activeSocket = null;
            inputStream = null;
            outputStream = null;
            callback = null;
            cancelConnectTimeoutLocked();
        }
    }

    private void closeServerSocket(long attempt, BluetoothServerSocket listener) {
        synchronized (stateLock) {
            if (generation == attempt && serverSocket == listener) serverSocket = null;
        }
        closeQuietly(listener);
    }

    private boolean isCurrent(long attempt) {
        synchronized (stateLock) {
            return isCurrentLocked(attempt);
        }
    }

    private boolean isCurrentLocked(long attempt) {
        return operationActive && generation == attempt;
    }

    private void cancelConnectTimeoutLocked() {
        ScheduledFuture<?> timeout = connectTimeout;
        connectTimeout = null;
        if (timeout != null) timeout.cancel(false);
    }

    private static void startDaemon(String name, Runnable runnable) {
        Thread thread = new Thread(runnable, name);
        thread.setDaemon(true);
        thread.start();
    }

    private static void closeQuietly(BluetoothSocket socket) {
        if (socket != null) try { socket.close(); } catch (IOException ignored) { }
    }

    private static void closeQuietly(BluetoothServerSocket socket) {
        if (socket != null) try { socket.close(); } catch (IOException ignored) { }
    }

    private static void closeQuietly(InputStream stream) {
        if (stream != null) try { stream.close(); } catch (IOException ignored) { }
    }

    private static void closeQuietly(OutputStream stream) {
        if (stream != null) try { stream.close(); } catch (IOException ignored) { }
    }
}