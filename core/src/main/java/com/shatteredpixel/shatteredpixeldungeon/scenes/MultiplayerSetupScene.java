package com.shatteredpixel.shatteredpixeldungeon.scenes;

import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.BluetoothTransport;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.BluetoothDeviceAccess;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.BluetoothDeviceAccessRegistry;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.BluetoothDeviceDiscoveryController;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.BluetoothDeviceInfo;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.BluetoothHostPreparationController;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.InternetTransport;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.LANTransport;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerErrorMessages;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.NetworkTransport;
import com.shatteredpixel.shatteredpixeldungeon.ui.Icons;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndError;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndTextInput;
import com.watabou.noosa.BitmapText;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;

import java.net.SocketException;
import java.util.Locale;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

public class MultiplayerSetupScene extends PixelScene {

    private static final Pattern IPV4_PATTERN = Pattern.compile("^([01]?\\d\\d?|2[0-4]\\d|25[0-5])\\.([01]?\\d\\d?|2[0-4]\\d|25[0-5])\\.([01]?\\d\\d?|2[0-4]\\d|25[0-5])\\.([01]?\\d\\d?|2[0-4]\\d|25[0-5])$");

    public static String selectedTransportType = "INTERNET";
    public static String roomName = generateRoomCode();
    public static String targetIp = "192.168.1.100";
    public static int targetPort = LANTransport.DEFAULT_TCP_PORT;
    public static String targetBluetoothAddress = "";
    public static String targetBluetoothName = "";
    public static boolean isHost = true;
    public static int maxPlayers = 2;

    private BitmapText hostInfoText;
    private StyledButton btnEditIp;
    private StyledButton btnRoomMode;
    private StyledButton btnRoomCode;
    private StyledButton btnBluetoothScan;
    private StyledButton btnBluetoothDevices;
    private StyledButton btnStart;
    private BitmapText bluetoothSelectionText;
    private BluetoothDeviceDiscoveryController bluetoothDiscovery;
    private volatile long bluetoothUiGeneration;
    private volatile LANTransport.LANDiscoverySession lanDiscoverySession;
    private volatile long lanDiscoveryGeneration;
    private volatile boolean sceneDestroyed;
    private boolean lanHostSelected;

    public static boolean isValidIPv4(String ip) {
        if (ip == null) return false;
        return IPV4_PATTERN.matcher(ip.trim()).matches();
    }

