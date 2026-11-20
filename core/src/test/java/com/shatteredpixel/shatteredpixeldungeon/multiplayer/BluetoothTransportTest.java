package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import org.junit.After;
import org.junit.Assert;
import org.junit.Test;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class BluetoothTransportTest {

    @After
    public void clearProvider() {
        BluetoothTransport.setNativeProvider(null);
    }

    @Test
    public void missingProviderIsUnavailableAndNeverReportsSuccess() throws Exception {
        BluetoothTransport.setNativeProvider(null);
        BluetoothTransport transport = new BluetoothTransport();
        try {
            transport.connect(BluetoothTransport.SERVER_ENDPOINT, callback());
            Assert.fail("A missing native provider is not a connection");
        } catch (IllegalStateException expected) {
            Assert.assertEquals("BLUETOOTH_UNAVAILABLE", expected.getMessage());
        }
        Assert.assertFalse(transport.isConnected());
    }

    @Test
    public void hostWaitsForAcceptedSocketBeforeConnectedCallback() throws Exception {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        RecordingCallback callback = new RecordingCallback();

        transport.connect(BluetoothTransport.SERVER_ENDPOINT, callback);
        Assert.assertEquals(1, provider.serverStarts);
        Assert.assertEquals(BluetoothTransport.SPD_MULTIPLAYER_UUID, provider.serverUuid);
        Assert.assertEquals(0, callback.connected);
        Assert.assertFalse(transport.isConnected());

        provider.completeConnection();
        Assert.assertEquals(1, callback.connected);
        Assert.assertTrue(transport.isConnected());
    }

    @Test
    public void guestUsesValidatedMacAddressAndSharedServiceUuid() throws Exception {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        transport.connect("a1:b2:c3:d4:e5:f6", callback());
        Assert.assertEquals(1, provider.deviceConnects);
        Assert.assertEquals("A1:B2:C3:D4:E5:F6", provider.deviceAddress);
        Assert.assertEquals(BluetoothTransport.SPD_MULTIPLAYER_UUID, provider.deviceUuid);
        Assert.assertFalse(transport.isConnected());
        provider.completeConnection();
        Assert.assertTrue(transport.isConnected());
    }

    @Test
    public void rejectsMalformedMacAddressBeforeProviderInvocation() throws Exception {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        try {
            new BluetoothTransport().connect("not-a-device", callback());
            Assert.fail("Malformed Bluetooth address must be rejected");
        } catch (IllegalArgumentException expected) {
            Assert.assertEquals("BLUETOOTH_DEVICE_ADDRESS_INVALID", expected.getMessage());
        }
        Assert.assertEquals(0, provider.deviceConnects);
    }

    @Test
    public void sendingBeforeSocketReadyReportsErrorAndDoesNotWrite() throws Exception {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        RecordingCallback callback = new RecordingCallback();
        transport.connect("AA:BB:CC:DD:EE:FF", callback);

        transport.send(new NetworkMessage(MessageType.CHAT, "{\"text\":\"early\"}"));
        Assert.assertEquals(1, callback.errors);
        Assert.assertEquals(0, provider.sentFrames);
        Assert.assertFalse(transport.isConnected());
    }

    @Test
    public void sendsCanonicalBoundedUtf8EnvelopeOnlyAfterSocketReady() throws Exception {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        transport.connect("AA:BB:CC:DD:EE:FF", callback());
        provider.completeConnection();

        NetworkMessage message = new NetworkMessage(MessageType.CHAT, "{\"text\":\"مرحبا\"}");
        message.senderId = "guest-id";
        transport.send(message);

        Assert.assertEquals(1, provider.sentFrames);
        Assert.assertTrue(provider.lastFrame.endsWith("\n"));
        NetworkMessage parsed = NetworkMessage.parseBluetoothJson(
                provider.lastFrame.substring(0, provider.lastFrame.length() - 1));
        Assert.assertNotNull(parsed);
        Assert.assertEquals(MessageType.CHAT, parsed.messageType);
        Assert.assertEquals("guest-id", parsed.senderId);
    }

    @Test
    public void providerCannotClaimConnectedWithoutAnActiveSocket() throws Exception {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        RecordingCallback callback = new RecordingCallback();
        transport.connect(BluetoothTransport.SERVER_ENDPOINT, callback);

        provider.callback.onConnected();

        Assert.assertEquals(0, callback.connected);
        Assert.assertEquals(1, callback.errors);
        Assert.assertEquals("BLUETOOTH_PROVIDER_NOT_CONNECTED", callback.lastError.getMessage());
        Assert.assertFalse(transport.isConnected());
        Assert.assertTrue(provider.disconnects > 0);
    }

    @Test
    public void staleProviderCallbacksCannotReviveDisconnectedTransport() throws Exception {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        RecordingCallback callback = new RecordingCallback();
        transport.connect("AA:BB:CC:DD:EE:FF", callback);
        TransportCallback oldCallback = provider.callback;
        transport.disconnect();
        Assert.assertEquals(1, callback.disconnected);

        provider.connected = true;
        oldCallback.onConnected();
        oldCallback.onMessageReceived(new NetworkMessage(MessageType.CHAT, "{}"));
        Assert.assertFalse(transport.isConnected());
        Assert.assertEquals(0, callback.connected);
        Assert.assertEquals(0, callback.messages);
    }

    @Test
    public void providerErrorClosesFacadeAndNotifiesOnlyOnce() throws Exception {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        RecordingCallback callback = new RecordingCallback();
        transport.connect("AA:BB:CC:DD:EE:FF", callback);
        provider.completeConnection();

        provider.callback.onError(new IllegalStateException("socket lost"));

        Assert.assertFalse(transport.isConnected());
        Assert.assertEquals(1, callback.errors);
        Assert.assertTrue(provider.disconnects > 0);
        provider.callback.onError(new IllegalStateException("late failure"));
        Assert.assertEquals(1, callback.errors);
    }

    @Test
    public void startupExceptionRollsBackAndAllowsRetry() throws Exception {
        FakeProvider provider = new FakeProvider();
        provider.failStart = true;
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        try {
            transport.connect(BluetoothTransport.SERVER_ENDPOINT, callback());
            Assert.fail("Start failure must be returned to caller");
        } catch (IllegalStateException expected) {
            Assert.assertEquals("bind failed", expected.getMessage());
        }
        Assert.assertFalse(transport.isConnected());
        Assert.assertTrue(provider.disconnects > 0);

        provider.failStart = false;
        transport.connect(BluetoothTransport.SERVER_ENDPOINT, callback());
        Assert.assertEquals(2, provider.serverStarts);
    }

    @Test
    public void staleSendFailureCannotTearDownNewerConnection() throws Exception {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        RecordingCallback firstCallback = new RecordingCallback();
        transport.connect("AA:BB:CC:DD:EE:FF", firstCallback);
        provider.completeConnection();

        provider.blockNextSend = true;
        provider.writeStarted = new CountDownLatch(1);
        provider.releaseWrite = new CountDownLatch(1);
        Thread staleSender = new Thread(() -> transport.send(
                new NetworkMessage(MessageType.CHAT, "{\"text\":\"old connection\"}")));
        staleSender.start();
        Assert.assertTrue(provider.writeStarted.await(2, TimeUnit.SECONDS));

        transport.disconnect();
        RecordingCallback secondCallback = new RecordingCallback();
        transport.connect(BluetoothTransport.SERVER_ENDPOINT, secondCallback);
        provider.completeConnection();
        provider.releaseWrite.countDown();
        staleSender.join(2000L);

        Assert.assertFalse("The stale send must finish", staleSender.isAlive());
        Assert.assertTrue("A stale write failure must not close the replacement socket", transport.isConnected());
        Assert.assertEquals(1, secondCallback.connected);
        Assert.assertEquals(0, secondCallback.errors);
    }
    @Test
    public void disconnectBeforeConnectIsIdempotent() {
        FakeProvider provider = new FakeProvider();
        BluetoothTransport.setNativeProvider(provider);
        BluetoothTransport transport = new BluetoothTransport();
        transport.disconnect();
        transport.disconnect();
        Assert.assertFalse(transport.isConnected());
        Assert.assertEquals(0, provider.disconnects);
    }

    private static TransportCallback callback() {
        return new RecordingCallback();
    }

    private static final class RecordingCallback implements TransportCallback {
        int connected;
        int disconnected;
        int messages;
        int errors;
        Throwable lastError;
        @Override public void onConnected() { connected++; }
        @Override public void onDisconnected(String reason) { disconnected++; }
        @Override public void onMessageReceived(NetworkMessage message) { messages++; }
        @Override public void onError(Throwable error) { errors++; lastError = error; }
    }

    private static final class FakeProvider implements BluetoothTransport.NativeBluetoothProvider {
        TransportCallback callback;
        boolean connected;
        boolean failStart;
        boolean blockNextSend;
        CountDownLatch writeStarted;
        CountDownLatch releaseWrite;
        int serverStarts;
        int deviceConnects;
        int disconnects;
        int sentFrames;
        UUID serverUuid;
        UUID deviceUuid;
        String deviceAddress;
        String lastFrame;

        @Override public void startServer(UUID serviceUuid, TransportCallback callback) {
            serverStarts++;
            serverUuid = serviceUuid;
            this.callback = callback;
            if (failStart) throw new IllegalStateException("bind failed");
        }
        @Override public void connectDevice(String address, UUID serviceUuid, TransportCallback callback) {
            deviceConnects++;
            deviceAddress = address;
            deviceUuid = serviceUuid;
            this.callback = callback;
        }
        @Override public void sendData(byte[] data) throws Exception {
            if (blockNextSend) {
                blockNextSend = false;
                writeStarted.countDown();
                if (!releaseWrite.await(2, TimeUnit.SECONDS)) throw new IOException("test write timeout");
                throw new IOException("stale send failure");
            }
            sentFrames++;
            lastFrame = new String(data, "UTF-8");
        }
        @Override public void disconnect() { disconnects++; connected = false; }
        @Override public boolean isConnected() { return connected; }
        void completeConnection() {
            connected = true;
            callback.onConnected();
        }
    }
}
