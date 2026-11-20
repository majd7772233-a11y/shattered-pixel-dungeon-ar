package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/** Owns Android runtime consent, paired-device enumeration and bounded Classic discovery. */
public final class AndroidBluetoothDeviceManager implements BluetoothDeviceAccess {

    private static final int REQUEST_PERMISSIONS = 0xB710;
    private static final int REQUEST_ENABLE = 0xB711;
    private static final int REQUEST_DISCOVERABLE = 0xB712;
    private static final int DISCOVERY_TIMEOUT_MS = 20000;
    private static final int MAX_DISCOVERABLE_SECONDS = 300;
    private static final String PREFS_NAME = "spd_bluetooth_permissions";

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final SharedPreferences permissionPrefs;

    private ResultCallback pendingAccess;
    private Mode pendingMode;
    private ResultCallback pendingDiscoverable;
    private String[] requestedPermissions;
    private final java.util.Set<String> previouslyAskedPermissions = new java.util.HashSet<>();
    private boolean scanning;
    private boolean disposed;
    private long discoveryGeneration;
    private BroadcastReceiver discoveryReceiver;
    private DiscoveryCallback discoveryCallback;
    private Runnable discoveryTimeout;

    public AndroidBluetoothDeviceManager(Activity activity) {
        if (activity == null) throw new IllegalArgumentException("BLUETOOTH_ACTIVITY_REQUIRED");
        this.activity = activity;
        this.permissionPrefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @Override
    public void prepare(final Mode mode, final ResultCallback callback) {
        if (mode == null || callback == null) throw new IllegalArgumentException("BLUETOOTH_CALLBACK_REQUIRED");
        runOnMain(new Runnable() {
            @Override public void run() {
                if (disposed || activity.isFinishing()) {
                    callback.onResult(false, "BLUETOOTH_ACTIVITY_UNAVAILABLE");
                    return;
                }
                if (pendingAccess != null || pendingDiscoverable != null) {
                    callback.onResult(false, "BLUETOOTH_ACTION_PENDING");
                    return;
                }
                if (getAdapter() == null) {
                    callback.onResult(false, "BLUETOOTH_UNAVAILABLE");
                    return;
                }
                pendingAccess = callback;
                pendingMode = mode;
                requestRequiredPermissions(mode);
            }
        });
    }

    private void requestRequiredPermissions(Mode mode) {
        List<String> required = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            required.add(Manifest.permission.BLUETOOTH_CONNECT);
            if (mode == Mode.DISCOVERY) required.add(Manifest.permission.BLUETOOTH_SCAN);
            else required.add(Manifest.permission.BLUETOOTH_ADVERTISE);
        } else if (mode == Mode.DISCOVERY && Build.VERSION.SDK_INT >= 23) {
            required.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }

        List<String> missing = new ArrayList<>();
        for (String permission : required) {
            if (!hasPermission(permission)) missing.add(permission);
        }
        if (missing.isEmpty()) {
            continueAfterPermissions();
            return;
        }

        requestedPermissions = missing.toArray(new String[0]);
        previouslyAskedPermissions.clear();
        for (String permission : requestedPermissions) {
            if (permissionPrefs.getBoolean(permissionKey(permission), false)) previouslyAskedPermissions.add(permission);
            permissionPrefs.edit().putBoolean(permissionKey(permission), true).apply();
        }
        try {
            activity.requestPermissions(requestedPermissions, REQUEST_PERMISSIONS);
        } catch (RuntimeException failure) {
            finishPendingAccess(false, "BLUETOOTH_PERMISSION_REQUEST_FAILED");
        }
    }

    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQUEST_PERMISSIONS || pendingAccess == null) return;
        boolean allGranted = true;
        boolean permanentDenial = false;
        String[] checked = requestedPermissions == null ? permissions : requestedPermissions;
        if (checked == null) checked = new String[0];
        for (String permission : checked) {
            if (!hasPermission(permission)) {
                allGranted = false;
                boolean askedBefore = previouslyAskedPermissions.contains(permission);
                boolean rationale = Build.VERSION.SDK_INT >= 23
                        && activity.shouldShowRequestPermissionRationale(permission);
                if (askedBefore && !rationale) permanentDenial = true;
            }
        }
        requestedPermissions = null;
        if (!allGranted) {
            finishPendingAccess(false, permanentDenial
                    ? "BLUETOOTH_PERMISSION_PERMANENTLY_DENIED" : "BLUETOOTH_PERMISSION_DENIED");
            return;
        }
        continueAfterPermissions();
    }

    private void continueAfterPermissions() {
        if (pendingAccess == null) return;
        if (pendingMode == Mode.DISCOVERY && Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT < 31
                && !isLegacyLocationEnabled()) {
            finishPendingAccess(false, "BLUETOOTH_LOCATION_REQUIRED");
            return;
        }
        try {
            BluetoothAdapter adapter = getAdapter();
            if (adapter == null) {
                finishPendingAccess(false, "BLUETOOTH_UNAVAILABLE");
            } else if (adapter.isEnabled()) {
                finishPendingAccess(true, null);
            } else {
                activity.startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQUEST_ENABLE);
            }
        } catch (SecurityException denied) {
            finishPendingAccess(false, "BLUETOOTH_PERMISSION_REQUIRED");
        } catch (RuntimeException failure) {
            finishPendingAccess(false, "BLUETOOTH_ENABLE_REQUEST_FAILED");
        }
    }

    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_ENABLE && pendingAccess != null) {
            boolean enabled = false;
            try {
                BluetoothAdapter adapter = getAdapter();
                enabled = resultCode == Activity.RESULT_OK && adapter != null && adapter.isEnabled();
            } catch (SecurityException ignored) { }
            finishPendingAccess(enabled, enabled ? null : "BLUETOOTH_ENABLE_CANCELLED");
        } else if (requestCode == REQUEST_DISCOVERABLE && pendingDiscoverable != null) {
            ResultCallback callback = pendingDiscoverable;
            pendingDiscoverable = null;
            boolean visible = resultCode > 0 && resultCode != Activity.RESULT_CANCELED;
            callback.onResult(visible, visible ? null : "BLUETOOTH_DISCOVERABILITY_CANCELLED");
        }
    }

    private void finishPendingAccess(boolean success, String errorCode) {
        ResultCallback callback = pendingAccess;
        pendingAccess = null;
        pendingMode = null;
        requestedPermissions = null;
        previouslyAskedPermissions.clear();
        if (callback != null) callback.onResult(success, errorCode);
    }

    @Override
    public List<BluetoothDeviceInfo> getPairedDevices() throws Exception {
        BluetoothAdapter adapter = getAdapter();
        if (adapter == null) throw new IllegalStateException("BLUETOOTH_UNAVAILABLE");
        if (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT) && Build.VERSION.SDK_INT >= 31) {
            throw new SecurityException("BLUETOOTH_PERMISSION_REQUIRED");
        }
        try {
            Set<BluetoothDevice> paired = adapter.getBondedDevices();
            if (paired == null || paired.isEmpty()) return Collections.emptyList();
            List<BluetoothDeviceInfo> result = new ArrayList<>(paired.size());
            for (BluetoothDevice device : paired) {
                BluetoothDeviceInfo info = toInfo(device, true);
                if (info != null) result.add(info);
            }
            return result;
        } catch (SecurityException denied) {
            throw new SecurityException("BLUETOOTH_PERMISSION_REQUIRED", denied);
        }
    }

    @Override
    public void startDiscovery(final DiscoveryCallback callback) throws Exception {
        if (callback == null) throw new IllegalArgumentException("BLUETOOTH_CALLBACK_REQUIRED");
        if (Looper.myLooper() == Looper.getMainLooper()) {
            startDiscoveryOnMain(callback);
        } else {
            main.post(new Runnable() {
                @Override public void run() { startDiscoveryOnMain(callback); }
            });
        }
    }

    private void startDiscoveryOnMain(final DiscoveryCallback callback) {
        if (disposed) {
            callback.onDiscoveryFinished("BLUETOOTH_ACTIVITY_UNAVAILABLE");
            return;
        }
        final BluetoothAdapter adapter = getAdapter();
        if (adapter == null) {
            callback.onDiscoveryFinished("BLUETOOTH_UNAVAILABLE");
            return;
        }
        if (Build.VERSION.SDK_INT >= 31 && !hasPermission(Manifest.permission.BLUETOOTH_SCAN)) {
            callback.onDiscoveryFinished("BLUETOOTH_PERMISSION_REQUIRED");
            return;
        }
        try {
            if (!adapter.isEnabled()) {
                callback.onDiscoveryFinished("BLUETOOTH_DISABLED");
                return;
            }
            stopDiscoveryInternal();
            final long attempt = ++discoveryGeneration;
            discoveryCallback = callback;
            scanning = true;

            IntentFilter filter = new IntentFilter();
            filter.addAction(BluetoothDevice.ACTION_FOUND);
            filter.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
            filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
            filter.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
            discoveryReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    if (intent == null || attempt != discoveryGeneration || !scanning) return;
                    String action = intent.getAction();
                    if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                        BluetoothDevice device = getDeviceExtra(intent);
                        BluetoothDeviceInfo info = toInfo(device, isBonded(device));
                        if (info != null && discoveryCallback != null) discoveryCallback.onDeviceFound(info);
                    } else if (BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(action)) {
                        BluetoothDevice device = getDeviceExtra(intent);
                        if (device != null) {
                            int state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR);
                            if (state == BluetoothDevice.BOND_NONE) {
                                if (discoveryCallback != null) discoveryCallback.onDeviceRemoved(safeAddress(device));
                            } else if (state == BluetoothDevice.BOND_BONDED) {
                                BluetoothDeviceInfo info = toInfo(device, true);
                                if (info != null && discoveryCallback != null) discoveryCallback.onDeviceFound(info);
                            }
                        }
                    } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                        finishDiscovery(attempt, null, false);
                    } else if (BluetoothAdapter.ACTION_STATE_CHANGED.equals(action)) {
                        int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
                        if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                            finishDiscovery(attempt, "BLUETOOTH_DISABLED", true);
                        }
                    }
                }
            };
            if (Build.VERSION.SDK_INT >= 33) {
                // Bluetooth discovery/state broadcasts are emitted by the privileged Bluetooth app, not always the system UID.
                // Android requires EXPORTED to receive broadcasts from these framework companion apps.
                activity.registerReceiver(discoveryReceiver, filter, Context.RECEIVER_EXPORTED);
            } else {
                activity.registerReceiver(discoveryReceiver, filter);
            }
            discoveryTimeout = new Runnable() {
                @Override public void run() { finishDiscovery(attempt, null, true); }
            };
            main.postDelayed(discoveryTimeout, DISCOVERY_TIMEOUT_MS);
            adapter.cancelDiscovery();
            if (!adapter.startDiscovery()) finishDiscovery(attempt, "BLUETOOTH_DISCOVERY_START_FAILED", true);
        } catch (SecurityException denied) {
            if (scanning) finishCurrentDiscovery("BLUETOOTH_PERMISSION_REQUIRED");
            else callback.onDiscoveryFinished("BLUETOOTH_PERMISSION_REQUIRED");
        } catch (RuntimeException failure) {
            if (scanning) finishCurrentDiscovery("BLUETOOTH_DISCOVERY_START_FAILED");
            else callback.onDiscoveryFinished("BLUETOOTH_DISCOVERY_START_FAILED");
        }
    }

    @Override
    public void cancelDiscovery() {
        runOnMain(new Runnable() {
            @Override public void run() { stopDiscoveryInternal(); }
        });
    }

    private void finishDiscovery(long attempt, String errorCode, boolean cancelAdapter) {
        if (attempt != discoveryGeneration || !scanning) return;
        scanning = false;
        discoveryGeneration++;
        if (discoveryTimeout != null) main.removeCallbacks(discoveryTimeout);
        discoveryTimeout = null;
        unregisterDiscoveryReceiver();
        DiscoveryCallback callback = discoveryCallback;
        discoveryCallback = null;
        if (cancelAdapter) cancelAdapterDiscovery();
        if (callback != null) callback.onDiscoveryFinished(errorCode);
    }

    private void finishCurrentDiscovery(String errorCode) {
        long attempt = discoveryGeneration;
        if (scanning) finishDiscovery(attempt, errorCode, true);
    }

    private void stopDiscoveryInternal() {
        discoveryGeneration++;
        boolean wasScanning = scanning;
        scanning = false;
        if (discoveryTimeout != null) main.removeCallbacks(discoveryTimeout);
        discoveryTimeout = null;
        unregisterDiscoveryReceiver();
        discoveryCallback = null;
        if (wasScanning) cancelAdapterDiscovery();
    }

    private void cancelAdapterDiscovery() {
        try {
            BluetoothAdapter adapter = getAdapter();
            if (adapter != null && adapter.isEnabled()
                    && (Build.VERSION.SDK_INT < 31 || hasPermission(Manifest.permission.BLUETOOTH_SCAN))) {
                adapter.cancelDiscovery();
            }
        } catch (SecurityException ignored) { }
    }

    private void unregisterDiscoveryReceiver() {
        BroadcastReceiver receiver = discoveryReceiver;
        discoveryReceiver = null;
        if (receiver != null) {
            try { activity.unregisterReceiver(receiver); }
            catch (IllegalArgumentException ignored) { }
        }
    }

    @Override
    public void requestDiscoverable(final int durationSeconds, final ResultCallback callback) {
        if (callback == null) throw new IllegalArgumentException("BLUETOOTH_CALLBACK_REQUIRED");
        runOnMain(new Runnable() {
            @Override public void run() {
                if (disposed || activity.isFinishing()) {
                    callback.onResult(false, "BLUETOOTH_ACTIVITY_UNAVAILABLE");
                    return;
                }
                if (pendingAccess != null || pendingDiscoverable != null) {
                    callback.onResult(false, "BLUETOOTH_ACTION_PENDING");
                    return;
                }
                if (Build.VERSION.SDK_INT >= 31 && !hasPermission(Manifest.permission.BLUETOOTH_ADVERTISE)) {
                    callback.onResult(false, "BLUETOOTH_PERMISSION_REQUIRED");
                    return;
                }
                int duration = Math.max(60, Math.min(MAX_DISCOVERABLE_SECONDS, durationSeconds));
                pendingDiscoverable = callback;
                Intent intent = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
                intent.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, duration);
                try {
                    activity.startActivityForResult(intent, REQUEST_DISCOVERABLE);
                } catch (RuntimeException failure) {
                    pendingDiscoverable = null;
                    callback.onResult(false, "BLUETOOTH_DISCOVERABILITY_REQUEST_FAILED");
                }
            }
        });
    }

    public void dispose() {
        runOnMain(new Runnable() {
            @Override public void run() {
                disposed = true;
                stopDiscoveryInternal();
                pendingAccess = null;
                pendingDiscoverable = null;
                requestedPermissions = null;
            }
        });
    }

    private boolean isLegacyLocationEnabled() {
        try {
            Object service = activity.getSystemService(Context.LOCATION_SERVICE);
            if (!(service instanceof LocationManager)) return false;
            LocationManager location = (LocationManager) service;
            if (Build.VERSION.SDK_INT >= 28) return location.isLocationEnabled();
            return location.isProviderEnabled(LocationManager.GPS_PROVIDER)
                    || location.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (RuntimeException unavailable) {
            return false;
        }
    }
    private BluetoothAdapter getAdapter() {
        try {
            Object service = activity.getSystemService(Context.BLUETOOTH_SERVICE);
            if (service instanceof BluetoothManager) return ((BluetoothManager) service).getAdapter();
            return BluetoothAdapter.getDefaultAdapter();
        } catch (RuntimeException unavailable) {
            return null;
        }
    }

    private boolean hasPermission(String permission) {
        return Build.VERSION.SDK_INT < 23
                || activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private static String permissionKey(String permission) {
        return "requested_" + permission;
    }

    private static BluetoothDevice getDeviceExtra(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
            }
            //noinspection deprecation
            return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
        } catch (RuntimeException denied) {
            return null;
        }
    }

    private static BluetoothDeviceInfo toInfo(BluetoothDevice device, boolean paired) {
        if (device == null || !supportsClassicRfcomm(device)) return null;
        try {
            String address = device.getAddress();
            String name = device.getName();
            return new BluetoothDeviceInfo(name, address, paired);
        } catch (SecurityException | IllegalArgumentException denied) {
            return null;
        }
    }

    private static boolean supportsClassicRfcomm(BluetoothDevice device) {
        try {
            int type = device.getType();
            return type == BluetoothDevice.DEVICE_TYPE_CLASSIC || type == BluetoothDevice.DEVICE_TYPE_DUAL;
        } catch (SecurityException denied) {
            return false;
        }
    }
    private static boolean isBonded(BluetoothDevice device) {
        try { return device != null && device.getBondState() == BluetoothDevice.BOND_BONDED; }
        catch (SecurityException denied) { return false; }
    }
    private static String safeAddress(BluetoothDevice device) {
        try { return device.getAddress(); }
        catch (SecurityException denied) { return null; }
    }

    private void runOnMain(Runnable runnable) {
        if (Looper.myLooper() == Looper.getMainLooper()) runnable.run();
        else main.post(runnable);
    }
}