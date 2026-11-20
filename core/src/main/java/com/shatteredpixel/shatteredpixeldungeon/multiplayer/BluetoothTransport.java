package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/** Core RFCOMM transport facade. A connection is reported only by the real platform provider. */
public class BluetoothTransport implements NetworkTransport {
    public static final String SPD_MULTIPLAYER_UUID_STR = "7f3a9d42-6c81-4e55-b7d2-3e9a1f64c820";
    public static final UUID SPD_MULTIPLAYER_UUID = UUID.fromString(SPD_MULTIPLAYER_UUID_STR);
    public static final int MAX_BLUETOOTH_PLAYERS = 2;
    public static final String SERVER_ENDPOINT = "SERVER";

    private static final Pattern DEVICE_ADDRESS = Pattern.compile("(?i)^[0-9a-f]{2}(:[0-9a-f]{2}){5}$");
    private static volatile NativeBluetoothProvider nativeProvider;

    public interface NativeBluetoothProvider {
        void startServer(UUID serviceUuid, TransportCallback callback) throws Exception;
        void connectDevice(String deviceAddress, UUID serviceUuid, TransportCallback callback) throws Exception;
        void sendData(byte[] data) throws Exception;
        void disconnect();
        boolean isConnected();
    }

    private final Object stateLock = new Object();
    private volatile boolean connected;
    private boolean started;
    private long generation;
    private NativeBluetoothProvider activeProvider;
    private TransportCallback callback;

    public static void setNativeProvider(NativeBluetoothProvider provider) {
        nativeProvider = provider;
    }

    public static NativeBluetoothProvider getNativeProvider() {
        return nativeProvider;
    }

    /** Compatibility entry point; host setup normally calls connect(SERVER_ENDPOINT, callback). */
    public void startBluetoothServer(TransportCallback callback) throws Exception {
        connect(SERVER_ENDPOINT, callback);
    }

    @Override
    public void connect(String endpoint, TransportCallback callback) throws Exception {
        NativeBluetoothProvider provider = nativeProvider;
        if (provider == null) throw new IllegalStateException("BLUETOOTH_UNAVAILABLE");
        if (endpoint == null || endpoint.trim().isEmpty()) {
            throw new IllegalArgumentException("BLUETOOTH_DEVICE_REQUIRED");
        }
        String target = endpoint.trim();
        boolean host = SERVER_ENDPOINT.equalsIgnoreCase(target);
        if (!host && !DEVICE_ADDRESS.matcher(target).matches()) {
            throw new IllegalArgumentException("BLUETOOTH_DEVICE_ADDRESS_INVALID");
        }

        final long attempt;
        synchronized (stateLock) {
            if (started) throw new IllegalStateException("BLUETOOTH_ALREADY_STARTED");
            attempt = ++generation;
            started = true;
            connected = false;
            this.callback = callback;
            activeProvider = provider;
        }

        try {
            TransportCallback bridge = callbackFor(provider, attempt);
            if (host) provider.startServer(SPD_MULTIPLAYER_UUID, bridge);
            else provider.connectDevice(target.toUpperCase(Locale.ROOT), SPD_MULTIPLAYER_UUID, bridge);
        } catch (Exception failure) {
            synchronized (stateLock) {
                if (generation == attempt && activeProvider == provider) {
                    generation++;
                    started = false;
                    connected = false;
                    activeProvider = null;
                    this.callback = null;
                }
            }
            try { provider.disconnect(); } catch (RuntimeException ignored) { }
            throw failure;
        }
    }

