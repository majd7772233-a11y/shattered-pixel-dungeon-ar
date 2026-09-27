package com.shatteredpixel.shatteredpixeldungeon.scenes;

import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.BluetoothTransport;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.InternetTransport;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.LANTransport;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.NetworkTransport;
import com.shatteredpixel.shatteredpixeldungeon.ui.Icons;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.watabou.noosa.BitmapText;
import com.watabou.noosa.Camera;

import java.util.UUID;

public class MultiplayerSetupScene extends PixelScene {

    public static String selectedTransportType = "INTERNET";
    public static String roomName = "ROOM123";
    public static String targetIp = "192.168.1.100";
    public static boolean isHost = true;
    public static int maxPlayers = 2;

    private BitmapText hostInfoText;

    @Override
    public void create() {
        super.create();

        int w = Camera.main.width;
        int h = Camera.main.height;

        BitmapText title = new BitmapText(Messages.get("ui.multiplayer", "multiplayer_title"), pixelFont);
        title.measure();
        title.x = (w - title.width()) / 2f;
        title.y = h * 0.12f;
        add(title);

        if ("LAN".equalsIgnoreCase(selectedTransportType)) {
            hostInfoText = new BitmapText(Messages.get("ui.multiplayer", "lan_searching"), pixelFont);
            hostInfoText.measure();
            hostInfoText.x = (w - hostInfoText.width()) / 2f;
            hostInfoText.y = h * 0.3f;
            add(hostInfoText);

            LANTransport.discoverHosts((hostName, hostIp, port) -> {
                targetIp = hostIp;
                isHost = false;
                if (hostInfoText != null) {
                    hostInfoText.text(Messages.get("ui.multiplayer", "host_found") + ": " + hostName + " (" + hostIp + ")");
                    hostInfoText.measure();
                    hostInfoText.x = (w - hostInfoText.width()) / 2f;
                }
            });
        } else if ("BLUETOOTH".equalsIgnoreCase(selectedTransportType)) {
            maxPlayers = 2;
            BitmapText btNote = new BitmapText(Messages.get("ui.multiplayer", "bt_limit_error"), pixelFont);
            btNote.measure();
            btNote.x = (w - btNote.width()) / 2f;
            btNote.y = h * 0.35f;
            add(btNote);
        }

        StyledButton btnStart = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("ui.multiplayer", "start_game")) {
            @Override
            protected void onClick() {
                startMultiplayerSession();
            }
        };
        btnStart.icon(Icons.get(Icons.ENTER));
        btnStart.setRect((w - 140) / 2f, h * 0.7f, 140, 24);
        add(btnStart);
    }

    private void startMultiplayerSession() {
        NetworkTransport transport;
        String endpoint;

        if ("LAN".equalsIgnoreCase(selectedTransportType)) {
            LANTransport lan = new LANTransport();
            if (isHost) {
                try {
                    lan.startServer(LANTransport.DEFAULT_TCP_PORT, "HostDevice", null);
                } catch (Exception ignored) {}
                endpoint = "127.0.0.1:" + LANTransport.DEFAULT_TCP_PORT;
            } else {
                endpoint = targetIp + ":" + LANTransport.DEFAULT_TCP_PORT;
            }
            transport = lan;
        } else if ("BLUETOOTH".equalsIgnoreCase(selectedTransportType)) {
            BluetoothTransport bt = new BluetoothTransport();
            if (isHost) {
                try {
                    bt.startBluetoothServer(null);
                } catch (Exception ignored) {}
                endpoint = "SERVER";
            } else {
                endpoint = targetIp;
            }
            transport = bt;
        } else {
            transport = new InternetTransport();
            endpoint = "https://spd-multiplayer.majd7772233.workers.dev/room/" + roomName + "/websocket";
        }

        String playerId = UUID.randomUUID().toString();
        MultiplayerManager.getInstance().startSession(endpoint, playerId, transport);

        ShatteredPixelDungeon.switchNoFade(HeroSelectScene.class);
    }
}
