package com.shatteredpixel.shatteredpixeldungeon.scenes;

import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.BluetoothTransport;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.InternetTransport;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.LANTransport;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerErrorMessages;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.NetworkTransport;
import com.shatteredpixel.shatteredpixeldungeon.ui.Icons;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndError;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndTextInput;
import com.watabou.noosa.BitmapText;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;

import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

public class MultiplayerSetupScene extends PixelScene {

    private static final Pattern IPV4_PATTERN = Pattern.compile("^([01]?\\d\\d?|2[0-4]\\d|25[0-5])\\.([01]?\\d\\d?|2[0-4]\\d|25[0-5])\\.([01]?\\d\\d?|2[0-4]\\d|25[0-5])\\.([01]?\\d\\d?|2[0-4]\\d|25[0-5])$");

    public static String selectedTransportType = "INTERNET";
    public static String roomName = generateRoomCode();
    public static String targetIp = "192.168.1.100";
    public static boolean isHost = true;
    public static int maxPlayers = 2;

    private BitmapText hostInfoText;
    private StyledButton btnEditIp;
    private StyledButton btnRoomMode;
    private StyledButton btnRoomCode;

    public static boolean isValidIPv4(String ip) {
        if (ip == null) return false;
        return IPV4_PATTERN.matcher(ip.trim()).matches();
    }

    @Override
    public void create() {
        super.create();

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

            LANTransport.discoverHosts((hostName, hostIp, port) -> {
                if (isValidIPv4(hostIp)) {
                    targetIp = hostIp;
                    isHost = false;
                    if (hostInfoText != null) {
                        hostInfoText.text(Messages.get("host_found") + ": " + hostName + " (" + hostIp + ")");
                        hostInfoText.measure();
                        hostInfoText.x = (w - hostInfoText.width()) / 2f;
                    }
                    if (btnEditIp != null) {
                        btnEditIp.text("IP: " + targetIp);
                    }
                }
            });
        } else if ("BLUETOOTH".equalsIgnoreCase(selectedTransportType)) {
            maxPlayers = 2;
            BitmapText btNote = new BitmapText(Messages.get("bt_limit_error"), pixelFont);
            btNote.measure();
            btNote.x = (w - btNote.width()) / 2f;
            btNote.y = h * 0.35f;
            add(btNote);
        }

        StyledButton btnStart = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("start_game")) {
            @Override
            protected void onClick() {
                startMultiplayerSession();
            }
        };
        btnStart.icon(Icons.get(Icons.ENTER));
        btnStart.setRect((w - 140) / 2f, h * 0.7f, 140, 24);
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
                    if (!isValidIPv4(targetIp)) throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
                    endpoint = targetIp + ":" + LANTransport.DEFAULT_TCP_PORT;
                }
            } else if ("BLUETOOTH".equalsIgnoreCase(selectedTransportType)) {
                BluetoothTransport bt = new BluetoothTransport();
                transport = bt;
                if (isHost) {
                    try {
                        bt.startBluetoothServer(null);
                    } catch (Exception ignored) {}
                    endpoint = "SERVER";
                } else {
                    endpoint = targetIp;
                }
            } else {
                transport = new InternetTransport();
                endpoint = InternetTransport.buildRoomEndpoint(roomName);
            }

            MultiplayerManager.getInstance().startSession(endpoint, playerId, transport, isHost);
        } catch (Exception startupFailure) {
            if (transport instanceof LANTransport) {
                try { transport.disconnect(); } catch (RuntimeException ignored) { }
            }
            showConnectionStartFailure(startupFailure);
            return;
        }

        ShatteredPixelDungeon.switchNoFade(HeroSelectScene.class);
    }
}
