package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

public class BluetoothDeviceInfoTest {

    @Test
    public void normalizesMacAndSanitizesUntrustedDisplayName() {
        BluetoothDeviceInfo device = new BluetoothDeviceInfo("  Phone\u0001\n  Name  ", "aa:bb:cc:dd:ee:ff", false);
        Assert.assertEquals("AA:BB:CC:DD:EE:FF", device.getAddress());
        Assert.assertEquals("Phone  Name", device.getName());
        Assert.assertEquals("Phone  Name", device.displayName());
        Assert.assertFalse(device.isPaired());
    }

    @Test
    public void missingNameFallsBackToAddressAndInvalidMacIsRejected() {
        BluetoothDeviceInfo unnamed = new BluetoothDeviceInfo(null, "01:23:45:67:89:ab", true);
        Assert.assertEquals("01:23:45:67:89:AB", unnamed.displayName());
        Assert.assertTrue(unnamed.isPaired());
        try {
            new BluetoothDeviceInfo("bad", "not-a-mac", false);
            Assert.fail("Malformed Bluetooth addresses must be rejected");
        } catch (IllegalArgumentException expected) {
            Assert.assertEquals("BLUETOOTH_DEVICE_ADDRESS_INVALID", expected.getMessage());
        }
    }
}