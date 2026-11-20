package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

/** Application-scoped registration point for the Android Bluetooth device-access implementation. */
public final class BluetoothDeviceAccessRegistry {
    private static volatile BluetoothDeviceAccess provider;
    private BluetoothDeviceAccessRegistry() { }
    public static void set(BluetoothDeviceAccess access) { provider = access; }
    public static BluetoothDeviceAccess get() { return provider; }
}