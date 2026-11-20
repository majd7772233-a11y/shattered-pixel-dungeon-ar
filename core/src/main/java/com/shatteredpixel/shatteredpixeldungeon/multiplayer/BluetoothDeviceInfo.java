package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

/** Minimal platform-neutral description of a Bluetooth Classic peer. */
public final class BluetoothDeviceInfo {
    private final String name;
    private final String address;
    private final boolean paired;

    public BluetoothDeviceInfo(String name, String address, boolean paired) {
        if (address == null || !address.matches("(?i)^[0-9a-f]{2}(:[0-9a-f]{2}){5}$")) {
            throw new IllegalArgumentException("BLUETOOTH_DEVICE_ADDRESS_INVALID");
        }
        this.name = sanitizeName(name);
        this.address = address.toUpperCase(java.util.Locale.ROOT);
        this.paired = paired;
    }

    public String getName() { return name; }
    public String getAddress() { return address; }
    public boolean isPaired() { return paired; }
    public String displayName() { return name.isEmpty() ? address : name; }

    private static String sanitizeName(String value) {
        if (value == null) return "";
        StringBuilder result = new StringBuilder(Math.min(value.length(), 64));
        for (int i = 0; i < value.length() && result.length() < 64; i++) {
            char c = value.charAt(i);
            if (!Character.isISOControl(c)) result.append(c);
        }
        return result.toString().trim();
    }
}