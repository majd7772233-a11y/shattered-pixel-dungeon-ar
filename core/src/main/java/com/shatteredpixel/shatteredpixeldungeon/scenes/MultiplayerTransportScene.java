package com.shatteredpixel.shatteredpixeldungeon.scenes;

import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.ui.Icons;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.watabou.noosa.Camera;

public class MultiplayerTransportScene extends PixelScene {

    @Override
    public void create() {
        super.create();

        int w = Camera.main.width;
        int h = Camera.main.height;

        StyledButton btnInternet = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("ui.multiplayer", "internet_mode")) {
            @Override
            protected void onClick() {
                MultiplayerSetupScene.selectedTransportType = "INTERNET";
                ShatteredPixelDungeon.switchScene(MultiplayerSetupScene.class);
            }
        };
        btnInternet.icon(Icons.get(Icons.ENTER));
        btnInternet.setRect((w - 160) / 2f, h * 0.3f, 160, 24);
        add(btnInternet);

        StyledButton btnLAN = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("ui.multiplayer", "lan_mode")) {
            @Override
            protected void onClick() {
                MultiplayerSetupScene.selectedTransportType = "LAN";
                ShatteredPixelDungeon.switchScene(MultiplayerSetupScene.class);
            }
        };
        btnLAN.icon(Icons.get(Icons.RESUME));
        btnLAN.setRect((w - 160) / 2f, h * 0.45f, 160, 24);
        add(btnLAN);

        StyledButton btnBluetooth = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("ui.multiplayer", "bluetooth_mode")) {
            @Override
            protected void onClick() {
                MultiplayerSetupScene.selectedTransportType = "BLUETOOTH";
                ShatteredPixelDungeon.switchScene(MultiplayerSetupScene.class);
            }
        };
        btnBluetooth.icon(Icons.get(Icons.PREFS));
        btnBluetooth.setRect((w - 160) / 2f, h * 0.6f, 160, 24);
        add(btnBluetooth);
    }
}