    @Override
    public void create() {
        super.create();
        sceneDestroyed = false;
        lanHostSelected = false;
        bluetoothUiGeneration++;
        if ("BLUETOOTH".equalsIgnoreCase(selectedTransportType)) { targetBluetoothAddress = ""; targetBluetoothName = ""; }

        int w = Camera.main.width;
        int h = Camera.main.height;

        BitmapText title = new BitmapText(Messages.get("multiplayer_title"), pixelFont);
        title.measure();
        title.x = (w - title.width()) / 2f;
        title.y = h * 0.12f;
        add(title);

        if ("INTERNET".equalsIgnoreCase(selectedTransportType)) {
            btnRoomMode = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get(isHost ? "host_room" : "join_room")) {
                @Override
                protected void onClick() {
                    isHost = !isHost;
                    if (isHost) roomName = generateRoomCode();
                    btnRoomMode.text(Messages.get(isHost ? "host_room" : "join_room"));
                    refreshRoomCodeLabel();
                }
            };
            btnRoomMode.setRect((w - 160) / 2f, h * 0.38f, 160, 22);
            add(btnRoomMode);

            btnRoomCode = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("room_name") + " " + roomName) {
                @Override
                protected void onClick() {
                    Game.runOnRenderThread(() -> GameScene.show(new WndTextInput(
                            Messages.get("room_name"), Messages.get("room_name"), roomName, 32, false,
                            Messages.get("start_game"), Messages.get("cancel")) {
                        @Override
                        public void onSelect(boolean positive, String text) {
                            if (!positive || text == null) return;
                            String candidate = text.trim();
                            if (candidate.matches("[A-Za-z0-9_-]{3,32}")) {
                                roomName = candidate;
                                refreshRoomCodeLabel();
                            }
                        }
                    }));
                }
            };
            btnRoomCode.setRect((w - 160) / 2f, h * 0.50f, 160, 22);
            add(btnRoomCode);
        }
        if ("LAN".equalsIgnoreCase(selectedTransportType)) {
            hostInfoText = new BitmapText(Messages.get("lan_searching"), pixelFont);
            hostInfoText.measure();
            hostInfoText.x = (w - hostInfoText.width()) / 2f;
            hostInfoText.y = h * 0.28f;
            add(hostInfoText);

            btnEditIp = new StyledButton(Chrome.Type.GREY_BUTTON_TR, "IP: " + targetIp) {
                @Override
                protected void onClick() {
                    Game.runOnRenderThread(() -> {
                        GameScene.show(new WndTextInput("Enter Host IP", "LAN Host IP Address", targetIp, 15, false, "Connect", "Cancel") {
                            @Override
                            public void onSelect(boolean positive, String text) {
                                if (positive && isValidIPv4(text)) {
                                    targetIp = text.trim();
                                    targetPort = LANTransport.DEFAULT_TCP_PORT;
                                    lanHostSelected = true;
                                    cancelLanDiscovery();
                                    isHost = false;
                                    btnEditIp.text("IP: " + targetIp);
                                }
                            }
                        });
                    });
                }
            };
            btnEditIp.setRect((w - 140) / 2f, h * 0.45f, 140, 20);
            add(btnEditIp);

            try {
                final long generation = ++lanDiscoveryGeneration;
                lanDiscoverySession = LANTransport.discoverHosts(new LANTransport.LANDiscoveryCallback() {
                    @Override
                    public void onHostDiscovered(String hostName, String hostIp, int port) {
                        Game.runOnRenderThread(() -> {
                            if (sceneDestroyed || generation != lanDiscoveryGeneration || lanHostSelected) return;
                            if (!isValidIPv4(hostIp) || port < 1 || port > 65535) return;

                            lanHostSelected = true;
                            cancelLanDiscovery();
                            targetIp = hostIp;
                            targetPort = port;
                            isHost = false;
                            if (hostInfoText != null) {
                                hostInfoText.text(Messages.get("host_found") + ": " + hostName
                                        + " (" + hostIp + ":" + port + ")");
                                hostInfoText.measure();
                                hostInfoText.x = (Camera.main.width - hostInfoText.width()) / 2f;
                            }
                            if (btnEditIp != null) btnEditIp.text("IP: " + targetIp);
                        });
                    }

                    @Override
                    public void onDiscoveryFinished(boolean cancelled, int discoveredHostCount) {
                        if (cancelled || discoveredHostCount > 0) return;
                        Game.runOnRenderThread(() -> {
                            if (sceneDestroyed || generation != lanDiscoveryGeneration || lanHostSelected
                                    || hostInfoText == null) return;
                            hostInfoText.text(Messages.get("lan_no_hosts_found"));
                            hostInfoText.measure();
                            hostInfoText.x = (Camera.main.width - hostInfoText.width()) / 2f;
                        });
                    }
                });
            } catch (SocketException discoveryFailure) {
                hostInfoText.text(Messages.get("lan_discovery_unavailable"));
                hostInfoText.measure();
                hostInfoText.x = (w - hostInfoText.width()) / 2f;
            }
        } else if ("BLUETOOTH".equalsIgnoreCase(selectedTransportType)) {
            maxPlayers = BluetoothTransport.MAX_BLUETOOTH_PLAYERS;
            BitmapText btNote = new BitmapText(Messages.get("bt_limit_error"), pixelFont);
            btNote.measure();
            btNote.x = (w - btNote.width()) / 2f;
            btNote.y = h * 0.22f;
            add(btNote);

            hostInfoText = new BitmapText(Messages.get(isHost ? "bt_host_visible" : "bt_search_devices"), pixelFont);
            hostInfoText.measure();
            hostInfoText.x = (w - hostInfoText.width()) / 2f;
            hostInfoText.y = h * 0.32f;
            add(hostInfoText);

            if (!isHost) {
                btnBluetoothScan = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("bt_search_devices")) {
                    @Override protected void onClick() { toggleBluetoothDiscovery(); }
                };
                btnBluetoothScan.setRect((w - 150) / 2f, h * 0.42f, 150, 22);
                add(btnBluetoothScan);

                btnBluetoothDevices = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("bt_choose_device")) {
                    @Override protected void onClick() { showBluetoothDevicePicker(); }
                };
                btnBluetoothDevices.setRect((w - 150) / 2f, h * 0.51f, 150, 22);
                btnBluetoothDevices.enable(false);
                add(btnBluetoothDevices);

                bluetoothSelectionText = new BitmapText(Messages.get("bt_device_required"), pixelFont);
                bluetoothSelectionText.measure();
                bluetoothSelectionText.x = (w - bluetoothSelectionText.width()) / 2f;
                bluetoothSelectionText.y = h * 0.61f;
                add(bluetoothSelectionText);
            } else {
                BitmapText visibilityHint = new BitmapText(Messages.get("bt_host_visibility_window"), pixelFont);
                visibilityHint.measure();
                visibilityHint.x = (w - visibilityHint.width()) / 2f;
                visibilityHint.y = h * 0.44f;
                add(visibilityHint);
            }
        }
        btnStart = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("start_game")) {
            @Override
            protected void onClick() {
                handleStartButton();
            }
        };
        btnStart.icon(Icons.get(Icons.ENTER));
        btnStart.setRect((w - 140) / 2f, h * 0.72f, 140, 24);
        add(btnStart);
    }

    private static String generateRoomCode() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
    }

    private void refreshRoomCodeLabel() {
        if (btnRoomCode != null) btnRoomCode.text(Messages.get("room_name") + " " + roomName);
    }
    private void showConnectionStartFailure(Throwable failure) {
        add(new WndError(Messages.get(MultiplayerErrorMessages.messageKey(failure == null ? null : failure.getMessage()))));
    }
    private void cancelLanDiscovery() {
        LANTransport.LANDiscoverySession session = lanDiscoverySession;
        lanDiscoverySession = null;
        if (session != null) session.cancel();
    }

    private void handleStartButton() {
        if (!"BLUETOOTH".equalsIgnoreCase(selectedTransportType)) {
            startMultiplayerSession();
            return;
        }
        if (isHost) {
            prepareBluetoothHost();
            return;
        }
        BluetoothDeviceInfo selected = bluetoothDiscovery == null ? null : bluetoothDiscovery.getSelectedDevice();
        if (selected == null) {
            showBluetoothError("BLUETOOTH_DEVICE_REQUIRED");
            return;
        }
        targetBluetoothAddress = selected.getAddress();
        targetBluetoothName = selected.displayName();
        startMultiplayerSession();
    }

    private void prepareBluetoothHost() {
        final BluetoothDeviceAccess access = BluetoothDeviceAccessRegistry.get();
        if (access == null) {
            showBluetoothError("BLUETOOTH_UNAVAILABLE");
            return;
        }
        final long attempt = ++bluetoothUiGeneration;
        if (btnStart != null) btnStart.enable(false);
        updateBluetoothStatus(Messages.get("bt_host_visible"));
        BluetoothHostPreparationController.requestVisibility(access, 300,
                new BluetoothHostPreparationController.ContinueCheck() {
                    @Override public boolean shouldContinue() {
                        return !sceneDestroyed && attempt == bluetoothUiGeneration;
                    }
                }, new BluetoothDeviceAccess.ResultCallback() {
                    @Override public void onResult(final boolean visible, final String errorCode) {
                        Game.runOnRenderThread(() -> {
                            if (sceneDestroyed || attempt != bluetoothUiGeneration) return;
                            if (btnStart != null) btnStart.enable(true);
                            if (!visible) {
                                showBluetoothError(errorCode);
                                return;
                            }
                            updateBluetoothStatus(Messages.get("bt_host_visibility_window"));
                            startMultiplayerSession();
                        });
                    }
                });
    }
    private void toggleBluetoothDiscovery() {
        if (bluetoothDiscovery != null) {
            BluetoothDeviceDiscoveryController.State state = bluetoothDiscovery.getState();
            if (state == BluetoothDeviceDiscoveryController.State.PREPARING
                    || state == BluetoothDeviceDiscoveryController.State.DISCOVERING) {
                bluetoothDiscovery.cancel();
                if (btnBluetoothScan != null) btnBluetoothScan.text(Messages.get("bt_search_devices"));
                return;
            }
        }
        startBluetoothDiscovery();
    }

    private void startBluetoothDiscovery() {
        final BluetoothDeviceAccess access = BluetoothDeviceAccessRegistry.get();
        if (access == null) {
            showBluetoothError("BLUETOOTH_UNAVAILABLE");
            return;
        }
        if (bluetoothDiscovery == null) bluetoothDiscovery = new BluetoothDeviceDiscoveryController(access);
        targetBluetoothAddress = "";
        targetBluetoothName = "";
        if (bluetoothSelectionText != null) {
            bluetoothSelectionText.text(Messages.get("bt_device_required"));
            bluetoothSelectionText.measure();
            bluetoothSelectionText.x = (Camera.main.width - bluetoothSelectionText.width()) / 2f;
        }
        if (btnBluetoothDevices != null) btnBluetoothDevices.enable(false);
        if (btnBluetoothScan != null) btnBluetoothScan.text(Messages.get("bt_stop_search"));
        updateBluetoothStatus(Messages.get("bt_searching"));
        final long attempt = ++bluetoothUiGeneration;
        try {
            bluetoothDiscovery.start(new BluetoothDeviceDiscoveryController.Listener() {
                @Override public void onDevicesChanged(final List<BluetoothDeviceInfo> devices) {
                    Game.runOnRenderThread(() -> {
                        if (sceneDestroyed || attempt != bluetoothUiGeneration) return;
                        if (btnBluetoothDevices != null) btnBluetoothDevices.enable(!devices.isEmpty());
                        updateBluetoothStatus(Messages.get("bt_searching") + " (" + devices.size() + ")");
                    });
                }

                @Override public void onDiscoveryFinished(final boolean cancelled, final String errorCode) {
                    Game.runOnRenderThread(() -> {
                        if (sceneDestroyed || attempt != bluetoothUiGeneration) return;
                        if (btnBluetoothScan != null) btnBluetoothScan.text(Messages.get("bt_search_devices"));
                        if (cancelled) {
                            updateBluetoothStatus(Messages.get("bt_search_devices"));
                        } else if (errorCode != null) {
                            updateBluetoothStatus(Messages.get(MultiplayerErrorMessages.messageKey(errorCode)));
                        } else if (bluetoothDiscovery.getDevices().isEmpty()) {
                            updateBluetoothStatus(Messages.get("bt_no_devices"));
                        } else {
                            updateBluetoothStatus(Messages.get("bt_devices_found") + " " + bluetoothDiscovery.getDevices().size());
                        }
                        if (btnBluetoothDevices != null) {
                            btnBluetoothDevices.enable(!bluetoothDiscovery.getDevices().isEmpty());
                        }
                    });
                }

                @Override public void onSelectedDeviceLost(final String address) {
                    Game.runOnRenderThread(() -> {
                        if (sceneDestroyed || attempt != bluetoothUiGeneration) return;
                        targetBluetoothAddress = "";
                        targetBluetoothName = "";
                        if (bluetoothSelectionText != null) {
                            bluetoothSelectionText.text(Messages.get("bt_device_required"));
                            bluetoothSelectionText.measure();
                            bluetoothSelectionText.x = (Camera.main.width - bluetoothSelectionText.width()) / 2f;
                        }
                        showBluetoothError("BLUETOOTH_DEVICE_NOT_FOUND");
                    });
                }
            });
        } catch (RuntimeException failure) {
            if (btnBluetoothScan != null) btnBluetoothScan.text(Messages.get("bt_search_devices"));
            showBluetoothError(failure.getMessage());
        }
    }

    private void showBluetoothDevicePicker() {
        showBluetoothDevicePicker(0);
    }

    private void showBluetoothDevicePicker(final int requestedPage) {
        if (bluetoothDiscovery == null) {
            showBluetoothError("BLUETOOTH_DEVICE_REQUIRED");
            return;
        }
        final List<BluetoothDeviceInfo> snapshot = bluetoothDiscovery.getDevices();
        if (snapshot.isEmpty()) {
            ShatteredPixelDungeon.scene().addToFront(new WndError(Messages.get("bt_no_devices")));
            return;
        }

        final int pageSize = 6;
        final int pageCount = (snapshot.size() + pageSize - 1) / pageSize;
        final int page = Math.max(0, Math.min(pageCount - 1, requestedPage));
        final int firstDevice = page * pageSize;
        final int deviceCount = Math.min(pageSize, snapshot.size() - firstDevice);
        final boolean hasPrevious = page > 0;
        final boolean hasNext = page + 1 < pageCount;
        final int previousOption = hasPrevious ? 0 : -1;
        final int firstDeviceOption = hasPrevious ? 1 : 0;
        final int nextOption = hasNext ? firstDeviceOption + deviceCount : -1;
        final int cancelOption = firstDeviceOption + deviceCount + (hasNext ? 1 : 0);
        String[] options = new String[cancelOption + 1];

        if (hasPrevious) options[previousOption] = Messages.get("bt_previous_devices");
        for (int i = 0; i < deviceCount; i++) {
            BluetoothDeviceInfo device = snapshot.get(firstDevice + i);
            String name = device.displayName();
            if (name.length() > 16) name = name.substring(0, 13) + "...";
            String suffix = device.getAddress().substring(device.getAddress().length() - 5);
            options[firstDeviceOption + i] = name
                    + (device.isPaired() ? " " + Messages.get("bt_paired") : "")
                    + " [" + suffix + "]";
        }
        if (hasNext) options[nextOption] = Messages.get("bt_more_devices");
        options[cancelOption] = Messages.get("cancel");

        ShatteredPixelDungeon.scene().addToFront(new WndOptions(Messages.get("bt_choose_device"),
                Messages.get("bt_pairing_system_prompt"), options) {
            @Override protected void onSelect(int index) {
                if (hasPrevious && index == previousOption) {
                    showBluetoothDevicePicker(page - 1);
                    return;
                }
                if (hasNext && index == nextOption) {
                    showBluetoothDevicePicker(page + 1);
                    return;
                }
                int selectedIndex = index - firstDeviceOption + firstDevice;
                if (index < firstDeviceOption || index >= firstDeviceOption + deviceCount
                        || selectedIndex < 0 || selectedIndex >= snapshot.size()
                        || bluetoothDiscovery == null) return;
                try {
                    BluetoothDeviceInfo selected = bluetoothDiscovery.select(snapshot.get(selectedIndex).getAddress());
                    targetBluetoothAddress = selected.getAddress();
                    targetBluetoothName = selected.displayName();
                    if (bluetoothDiscovery.getState() == BluetoothDeviceDiscoveryController.State.DISCOVERING) {
                        bluetoothDiscovery.cancel();
                    }
                    if (bluetoothSelectionText != null) {
                        bluetoothSelectionText.text(Messages.get("bt_selected") + " " + targetBluetoothName);
                        bluetoothSelectionText.measure();
                        bluetoothSelectionText.x = (Camera.main.width - bluetoothSelectionText.width()) / 2f;
                    }
                } catch (IllegalStateException disappeared) {
                    targetBluetoothAddress = "";
                    targetBluetoothName = "";
                    showBluetoothError(disappeared.getMessage());
                }
            }
        });
    }
    private void updateBluetoothStatus(String message) {
        if (hostInfoText == null || message == null) return;
        hostInfoText.text(message);
        hostInfoText.measure();
        hostInfoText.x = (Camera.main.width - hostInfoText.width()) / 2f;
    }

    private void showBluetoothError(String errorCode) {
        String key = MultiplayerErrorMessages.messageKey(errorCode);
        ShatteredPixelDungeon.scene().addToFront(new WndError(Messages.get(key)));
    }
    private void startMultiplayerSession() {
        NetworkTransport transport = null;
        try {
            String endpoint;
            String playerId = UUID.randomUUID().toString();

            if ("LAN".equalsIgnoreCase(selectedTransportType)) {
                LANTransport lan = new LANTransport();
                transport = lan;
                if (isHost) {
                    lan.startServer(LANTransport.DEFAULT_TCP_PORT, "HostDevice", playerId, null);
                    endpoint = LANTransport.LOCAL_HOST_ENDPOINT;
                } else {
                    if (!isValidIPv4(targetIp) || targetPort < 1 || targetPort > 65535) {
                        throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
                    }
                    endpoint = targetIp + ":" + targetPort;
                }
            } else if ("BLUETOOTH".equalsIgnoreCase(selectedTransportType)) {
                BluetoothTransport bt = new BluetoothTransport();
                transport = bt;
                if (isHost) {
                    endpoint = BluetoothTransport.SERVER_ENDPOINT;
                } else {
                    if (targetBluetoothAddress == null || targetBluetoothAddress.trim().isEmpty()) {
                        throw new IllegalStateException("BLUETOOTH_DEVICE_REQUIRED");
                    }
                    endpoint = targetBluetoothAddress;
                }
            } else {
                transport = new InternetTransport();
                endpoint = InternetTransport.buildRoomEndpoint(roomName);
            }

            MultiplayerManager.getInstance().startSession(endpoint, playerId, transport, isHost);
        } catch (Exception startupFailure) {
            if (transport instanceof LANTransport || transport instanceof BluetoothTransport) {
                try { transport.disconnect(); } catch (RuntimeException ignored) { }
            }
            showConnectionStartFailure(startupFailure);
            return;
        }

        ShatteredPixelDungeon.switchNoFade(HeroSelectScene.class);
    }

    @Override
    public void destroy() {
        sceneDestroyed = true;
        bluetoothUiGeneration++;
        if (bluetoothDiscovery != null) { bluetoothDiscovery.dispose(); bluetoothDiscovery = null; }
        lanDiscoveryGeneration++;
        cancelLanDiscovery();
        super.destroy();
    }
}
