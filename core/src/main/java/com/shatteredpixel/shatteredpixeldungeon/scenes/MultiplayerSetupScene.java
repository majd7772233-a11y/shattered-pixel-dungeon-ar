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
    public static int maxPlayers = 2;

    @Override
    public void create() {
        super.create();

        int w = Camera.main.width;
        int h = Camera.main.height;

        BitmapText title = new BitmapText(Messages.get("ui.multiplayer", "multiplayer_title"), pixelFont);
        title.measure();
        title.x = (w - title.width()) / 2f;
        title.y = h * 0.15f;
        add(title);

        if ("BLUETOOTH".equalsIgnoreCase(selectedTransportType)) {
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
            transport = new LANTransport();
            endpoint = "127.0.0.1:8080";
        } else if ("BLUETOOTH".equalsIgnoreCase(selectedTransportType)) {
            transport = new BluetoothTransport();
            endpoint = "127.0.0.1:8990";
        } else {
            transport = new InternetTransport();
            endpoint = "http://spd-multiplayer.majd7772233.workers.dev/room/" + roomName + "/websocket";
        }

        String playerId = UUID.randomUUID().toString();
        MultiplayerManager.getInstance().startSession(endpoint, playerId, transport);

        ShatteredPixelDungeon.switchNoFade(HeroSelectScene.class);
    }
}
