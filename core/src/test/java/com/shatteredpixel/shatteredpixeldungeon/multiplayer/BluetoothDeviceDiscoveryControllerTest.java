package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class BluetoothDeviceDiscoveryControllerTest {

    @Test
    public void permissionDenialDoesNotStartDiscoveryOrCreateDevices() {
        FakeAccess access = new FakeAccess();
        access.prepareSuccess = false;
        access.prepareError = "BLUETOOTH_PERMISSION_DENIED";
        BluetoothDeviceDiscoveryController controller = new BluetoothDeviceDiscoveryController(access);
        RecordingListener listener = new RecordingListener();

        controller.start(listener);

        Assert.assertEquals(0, access.discoveryStarts);
        Assert.assertEquals(BluetoothDeviceDiscoveryController.State.FAILED, controller.getState());
        Assert.assertEquals("BLUETOOTH_PERMISSION_DENIED", listener.errorCode);
        Assert.assertTrue(controller.getDevices().isEmpty());
    }

    @Test
    public void cancelledPermissionFlowCannotStartGhostDiscovery() {
        FakeAccess access = new FakeAccess();
        access.deferPrepare = true;
        BluetoothDeviceDiscoveryController controller = new BluetoothDeviceDiscoveryController(access);
        RecordingListener listener = new RecordingListener();

        controller.start(listener);
        Assert.assertEquals(BluetoothDeviceDiscoveryController.State.PREPARING, controller.getState());
        controller.cancel();
        access.pendingPrepare.onResult(true, null);

        Assert.assertEquals(0, access.discoveryStarts);
        Assert.assertEquals(2, access.discoveryCancels);
        Assert.assertEquals(BluetoothDeviceDiscoveryController.State.CANCELLED, controller.getState());
        Assert.assertTrue(listener.cancelled);
    }

    @Test
    public void mergesPairedAndDiscoveredDevicesAndKeepsPairedEntryCanonical() {
        FakeAccess access = new FakeAccess();
        access.paired = Collections.singletonList(device("Known", "AA:BB:CC:DD:EE:01", true));
        BluetoothDeviceDiscoveryController controller = new BluetoothDeviceDiscoveryController(access);
        RecordingListener listener = new RecordingListener();

        controller.start(listener);
        access.discovery.onDeviceFound(device("Renamed", "aa:bb:cc:dd:ee:01", false));
        access.discovery.onDeviceFound(device("Nearby", "AA:BB:CC:DD:EE:02", false));

        List<BluetoothDeviceInfo> devices = controller.getDevices();
        Assert.assertEquals(2, devices.size());
        Assert.assertEquals("AA:BB:CC:DD:EE:01", devices.get(0).getAddress());
        Assert.assertTrue(devices.get(0).isPaired());
        Assert.assertEquals("Known", devices.get(0).getName());
        Assert.assertEquals("Nearby", devices.get(1).getName());
        Assert.assertEquals("AA:BB:CC:DD:EE:01", controller.select("aa:bb:cc:dd:ee:01").getAddress());
    }

    @Test
    public void cancelFencesLateDiscoveryAndDoesNotRepopulateTheList() {
        FakeAccess access = new FakeAccess();
        BluetoothDeviceDiscoveryController controller = new BluetoothDeviceDiscoveryController(access);
        RecordingListener listener = new RecordingListener();
        controller.start(listener);
        BluetoothDeviceAccess.DiscoveryCallback stale = access.discovery;

        controller.cancel();
        stale.onDeviceFound(device("Late", "AA:BB:CC:DD:EE:03", false));
        stale.onDiscoveryFinished(null);

        Assert.assertTrue(controller.getDevices().isEmpty());
        Assert.assertEquals(BluetoothDeviceDiscoveryController.State.CANCELLED, controller.getState());
        Assert.assertEquals(1, listener.finishCalls);
        Assert.assertTrue(listener.cancelled);
    }

    @Test
    public void selectedDeviceRemovalClearsSelectionAndReportsDisappearance() {
        FakeAccess access = new FakeAccess();
        access.paired = Collections.singletonList(device("Paired", "AA:BB:CC:DD:EE:04", true));
        BluetoothDeviceDiscoveryController controller = new BluetoothDeviceDiscoveryController(access);
        RecordingListener listener = new RecordingListener();
        controller.start(listener);
        controller.select("AA:BB:CC:DD:EE:04");

        access.discovery.onDeviceRemoved("aa:bb:cc:dd:ee:04");

        Assert.assertNull(controller.getSelectedDevice());
        Assert.assertEquals("AA:BB:CC:DD:EE:04", listener.lostAddress);
        Assert.assertTrue(controller.getDevices().isEmpty());
        try {
            controller.select("AA:BB:CC:DD:EE:04");
            Assert.fail("A disappeared device must not remain selectable");
        } catch (IllegalStateException expected) {
            Assert.assertEquals("BLUETOOTH_DEVICE_NOT_FOUND", expected.getMessage());
        }
    }

    @Test
    public void discoveryFailureIsSurfacedWithoutPretendingTheSearchCompleted() {
        FakeAccess access = new FakeAccess();
        BluetoothDeviceDiscoveryController controller = new BluetoothDeviceDiscoveryController(access);
        RecordingListener listener = new RecordingListener();
        controller.start(listener);
        access.discovery.onDiscoveryFinished("BLUETOOTH_DISCOVERY_START_FAILED");

        Assert.assertEquals(BluetoothDeviceDiscoveryController.State.FAILED, controller.getState());
        Assert.assertEquals("BLUETOOTH_DISCOVERY_START_FAILED", listener.errorCode);
        Assert.assertFalse(listener.cancelled);
    }

    @Test
    public void restartingSearchFencesCallbacksFromThePreviousAttempt() {
        FakeAccess access = new FakeAccess();
        BluetoothDeviceDiscoveryController controller = new BluetoothDeviceDiscoveryController(access);
        RecordingListener first = new RecordingListener();
        RecordingListener second = new RecordingListener();
        controller.start(first);
        BluetoothDeviceAccess.DiscoveryCallback stale = access.discovery;
        controller.start(second);
        stale.onDeviceFound(device("Stale", "AA:BB:CC:DD:EE:05", false));
        access.discovery.onDeviceFound(device("Current", "AA:BB:CC:DD:EE:06", false));

        Assert.assertEquals(0, first.finishCalls);
        Assert.assertEquals(1, controller.getDevices().size());
        Assert.assertEquals("Current", controller.getDevices().get(0).getName());
    }

    @Test
    public void pairedDeviceCatalogueIsBoundedToThirtyTwoEntries() {
        FakeAccess access = new FakeAccess();
        for (int i = 0; i < 40; i++) {
            access.paired.add(device("Peer " + i, String.format(java.util.Locale.ROOT,
                    "AA:BB:CC:DD:%02X:%02X", (i / 256) & 255, i & 255), true));
        }
        BluetoothDeviceDiscoveryController controller = new BluetoothDeviceDiscoveryController(access);
        controller.start(new RecordingListener());
        Assert.assertEquals(32, controller.getDevices().size());
    }
    private static BluetoothDeviceInfo device(String name, String address, boolean paired) {
        return new BluetoothDeviceInfo(name, address, paired);
    }

    private static final class FakeAccess implements BluetoothDeviceAccess {
        boolean prepareSuccess = true;
        boolean deferPrepare;
        String prepareError;
        int discoveryStarts;
        int discoveryCancels;
        ResultCallback pendingPrepare;
        DiscoveryCallback discovery;
        List<BluetoothDeviceInfo> paired = new ArrayList<>();

        @Override public void prepare(Mode mode, ResultCallback callback) {
            if (deferPrepare) pendingPrepare = callback;
            else callback.onResult(prepareSuccess, prepareError);
        }
        @Override public List<BluetoothDeviceInfo> getPairedDevices() { return paired; }
        @Override public void startDiscovery(DiscoveryCallback callback) {
            discoveryStarts++;
            discovery = callback;
        }
        @Override public void cancelDiscovery() { discoveryCancels++; }
        @Override public void requestDiscoverable(int durationSeconds, ResultCallback callback) {
            callback.onResult(true, null);
        }
    }

    private static final class RecordingListener implements BluetoothDeviceDiscoveryController.Listener {
        int finishCalls;
        boolean cancelled;
        String errorCode;
        String lostAddress;
        List<BluetoothDeviceInfo> lastDevices = Arrays.asList();
        @Override public void onDevicesChanged(List<BluetoothDeviceInfo> devices) { lastDevices = devices; }
        @Override public void onDiscoveryFinished(boolean cancelled, String errorCode) {
            finishCalls++;
            this.cancelled = cancelled;
            this.errorCode = errorCode;
        }
        @Override public void onSelectedDeviceLost(String address) { lostAddress = address; }
    }
}