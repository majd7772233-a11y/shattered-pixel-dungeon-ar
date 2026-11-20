package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Generation-fenced Bluetooth discovery and selection flow, independent of Android framework APIs. */
public final class BluetoothDeviceDiscoveryController {
    private static final int MAX_DEVICES = 32;
    public enum State { IDLE, PREPARING, DISCOVERING, COMPLETE, CANCELLED, FAILED }

    public interface Listener {
        void onDevicesChanged(List<BluetoothDeviceInfo> devices);
        void onDiscoveryFinished(boolean cancelled, String errorCode);
        void onSelectedDeviceLost(String address);
    }

    private final Object lock = new Object();
    private final BluetoothDeviceAccess access;
    private final Map<String, BluetoothDeviceInfo> devices = new LinkedHashMap<>();
    private long generation;
    private State state = State.IDLE;
    private Listener listener;
    private String selectedAddress;

    public BluetoothDeviceDiscoveryController(BluetoothDeviceAccess access) {
        if (access == null) throw new IllegalArgumentException("BLUETOOTH_UNAVAILABLE");
        this.access = access;
    }

    public void start(final Listener target) {
        if (target == null) throw new IllegalArgumentException("BLUETOOTH_CALLBACK_REQUIRED");
        final long attempt;
        synchronized (lock) {
            generation++;
            attempt = generation;
            state = State.PREPARING;
            listener = target;
            devices.clear();
            selectedAddress = null;
        }
        access.cancelDiscovery();
        access.prepare(BluetoothDeviceAccess.Mode.DISCOVERY, new BluetoothDeviceAccess.ResultCallback() {
            @Override public void onResult(boolean success, String errorCode) {
                if (!isCurrent(attempt, State.PREPARING)) return;
                if (!success) {
                    fail(attempt, errorCode == null ? "BLUETOOTH_PERMISSION_DENIED" : errorCode);
                    return;
                }
                loadPairedAndDiscover(attempt);
            }
        });
    }

    private void loadPairedAndDiscover(final long attempt) {
        final List<BluetoothDeviceInfo> paired;
        try {
            List<BluetoothDeviceInfo> source = access.getPairedDevices();
            paired = source == null ? Collections.<BluetoothDeviceInfo>emptyList() : new ArrayList<>(source);
        } catch (Exception failure) {
            fail(attempt, failure.getMessage() == null ? "BLUETOOTH_DEVICE_LIST_FAILED" : failure.getMessage());
            return;
        }

        Listener notify;
        List<BluetoothDeviceInfo> snapshot;
        synchronized (lock) {
            if (generation != attempt || state != State.PREPARING) return;
            for (BluetoothDeviceInfo device : paired) putDeviceLocked(device);
            state = State.DISCOVERING;
            notify = listener;
            snapshot = snapshotLocked();
        }
        notifyDevices(notify, snapshot);

        try {
            access.startDiscovery(new BluetoothDeviceAccess.DiscoveryCallback() {
                @Override public void onDeviceFound(BluetoothDeviceInfo device) { updateDevice(attempt, device); }
                @Override public void onDeviceRemoved(String address) { removeDevice(attempt, address); }
                @Override public void onDiscoveryFinished(String errorCode) { finish(attempt, errorCode); }
            });
        } catch (Exception failure) {
            fail(attempt, failure.getMessage() == null ? "BLUETOOTH_DISCOVERY_START_FAILED" : failure.getMessage());
        }
    }

    public void cancel() {
        final Listener notify;
        synchronized (lock) {
            if (state != State.PREPARING && state != State.DISCOVERING) return;
            generation++;
            state = State.CANCELLED;
            notify = listener;
            listener = null;
        }
        access.cancelDiscovery();
        if (notify != null) notify.onDiscoveryFinished(true, null);
    }

    /** Silent lifecycle cleanup; stale platform callbacks are fenced without touching a destroyed scene. */
    public void dispose() {
        synchronized (lock) {
            generation++;
            state = State.CANCELLED;
            listener = null;
            selectedAddress = null;
            devices.clear();
        }
        access.cancelDiscovery();
    }