    private TransportCallback callbackFor(final NativeBluetoothProvider provider, final long attempt) {
        return new TransportCallback() {
            @Override
            public void onConnected() {
                boolean ready = provider.isConnected();
                TransportCallback target;
                synchronized (stateLock) {
                    if (!isCurrent(provider, attempt)) return;
                    target = callback;
                    if (ready) {
                        connected = true;
                    } else {
                        started = false;
                        connected = false;
                        activeProvider = null;
                        callback = null;
                        generation++;
                    }
                }
                if (ready) {
                    if (target != null) target.onConnected();
                } else {
                    try { provider.disconnect(); } catch (RuntimeException ignored) { }
                    if (target != null) target.onError(new IllegalStateException("BLUETOOTH_PROVIDER_NOT_CONNECTED"));
                }
            }

            @Override
            public void onDisconnected(String reason) {
                TransportCallback target;
                synchronized (stateLock) {
                    if (!isCurrent(provider, attempt)) return;
                    connected = false;
                    started = false;
                    activeProvider = null;
                    target = callback;
                    callback = null;
                    generation++;
                }
                if (target != null) target.onDisconnected(reason == null ? "BLUETOOTH_DISCONNECTED" : reason);
            }

            @Override
            public void onMessageReceived(NetworkMessage message) {
                TransportCallback target;
                synchronized (stateLock) {
                    if (!isCurrent(provider, attempt) || !connected || !provider.isConnected()) return;
                    target = callback;
                }
                if (message != null && target != null) target.onMessageReceived(message);
            }

            @Override
            public void onError(Throwable error) {
                notifyProviderError(provider, attempt,
                        error == null ? new IllegalStateException("BLUETOOTH_TRANSPORT_FAILED") : error);
            }
        };
    }

    private boolean isCurrent(NativeBluetoothProvider provider, long attempt) {
        return generation == attempt && started && activeProvider == provider;
    }

    private void notifyProviderError(NativeBluetoothProvider provider, long attempt, Throwable failure) {
        TransportCallback target;
        synchronized (stateLock) {
            if (!isCurrent(provider, attempt)) return;
            connected = false;
            started = false;
            activeProvider = null;
            target = callback;
            callback = null;
            generation++;
        }
        try { provider.disconnect(); } catch (RuntimeException ignored) { }
        if (target != null) target.onError(failure);
    }

    @Override
    public void send(NetworkMessage message) {
        final NativeBluetoothProvider provider;
        final TransportCallback target;
        final long attempt;
        synchronized (stateLock) {
            provider = activeProvider;
            target = callback;
            attempt = generation;
        }
        if (message == null) {
            reportSendFailure(provider, target, attempt,
                    new IllegalArgumentException("BLUETOOTH_MESSAGE_REQUIRED"));
            return;
        }
        if (provider == null || !isStartedWithConnectedProvider(provider, attempt)) {
            reportSendFailure(provider, target, attempt,
                    new IllegalStateException("BLUETOOTH_NOT_CONNECTED"));
            return;
        }
        try {
            provider.sendData(BluetoothFrameCodec.encodeFrame(message.toJson()));
        } catch (Exception failure) {
            notifyProviderError(provider, attempt, failure);
        }
    }

    private void reportSendFailure(NativeBluetoothProvider provider, TransportCallback target,
                                   long attempt, Throwable failure) {
        synchronized (stateLock) {
            if (generation != attempt || activeProvider != provider || callback != target) return;
        }
        if (target != null) target.onError(failure);
    }

    private boolean isStartedWithConnectedProvider(NativeBluetoothProvider provider, long attempt) {
        synchronized (stateLock) {
            return generation == attempt && started && connected
                    && activeProvider == provider && provider.isConnected();
        }
    }
    @Override
    public void disconnect() {
        final NativeBluetoothProvider provider;
        final TransportCallback target;
        final boolean wasStarted;
        synchronized (stateLock) {
            wasStarted = started;
            provider = activeProvider;
            target = callback;
            generation++;
            started = false;
            connected = false;
            activeProvider = null;
            callback = null;
        }
        if (provider != null) {
            try { provider.disconnect(); } catch (RuntimeException ignored) { }
        }
        if (wasStarted && target != null) target.onDisconnected("BLUETOOTH_DISCONNECTED");
    }

    @Override
    public boolean isConnected() {
        NativeBluetoothProvider provider = activeProvider;
        return connected && provider != null && provider.isConnected();
    }

    @Override
    public String getTransportType() {
        return "BLUETOOTH";
    }
}
