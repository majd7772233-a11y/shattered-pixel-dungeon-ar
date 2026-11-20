package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.Assert;
import org.junit.Test;

import java.util.Collections;
import java.util.List;

public class BluetoothHostPreparationControllerTest {

    @Test
    public void permissionDenialNeverRequestsVisibilityOrStartsHost() {
        FakeAccess access = new FakeAccess();
        access.prepareSuccess = false;
        access.prepareError = "BLUETOOTH_PERMISSION_DENIED";
        Result result = new Result();
        BluetoothHostPreparationController.requestVisibility(access, 300, result);
        Assert.assertEquals(0, access.visibilityRequests);
        Assert.assertFalse(result.success);
        Assert.assertEquals("BLUETOOTH_PERMISSION_DENIED", result.error);
    }

    @Test
    public void rejectedSystemDiscoverabilityDoesNotReportHostReady() {
        FakeAccess access = new FakeAccess();
        access.visibilitySuccess = false;
        Result result = new Result();
        BluetoothHostPreparationController.requestVisibility(access, 600, result);
        Assert.assertEquals(1, access.visibilityRequests);
        Assert.assertEquals(300, access.requestedDuration);
        Assert.assertFalse(result.success);
        Assert.assertEquals("BLUETOOTH_DISCOVERABILITY_CANCELLED", result.error);
    }

    @Test
    public void hostReadyIsReportedOnlyAfterPermissionAndVisibilityAreGranted() {
        FakeAccess access = new FakeAccess();
        Result result = new Result();
        BluetoothHostPreparationController.requestVisibility(access, 30, result);
        Assert.assertEquals(1, access.visibilityRequests);
        Assert.assertEquals(60, access.requestedDuration);
        Assert.assertTrue(result.success);
        Assert.assertNull(result.error);
    }

    @Test
    public void destroyedSetupSceneCannotRequestDiscoverabilityAfterPermissionReturns() {
        FakeAccess access = new FakeAccess();
        Result result = new Result();
        BluetoothHostPreparationController.requestVisibility(access, 300,
                new BluetoothHostPreparationController.ContinueCheck() {
                    @Override public boolean shouldContinue() { return false; }
                }, result);
        Assert.assertEquals(0, access.visibilityRequests);
        Assert.assertFalse(result.success);
        Assert.assertEquals("BLUETOOTH_HOST_PREPARATION_CANCELLED", result.error);
    }

    @Test
    public void missingPlatformProviderFailsClosed() {
        Result result = new Result();
        BluetoothHostPreparationController.requestVisibility(null, 300, result);
        Assert.assertFalse(result.success);
        Assert.assertEquals("BLUETOOTH_UNAVAILABLE", result.error);
    }

    private static final class Result implements BluetoothDeviceAccess.ResultCallback {
        boolean success;
        String error;
        @Override public void onResult(boolean success, String errorCode) {
            this.success = success;
            this.error = errorCode;
        }
    }

    private static final class FakeAccess implements BluetoothDeviceAccess {
        boolean prepareSuccess = true;
        String prepareError;
        boolean visibilitySuccess = true;
        int visibilityRequests;
        int requestedDuration;
        @Override public void prepare(Mode mode, ResultCallback callback) {
            Assert.assertEquals(Mode.HOST_VISIBILITY, mode);
            callback.onResult(prepareSuccess, prepareError);
        }
        @Override public List<BluetoothDeviceInfo> getPairedDevices() { return Collections.emptyList(); }
        @Override public void startDiscovery(DiscoveryCallback callback) { throw new AssertionError("Host must not scan"); }
        @Override public void cancelDiscovery() { }
        @Override public void requestDiscoverable(int durationSeconds, ResultCallback callback) {
            visibilityRequests++;
            requestedDuration = durationSeconds;
            callback.onResult(visibilitySuccess, visibilitySuccess ? null : "BLUETOOTH_DISCOVERABILITY_CANCELLED");
        }
    }
}