    public BluetoothDeviceInfo select(String address) {
        synchronized (lock) {
            BluetoothDeviceInfo selected = address == null ? null
                    : devices.get(address.trim().toUpperCase(Locale.ROOT));
            if (selected == null) throw new IllegalStateException("BLUETOOTH_DEVICE_NOT_FOUND");
            selectedAddress = selected.getAddress();
            return selected;
        }
    }

    public BluetoothDeviceInfo getSelectedDevice() {
        synchronized (lock) { return selectedAddress == null ? null : devices.get(selectedAddress); }
    }

    public List<BluetoothDeviceInfo> getDevices() {
        synchronized (lock) { return snapshotLocked(); }
    }

    public State getState() {
        synchronized (lock) { return state; }
    }

    private void updateDevice(long attempt, BluetoothDeviceInfo device) {
        if (device == null) return;
        final Listener notify;
        final List<BluetoothDeviceInfo> snapshot;
        synchronized (lock) {
            if (generation != attempt || state != State.DISCOVERING) return;
            putDeviceLocked(device);
            notify = listener;
            snapshot = snapshotLocked();
        }
        notifyDevices(notify, snapshot);
    }

    private void removeDevice(long attempt, String address) {
        if (address == null) return;
        final Listener notify;
        final List<BluetoothDeviceInfo> snapshot;
        final boolean selectedLost;
        final String normalized = address.trim().toUpperCase(Locale.ROOT);
        synchronized (lock) {
            if (generation != attempt || state != State.DISCOVERING) return;
            devices.remove(normalized);
            selectedLost = normalized.equals(selectedAddress);
            if (selectedLost) selectedAddress = null;
            notify = listener;
            snapshot = snapshotLocked();
        }
        notifyDevices(notify, snapshot);
        if (selectedLost && notify != null) notify.onSelectedDeviceLost(normalized);
    }

    private void finish(long attempt, String errorCode) {
        final Listener notify;
        synchronized (lock) {
            if (generation != attempt || state != State.DISCOVERING) return;
            state = errorCode == null ? State.COMPLETE : State.FAILED;
            notify = listener;
            listener = null;
        }
        if (notify != null) notify.onDiscoveryFinished(false, errorCode);
    }

    private void fail(long attempt, String errorCode) {
        final Listener notify;
        synchronized (lock) {
            if (generation != attempt || (state != State.PREPARING && state != State.DISCOVERING)) return;
            state = State.FAILED;
            notify = listener;
            listener = null;
        }
        if (notify != null) notify.onDiscoveryFinished(false, errorCode);
    }

    private boolean isCurrent(long attempt, State expected) {
        synchronized (lock) { return generation == attempt && state == expected; }
    }

    private void putDeviceLocked(BluetoothDeviceInfo device) {
        if (device == null) return;
        String key = device.getAddress().toUpperCase(Locale.ROOT);
        BluetoothDeviceInfo previous = devices.get(key);
        if (previous == null && devices.size() >= MAX_DEVICES) return;
        if (previous != null && previous.isPaired() && !device.isPaired()) return;
        devices.put(key, device);
    }

    private List<BluetoothDeviceInfo> snapshotLocked() {
        List<BluetoothDeviceInfo> result = new ArrayList<>(devices.values());
        Collections.sort(result, new Comparator<BluetoothDeviceInfo>() {
            @Override public int compare(BluetoothDeviceInfo first, BluetoothDeviceInfo second) {
                if (first.isPaired() != second.isPaired()) return first.isPaired() ? -1 : 1;
                int byName = first.displayName().compareToIgnoreCase(second.displayName());
                return byName != 0 ? byName : first.getAddress().compareTo(second.getAddress());
            }
        });
        return Collections.unmodifiableList(result);
    }

    private static void notifyDevices(Listener notify, List<BluetoothDeviceInfo> devices) {
        if (notify != null) notify.onDevicesChanged(devices);
    }
}